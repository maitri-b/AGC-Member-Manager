// Manual Sync API - Admin can trigger member sync from Google Sheets to Firestore
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { syncAllMembersToFirestore, syncSingleMemberToFirestore, getSyncStatus } from '@/lib/member-sync';

/**
 * POST /api/admin/sync-members
 * Manually trigger member sync from Google Sheets to Firestore
 * Requires admin:access permission
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication and permissions
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin:access permission
    if (!session.user.permissions.includes('admin:access')) {
      return NextResponse.json({ error: 'Forbidden - admin:access required' }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { memberId } = body;

    // If memberId is provided, sync single member
    // Otherwise, sync all members
    if (memberId) {
      console.log(`[Manual Sync] Syncing single member: ${memberId}`);
      const result = await syncSingleMemberToFirestore(memberId);

      return NextResponse.json({
        success: result.success,
        result,
      });
    } else {
      console.log('[Manual Sync] Syncing all members from Google Sheets to Firestore');
      const summary = await syncAllMembersToFirestore();

      return NextResponse.json({
        success: summary.failed === 0,
        summary,
      });
    }
  } catch (error) {
    console.error('[Manual Sync] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/sync-members
 * Get sync status (last sync time, member count)
 * Requires admin:access permission
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication and permissions
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has admin:access permission
    if (!session.user.permissions.includes('admin:access')) {
      return NextResponse.json({ error: 'Forbidden - admin:access required' }, { status: 403 });
    }

    // Get sync status
    const status = await getSyncStatus();

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error('[Sync Status] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
