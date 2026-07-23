// API Route: POST /api/admin/events/[eventId]/recalculate-deadlines
// Recalculate and update deadlines for ALL registrations of an event
// Useful for migrating old registrations or fixing deadline data

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { calculateDepositDeadline, calculateRemainingDeadline, calculateFullPaymentDeadline } from '@/lib/payment-deadlines';
import { Event } from '@/types/event';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin permissions
    const isAdmin = hasPermission(session.user.permissions || [], 'admin:access');

    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const { eventId } = await params;

    console.log(`[Recalculate Deadlines] Event: ${eventId}`);

    const db = adminDb();

    // Fetch event configuration
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();
    if (!eventData) {
      return NextResponse.json({ error: 'Event data not found' }, { status: 404 });
    }

    // Fetch all registrations for this event (including cancelled)
    const snapshot = await db
      .collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .get();

    console.log(`[Recalculate Deadlines] Found ${snapshot.docs.length} registration(s)`);

    // Update each registration
    let updatedCount = 0;
    const batch = db.batch();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const registrationDate = data.registrationDate || data.registeredAt || new Date().toISOString();
      const depositPaidDate = data.depositPaidDate || '';

      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      // Check payment mode from event configuration
      const paymentMode = eventData.paymentMode || 'full';

      if (paymentMode === 'deposit') {
        // Deposit mode: Calculate both deposit and remaining deadlines

        // Calculate deposit deadline
        const depositDeadline = calculateDepositDeadline(eventData as Event, registrationDate);
        updateData.depositDeadline = depositDeadline;

        // Calculate remaining deadline (if deposit was paid, use depositPaidDate)
        if (depositPaidDate) {
          const remainingDeadline = calculateRemainingDeadline(eventData as Event, depositPaidDate);
          updateData.remainingDeadline = remainingDeadline;
        } else if (eventData.remainingDeadlineType && eventData.remainingDeadlineType !== 'none') {
          // If not paid yet, still calculate based on registration date
          const remainingDeadline = calculateRemainingDeadline(eventData as Event, registrationDate);
          updateData.remainingDeadline = remainingDeadline;
        }

        console.log(`[Recalculate Deadlines] ${doc.id}: depositDeadline = ${updateData.depositDeadline}, remainingDeadline = ${updateData.remainingDeadline || 'none'}`);
      } else {
        // Full payment mode: Calculate only full payment deadline
        const fullPaymentDeadline = calculateFullPaymentDeadline(eventData as Event, registrationDate);
        updateData.fullPaymentDeadline = fullPaymentDeadline;

        console.log(`[Recalculate Deadlines] ${doc.id}: fullPaymentDeadline = ${updateData.fullPaymentDeadline}`);
      }

      batch.update(doc.ref, updateData);
      updatedCount++;
    }

    // Commit batch update
    if (updatedCount > 0) {
      await batch.commit();
      console.log(`[Recalculate Deadlines] ✅ Updated ${updatedCount} registration(s)`);
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Recalculated deadlines for ${updatedCount} registration(s)`,
    });
  } catch (error) {
    console.error('Error recalculating deadlines:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate deadlines', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
