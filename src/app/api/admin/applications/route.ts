// API Route for Managing Membership Applications
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { addMember, getNextMemberId } from '@/lib/google-sheets';
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

    let applications = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    });

    // Filter by status in memory
    if (status && status !== 'all') {
      applications = applications.filter(app => app.status === status);
    }

    // Sort by createdAt descending in memory
    applications.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt || 0);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt || 0);
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
          // Generate new member ID
          const memberId = await getNextMemberId(new Date().getFullYear());

          // Map application data to Member format
          const newMember: Partial<Member> = {
            memberId,
            companyNameEN: applicationData?.companyNameEN || '',
            companyNameTH: applicationData?.companyNameTH || '',
            fullNameTH: '', // Not collected in application form
            nickname: applicationData?.nickname || '',
            lineId: applicationData?.lineId || '',
            lineName: applicationData?.lineName || '',
            phone: applicationData?.phone || '',
            mobile: applicationData?.mobile || '',
            email: applicationData?.email || '',
            website: applicationData?.website || '',
            licenseNumber: applicationData?.licenseNumber || '',
            licenseExpiry: '', // Will be updated later by admin
            positionCompany: applicationData?.positionCompany || '',
            positionClub: '', // New member, no club position yet
            membershipExpiry: '', // Will be set by admin
            status: 'ปกติ',
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
