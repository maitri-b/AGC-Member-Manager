// Debug API Route to check event configuration
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const db = adminDb();
    const eventsSnapshot = await db.collection('events').get();

    if (eventsSnapshot.empty) {
      return NextResponse.json({ message: 'No events found' });
    }

    const events = eventsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        eventId: doc.id,
        eventName: data.eventName,
        eventNameEN: data.eventNameEN,
        useAttendeeTypePricing: data.useAttendeeTypePricing,
        attendeeTypes: data.attendeeTypes,
        roomTypes: data.roomTypes,
        registrationOpen: data.registrationOpen,
        isPublished: data.isPublished,
      };
    });

    return NextResponse.json({
      count: events.length,
      events
    }, {
      headers: {
        'Content-Type': 'application/json',
      }
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
