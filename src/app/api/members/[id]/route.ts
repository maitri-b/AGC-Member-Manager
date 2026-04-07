// API Route for Single Member
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getMemberById, updateMember } from '@/lib/google-sheets';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';
import { getMemberAttendanceSummary } from '@/lib/event-sheets';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin and committee can view member details
    if (!hasPermission(session.user.permissions || [], 'members:list')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id } = await params;
    const member = await getMemberById(id);

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Get LINE profile from Firestore if member has been verified
    let lineProfile = null;
    const db = adminDb();
    const usersSnapshot = await db.collection('users')
      .where('memberId', '==', id)
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      const userData = usersSnapshot.docs[0].data();
      lineProfile = {
        lineDisplayName: userData.lineDisplayName || userData.name || '',
        lineProfilePicture: userData.lineProfilePicture || userData.image || '',
        lineUserId: userData.lineUserId || '',
        verifiedAt: userData.verifiedAt?.toDate?.()?.toISOString() || null,
      };
    }

    // Get member attendance summary
    let attendance = null;
    try {
      attendance = await getMemberAttendanceSummary(id);
    } catch (err) {
      console.error('Error fetching attendance summary:', err);
    }

    return NextResponse.json({
      member,
      lineProfile,
      attendance,
    });
  } catch (error) {
    console.error('Error fetching member:', error);
    return NextResponse.json({ error: 'Failed to fetch member' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow admin:users, members:edit, or member:write
    const canEdit = hasPermission(session.user.permissions || [], 'admin:users') ||
                    hasPermission(session.user.permissions || [], 'members:edit') ||
                    hasPermission(session.user.permissions || [], 'member:write');
    if (!canEdit) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id } = await params;
    const updates = await request.json();

    // Add updatedBy info
    updates.updatedBy = session.user.name || session.user.id;

    const success = await updateMember(id, updates);

    if (!success) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}
