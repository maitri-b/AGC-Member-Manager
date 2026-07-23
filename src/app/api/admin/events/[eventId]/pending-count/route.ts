// API Route: GET /api/admin/events/[eventId]/pending-count
// Get count of pending registrations for an event

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin or event-co permissions
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');
    const isEventCo = hasPermission(session.user.permissions || [], 'events:manage');

    if (!isAdmin && !isEventCo) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { eventId } = await params;

    const db = adminDb();

    // Query for pending registrations (รอชำระเงิน, รอตรวจสอบ, etc.)
    const snapshot = await db
      .collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .get();

    // Filter for pending payment statuses (not fully paid, not cancelled)
    const pendingStatuses = [
      'รอชำระเงิน',
      'รอชำระมัดจำ',
      'รอชำระยอดคงเหลือ',
      'รอตรวจสอบ',
      'รอตรวจสอบมัดจำ',
      'รอตรวจสอบยอดคงเหลือ',
    ];

    const pendingRegistrations = snapshot.docs.filter(doc => {
      const data = doc.data();
      const paymentStatus = data.paymentStatus || '';
      const status = data.status || '';

      // Exclude cancelled
      if (status.includes('ยกเลิก') || status.toLowerCase() === 'cancelled') {
        return false;
      }

      return pendingStatuses.includes(paymentStatus);
    });

    return NextResponse.json({
      count: pendingRegistrations.length,
      eventId,
    });
  } catch (error) {
    console.error('Error counting pending registrations:', error);
    return NextResponse.json(
      { error: 'Failed to count pending registrations' },
      { status: 500 }
    );
  }
}
