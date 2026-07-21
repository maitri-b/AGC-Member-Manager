/**
 * Bank Account Type Definitions
 */

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrCodeUrl?: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface BankAccountInput {
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrCodeUrl?: string;
  isActive: boolean;
  isDefault: boolean;
}
