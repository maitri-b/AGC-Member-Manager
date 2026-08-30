// API Route: Get complete party table assignments for messaging
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';
import { PartyTable } from '@/types/partyTable';

/**
 * GET /api/events/[eventId]/party-table-assignments?registrationIds=REG001,REG002
 * Get complete party table assignments for message templates
 *
 * Returns detailed table information including:
 * - All members from all groups assigned to each table number
 * - Reservation groups with seat counts
 * - Members from different registrations (with company names)
 * - Members from same registration (without company names for recipient)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
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

    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Get registration IDs from query params
    const { searchParams } = new URL(request.url);
    const registrationIdsParam = searchParams.get('registrationIds');

    if (!registrationIdsParam) {
      return NextResponse.json({ error: 'Registration IDs are required' }, { status: 400 });
    }

    const registrationIds = registrationIdsParam.split(',');

    // Fetch all active party tables for this event
    const db = adminDb();
    const tablesSnapshot = await db
      .collection('partyTables')
      .where('eventId', '==', eventId)
      .where('status', '==', 'active')
      .get();

    const allTables = tablesSnapshot.docs.map(doc => doc.data() as PartyTable);

    // Build response: Map registrationId -> table assignments
    const result: Record<string, any[]> = {};

    for (const regId of registrationIds) {
      // Find all table numbers where this registration has members
      const tableNumbersSet = new Set<number>();

      allTables.forEach(table => {
        // Check if this registration has members in this table
        const hasMembersInTable = table.members?.some(m => m.registrationId === regId);

        if (hasMembersInTable && table.assignedTableNumber) {
          tableNumbersSet.add(table.assignedTableNumber);
        }
      });

      // For each table number, collect ALL groups/members assigned to it
      const tableAssignments: any[] = [];

      tableNumbersSet.forEach(tableNumber => {
        // Get all groups/tables assigned to this table number
        const tablesForThisNumber = allTables.filter(
          table => table.assignedTableNumber === tableNumber
        );

        // Collect all members with proper formatting
        const allMembers: Array<{
          name: string;
          registrationId: string;
          companyName?: string;
          isFromRecipient: boolean;
          isReservation?: boolean;
          reservationName?: string;
          reservationSeats?: number;
        }> = [];

        tablesForThisNumber.forEach(table => {
          if (table.isReservation) {
            // Reservation group - just add metadata
            allMembers.push({
              name: table.tableGroupName || 'โต๊ะจอง',
              registrationId: table.hostRegistrationId,
              isFromRecipient: false,
              isReservation: true,
              reservationName: table.tableGroupName || 'โต๊ะจอง',
              reservationSeats: table.reservedSeats || 0,
            });
          } else {
            // Regular group or Join table - add all members
            table.members?.forEach(member => {
              const isFromRecipient = member.registrationId === regId;

              allMembers.push({
                name: member.name,
                registrationId: member.registrationId,
                companyName: member.companyName,
                isFromRecipient,
              });
            });
          }
        });

        tableAssignments.push({
          tableNumber,
          members: allMembers,
        });
      });

      if (tableAssignments.length > 0) {
        result[regId] = tableAssignments;
      }
    }

    return NextResponse.json({ assignments: result });
  } catch (error) {
    console.error('Error fetching party table assignments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch party table assignments', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
