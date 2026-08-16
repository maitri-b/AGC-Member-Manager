// API Route: Party Table - Remove Members
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { removeMembersFromTable, getPartyTableById } from '@/lib/partyTables';
import { RemoveMembersFromTableData } from '@/types/partyTable';
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
 * POST /api/party-tables/[tableId]/remove-members
 * Remove members from a Party Table
 * - Admins can remove members from any party table
 * - Members can only remove members from their own party table (where hostRegistrationId matches)
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

    const { tableId } = await params;

    if (!tableId) {
      return NextResponse.json({ error: 'Table ID is required' }, { status: 400 });
    }

    // Check if table exists
    const table = await getPartyTableById(tableId);
    if (!table) {
      return NextResponse.json({ error: 'Party Table not found' }, { status: 404 });
    }

    // Check permissions: Admin can modify any table, member can only modify their own
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');

    // Get user's registration ID for this event to check ownership
    const userRegistrationId = await getUserRegistrationId(
      session.user.lineUserId,
      table.eventId
    );
    const isHost = userRegistrationId === table.hostRegistrationId;

    if (!isAdmin && !isHost) {
      return NextResponse.json(
        { error: 'Permission denied. You can only remove members from your own party table.' },
        { status: 403 }
      );
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
