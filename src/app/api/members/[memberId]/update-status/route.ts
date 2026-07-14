// API Route: PUT /api/members/[memberId]/update-status - Update member status
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
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

    const { memberId } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // Validate status values
    const validStatuses = ['ปกติ', 'ไม่ปกติ', 'หมดอายุ', 'ถูกเพิกถอน', 'ระงับ'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({
        error: 'Invalid status',
        validStatuses
      }, { status: 400 });
    }

    // Update member status in Firestore
    const db = adminDb();
    const membersRef = db.collection('members');
    const snapshot = await membersRef
      .where('memberId', '==', memberId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const memberDoc = snapshot.docs[0];
    await memberDoc.ref.update({
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.lineUserId || session.user.id || 'unknown',
    });

    console.log(`[Member Status Update] memberId=${memberId}, newStatus=${status}, updatedBy=${session.user.name || session.user.id}`);

    return NextResponse.json({
      success: true,
      message: 'Member status updated successfully',
      memberId,
      status,
    });
  } catch (error) {
    console.error('Error updating member status:', error);
    return NextResponse.json(
      { error: 'Failed to update member status' },
      { status: 500 }
    );
  }
}
