// API Route: Get Member's Carpools for an Event
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { getAllMemberCarpools } from '@/lib/carpools';
import { getEventAttendanceSummary } from '@/lib/events';

/**
 * GET /api/events/[eventId]/my-carpool
 * Get all carpools where the authenticated member has team members participating
 * Supports impersonation - returns carpools for the effective user (impersonated user if applicable)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    console.log('[my-carpool] API called');

    // Use effective session to support impersonation
    const session = await getEffectiveSession();
    console.log('[my-carpool] Session:', { hasUser: !!session?.user, lineUserId: session?.user?.lineUserId });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;
    console.log('[my-carpool] EventId:', eventId);

    // Get member's LINE user ID (from effective session)
    const lineUserId = session.user.lineUserId;

    if (!lineUserId) {
      return NextResponse.json({ error: 'LINE user ID not found' }, { status: 400 });
    }

    // Get ALL carpools where member has team members
    console.log('[my-carpool] Fetching carpools for lineUserId:', lineUserId);
    const carpools = await getAllMemberCarpools(lineUserId, eventId);
    console.log('[my-carpool] Found carpools:', carpools.length);

    if (carpools.length === 0) {
      console.log('[my-carpool] No carpools found, returning empty array');
      return NextResponse.json({ carpools: [] });
    }

    // Enrich Carpools with owner registration data and member company names
    console.log('[my-carpool] Fetching event attendance summary...');
    let attendees: any[] = [];
    try {
      const result = await getEventAttendanceSummary(eventId);
      attendees = result.attendees;
      console.log('[my-carpool] Found attendees:', attendees.length);
    } catch (error) {
      console.error('[my-carpool] Error fetching attendance summary:', error);
      // If quota exceeded or other error, continue without enrichment
      console.log('[my-carpool] Continuing without company name enrichment due to error');
    }

    console.log('[my-carpool] Enriching carpools...');
    const enrichedCarpools = carpools.map(carpool => {
      const ownerReg = attendees.find(a => a.registration.registrationId === carpool.ownerRegistrationId);

      // Enrich each member with their company name
      const enrichedMembers = carpool.members?.map(member => {
        const memberReg = attendees.find(a => a.registration.registrationId === member.registrationId);
        return {
          ...member,
          companyName: memberReg?.registration.companyName || '',
        };
      }) || [];

      return {
        carpoolId: carpool.carpoolId,
        eventId: carpool.eventId,
        ownerRegistrationId: carpool.ownerRegistrationId,
        licensePlate: carpool.licensePlate,
        status: carpool.status,
        createdAt: carpool.createdAt,
        updatedAt: carpool.updatedAt,
        assignedCarNumber: carpool.assignedCarNumber, // CRITICAL: Include assigned car number
        ownerCompanyName: ownerReg?.registration.companyName || '',
        ownerContactName: ownerReg?.registration.contactName || '',
        members: enrichedMembers,
      };
    });

    return NextResponse.json({ carpools: enrichedCarpools });
  } catch (error) {
    console.error('Error fetching member carpools:', error);
    return NextResponse.json(
      { error: 'Failed to fetch carpools', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
