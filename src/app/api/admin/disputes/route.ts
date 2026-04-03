// API Route for Admin - Manage Dispute Requests
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { updateMember } from '@/lib/google-sheets';

// GET: List all dispute requests
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

    const disputes = await db.collection('disputeRequests')
      .orderBy('createdAt', 'desc')
      .get();

    interface DisputeRequest {
      id: string;
      status: string;
      createdAt: Date | null;
      updatedAt: Date | null;
      resolvedAt: Date | null;
      [key: string]: unknown;
    }

    const disputeRequests: DisputeRequest[] = disputes.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        status: data.status || 'pending',
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        resolvedAt: data.resolvedAt?.toDate?.() || data.resolvedAt,
      };
    });

    const pending = disputeRequests.filter(r => r.status === 'pending');
    const processed = disputeRequests.filter(r => r.status !== 'pending');

    return NextResponse.json({
      pending,
      processed,
      total: disputeRequests.length,
      pendingCount: pending.length,
    });

  } catch (error) {
    console.error('Error fetching dispute requests:', error);
    return NextResponse.json({ error: 'Failed to fetch dispute requests' }, { status: 500 });
  }
}

// PUT: Resolve dispute request
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { disputeId, action, resolution } = await request.json();

    if (!disputeId || !action) {
      return NextResponse.json({ error: 'Dispute ID and action are required' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const db = adminDb();
    const disputeRef = db.collection('disputeRequests').doc(disputeId);
    const disputeDoc = await disputeRef.get();

    if (!disputeDoc.exists) {
      return NextResponse.json({ error: 'Dispute request not found' }, { status: 404 });
    }

    const disputeData = disputeDoc.data();

    if (disputeData?.status !== 'pending') {
      return NextResponse.json({ error: 'This dispute has already been resolved' }, { status: 400 });
    }

    const now = new Date();

    if (action === 'approve') {
      // 1. Clear LINE info from Google Sheet (remove old link)
      await updateMember(disputeData.memberId, {
        lineUserId: disputeData.lineUserId, // New user's LINE ID
        lineDisplayName: disputeData.lineDisplayName,
        lastUpdated: now.toISOString(),
        updatedBy: `Admin: ${session.user.name || session.user.id} (Dispute Resolution)`,
      });

      // 2. Update old user's Firestore record (remove memberId)
      if (disputeData.currentLinkedLineUserId) {
        const oldUserQuery = await db.collection('users')
          .where('lineUserId', '==', disputeData.currentLinkedLineUserId)
          .limit(1)
          .get();

        if (!oldUserQuery.empty) {
          const oldUserDoc = oldUserQuery.docs[0];
          await oldUserDoc.ref.update({
            memberId: null,
            verificationStatus: 'revoked',
            revokedAt: now,
            revokedReason: `Dispute resolved in favor of another user. Dispute ID: ${disputeId}`,
            updatedAt: now,
          });
        }
      }

      // 3. Update new user's Firestore record
      const newUserRef = db.collection('users').doc(disputeData.userId);
      await newUserRef.update({
        memberId: disputeData.memberId,
        verificationStatus: 'verified',
        verifiedAt: now,
        verifiedBy: session.user.id,
        hasDisputePending: false,
        disputeRequestId: null,
        updatedAt: now,
      });

      // 4. Update dispute request status
      await disputeRef.update({
        status: 'approved',
        resolution: resolution || 'คำร้องได้รับการอนุมัติ บัญชี LINE ของคุณถูกเชื่อมต่อกับข้อมูลสมาชิกเรียบร้อยแล้ว',
        resolvedBy: session.user.id,
        resolvedByName: session.user.name,
        resolvedAt: now,
        updatedAt: now,
      });

      return NextResponse.json({
        success: true,
        message: 'อนุมัติคำร้องและโอนการเชื่อมต่อเรียบร้อยแล้ว',
      });

    } else {
      // Reject the dispute
      await disputeRef.update({
        status: 'rejected',
        resolution: resolution || 'คำร้องถูกปฏิเสธ การยืนยันตัวตนเดิมยังคงใช้งานได้',
        resolvedBy: session.user.id,
        resolvedByName: session.user.name,
        resolvedAt: now,
        updatedAt: now,
      });

      // Update user status
      const userRef = db.collection('users').doc(disputeData.userId);
      await userRef.update({
        hasDisputePending: false,
        updatedAt: now,
      });

      return NextResponse.json({
        success: true,
        message: 'ปฏิเสธคำร้องเรียบร้อยแล้ว',
      });
    }

  } catch (error) {
    console.error('Error resolving dispute:', error);
    return NextResponse.json({ error: 'Failed to resolve dispute' }, { status: 500 });
  }
}
