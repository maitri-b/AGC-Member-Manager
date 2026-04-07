// API Route for Member Attendance Status (batch)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getAllMembers } from '@/lib/google-sheets';
import { getRegistrationsByLicense, getTrackedEventsFromFirestore } from '@/lib/event-sheets';
import { isWithinLastMonths, parseEventDate } from '@/types/event';

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

    // If specific IDs requested, filter; otherwise get all
    const members = await getAllMembers();
    const filteredMembers = memberIds.length > 0
      ? members.filter(m => memberIds.includes(m.memberId))
      : members;

    const events = await getTrackedEventsFromFirestore();
    const attendanceStatuses: AttendanceStatus[] = [];

    // Process each member
    for (const member of filteredMembers) {
      if (!member.licenseNumber) {
        attendanceStatuses.push({
          memberId: member.memberId,
          hasRecentActivity: false,
          eventsLast12Months: 0,
        });
        continue;
      }

      try {
        const eventRecords = await getRegistrationsByLicense(member.licenseNumber);
        let eventsLast12Months = 0;

        for (const record of eventRecords) {
          const event = events.find(e => e.eventId === record.eventId);
          if (!event) continue;

          // Check if confirmed/attended
          const status = record.registration.status || '';
          const statusLower = status.toLowerCase();
          const isConfirmed =
            statusLower === 'confirmed' ||
            statusLower === 'attended' ||
            status.includes('ยืนยัน') ||
            status.includes('ตรวจสอบแล้ว');

          if (isConfirmed && isWithinLastMonths(event.eventDate, 12)) {
            eventsLast12Months++;
          }
        }

        attendanceStatuses.push({
          memberId: member.memberId,
          hasRecentActivity: eventsLast12Months > 0,
          eventsLast12Months,
        });
      } catch (err) {
        console.error(`Error processing attendance for member ${member.memberId}:`, err);
        attendanceStatuses.push({
          memberId: member.memberId,
          hasRecentActivity: false,
          eventsLast12Months: 0,
        });
      }
    }

    // Convert to map for easier lookup
    const attendanceMap: Record<string, AttendanceStatus> = {};
    attendanceStatuses.forEach(a => {
      attendanceMap[a.memberId] = a;
    });

    return NextResponse.json({ attendance: attendanceMap });
  } catch (error) {
    console.error('Error fetching attendance statuses:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}
