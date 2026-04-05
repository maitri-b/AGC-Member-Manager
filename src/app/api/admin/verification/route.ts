// API Route for Admin - Manage Verification Requests
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { updateMember, getAllMembers } from '@/lib/google-sheets';
import { ROLE_PERMISSIONS } from '@/types/next-auth.d';

// GET: List all verification requests
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();

    // Get all verification requests, ordered by status and date
    const requests = await db.collection('verificationRequests')
      .orderBy('createdAt', 'desc')
      .get();

    // Get all members from Google Sheet for comparison
    const allMembers = await getAllMembers();
    const membersMap = new Map(allMembers.map(m => [m.memberId, m]));

    interface VerificationRequest {
      id: string;
      status: string;
      memberId: string;
      createdAt: Date | null;
      updatedAt: Date | null;
      systemData?: {
        companyNameTH: string;
        companyNameEN: string;
        licenseNumber: string;
        lineName: string;
        mobile: string;
      };
      hasDuplicatePending?: boolean;
      duplicateCount?: number;
      [key: string]: unknown;
    }

    // First pass: collect all pending requests by memberId
    const pendingByMemberId = new Map<string, string[]>();
    requests.docs.forEach(doc => {
      const data = doc.data();
      if (data.status === 'pending' && data.memberId) {
        const existing = pendingByMemberId.get(data.memberId) || [];
        existing.push(doc.id);
        pendingByMemberId.set(data.memberId, existing);
      }
    });

    const verificationRequests: VerificationRequest[] = requests.docs.map(doc => {
      const data = doc.data();
      const member = membersMap.get(data.memberId);

      // Check if this memberId has duplicate pending requests
      const duplicateRequestIds = pendingByMemberId.get(data.memberId) || [];
      const hasDuplicatePending = data.status === 'pending' && duplicateRequestIds.length > 1;

      return {
        id: doc.id,
        ...data,
        memberId: data.memberId,
        status: data.status || 'pending',
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        // Add system data from Google Sheet for comparison
        systemData: member ? {
          companyNameTH: member.companyNameTH || '',
          companyNameEN: member.companyNameEN || '',
          licenseNumber: member.licenseNumber || '',
          lineName: member.lineName || '',
          mobile: member.mobile || member.phone || '',
        } : undefined,
        // Flag for duplicate detection
        hasDuplicatePending,
        duplicateCount: hasDuplicatePending ? duplicateRequestIds.length : undefined,
      };
    });

    // Separate pending and processed
    const pending = verificationRequests.filter(r => r.status === 'pending');
    const processed = verificationRequests.filter(r => r.status !== 'pending');

    return NextResponse.json({
      pending,
      processed,
      total: verificationRequests.length,
      pendingCount: pending.length,
    });

  } catch (error) {
    console.error('Error fetching verification requests:', error);
    return NextResponse.json({ error: 'Failed to fetch verification requests' }, { status: 500 });
  }
}

// PUT: Approve or Reject verification request
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { requestId, action, rejectionReason } = await request.json();

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Request ID and action are required' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const db = adminDb();
    const requestRef = db.collection('verificationRequests').doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return NextResponse.json({ error: 'Verification request not found' }, { status: 404 });
    }

    const requestData = requestDoc.data();

    if (requestData?.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been processed' }, { status: 400 });
    }

    const now = new Date();

    if (action === 'approve') {
      // Update verification request
      await requestRef.update({
        status: 'approved',
        approvedBy: session.user.id,
        approvedByName: session.user.name,
        approvedAt: now,
        updatedAt: now,
      });

      // Update user in Firestore and get LINE info
      const userRef = db.collection('users').doc(requestData.userId);
      const userDoc = await userRef.get();
      const userData = userDoc.data();

      // Get LINE info from multiple sources (request data or user data)
      const lineUserId = requestData.lineUserId || userData?.lineUserId || requestData.userId;
      const lineDisplayName = requestData.lineDisplayName || userData?.lineDisplayName || userData?.displayName || userData?.name || '';
      const lineImage = requestData.lineImage || userData?.pictureUrl || userData?.image || '';

      // Build update object with LINE profile info
      const userUpdateData: Record<string, unknown> = {
        memberId: requestData.memberId,
        verificationStatus: 'verified',
        verifiedAt: now,
        verifiedBy: session.user.id,
        updatedAt: now,
        // Update role to member and set permissions
        role: 'member',
        permissions: ROLE_PERMISSIONS.member,
        // Update LINE info from verification request if available
        lineUserId: lineUserId,
      };

      // Only update displayName and pictureUrl if we have values
      if (lineDisplayName) {
        userUpdateData.displayName = lineDisplayName;
      }
      if (lineImage) {
        userUpdateData.pictureUrl = lineImage;
      }

      await userRef.update(userUpdateData);

      console.log('Updating Google Sheet with LINE info:', {
        memberId: requestData.memberId,
        lineUserId,
        lineDisplayName,
        source: requestData.lineDisplayName ? 'request' : (userData?.lineDisplayName ? 'user.lineDisplayName' : 'user.name'),
      });

      // Update Google Sheet with LINE info
      await updateMember(requestData.memberId, {
        lineUserId: lineUserId,
        lineDisplayName: lineDisplayName,
        lastUpdated: now.toISOString(),
        updatedBy: session.user.name || session.user.id,
      });

      // Auto-reject other pending requests for the same memberId
      const duplicateRequests = await db.collection('verificationRequests')
        .where('memberId', '==', requestData.memberId)
        .where('status', '==', 'pending')
        .get();

      const autoRejectPromises = duplicateRequests.docs
        .filter(doc => doc.id !== requestId) // Exclude the approved request
        .map(async (doc) => {
          const duplicateData = doc.data();

          // Update the duplicate request as rejected
          await doc.ref.update({
            status: 'rejected',
            rejectionReason: 'มีผู้อื่นได้รับการยืนยันตัวตนสำหรับรหัสสมาชิกนี้แล้ว หากคุณเชื่อว่าเป็นข้อผิดพลาด กรุณาแจ้งปัญหาผ่านระบบ',
            rejectedBy: 'system',
            rejectedByName: 'ระบบอัตโนมัติ',
            rejectedAt: now,
            updatedAt: now,
            autoRejectedDueTo: requestId,
          });

          // Update the user's verification status
          if (duplicateData.userId) {
            await db.collection('users').doc(duplicateData.userId).update({
              verificationStatus: 'rejected',
              updatedAt: now,
            });
          }
        });

      await Promise.all(autoRejectPromises);

      const autoRejectedCount = duplicateRequests.docs.length - 1;

      return NextResponse.json({
        success: true,
        message: autoRejectedCount > 0
          ? `อนุมัติคำขอยืนยันตัวตนเรียบร้อยแล้ว และปฏิเสธคำขอซ้ำอีก ${autoRejectedCount} รายการโดยอัตโนมัติ`
          : 'อนุมัติคำขอยืนยันตัวตนเรียบร้อยแล้ว',
        memberId: requestData.memberId,
        autoRejectedCount,
      });

    } else {
      // Reject
      await requestRef.update({
        status: 'rejected',
        rejectionReason: rejectionReason || 'ไม่ผ่านการตรวจสอบ',
        rejectedBy: session.user.id,
        rejectedByName: session.user.name,
        rejectedAt: now,
        updatedAt: now,
      });

      // Update user status
      const userRef = db.collection('users').doc(requestData.userId);
      await userRef.update({
        verificationStatus: 'rejected',
        updatedAt: now,
      });

      return NextResponse.json({
        success: true,
        message: 'ปฏิเสธคำขอยืนยันตัวตนเรียบร้อยแล้ว',
      });
    }

  } catch (error) {
    console.error('Error processing verification request:', error);
    return NextResponse.json({ error: 'Failed to process verification request' }, { status: 500 });
  }
}
