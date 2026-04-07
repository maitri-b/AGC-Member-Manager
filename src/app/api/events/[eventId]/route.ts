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

    // Enrich attendees with LINE profile data and count verified members
    let verifiedMemberCount = 0;
    let clubMemberCount = 0;

    const attendeesWithProfile = summary.attendees.map(attendee => {
      const lineProfile = attendee.member?.memberId
        ? lineProfilesMap.get(attendee.member.memberId)
        : null;

      // Count club members (has member record = is in AGC_Membership)
      if (attendee.member?.memberId) {
        clubMemberCount++;
      }

      // Count verified members (has LINE profile = verified through the system)
      if (lineProfile) {
        verifiedMemberCount++;
      }

      // Check status for confirmed - ensure status is a string
      const rawStatus = attendee.registration.status;
      const status = typeof rawStatus === 'string' ? rawStatus : String(rawStatus || '');
      const statusLower = status.toLowerCase();
      const isConfirmed =
        statusLower === 'confirmed' ||
        statusLower === 'attended' ||
        status.includes('ยืนยัน') ||
        status.includes('ตรวจสอบแล้ว');

      return {
        registration: {
          registrationId: String(attendee.registration.registrationId || ''),
          companyName: String(attendee.registration.companyName || ''),
          contactName: String(attendee.registration.contactName || ''),
          licenseNumber: String(attendee.registration.licenseNumber || ''),
          attendeeCount: Number(attendee.registration.attendeeCount) || 0,
          attendeeNames: String(attendee.registration.attendeeNames || ''),
          status: status,
          checkinSections: String(attendee.registration.checkinSections || ''),
          tableNumber: String(attendee.registration.tableNumber || ''),
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
        agentRegistrations: summary.agentRegistrations, // Unique companies
        confirmedCount: summary.confirmedCount,         // Unique confirmed companies
        totalAttendees: summary.totalAttendees || 0,    // Total people (sum of attendeeCount)
        clubMemberCount, // Attendees who are AGC members
        verifiedMemberCount, // Members who verified identity through LINE
      },
      attendees: attendeesWithProfile,
    });
  } catch (error) {
    console.error('Error fetching event details:', error);
    return NextResponse.json({ error: 'Failed to fetch event details' }, { status: 500 });
  }
}
