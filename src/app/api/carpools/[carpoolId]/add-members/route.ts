// API Route: Carpool Management - Add Members to Carpool
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolById, addMembersToCarpool } from '@/lib/carpools';
import { CarpoolMember } from '@/types/carpool';
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
 * POST /api/carpools/[carpoolId]/add-members
 * Add members to existing Carpool
 * - Admins can add members to any carpool
 * - Members can only add members to their own carpool (where ownerRegistrationId matches)
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

    const body: { members: CarpoolMember[] } = await request.json();

    if (!body.members || !Array.isArray(body.members) || body.members.length === 0) {
      return NextResponse.json({ error: 'Members array is required and cannot be empty' }, { status: 400 });
    }

    // Check if Carpool exists
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
        { error: 'Permission denied. You can only add members to your own carpool.' },
        { status: 403 }
      );
    }

    // Add members to Carpool
    await addMembersToCarpool(carpoolId, body.members);

    // Fetch updated Carpool
    const updatedCarpool = await getCarpoolById(carpoolId);

    return NextResponse.json({ success: true, carpool: updatedCarpool });
  } catch (error) {
    console.error('Error adding members to Carpool:', error);
    return NextResponse.json(
      { error: 'Failed to add members to Carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
