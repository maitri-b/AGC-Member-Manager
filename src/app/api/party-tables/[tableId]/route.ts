// API Route: Party Table Management - Get, Update, Delete Party Table by ID
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getPartyTableById, updatePartyTable, deletePartyTable } from '@/lib/partyTables';
import { UpdatePartyTableData } from '@/types/partyTable';
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
 * GET /api/party-tables/[tableId]
 * Get Party Table by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin permission to view any party table
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { tableId } = await params;

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
 * - Admins can update any party table
 * - Members can only update their own party table (where hostRegistrationId matches)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tableId } = await params;

    if (!tableId) {
      return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });
    }

    const body: UpdatePartyTableData = await request.json();

    // Check if Party Table exists
    const existingTable = await getPartyTableById(tableId);
    if (!existingTable) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    // Check permissions: Admin can modify any table, member can only modify their own
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');

    // Get user's registration ID for this event to check ownership
    const userRegistrationId = await getUserRegistrationId(
      session.user.lineUserId,
      existingTable.eventId
    );
    const isHost = userRegistrationId === existingTable.hostRegistrationId;

    if (!isAdmin && !isHost) {
      return NextResponse.json(
        { error: 'Permission denied. You can only update your own party table.' },
        { status: 403 }
      );
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
 * - Admins can delete any party table
 * - Members can only delete their own party table (where hostRegistrationId matches)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tableId } = await params;

    if (!tableId) {
      return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });
    }

    // Check if Party Table exists
    const existingTable = await getPartyTableById(tableId);
    if (!existingTable) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    // Check permissions: Admin can delete any table, member can only delete their own
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');

    // Get user's registration ID for this event to check ownership
    const userRegistrationId = await getUserRegistrationId(
      session.user.lineUserId,
      existingTable.eventId
    );
    const isHost = userRegistrationId === existingTable.hostRegistrationId;

    if (!isAdmin && !isHost) {
      return NextResponse.json(
        { error: 'Permission denied. You can only delete your own party table.' },
        { status: 403 }
      );
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
