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

    console.log('[Remove Members] START - Session:', {
      userId: session?.user?.id,
      lineUserId: session?.user?.lineUserId,
      name: session?.user?.name,
    });

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

    const body = await request.json();

    console.log('[Remove Members] Body received:', body);

    if (!body.memberIds || !Array.isArray(body.memberIds)) {
      return NextResponse.json({ error: 'memberIds array is required' }, { status: 400 });
    }

    // Check permissions: Admin can modify any table, member can only modify their own
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');

    // Get user's registration ID for this event to check ownership
    const userRegistrationId = await getUserRegistrationId(
      session.user.lineUserId,
      table.eventId
    );
    const isHost = userRegistrationId === table.hostRegistrationId;

    // Check if user is removing themselves (leaving the table)
    const isRemovingSelf = body.memberIds.every(
      (memberId: { registrationId: string; attendeeIndex: number }) =>
        memberId.registrationId === userRegistrationId
    );

    // Debug logging
    console.log('[Remove Members] Permission check:', {
      userLineUserId: session.user.lineUserId,
      userRegistrationId,
      tableId,
      hostRegistrationId: table.hostRegistrationId,
      isAdmin,
      isHost,
      isRemovingSelf,
      memberIds: body.memberIds,
    });

    // Permission logic:
    // 1. Admin can remove anyone from any table (bypass all checks)
    // 2. Host can remove anyone from their own table
    // 3. Any member can remove themselves (leave table)
    const hasPermission = isAdmin || isHost || isRemovingSelf;

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Permission denied. You can only leave tables you joined or remove members from your own table.' },
        { status: 403 }
      );
    }

    const removedBy = session.user.id;

    // Get user's display name from session or Firestore
    let removedByName = session.user.name || session.user.email || 'Unknown';

    // If session doesn't have a name, try to fetch from Firestore users collection
    if (!session.user.name || session.user.name === 'Unknown') {
      try {
        const db = adminDb();
        const userDoc = await db.collection('users').doc(session.user.lineUserId).get();

        if (userDoc.exists) {
          const userData = userDoc.data();
          removedByName = userData?.displayName || userData?.lineDisplayName || userData?.name || session.user.email || 'Unknown User';
        }
      } catch (error) {
        console.error('[Remove Members] Error fetching user display name:', error);
        // Continue with fallback name
      }
    }

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
