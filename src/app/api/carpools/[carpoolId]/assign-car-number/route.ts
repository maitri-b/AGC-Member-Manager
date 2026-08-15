// API Route: Assign Car Number to Carpool
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolById, assignCarNumber, getCarpoolByCarNumber } from '@/lib/carpools';

/**
 * PUT /api/carpools/[carpoolId]/assign-car-number
 * Assign a car number to a Carpool
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

    const body: { carNumber: number } = await request.json();

    if (!body.carNumber || body.carNumber <= 0) {
      return NextResponse.json({ error: 'Valid car number is required' }, { status: 400 });
    }

    // Check if Carpool exists
    const existingCarpool = await getCarpoolById(carpoolId);
    if (!existingCarpool) {
      return NextResponse.json({ error: 'Carpool not found' }, { status: 404 });
    }

    // Check if car number is already assigned to another Carpool
    const carpoolWithSameNumber = await getCarpoolByCarNumber(existingCarpool.eventId, body.carNumber);
    if (carpoolWithSameNumber && carpoolWithSameNumber.carpoolId !== carpoolId) {
      return NextResponse.json(
        { error: `Car number ${body.carNumber} is already assigned to another Carpool` },
        { status: 409 }
      );
    }

    // Assign car number
    await assignCarNumber(carpoolId, body.carNumber);

    // Fetch updated Carpool
    const updatedCarpool = await getCarpoolById(carpoolId);

    return NextResponse.json({ success: true, carpool: updatedCarpool });
  } catch (error) {
    console.error('Error assigning car number:', error);
    return NextResponse.json(
      { error: 'Failed to assign car number', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
