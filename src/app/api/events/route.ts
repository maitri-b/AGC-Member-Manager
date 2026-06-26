// API Route for Events - List all events and their attendance summary
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getTrackedEvents, getEventAttendanceSummary, getEventRegistrations } from '@/lib/event-sheets';
import { EventRegistration } from '@/types/event';

// Helper function to check if registration is cancelled
function isRegistrationCancelled(registration: EventRegistration): boolean {
  const status = registration.status || '';
  const statusLower = status.toLowerCase();
  return statusLower === 'cancelled' || status.includes('ยกเลิก');
}

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

    // Filter to only published events for regular members
    const publishedEvents = isCommitteeOrAdmin ? events : events.filter(e => e.isPublished);

    if (!isCommitteeOrAdmin) {
      // For regular members, return basic event info with registration status
      const eventsWithRegistrationInfo = await Promise.all(
        publishedEvents.map(async (e) => {
          let totalAttendees = 0;
          let userRegistered = false;

          if (e.sheetName) {
            try {
              // Get registrations to check if user has registered
              const registrations = await getEventRegistrations(e.sheetName);

              // Filter out cancelled registrations
              const activeRegistrations = registrations.filter(r => !isRegistrationCancelled(r));

              // Check if current user has registered (and not cancelled)
              if (session.user.id || session.user.memberId) {
                const userReg = activeRegistrations.find(r => {
                  return (
                    (session.user.id && r.lineUserId === session.user.id) ||
                    (session.user.memberId && r.memberId === session.user.memberId)
                  );
                });
                userRegistered = !!userReg;
              }

              // Calculate total attendees (excluding cancelled)
              totalAttendees = activeRegistrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);
            } catch (err) {
              console.error(`Error fetching registrations for ${e.eventId}:`, err);
              // Ignore errors
            }
          }

          return {
            eventId: e.eventId,
            eventName: e.eventName,
            eventNameEN: e.eventNameEN,
            eventDate: e.eventDate,
            location: e.location,
            description: e.description,
            year: e.year,
            isActive: e.isActive,
            isPublished: e.isPublished,
            countsAttendance: e.countsAttendance,
            maxCapacity: e.maxCapacity,
            maxPerCompany: e.maxPerCompany,
            registrationFee: e.registrationFee,
            pricingType: e.pricingType,
            baseFee: e.baseFee,
            additionalFeePerPerson: e.additionalFeePerPerson,
            memberDiscount: e.memberDiscount,
            registrationOpen: e.registrationOpen,
            documentName: e.documentName,
            documentUrl: e.documentUrl,
            mainImageUrl: e.mainImageUrl,
            paymentBankName: e.paymentBankName,
            paymentAccountName: e.paymentAccountName,
            paymentAccountNumber: e.paymentAccountNumber,
            paymentQrCodeUrl: e.paymentQrCodeUrl,
            paymentTerms: e.paymentTerms,
            paymentSlipSubmissionUrl: e.paymentSlipSubmissionUrl,
            // Deposit payment configuration
            paymentMode: e.paymentMode,
            depositAmount: e.depositAmount,
            depositPercentage: e.depositPercentage,
            useDepositPercentage: e.useDepositPercentage,
            depositDeadlineType: e.depositDeadlineType,
            depositDeadlineFixed: e.depositDeadlineFixed,
            depositDeadlineHours: e.depositDeadlineHours,
            remainingDeadlineType: e.remainingDeadlineType,
            remainingDeadlineFixed: e.remainingDeadlineFixed,
            remainingDeadlineHours: e.remainingDeadlineHours,
            // Registration edit control
            allowMemberEdit: e.allowMemberEdit,
            // Attendee type pricing (NEW)
            useAttendeeTypePricing: e.useAttendeeTypePricing,
            attendeeTypes: e.attendeeTypes,
            // Room allocation (NEW)
            roomTypes: e.roomTypes,
            totalAttendees,
            userRegistered,
          };
        })
      );
      return NextResponse.json({ events: eventsWithRegistrationInfo });
    }

    // For committee/admin, include attendance summaries
    const eventsWithSummary = await Promise.all(
      publishedEvents.map(async (event) => {
        const summary = await getEventAttendanceSummary(event.eventId);

        // Check if current user has registered (for admin/committee too)
        let userRegistered = false;
        if (event.sheetName && (session.user.id || session.user.memberId)) {
          try {
            const registrations = await getEventRegistrations(event.sheetName);
            // Filter out cancelled registrations
            const activeRegistrations = registrations.filter(r => !isRegistrationCancelled(r));
            const userReg = activeRegistrations.find(r => {
              return (
                (session.user.id && r.lineUserId === session.user.id) ||
                (session.user.memberId && r.memberId === session.user.memberId)
              );
            });
            userRegistered = !!userReg;
          } catch (err) {
            console.error(`Error checking user registration for ${event.eventId}:`, err);
          }
        }

        return {
          ...event,
          totalRegistrations: summary.totalRegistrations,
          agentRegistrations: summary.agentRegistrations,
          confirmedCount: summary.confirmedCount,
          totalAttendees: summary.totalAttendees,
          userRegistered,
        };
      })
    );

    return NextResponse.json({ events: eventsWithSummary });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}
