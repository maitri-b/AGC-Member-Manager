// API Route: Search Carpool by Registration ID
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getCarpoolByRegistrationId } from '@/lib/carpools';
import { getEventAttendanceSummary } from '@/lib/event-sheets';

/**
 * GET /api/events/[eventId]/carpools/search?registrationId=XXX
 * Search for a Carpool by the owner's registration ID
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
    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');

    console.log('[Carpool Search API] eventId:', eventId);
    console.log('[Carpool Search API] registrationId:', registrationId);

    if (!registrationId) {
      return NextResponse.json({ error: 'Registration ID is required' }, { status: 400 });
    }

    // Search for carpool by registration ID
    const carpool = await getCarpoolByRegistrationId(registrationId, eventId);
    console.log('[Carpool Search API] Found carpool:', carpool ? 'YES' : 'NO');
    if (carpool) {
      console.log('[Carpool Search API] Carpool details:', {
        carpoolId: carpool.carpoolId,
        ownerRegistrationId: carpool.ownerRegistrationId,
        licensePlate: carpool.licensePlate,
        memberCount: carpool.members?.length || 0,
        status: carpool.status
      });
    }

    if (!carpool) {
      return NextResponse.json({ carpool: null });
    }

    // Enrich with owner registration data
    const { attendees } = await getEventAttendanceSummary(eventId);
    const ownerReg = attendees.find(a => a.registration.registrationId === carpool.ownerRegistrationId);

    const enrichedCarpool = {
      ...carpool,
      ownerCompanyName: ownerReg?.registration.companyName || '',
      ownerContactName: ownerReg?.registration.contactName || '',
    };

    return NextResponse.json({ carpool: enrichedCarpool });
  } catch (error) {
    console.error('Error searching carpool:', error);
    return NextResponse.json(
      { error: 'Failed to search carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
