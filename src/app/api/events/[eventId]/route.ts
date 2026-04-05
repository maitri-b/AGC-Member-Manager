// API Route for Event Detail - Get event attendees with LINE profiles
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getEventAttendanceSummary, getEventById } from '@/lib/event-sheets';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require members:list permission to view event attendees
    if (!hasPermission(session.user.permissions || [], 'members:list')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { eventId } = await params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const event = await getEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const summary = await getEventAttendanceSummary(eventId);

    // Get LINE profiles from users collection
    const db = adminDb();
    const usersSnapshot = await db.collection('users').get();

    // Build a map of memberId -> LINE profile
    const lineProfilesMap = new Map<string, { lineDisplayName: string; lineProfilePicture: string }>();
    usersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.memberId) {
        lineProfilesMap.set(data.memberId, {
          lineDisplayName: data.lineDisplayName || data.name || '',
          lineProfilePicture: data.lineProfilePicture || data.image || '',
        });
      }
    });

    // Enrich attendees with LINE profile data
    const attendeesWithProfile = summary.attendees.map(attendee => {
      const lineProfile = attendee.member?.memberId
        ? lineProfilesMap.get(attendee.member.memberId)
        : null;

      // Check status for confirmed
      const status = attendee.registration.status || '';
      const statusLower = status.toLowerCase();
      const isConfirmed =
        statusLower === 'confirmed' ||
        statusLower === 'attended' ||
        status.includes('ยืนยัน') ||
        status.includes('ตรวจสอบแล้ว');

      return {
        registration: {
          registrationId: attendee.registration.registrationId,
          companyName: attendee.registration.companyName,
          contactName: attendee.registration.contactName,
          licenseNumber: attendee.registration.licenseNumber,
          attendeeCount: attendee.registration.attendeeCount,
          attendeeNames: attendee.registration.attendeeNames,
          status: attendee.registration.status,
          checkinSections: attendee.registration.checkinSections,
          tableNumber: attendee.registration.tableNumber,
        },
        member: attendee.member,
        lineProfile: lineProfile || null,
        isConfirmed,
      };
    });

    return NextResponse.json({
      event: {
        eventId: event.eventId,
        eventName: event.eventName,
        eventNameEN: event.eventNameEN,
        eventDate: event.eventDate,
        location: event.location,
        description: event.description,
        year: event.year,
      },
      summary: {
        totalRegistrations: summary.totalRegistrations,
        agentRegistrations: summary.agentRegistrations,
        confirmedCount: summary.confirmedCount,
      },
      attendees: attendeesWithProfile,
    });
  } catch (error) {
    console.error('Error fetching event details:', error);
    return NextResponse.json({ error: 'Failed to fetch event details' }, { status: 500 });
  }
}
