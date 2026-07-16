// API Route for Updating Payment Status (Admin only)
// For Agents Club Deposit Payment System
//
// ⚠️ DEPRECATED: This endpoint updates legacy slip URL fields in eventRegistrations.
// For new implementations, use:
// - PUT /api/payments/[slipId]/approve - Approve payment slip
// - PUT /api/payments/[slipId]/reject - Reject payment slip
//
// This endpoint is kept for backward compatibility during migration.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrationsByEventId, updateEventRegistrationInFirestore } from '@/lib/event-sheets';
import { Event } from '@/types/event';
import { calculateRemainingDeadline } from '@/lib/payment-deadlines';
import { determinePaymentStatus } from '@/lib/payment-status';
import { hasPermission, canManageEvent } from '@/lib/permissions';

// PUT - Update payment status (Admin confirms deposit or remaining payment)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    // Check permissions: either has full access OR can manage assigned event
    const hasFullAccess = hasPermission(session.user.permissions || [], 'admin:access') ||
                          hasPermission(session.user.permissions || [], 'members:list');
    const canManageAssigned = hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!hasFullAccess && !canManageAssigned) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    // Verify assignment for event-staff/event-co
    if (!hasFullAccess && canManageAssigned) {
      const userRole = session.user.role;
      const assignedEventIds = session.user.assignedEventIds || [];

      if (!canManageEvent(userRole, assignedEventIds, eventId)) {
        return NextResponse.json({ error: 'Not assigned to this event' }, { status: 403 });
      }
    }
    const body = await request.json();
    const { registrationId, paymentType, amount, slipUrl, paidDate, action } = body;

    // action can be 'approve' (default) or 'reject'
    const paymentAction = action || 'approve';

    if (!registrationId || !paymentType) {
      return NextResponse.json({
        error: 'Missing required fields: registrationId, paymentType'
      }, { status: 400 });
    }

    if (!['deposit', 'remaining', 'full'].includes(paymentType)) {
      return NextResponse.json({
        error: 'paymentType must be "deposit", "remaining", or "full"'
      }, { status: 400 });
    }

    if (paymentAction === 'approve' && !paidDate) {
      return NextResponse.json({
        error: 'Missing required field: paidDate (required for approval)'
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
      existingRegistrations = await getEventRegistrationsByEventId(eventId);
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

    if (paymentAction === 'reject') {
      // REJECTION: Set payment_status to 'ปฏิเสธสลิป' and clear slip URL
      const paymentTypeLabel = paymentType === 'deposit' ? 'มัดจำ' : paymentType === 'remaining' ? 'ยอดที่เหลือ' : 'เต็มจำนวน';
      updateData.payment_status = 'ปฏิเสธสลิป';

      // Clear the rejected slip URL
      if (paymentType === 'deposit') {
        updateData.deposit_slip_url = '';
        updateData.deposit_paid_date = '';
      } else if (paymentType === 'remaining') {
        updateData.remaining_slip_url = '';
        updateData.remaining_paid_date = '';
      }

      // Record rejection in admin notes
      const currentNotes = registration.adminNotes || '';
      const rejectionNote = `\n[${new Date().toISOString().split('T')[0]}] Admin ปฏิเสธสลิป${paymentTypeLabel} (โดย ${session.user.name || session.user.email})`;
      updateData.admin_notes = currentNotes + rejectionNote;
    } else {
      // APPROVAL: Record payment amount in admin notes
      if (amount) {
        const currentNotes = registration.adminNotes || '';
        const paymentTypeLabel = paymentType === 'deposit' ? 'มัดจำ' : paymentType === 'remaining' ? 'ยอดที่เหลือ' : 'เต็มจำนวน';
        const paymentNote = `\n[${paidDate}] Admin บันทึกการชำระ${paymentTypeLabel}: ${amount.toLocaleString()} บาท (โดย ${session.user.name || session.user.email})`;
        updateData.admin_notes = currentNotes + paymentNote;
      }

      // Get current payment amounts
      const totalAmount = registration.totalAmount || 0;
      const depositAmount = registration.depositAmount || 0;
      const remainingAmount = registration.remainingAmount || 0;

      if (paymentType === 'deposit') {
        // Mark deposit as paid
        updateData.deposit_paid = true;
        updateData.deposit_paid_date = paidDate;
        if (slipUrl) {
          updateData.deposit_slip_url = slipUrl;
        }

        // Flexible validation: Allow any amount, but track what was actually paid
        if (amount) {
          updateData.deposit_amount_paid = amount;

          // If amount is less than expected deposit, calculate additional required
          if (amount < depositAmount) {
            const additionalRequired = depositAmount - amount;
            const currentNotes = (updateData.admin_notes as string) || (registration.adminNotes || '');
            updateData.admin_notes = currentNotes + `\n[${paidDate}] ⚠️ ชำระมัดจำต่ำกว่าที่กำหนด: ยอดต้องชำระเพิ่ม ${additionalRequired.toLocaleString()} บาท`;
          }
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
        updateData.remaining_paid = true;
        updateData.remaining_paid_date = paidDate;

        // Track actual amount paid
        if (amount) {
          updateData.remaining_amount_paid = amount;

          // Check if this covers the remaining amount
          const expectedRemaining = remainingAmount || (totalAmount - depositAmount);
          if (amount < expectedRemaining) {
            const additionalRequired = expectedRemaining - amount;
            const currentNotes = (updateData.admin_notes as string) || (registration.adminNotes || '');
            updateData.admin_notes = currentNotes + `\n[${paidDate}] ⚠️ ชำระยอดคงเหลือต่ำกว่าที่กำหนด: ยอดต้องชำระเพิ่ม ${additionalRequired.toLocaleString()} บาท`;
          }
        }
      } else if (paymentType === 'full') {
        // Mark both deposit and remaining as paid (full payment)
        updateData.deposit_paid = true;
        updateData.deposit_paid_date = paidDate;
        updateData.full_payment_paid = true;
        if (slipUrl) {
          updateData.deposit_slip_url = slipUrl;
          updateData.remaining_slip_url = slipUrl;
          updateData.full_payment_slip_url = slipUrl;
        }

        // Track actual amount paid
        if (amount) {
          updateData.full_payment_amount_paid = amount;

          // Check if amount covers total
          if (amount < totalAmount) {
            const additionalRequired = totalAmount - amount;
            const currentNotes = (updateData.admin_notes as string) || (registration.adminNotes || '');
            updateData.admin_notes = currentNotes + `\n[${paidDate}] ⚠️ ชำระเต็มจำนวนต่ำกว่าที่กำหนด: ยอดต้องชำระเพิ่ม ${additionalRequired.toLocaleString()} บาท`;
          }
        }
      }

      // Recalculate payment status based on actual amounts paid
      const updatedRegistration = { ...registration, ...updateData };
      const newStatus = determinePaymentStatus(updatedRegistration as any, eventData as Event);
      updateData.payment_status = newStatus;
      updateData.status = newStatus; // Keep for backward compatibility
    }

    // Add update info
    const updateInfoKey = paymentAction === 'reject'
      ? `${paymentType}_payment_rejected`
      : `${paymentType}_payment_confirmed`;

    updateData.last_update_info = JSON.stringify({
      ...JSON.parse(registration.lastUpdateInfo || '{}'),
      [updateInfoKey]: {
        by: session.user.id,
        at: new Date().toISOString(),
        amount: paymentAction === 'approve' ? amount : undefined,
      },
    });

    console.log('[Update Payment] Updating payment:', {
      registrationId,
      paymentType,
      action: paymentAction,
      sheetName: eventData.sheetName,
      updateData,
    });

    // Update Firestore
    try {
      // Convert to Firestore format
      const firestoreUpdateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updateData)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        firestoreUpdateData[camelKey] = value;
      }
      await updateEventRegistrationInFirestore(registrationId, firestoreUpdateData);

      console.log('[Update Payment] Payment updated successfully');

      let successMessage: string;
      if (paymentAction === 'reject') {
        const typeLabel = paymentType === 'deposit' ? 'มัดจำ' : paymentType === 'remaining' ? 'ยอดคงเหลือ' : 'เต็มจำนวน';
        successMessage = `ปฏิเสธสลิป${typeLabel}เรียบร้อยแล้ว`;
      } else {
        successMessage = paymentType === 'deposit'
          ? 'บันทึกการชำระมัดจำเรียบร้อยแล้ว'
          : paymentType === 'remaining'
            ? 'บันทึกการชำระยอดคงเหลือเรียบร้อยแล้ว'
            : 'บันทึกการชำระเต็มจำนวนเรียบร้อยแล้ว';
      }

      return NextResponse.json({
        success: true,
        message: successMessage,
        newStatus: updateData.payment_status,
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
