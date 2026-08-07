// API Route: Get Car Number Assignments for Event
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolsByEvent } from '@/lib/carpools';

/**
 * GET /api/events/[eventId]/car-assignments
 * Get all car number assignments for an event
 * Returns array of { carNumber, carpool } sorted by car number
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Get all Carpools for this event
    const carpools = await getCarpoolsByEvent(eventId);

    // Filter and map to assignments (only Carpools with assigned car numbers)
    const assignments = carpools
      .filter((carpool) => carpool.assignedCarNumber !== undefined)
      .map((carpool) => ({
        carNumber: carpool.assignedCarNumber!,
        carpool,
      }))
      .sort((a, b) => a.carNumber - b.carNumber);

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error('Error fetching car assignments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch car assignments', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
