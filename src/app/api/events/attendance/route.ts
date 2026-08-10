// API Route for Member Attendance - Get attendance for current user or specific member
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { hasPermission } from '@/lib/permissions';
import { getMemberAttendanceSummary, getAttendanceCache } from '@/lib/events';

export async function GET(request: NextRequest) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const useCache = searchParams.get('cache') !== 'false'; // Default to using cache

    // If querying another member's attendance, require permission
    if (memberId && memberId !== session.user.memberId) {
      if (!hasPermission(session.user.permissions || [], 'members:list')) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }
    }

    // Use provided memberId or current user's memberId
    const targetMemberId = memberId || session.user.memberId;

    if (!targetMemberId) {
      return NextResponse.json({
        error: 'Member ID not found. Please verify your membership first.',
      }, { status: 400 });
    }

    // Try to use cache first if enabled
    if (useCache) {
      const cache = await getAttendanceCache();
      if (cache && cache[targetMemberId]) {
        const cacheEntry = cache[targetMemberId];

        // Get full attendance details from real-time calculation
        // (we need the eventsAttended list which is not in cache)
        const fullAttendance = await getMemberAttendanceSummary(targetMemberId);

        if (fullAttendance) {
          // Use cached count but keep detailed event list from real-time
          return NextResponse.json({
            attendance: {
              ...fullAttendance,
              eventsLast12Months: cacheEntry.eventsLast12Months,
              noActivityWarning: !cacheEntry.hasRecentActivity,
            }
          });
        }
      }
    }

    // Fallback to real-time calculation if cache is disabled or not available
    const attendance = await getMemberAttendanceSummary(targetMemberId);

    if (!attendance) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({ attendance });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
