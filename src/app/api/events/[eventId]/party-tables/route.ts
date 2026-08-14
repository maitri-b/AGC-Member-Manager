// API Route: Get all Party Tables for an event
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getPartyTablesByEvent } from '@/lib/partyTables';

/**
 * GET /api/events/[eventId]/party-tables
 * Get all party tables for an event (Admin/Committee only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied - Admin access required' }, { status: 403 });
    }

    const { eventId } = params;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Get all tables for this event
    const tables = await getPartyTablesByEvent(eventId);

    return NextResponse.json({ tables });
  } catch (error) {
    console.error('Error fetching event party tables:', error);
    return NextResponse.json(
      { error: 'Failed to fetch party tables', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
