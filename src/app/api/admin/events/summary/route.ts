// API Route for Admin - Get events summary (participant counts)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getTrackedEventsFromFirestore, getEventAttendanceSummary } from '@/lib/event-sheets';
import { adminDb } from '@/lib/firebase-admin';

interface EventSummary {
  eventId: string;
  totalRegistrations: number;
  agentRegistrations: number;
  confirmedCount: number;
  verifiedMemberCount: number;
}

// GET - Get summary for all events
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

    const events = await getTrackedEventsFromFirestore();

    // Get LINE profiles from users collection for verified member count
    const db = adminDb();
    const usersSnapshot = await db.collection('users').get();
    const lineProfilesMap = new Map<string, boolean>();
    usersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.memberId) {
        lineProfilesMap.set(data.memberId, true);
      }
    });

    // Get summary for each event
    const summaries: EventSummary[] = [];

    for (const event of events) {
      try {
        const summary = await getEventAttendanceSummary(event.eventId);

        // Count verified members (attendees with LINE profile)
        let verifiedMemberCount = 0;
        for (const attendee of summary.attendees) {
          if (attendee.member?.memberId && lineProfilesMap.has(attendee.member.memberId)) {
            verifiedMemberCount++;
          }
        }

        summaries.push({
          eventId: event.eventId,
          totalRegistrations: summary.totalRegistrations,
          agentRegistrations: summary.agentRegistrations,
          confirmedCount: summary.confirmedCount,
          verifiedMemberCount,
        });
      } catch (error) {
        console.error(`Error fetching summary for event ${event.eventId}:`, error);
        summaries.push({
          eventId: event.eventId,
          totalRegistrations: 0,
          agentRegistrations: 0,
          confirmedCount: 0,
          verifiedMemberCount: 0,
        });
      }
    }

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error('Error fetching events summary:', error);
    return NextResponse.json({ error: 'Failed to fetch events summary' }, { status: 500 });
  }
}
