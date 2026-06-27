// API Route for Updating Payment Status (Admin only)
// For Agents Club Deposit Payment System

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrations, updateEventRegistration } from '@/lib/event-sheets';
import { Event } from '@/types/event';
import { calculateRemainingDeadline } from '@/lib/payment-deadlines';
import { determinePaymentStatus } from '@/lib/payment-status';

// PUT - Update payment status (Admin confirms deposit or remaining payment)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    // Check admin permissions
    const isAdmin = session?.user?.permissions?.includes('admin:access') ||
                     session?.user?.permissions?.includes('members:list');

    if (!session?.user || !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { eventId } = await params;
    const body = await request.json();
    const { registrationId, paymentType, amount, slipUrl, paidDate } = body;

    if (!registrationId || !paymentType || !paidDate) {
      return NextResponse.json({
        error: 'Missing required fields: registrationId, paymentType, paidDate'
      }, { status: 400 });
    }

    if (!['deposit', 'remaining', 'full'].includes(paymentType)) {
      return NextResponse.json({
        error: 'paymentType must be "deposit", "remaining", or "full"'
      }, { status: 400 });
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'Event sheet not configured' }, { status: 400 });
    }

    // Get existing registrations
    let existingRegistrations;
    try {
      existingRegistrations = await getEventRegistrations(eventData.sheetName);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      return NextResponse.json({ error: 'Failed to load registration data' }, { status: 500 });
    }

    // Find the registration
    const registration = existingRegistrations.find(r => r.registrationId === registrationId);

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {};

    // Record payment amount in admin notes
    if (amount) {
      const currentNotes = registration.adminNotes || '';
      const paymentTypeLabel = paymentType === 'deposit' ? 'มัดจำ' : paymentType === 'remaining' ? 'ยอดที่เหลือ' : 'เต็มจำนวน';
      const paymentNote = `\n[${paidDate}] Admin บันทึกการชำระ${paymentTypeLabel}: ${amount.toLocaleString()} บาท (โดย ${session.user.fullName || session.user.email})`;
      updateData.admin_notes = currentNotes + paymentNote;
    }

    if (paymentType === 'deposit') {
      // Mark deposit as paid
      updateData.deposit_paid = true;
      updateData.deposit_paid_date = paidDate;
      if (slipUrl) {
        updateData.deposit_slip_url = slipUrl;
      }

      // Calculate remaining deadline if event has remaining deadline configuration
      if (eventData.remainingDeadlineType && eventData.remainingDeadlineType !== 'none') {
        const remainingDeadline = calculateRemainingDeadline(eventData as Event, paidDate);
        updateData.remaining_deadline = remainingDeadline;
      }
    } else if (paymentType === 'remaining') {
      // Mark remaining payment as received
      if (slipUrl) {
        updateData.remaining_slip_url = slipUrl;
      }
      // Note: We don't set a specific 'remaining_paid' flag,
      // status is determined by having both depositPaid and remainingSlipUrl
    } else if (paymentType === 'full') {
      // Mark both deposit and remaining as paid (full payment)
      updateData.deposit_paid = true;
      updateData.deposit_paid_date = paidDate;
      if (slipUrl) {
        updateData.deposit_slip_url = slipUrl;
        updateData.remaining_slip_url = slipUrl;
      }
    }

    // Recalculate payment status
    const updatedRegistration = { ...registration, ...updateData };
    const newStatus = determinePaymentStatus(updatedRegistration as any, eventData as Event);
    updateData.payment_status = newStatus;
    updateData.status = newStatus; // Keep for backward compatibility

    // Add update info
    updateData.last_update_info = JSON.stringify({
      ...JSON.parse(registration.lastUpdateInfo || '{}'),
      [`${paymentType}_payment_confirmed`]: {
        by: session.user.id,
        at: new Date().toISOString(),
        amount,
      },
    });

    console.log('[Update Payment] Updating payment:', {
      registrationId,
      paymentType,
      sheetName: eventData.sheetName,
      updateData,
    });

    // Update Google Sheets
    try {
      await updateEventRegistration(eventData.sheetName, registrationId, updateData);

      console.log('[Update Payment] Payment updated successfully');

      const successMessage = paymentType === 'deposit'
        ? 'บันทึกการชำระมัดจำเรียบร้อยแล้ว'
        : paymentType === 'remaining'
          ? 'บันทึกการชำระยอดคงเหลือเรียบร้อยแล้ว'
          : 'บันทึกการชำระเต็มจำนวนเรียบร้อยแล้ว';

      return NextResponse.json({
        success: true,
        message: successMessage,
        newStatus,
      });
    } catch (updateError) {
      console.error('[Update Payment] Update failed:', updateError);
      throw updateError;
    }
  } catch (error) {
    console.error('Error updating payment status:', error);
    return NextResponse.json({
      error: 'ไม่สามารถอัพเดทสถานะการชำระเงินได้ กรุณาลองใหม่'
    }, { status: 500 });
  }
}
