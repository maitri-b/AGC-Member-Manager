// API Route: Party Table - Remove Members
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { removeMembersFromTable, getPartyTableById } from '@/lib/partyTables';
import { RemoveMembersFromTableData } from '@/types/partyTable';

/**
 * POST /api/party-tables/[tableId]/remove-members
 * Remove members from a Party Table
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

    const { tableId } = params;

    if (!tableId) {
      return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });
    }

    // Check if table exists
    const table = await getPartyTableById(tableId);
    if (!table) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    const body = await request.json();

    if (!body.memberIds || !Array.isArray(body.memberIds)) {
      return NextResponse.json({ error: 'memberIds array is required' }, { status: 400 });
    }

    const removedBy = session.user.id;
    const removedByName = session.user.name || session.user.email || 'Unknown';

    const data: RemoveMembersFromTableData = {
      tableId,
      memberIds: body.memberIds,
      removedBy,
      removedByName,
      reason: body.reason,
    };

    await removeMembersFromTable(data);

    // Fetch updated table (may be null if deleted)
    const updatedTable = await getPartyTableById(tableId);

    return NextResponse.json({
      success: true,
      table: updatedTable,
      deleted: updatedTable === null || updatedTable.status === 'deleted'
    });
  } catch (error) {
    console.error('Error removing members from Party Table:', error);
    return NextResponse.json(
      { error: 'Failed to remove members', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
