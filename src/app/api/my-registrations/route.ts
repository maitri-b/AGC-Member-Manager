// API Route to get user's event registrations
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = adminDb();
    const userId = session.user.id;

    // Get all registrations for this user
    const registrationsSnapshot = await db
      .collection('eventRegistrations')
      .where('lineUserId', '==', userId)
      .get();

    if (registrationsSnapshot.empty) {
      return NextResponse.json({ registrations: [] });
    }

    // Get unique event IDs
    const eventIds = Array.from(
      new Set(registrationsSnapshot.docs.map((doc) => doc.data().eventId))
    );

    // Fetch event details for all events
    const eventsPromises = eventIds.map((eventId) =>
      db.collection('events').doc(eventId).get()
    );
    const eventsSnapshots = await Promise.all(eventsPromises);

    // Create a map of event data
    const eventsMap: Record<string, any> = {};
    eventsSnapshots.forEach((snapshot) => {
      if (snapshot.exists) {
        eventsMap[snapshot.id] = snapshot.data();
      }
    });

    // Combine registration and event data
    const registrations = registrationsSnapshot.docs
      .map((doc) => {
        const regData = doc.data();
        const eventData = eventsMap[regData.eventId];

        if (!eventData) return null;

        return {
          eventId: regData.eventId,
          eventName: eventData.eventName || '',
          eventNameEN: eventData.eventNameEN || '',
          eventDate: eventData.eventDate || '',
          coverImageUrl: eventData.coverImageUrl || eventData.imageUrl || null,
          registrationId: regData.registrationId || doc.id,
          registrationDate: regData.registrationDate || regData.createdAt || '',
          attendeeCount: regData.attendeeCount || 1,
          totalAmount: regData.totalAmount || 0,
          paymentStatus: regData.paymentStatus || 'รอชำระเงิน',
          status: regData.status || 'รอยืนยัน',
        };
      })
      .filter((reg) => reg !== null);

    // Sort by registration date (newest first)
    registrations.sort((a: any, b: any) => {
      const dateA = new Date(a.registrationDate || 0).getTime();
      const dateB = new Date(b.registrationDate || 0).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({
      success: true,
      registrations,
    });
  } catch (error) {
    console.error('[My Registrations] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
