// API Route: GET /api/events/[eventId]/summary/rooms
// Public endpoint for members to see room data (building + room number only)
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { EventRoom } from '@/types/event';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Fetch rooms for this event
    const roomsSnapshot = await adminDb()
      .collection('eventRooms')
      .where('eventId', '==', eventId)
      .get();

    const rooms: Partial<EventRoom>[] = roomsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        roomId: doc.id,
        buildingName: data.buildingName,
        roomNumber: data.roomNumber,
      };
    });

    // Sort by building and room number
    rooms.sort((a, b) => {
      if (a.buildingName !== b.buildingName) {
        return (a.buildingName || '').localeCompare(b.buildingName || '');
      }
      return (a.roomNumber || '').localeCompare(b.roomNumber || '');
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('Error fetching event rooms for summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch event rooms' },
      { status: 500 }
    );
  }
}
