// API Route: Party Table - Add Members
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { addMembersToTable, getPartyTableById } from '@/lib/partyTables';
import { AddMembersToTableData } from '@/types/partyTable';
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
 * POST /api/party-tables/[tableId]/add-members
 * Add members to a Party Table
 * - Admins can add members to any party table
 * - Members can only add members to their own party table (where hostRegistrationId matches)
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
        { error: 'Permission denied. You can only add members to your own party table.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (!body.members || !Array.isArray(body.members)) {
      return NextResponse.json({ error: 'members array is required' }, { status: 400 });
    }

    const addedBy = session.user.id;

    // Get user's display name from session or Firestore
    let addedByName = session.user.name || session.user.email || 'Unknown';

    // If session doesn't have a name, try to fetch from Firestore users collection
    if (!session.user.name || session.user.name === 'Unknown') {
      try {
        const db = adminDb();
        const userDoc = await db.collection('users').doc(session.user.lineUserId).get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          addedByName = userData?.displayName || userData?.lineDisplayName || userData?.name || session.user.email || 'Unknown User';
        }
      } catch (error) {
        console.error('[Add Members] Error fetching user display name:', error);
        // Continue with fallback name
      }
    }

    const data: AddMembersToTableData = {
      tableId,
      members: body.members,
      addedBy,
      addedByName,
    };

    await addMembersToTable(data);

    // Fetch updated table
    const updatedTable = await getPartyTableById(tableId);

    return NextResponse.json({ success: true, table: updatedTable });
  } catch (error) {
    console.error('Error adding members to Party Table:', error);
    return NextResponse.json(
      { error: 'Failed to add members', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
