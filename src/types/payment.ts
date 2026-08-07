// Payment Slip Types for Agents Club Member Manager

export type PaymentType = 'full' | 'deposit' | 'remaining' | 'additional' | 'refund';
export type PaymentStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'bank_transfer' | 'cash' | 'credit_card' | 'other';

/**
 * Payment Slip - Individual payment transaction record
 */
export interface PaymentSlip {
  slipId: string;                   // Auto-generated unique ID
  registrationId: string;           // FK to eventRegistrations
  eventId: string;                  // FK to events (for easier querying)

  // Payment details
  amount: number;                   // Amount paid in this transaction
  paymentType: PaymentType;         // Type of payment
  description?: string;             // User-provided note (optional)

  // Slip upload
  slipUrl: string;                  // Google Drive URL or other storage
  uploadedAt: string;               // ISO timestamp when slip was uploaded
  uploadedBy: string;               // userId or lineUserId
  uploadedByName?: string;          // Name of uploader (for admin uploaded slips)

  // Admin approval workflow
  status: PaymentStatus;            // Current status of this payment
  reviewedBy?: string;              // Admin who reviewed (optional)
  reviewedByName?: string;          // Name of reviewer (optional)
  reviewedAt?: string;              // ISO timestamp when reviewed (optional)
  rejectionReason?: string;         // Reason if rejected (optional)

  // Additional metadata
  paymentMethod?: PaymentMethod;    // How payment was made (optional)
  bankName?: string;                // Bank name if transfer (optional)
  transferDate?: string;            // Date on bank slip (optional)
  adminNotes?: string;              // Internal admin notes (optional)

  // Timestamps
  createdAt: string;                // ISO timestamp when record created
  updatedAt?: string;               // ISO timestamp when last updated
}

/**
 * Payment Summary - Calculated from paymentSlips for a registration
 */
export interface PaymentSummary {
  registrationId: string;
  totalAmount: number;              // Total amount due
  totalPaid: number;                // Sum of approved payments
  totalPending: number;             // Sum of pending payments
  balance: number;                  // Remaining balance (totalAmount - totalPaid)
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  lastPaymentDate?: string;         // Last approved payment date
  paymentsCount: number;            // Total number of payment slips
  approvedCount: number;            // Number of approved payments
  pendingCount: number;             // Number of pending payments
  rejectedCount: number;            // Number of rejected payments
}

/**
 * Payment Type Labels (Thai)
 */
export const PaymentTypeLabels: Record<PaymentType, string> = {
  full: 'ชำระเต็มจำนวน',
  deposit: 'ชำระมัดจำ',
  remaining: 'ชำระยอดคงเหลือ',
  additional: 'ชำระเพิ่มเติม',
  refund: 'โอนเงินคืน (Refund)',
};

/**
 * Payment Status Labels (Thai)
 */
export const PaymentStatusLabels: Record<PaymentStatus, string> = {
  pending: 'รอตรวจสอบ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ปฏิเสธ',
};

/**
 * Payment Method Labels (Thai)
 */
export const PaymentMethodLabels: Record<PaymentMethod, string> = {
  bank_transfer: 'โอนผ่านธนาคาร',
  cash: 'เงินสด',
  credit_card: 'บัตรเครดิต',
  other: 'อื่นๆ',
};

/**
 * Helper function to generate slip ID
 */
export function generateSlipId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `SLIP_${timestamp}_${random}`;
}

/**
 * Helper function to calculate payment summary
 */
export function calculatePaymentSummary(
  totalAmount: number,
  slips: PaymentSlip[]
): PaymentSummary {
  const approved = slips.filter(s => s.status === 'approved');
  const pending = slips.filter(s => s.status === 'pending');
  const rejected = slips.filter(s => s.status === 'rejected');

  const totalPaid = approved.reduce((sum, s) => sum + s.amount, 0);
  const totalPending = pending.reduce((sum, s) => sum + s.amount, 0);
  const balance = totalAmount - totalPaid;

  let paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  if (totalPaid === 0) {
    paymentStatus = 'unpaid';
  } else if (totalPaid < totalAmount) {
    paymentStatus = 'partial';
  } else if (totalPaid === totalAmount) {
    paymentStatus = 'paid';
  } else {
    paymentStatus = 'overpaid';
  }

  const lastPayment = approved.sort((a, b) =>
    new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  )[0];

  return {
    registrationId: slips[0]?.registrationId || '',
    totalAmount,
    totalPaid,
    totalPending,
    balance,
    paymentStatus,
    lastPaymentDate: lastPayment?.uploadedAt,
    paymentsCount: slips.length,
    approvedCount: approved.length,
    pendingCount: pending.length,
    rejectedCount: rejected.length,
  };
}
