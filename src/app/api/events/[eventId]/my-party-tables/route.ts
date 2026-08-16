// API Route: Get Party Tables for current user in an event
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { getAllMemberTables } from '@/lib/partyTables';
import { adminDb } from '@/lib/firebase-admin';

/**
 * GET /api/events/[eventId]/my-party-tables
 * Get all party tables where the current user (or specified registration) has members
 *
 * Query params:
 * - registrationId (optional): Get tables for a specific registration instead of current user
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

    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Check if a specific registrationId is requested (for Join Table search)
    const { searchParams } = new URL(request.url);
    const queryRegistrationId = searchParams.get('registrationId');

    let registrationId: string;

    if (queryRegistrationId) {
      // If registrationId is provided, use it directly (for Join Table feature)
      registrationId = queryRegistrationId;
    } else {
      // Otherwise, get the current user's registration for this event
      const db = adminDb();
      const regSnapshot = await db
        .collection('eventRegistrations')
        .where('lineUserId', '==', session.user.lineUserId)  // Use lineUserId instead of id for impersonation support
        .where('eventId', '==', eventId)
        .limit(1)
        .get();

      if (regSnapshot.empty) {
        // User not registered for this event
        return NextResponse.json({ tables: [] });
      }

      const registration = regSnapshot.docs[0].data();
      registrationId = registration.registrationId;
    }

    // Get all tables where this registration has members
    const tables = await getAllMemberTables(registrationId, eventId);

    return NextResponse.json({ tables });
  } catch (error) {
    console.error('Error fetching user party tables:', error);
    return NextResponse.json(
      { error: 'Failed to fetch party tables', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
