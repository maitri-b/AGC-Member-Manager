// API Route: Carpool Management - Get, Update, Delete Carpool by ID
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolById, updateCarpool, deleteCarpool } from '@/lib/carpools';
import { UpdateCarpoolData } from '@/types/carpool';

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
 * Update Carpool
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

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
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

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
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
