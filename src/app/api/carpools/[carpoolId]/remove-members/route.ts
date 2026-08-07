// API Route: Carpool Management - Remove Members from Carpool
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getCarpoolById, removeMembersFromCarpool } from '@/lib/carpools';

/**
 * POST /api/carpools/[carpoolId]/remove-members
 * Remove members from existing Carpool
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

    const body: { lineUserIds: string[] } = await request.json();

    if (!body.lineUserIds || !Array.isArray(body.lineUserIds) || body.lineUserIds.length === 0) {
      return NextResponse.json({ error: 'lineUserIds array is required and cannot be empty' }, { status: 400 });
    }

    // Check if Carpool exists
    const existingCarpool = await getCarpoolById(carpoolId);
    if (!existingCarpool) {
      return NextResponse.json({ error: 'Carpool not found' }, { status: 404 });
    }

    // Remove members from Carpool
    await removeMembersFromCarpool(carpoolId, body.lineUserIds);

    // Fetch updated Carpool
    const updatedCarpool = await getCarpoolById(carpoolId);

    return NextResponse.json({ success: true, carpool: updatedCarpool });
  } catch (error) {
    console.error('Error removing members from Carpool:', error);
    return NextResponse.json(
      { error: 'Failed to remove members from Carpool', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
