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

import { Event, EventInput, EventRegistration } from '@/types/event';
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
    if (gasStatus === 'รอตรวจสอบ' || gasStatus === 'รอตรวจสอบมัดจำ' || gasStatus === 'รอตรวจสอบยอดคงเหลือ') {
      return gasStatus; // Show "waiting for verification" status
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
  if (event.paymentMode !== 'deposit') {
    // Check if slip was uploaded (even if not verified yet)
    const hasSlip = registration.depositSlipUrl || registration.remainingSlipUrl || (registration as any).slipUrl;

    if (hasSlip) {
      return 'รอตรวจสอบ'; // Slip uploaded, waiting for admin verification
    }

    // Check if confirmed by admin
    const status = registration.status || '';
    const statusLower = status.toLowerCase();
    const isConfirmed =
      statusLower === 'confirmed' ||
      statusLower === 'attended' ||
      status.includes('ยืนยัน') ||
      status.includes('ตรวจสอบแล้ว') ||
      status.includes('ชำระครบแล้ว');

    return isConfirmed ? 'ชำระครบแล้ว' : 'รอชำระเงิน';
  }

  // Priority 4: Deposit mode
  const { depositPaid, depositDeadline, remainingDeadline, depositSlipUrl, remainingSlipUrl, remainingAmount } = registration;

  // Check if fully paid
  if (depositPaid && remainingAmount === 0) {
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
  if (status === 'ชำระครบแล้ว' || status.includes('ยืนยัน')) {
    return 'bg-green-100 text-green-800';
  }

  // Pending verification states (purple/indigo - waiting for admin action)
  if (status === 'รอตรวจสอบ' || status === 'รอตรวจสอบมัดจำ' || status === 'รอตรวจสอบยอดคงเหลือ') {
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
  if (status === 'รอชำระมัดจำ' || status === 'รอชำระเงิน') {
    return 'bg-yellow-100 text-yellow-800';
  }

  // Partial payment states (blue - deposit paid, waiting for remaining)
  if (status === 'รอชำระยอดที่เหลือ') {
    return 'bg-blue-100 text-blue-800';
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
