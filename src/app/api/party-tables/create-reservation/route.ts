// API Route: Create Reservation Table (กลุ่มจองโต๊ะ)
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { createReservationTable } from '@/lib/partyTables';
import { CreateReservationTableData } from '@/types/partyTable';

/**
 * POST /api/party-tables/create-reservation
 * Create a new Reservation Table (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied - Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    console.log('[Create Reservation Table] Request received:', {
      userId: session.user.id,
      userName: session.user.name,
      body,
    });

    // Validate required fields
    const missingFields: string[] = [];
    if (!body.eventId) missingFields.push('eventId');
    if (!body.tableGroupName) missingFields.push('tableGroupName');
    if (typeof body.reservedSeats !== 'number' || body.reservedSeats < 1) {
      missingFields.push('reservedSeats (must be a positive number)');
    }

    if (missingFields.length > 0) {
      console.error('[Create Reservation Table] Missing or invalid fields:', {
        missingFields,
        body,
      });
      return NextResponse.json(
        {
          error: 'ข้อมูลไม่ครบถ้วนหรือไม่ถูกต้อง',
          details: `Missing or invalid fields: ${missingFields.join(', ')}`,
          missingFields
        },
        { status: 400 }
      );
    }

    // Create the Reservation Table
    const createdBy = session.user.id;
    const createdByName = session.user.name || session.user.email || 'Unknown';

    const data: CreateReservationTableData = {
      eventId: body.eventId,
      tableGroupName: body.tableGroupName,
      reservedSeats: body.reservedSeats,
      createdBy,
    };

    const table = await createReservationTable(data, createdByName);

    return NextResponse.json({ success: true, table }, { status: 201 });
  } catch (error) {
    console.error('Error creating Reservation Table:', error);
    return NextResponse.json(
      { error: 'Failed to create Reservation Table', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
