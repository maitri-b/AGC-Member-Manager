// API Route for Attendance Cache Management
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { buildAttendanceCache, getAttendanceCache } from '@/lib/event-sheets';

// GET - Get cache status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const cache = await getAttendanceCache();

    if (!cache) {
      return NextResponse.json({
        exists: false,
        message: 'Cache does not exist or is stale',
      });
    }

    // Count members with recent activity
    let activeCount = 0;
    const activeSamples: { memberId: string; eventsLast12Months: number }[] = [];
    for (const [memberId, entry] of Object.entries(cache)) {
      if (entry.hasRecentActivity) {
        activeCount++;
        if (activeSamples.length < 10) {
          activeSamples.push({ memberId, eventsLast12Months: entry.eventsLast12Months });
        }
      }
    }

    return NextResponse.json({
      exists: true,
      memberCount: Object.keys(cache).length,
      activeCount,
      activeSamples,
      message: 'Cache is valid',
    });
  } catch (error) {
    console.error('Error checking attendance cache:', error);
    return NextResponse.json({ error: 'Failed to check cache' }, { status: 500 });
  }
}

// POST - Rebuild cache
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get months parameter from request body
    let months = 12; // default
    try {
      const body = await request.json();
      if (body.months && typeof body.months === 'number' && body.months >= 1 && body.months <= 60) {
        months = body.months;
      }
    } catch {
      // If no body or invalid JSON, use default
    }

    console.log(`Rebuilding attendance cache requested by ${session.user.name || session.user.id} for ${months} months`);

    const result = await buildAttendanceCache(months);

    if (result.success) {
      return NextResponse.json({
        success: true,
        memberCount: result.memberCount,
        eventCount: result.eventCount,
        confirmedCount: result.confirmedCount,
        message: `Cache rebuilt successfully: ${result.memberCount} members, ${result.eventCount} recent events, ${result.confirmedCount} confirmed registrations`,
      });
    } else {
      return NextResponse.json({ error: 'Failed to build cache' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error rebuilding attendance cache:', error);
    return NextResponse.json({ error: 'Failed to rebuild cache' }, { status: 500 });
  }
}
