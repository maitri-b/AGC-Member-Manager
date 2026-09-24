// Cron Sync API - Automatic hourly sync from Google Sheets to Firestore
// Triggered by Vercel Cron Job (configured in vercel.json)
import { NextRequest, NextResponse } from 'next/server';
import { syncAllMembersToFirestore } from '@/lib/member-sync';

/**
 * GET /api/cron/sync-members
 * Automatically sync members from Google Sheets to Firestore
 * Called by Vercel Cron Job (hourly)
 * Requires CRON_SECRET for security
 */
export async function GET(request: NextRequest) {
  try {
    // Verify CRON_SECRET to prevent unauthorized access
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[Cron Sync] CRON_SECRET not configured in environment variables');
      return NextResponse.json(
        { error: 'Cron secret not configured' },
        { status: 500 }
      );
    }

    // Check authorization header
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron Sync] Unauthorized - invalid or missing CRON_SECRET');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[Cron Sync] Starting automatic member sync');
    const startTime = Date.now();

    // Sync all members
    const summary = await syncAllMembersToFirestore();

    const duration = Date.now() - startTime;

    // Log results
    console.log('[Cron Sync] Completed:', {
      total: summary.total,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      failed: summary.failed,
      duration: `${(duration / 1000).toFixed(2)}s`,
    });

    // Return success with summary
    return NextResponse.json({
      success: summary.failed === 0,
      summary: {
        total: summary.total,
        created: summary.created,
        updated: summary.updated,
        skipped: summary.skipped,
        failed: summary.failed,
        duration,
        startedAt: summary.startedAt,
        completedAt: summary.completedAt,
      },
      // Only include failed results to keep response size small
      failedResults: summary.results.filter(r => r.action === 'error'),
    });
  } catch (error) {
    console.error('[Cron Sync] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
