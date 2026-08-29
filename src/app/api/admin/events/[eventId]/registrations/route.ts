// API Route: Get all registrations for an event (Admin only)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const { eventId } = await params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const db = adminDb();

    // Fetch all registrations for this event
    const registrationsSnapshot = await db
      .collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .get();

    if (registrationsSnapshot.empty) {
      return NextResponse.json({
        registrations: [],
        count: 0,
      });
    }

    // Get all unique LINE user IDs
    const lineUserIds = [...new Set(
      registrationsSnapshot.docs.map(doc => doc.data().lineUserId)
    )].filter(Boolean);

    // Fetch all users in parallel
    const usersMap = new Map<string, any>();
    if (lineUserIds.length > 0) {
      const userDocs = await Promise.all(
        lineUserIds.map(lineUserId =>
          db.collection('users').where('lineUserId', '==', lineUserId).limit(1).get()
        )
      );

      userDocs.forEach(snapshot => {
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data();
          usersMap.set(userData.lineUserId, userData);
        }
      });
    }

    // Map registrations with user data
    const registrations = registrationsSnapshot.docs.map(doc => {
      const registration = doc.data();
      const userData = usersMap.get(registration.lineUserId);

      return {
        registration,
        lineUserId: registration.lineUserId,
        lineDisplayName: userData?.lineDisplayName || userData?.displayName || '',
      };
    });

    return NextResponse.json({
      registrations,
      count: registrations.length,
    });

  } catch (error) {
    console.error('Error fetching event registrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch registrations', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
