// API Route for Managing Membership Applications
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { addMember, getNextRunningMemberId } from '@/lib/google-sheets';
import { Member } from '@/types/member';

// GET - List all membership applications
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending, approved, rejected, all

    const db = adminDb();
    // Fetch all applications without orderBy to avoid composite index requirement
    const snapshot = await db.collection('membershipApplications').get();

    interface SearchLog {
      searchQuery: string;
      searchType: string;
      searchedAt: Date | string;
      attemptNumber: number;
    }

    interface ApplicationDoc {
      id: string;
      status?: string;
      createdAt?: Date | string;
      updatedAt?: Date | string;
      lineUserId?: string;
      isSearchLocked?: boolean;
      searchCount?: number;
      lockedAt?: Date | string;
      lockedReason?: string;
      searchLogs?: SearchLog[];
      [key: string]: unknown;
    }

    // Get all LINE user IDs from applications
    const lineUserIds = snapshot.docs
      .map(doc => doc.data().lineUserId)
      .filter((id): id is string => !!id);

    // Batch fetch user data for search lock status
    const usersMap = new Map<string, { isSearchLocked?: boolean; searchCount?: number; lockedAt?: Date; lockedReason?: string }>();
    if (lineUserIds.length > 0) {
      // Firestore 'in' query supports up to 30 items, so we need to batch
      const batches = [];
      for (let i = 0; i < lineUserIds.length; i += 30) {
        batches.push(lineUserIds.slice(i, i + 30));
      }

      for (const batch of batches) {
        const usersSnapshot = await db.collection('users')
          .where('__name__', 'in', batch)
          .get();

        usersSnapshot.docs.forEach(doc => {
          const data = doc.data();
          usersMap.set(doc.id, {
            isSearchLocked: data.isSearchLocked || false,
            searchCount: data.searchCount || 0,
            lockedAt: data.lockedAt?.toDate?.() || data.lockedAt,
            lockedReason: data.lockedReason,
          });
        });
      }
    }

    // Fetch search logs for locked users
    const searchLogsMap = new Map<string, SearchLog[]>();
    const lockedUserIds = Array.from(usersMap.entries())
      .filter(([, userData]) => userData.isSearchLocked)
      .map(([userId]) => userId);

    if (lockedUserIds.length > 0) {
      for (const userId of lockedUserIds) {
        // Avoid using where + orderBy together to prevent composite index requirement
        const logsSnapshot = await db.collection('searchLogs')
          .where('userId', '==', userId)
          .limit(50)
          .get();

        let logs = logsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            searchQuery: data.searchQuery,
            searchType: data.searchType,
            searchedAt: data.searchedAt?.toDate?.() || data.searchedAt,
            attemptNumber: data.attemptNumber,
          };
        });

        // Sort by searchedAt descending in JavaScript
        logs.sort((a, b) => {
          const dateA = a.searchedAt instanceof Date ? a.searchedAt.getTime() : new Date(String(a.searchedAt) || '0').getTime();
          const dateB = b.searchedAt instanceof Date ? b.searchedAt.getTime() : new Date(String(b.searchedAt) || '0').getTime();
          return dateB - dateA;
        });

        // Limit to 10
        logs = logs.slice(0, 10);

        if (logs.length > 0) {
          searchLogsMap.set(userId, logs);
        }
      }
    }

    let applications: ApplicationDoc[] = snapshot.docs.map(doc => {
      const data = doc.data();
      const lineUserId = data.lineUserId;
      const userData = lineUserId ? usersMap.get(lineUserId) : null;
      const searchLogs = lineUserId ? searchLogsMap.get(lineUserId) : undefined;

      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        // Add search lock info
        isSearchLocked: userData?.isSearchLocked || false,
        searchCount: userData?.searchCount || 0,
        lockedAt: userData?.lockedAt,
        lockedReason: userData?.lockedReason,
        searchLogs: searchLogs,
      };
    });

    // Filter by status in memory
    if (status && status !== 'all') {
      applications = applications.filter(app => app.status === status);
    }

    // Sort by createdAt descending in memory
    applications.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt as string || 0);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt as string || 0);
      return dateB.getTime() - dateA.getTime();
    });

    // Limit to 100
    applications = applications.slice(0, 100);

    return NextResponse.json({ applications });
  } catch (error) {
    console.error('Error fetching applications:', error);
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
  }
}

// PUT - Update application status (approve/reject)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { applicationId, status, documentStatus, rejectionReason, notes } = body;

    if (!applicationId) {
      return NextResponse.json({ error: 'Application ID is required' }, { status: 400 });
    }

    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('membershipApplications').doc(applicationId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: session.user.id,
      updatedByName: session.user.name || '',
    };

    if (status) {
      updateData.status = status;
      if (status === 'approved') {
        updateData.approvedAt = new Date();
        updateData.approvedBy = session.user.id;
        updateData.approvedByName = session.user.name || '';

        // Save to Google Sheet when approved
        const applicationData = doc.data();
        try {
          // Generate new member ID (running number)
          const memberId = await getNextRunningMemberId();

          // Map application data to Member format
          // Note: companyNameTH in application form is actually fullNameTH (ชื่อ-นามสกุล)
          const newMember: Partial<Member> = {
            memberId,
            companyNameEN: applicationData?.companyNameEN || '',
            companyNameTH: '', // Will be updated by admin later (company name Thai)
            fullNameTH: applicationData?.companyNameTH || '', // This is actually fullName from form
            nickname: applicationData?.nickname || '',
            lineId: applicationData?.lineId || '',
            lineName: applicationData?.lineName || '',
            phone: applicationData?.phone || '',
            mobile: applicationData?.mobile || '',
            email: applicationData?.email || '',
            website: applicationData?.website || '',
            licenseNumber: applicationData?.licenseNumber || '',
            licenseExpiry: '', // License expiry date - will be updated later by admin
            positionCompany: applicationData?.positionCompany || '',
            positionClub: '', // New member, no club position yet
            status: 'รอตรวจสอบ', // Pending verification via skycrbber
            sponsor1: applicationData?.sponsor1 || '',
            sponsor2: applicationData?.sponsor2 || '',
            lineGroupStatus: 'รอนำเข้ากลุ่ม',
            lineGroupJoinDate: '',
            lineGroupJoinBy: '',
            lineGroupLeaveDate: '',
            lineGroupLeaveBy: '',
            lineUserId: applicationData?.lineUserId || '',
            lineDisplayName: applicationData?.lineDisplayName || '',
            lastUpdated: new Date().toISOString(),
            updatedBy: session.user.name || session.user.id,
          };

          const savedMemberId = await addMember(newMember);
          if (savedMemberId) {
            updateData.memberId = savedMemberId;
            console.log(`Application ${applicationId} approved - Member ${savedMemberId} created in Google Sheet`);

            // Create user in Firestore
            try {
              const userRef = db.collection('users').doc(applicationData?.lineUserId || applicationId);
              await userRef.set({
                memberId: savedMemberId,
                name: applicationData?.lineDisplayName || applicationData?.nickname || '',
                email: applicationData?.email || '',
                image: applicationData?.lineProfilePicture || '',
                lineUserId: applicationData?.lineUserId || '',
                lineDisplayName: applicationData?.lineDisplayName || '',
                lineProfilePicture: applicationData?.lineProfilePicture || '',
                role: 'member',
                permissions: ['members:self', 'events:view'],
                status: 'approved',
                verifiedAt: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date(),
              }, { merge: true });
              console.log(`User created/updated in Firestore for member ${savedMemberId}`);
            } catch (firestoreError) {
              console.error('Error creating user in Firestore:', firestoreError);
              // Don't fail the approval, just log the error
            }
          } else {
            console.error(`Failed to save member to Google Sheet for application ${applicationId}`);
          }
        } catch (sheetError) {
          console.error('Error saving to Google Sheet:', sheetError);
          // Don't fail the approval, but log the error
        }
      } else if (status === 'rejected') {
        updateData.rejectedAt = new Date();
        updateData.rejectedBy = session.user.id;
        updateData.rejectedByName = session.user.name || '';
        if (rejectionReason) {
          updateData.rejectionReason = rejectionReason;
        }
      }
    }

    if (documentStatus) {
      updateData.documentStatus = documentStatus;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await docRef.update(updateData);

    console.log(`Application ${applicationId} updated by ${session.user.name}: status=${status}, documentStatus=${documentStatus}`);

    return NextResponse.json({
      success: true,
      message: 'Application updated successfully',
    });
  } catch (error) {
    console.error('Error updating application:', error);
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 });
  }
}

// DELETE - Delete an application
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('id');

    if (!applicationId) {
      return NextResponse.json({ error: 'Application ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('membershipApplications').doc(applicationId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    await docRef.delete();

    console.log(`Application ${applicationId} deleted by ${session.user.name}`);

    return NextResponse.json({
      success: true,
      message: 'Application deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting application:', error);
    return NextResponse.json({ error: 'Failed to delete application' }, { status: 500 });
  }
}
