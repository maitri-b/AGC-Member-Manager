// API Route: PUT /api/members/[id]/update-line-group-status - Update member LINE group status
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';
import { updateMember } from '@/lib/google-sheets';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - must be admin or committee
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');
    const isCommittee = session.user.role === 'committee';

    if (!isAdmin && !isCommittee) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id: memberId } = await params;
    const body = await request.json();
    const { lineGroupStatus } = body;

    if (!lineGroupStatus) {
      return NextResponse.json({ error: 'LINE group status is required' }, { status: 400 });
    }

    // Validate LINE group status values
    const validStatuses = ['ปกติ', 'รอนำเข้ากลุ่ม', 'ออกจากกลุ่มแล้ว', 'รอผลการติดต่อ'];
    if (!validStatuses.includes(lineGroupStatus)) {
      return NextResponse.json({
        error: 'Invalid LINE group status',
        validStatuses
      }, { status: 400 });
    }

    // Update member LINE group status in Google Sheets (primary source)
    try {
      await updateMember(memberId, {
        lineGroupStatus,
        lastUpdated: new Date().toISOString(),
        updatedBy: session.user.name || session.user.id,
      });
      console.log(`[Google Sheets] Updated LINE group status to '${lineGroupStatus}' for member ${memberId}`);
    } catch (sheetError) {
      console.error('Error updating LINE group status in Google Sheets:', sheetError);
      return NextResponse.json(
        { error: 'Failed to update member in Google Sheets' },
        { status: 500 }
      );
    }

    // Also update in Firestore if exists
    const db = adminDb();
    const membersRef = db.collection('members');
    const snapshot = await membersRef
      .where('memberId', '==', memberId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const memberDoc = snapshot.docs[0];
      await memberDoc.ref.update({
        lineGroupStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.lineUserId || session.user.id || 'unknown',
      });
      console.log(`[Firestore] Updated LINE group status for member ${memberId}`);
    }

    console.log(`[Member LINE Group Status Update] memberId=${memberId}, newStatus=${lineGroupStatus}, updatedBy=${session.user.name || session.user.id}`);

    return NextResponse.json({
      success: true,
      message: 'Member LINE group status updated successfully',
      memberId,
      lineGroupStatus,
    });
  } catch (error) {
    console.error('Error updating member LINE group status:', error);
    return NextResponse.json(
      { error: 'Failed to update member LINE group status' },
      { status: 500 }
    );
  }
}
