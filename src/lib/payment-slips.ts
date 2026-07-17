// Library Functions for PaymentSlips Collection
import { adminDb } from './firebase-admin';
import {
  PaymentSlip,
  PaymentSummary,
  PaymentType,
  PaymentStatus,
  generateSlipId,
  calculatePaymentSummary,
} from '@/types/payment';
import { isFullyPaid, parseAdditionalPayments, recalculatePaymentStatus } from './payment-status';

/**
 * Get all payment slips for a specific registration
 */
export async function getPaymentSlipsByRegistration(
  registrationId: string
): Promise<PaymentSlip[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('paymentSlips')
    .where('registrationId', '==', registrationId)
    .get();

  const slips = snapshot.docs.map((doc) => ({
    ...doc.data(),
  })) as PaymentSlip[];

  // Sort by uploadedAt descending (newest first)
  slips.sort((a, b) => {
    const dateA = new Date(a.uploadedAt).getTime();
    const dateB = new Date(b.uploadedAt).getTime();
    return dateB - dateA;
  });

  return slips;
}

/**
 * Get all payment slips for a specific event
 */
export async function getPaymentSlipsByEvent(
  eventId: string
): Promise<PaymentSlip[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('paymentSlips')
    .where('eventId', '==', eventId)
    .get();

  const slips = snapshot.docs.map((doc) => ({
    ...doc.data(),
  })) as PaymentSlip[];

  // Sort by uploadedAt descending
  slips.sort((a, b) => {
    const dateA = new Date(a.uploadedAt).getTime();
    const dateB = new Date(b.uploadedAt).getTime();
    return dateB - dateA;
  });

  return slips;
}

/**
 * Get a single payment slip by ID
 */
export async function getPaymentSlipById(
  slipId: string
): Promise<PaymentSlip | null> {
  const db = adminDb();
  const doc = await db.collection('paymentSlips').doc(slipId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as PaymentSlip;
}

/**
 * Create a new payment slip
 */
export async function createPaymentSlip(
  slip: Omit<PaymentSlip, 'slipId' | 'createdAt'>
): Promise<PaymentSlip> {
  const db = adminDb();
  const slipId = generateSlipId();
  const createdAt = new Date().toISOString();

  const newSlip: PaymentSlip = {
    ...slip,
    slipId,
    createdAt,
  };

  // 1. Create the payment slip document
  await db.collection('paymentSlips').doc(slipId).set(newSlip);

  // 2. Update the registration record to store slip URL (for pending status tracking)
  const registrationsRef = db.collection('eventRegistrations');
  const snapshot = await registrationsRef
    .where('registrationId', '==', slip.registrationId)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const registrationDoc = snapshot.docs[0];
    const updateData: Record<string, any> = {
      updatedAt: createdAt,
    };

    // Update slip URL based on payment type
    if (slip.paymentType === 'deposit') {
      updateData.depositSlipUrl = slip.slipUrl;
      updateData.paymentStatus = 'รอตรวจสอบมัดจำ';
    } else if (slip.paymentType === 'remaining') {
      updateData.remainingSlipUrl = slip.slipUrl;
      updateData.paymentStatus = 'รอตรวจสอบยอดคงเหลือ';
    } else if (slip.paymentType === 'full') {
      updateData.fullPaymentSlipUrl = slip.slipUrl;
      updateData.paymentStatus = 'รอตรวจสอบ';
    }
    // Note: 'additional' type doesn't need to update main slip URLs

    await registrationDoc.ref.update(updateData);
  }

  return newSlip;
}

/**
 * Approve a payment slip
 */
export async function approvePaymentSlip(
  slipId: string,
  reviewerId: string,
  adminNotes?: string
): Promise<void> {
  const db = adminDb();
  const reviewedAt = new Date().toISOString();

  // 1. Get slip details first
  const slipDoc = await db.collection('paymentSlips').doc(slipId).get();
  if (!slipDoc.exists) {
    throw new Error('Payment slip not found');
  }
  const slip = slipDoc.data() as PaymentSlip;

  // 2. Update payment slip status
  await db
    .collection('paymentSlips')
    .doc(slipId)
    .update({
      status: 'approved',
      reviewedBy: reviewerId,
      reviewedAt,
      adminNotes: adminNotes || null,
      updatedAt: reviewedAt,
    });

  // 3. Update eventRegistrations record to reflect payment approval
  const registrationsRef = db.collection('eventRegistrations');
  const snapshot = await registrationsRef
    .where('registrationId', '==', slip.registrationId)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const registrationDoc = snapshot.docs[0];
    const registrationData = registrationDoc.data();
    const updateData: Record<string, any> = {
      updatedAt: reviewedAt,
    };

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Get event details for payment mode and deadline calculation
    const { getEventById } = await import('./event-sheets');
    const event = await getEventById(slip.eventId);
    const paymentMode = event?.paymentMode || 'full';

    // Update ONLY payment_status (not status - that's for registration confirmation)
    if (slip.paymentType === 'deposit') {
      updateData.depositPaid = true;
      updateData.depositPaidDate = today;
      updateData.depositSlipUrl = slip.slipUrl; // Store slip URL
      updateData.paidAmount = slip.amount; // Track total paid amount
      updateData.depositAmountPaid = slip.amount; // ✅ Track actual deposit amount paid
      updateData.paymentStatus = 'ชำระมัดจำแล้ว';

      // Calculate remaining deadline (if event uses deposit mode)
      if (event && paymentMode === 'deposit') {
        // Calculate remaining deadline based on event configuration
        if (event.remainingDeadlineType === 'fixed' && event.remainingDeadlineFixed) {
          updateData.remainingDeadline = event.remainingDeadlineFixed;
        } else if (event.remainingDeadlineType === 'hours' && event.remainingDeadlineHours) {
          const deadlineDate = new Date();
          deadlineDate.setHours(deadlineDate.getHours() + event.remainingDeadlineHours);
          updateData.remainingDeadline = deadlineDate.toISOString();
        }
      }
      // Do NOT update 'status' - that's for registration confirmation by admin
    } else if (slip.paymentType === 'remaining') {
      updateData.remainingPaid = true;
      updateData.remainingPaidDate = today; // Set paid date for remaining payment
      updateData.remainingSlipUrl = slip.slipUrl; // Store slip URL

      // Update total paid amount (add remaining to existing deposit)
      const currentPaid = registrationData.paidAmount || 0;
      updateData.paidAmount = currentPaid + slip.amount;

      // ✅ Track actual remaining amount paid
      updateData.remainingAmountPaid = slip.amount;

      updateData.paymentStatus = 'ชำระยอดคงเหลือแล้ว';
      // Do NOT update 'status'
    } else if (slip.paymentType === 'full') {
      // ✅ Full Payment Mode - Only use Full Payment Fields
      updateData.fullPaymentPaid = true;
      updateData.fullPaymentPaidDate = today;
      updateData.fullPaymentSlipUrl = slip.slipUrl;

      // ✅ Track actual amount paid for validation
      updateData.fullPaymentAmountPaid = slip.amount;
      updateData.paidAmount = slip.amount;

      // ✅ Determine payment status using Additional Payment System
      const totalAmount = registrationData.totalAmount || 0;
      const additionalPayments = parseAdditionalPayments(registrationData.additionalPayments);

      if (isFullyPaid(totalAmount, slip.amount, additionalPayments)) {
        updateData.paymentStatus = 'ชำระเต็มจำนวนแล้ว';
      } else {
        // ✅ Use 'รอชำระเงินเพิ่มเติม' to indicate additional payment needed
        updateData.paymentStatus = 'รอชำระเงินเพิ่มเติม';
      }

      // ✅ CLEAR deposit/remaining fields to avoid confusion
      // Full payment mode should NOT have deposit/remaining data
      updateData.depositAmount = 0;
      updateData.remainingAmount = 0;
      updateData.depositPaid = false;
      updateData.remainingPaid = false;
      updateData.depositPaidDate = null;
      updateData.remainingPaidDate = null;
      updateData.depositSlipUrl = '';
      updateData.remainingSlipUrl = '';
      updateData.depositDeadline = null;
      updateData.remainingDeadline = null;
    } else if (slip.paymentType === 'additional') {
      // Sync additional payment to eventRegistrations.additionalPayments
      const currentData = registrationDoc.data();
      let additionalPayments: any[] = [];

      try {
        additionalPayments = currentData.additionalPayments
          ? JSON.parse(currentData.additionalPayments)
          : [];
      } catch (err) {
        console.error('Error parsing additional payments:', err);
        additionalPayments = [];
      }

      // Update or add this payment
      const existingIndex = additionalPayments.findIndex(
        (p: any) => p.paymentId === slip.slipId
      );

      const paymentEntry = {
        paymentId: slip.slipId,
        amount: slip.amount,
        reason: slip.description || 'ชำระเงินเพิ่มเติม',
        slipUrl: slip.slipUrl,
        uploadedAt: slip.uploadedAt,
        approvedAt: reviewedAt,
        approvedBy: reviewerId,
        status: 'อนุมัติแล้ว',
      };

      if (existingIndex !== -1) {
        additionalPayments[existingIndex] = paymentEntry;
      } else {
        additionalPayments.push(paymentEntry);
      }

      updateData.additionalPayments = JSON.stringify(additionalPayments);

      // Don't update main payment status for additional payments
    }

    // ✅ AUTO-UPDATE REGISTRATION STATUS based on payment completion
    // Build updated registration data for recalculation
    const updatedRegistrationData = {
      ...registrationData,
      ...updateData,
    };

    // ✅ CRITICAL: Get approved payment slips total for accurate payment status calculation
    // NOTE: We need to calculate BEFORE updating the current slip to approved
    // to avoid counting it twice
    const allSlips = await getPaymentSlipsByRegistration(slip.registrationId);
    const approvedSlipsTotal = allSlips
      .filter(s => s.status === 'approved' || s.slipId === slipId) // Include current slip being approved
      .reduce((sum, s) => sum + (s.amount || 0), 0);

    // ✅ CRITICAL: Recalculate payment status based on CURRENT totalAmount
    // This handles scenarios where admin added special charges after user paid
    const totalAmount = registrationData.totalAmount || 0;
    const paymentStatusUpdate = recalculatePaymentStatus(
      updatedRegistrationData as any,
      totalAmount,
      paymentMode,
      approvedSlipsTotal
    );

    // Apply recalculated payment status
    updateData.paymentStatus = paymentStatusUpdate.payment_status;
    if (paymentStatusUpdate.status) {
      updateData.status = paymentStatusUpdate.status;
    }

    console.log('[Approve Slip] Payment status recalculated:', {
      totalAmount,
      paidAmount: updateData.paidAmount,
      oldPaymentStatus: registrationData.paymentStatus,
      newPaymentStatus: updateData.paymentStatus,
      oldStatus: registrationData.status,
      newStatus: updateData.status,
    });

    await registrationDoc.ref.update(updateData);

    console.log(`[Approve Slip] Updated eventRegistrations for ${slip.registrationId}:`, {
      paymentType: slip.paymentType,
      paymentStatus: updateData.paymentStatus,
      status: updateData.status,
    });
  }
}

/**
 * Reject a payment slip
 */
export async function rejectPaymentSlip(
  slipId: string,
  reviewerId: string,
  rejectionReason: string,
  adminNotes?: string
): Promise<void> {
  const db = adminDb();
  const reviewedAt = new Date().toISOString();

  // 1. Get slip details first
  const slipDoc = await db.collection('paymentSlips').doc(slipId).get();
  if (!slipDoc.exists) {
    throw new Error('Payment slip not found');
  }
  const slip = slipDoc.data() as PaymentSlip;

  // 2. Update payment slip status
  await db
    .collection('paymentSlips')
    .doc(slipId)
    .update({
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt,
      rejectionReason,
      adminNotes: adminNotes || null,
      updatedAt: reviewedAt,
    });

  // 3. Update eventRegistrations record to reflect rejection
  // Reset to "pending review" status so user knows they need to upload again
  const registrationsRef = db.collection('eventRegistrations');
  const snapshot = await registrationsRef
    .where('registrationId', '==', slip.registrationId)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const registrationDoc = snapshot.docs[0];
    const registrationData = registrationDoc.data();
    const updateData: Record<string, any> = {
      updatedAt: reviewedAt,
    };

    // Clear the slip URL and reset ONLY payment_status
    if (slip.paymentType === 'deposit') {
      updateData.depositSlipUrl = '';
      updateData.depositPaidDate = null;
      updateData.depositPaid = false;

      // Reset paid amount
      const currentPaid = registrationData.paidAmount || 0;
      updateData.paidAmount = Math.max(0, currentPaid - slip.amount);

      updateData.paymentStatus = 'รอชำระมัดจำ';

      // Clear remaining deadline (will need to be recalculated on next deposit approval)
      updateData.remainingDeadline = null;
      // Do NOT update 'status' - that's for registration confirmation by admin
    } else if (slip.paymentType === 'remaining') {
      updateData.remainingSlipUrl = '';
      updateData.remainingPaidDate = null;
      updateData.remainingPaid = false;

      // Reset paid amount
      const currentPaid = registrationData.paidAmount || 0;
      updateData.paidAmount = Math.max(0, currentPaid - slip.amount);

      updateData.paymentStatus = 'รอชำระยอดคงเหลือ';
      // Do NOT update 'status'
    } else if (slip.paymentType === 'full') {
      // ✅ Clear Full Payment Fields when rejected
      updateData.fullPaymentSlipUrl = '';
      updateData.fullPaymentPaidDate = null;
      updateData.fullPaymentPaid = false;
      updateData.paidAmount = 0;
      updateData.paymentStatus = 'รอชำระเงิน';

      // ✅ Clear all deposit/remaining fields (should not exist in full payment mode)
      updateData.depositAmount = 0;
      updateData.remainingAmount = 0;
      updateData.depositSlipUrl = '';
      updateData.remainingSlipUrl = '';
      updateData.depositPaidDate = null;
      updateData.remainingPaidDate = null;
      updateData.depositPaid = false;
      updateData.remainingPaid = false;
      updateData.depositDeadline = null;
      updateData.remainingDeadline = null;
    } else if (slip.paymentType === 'additional') {
      // Sync rejection to eventRegistrations.additionalPayments
      const currentData = registrationDoc.data();
      let additionalPayments: any[] = [];

      try {
        additionalPayments = currentData.additionalPayments
          ? JSON.parse(currentData.additionalPayments)
          : [];
      } catch (err) {
        console.error('Error parsing additional payments:', err);
        additionalPayments = [];
      }

      // Update or add this payment with rejected status
      const existingIndex = additionalPayments.findIndex(
        (p: any) => p.paymentId === slip.slipId
      );

      const paymentEntry = {
        paymentId: slip.slipId,
        amount: slip.amount,
        reason: slip.description || 'ชำระเงินเพิ่มเติม',
        slipUrl: slip.slipUrl,
        uploadedAt: slip.uploadedAt,
        rejectedAt: reviewedAt,
        rejectedBy: reviewerId,
        rejectionReason: rejectionReason,
        status: 'ปฏิเสธ',
      };

      if (existingIndex !== -1) {
        additionalPayments[existingIndex] = paymentEntry;
      } else {
        additionalPayments.push(paymentEntry);
      }

      updateData.additionalPayments = JSON.stringify(additionalPayments);

      // Don't update main payment status for additional payments
    }

    // ✅ AUTO-UPDATE REGISTRATION STATUS based on payment completion after rejection
    // Calculate if registration is still fully paid after this rejection
    const totalAmount = registrationData.totalAmount || 0;
    const currentPaidAmount = updateData.paidAmount !== undefined ? updateData.paidAmount : (registrationData.paidAmount || 0);

    // Parse additional payments to check if still fully paid
    const additionalPaymentsJson = slip.paymentType === 'additional'
      ? updateData.additionalPayments
      : registrationData.additionalPayments;
    const additionalPayments = parseAdditionalPayments(additionalPaymentsJson);

    // Check if still fully paid using the utility function
    const fullyPaid = isFullyPaid(totalAmount, currentPaidAmount, additionalPayments);

    // Update status field based on payment completion
    if (fullyPaid) {
      updateData.status = 'ยืนยันแล้ว'; // Still confirmed if still fully paid
    } else {
      updateData.status = 'รอดำเนินการ'; // Back to pending if no longer fully paid
    }

    await registrationDoc.ref.update(updateData);

    console.log(`[Reject Slip] Updated eventRegistrations for ${slip.registrationId}:`, {
      paymentType: slip.paymentType,
      paymentStatus: updateData.paymentStatus,
      status: updateData.status,
      fullyPaid,
    });
  }
}

/**
 * Update payment slip details (for admin corrections)
 */
export async function updatePaymentSlip(
  slipId: string,
  updates: Partial<Omit<PaymentSlip, 'slipId' | 'createdAt'>>
): Promise<void> {
  const db = adminDb();
  const updatedAt = new Date().toISOString();

  await db
    .collection('paymentSlips')
    .doc(slipId)
    .update({
      ...updates,
      updatedAt,
    });
}

/**
 * Delete a payment slip (soft delete by setting status to rejected)
 */
export async function deletePaymentSlip(
  slipId: string,
  adminId: string,
  reason: string
): Promise<void> {
  await rejectPaymentSlip(slipId, adminId, reason, 'Deleted by admin');
}

/**
 * Calculate payment summary for a registration
 * Gets all slips and calculates totals, balance, etc.
 */
export async function getPaymentSummaryForRegistration(
  registrationId: string,
  totalAmount: number
): Promise<PaymentSummary> {
  const slips = await getPaymentSlipsByRegistration(registrationId);
  return calculatePaymentSummary(totalAmount, slips);
}

/**
 * Get pending payment slips (for admin review)
 */
export async function getPendingPaymentSlips(
  eventId?: string
): Promise<PaymentSlip[]> {
  const db = adminDb();
  let query = db.collection('paymentSlips').where('status', '==', 'pending');

  if (eventId) {
    query = query.where('eventId', '==', eventId);
  }

  const snapshot = await query.get();

  const slips = snapshot.docs.map((doc) => ({
    ...doc.data(),
  })) as PaymentSlip[];

  // Sort by uploadedAt ascending (oldest first for review)
  slips.sort((a, b) => {
    const dateA = new Date(a.uploadedAt).getTime();
    const dateB = new Date(b.uploadedAt).getTime();
    return dateA - dateB;
  });

  return slips;
}

/**
 * Get payment slips by status
 */
export async function getPaymentSlipsByStatus(
  status: PaymentStatus,
  eventId?: string
): Promise<PaymentSlip[]> {
  const db = adminDb();
  let query = db.collection('paymentSlips').where('status', '==', status);

  if (eventId) {
    query = query.where('eventId', '==', eventId);
  }

  const snapshot = await query.get();

  const slips = snapshot.docs.map((doc) => ({
    ...doc.data(),
  })) as PaymentSlip[];

  // Sort by uploadedAt descending
  slips.sort((a, b) => {
    const dateA = new Date(a.uploadedAt).getTime();
    const dateB = new Date(b.uploadedAt).getTime();
    return dateB - dateA;
  });

  return slips;
}

/**
 * Get payment slips by type
 */
export async function getPaymentSlipsByType(
  paymentType: PaymentType,
  eventId?: string
): Promise<PaymentSlip[]> {
  const db = adminDb();
  let query = db.collection('paymentSlips').where('paymentType', '==', paymentType);

  if (eventId) {
    query = query.where('eventId', '==', eventId);
  }

  const snapshot = await query.get();

  const slips = snapshot.docs.map((doc) => ({
    ...doc.data(),
  })) as PaymentSlip[];

  // Sort by uploadedAt descending
  slips.sort((a, b) => {
    const dateA = new Date(a.uploadedAt).getTime();
    const dateB = new Date(b.uploadedAt).getTime();
    return dateB - dateA;
  });

  return slips;
}

/**
 * Batch approve multiple payment slips
 */
export async function batchApprovePaymentSlips(
  slipIds: string[],
  reviewerId: string,
  adminNotes?: string
): Promise<void> {
  const db = adminDb();
  const batch = db.batch();
  const reviewedAt = new Date().toISOString();

  slipIds.forEach((slipId) => {
    const slipRef = db.collection('paymentSlips').doc(slipId);
    batch.update(slipRef, {
      status: 'approved',
      reviewedBy: reviewerId,
      reviewedAt,
      adminNotes: adminNotes || null,
      updatedAt: reviewedAt,
    });
  });

  await batch.commit();
}

/**
 * Get payment statistics for an event
 */
export async function getEventPaymentStatistics(eventId: string): Promise<{
  totalSlips: number;
  approvedSlips: number;
  pendingSlips: number;
  rejectedSlips: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
  byPaymentType: Record<PaymentType, number>;
}> {
  const slips = await getPaymentSlipsByEvent(eventId);

  const stats = {
    totalSlips: slips.length,
    approvedSlips: 0,
    pendingSlips: 0,
    rejectedSlips: 0,
    totalPaidAmount: 0,
    totalPendingAmount: 0,
    byPaymentType: {
      full: 0,
      deposit: 0,
      remaining: 0,
      additional: 0,
    } as Record<PaymentType, number>,
  };

  slips.forEach((slip) => {
    // Count by status
    if (slip.status === 'approved') {
      stats.approvedSlips++;
      stats.totalPaidAmount += slip.amount;
    } else if (slip.status === 'pending') {
      stats.pendingSlips++;
      stats.totalPendingAmount += slip.amount;
    } else if (slip.status === 'rejected') {
      stats.rejectedSlips++;
    }

    // Count by payment type
    stats.byPaymentType[slip.paymentType]++;
  });

  return stats;
}

/**
 * Check if a registration has pending payment slips
 * Used to prevent editing registrations when there are unapproved slips
 * @param registrationId Registration ID to check
 * @returns True if registration has pending slips, false otherwise
 */
export async function hasPendingPaymentSlips(
  registrationId: string
): Promise<boolean> {
  const slips = await getPaymentSlipsByRegistration(registrationId);
  return slips.some(slip => slip.status === 'pending');
}

/**
 * Get information about pending payment slips for a registration
 * @param registrationId Registration ID to check
 * @returns Object with hasPending (boolean) and count (number) of pending slips
 */
export async function getPendingSlipsInfo(
  registrationId: string
): Promise<{ hasPending: boolean; count: number }> {
  const slips = await getPaymentSlipsByRegistration(registrationId);
  const pendingSlips = slips.filter(slip => slip.status === 'pending');
  return {
    hasPending: pendingSlips.length > 0,
    count: pendingSlips.length
  };
}
