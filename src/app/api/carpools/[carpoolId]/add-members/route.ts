// API Route: Carpool Management - Add Members to Carpool
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolById, addMembersToCarpool } from '@/lib/carpools';
import { CarpoolMember } from '@/types/carpool';

/**
 * POST /api/carpools/[carpoolId]/add-members
 * Add members to existing Carpool
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { carpoolId: string } }
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

    const { carpoolId } = params;

    if (!carpoolId) {
      return NextResponse.json({ error: 'Carpool ID is required' }, { status: 400 });
    }

    const body: { members: CarpoolMember[] } = await request.json();

    if (!body.members || !Array.isArray(body.members) || body.members.length === 0) {
      return NextResponse.json({ error: 'Members array is required and cannot be empty' }, { status: 400 });
    }

    // Check if Carpool exists
    const existingCarpool = await getCarpoolById(carpoolId);
    if (!existingCarpool) {
      return NextResponse.json({ error: 'Carpool not found' }, { status: 404 });
    }

    // Add members to Carpool
    await addMembersToCarpool(carpoolId, body.members);

    // Fetch updated Carpool
    const updatedCarpool = await getCarpoolById(carpoolId);

    return NextResponse.json({ success: true, carpool: updatedCarpool });
  } catch (error) {
    console.error('Error adding members to Carpool:', error);
    return NextResponse.json(
      { error: 'Failed to add members to Carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
