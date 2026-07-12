// Debug API to check event data
import { NextResponse } from 'next/server';
import { getEventRegistrationsByEventId, getTrackedEventsFromFirestore } from '@/lib/event-sheets';

export async function GET() {
  try {
    // Get events
    const events = await getTrackedEventsFromFirestore();
    const event = events.find(e => e.eventId === '10yearth-meeting-2026');

    if (!event) {
      return NextResponse.json({ error: 'Event not found' });
    }

    // ✅ Get all registrations from Firestore
    const allRegistrations = await getEventRegistrationsByEventId(event.eventId);

    // Analyze status field
    const statusAnalysis = {
      total: allRegistrations.length,
      byStatus: {} as Record<string, number>,
      cancelledRegistrations: [] as any[],
    };

    allRegistrations.forEach((reg) => {
      const status = reg.status || 'no_status';
      statusAnalysis.byStatus[status] = (statusAnalysis.byStatus[status] || 0) + 1;

      // Check if cancelled
      const statusLower = String(status).toLowerCase();
      if (statusLower === 'cancelled' || String(status).includes('ยกเลิก')) {
        statusAnalysis.cancelledRegistrations.push({
          registrationId: reg.registrationId,
          companyName: reg.companyName,
          status: reg.status,
          statusType: typeof reg.status,
          statusLower: statusLower,
          attendanceType: reg.attendanceType,
        });
      }
    });

    return NextResponse.json({
      eventName: event.eventName,
      sheetName: event.sheetName,
      statusAnalysis,
      sampleRegistrations: allRegistrations.slice(0, 5).map(r => ({
        registrationId: r.registrationId,
        companyName: r.companyName,
        status: r.status,
        statusType: typeof r.status,
        attendanceType: r.attendanceType,
      })),
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
