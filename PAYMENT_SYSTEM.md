# Payment System Documentation
## Agents Club Member Manager - Payment Flow & Database Schema

Last Updated: 2026-07-10

---

## 📋 Payment Configuration

The system supports **2 dimensions** of payment configuration:

### 📅 Payment Timing (`paymentTiming`)
**When payment must be made relative to registration**

#### 1. Deferred Payment (`paymentTiming: 'deferred'`) - **DEFAULT**
**ชำระหลังลงทะเบียน**
- User registers first, pays later
- Registration succeeds immediately without payment
- User uploads payment slip AFTER registration is confirmed
- Current default behavior for all events

#### 2. Immediate Payment (`paymentTiming: 'immediate'`) - **NEW**
**ชำระพร้อมลงทะเบียน**
- User must upload payment slip DURING registration
- Registration form includes slip upload section (required)
- Single submit for both registration + payment slip
- Registration succeeds immediately, slip waits for admin approval
- If slip is rejected, user can re-upload WITHOUT cancelling registration
- Button text: "ยืนยันการลงทะเบียน" (Confirm Registration)

**Key Differences:**
| Feature | Deferred | Immediate |
|---------|----------|-----------|
| Registration completes | Without payment | With slip upload |
| Slip upload timing | After registration | During registration |
| On slip rejection | User re-uploads | User re-uploads (registration stays) |
| User experience | Two-step process | One-step process |
| Use case | Events with flexible payment | Events requiring upfront payment proof |

---

### 💰 Payment Mode (`paymentMode`)
**How payment amount is split**

#### 1. Full Payment Mode (`paymentMode: 'full'`)
**จ่ายครั้งเดียวเต็มจำนวน**
- User pays the full amount in one transaction
- No deposit splitting
- Single slip upload
- **Optional Payment Deadline**: Admin can set deadline for full payment
  - `paymentDeadlineType`: 'none' | 'fixed' | 'hours'
  - `paymentDeadlineFixed`: Fixed date (YYYY-MM-DD)
  - `paymentDeadlineHours`: Hours after registration

#### 2. Deposit Payment Mode (`paymentMode: 'deposit'`)
**จ่ายแบบแบ่งชำระ 2 ครั้ง**
- **1st Payment**: Deposit (มัดจำ) - Fixed amount or percentage
- **2nd Payment**: Remaining amount (ยอดคงเหลือ)
- Two separate slip uploads with separate deadlines

**Payment Timing + Payment Mode Combinations:**
All 4 combinations are valid:
- Deferred + Full Payment (current default)
- Deferred + Deposit Payment (current deposit events)
- **Immediate + Full Payment** (NEW - pay full amount during registration)
- **Immediate + Deposit Payment** (NEW - pay deposit during registration, remaining later)

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
| **Y** | `deposit_deadline` | DateTime (ISO) | Deadline for deposit payment | **Deposit mode only** |
| **Z** | `remaining_deadline` | DateTime (ISO) | Deadline for remaining payment (Deposit mode) OR Full payment deadline (Full mode) | **Both modes** |
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

## 🔄 Payment Flows

### Deferred + Full Payment Mode Flow (Current Default):

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

### Deferred + Deposit Payment Mode Flow:

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

### Immediate + Full Payment Mode Flow (NEW):

```
1. User Fills Registration Form
   ↓
   Form includes payment slip upload section (required)
   total_amount = event_fee + shirt_fee (if any)

2. User Submits Registration + Slip Together
   ↓
   registration_status = "รอดำเนินการ"
   payment_status = "รอตรวจสอบ"
   slip_url = [Uploaded file URL]
   ✅ Registration is CREATED immediately (not waiting for approval)

3. Admin Verifies Slip
   ↓
   ✅ APPROVED:
      payment_status = "ชำระครบแล้ว"
      registration_status = "ยืนยันแล้ว" (auto-updated)

   ❌ REJECTED:
      payment_status = "ปฏิเสธสลิป"
      registration_status = "รอดำเนินการ" (unchanged)
      → User can RE-UPLOAD slip without re-registering
      → Registration remains valid
```

### Immediate + Deposit Payment Mode Flow (NEW):

```
1. User Fills Registration Form
   ↓
   Form includes DEPOSIT slip upload section (required)
   total_amount = event_fee + shirt_fee
   deposit_amount = [calculated from event config]
   remaining_amount = total_amount - deposit_amount

2. User Submits Registration + Deposit Slip Together
   ↓
   registration_status = "รอดำเนินการ"
   payment_status = "รอตรวจสอบมัดจำ"
   deposit_slip_url = [Uploaded file URL]
   deposit_paid_date = [YYYY-MM-DD]
   ✅ Registration is CREATED immediately

3. Admin Verifies Deposit Slip
   ↓
   ✅ APPROVED:
      deposit_paid = TRUE
      payment_status = "รอชำระยอดที่เหลือ"
      registration_status = "รอดำเนินการ" (still pending final payment)
      remaining_deadline = [calculated]

   ❌ REJECTED:
      payment_status = "ปฏิเสธสลิป"
      → User can RE-UPLOAD deposit slip
      → Registration remains valid

4. User Uploads Remaining Slip (Deferred - after registration)
   ↓
   remaining_slip_url = [Google Drive URL]
   remaining_paid_date = [YYYY-MM-DD]
   payment_status = "รอตรวจสอบยอดคงเหลือ"

5. Admin Verifies Remaining Slip
   ↓
   payment_status = "ชำระครบแล้ว"
   registration_status = "ยืนยันแล้ว" (auto-updated)
```

---

## 🎯 Field Usage Summary

### Full Payment Mode Uses:
- `total_amount` - Total to pay
- `slip_url` - **Legacy column for full payment slip**
- `deposit_slip_url` or `remaining_slip_url` - **Modern: Can use either for full payment slip**
- `remaining_deadline` - **Payment deadline for Full Payment Mode**
- `deposit_amount` - **Always 0** (to differentiate from Deposit Mode)
- `remaining_amount` - **Always 0** (to differentiate from Deposit Mode)
- `deposit_deadline` - **Always empty** (not used in Full Payment Mode)
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

2. **Column Usage by Payment Mode:**
   - **Full Payment Mode** (identified by `deposit_amount = 0`):
     - Uses `remaining_deadline` for payment deadline
     - Does NOT use `deposit_deadline`, `deposit_amount`, `remaining_amount`
     - Can use either `deposit_slip_url` or `remaining_slip_url` for slip upload
   - **Deposit Mode** (identified by `deposit_amount > 0`):
     - Uses `deposit_deadline` for deposit payment deadline
     - Uses `remaining_deadline` for remaining payment deadline
     - Uses `deposit_slip_url` and `remaining_slip_url` separately

3. **Date fields use different formats:**
   - `deposit_paid_date`, `remaining_paid_date`: `YYYY-MM-DD` (set by GAS)
   - `deposit_deadline`, `remaining_deadline`: ISO DateTime string (set by Vercel)
   - `registration_date`, `verified_date`: `YYYY-MM-DD`

4. **Legacy vs Modern:**
   - `slip_url` is legacy (old full payment system)
   - Modern system uses `deposit_slip_url` and `remaining_slip_url` for all payments
   - For full payment mode, can use either `deposit_slip_url` or `remaining_slip_url`

5. **Boolean Fields:**
   - `deposit_paid`: Only set to TRUE by Admin verification
   - GAS does NOT set this field (only sets `payment_status`)

---

## 🔧 Configuration (per Event in Firestore)

```typescript
{
  // Payment Timing Configuration (NEW)
  paymentTiming?: 'deferred' | 'immediate',  // Default: 'deferred'

  // Payment Mode Configuration
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

**Notes:**
- `paymentTiming` defaults to `'deferred'` for backward compatibility
- Immediate payment timing works with both payment modes (full and deposit)
- When `paymentTiming: 'immediate'`:
  - For `paymentMode: 'full'`: User uploads full payment slip during registration
  - For `paymentMode: 'deposit'`: User uploads deposit slip during registration, remaining slip later

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
