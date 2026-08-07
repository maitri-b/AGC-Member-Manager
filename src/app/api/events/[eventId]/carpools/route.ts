// API Route: Get all Carpools for an Event
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolsByEvent } from '@/lib/carpools';
import { adminDb } from '@/lib/firebase-admin';

/**
 * GET /api/events/[eventId]/carpools
 * Get all Carpools for a specific event with enriched registration data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Get all Carpools for this event
    const carpools = await getCarpoolsByEvent(eventId);

    // Enrich Carpools with registration data (company name, contact info)
    const db = adminDb();
    const enrichedCarpools = await Promise.all(
      carpools.map(async (carpool) => {
        // Get registration data for owner
        const registrationSnapshot = await db
          .collection('eventRegistrations')
          .where('registrationId', '==', carpool.ownerRegistrationId)
          .limit(1)
          .get();

        let ownerCompanyName = '';
        let ownerContactName = '';

        if (!registrationSnapshot.empty) {
          const regData = registrationSnapshot.docs[0].data();
          ownerCompanyName = regData.companyName || '';
          ownerContactName = regData.contactName || '';
        }

        return {
          ...carpool,
          ownerCompanyName,
          ownerContactName,
        };
      })
    );

    return NextResponse.json({ carpools: enrichedCarpools });
  } catch (error) {
    console.error('Error fetching Carpools for event:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Carpools', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
