// API Route for Event Detail (Public for members)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrations } from '@/lib/event-sheets';

// GET - Get event detail for member view
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    const db = adminDb();
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    // Check if event is published (unless user is admin or committee)
    const isCommitteeOrAdmin = session.user.permissions?.includes('admin:access') ||
                               session.user.permissions?.includes('members:list');
    if (!isCommitteeOrAdmin && !eventData?.isPublished) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = {
      eventId: eventDoc.id,
      eventName: eventData?.eventName || '',
      eventNameEN: eventData?.eventNameEN || '',
      eventDate: eventData?.eventDate || '',
      location: eventData?.location || '',
      description: eventData?.description || '',
      year: eventData?.year || 0,
      isActive: eventData?.isActive ?? true,
      isPublished: eventData?.isPublished ?? false,
      countsAttendance: eventData?.countsAttendance ?? true,
      maxCapacity: eventData?.maxCapacity ?? 0,
      maxPerCompany: eventData?.maxPerCompany ?? 0,
      registrationFee: eventData?.registrationFee ?? 0,
      registrationOpen: eventData?.registrationOpen ?? false,
      documentName: eventData?.documentName || '',
      documentUrl: eventData?.documentUrl || '',
    };

    // Get registration summary
    let summary = {
      totalRegistrations: 0,
      totalAttendees: 0,
    };

    let userRegistration = null;

    if (eventData?.sheetName) {
      try {
        const registrations = await getEventRegistrations(eventData.sheetName);

        // Calculate summary
        summary.totalRegistrations = registrations.length;
        summary.totalAttendees = registrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);

        // Check if current user has registered (by LINE_userID or memberId)
        if (session.user.id || session.user.memberId) {
          const userReg = registrations.find(r => {
            const regData = r as unknown as Record<string, unknown>;
            return (
              (session.user.id && regData.lineUserId === session.user.id) ||
              (session.user.id && regData.LINE_userID === session.user.id) ||
              (session.user.memberId && regData.memberID === session.user.memberId) ||
              (session.user.memberId && regData.memberId === session.user.memberId)
            );
          });

          if (userReg) {
            userRegistration = {
              registrationId: userReg.registrationId,
              status: userReg.status,
              attendeeCount: userReg.attendeeCount,
              attendeeNames: userReg.attendeeNames,
              registrationDate: userReg.registrationDate,
            };
          }
        }
      } catch (err) {
        console.error('Error fetching registrations:', err);
        // Continue without registration data
      }
    }

    // Get member name for pre-filling registration form
    let memberName = '';
    if (session.user.memberId && !userRegistration) {
      try {
        const { getMemberById } = await import('@/lib/google-sheets');
        const member = await getMemberById(session.user.memberId);
        if (member) {
          memberName = member.fullNameTH || member.nickname || '';
        }
      } catch (err) {
        console.error('Error fetching member name:', err);
      }
    }

    return NextResponse.json({
      event,
      summary,
      userRegistration,
      memberName,
    });
  } catch (error) {
    console.error('Error fetching event detail:', error);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}
