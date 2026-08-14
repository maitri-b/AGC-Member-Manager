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

    console.log('[Party Table Creation] Request received:', {
      userId: session.user.id,
      userName: session.user.name,
      body,
    });

    // Validate required fields
    const missingFields: string[] = [];
    if (!body.eventId) missingFields.push('eventId');
    if (!body.hostRegistrationId) missingFields.push('hostRegistrationId');
    if (!body.hostCompanyName) missingFields.push('hostCompanyName');
    if (!body.hostContactName) missingFields.push('hostContactName');

    if (missingFields.length > 0) {
      console.error('[Party Table Creation] Missing required fields:', {
        missingFields,
        body,
      });
      return NextResponse.json(
        {
          error: 'ข้อมูลไม่ครบถ้วน',
          details: `Missing required fields: ${missingFields.join(', ')}`,
          missingFields
        },
        { status: 400 }
      );
    }

    // Ensure initialMembers is an array (allow empty initially)
    if (!body.initialMembers) {
      body.initialMembers = [];
    }

    // Log initialMembers for debugging
    console.log('[Party Table Creation] Initial members:', {
      count: body.initialMembers.length,
      members: body.initialMembers.map((m, i) => ({
        index: i,
        name: m.name,
        nameType: typeof m.name,
        nameLength: m.name?.length,
        nameCharCodes: m.name ? Array.from(m.name).map(c => c.charCodeAt(0)).slice(0, 10) : [],
      })),
    });

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
