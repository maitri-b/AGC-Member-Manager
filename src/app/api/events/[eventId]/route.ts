// API Route for Event Detail - Get event attendees with LINE profiles
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission, canManageEvent } from '@/lib/permissions';
import { getEventAttendanceSummary, getEventById } from '@/lib/event-sheets';
import { adminDb } from '@/lib/firebase-admin';
// Removed caching for admin view - admin always gets real-time data

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

    // Check permissions: either has members:list OR can manage assigned event
    const hasFullAccess = hasPermission(session.user.permissions || [], 'members:list');
    const canManageAssigned = hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!hasFullAccess && !canManageAssigned) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Verify assignment for event-staff/event-co
    if (!hasFullAccess && canManageAssigned) {
      const userRole = session.user.role;
      const assignedEventIds = session.user.assignedEventIds || [];

      if (!canManageEvent(userRole, assignedEventIds, eventId)) {
        return NextResponse.json({ error: 'Not assigned to this event' }, { status: 403 });
      }
    }

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Admin view - always fetch real-time data (no caching)
    const event = await getEventById(eventId);

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get attendance summary - always real-time for admin
    const summary = await getEventAttendanceSummary(eventId);

    // Get LINE profiles from users collection
    const db = adminDb();
    const usersSnapshot = await db.collection('users').get();

    // Build maps for LINE profiles by memberId and by lineUserId
    const lineProfilesByMemberId = new Map<string, { lineDisplayName: string; lineProfilePicture: string; role: string }>();
    const lineProfilesByLineUserId = new Map<string, { lineDisplayName: string; lineProfilePicture: string; role: string }>();

    usersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const profileData = {
        lineDisplayName: data.lineDisplayName || data.name || '',
        lineProfilePicture: data.lineProfilePicture || data.image || '',
        role: data.role || 'guest',
      };

      // Map by memberId if available
      if (data.memberId) {
        lineProfilesByMemberId.set(data.memberId, profileData);
      }

      // Also map by LINE user ID for non-members
      if (data.lineUserId || doc.id) {
        lineProfilesByLineUserId.set(data.lineUserId || doc.id, profileData);
      }
    });

    // Enrich attendees with LINE profile data and count verified members
    let verifiedMemberCount = 0;
    let clubMemberCount = 0;

    const attendeesWithProfile = summary.attendees.map(attendee => {
      // Try to get LINE profile by memberId first, then by lineUserId
      let lineProfile = attendee.member?.memberId
        ? lineProfilesByMemberId.get(attendee.member.memberId)
        : null;

      // If no profile found via memberId, try lineUserId
      if (!lineProfile && attendee.registration.lineUserId) {
        lineProfile = lineProfilesByLineUserId.get(attendee.registration.lineUserId);
      }

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
          registrationDate: String(attendee.registration.registrationDate || ''),
          companyName: String(attendee.registration.companyName || ''),
          contactName: String(attendee.registration.contactName || ''),
          licenseNumber: String(attendee.registration.licenseNumber || ''),
          lineUserId: String(attendee.registration.lineUserId || ''),
          attendeeCount: Number(attendee.registration.attendeeCount) || 0,
          attendeeNames: String(attendee.registration.attendeeNames || ''),
          status: status,
          checkinSections: String(attendee.registration.checkinSections || ''),
          tableNumber: String(attendee.registration.tableNumber || ''),
          // Contact information
          contactPhone: String(attendee.registration.contactPhone || ''),
          contactEmail: String(attendee.registration.contactEmail || ''),
          // Deposit payment fields (New)
          totalAmount: Number(attendee.registration.totalAmount) || 0,
          depositAmount: Number(attendee.registration.depositAmount) || 0,
          remainingAmount: Number(attendee.registration.remainingAmount) || 0,
          depositPaid: Boolean(attendee.registration.depositPaid),
          depositPaidDate: String(attendee.registration.depositPaidDate || ''),
          // Legacy slip URLs - kept during migration, use GET /api/payments?registrationId=xxx for new data
          depositSlipUrl: String(attendee.registration.depositSlipUrl || ''),
          remainingSlipUrl: String(attendee.registration.remainingSlipUrl || ''),
          depositDeadline: String(attendee.registration.depositDeadline || ''),
          remainingDeadline: String(attendee.registration.remainingDeadline || ''),
          paymentStatus: String(attendee.registration.paymentStatus || status),
          // Attendee type pricing and room allocation
          attendeeTypeSelections: String(attendee.registration.attendeeTypeSelections || ''),
          roomAllocations: String(attendee.registration.roomAllocations || ''),
          // Special charges
          specialCharges: String(attendee.registration.specialCharges || ''),
          // Special requests
          specialRequests: String(attendee.registration.specialRequests || ''),
        },
        member: attendee.member,
        lineProfile: lineProfile ? {
          lineDisplayName: lineProfile.lineDisplayName,
          lineProfilePicture: lineProfile.lineProfilePicture,
          role: lineProfile.role,
        } : null,
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
        // Event pricing configuration
        pricingType: event.pricingType || 'fixed',
        priceTiers: event.priceTiers || undefined,
        baseFee: event.baseFee,
        additionalFeePerPerson: event.additionalFeePerPerson,
        memberDiscount: event.memberDiscount,
        // Event configuration for attendee types and room allocation
        useAttendeeTypePricing: event.useAttendeeTypePricing || false,
        attendeeTypes: event.attendeeTypes || [],
        roomTypes: event.roomTypes || [],
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
