# Admin Event Detail UI Improvements

**Date**: 2026-07-16
**Status**: 🔄 In Progress
**File**: [src/app/admin/events/[eventId]/page.tsx](src/app/admin/events/[eventId]/page.tsx)

---

## 📋 Overview

This document outlines the UI improvements needed for the Admin Event Detail page to enhance usability and prevent accidental deletions.

---

## 🎯 Goals

1. **Move "Edit Registration" button** to dropdown menu (consolidate actions)
2. **Rename payment button** from "บันทึกการชำระเงิน" to "อัพโหลดสลิป" (clearer action)
3. **Improve deletion flow** with payment verification prompt

---

## 🔄 Changes Required

### 1. Move "แก้ไขข้อมูล" Button to Dropdown Menu

**Current**: Button is displayed at the top of each registration card (Line ~1757-1772)

**Target**: Move to expandable dropdown menu alongside other actions

**Location**: Around Line 1757-1772

**Before**:
```tsx
<button
  onClick={() => isEditing ? setEditingRegistration(null) : handleEditRegistration(attendee)}
  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
  title={isEditing ? "ยกเลิกการแก้ไข" : "แก้ไขข้อมูล"}
>
  {/* Icon SVG */}
</button>
```

**After**:
- Remove this button from the header
- Add to dropdown menu in expanded section alongside "อัพโหลดสลิป" and "ยกเลิกการลงทะเบียน"

---

### 2. Rename "บันทึกการชำระเงิน" → "อัพโหลดสลิป"

**Locations** (Multiple occurrences):
- Line 2325: `✓ บันทึกการชำระเงิน` (Deposit payment button)
- Line 2384: `✓ บันทึกการชำระเงิน` (Deposit payment - alternative flow)
- Line 2411: `✓ บันทึกการชำระเงิน` (Remaining payment button)
- Line 2462: `✓ บันทึกการชำระเงิน` (Remaining payment - alternative flow)
- Line 2489: `✓ บันทึกการชำระเงิน` (Full payment button)
- Line 2533: Modal title `บันทึกการชำระเงิน`

**Change to**: `📤 อัพโหลดสลิป`

**Rationale**: "อัพโหลดสลิป" (Upload Slip) is more accurate - the action is uploading a payment slip, not recording payment (which happens after admin verifies)

---

### 3. Rename "ลบ" → "ยกเลิกการลงทะเบียน" + Add Payment Check

**Current Behavior**:
- Button labels: `🗑️ ลบ` or `🗑️ ลบการลงทะเบียน`
- Clicking opens cancellation modal immediately
- No check for approved payments

**Target Behavior**:
1. **All delete buttons** renamed to: `❌ ยกเลิกการลงทะเบียน`
2. **Before showing cancellation modal**, check if registration has approved payments:
   - Check `depositPaid === true` OR `fullPaymentPaid === true` OR any approved payment slips
3. **If approved payment exists**:
   - Show warning prompt first
   - Display total approved amount
   - Confirm that cancelling will exclude this amount from revenue calculations
   - Options: "ยืนยันยกเลิก" or "ยกเลิก"
4. **If no approved payment**:
   - Proceed to standard cancellation modal

**Locations** (Multiple occurrences):
- Line 2315: `🗑️ ลบการลงทะเบียน`
- Line 2332: `🗑️ ลบ`
- Line 2391: `🗑️ ลบ`
- Line 2401: `🗑️ ลบการลงทะเบียน`
- Line 2418: `🗑️ ลบ`
- Line 2469: `🗑️ ลบ`
- Line 2479: `🗑️ ลบการลงทะเบียน`
- Line 2496: `🗑️ ลบ`
- Line 2514: `🗑️ ลบการลงทะเบียน`

---

## 🛠️ Implementation Plan

### Step 1: Create Payment Verification Function

Add function to check if registration has approved payments:

```typescript
function hasApprovedPayments(registration: EventRegistration): { hasPayment: boolean; totalPaid: number } {
  let totalPaid = 0;
  let hasPayment = false;

  // Check deposit payment
  if (registration.depositPaid) {
    totalPaid += registration.depositAmount || 0;
    hasPayment = true;
  }

  // Check full payment (for full payment mode)
  if (registration.fullPaymentPaid) {
    totalPaid += registration.totalAmount || 0;
    hasPayment = true;
  }

  // Check remaining payment
  if (registration.remainingPaid) {
    totalPaid += registration.remainingAmount || 0;
    hasPayment = true;
  }

  return { hasPayment, totalPaid };
}
```

### Step 2: Create Payment Warning Modal Component

```typescript
interface PaymentWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  totalPaid: number;
  registrationId: string;
}

function PaymentWarningModal({ isOpen, onClose, onConfirm, totalPaid, registrationId }: PaymentWarningModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">⚠️ คำเตือน: มียอดชำระเงินแล้ว</h2>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-yellow-900 mb-2">
              รหัสลงทะเบียน: {registrationId}
            </p>
            <p className="text-sm text-yellow-800 mb-2">
              การลงทะเบียนนี้มียอดชำระเงินที่ได้รับการอนุมัติแล้ว:
            </p>
            <p className="text-2xl font-bold text-yellow-900">
              ฿{totalPaid.toLocaleString()}
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              <strong>หากยืนยันยกเลิก:</strong>
            </p>
            <ul className="list-disc list-inside text-sm text-red-700 mt-2 space-y-1">
              <li>ระบบจะไม่คำนวณยอดเงิน ฿{totalPaid.toLocaleString()} นี้ในยอดรับรวม</li>
              <li>การลงทะเบียนจะถูกยกเลิกและไม่สามารถกู้คืนได้</li>
              <li>คุณอาจต้องติดต่อสมาชิกเพื่อคืนเงิน</li>
            </ul>
          </div>

          <p className="text-sm text-gray-600">
            คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการลงทะเบียนนี้?
          </p>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            ยกเลิก
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            ยืนยันยกเลิกการลงทะเบียน
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 3: Update Cancellation Handler

```typescript
const [paymentWarningModal, setPaymentWarningModal] = useState<{
  isOpen: boolean;
  totalPaid: number;
  registrationId: string;
} | null>(null);

function handleOpenCancellationModal(registrationId: string) {
  // Find registration
  const registration = attendees.find(a => a.registration.registrationId === registrationId)?.registration;
  if (!registration) return;

  // Check for approved payments
  const { hasPayment, totalPaid } = hasApprovedPayments(registration);

  if (hasPayment) {
    // Show payment warning modal first
    setPaymentWarningModal({
      isOpen: true,
      totalPaid,
      registrationId,
    });
  } else {
    // Proceed to standard cancellation modal
    setCancellationModal({
      isOpen: true,
      registrationId,
      reason: '',
    });
  }
}

function handleConfirmCancellationWithPayment() {
  // Close payment warning modal
  const registrationId = paymentWarningModal?.registrationId;
  setPaymentWarningModal(null);

  if (registrationId) {
    // Open standard cancellation modal
    setCancellationModal({
      isOpen: true,
      registrationId,
      reason: '',
    });
  }
}
```

### Step 4: Update Button Labels

Replace all occurrences:
- `✓ บันทึกการชำระเงิน` → `📤 อัพโหลดสลิป`
- `🗑️ ลบ` → `❌ ยกเลิกการลงทะเบียน`
- `🗑️ ลบการลงทะเบียน` → `❌ ยกเลิกการลงทะเบียน`

### Step 5: Move Edit Button to Dropdown

- Remove edit button from header (Line 1757-1772)
- Add to dropdown menu in expanded section
- Place alongside "อัพโหลดสลิป" and "ยกเลิกการลงทะเบียน"

---

## 🧪 Testing Checklist

### Payment Verification
- [ ] Registration with `depositPaid = true` shows warning
- [ ] Registration with `fullPaymentPaid = true` shows warning
- [ ] Registration with no payments proceeds directly to cancellation
- [ ] Warning modal shows correct total paid amount
- [ ] "ยกเลิก" button closes warning modal
- [ ] "ยืนยันยกเลิกการลงทะเบียน" opens standard cancellation modal

### Button Labels
- [ ] All payment buttons show "อัพโหลดสลิป"
- [ ] All delete buttons show "ยกเลิกการลงทะเบียน"
- [ ] Payment modal title updated

### UI Organization
- [ ] Edit button removed from header
- [ ] Edit button available in dropdown menu
- [ ] Dropdown menu shows all actions clearly

---

## 📊 Progress

| Task | Status |
|------|--------|
| Create payment verification function | ⏸️ Pending |
| Create payment warning modal component | ⏸️ Pending |
| Update cancellation handler | ⏸️ Pending |
| Rename payment buttons | ⏸️ Pending |
| Rename delete buttons | ⏸️ Pending |
| Move edit button to dropdown | ⏸️ Pending |
| Testing | ⏸️ Pending |

---

**Last Updated**: 2026-07-16
**Updated By**: Claude Code Assistant
