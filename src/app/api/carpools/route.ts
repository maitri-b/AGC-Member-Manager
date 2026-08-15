// API Route: Carpool Management - Create Carpool
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { createCarpool } from '@/lib/carpools';
import { CreateCarpoolData } from '@/types/carpool';

/**
 * POST /api/carpools
 * Create a new Carpool
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow both admins and regular members to create carpools
    // Members can create carpools for their own registrations

    const body: CreateCarpoolData = await request.json();

    // Validate required fields
    if (!body.eventId || !body.ownerRegistrationId || !body.licensePlate) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, ownerRegistrationId, licensePlate' },
        { status: 400 }
      );
    }

    // Ensure members is an array (allow empty initially)
    if (!Array.isArray(body.members)) {
      body.members = [];
    }

    // Create the Carpool
    const carpool = await createCarpool(body);

    return NextResponse.json({ success: true, carpool }, { status: 201 });
  } catch (error) {
    console.error('Error creating Carpool:', error);
    return NextResponse.json(
      { error: 'Failed to create Carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
