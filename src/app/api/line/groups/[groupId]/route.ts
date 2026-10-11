import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * Update LINE Group information (e.g., group name)
 * Admin only
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const { groupId } = params;
    const body = await req.json();
    const { groupName } = body;

    // Update group name
    await adminDb().collection('lineGroups').doc(groupId).update({
      groupName: groupName || null,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: 'Group name updated successfully'
    });
  } catch (error) {
    console.error('Error updating LINE group:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Delete LINE Group
 * Admin only
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { groupId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const { groupId } = params;

    // Delete group
    await adminDb().collection('lineGroups').doc(groupId).delete();

    return NextResponse.json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting LINE group:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
