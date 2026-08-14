// API Route: Party Table Management - Get, Update, Delete Party Table by ID
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getPartyTableById, updatePartyTable, deletePartyTable } from '@/lib/partyTables';
import { UpdatePartyTableData } from '@/types/partyTable';

/**
 * GET /api/party-tables/[tableId]
 * Get Party Table by ID
 */
export async function GET(
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

    const table = await getPartyTableById(tableId);

    if (!table) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    return NextResponse.json({ table });
  } catch (error) {
    console.error('Error fetching Party Table:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Party Table', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/party-tables/[tableId]
 * Update Party Table
 */
export async function PUT(
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

    const body: UpdatePartyTableData = await request.json();

    // Check if Party Table exists
    const existingTable = await getPartyTableById(tableId);
    if (!existingTable) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    // Update the Party Table
    await updatePartyTable(tableId, body);

    // Fetch updated Party Table
    const updatedTable = await getPartyTableById(tableId);

    return NextResponse.json({ success: true, table: updatedTable });
  } catch (error) {
    console.error('Error updating Party Table:', error);
    return NextResponse.json(
      { error: 'Failed to update Party Table', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/party-tables/[tableId]
 * Delete Party Table (soft delete)
 */
export async function DELETE(
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

    // Check if Party Table exists
    const existingTable = await getPartyTableById(tableId);
    if (!existingTable) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    // Delete the Party Table (soft delete)
    const deletedBy = session.user.id;
    const deletedByName = session.user.name || session.user.email || 'Unknown';
    await deletePartyTable(tableId, deletedBy, deletedByName, 'Deleted by user');

    return NextResponse.json({ success: true, message: 'Party Table deleted successfully' });
  } catch (error) {
    console.error('Error deleting Party Table:', error);
    return NextResponse.json(
      { error: 'Failed to delete Party Table', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
