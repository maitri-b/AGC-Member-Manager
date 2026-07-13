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

  await db.collection('paymentSlips').doc(slipId).set(newSlip);

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
    const updateData: Record<string, any> = {
      updatedAt: reviewedAt,
    };

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Update ONLY payment_status (not status - that's for registration confirmation)
    if (slip.paymentType === 'deposit') {
      updateData.depositPaid = true;
      updateData.depositPaidDate = today;
      updateData.depositSlipUrl = slip.slipUrl; // Store slip URL
      updateData.paymentStatus = 'ชำระมัดจำแล้ว';
      // Do NOT update 'status' - that's for registration confirmation by admin
    } else if (slip.paymentType === 'remaining') {
      updateData.remainingPaidDate = today; // Set paid date for remaining payment
      updateData.remainingSlipUrl = slip.slipUrl; // Store slip URL
      updateData.paymentStatus = 'ชำระยอดคงเหลือแล้ว';
      // Do NOT update 'status'
    } else if (slip.paymentType === 'full') {
      updateData.depositPaid = true;
      updateData.depositPaidDate = today;
      updateData.remainingPaidDate = today; // Full payment also counts as remaining paid
      updateData.remainingSlipUrl = slip.slipUrl; // Store slip URL for full payment
      updateData.paymentStatus = 'ชำระเต็มจำนวนแล้ว';
      // Do NOT update 'status'
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

    await registrationDoc.ref.update(updateData);

    console.log(`[Approve Slip] Updated eventRegistrations for ${slip.registrationId}:`, {
      paymentType: slip.paymentType,
      paymentStatus: updateData.paymentStatus,
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
    const updateData: Record<string, any> = {
      updatedAt: reviewedAt,
    };

    // Clear the slip URL and reset ONLY payment_status
    if (slip.paymentType === 'deposit') {
      updateData.depositSlipUrl = '';
      updateData.depositPaidDate = null;
      updateData.depositPaid = false;
      updateData.paymentStatus = 'รอชำระมัดจำ';
      // Do NOT update 'status' - that's for registration confirmation by admin
    } else if (slip.paymentType === 'remaining') {
      updateData.remainingSlipUrl = '';
      updateData.remainingPaidDate = null;
      updateData.paymentStatus = 'รอชำระยอดคงเหลือ';
      // Do NOT update 'status'
    } else if (slip.paymentType === 'full') {
      updateData.depositSlipUrl = '';
      updateData.remainingSlipUrl = '';
      updateData.depositPaidDate = null;
      updateData.remainingPaidDate = null;
      updateData.depositPaid = false;
      updateData.paymentStatus = 'รอชำระเงิน';
      // Do NOT update 'status'
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

    await registrationDoc.ref.update(updateData);

    console.log(`[Reject Slip] Updated eventRegistrations for ${slip.registrationId}:`, {
      paymentType: slip.paymentType,
      paymentStatus: updateData.paymentStatus,
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
