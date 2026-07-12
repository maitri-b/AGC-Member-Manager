# Status Fields Design Document

## Overview

ระบบ Agents Club Member Manager ใช้ 2 fields หลักในการติดตามสถานะของการลงทะเบียน:
1. **`status`** - สถานะการลงทะเบียน (Registration Status)
2. **`payment_status`** - สถานะการชำระเงิน (Payment Status)

การแยก concerns อย่างชัดเจนช่วยให้ระบบมีความยืดหยุ่นและง่ายต่อการบำรุงรักษา

---

## Design Principle: Separation of Concerns

| Field | Purpose | Responsibility | Updated By |
|-------|---------|---------------|------------|
| **`status`** | สถานะการลงทะเบียน | ยืนยันการลงทะเบียน, เข้าร่วมงาน, ยกเลิก | Admin manually |
| **`payment_status`** | สถานะการชำระเงิน | ติดตามสถานะการชำระเงิน, สลิป, การอนุมัติ | System automatically |

**ข้อสำคัญ:**
- `status` และ `payment_status` **ไม่ควร** ถูก update พร้อมกัน
- `status` ควบคุมโดย **Admin เท่านั้น** (manual confirmation)
- `payment_status` ควบคุมโดย **ระบบอัตโนมัติ** (slip upload, approve/reject)

---

## Registration Status (`status`)

### Purpose
ติดตามสถานะการลงทะเบียนเข้าร่วมกิจกรรม ไม่เกี่ยวข้องกับการชำระเงิน

### State Flow

```
┌─────────────────┐
│ รอดำเนินการ      │ ← Initial state after user registers
└────────┬────────┘
         │ Admin manually confirms registration
         ↓
┌─────────────────┐
│ ยืนยันแล้ว       │ ← Admin confirmed registration (NOT payment!)
└────────┬────────┘
         │ Event occurs, admin marks attendance
         ↓
┌─────────────────┐
│ เข้าร่วมแล้ว     │ ← User attended the event
└─────────────────┘

Alternative path (cancellation):
┌─────────────────┐
│ ยกเลิกแล้ว       │ ← Registration cancelled by admin or user
└─────────────────┘
```

### Valid Values

| Value | Meaning | When |
|-------|---------|------|
| `"รอดำเนินการ"` | Pending | Default state after registration |
| `"ยืนยันแล้ว"` | Confirmed | Admin confirmed registration slot |
| `"เข้าร่วมแล้ว"` | Attended | User attended event (marked by admin) |
| `"ยกเลิกแล้ว"` | Cancelled | Registration cancelled |

### Update Triggers

**Only updated by Admin manually:**
- Admin clicks "ยืนยันการลงทะเบียน" → `status = "ยืนยันแล้ว"`
- Admin marks attendance at event → `status = "เข้าร่วมแล้ว"`
- Admin cancels registration → `status = "ยกเลิกแล้ว"`

**Never updated by:**
- ❌ Slip upload
- ❌ Payment approval/rejection
- ❌ User actions

---

## Payment Status (`payment_status`)

### Purpose
ติดตามสถานะการชำระเงินของการลงทะเบียน อัพเดทอัตโนมัติตามการกระทำของระบบ

### State Flow - Full Payment Mode

```
┌──────────────────┐
│ รอชำระเงิน        │ ← Initial state (no payment mode or depositAmount = 0)
└────────┬─────────┘
         │ User uploads slip via GAS
         ↓
┌──────────────────┐
│ รอตรวจสอบ         │ ← Slip uploaded, pending admin review
└────────┬─────────┘
         │ Admin approves slip
         ↓
┌──────────────────┐
│ ชำระเต็มจำนวนแล้ว │ ← Payment confirmed ✓
└──────────────────┘

Rejection path:
┌──────────────────┐
│ รอตรวจสอบ         │
└────────┬─────────┘
         │ Admin rejects slip
         ↓
┌──────────────────┐
│ รอชำระเงิน        │ ← Reset to pending payment (slip cleared)
└──────────────────┘
```

### State Flow - Deposit Payment Mode

```
┌──────────────────┐
│ รอชำระมัดจำ       │ ← Initial state (depositAmount > 0)
└────────┬─────────┘
         │ User uploads deposit slip
         ↓
┌──────────────────┐
│ รอตรวจสอบมัดจำ    │ ← Deposit slip pending review
└────────┬─────────┘
         │ Admin approves deposit
         ↓
┌──────────────────┐
│ ชำระมัดจำแล้ว     │ ← Deposit confirmed ✓
└────────┬─────────┘
         │ User uploads remaining slip
         ↓
┌──────────────────────┐
│ รอตรวจสอบยอดคงเหลือ  │ ← Remaining slip pending review
└────────┬─────────────┘
         │ Admin approves remaining
         ↓
┌──────────────────────┐
│ ชำระยอดคงเหลือแล้ว   │ ← Fully paid ✓
└──────────────────────┘

Rejection paths:
- Reject deposit → back to "รอชำระมัดจำ"
- Reject remaining → back to "รอชำระยอดคงเหลือ"
```

### Valid Values

| Value | Meaning | Mode | When |
|-------|---------|------|------|
| `"รอชำระเงิน"` | Awaiting payment | Full | Initial state |
| `"รอชำระมัดจำ"` | Awaiting deposit | Deposit | Initial state or deposit rejected |
| `"รอชำระยอดคงเหลือ"` | Awaiting remaining | Deposit | Deposit approved, waiting for remaining |
| `"รอตรวจสอบ"` | Pending review | Full | Slip uploaded |
| `"รอตรวจสอบมัดจำ"` | Pending deposit review | Deposit | Deposit slip uploaded |
| `"รอตรวจสอบยอดคงเหลือ"` | Pending remaining review | Deposit | Remaining slip uploaded |
| `"ชำระเต็มจำนวนแล้ว"` | Fully paid | Full | Payment approved |
| `"ชำระมัดจำแล้ว"` | Deposit paid | Deposit | Deposit approved |
| `"ชำระยอดคงเหลือแล้ว"` | Fully paid | Deposit | Remaining approved |
| `"พ้นกำหนด"` | Overdue | Both | Deadline passed |
| `"ปฏิเสธสลิป"` | Slip rejected | Both | Slip rejected by admin |

### Update Triggers

**Automatically updated by system:**

1. **GAS Slip Upload (`/api/webhooks/gas-slip-upload`)**:
   - Deposit slip → `payment_status = "รอตรวจสอบมัดจำ"`
   - Remaining slip → `payment_status = "รอตรวจสอบยอดคงเหลือ"`
   - Full slip → `payment_status = "รอตรวจสอบ"`

2. **Payment Approval (`approvePaymentSlip()`)**:
   - Deposit → `payment_status = "ชำระมัดจำแล้ว"`
   - Remaining → `payment_status = "ชำระยอดคงเหลือแล้ว"`
   - Full → `payment_status = "ชำระเต็มจำนวนแล้ว"`

3. **Payment Rejection (`rejectPaymentSlip()`)**:
   - Deposit → `payment_status = "รอชำระมัดจำ"`
   - Remaining → `payment_status = "รอชำระยอดคงเหลือ"`
   - Full → `payment_status = "รอชำระเงิน"`

4. **Deadline Check (`determinePaymentStatus()`)**:
   - Past deadline → `payment_status = "พ้นกำหนด"`

**Never updated by:**
- ❌ Admin manual confirmation
- ❌ Attendance marking

---

## Code Implementation

### ✅ Correct Pattern

```typescript
// GAS Webhook - Upload slip
updateData.paymentStatus = 'รอตรวจสอบมัดจำ';
// Do NOT update 'status'

// Approve slip
updateData.paymentStatus = 'ชำระมัดจำแล้ว';
// Do NOT update 'status'

// Reject slip
updateData.paymentStatus = 'รอชำระมัดจำ';
// Do NOT update 'status'
```

### ❌ Incorrect Pattern (Old)

```typescript
// DON'T DO THIS - Updates both fields
updateData.paymentStatus = 'ชำระมัดจำแล้ว';
updateData.status = 'ชำระมัดจำแล้ว'; // ❌ Wrong!
```

---

## Affected Files

### Core Logic Files
- **`src/lib/payment-slips.ts`**
  - `approvePaymentSlip()` - Only updates `payment_status`
  - `rejectPaymentSlip()` - Only updates `payment_status`

- **`src/app/api/webhooks/gas-slip-upload/route.ts`**
  - GAS webhook - Only updates `payment_status`

- **`src/lib/payment-status.ts`**
  - `determinePaymentStatus()` - Reads `payment_status` (not `status`)

### Admin Confirmation (Future Implementation)
- **`src/app/admin/events/[eventId]/page.tsx`**
  - Add "ยืนยันการลงทะเบียน" button
  - Updates `status` only (not `payment_status`)

---

## Migration Notes

### Legacy Behavior (Before 2026-07-13)
- Both `status` and `payment_status` were updated together
- Caused confusion between registration confirmation and payment status

### New Behavior (After 2026-07-13)
- Clear separation of concerns
- `status` = registration state (admin controlled)
- `payment_status` = payment state (system controlled)

---

## Future Enhancements

- [ ] Add "ยืนยันการลงทะเบียน" button in admin page (updates `status` only)
- [ ] Add "เข้าร่วมแล้ว" attendance marking (updates `status` only)
- [ ] Deprecate reliance on `status` for payment logic in `determinePaymentStatus()`
- [ ] Add validation to prevent accidental updates of both fields together

---

## Examples

### Example 1: User Registers and Pays

```
Initial:
  status = "รอดำเนินการ"
  payment_status = "รอชำระมัดจำ"

User uploads deposit slip:
  status = "รอดำเนินการ" (unchanged)
  payment_status = "รอตรวจสอบมัดจำ" (changed by webhook)

Admin approves deposit:
  status = "รอดำเนินการ" (unchanged)
  payment_status = "ชำระมัดจำแล้ว" (changed by approve function)

Admin confirms registration:
  status = "ยืนยันแล้ว" (changed by admin)
  payment_status = "ชำระมัดจำแล้ว" (unchanged)

Event occurs, admin marks attendance:
  status = "เข้าร่วมแล้ว" (changed by admin)
  payment_status = "ชำระยอดคงเหลือแล้ว" (unchanged - if fully paid)
```

### Example 2: Admin Rejects Slip

```
Before rejection:
  status = "รอดำเนินการ"
  payment_status = "รอตรวจสอบมัดจำ"

Admin rejects slip:
  status = "รอดำเนินการ" (unchanged)
  payment_status = "รอชำระมัดจำ" (reset by reject function)
  depositSlipUrl = "" (cleared)

User uploads new slip:
  status = "รอดำเนินการ" (unchanged)
  payment_status = "รอตรวจสอบมัดจำ" (changed by webhook)
```

---

## Summary

**Golden Rule:**
- `status` = What admin says about the **registration**
- `payment_status` = What the system knows about the **payment**

**Never mix them together!**

