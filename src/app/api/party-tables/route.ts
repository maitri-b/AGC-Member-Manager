// API Route: Party Table Management - Create Party Table
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { createPartyTable } from '@/lib/partyTables';
import { CreatePartyTableData } from '@/types/partyTable';

/**
 * POST /api/party-tables
 * Create a new Party Table
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow both admins and regular members to create party tables
    // Members can create tables for their own registrations

    const body: CreatePartyTableData = await request.json();

    // Validate required fields
    if (!body.eventId || !body.hostRegistrationId || !body.hostCompanyName || !body.hostContactName) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, hostRegistrationId, hostCompanyName, hostContactName' },
        { status: 400 }
      );
    }

    // Ensure initialMembers is an array (allow empty initially)
    if (!body.initialMembers) {
      body.initialMembers = [];
    }

    // Create the Party Table
    const createdBy = session.user.id;
    const createdByName = session.user.name || session.user.email || 'Unknown';
    const table = await createPartyTable(body, createdBy, createdByName);

    return NextResponse.json({ success: true, table }, { status: 201 });
  } catch (error) {
    console.error('Error creating Party Table:', error);
    return NextResponse.json(
      { error: 'Failed to create Party Table', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
