// API Route: Carpool Management - Get, Update, Delete Carpool by ID
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolById, updateCarpool, deleteCarpool } from '@/lib/carpools';
import { UpdateCarpoolData } from '@/types/carpool';
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
 * GET /api/carpools/[carpoolId]
 * Get Carpool by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { carpoolId: string } }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { carpoolId } = params;

    if (!carpoolId) {
      return NextResponse.json({ error: 'Carpool ID is required' }, { status: 400 });
    }

    const carpool = await getCarpoolById(carpoolId);

    if (!carpool) {
      return NextResponse.json({ error: 'Carpool not found' }, { status: 404 });
    }

    return NextResponse.json({ carpool });
  } catch (error) {
    console.error('Error fetching Carpool:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/carpools/[carpoolId]
 * Update Carpool (e.g., license plate)
 * - Admins can update any carpool
 * - Members can only update their own carpool (where ownerRegistrationId matches)
 */
export async function PUT(
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

    const body: UpdateCarpoolData = await request.json();

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
        { error: 'Permission denied. You can only update your own carpool.' },
        { status: 403 }
      );
    }

    // Update the Carpool
    await updateCarpool(carpoolId, body);

    // Fetch updated Carpool
    const updatedCarpool = await getCarpoolById(carpoolId);

    return NextResponse.json({ success: true, carpool: updatedCarpool });
  } catch (error) {
    console.error('Error updating Carpool:', error);
    return NextResponse.json(
      { error: 'Failed to update Carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/carpools/[carpoolId]
 * Delete Carpool
 * - Admins can delete any carpool
 * - Members can only delete their own carpool (where ownerRegistrationId matches their registration)
 */
export async function DELETE(
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

    // Check if Carpool exists
    const existingCarpool = await getCarpoolById(carpoolId);
    if (!existingCarpool) {
      return NextResponse.json({ error: 'Carpool not found' }, { status: 404 });
    }

    // Check permissions: Admin can delete any carpool, member can only delete their own
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');

    // Get user's registration ID for this event to check ownership
    const userRegistrationId = await getUserRegistrationId(
      session.user.lineUserId,
      existingCarpool.eventId
    );
    const isOwner = userRegistrationId === existingCarpool.ownerRegistrationId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'Permission denied. You can only delete your own carpool.' },
        { status: 403 }
      );
    }

    // Delete the Carpool
    await deleteCarpool(carpoolId);

    return NextResponse.json({ success: true, message: 'Carpool deleted successfully' });
  } catch (error) {
    console.error('Error deleting Carpool:', error);
    return NextResponse.json(
      { error: 'Failed to delete Carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
