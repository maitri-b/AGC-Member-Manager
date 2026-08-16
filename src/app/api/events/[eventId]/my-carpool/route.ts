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
    // Use effective session to support impersonation
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    // Get member's LINE user ID (from effective session)
    const lineUserId = session.user.lineUserId;

    if (!lineUserId) {
      return NextResponse.json({ error: 'LINE user ID not found' }, { status: 400 });
    }

    // Get ALL carpools where member has team members
    const carpools = await getAllMemberCarpools(lineUserId, eventId);

    if (carpools.length === 0) {
      return NextResponse.json({ carpools: [] });
    }

    // Enrich Carpools with owner registration data and member company names
    const { attendees } = await getEventAttendanceSummary(eventId);

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
