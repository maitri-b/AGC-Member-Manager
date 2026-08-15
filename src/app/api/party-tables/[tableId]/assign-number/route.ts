// API Route: Party Table - Assign Table Number
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { assignTableNumber, getPartyTableById } from '@/lib/partyTables';
import { AssignTableNumberData } from '@/types/partyTable';

/**
 * POST /api/party-tables/[tableId]/assign-number
 * Assign a table number to a Party Table
 * Admin/Committee only
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied - Admin access required' }, { status: 403 });
    }

    const { tableId } = await params;

    if (!tableId) {
      return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });
    }

    // Check if table exists
    const table = await getPartyTableById(tableId);
    if (!table) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    const body = await request.json();

    if (typeof body.tableNumber !== 'number' || body.tableNumber < 1) {
      return NextResponse.json(
        { error: 'Valid tableNumber is required (positive integer)' },
        { status: 400 }
      );
    }

    const assignedBy = session.user.id;
    const assignedByName = session.user.name || session.user.email || 'Unknown';

    const data: AssignTableNumberData = {
      tableId,
      tableNumber: body.tableNumber,
      assignedBy,
      assignedByName,
    };

    console.log('[assign-number API] Assigning table number:', data);

    await assignTableNumber(data);

    console.log('[assign-number API] Table number assigned, fetching updated table...');

    // Fetch updated table
    const updatedTable = await getPartyTableById(tableId);

    console.log('[assign-number API] Updated table fetched:', updatedTable ? 'success' : 'null');

    return NextResponse.json({ success: true, table: updatedTable });
  } catch (error) {
    console.error('[assign-number API] Error assigning table number:', error);
    return NextResponse.json(
      { error: 'Failed to assign table number', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
