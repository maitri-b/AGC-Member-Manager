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
