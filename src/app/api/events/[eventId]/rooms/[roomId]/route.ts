// API Route: PUT/DELETE /api/events/[eventId]/rooms/[roomId]
// Update or delete a specific event room
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';
import { EventRoomInput } from '@/types/event';

export async function PUT(
  request: NextRequest,
  { params }: { params: { eventId: string; roomId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'events:manage-assigned')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { eventId, roomId } = params;
    const body: EventRoomInput = await request.json();

    // Validate input
    if (!body.buildingName || !body.roomNumber || !body.maxOccupancy) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (body.maxOccupancy < 1) {
      return NextResponse.json(
        { error: 'maxOccupancy must be at least 1' },
        { status: 400 }
      );
    }

    // Check if room exists
    const roomRef = adminDb().collection('eventRooms').doc(roomId);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists || roomDoc.data()?.eventId !== eventId) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Check if new building+room combination already exists (excluding current room)
    const existingRoomSnapshot = await adminDb()
      .collection('eventRooms')
      .where('eventId', '==', eventId)
      .where('buildingName', '==', body.buildingName)
      .where('roomNumber', '==', body.roomNumber)
      .get();

    const duplicateRoom = existingRoomSnapshot.docs.find(doc => doc.id !== roomId);
    if (duplicateRoom) {
      return NextResponse.json(
        { error: 'Room already exists in this building' },
        { status: 409 }
      );
    }

    // Update room
    const updateData = {
      buildingName: body.buildingName,
      roomNumber: body.roomNumber,
      maxOccupancy: body.maxOccupancy,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };

    await roomRef.update(updateData);

    const updatedDoc = await roomRef.get();
    const room = {
      roomId: updatedDoc.id,
      ...updatedDoc.data(),
      createdAt: updatedDoc.data()?.createdAt?.toDate?.()?.toISOString() || updatedDoc.data()?.createdAt,
      updatedAt: updatedDoc.data()?.updatedAt?.toDate?.()?.toISOString() || updatedDoc.data()?.updatedAt,
    };

    return NextResponse.json({ room });
  } catch (error) {
    console.error('Error updating event room:', error);
    return NextResponse.json(
      { error: 'Failed to update event room' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string; roomId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'events:manage-assigned')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { eventId, roomId } = params;

    // Check if room exists
    const roomRef = adminDb().collection('eventRooms').doc(roomId);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists || roomDoc.data()?.eventId !== eventId) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Check if room has any assignments
    const registrationsSnapshot = await adminDb()
      .collection('registrations')
      .where('eventId', '==', eventId)
      .get();

    let hasAssignments = false;
    for (const doc of registrationsSnapshot.docs) {
      const data = doc.data();
      if (data.roomAssignments) {
        try {
          const assignments = JSON.parse(data.roomAssignments);
          if (Array.isArray(assignments)) {
            const hasThisRoom = assignments.some((a: any) => a.roomId === roomId);
            if (hasThisRoom) {
              hasAssignments = true;
              break;
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    if (hasAssignments) {
      return NextResponse.json(
        { error: 'Cannot delete room with existing assignments. Please remove all occupants first.' },
        { status: 409 }
      );
    }

    // Delete room
    await roomRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting event room:', error);
    return NextResponse.json(
      { error: 'Failed to delete event room' },
      { status: 500 }
    );
  }
}
