// API Route for Member Attendance Status (batch)
// Uses cached attendance data to avoid N*M queries
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getAllMembersAttendanceStatus } from '@/lib/event-sheets';

interface AttendanceStatus {
  memberId: string;
  hasRecentActivity: boolean; // Participated in last 12 months
  eventsLast12Months: number;
}

// GET - Get attendance status for all members (for icon display)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'members:list')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const memberIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];

    // Get attendance from cache (builds if needed)
    const cachedAttendance = await getAllMembersAttendanceStatus();

    // Convert to response format
    const attendanceMap: Record<string, AttendanceStatus> = {};

    // If specific IDs requested, filter; otherwise return all
    if (memberIds.length > 0) {
      for (const memberId of memberIds) {
        const cached = cachedAttendance[memberId];
        if (cached) {
          attendanceMap[memberId] = {
            memberId: cached.memberId,
            hasRecentActivity: cached.hasRecentActivity,
            eventsLast12Months: cached.eventsLast12Months,
          };
        }
      }
    } else {
      for (const [memberId, cached] of Object.entries(cachedAttendance)) {
        attendanceMap[memberId] = {
          memberId: cached.memberId,
          hasRecentActivity: cached.hasRecentActivity,
          eventsLast12Months: cached.eventsLast12Months,
        };
      }
    }

    return NextResponse.json({ attendance: attendanceMap });
  } catch (error) {
    console.error('Error fetching attendance statuses:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
