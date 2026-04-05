// API Route for Events - List all events and their attendance summary
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getTrackedEvents, getEventAttendanceSummary } from '@/lib/event-sheets';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow members to view events (for their own attendance)
    // Committee and admin can see full details
    const isCommitteeOrAdmin = hasPermission(session.user.permissions || [], 'members:list') ||
                               hasPermission(session.user.permissions || [], 'admin:access');

    const events = await getTrackedEvents();

    if (!isCommitteeOrAdmin) {
      // For regular members, return basic event info only
      return NextResponse.json({
        events: events.map(e => ({
          eventId: e.eventId,
          eventName: e.eventName,
          eventNameEN: e.eventNameEN,
          eventDate: e.eventDate,
          location: e.location,
          description: e.description,
          year: e.year,
          isActive: e.isActive,
        })),
      });
    }

    // For committee/admin, include attendance summaries
    const eventsWithSummary = await Promise.all(
      events.map(async (event) => {
        const summary = await getEventAttendanceSummary(event.eventId);
        return {
          ...event,
          totalRegistrations: summary.totalRegistrations,
          agentRegistrations: summary.agentRegistrations,
          confirmedCount: summary.confirmedCount,
        };
      })
    );

    return NextResponse.json({ events: eventsWithSummary });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
