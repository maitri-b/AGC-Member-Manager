// API Route for Member Attendance - Get attendance for current user or specific member
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getMemberAttendanceSummary } from '@/lib/event-sheets';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');

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
