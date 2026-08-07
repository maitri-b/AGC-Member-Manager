// API Route: Get Member's Carpool for an Event
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getMemberCarpool } from '@/lib/carpools';
import { getEventAttendanceSummary } from '@/lib/event-sheets';

/**
 * GET /api/events/[eventId]/my-carpool
 * Get the authenticated member's Carpool for this event
 */
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

    // Get member's LINE user ID
    const lineUserId = session.user.lineUserId;

    if (!lineUserId) {
      return NextResponse.json({ error: 'LINE user ID not found' }, { status: 400 });
    }

    // Get member's Carpool
    const carpool = await getMemberCarpool(lineUserId, eventId);

    if (!carpool) {
      return NextResponse.json({ carpool: null });
    }

    // Enrich Carpool with owner registration data
    const { attendees } = await getEventAttendanceSummary(eventId);
    const ownerReg = attendees.find(a => a.registration.registrationId === carpool.ownerRegistrationId);

    const enrichedCarpool = {
      ...carpool,
      ownerCompanyName: ownerReg?.registration.companyName || '',
      ownerContactName: ownerReg?.registration.contactName || '',
    };

    return NextResponse.json({ carpool: enrichedCarpool });
  } catch (error) {
    console.error('Error fetching member carpool:', error);
    return NextResponse.json(
      { error: 'Failed to fetch carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
