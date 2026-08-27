// API Route: Event Summary - Get comprehensive event data for registered participants
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { adminDb } from '@/lib/firebase-admin';

/**
 * GET /api/events/[eventId]/summary
 * Get event summary data for a registered participant
 *
 * Query Parameters:
 * - registrationId (optional): If provided, fetch data for this registration (admins only)
 *                             If not provided, fetch data for the logged-in user's registration
 *
 * Returns:
 * - Registration data (company name, LINE name, attendee names)
 * - Carpool assignments (grouped by license plate with car numbers)
 * - Room assignments (with room numbers)
 * - Party table assignments (with table numbers)
 * - Visibility settings from event configuration
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const db = adminDb();

    // Get event data with settings
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    // Get search parameter (optional registration ID)
    const searchParams = request.nextUrl.searchParams;
    const searchRegistrationId = searchParams.get('registrationId');

    // Determine which registration to fetch
    let targetRegistrationId = searchRegistrationId;

    // If no search parameter, find user's own registration
    if (!targetRegistrationId) {
      const userRegistrationsSnapshot = await db
        .collection('eventRegistrations')
        .where('lineUserId', '==', session.user.lineUserId)
        .where('eventId', '==', eventId)
        .limit(1)
        .get();

      if (userRegistrationsSnapshot.empty) {
        return NextResponse.json(
          { error: 'No registration found for this event' },
          { status: 404 }
        );
      }

      targetRegistrationId = userRegistrationsSnapshot.docs[0].data().registrationId;
    }

    // Get registration data
    const registrationSnapshot = await db
      .collection('eventRegistrations')
      .where('registrationId', '==', targetRegistrationId)
      .where('eventId', '==', eventId)
      .limit(1)
      .get();

    if (registrationSnapshot.empty) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const registration = registrationSnapshot.docs[0].data();

    // Get user's LINE display name
    const userDoc = await db
      .collection('users')
      .where('lineUserId', '==', registration.lineUserId)
      .limit(1)
      .get();

    const lineDisplayName = userDoc.empty
      ? ''
      : userDoc.docs[0].data().lineDisplayName || userDoc.docs[0].data().displayName || '';

    // Parse attendeeNames - can be string or array
    let attendeeNamesList: string[] = [];
    if (typeof registration.attendeeNames === 'string') {
      // Split by comma if it's a string
      attendeeNamesList = registration.attendeeNames
        .split(',')
        .map((name: string) => name.trim())
        .filter((name: string) => name.length > 0);
    } else if (Array.isArray(registration.attendeeNames)) {
      attendeeNamesList = registration.attendeeNames;
    }

    // Prepare attendee list with indices
    const attendees = attendeeNamesList.map((name: string, index: number) => ({
      name,
      attendeeIndex: index,
      registrationId: targetRegistrationId,
      lineUserId: registration.lineUserId,
    }));

    // Get carpool assignments (if enabled)
    let carpoolData = null;
    if (eventData?.carpoolSettings?.showCarNumbersToMembers) {
      const carpoolsSnapshot = await db
        .collection('carpools')
        .where('eventId', '==', eventId)
        .where('status', '==', 'active')
        .get();

      const userCarpools: any[] = [];

      carpoolsSnapshot.docs.forEach(doc => {
        const carpool = doc.data();
        const carpoolMembers = carpool.members || [];

        // Check if any of user's attendees are in this carpool
        const matchingMembers = carpoolMembers.filter((member: any) =>
          member.registrationId === targetRegistrationId
        );

        if (matchingMembers.length > 0) {
          userCarpools.push({
            carpoolId: carpool.carpoolId,
            licensePlate: carpool.licensePlate,
            carModel: carpool.carModel || '',
            assignedCarNumber: carpool.assignedCarNumber,
            ownerRegistrationId: carpool.ownerRegistrationId,
            members: matchingMembers.map((m: any) => ({
              name: m.name,
              attendeeIndex: m.attendeeIndex,
              isOwner: m.registrationId === carpool.ownerRegistrationId && m.attendeeIndex === 0,
            })),
          });
        }
      });

      carpoolData = userCarpools;
    }

    // Get room assignments (if enabled)
    let roomData = null;
    if (eventData?.roomSettings?.showRoomNumbersToMembers) {
      const roomsSnapshot = await db
        .collection('eventRooms')
        .where('eventId', '==', eventId)
        .where('status', '==', 'active')
        .get();

      const userRooms: any[] = [];

      roomsSnapshot.docs.forEach(doc => {
        const room = doc.data();
        const roomMembers = room.members || [];

        // Check if any of user's attendees are in this room
        const matchingMembers = roomMembers.filter((member: any) =>
          member.registrationId === targetRegistrationId
        );

        if (matchingMembers.length > 0) {
          userRooms.push({
            roomId: room.roomId,
            roomName: room.roomName || '',
            buildingName: room.buildingName || '',
            companyName: room.companyName || '',
            roomNumber: room.roomNumber,
            members: matchingMembers.map((m: any) => ({
              name: m.name,
              attendeeIndex: m.attendeeIndex,
            })),
          });
        }
      });

      roomData = userRooms;
    }

    // Get party table assignments (if enabled)
    let partyTableData = null;
    if (eventData?.partyTableSettings?.showTableNumbersToMembers) {
      const tablesSnapshot = await db
        .collection('partyTables')
        .where('eventId', '==', eventId)
        .where('status', '==', 'active')
        .get();

      const userTables: any[] = [];

      tablesSnapshot.docs.forEach(doc => {
        const table = doc.data();
        const tableMembers = table.members || [];

        // Check if any of user's attendees are in this table
        const matchingMembers = tableMembers.filter((member: any) =>
          member.registrationId === targetRegistrationId
        );

        if (matchingMembers.length > 0) {
          userTables.push({
            tableId: table.tableId,
            tableGroupName: table.tableGroupName || '',
            hostCompanyName: table.hostCompanyName || '',
            assignedTableNumber: table.assignedTableNumber,
            members: matchingMembers.map((m: any) => ({
              name: m.name,
              attendeeIndex: m.attendeeIndex,
            })),
          });
        }
      });

      partyTableData = userTables;
    }

    // Return comprehensive summary
    return NextResponse.json({
      event: {
        eventId: eventData?.eventId || eventId,
        eventName: eventData?.eventName || '',
        eventNameEN: eventData?.eventNameEN || '',
      },
      registration: {
        registrationId: registration.registrationId,
        companyName: registration.companyName || '',
        contactName: registration.contactName || '',
        lineDisplayName,
        attendeeNames: attendeeNamesList,
      },
      carpools: carpoolData,
      rooms: roomData,
      partyTables: partyTableData,
      settings: {
        showCarNumbers: eventData?.carpoolSettings?.showCarNumbersToMembers || false,
        showRoomNumbers: eventData?.roomSettings?.showRoomNumbersToMembers || false,
        showTableNumbers: eventData?.partyTableSettings?.showTableNumbersToMembers || false,
      },
    });
  } catch (error) {
    console.error('Error fetching event summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch event summary', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
