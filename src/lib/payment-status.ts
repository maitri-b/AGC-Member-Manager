// Payment Status Determination and Display Functions
// For Agents Club Deposit Payment System

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
  // Legacy mode: full payment or free event
  if (event.paymentMode !== 'deposit' || registration.totalAmount === 0) {
    // Use existing status logic
    if (registration.totalAmount === 0) {
      return 'ลงทะเบียนแล้ว';
    }

    // Check if confirmed (existing logic)
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

  // New deposit mode
  const { depositPaid, depositDeadline, remainingDeadline, totalAmount, remainingAmount } = registration;

  // Check if fully paid
  if (depositPaid && remainingAmount === 0) {
    return 'ชำระครบแล้ว';
  }

  if (depositPaid && registration.remainingSlipUrl) {
    return 'ชำระครบแล้ว';
  }

  // Check deposit status
  if (!depositPaid) {
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
  if (status === 'ชำระครบแล้ว' || status.includes('ยืนยัน')) {
    return 'bg-green-100 text-green-800';
  }
  if (status === 'พ้นกำหนด') {
    return 'bg-red-100 text-red-800';
  }
  if (status === 'รอชำระมัดจำ' || status === 'รอชำระเงิน') {
    return 'bg-yellow-100 text-yellow-800';
  }
  if (status === 'รอชำระยอดที่เหลือ') {
    return 'bg-blue-100 text-blue-800';
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
