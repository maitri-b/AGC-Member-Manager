// API Route: GET/POST /api/events/[eventId]/rooms
// Manage event rooms (hotel rooms for accommodation)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';
import { EventRoom, EventRoomInput } from '@/types/event';

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - event staff or admin can view
    if (!hasPermission(session.user.permissions || [], 'events:manage-assigned')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const eventId = params.eventId;

    // Fetch rooms for this event
    const roomsSnapshot = await adminDb()
      .collection('eventRooms')
      .where('eventId', '==', eventId)
      .get();

    const rooms: EventRoom[] = roomsSnapshot.docs.map(doc => ({
      roomId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt,
    } as EventRoom));

    // Sort by building and room number
    rooms.sort((a, b) => {
      if (a.buildingName !== b.buildingName) {
        return a.buildingName.localeCompare(b.buildingName);
      }
      return a.roomNumber.localeCompare(b.roomNumber);
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('Error fetching event rooms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch event rooms' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - event staff or admin can create
    if (!hasPermission(session.user.permissions || [], 'events:manage-assigned')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const eventId = params.eventId;
    const body: EventRoomInput = await request.json();

    // Validate input
    if (!body.buildingName || !body.roomNumber || !body.maxOccupancy) {
      return NextResponse.json(
        { error: 'Missing required fields: buildingName, roomNumber, maxOccupancy' },
        { status: 400 }
      );
    }

    if (body.maxOccupancy < 1) {
      return NextResponse.json(
        { error: 'maxOccupancy must be at least 1' },
        { status: 400 }
      );
    }

    // Check if room already exists (same building + room number)
    const existingRoomSnapshot = await adminDb()
      .collection('eventRooms')
      .where('eventId', '==', eventId)
      .where('buildingName', '==', body.buildingName)
      .where('roomNumber', '==', body.roomNumber)
      .get();

    if (!existingRoomSnapshot.empty) {
      return NextResponse.json(
        { error: 'Room already exists in this building' },
        { status: 409 }
      );
    }

    // Create room
    const now = new Date().toISOString();
    const roomData: Omit<EventRoom, 'roomId'> = {
      eventId,
      buildingName: body.buildingName,
      roomNumber: body.roomNumber,
      roomTypeCategory: body.roomTypeCategory,
      maxOccupancy: body.maxOccupancy,
      isLocked: body.isLocked || false,
      note: body.note || '',
      createdAt: now,
      createdBy: session.user.id,
    };

    const roomRef = await adminDb()
      .collection('eventRooms')
      .add(roomData);

    const room: EventRoom = {
      roomId: roomRef.id,
      ...roomData,
    };

    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    console.error('Error creating event room:', error);
    return NextResponse.json(
      { error: 'Failed to create event room' },
      { status: 500 }
    );
  }
}
