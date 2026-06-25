// Payment Deadline Calculation and Formatting Functions
// For Agents Club Deposit Payment System

import { Event, EventInput } from '@/types/event';

/**
 * Calculate deposit deadline based on event configuration
 * @param event Event configuration
 * @param registrationDate ISO timestamp of registration
 * @returns ISO timestamp of deadline or empty string if no deadline
 */
export function calculateDepositDeadline(
  event: Event | EventInput,
  registrationDate: string
): string {
  if (!event.depositDeadlineType || event.depositDeadlineType === 'none') {
    return '';
  }

  if (event.depositDeadlineType === 'fixed' && event.depositDeadlineFixed) {
    // Convert YYYY-MM-DD to midnight (00:00) in Bangkok timezone
    const deadlineDate = new Date(event.depositDeadlineFixed + 'T00:00:00+07:00');
    return deadlineDate.toISOString();
  }

  if (event.depositDeadlineType === 'hours' && event.depositDeadlineHours) {
    const regDate = new Date(registrationDate);
    const deadlineDate = new Date(regDate.getTime() + event.depositDeadlineHours * 60 * 60 * 1000);
    return deadlineDate.toISOString();
  }

  return '';
}

/**
 * Calculate remaining balance deadline based on event configuration
 * @param event Event configuration
 * @param depositPaidDate ISO timestamp when deposit was paid
 * @returns ISO timestamp of deadline or empty string if no deadline
 */
export function calculateRemainingDeadline(
  event: Event | EventInput,
  depositPaidDate: string
): string {
  if (!event.remainingDeadlineType || event.remainingDeadlineType === 'none') {
    return '';
  }

  if (event.remainingDeadlineType === 'fixed' && event.remainingDeadlineFixed) {
    const deadlineDate = new Date(event.remainingDeadlineFixed + 'T00:00:00+07:00');
    return deadlineDate.toISOString();
  }

  if (event.remainingDeadlineType === 'hours' && event.remainingDeadlineHours) {
    const paidDate = new Date(depositPaidDate);
    const deadlineDate = new Date(paidDate.getTime() + event.remainingDeadlineHours * 60 * 60 * 1000);
    return deadlineDate.toISOString();
  }

  return '';
}

/**
 * Check if deadline has passed (in Bangkok timezone)
 * @param deadlineISO ISO timestamp of deadline
 * @returns true if deadline has passed
 */
export function isDeadlinePassed(deadlineISO: string): boolean {
  if (!deadlineISO) return false;
  const deadline = new Date(deadlineISO);
  const now = new Date();
  return now > deadline;
}

/**
 * Calculate deposit and remaining amounts
 * @param totalAmount Total registration fee
 * @param event Event configuration
 * @param attendeeCount Number of attendees (for per-person deposit calculation)
 * @returns { depositAmount, remainingAmount }
 */
export function calculatePaymentSplit(
  totalAmount: number,
  event: Event | EventInput,
  attendeeCount: number = 1
): { depositAmount: number; remainingAmount: number } {
  if (event.paymentMode !== 'deposit' || totalAmount === 0) {
    return { depositAmount: 0, remainingAmount: totalAmount };
  }

  let depositAmount = 0;

  if (event.useDepositPercentage && event.depositPercentage) {
    depositAmount = Math.round(totalAmount * event.depositPercentage / 100);
  } else if (event.depositAmount) {
    // Multiply per-person deposit rate by attendee count
    depositAmount = Math.min(event.depositAmount * attendeeCount, totalAmount);
  }

  const remainingAmount = totalAmount - depositAmount;

  return { depositAmount, remainingAmount };
}

/**
 * Format deadline for display (Bangkok timezone)
 * @param deadlineISO ISO timestamp
 * @returns Formatted string "DD/MM/YYYY HH:MM น."
 */
export function formatDeadline(deadlineISO: string): string {
  if (!deadlineISO) return '';

  const deadline = new Date(deadlineISO);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  const formatted = deadline.toLocaleString('th-TH', options);
  return formatted + ' น.';
}

/**
 * Get human-readable time remaining until deadline
 * @param deadlineISO ISO timestamp
 * @returns String like "เหลืออีก 2 วัน 5 ชั่วโมง" or "พ้นกำหนดแล้ว"
 */
export function getTimeRemaining(deadlineISO: string): string {
  if (!deadlineISO) return '';

  const deadline = new Date(deadlineISO);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();

  if (diffMs < 0) {
    return 'พ้นกำหนดแล้ว';
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `เหลืออีก ${days} วัน ${hours} ชั่วโมง`;
  } else if (hours > 0) {
    return `เหลืออีก ${hours} ชั่วโมง ${minutes} นาที`;
  } else {
    return `เหลืออีก ${minutes} นาที`;
  }
}
