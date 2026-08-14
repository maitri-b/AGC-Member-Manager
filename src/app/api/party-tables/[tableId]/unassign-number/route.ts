// API Route: Party Table - Unassign Table Number
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { unassignTableNumber, getPartyTableById } from '@/lib/partyTables';

/**
 * POST /api/party-tables/[tableId]/unassign-number
 * Remove table number assignment from a Party Table
 * Admin/Committee only
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { tableId: string } }
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

    const { tableId } = params;

    if (!tableId) {
      return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });
    }

    // Check if table exists
    const table = await getPartyTableById(tableId);
    if (!table) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    const performedBy = session.user.id;
    const performedByName = session.user.name || session.user.email || 'Unknown';

    await unassignTableNumber(tableId, performedBy, performedByName);

    // Fetch updated table
    const updatedTable = await getPartyTableById(tableId);

    return NextResponse.json({ success: true, table: updatedTable });
  } catch (error) {
    console.error('Error unassigning table number:', error);
    return NextResponse.json(
      { error: 'Failed to unassign table number', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
