// API Route for Admin - Manually sync all events to Google Apps Script
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

/**
 * POST - Manually sync all events with sheetName to GAS
 * This is useful for:
 * 1. Initial migration/setup
 * 2. Recovering from sync failures
 * 3. Debugging
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const gasUrl = process.env.NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL;

    if (!gasUrl) {
      return NextResponse.json(
        { error: 'GAS_UPLOAD_SLIP_URL not configured' },
        { status: 500 }
      );
    }

    const db = adminDb();

    // Get all events that have sheetName
    const eventsSnapshot = await db
      .collection('events')
      .where('sheetName', '!=', '')
      .get();

    const results = [];
    let successCount = 0;
    let failCount = 0;

    // Sync each event
    for (const doc of eventsSnapshot.docs) {
      const event = doc.data();
      const eventId = doc.id;
      const sheetName = event.sheetName;

      try {
        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'sync_event',
            eventId,
            sheetName,
          }),
        });

        const result = await response.json();

        if (result.success) {
          successCount++;
          results.push({
            eventId,
            sheetName,
            status: 'success',
          });
        } else {
          failCount++;
          results.push({
            eventId,
            sheetName,
            status: 'failed',
            error: result.error,
          });
        }
      } catch (error) {
        failCount++;
        results.push({
          eventId,
          sheetName,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Get current mappings from GAS to verify
    let currentMappings = null;
    try {
      const verifyResponse = await fetch(gasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_mappings',
        }),
      });

      const verifyResult = await verifyResponse.json();
      if (verifyResult.success) {
        currentMappings = verifyResult.mappings;
      }
    } catch (error) {
      console.error('Error fetching current mappings:', error);
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: eventsSnapshot.size,
        succeeded: successCount,
        failed: failCount,
      },
      results,
      currentMappings,
    });
  } catch (error) {
    console.error('Error syncing events to GAS:', error);
    return NextResponse.json(
      { error: 'Failed to sync events' },
      { status: 500 }
    );
  }
}

/**
 * GET - Fetch current event mappings from GAS
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const gasUrl = process.env.NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL;

    if (!gasUrl) {
      return NextResponse.json(
        { error: 'GAS_UPLOAD_SLIP_URL not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'get_mappings',
      }),
    });

    const result = await response.json();

    if (result.success) {
      return NextResponse.json({
        success: true,
        mappings: result.mappings,
        count: Object.keys(result.mappings).length,
      });
    } else {
      return NextResponse.json(
        { error: result.error || 'Failed to get mappings' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error fetching GAS mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mappings' },
      { status: 500 }
    );
  }
}
