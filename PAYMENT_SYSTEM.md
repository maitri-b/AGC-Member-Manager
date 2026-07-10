# Payment System Documentation
## Agents Club Member Manager - Payment Flow & Database Schema

Last Updated: 2026-07-10

---

## 📋 Payment Modes

The system supports **2 payment modes** configured per event:

### 1. Full Payment Mode (`paymentMode: 'full'`)
**จ่ายครั้งเดียวเต็มจำนวน**
- User pays the full amount in one transaction
- No deposit splitting
- Single slip upload
- **Optional Payment Deadline**: Admin can set deadline for full payment
  - `paymentDeadlineType`: 'none' | 'fixed' | 'hours'
  - `paymentDeadlineFixed`: Fixed date (YYYY-MM-DD)
  - `paymentDeadlineHours`: Hours after registration

### 2. Deposit Payment Mode (`paymentMode: 'deposit'`)
**จ่ายแบบแบ่งชำระ 2 ครั้ง**
- **1st Payment**: Deposit (มัดจำ) - Fixed amount or percentage
- **2nd Payment**: Remaining amount (ยอดคงเหลือ)
- Two separate slip uploads with separate deadlines

---

## 🗄️ Google Sheets Database Schema

### Payment-Related Columns (Columns A-AS)

| Column | Field Name | Data Type | Description | Used In |
|--------|------------|-----------|-------------|---------|
| **A** | `registration_id` | String | Unique 6-char registration ID | All modes |
| **B** | `registration_date` | Date (YYYY-MM-DD) | Registration timestamp | All modes |
| **N** | `event_fee` | Number | Event fee (before discounts) | All modes |
| **O** | `shirt_fee` | Number | Optional shirt fee | All modes |
| **P** | `total_amount` | Number | **Total amount to pay** | All modes |
| **Q** | `slip_url` | URL | **Legacy: Full payment slip URL** | Full payment (legacy) |
| **R** | `deposit_amount` | Number | Amount for deposit payment | Deposit mode |
| **S** | `remaining_amount` | Number | Amount for remaining payment | Deposit mode |
| **T** | `deposit_paid` | Boolean | Whether deposit was verified | Deposit mode |
| **U** | `deposit_paid_date` | Date (YYYY-MM-DD) | **Date when deposit slip was uploaded** | Deposit mode |
| **V** | `remaining_paid_date` | Date (YYYY-MM-DD) | **Date when remaining slip was uploaded** | Deposit mode |
| **W** | `deposit_slip_url` | URL | **Deposit payment slip URL** | Deposit mode |
| **X** | `remaining_slip_url` | URL | **Remaining payment slip URL** | Deposit mode |
| **Y** | `deposit_deadline` | DateTime (ISO) | Deadline for deposit payment | Deposit mode |
| **Z** | `remaining_deadline` | DateTime (ISO) | Deadline for remaining payment | Deposit mode |
| **AA** | `payment_status` | String | **Current payment status** (see below) | All modes |
| **AB** | `status` | String | Legacy registration status | All modes |

---

## 📝 Payment Status Values (`payment_status` column)

### Set by GAS (Google Apps Script) when slip is uploaded:
- `รอตรวจสอบ` - Waiting for admin verification (Full payment)
- `รอตรวจสอบมัดจำ` - Waiting for deposit slip verification (Deposit mode)
- `รอตรวจสอบยอดคงเหลือ` - Waiting for remaining slip verification (Deposit mode)

### Set by Admin when verifying slip:
- `ยืนยันแล้ว` - Verified/Confirmed by admin
- `ชำระครบแล้ว` - Fully paid and verified
- `ปฏิเสธสลิป` - Slip rejected (invalid/incorrect)

### Computed by Vercel (if `payment_status` is empty):
- `รอชำระเงิน` - Waiting for payment (no slip uploaded)
- `รอชำระมัดจำ` - Waiting for deposit payment
- `รอชำระยอดที่เหลือ` - Deposit paid, waiting for remaining
- `พ้นกำหนด` - Payment deadline passed
- `ลงทะเบียนแล้ว` - Free event (totalAmount = 0)

---

## 🔄 Payment Flow

### Full Payment Mode Flow:

```
1. User Registers
   ↓
   total_amount = event_fee + shirt_fee (if any)
   payment_status = (empty) → computed as "รอชำระเงิน"

2. User Uploads Slip (via GAS)
   ↓
   slip_url = [Google Drive URL]
   payment_status = "รอตรวจสอบ"

3. Admin Verifies Slip
   ↓
   payment_status = "ชำระครบแล้ว" (approved)
   status = "Confirmed"
   verified_by = [Admin name]
   verified_date = [Date]
```

### Deposit Payment Mode Flow:

```
1. User Registers
   ↓
   total_amount = event_fee + shirt_fee
   deposit_amount = [calculated from event config]
   remaining_amount = total_amount - deposit_amount
   deposit_deadline = [calculated]
   payment_status = (empty) → computed as "รอชำระมัดจำ"

2. User Uploads Deposit Slip (via GAS)
   ↓
   deposit_slip_url = [Google Drive URL]
   deposit_paid_date = [YYYY-MM-DD]
   payment_status = "รอตรวจสอบมัดจำ"

3. Admin Verifies Deposit Slip
   ↓
   deposit_paid = TRUE
   payment_status = "รอชำระยอดที่เหลือ"
   remaining_deadline = [calculated]
   verified_by = [Admin name]
   verified_date = [Date]

4. User Uploads Remaining Slip (via GAS)
   ↓
   remaining_slip_url = [Google Drive URL]
   remaining_paid_date = [YYYY-MM-DD]
   payment_status = "รอตรวจสอบยอดคงเหลือ"

5. Admin Verifies Remaining Slip
   ↓
   payment_status = "ชำระครบแล้ว"
   status = "Confirmed"
   verified_by = [Admin name]
   verified_date = [Date]
```

---

## 🎯 Field Usage Summary

### Full Payment Mode Uses:
- `total_amount` - Total to pay
- `slip_url` - **Legacy column for full payment slip**
- `deposit_slip_url` or `remaining_slip_url` - **Modern: Can use either for full payment slip**
- `payment_status` - Current status

### Deposit Payment Mode Uses:
- `total_amount` - Total amount
- `deposit_amount` - First payment amount
- `remaining_amount` - Second payment amount
- `deposit_slip_url` - First slip URL
- `remaining_slip_url` - Second slip URL
- `deposit_paid_date` - When first slip was uploaded
- `remaining_paid_date` - When second slip was uploaded
- `deposit_deadline` - Deadline for first payment
- `remaining_deadline` - Deadline for second payment
- `deposit_paid` - Whether admin verified first payment
- `payment_status` - Current status

---

## 💡 Important Notes

1. **`payment_status` is the source of truth** for payment state
   - Set by GAS when slip is uploaded
   - Set by Admin when verifying
   - Computed by Vercel if empty

2. **Date fields use different formats:**
   - `deposit_paid_date`, `remaining_paid_date`: `YYYY-MM-DD` (set by GAS)
   - `deposit_deadline`, `remaining_deadline`: ISO DateTime string (set by Vercel)
   - `registration_date`, `verified_date`: `YYYY-MM-DD`

3. **Legacy vs Modern:**
   - `slip_url` is legacy (old full payment system)
   - Modern system uses `deposit_slip_url` and `remaining_slip_url` for all payments
   - For full payment mode, can use either `deposit_slip_url` or `remaining_slip_url`

4. **Boolean Fields:**
   - `deposit_paid`: Only set to TRUE by Admin verification
   - GAS does NOT set this field (only sets `payment_status`)

---

## 🔧 Configuration (per Event in Firestore)

```typescript
{
  paymentMode: 'full' | 'deposit',

  // For full payment mode:
  paymentDeadlineType?: 'none' | 'fixed' | 'hours',
  paymentDeadlineFixed?: string,    // Fixed deadline (ISO DateTime)
  paymentDeadlineHours?: number,    // Hours after registration

  // For deposit mode:
  depositAmount?: number,           // Fixed deposit amount
  depositPercentage?: number,       // Or percentage of total
  useDepositPercentage?: boolean,   // Which method to use

  depositDeadlineType?: 'none' | 'fixed' | 'hours',
  depositDeadlineFixed?: string,    // Fixed deadline (ISO DateTime)
  depositDeadlineHours?: number,    // Hours after registration

  remainingDeadlineType?: 'none' | 'fixed' | 'hours',
  remainingDeadlineFixed?: string,
  remainingDeadlineHours?: number,
}
```

---

## 📚 Related Files

- **Payment Status Logic**: `src/lib/payment-status.ts`
- **Deadline Calculation**: `src/lib/payment-deadlines.ts`
- **GAS Upload Handler**: `gas-upload-slip/Code.gs`
- **Event Sheets Integration**: `src/lib/event-sheets.ts`
- **Type Definitions**: `src/types/event.ts`

---

## 🎨 UI Badge Colors

- 🟢 Green (`bg-green-100 text-green-800`) - ชำระครบแล้ว, ยืนยันแล้ว
- 🟣 Purple (`bg-purple-100 text-purple-800`) - รอตรวจสอบ, รอตรวจสอบมัดจำ, รอตรวจสอบยอดคงเหลือ
- 🟡 Yellow (`bg-yellow-100 text-yellow-800`) - รอชำระเงิน, รอชำระมัดจำ
- 🔵 Blue (`bg-blue-100 text-blue-800`) - รอชำระยอดที่เหลือ
- 🔴 Red (`bg-red-100 text-red-800`) - พ้นกำหนด, ปฏิเสธสลิป
- ⚪ Gray (`bg-gray-100 text-gray-800`) - ลงทะเบียนแล้ว (free event)
