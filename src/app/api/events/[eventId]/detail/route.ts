// API Route for Event Detail (Public for members)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrations } from '@/lib/event-sheets';
import { EventRegistration } from '@/types/event';

// Helper function to check if registration is cancelled
function isRegistrationCancelled(registration: EventRegistration): boolean {
  const status = registration.status || '';
  const statusLower = status.toLowerCase();
  return statusLower === 'cancelled' || status.includes('ยกเลิก');
}

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

        // Filter out cancelled registrations for summary
        const activeRegistrations = registrations.filter(r => !isRegistrationCancelled(r));

        // Calculate summary (excluding cancelled)
        summary.totalRegistrations = activeRegistrations.length;
        summary.totalAttendees = activeRegistrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);

        // Check if current user has registered (by LINE user ID or member ID)
        // Search ONLY in active registrations and get the LATEST one if multiple exist
        if (session.user.id || session.user.memberId) {
          const userRegs = activeRegistrations.filter(r => {
            return (
              (session.user.id && r.lineUserId === session.user.id) ||
              (session.user.memberId && r.memberId === session.user.memberId)
            );
          });

          // If user has multiple active registrations, use the latest one by registration date
          if (userRegs.length > 0) {
            const latestReg = userRegs.sort((a, b) => {
              const dateA = a.registrationDate || '';
              const dateB = b.registrationDate || '';
              return dateB > dateA ? 1 : -1; // descending order
            })[0];

            userRegistration = {
              registrationId: latestReg.registrationId,
              status: latestReg.status,
              attendeeCount: latestReg.attendeeCount,
              attendeeNames: latestReg.attendeeNames,
              registrationDate: latestReg.registrationDate,
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
