// API Route for Yearly Attendance Report
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getYearlyAttendanceReport } from '@/lib/event-sheets';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require report:view or admin permission
    if (!hasPermission(session.user.permissions || [], 'report:view') &&
        !hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    const report = await getYearlyAttendanceReport(year);

    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error fetching attendance report:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance report' }, { status: 500 });
  }
}
