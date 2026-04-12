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
    let debugInfo: Record<string, unknown> = {};

    if (eventData?.sheetName) {
      try {
        const registrations = await getEventRegistrations(eventData.sheetName);

        // DEBUG: Collect information for debugging
        debugInfo = {
          currentUser: {
            lineUserId: session.user.id,
            memberId: session.user.memberId,
          },
          totalRegistrations: registrations.length,
          registrationsWithLineUserId: registrations.filter(r => r.lineUserId).length,
          registrationsWithMemberId: registrations.filter(r => r.memberId).length,
          sampleRegistrations: registrations.slice(0, 3).map(r => ({
            registrationId: r.registrationId,
            lineUserId: r.lineUserId,
            memberId: r.memberId,
            contactName: r.contactName,
            companyName: r.companyName,
          })),
        };

        // Calculate summary
        summary.totalRegistrations = registrations.length;
        summary.totalAttendees = registrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);

        // Check if current user has registered (by LINE user ID or member ID)
        if (session.user.id || session.user.memberId) {
          const userReg = registrations.find(r => {
            return (
              (session.user.id && r.lineUserId === session.user.id) ||
              (session.user.memberId && r.memberId === session.user.memberId)
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
            debugInfo.userRegistrationFound = true;
          } else {
            debugInfo.userRegistrationFound = false;
          }
        }
      } catch (err) {
        console.error('Error fetching registrations:', err);
        debugInfo.error = err instanceof Error ? err.message : 'Unknown error';
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
      // DEBUG: Include debug info in response (temporary for debugging)
      debug: Object.keys(debugInfo).length > 0 ? debugInfo : undefined,
    });
  } catch (error) {
    console.error('Error fetching event detail:', error);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}
