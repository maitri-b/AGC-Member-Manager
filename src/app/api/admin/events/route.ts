// API Route for Admin - Events Management (CRUD)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { Event, EventInput, DEFAULT_EVENTS } from '@/types/event';

// GET - List all events
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();
    const eventsSnapshot = await db.collection('events').orderBy('year', 'desc').get();

    // If no events in Firestore, migrate default events
    if (eventsSnapshot.empty) {
      const batch = db.batch();
      for (const event of DEFAULT_EVENTS) {
        const eventRef = db.collection('events').doc(event.eventId);
        batch.set(eventRef, {
          ...event,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: session.user.id,
        });
      }
      await batch.commit();

      return NextResponse.json({ events: DEFAULT_EVENTS, migrated: true });
    }

    const events = eventsSnapshot.docs.map(doc => ({
      eventId: doc.id,
      ...doc.data(),
    })) as Event[];

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

// POST - Create new event
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body: EventInput = await request.json();

    // Validate required fields
    if (!body.eventName || !body.sheetName || !body.year) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = adminDb();

    // Generate eventId from name and year
    const eventId = `${body.eventName.toLowerCase().replace(/\s+/g, '-')}-${body.year - 543}`;

    // Check if event already exists
    const existingEvent = await db.collection('events').doc(eventId).get();
    if (existingEvent.exists) {
      return NextResponse.json({ error: 'Event with this ID already exists' }, { status: 409 });
    }

    const newEvent: Event = {
      eventId,
      eventName: body.eventName,
      eventNameEN: body.eventNameEN || '',
      eventDate: body.eventDate || String(body.year - 543),
      location: body.location || '',
      description: body.description || '',
      sheetName: body.sheetName,
      year: body.year,
      isActive: body.isActive ?? true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: session.user.id,
    };

    await db.collection('events').doc(eventId).set(newEvent);

    return NextResponse.json({ success: true, event: newEvent }, { status: 201 });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}

// PUT - Update event
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { eventId, ...updates } = body;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };

    await eventRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

// DELETE - Delete event
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    await eventRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
