// API Route: Get all Carpools for an Event
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolsByEvent } from '@/lib/carpools';
import { adminDb } from '@/lib/firebase-admin';

/**
 * GET /api/events/[eventId]/carpools
 * Get all Carpools for a specific event with enriched registration data
 *
 * For impersonation:
 * - Permission check uses the REAL admin session (must have admin:access)
 * - But returns ALL carpools for the event (admin view)
 *
 * This is intentional because admin managing carpools needs to see all carpools,
 * not just the impersonated user's carpools.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    // Use real admin session for permission check
    // Admin needs admin:access to manage all carpools
    const adminSession = await getServerSession(authOptions);

    if (!adminSession?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission (check real admin, not impersonated user)
    if (!hasPermission(adminSession.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Get all Carpools for this event
    const carpools = await getCarpoolsByEvent(eventId);

    // Get all registrations for this event to enrich member data
    const db = adminDb();
    const registrationsSnapshot = await db
      .collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .get();

    const registrationsMap = new Map();
    registrationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      registrationsMap.set(data.registrationId, data);
    });

    // Get all users for LINE display names
    const usersSnapshot = await db.collection('users').get();
    const usersMap = new Map();
    usersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.lineUserId) {
        usersMap.set(data.lineUserId, data);
      }
    });

    // Enrich Carpools with registration data (company name, contact info)
    const enrichedCarpools = await Promise.all(
      carpools.map(async (carpool) => {
        // Get registration data for owner
        const ownerReg = registrationsMap.get(carpool.ownerRegistrationId);
        const ownerCompanyName = ownerReg?.companyName || '';
        const ownerContactName = ownerReg?.contactName || '';

        // Enrich each member with their company name and LINE display name
        const enrichedMembers = carpool.members?.map(member => {
          const memberReg = registrationsMap.get(member.registrationId);
          const memberUser = usersMap.get(member.lineUserId);
          return {
            ...member,
            companyName: memberReg?.companyName || '',
            lineDisplayName: memberUser?.lineDisplayName || memberUser?.displayName || '',
          };
        }) || [];

        return {
          ...carpool,
          ownerCompanyName,
          ownerContactName,
          members: enrichedMembers,
          assignedCarNumber: carpool.assignedCarNumber, // Ensure assignedCarNumber is included
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
