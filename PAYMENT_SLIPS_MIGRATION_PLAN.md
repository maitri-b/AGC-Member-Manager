# 💳 Payment Slips Migration Plan

**Project:** Agents Club Member Manager
**Phase:** Payment Slips Refactoring & Migration
**Start Date:** 2026-07-12
**Status:** 🟢 In Progress - Backend Complete

---

## 📊 Overview

### Objective
Refactor payment slip storage from embedded fields in `eventRegistrations` to a separate `paymentSlips` collection to support:
- ✅ Unlimited payment transactions per registration
- ✅ Better payment history tracking
- ✅ Clearer payment type classification
- ✅ Easier querying and reporting

### Current Problems
1. **Limited payment types:** Only `slipUrl`, `depositSlipUrl`, `remainingSlipUrl`
2. **Ambiguous `remainingSlipUrl`:** Used for both "remaining payment" and "full payment" (when deposit = 0)
3. **No support for additional payments:** When attendee count changes or special charges added
4. **Hard to track payment history:** No timestamps, approval status, or notes per slip

---

## 🗂️ Current Structure (Before Migration)

### EventRegistration Fields
```typescript
{
  registrationId: "ABC123",

  // Legacy field
  slipUrl: string;  // ← Used in old events (before deposit system)

  // Current fields
  depositSlipUrl: string;    // ← Deposit payment slip
  remainingSlipUrl: string;  // ← Can mean TWO things:
                             //    1. Remaining payment (if depositAmount > 0)
                             //    2. Full payment (if depositAmount = 0)

  // No field for additional payments!
}
```

### Problems with Current Structure
- ❌ `remainingSlipUrl` is confusing (2 different meanings)
- ❌ Cannot store > 3 payment slips
- ❌ No payment metadata (upload time, approved by, notes)
- ❌ Hard to query "all pending slips"

---

## 🎯 New Structure (After Migration)

### Collection: `paymentSlips`

```typescript
{
  slipId: "SLIP_20260712_001",     // Auto-generated
  registrationId: "ABC123",        // FK to eventRegistrations
  eventId: "event-2026",           // FK to events (for easier querying)

  // Payment details
  amount: 5000,
  paymentType: "deposit" | "remaining" | "full" | "additional",
  description: "ชำระมัดจำ",        // Optional user note

  // Slip upload
  slipUrl: "https://drive.google.com/...",
  uploadedAt: "2026-07-12T10:00:00.000Z",
  uploadedBy: "user123",           // userId or lineUserId

  // Admin approval workflow
  status: "pending" | "approved" | "rejected",
  reviewedBy: "admin456",          // Optional
  reviewedAt: "2026-07-12T11:00:00.000Z", // Optional
  rejectionReason: "",             // Optional

  // Additional metadata
  paymentMethod: "bank_transfer",  // Optional
  bankName: "ธนาคารกรุงเทพ",        // Optional
  transferDate: "2026-07-12",      // Optional (from user input)
  adminNotes: "",                  // Optional (internal notes)
}
```

### Updated EventRegistration Fields

```typescript
{
  registrationId: "ABC123",
  eventId: "event-2026",
  totalAmount: 10000,

  // Remove individual slip URL fields
  // slipUrl: ❌ REMOVED
  // depositSlipUrl: ❌ REMOVED
  // remainingSlipUrl: ❌ REMOVED

  // Keep summary fields only
  totalPaid: 10000,                // Sum of approved payments
  paymentStatus: "paid",           // Calculated status
  lastPaymentDate: "2026-07-12",   // Last approved payment
  paymentsCount: 3,                // Number of payment slips
}
```

---

## 🔄 Migration Strategy

### Step 1: Identify Payment Types

**Rule 1: `slipUrl` (legacy field)**
```
IF slipUrl exists:
  → Create paymentSlip with type="full"
```

**Rule 2: `depositSlipUrl`**
```
IF depositSlipUrl exists:
  → Create paymentSlip with type="deposit"
```

**Rule 3: `remainingSlipUrl` (IMPORTANT!)**
```
IF remainingSlipUrl exists:
  IF depositAmount == 0:
    → Create paymentSlip with type="full"
  ELSE:
    → Create paymentSlip with type="remaining"
```

### Step 2: Migration Script Logic

```javascript
// For each registration in eventRegistrations:

const slips = [];

// 1. Migrate slipUrl (legacy)
if (registration.slipUrl) {
  slips.push({
    paymentType: 'full',
    slipUrl: registration.slipUrl,
    amount: registration.totalAmount || 0,
    uploadedAt: registration.registeredAt, // Best guess
    status: 'approved', // Legacy data assumed approved
  });
}

// 2. Migrate depositSlipUrl
if (registration.depositSlipUrl) {
  slips.push({
    paymentType: 'deposit',
    slipUrl: registration.depositSlipUrl,
    amount: registration.depositAmount || 0,
    uploadedAt: registration.depositPaidDate || registration.registeredAt,
    status: 'approved',
  });
}

// 3. Migrate remainingSlipUrl (check depositAmount!)
if (registration.remainingSlipUrl) {
  const isFullPayment = !registration.depositAmount || registration.depositAmount === 0;

  slips.push({
    paymentType: isFullPayment ? 'full' : 'remaining',
    slipUrl: registration.remainingSlipUrl,
    amount: isFullPayment
      ? registration.totalAmount
      : registration.remainingAmount || 0,
    uploadedAt: registration.remainingPaidDate || registration.registeredAt,
    status: 'approved',
  });
}

// Save to paymentSlips collection
for (const slip of slips) {
  await db.collection('paymentSlips').add({
    ...slip,
    slipId: generateSlipId(),
    registrationId: registration.registrationId,
    eventId: registration.eventId,
    uploadedBy: registration.userId || registration.lineUserId || 'system',
    description: getPaymentTypeLabel(slip.paymentType),
  });
}
```

---

## 📋 Files to Update

### Backend (API Routes)
- [ ] `src/app/api/events/[eventId]/detail/route.ts` - Show payment slips
- [ ] `src/app/api/events/[eventId]/register/route.ts` - Remove slip URL logic
- [ ] `src/app/api/events/[eventId]/update-payment/route.ts` - Use paymentSlips
- [ ] `src/app/api/webhooks/gas-slip-upload/route.ts` - Create paymentSlip instead of updating registration
- [ ] NEW: `src/app/api/payments/upload/route.ts` - Upload new slip
- [ ] NEW: `src/app/api/payments/[slipId]/approve/route.ts` - Approve slip
- [ ] NEW: `src/app/api/payments/[slipId]/reject/route.ts` - Reject slip

### Library Functions
- [ ] `src/lib/event-sheets.ts` - Add paymentSlip functions
- [ ] NEW: `src/lib/payment-slips.ts` - Payment slip helpers

### Types
- [ ] `src/types/event.ts` - Update EventRegistration interface
- [ ] NEW: `src/types/payment.ts` - PaymentSlip interface

### GAS (Google Apps Script)
- [ ] `gas-upload-slip/Code-Firestore.gs` - Add payment type dropdown
- [ ] Add amount input field
- [ ] Add validation based on event payment mode

### Frontend (Admin)
- [ ] Admin event detail - Show payment slips timeline
- [ ] Admin payment approval page

### Frontend (Member)
- [ ] Member registration detail - Show payment history

---

## 🎨 GAS Form Enhancement

### Current Form
```
[ส่งหลักฐานการชำระเงิน]
- File upload only
- No payment type selection
- No amount confirmation
```

### New Form
```
[ส่งหลักฐานการชำระเงิน]

ประเภทการชำระเงิน: [Dropdown]
  - ชำระเต็มจำนวน (Full Payment)      ← Show if paymentMode = 'full' OR 'deposit'
  - ชำระมัดจำ (Deposit)              ← Show if paymentMode = 'deposit' only
  - ชำระยอดคงเหลือ (Remaining)        ← Show if paymentMode = 'deposit' only
  - ชำระเพิ่มเติม (Additional Payment) ← Always show

จำนวนเงินที่โอน: [Number Input] บาท

อัพโหลดสลิป: [File Upload]

หมายเหตุ (ถ้ามี): [Text Input]
```

### Validation Logic
```javascript
function validatePaymentType(paymentMode, paymentType, depositPaid, remainingPaid) {
  if (paymentMode === 'full') {
    // Full payment mode
    if (paymentType === 'deposit' || paymentType === 'remaining') {
      return { valid: false, error: 'กิจกรรมนี้ชำระเต็มจำนวนเท่านั้น' };
    }
  }

  if (paymentMode === 'deposit') {
    // Deposit mode
    if (paymentType === 'deposit' && depositPaid) {
      return { valid: false, error: 'คุณชำระมัดจำไปแล้ว' };
    }
    if (paymentType === 'remaining' && !depositPaid) {
      return { valid: false, error: 'ต้องชำระมัดจำก่อน' };
    }
  }

  return { valid: true };
}
```

---

## 🗄️ Firestore Indexes

```json
{
  "indexes": [
    {
      "collectionGroup": "paymentSlips",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "registrationId", "order": "ASCENDING" },
        { "fieldPath": "uploadedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "paymentSlips",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "eventId", "order": "ASCENDING" },
        { "fieldPath": "uploadedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "paymentSlips",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "uploadedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "paymentSlips",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "eventId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "uploadedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## ⚠️ Breaking Changes

### For API Consumers
- ❌ `registration.depositSlipUrl` removed
- ❌ `registration.remainingSlipUrl` removed
- ❌ `registration.slipUrl` removed
- ✅ Use `GET /api/payments?registrationId=xxx` instead

### For Frontend
- Need to call separate API for payment slips
- Need to update UI to show payment timeline

---

## 🧪 Testing Checklist

- [x] Migrate script dry-run
- [ ] Run actual migration (production)
- [ ] Validate all slip URLs migrated correctly
- [ ] Test GAS form with all payment types
- [ ] Test admin approval workflow
- [ ] Test payment status calculation
- [ ] Test edge cases:
  - [ ] Registration with no payments
  - [ ] Registration with only legacy slipUrl
  - [ ] Registration with deposit but no remaining
  - [ ] Registration with multiple additional payments

---

## ✅ Implementation Progress

### Phase 1: Foundation (COMPLETED)
**Date:** 2026-07-12
**Commit:** fbddbee

- [x] Created PaymentSlip types ([src/types/payment.ts](src/types/payment.ts))
  - PaymentSlip interface
  - PaymentSummary interface
  - Helper functions: `generateSlipId()`, `calculatePaymentSummary()`
  - Thai labels for payment types

- [x] Created migration script ([scripts/migrate-payment-slips.js](scripts/migrate-payment-slips.js))
  - Supports `--dry-run` and `--event-id` flags
  - Migrates 3 types of slip URLs
  - Tested with dry-run: 1 registration ready to migrate

### Phase 2: Backend API (COMPLETED)
**Date:** 2026-07-12
**Commit:** bc390ee

- [x] Created Library Functions ([src/lib/payment-slips.ts](src/lib/payment-slips.ts))
  - `getPaymentSlipsByRegistration()`
  - `getPaymentSlipsByEvent()`
  - `createPaymentSlip()`
  - `approvePaymentSlip()`
  - `rejectPaymentSlip()`
  - `getPaymentSummaryForRegistration()`
  - `getPendingPaymentSlips()`
  - `batchApprovePaymentSlips()`
  - `getEventPaymentStatistics()`

- [x] Created API Routes
  - `GET /api/payments` - Query slips by various filters
  - `POST /api/payments/upload` - Upload new slip
  - `GET /api/payments/[slipId]` - Get slip details
  - `PUT /api/payments/[slipId]` - Update slip (admin)
  - `PUT /api/payments/[slipId]/approve` - Approve slip
  - `PUT /api/payments/[slipId]/reject` - Reject slip
  - `GET /api/payments/summary` - Get payment summary

### Phase 3: GAS Integration (COMPLETED)
**Date:** 2026-07-12
**Commit:** accd01c

- [x] Updated GAS Webhook ([src/app/api/webhooks/gas-slip-upload/route.ts](src/app/api/webhooks/gas-slip-upload/route.ts))
  - Creates PaymentSlip records instead of updating registration
  - Auto-calculates amount based on payment type
  - Validates payment type
  - Returns slipId in response

- [x] Enhanced GAS Upload Form ([gas-upload-slip/UploadForm.html](gas-upload-slip/UploadForm.html))
  - Payment type dropdown selector
  - Shows deposit/remaining options for deposit mode
  - Shows full payment option for full payment mode
  - Added "additional" payment option
  - Amount input field (auto-filled or manual)
  - Dynamic validation

- [x] Updated GAS Code ([gas-upload-slip/Code-Firestore.gs](gas-upload-slip/Code-Firestore.gs))
  - Passes payment amounts to form template
  - Handles amount parameter in upload
  - Enhanced logging

### Phase 4: Existing API Routes (TODO)
**Status:** Pending

Files to update:
- [ ] [src/app/api/events/[eventId]/route.ts](src/app/api/events/[eventId]/route.ts) - Include payment slips in event details
- [ ] [src/app/api/events/[eventId]/update-payment/route.ts](src/app/api/events/[eventId]/update-payment/route.ts) - Review if still needed
- [ ] Other routes that reference slip URLs

### Phase 5: Admin UI (TODO)
**Status:** Pending

Components to update:
- [ ] Event detail page - Show payment timeline
- [ ] Payment slip review/approval UI
- [ ] Payment summary dashboard
- [ ] Registration detail - Show payment history

### Phase 6: Migration & Cleanup (TODO)
**Status:** Pending

- [ ] Run production migration
- [ ] Verify all data migrated
- [ ] Remove old slip URL fields from EventRegistration interface
- [ ] Update documentation
- [ ] Deploy Firestore indexes

---

**Last Updated:** 2026-07-12 (after Phase 3 complete)
**Status:** Backend Complete - UI Pending
