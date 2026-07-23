// API Route: POST /api/admin/events/[eventId]/update-deadlines
// Bulk update deadlines for pending registrations

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { calculateDepositDeadline, calculateRemainingDeadline, calculateFullPaymentDeadline } from '@/lib/payment-deadlines';

export async function POST(
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
    const body = await request.json();

    const {
      deadlineType, // 'full', 'deposit', or 'remaining'
      paymentDeadlineType,
      paymentDeadlineFixed,
      paymentDeadlineHours,
      depositDeadlineType,
      depositDeadlineFixed,
      depositDeadlineHours,
      remainingDeadlineType,
      remainingDeadlineFixed,
      remainingDeadlineHours,
    } = body;

    console.log(`[Update Deadlines] Event: ${eventId}, Type: ${deadlineType}`);

    const db = adminDb();

    // Fetch all pending registrations for this event
    const snapshot = await db
      .collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .get();

    // ✅ STRICT FILTER: Only registrations that haven't uploaded payment slip yet
    // Include ONLY: รอชำระเงิน, รอชำระมัดจำ, รอชำระยอดคงเหลือ
    // Exclude: รอตรวจสอบ (already uploaded slip - cannot change deadline)
    const pendingPaymentStatuses = [
      'รอชำระเงิน',
      'รอชำระมัดจำ',
      'รอชำระยอดคงเหลือ',
    ];

    const pendingDocs = snapshot.docs.filter(doc => {
      const data = doc.data();
      const paymentStatus = data.paymentStatus || '';
      const status = data.status || '';

      // Exclude cancelled
      if (status.includes('ยกเลิก') || status.toLowerCase() === 'cancelled') {
        return false;
      }

      // Only include registrations waiting for payment (no slip uploaded yet)
      return pendingPaymentStatuses.includes(paymentStatus);
    });

    console.log(`[Update Deadlines] Found ${pendingDocs.length} pending registration(s)`);

    // Update each registration
    let updatedCount = 0;
    const batch = db.batch();

    for (const doc of pendingDocs) {
      const data = doc.data();
      const registrationDate = data.registrationDate || new Date().toISOString();
      const depositPaidDate = data.depositPaidDate || '';

      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      // Calculate new deadline based on type
      if (deadlineType === 'full') {
        // Build event config object for calculateFullPaymentDeadline
        const eventConfig = {
          paymentDeadlineType,
          paymentDeadlineFixed,
          paymentDeadlineHours,
        } as any;

        const newDeadline = calculateFullPaymentDeadline(eventConfig, registrationDate);
        updateData.fullPaymentDeadline = newDeadline;
        console.log(`[Update Deadlines] ${doc.id}: fullPaymentDeadline = ${newDeadline}`);
      } else if (deadlineType === 'deposit') {
        // Build event config object for calculateDepositDeadline
        const eventConfig = {
          depositDeadlineType,
          depositDeadlineFixed,
          depositDeadlineHours,
        } as any;

        const newDeadline = calculateDepositDeadline(eventConfig, registrationDate);
        updateData.depositDeadline = newDeadline;
        console.log(`[Update Deadlines] ${doc.id}: depositDeadline = ${newDeadline}`);
      } else if (deadlineType === 'remaining') {
        // Build event config object for calculateRemainingDeadline
        const eventConfig = {
          remainingDeadlineType,
          remainingDeadlineFixed,
          remainingDeadlineHours,
        } as any;

        const newDeadline = calculateRemainingDeadline(eventConfig, depositPaidDate || registrationDate);
        updateData.remainingDeadline = newDeadline;
        console.log(`[Update Deadlines] ${doc.id}: remainingDeadline = ${newDeadline}`);
      }

      batch.update(doc.ref, updateData);
      updatedCount++;
    }

    // Commit batch update
    if (updatedCount > 0) {
      await batch.commit();
      console.log(`[Update Deadlines] ✅ Updated ${updatedCount} registration(s)`);
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Updated ${updatedCount} pending registration(s)`,
    });
  } catch (error) {
    console.error('Error updating deadlines:', error);
    return NextResponse.json(
      { error: 'Failed to update deadlines', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
