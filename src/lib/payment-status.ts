/**
 * Payment Status Determination and Display Functions
 * For Agents Club Payment System
 *
 * Supports 2 payment modes:
 * 1. Full Payment Mode (paymentMode: 'full') - จ่ายครั้งเดียวเต็มจำนวน
 * 2. Deposit Payment Mode (paymentMode: 'deposit') - จ่ายแบบแบ่งชำระ 2 ครั้ง
 *
 * See PAYMENT_SYSTEM.md for detailed documentation
 */

import { Event, EventInput, EventRegistration, AdditionalPayment } from '@/types/event';
import { isDeadlinePassed } from './payment-deadlines';

/**
 * Determine current payment status based on registration data
 * Handles both legacy (full payment) and new (deposit) modes
 * @param registration Event registration data
 * @param event Event configuration
 * @returns Current payment status string
 */
export function determinePaymentStatus(
  registration: EventRegistration,
  event: Event | EventInput
): string {
  // Priority 1: Use payment_status from Google Sheets if available (set by GAS)
  // This reflects the actual slip upload and admin verification status
  if (registration.paymentStatus && registration.paymentStatus !== '') {
    const gasStatus = registration.paymentStatus;

    // Map GAS statuses to display statuses
    if (gasStatus === 'รอตรวจสอบ') {
      return 'รอตรวจสอบสลิป'; // Show "waiting for slip verification" status
    }
    if (gasStatus === 'รอตรวจสอบมัดจำ' || gasStatus === 'รอตรวจสอบยอดคงเหลือ') {
      return gasStatus; // Show specific deposit/remaining verification status
    }
    if (gasStatus.includes('ยืนยัน') || gasStatus.includes('ชำระครบ')) {
      return 'ชำระครบแล้ว';
    }
    if (gasStatus.includes('ปฏิเสธ')) {
      return 'ปฏิเสธสลิป';
    }
    // Return as-is for other statuses
    return gasStatus;
  }

  // Priority 2: Free event
  if (registration.totalAmount === 0) {
    return 'ลงทะเบียนแล้ว';
  }

  // Priority 3: Full payment mode (non-deposit)
  // Full Payment Mode is identified ONLY by event.paymentMode === 'full'
  if (event.paymentMode === 'full') {
    // ✅ Use Full Payment Fields (with backward compatibility for old data)
    const fullPaymentPaid = registration.fullPaymentPaid ?? registration.depositPaid;
    const fullPaymentSlipUrl = registration.fullPaymentSlipUrl || registration.remainingSlipUrl || registration.depositSlipUrl || (registration as any).slipUrl;
    const fullPaymentDeadline = registration.fullPaymentDeadline || registration.remainingDeadline;

    // ✅ Check actual amounts paid vs total amount (including additional payments)
    const totalAmount = registration.totalAmount || 0;
    const fullPaymentAmountPaid = (registration as any).fullPaymentAmountPaid || 0;
    const depositAmountPaid = (registration as any).depositAmountPaid || 0;
    const actualPaid = fullPaymentAmountPaid || depositAmountPaid;

    // ✅ Parse additional payments
    const additionalPayments = parseAdditionalPayments(registration.additionalPayments);

    // Check if payment already approved
    if (fullPaymentPaid) {
      // ✅ Use isFullyPaid() to check if fully paid including additional payments
      if (isFullyPaid(totalAmount, actualPaid, additionalPayments)) {
        return 'ชำระครบแล้ว';
      } else if (actualPaid > 0) {
        // ✅ Partial payment approved - need additional payment
        // Check if additional payment slip is pending
        const hasPendingAdditional = additionalPayments.some(p => p.status === 'รอตรวจสอบ');
        if (hasPendingAdditional) {
          return 'รอตรวจสอบ';
        }
        return 'รอชำระเพิ่มเติม';
      }
      // Fallback: Marked as paid but no amount recorded (old data)
      return 'ชำระครบแล้ว';
    }

    // Check if slip was uploaded (even if not verified yet)
    if (fullPaymentSlipUrl) {
      return 'รอตรวจสอบ'; // Slip uploaded, waiting for admin verification
    }

    // Check if payment deadline passed
    if (fullPaymentDeadline && isDeadlinePassed(fullPaymentDeadline)) {
      return 'พ้นกำหนด'; // Payment overdue
    }

    return 'รอชำระเงิน';
  }

  // Priority 4: Deposit mode
  const {
    depositPaid,
    depositDeadline,
    remainingDeadline,
    depositSlipUrl,
    remainingSlipUrl,
    remainingAmount,
    depositAmount,
    totalAmount: regTotalAmount,
  } = registration;

  // ✅ NEW: Track actual amounts paid
  const depositAmountPaid = (registration as any).depositAmountPaid || 0;
  const remainingAmountPaid = (registration as any).remainingAmountPaid || 0;
  const remainingPaid = (registration as any).remainingPaid || false;
  const totalAmount = regTotalAmount || 0;
  const totalPaid = depositAmountPaid + remainingAmountPaid;

  // Check if fully paid (based on actual amounts)
  if (depositPaid && remainingPaid) {
    // ✅ Verify total paid covers total amount
    if (totalPaid >= totalAmount) {
      return 'ชำระครบแล้ว';
    } else if (totalPaid > 0) {
      // Both payments approved but still short
      return 'รอชำระส่วนที่เหลือ';
    }
    // Fallback for old data
    return 'ชำระครบแล้ว';
  }

  // Legacy check: remainingAmount === 0 (for backward compatibility)
  // ⚠️ IMPORTANT: Only apply this check in Deposit Mode
  // In Full Payment Mode, remainingAmount is always 0 (no split)
  if (event.paymentMode === 'deposit' && depositPaid && remainingAmount === 0) {
    return 'ชำระครบแล้ว';
  }

  if (depositPaid && remainingSlipUrl) {
    return 'รอตรวจสอบยอดคงเหลือ';
  }

  // Check deposit status
  if (!depositPaid) {
    // Check if slip uploaded but not verified
    if (depositSlipUrl) {
      return 'รอตรวจสอบมัดจำ';
    }

    // Check if deposit deadline passed
    if (depositDeadline && isDeadlinePassed(depositDeadline)) {
      return 'พ้นกำหนด'; // Deposit overdue
    }
    return 'รอชำระมัดจำ';
  }

  // Deposit paid, check remaining
  if (remainingDeadline && isDeadlinePassed(remainingDeadline)) {
    return 'พ้นกำหนด'; // Remaining overdue
  }

  return 'รอชำระยอดที่เหลือ';
}

/**
 * Get status badge color class for UI display
 * @param status Payment status string
 * @returns Tailwind CSS class names for badge styling
 */
export function getStatusBadgeClass(status: string): string {
  // Success states
  if (status === 'ชำระครบแล้ว' || status === 'ชำระเต็มจำนวนแล้ว' || status.includes('ยืนยัน')) {
    return 'bg-green-100 text-green-800';
  }

  // Overpayment state (paid more than required)
  if (status === 'ชำระเกินจำนวน') {
    return 'bg-cyan-100 text-cyan-800';
  }

  // Pending verification states (purple/indigo - waiting for admin action)
  if (status === 'รอตรวจสอบสลิป' || status === 'รอตรวจสอบ' || status === 'รอตรวจสอบมัดจำ' || status === 'รอตรวจสอบยอดคงเหลือ') {
    return 'bg-purple-100 text-purple-800';
  }

  // Rejected states
  if (status.includes('ปฏิเสธ')) {
    return 'bg-red-100 text-red-800';
  }

  // Overdue states
  if (status === 'พ้นกำหนด') {
    return 'bg-red-100 text-red-800';
  }

  // Waiting for payment states (yellow - user action required)
  if (status === 'รอชำระมัดจำ' || status === 'รอชำระเงิน' || status === 'รอชำระเพิ่มเติม') {
    return 'bg-yellow-100 text-yellow-800';
  }

  // Partial payment states (blue - deposit paid, waiting for remaining)
  if (status === 'รอชำระยอดที่เหลือ') {
    return 'bg-blue-100 text-blue-800';
  }

  // Additional payment pending verification (purple - waiting for admin)
  if (status === 'รอตรวจสอบเงินเพิ่มเติม') {
    return 'bg-purple-100 text-purple-800';
  }

  // Refund statuses
  if (status === 'รอคืนเงิน') {
    return 'bg-orange-100 text-orange-800'; // Orange - waiting for refund
  }
  if (status === 'คืนเงินแล้ว') {
    return 'bg-blue-100 text-blue-800'; // Blue - refund completed
  }
  if (status === 'ยกเลิก - ไม่คืนเงิน') {
    return 'bg-gray-100 text-gray-800'; // Gray - cancelled no refund
  }

  // Free or registered
  if (status === 'ลงทะเบียนแล้ว') {
    return 'bg-gray-100 text-gray-800';
  }

  return 'bg-gray-100 text-gray-800';
}

/**
 * Check if registration needs action (payment overdue or due soon)
 * @param registration Event registration data
 * @param hoursThreshold Hours before deadline to consider "due soon" (default: 24)
 * @returns true if payment action is needed
 */
export function needsPaymentAction(
  registration: EventRegistration,
  hoursThreshold: number = 24
): boolean {
  const { depositPaid, depositDeadline, remainingDeadline } = registration;

  const relevantDeadline = !depositPaid ? depositDeadline : remainingDeadline;
  if (!relevantDeadline) return false;

  const deadline = new Date(relevantDeadline);
  const now = new Date();
  const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  return hoursRemaining < hoursThreshold && hoursRemaining > 0;
}

/**
 * Parse additional payments from JSON string
 * @param additionalPaymentsJson JSON stringified AdditionalPayment[]
 * @returns Parsed AdditionalPayment array or empty array if invalid
 */
export function parseAdditionalPayments(additionalPaymentsJson?: string): AdditionalPayment[] {
  if (!additionalPaymentsJson) return [];

  try {
    const parsed = JSON.parse(additionalPaymentsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error parsing additional payments:', error);
    return [];
  }
}

/**
 * Calculate additional payment required based on current total vs paid amount
 * @param totalAmount Current total amount (may have been adjusted by admin)
 * @param paidAmount Total amount paid so far (deposit + remaining + approved additional)
 * @param additionalPayments Array of additional payments
 * @returns Amount still required to be paid (0 if fully paid)
 */
export function calculateAdditionalPaymentRequired(
  totalAmount: number,
  paidAmount: number = 0,
  additionalPayments: AdditionalPayment[] = []
): number {
  // Sum all approved additional payments
  const approvedAdditional = additionalPayments
    .filter(p => p.status === 'อนุมัติแล้ว')
    .reduce((sum, p) => sum + p.amount, 0);

  // Calculate unpaid amount
  const unpaid = totalAmount - (paidAmount + approvedAdditional);

  return Math.max(0, unpaid);
}

/**
 * Check if registration is fully paid (including any additional payments)
 * @param totalAmount Current total amount
 * @param paidAmount Total amount paid so far
 * @param additionalPayments Array of additional payments
 * @returns true if fully paid
 */
export function isFullyPaid(
  totalAmount: number,
  paidAmount: number = 0,
  additionalPayments: AdditionalPayment[] = []
): boolean {
  return calculateAdditionalPaymentRequired(totalAmount, paidAmount, additionalPayments) === 0;
}

/**
 * Recalculate payment status when totalAmount changes
 * This handles scenarios where admin adds/removes special charges
 * @param registration Current registration data
 * @param newTotalAmount New total amount after changes
 * @param paymentMode Event payment mode ('full' or 'deposit')
 * @param approvedSlipsTotal Total amount from approved payment slips (optional, will be fetched if not provided)
 * @returns Object with updated payment_status and status fields
 */
export function recalculatePaymentStatus(
  registration: EventRegistration,
  newTotalAmount: number,
  paymentMode: string = 'full',
  approvedSlipsTotal: number = 0
): { payment_status: string; status?: string; overpayment_amount?: number } {
  // Calculate actual total paid from tracked amounts
  // ✅ CRITICAL FIX: Use registration object which may have been updated with new values
  const depositAmountPaid = (registration as any).depositAmountPaid || 0;
  const remainingAmountPaid = (registration as any).remainingAmountPaid || 0;
  const fullPaymentAmountPaid = (registration as any).fullPaymentAmountPaid || 0;
  const additionalPaymentAmountPaid = (registration as any).additionalPaymentAmountPaid || 0;
  let actualTotalPaid = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;

  console.log('[recalculatePaymentStatus] Calculating from tracked amounts:', {
    registrationId: registration.registrationId,
    depositAmountPaid,
    remainingAmountPaid,
    fullPaymentAmountPaid,
    additionalPaymentAmountPaid,
    actualTotalPaid,
  });

  // ✅ CRITICAL FIX: Only add approvedSlipsTotal if we don't have tracked amounts
  // Otherwise we'd be double-counting (the slip approval already sets *AmountPaid fields)
  const hasTrackedAmounts = fullPaymentAmountPaid > 0 || depositAmountPaid > 0 || remainingAmountPaid > 0 || additionalPaymentAmountPaid > 0;

  if (approvedSlipsTotal > 0 && !hasTrackedAmounts) {
    // Legacy mode: use slips total for old registrations without tracked amounts
    console.log(`[recalculatePaymentStatus] Using approvedSlipsTotal for registration ${registration.registrationId}:`, {
      approvedSlipsTotal,
      newTotalAmount,
    });
    actualTotalPaid = approvedSlipsTotal;
  } else if (hasTrackedAmounts) {
    console.log(`[recalculatePaymentStatus] Registration ${registration.registrationId}:`, {
      fullPaymentAmountPaid,
      depositAmountPaid,
      remainingAmountPaid,
      additionalPaymentAmountPaid,
      actualTotalPaid,
      newTotalAmount,
    });
  }

  // ✅ CRITICAL FIX: Use actualTotalPaid directly instead of fallback to registration.paidAmount
  // The registration.paidAmount may already include amounts that are also in tracked fields,
  // causing the fullyPaid check to incorrectly return true
  const currentPaidAmount = actualTotalPaid;
  const additionalPayments = parseAdditionalPayments(registration.additionalPayments);

  console.log('[recalculatePaymentStatus] Checking if fully paid:', {
    registrationId: registration.registrationId,
    newTotalAmount,
    currentPaidAmount,
    additionalPayments,
  });

  const fullyPaid = isFullyPaid(newTotalAmount, currentPaidAmount, additionalPayments);

  const result: { payment_status: string; status?: string; overpayment_amount?: number } = {
    payment_status: registration.paymentStatus || 'รอชำระเงิน'
  };

  // ✅ CHECK FOR OVERPAYMENT (paid > totalAmount)
  if (currentPaidAmount > newTotalAmount && currentPaidAmount > 0) {
    const overpayment = currentPaidAmount - newTotalAmount;
    result.payment_status = 'ชำระเกินจำนวน';
    result.status = 'ยืนยันแล้ว'; // Still confirmed, just overpaid
    result.overpayment_amount = overpayment; // ✅ Store overpayment amount
  } else if (!fullyPaid && currentPaidAmount > 0) {
    // Was fully paid before, but not anymore due to totalAmount increase
    // Update paymentStatus to indicate additional payment needed
    result.overpayment_amount = 0; // Clear overpayment

    if (paymentMode === 'deposit') {
      // Deposit mode: check what's been paid
      if (registration.depositPaid && !(registration as any).remainingPaid) {
        result.payment_status = 'รอชำระยอดที่เหลือ';
      } else if (registration.depositPaid && (registration as any).remainingPaid) {
        result.payment_status = 'รอชำระเพิ่มเติม'; // Need additional payment
      } else {
        result.payment_status = 'รอชำระมัดจำ';
      }
    } else {
      // Full payment mode
      if (registration.fullPaymentPaid) {
        result.payment_status = 'รอชำระเพิ่มเติม'; // Need additional payment
      } else {
        result.payment_status = 'รอชำระเงิน';
      }
    }

    // Change status from "ยืนยันแล้ว" back to "รอดำเนินการ" if payment is no longer complete
    if (registration.status === 'ยืนยันแล้ว') {
      result.status = 'รอดำเนินการ';
    }
  } else if (fullyPaid) {
    // Still fully paid after recalculation
    result.payment_status = 'ชำระครบแล้ว';
    result.status = 'ยืนยันแล้ว';
    result.overpayment_amount = 0; // Clear overpayment - exactly paid
  }

  return result;
}
