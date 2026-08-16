// API Route: Carpool Management - Remove Members from Carpool
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolById, removeMembersFromCarpool } from '@/lib/carpools';
import { adminDb } from '@/lib/firebase-admin';

/**
 * Helper function to get user's registration for an event
 */
async function getUserRegistrationId(lineUserId: string, eventId: string): Promise<string | null> {
  const db = adminDb();
  const snapshot = await db
    .collection('eventRegistrations')
    .where('lineUserId', '==', lineUserId)
    .where('eventId', '==', eventId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data().registrationId || null;
}

/**
 * POST /api/carpools/[carpoolId]/remove-members
 * Remove members from existing Carpool
 * - Admins can remove members from any carpool
 * - Members can only remove members from their own carpool (where ownerRegistrationId matches)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { carpoolId: string } }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { carpoolId } = params;

    if (!carpoolId) {
      return NextResponse.json({ error: 'Carpool ID is required' }, { status: 400 });
    }

    // Check if Carpool exists first
    const existingCarpool = await getCarpoolById(carpoolId);
    if (!existingCarpool) {
      return NextResponse.json({ error: 'Carpool not found' }, { status: 404 });
    }

    // Check permissions: Admin can modify any carpool, member can only modify their own
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');

    // Get user's registration ID for this event to check ownership
    const userRegistrationId = await getUserRegistrationId(
      session.user.lineUserId,
      existingCarpool.eventId
    );
    const isOwner = userRegistrationId === existingCarpool.ownerRegistrationId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'Permission denied. You can only remove members from your own carpool.' },
        { status: 403 }
      );
    }

    const body: {
      lineUserIds?: string[];  // Legacy support
      members?: Array<{ lineUserId: string; name: string }>;  // New format
    } = await request.json();

    // Support both old format (lineUserIds) and new format (members)
    let membersToRemove: Array<{ lineUserId: string; name: string }>;

    if (body.members && Array.isArray(body.members) && body.members.length > 0) {
      // New format: members with lineUserId + name
      membersToRemove = body.members;
    } else if (body.lineUserIds && Array.isArray(body.lineUserIds) && body.lineUserIds.length > 0) {
      // Legacy format: just lineUserIds (for backward compatibility with member UI)
      membersToRemove = body.lineUserIds.map(lineUserId => ({
        lineUserId,
        name: '', // Will match any name for this lineUserId
      }));
    } else {
      return NextResponse.json(
        { error: 'Either members array or lineUserIds array is required' },
        { status: 400 }
      );
    }

    // Remove members from Carpool
    await removeMembersFromCarpool(carpoolId, membersToRemove);

    // Fetch updated Carpool
    const updatedCarpool = await getCarpoolById(carpoolId);

    return NextResponse.json({ success: true, carpool: updatedCarpool });
  } catch (error) {
    console.error('Error removing members from Carpool:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'ไม่สามารถลบสมาชิกออกจากรถได้' },
      { status: 500 }
    );
  }
}
