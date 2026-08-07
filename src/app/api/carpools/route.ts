// API Route: Carpool Management - Create Carpool
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { createCarpool } from '@/lib/carpools';
import { CreateCarpoolData } from '@/types/carpool';

/**
 * POST /api/carpools
 * Create a new Carpool
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body: CreateCarpoolData = await request.json();

    // Validate required fields
    if (!body.eventId || !body.ownerRegistrationId || !body.licensePlate || !body.members || body.members.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, ownerRegistrationId, licensePlate, members' },
        { status: 400 }
      );
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
