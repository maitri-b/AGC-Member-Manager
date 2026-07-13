# Payment Adjustment Flow Design

## Problem Statement

เมื่อ admin แก้ไขจำนวนผู้เข้าร่วม (attendeeCount) หลังจากที่ user ชำระเงินและได้รับการอนุมัติแล้ว ระบบต้องจัดการกรณีต่อไปนี้:

1. **ยอดเพิ่มขึ้น** - ต้องชำระเงินเพิ่ม
2. **ยอดลดลง** - ไม่ต้องทำอะไร (ไม่คืนเงิน)
3. **ยอดเท่าเดิม** - ไม่มีการเปลี่ยนแปลง

## Current Issues

1. ✅ ระบบคำนวณ totalAmount ใหม่เมื่อ admin แก้ attendeeCount
2. ❌ ไม่มีการติดตาม "ยอดที่ชำระไปแล้ว" (paidAmount)
3. ❌ ไม่มีการคำนวณ "ยอดที่ต้องชำระเพิ่ม" (additionalPaymentRequired)
4. ❌ UI ไม่แสดงข้อมูลยอดที่ต้องชำระเพิ่ม
5. ❌ ปุ่มอัพโหลดไม่ซ่อนเมื่อชำระครบแล้ว

## Solution Design

### 1. New Fields in EventRegistration

เพิ่ม fields ใหม่ใน Firestore:

```typescript
interface EventRegistration {
  // ... existing fields

  // New fields for payment tracking
  paidAmount?: number;              // ยอดที่ชำระไปแล้วทั้งหมด (รวม deposit + remaining + additional)
  additionalPayments?: AdditionalPayment[];  // ประวัติการชำระเพิ่มเติม
}

interface AdditionalPayment {
  paymentId: string;                // unique ID
  amount: number;                   // ยอดที่ชำระเพิ่ม
  reason: string;                   // เหตุผล เช่น "เพิ่มจำนวนผู้เข้าร่วมจาก 2 เป็น 3 คน"
  slipUrl?: string;                 // URL สลิป
  uploadedAt?: Date;                // วันที่อัพโหลด
  approvedAt?: Date;                // วันที่อนุมัติ
  status: 'รอชำระ' | 'รอตรวจสอบ' | 'อนุมัติแล้ว' | 'ปฏิเสธ';
}
```

### 2. Payment Status Logic

#### Full Payment Mode

```
สถานะปัจจุบัน:
- totalAmount = 6000
- paidAmount = 6000
- paymentStatus = "ชำระเต็มจำนวนแล้ว"

Admin แก้ attendeeCount จาก 2 → 3:
- totalAmount = 8000 (recalculated)
- paidAmount = 6000 (unchanged)
- additionalRequired = 2000
- paymentStatus = "รอชำระเงินเพิ่มเติม" (new status)
```

#### Deposit Payment Mode

```
สถานะปัจจุบัน:
- totalAmount = 6000
- depositAmount = 3000
- remainingAmount = 3000
- paidAmount = 6000 (deposit 3000 + remaining 3000)
- paymentStatus = "ชำระยอดคงเหลือแล้ว"

Admin แก้ attendeeCount จาก 2 → 3:
- totalAmount = 8000
- paidAmount = 6000
- additionalRequired = 2000
- paymentStatus = "รอชำระเงินเพิ่มเติม"
```

### 3. Updated Payment Status Values

เพิ่ม payment_status ใหม่:

| Value | Meaning | When |
|-------|---------|------|
| `"รอชำระเงินเพิ่มเติม"` | Awaiting additional payment | totalAmount > paidAmount (after amount increase) |
| `"รอตรวจสอบเงินเพิ่มเติม"` | Additional payment pending review | Additional slip uploaded |
| `"ชำระครบถ้วนแล้ว"` | Fully paid (including additional) | paidAmount >= totalAmount |

### 4. UI Changes

#### Member Event Detail Page

**Case 1: Fully Paid (no changes)**
```
paymentStatus = "ชำระเต็มจำนวนแล้ว" OR "ชำระยอดคงเหลือแล้ว"
totalAmount === paidAmount

Display:
✓ ชำระเงินครบถ้วนแล้ว
- Hide upload button
- Hide payment account info
```

**Case 2: Additional Payment Required**
```
paymentStatus = "รอชำระเงินเพิ่มเติม"
totalAmount > paidAmount

Display:
⚠️ ต้องชำระเงินเพิ่มเติม
ยอดทั้งหมด: 8,000 บาท
ชำระแล้ว: 6,000 บาท
ต้องชำระเพิ่ม: 2,000 บาท
เหตุผล: เพิ่มจำนวนผู้เข้าร่วมจาก 2 เป็น 3 คน

- Show upload button
- Show payment account info
```

**Case 3: Additional Payment Pending Review**
```
paymentStatus = "รอตรวจสอบเงินเพิ่มเติม"

Display:
🔍 กำลังตรวจสอบสลิปเงินเพิ่มเติม
- Hide upload button (already uploaded)
```

### 5. Admin Upload Slip Feature

เปลี่ยนจากการใส่ URL เป็นการ upload file:

**Old:** Admin paste slip URL
**New:** Admin upload slip file → Upload to GAS → Save URL to Firestore

```typescript
// Admin can upload slip on behalf of user
function handleAdminSlipUpload(file: File, paymentType: 'deposit' | 'remaining' | 'additional') {
  // Upload via GAS (same as user upload)
  // But mark as "uploaded by admin"
}
```

### 6. Auto-update paidAmount

เมื่อ admin อนุมัติสลิป:

```typescript
// Approve deposit
paidAmount += depositAmount;

// Approve remaining
paidAmount += remainingAmount;

// Approve additional
paidAmount += additionalPayment.amount;

// Update paymentStatus
if (paidAmount >= totalAmount) {
  paymentStatus = "ชำระครบถ้วนแล้ว";
} else {
  // Keep current status
}
```

### 7. Calculate Additional Payment Required

```typescript
function calculateAdditionalPaymentRequired(
  totalAmount: number,
  paidAmount: number,
  additionalPayments: AdditionalPayment[]
): number {
  // Sum all approved additional payments
  const approvedAdditional = additionalPayments
    .filter(p => p.status === 'อนุมัติแล้ว')
    .reduce((sum, p) => sum + p.amount, 0);

  // Calculate unpaid amount
  const unpaid = totalAmount - (paidAmount + approvedAdditional);

  return Math.max(0, unpaid);
}
```

## User Decisions (2026-07-13)

1. **Refund handling**: If admin reduces attendee count after payment approved:
   - Don't auto-refund
   - Allow admin to cancel/reject approved slips to upload new transfer
   - Admin has flexibility to handle case-by-case

2. **Partial additional payments**: NOT ALLOWED
   - Deposit mode: 2 payments only (deposit + remaining) as originally designed
   - Additional payments: Must pay full amount (no partial payments)

3. **Payment history**: YES - Display full payment history
   - Show deposit + remaining + any additional payments
   - Include dates, amounts, and status for each payment

4. **Admin override**: YES - Admin can force status change
   - Admin can mark as "ชำระครบ" without requiring slip upload
   - Provides flexibility for special cases

## Implementation Steps

1. ⏳ Add new fields to EventRegistration interface
2. ⏳ Create helper functions for payment calculation
3. ⏳ Update approve/reject slip logic to track paidAmount
4. ⏳ Update member event detail UI to show additional payment
5. ⏳ Hide upload button when fully paid
6. ⏳ Add admin file upload for slips
7. ⏳ Update GAS to handle additional payment type
8. ⏳ Allow admin to cancel approved slips (for refund scenarios)
9. ⏳ Add admin payment status override feature
10. ⏳ Test complete flow

## Edge Cases

### Case 1: Amount Decreased
```
Before: totalAmount = 8000, paidAmount = 8000
Admin changes: totalAmount = 6000
Result: paidAmount = 8000 (overpaid, no refund)
Status: "ชำระครบถ้วนแล้ว"
```

### Case 2: Multiple Adjustments
```
1. Initial: totalAmount = 6000, paid 6000
2. Increase to 8000: need +2000
3. User pays +2000: paidAmount = 8000
4. Increase to 10000: need +2000 again
5. User pays +2000: paidAmount = 10000
```

### Case 3: Partial Additional Payment
```
totalAmount = 8000
paidAmount = 6000
additionalRequired = 2000

User uploads slip for 1000 (partial):
- Create additionalPayment with amount = 1000
- Status = "รอตรวจสอบเงินเพิ่มเติม"
- Still need 1000 more after approval
```

## Summary

**Key Changes:**
1. Track `paidAmount` separately from `totalAmount`
2. Calculate additional payment required automatically
3. Show/hide upload button based on payment completion
4. Allow admin to upload slips via GAS
5. Support multiple additional payments

**Benefits:**
- Clear tracking of payments vs required amounts
- Automatic handling of amount adjustments
- Better UX for both members and admins
- Audit trail of all payments
