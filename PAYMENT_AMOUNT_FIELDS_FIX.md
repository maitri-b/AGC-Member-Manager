# การแก้ปัญหา: Payment Amount Fields ไม่แสดงค่า (แสดง 0)

## 📋 สรุปปัญหา

เมื่อมีการชำระเงินแล้ว และ Admin แก้ไข Registration (เช่น เพิ่ม Special Charges) ทำให้ต้องชำระเงินเพิ่ม แต่ระบบไม่แสดงข้อมูลยอดเงินที่ชำระไปแล้วและยอดคงค้าง ทั้งในหน้า Admin Event Detail และ Member Events Detail

### Scenario ที่เกิดปัญหา:
1. User ลงทะเบียนงาน ยอดรวม 5,000 บาท
2. User ชำระเงินครบ 5,000 บาท → สถานะ "ชำระเต็มจำนวนแล้ว"
3. Admin เพิ่ม Special Charges 500 บาท → ยอดรวมใหม่ 5,500 บาท
4. ระบบควรแสดง:
   - ✅ ชำระแล้ว: 5,000 บาท
   - ✅ คงเหลือยอดค้างชำระ: 500 บาท
   - ✅ สถานะ: "รอชำระเพิ่มเติม"

### ปัญหาที่พบ:
- ❌ ไม่แสดงยอดชำระแล้ว (แสดง 0 บาท)
- ❌ ไม่แสดงยอดคงค้าง
- ❌ สถานะไม่อัพเดท (ยังแสดง "ชำระเต็มจำนวนแล้ว")

---

## 🔍 สาเหตุของปัญหา

### ปัญหาหลัก: **3-Layer Data Flow ไม่สมบูรณ์**

ระบบมี 3 ชั้นในการส่งข้อมูลจาก Firestore ไปยัง Frontend:

```
Firestore Database
    ↓
[Layer 1] Firestore Reader Function (getEventRegistrationsFromFirestore)
    ↓
[Layer 2] API Route (/api/events/[eventId]/route.ts หรือ /api/events/[eventId]/detail/route.ts)
    ↓
[Layer 3] Frontend Display (Admin/Member Event Detail Page)
```

**ปัญหาคือ:** เฉพาะ Layer 1 ที่ดึงข้อมูลจาก Firestore ไม่ได้ map payment amount fields ทั้งหมด!

### Payment Amount Fields ที่ต้อง map:

```typescript
// Full Payment Mode
fullPaymentAmountPaid: number;    // ยอดที่ชำระแบบเต็มจำนวน

// Deposit Payment Mode
depositAmountPaid: number;         // ยอดมัดจำที่ชำระจริง
remainingAmountPaid: number;       // ยอดคงเหลือที่ชำระจริง

// General
paidAmount: number;                // ยอดรวมที่ชำระไปทั้งหมด
```

---

## ✅ วิธีแก้ปัญหา: แก้ทั้ง 3 ชั้น

### 🔧 Layer 1: Firestore Reader Function

**ไฟล์:** `src/lib/event-sheets.ts`

**ฟังก์ชัน:** `getEventRegistrationsFromFirestore()`

**บรรทัด:** ~301-308

**ต้องเพิ่ม mapping fields เหล่านี้:**

```typescript
// Full payment fields
fullPaymentSlipUrl: data.fullPaymentSlipUrl || '',
fullPaymentPaid: data.fullPaymentPaid || false,
fullPaymentPaidDate: data.fullPaymentPaidDate || '',
fullPaymentAmountPaid: data.fullPaymentAmountPaid || 0,  // ← ⚠️ สำคัญมาก!

// Deposit payment amount tracking
remainingPaid: data.remainingPaid || false,
remainingAmountPaid: data.remainingAmountPaid || 0,      // ← ⚠️ สำคัญมาก!
depositAmountPaid: data.depositAmountPaid || 0,          // ← ⚠️ สำคัญมาก!

// General paid amount tracking
paidAmount: data.paidAmount || 0,                        // ← ⚠️ สำคัญมาก!
```

**📍 Commit ที่แก้:** `ae5f461`

---

### 🔧 Layer 2A: Admin API Route

**ไฟล์:** `src/app/api/events/[eventId]/route.ts`

**บรรทัด:** ตรงส่วนที่ return registration data (ตรวจสอบว่ามีการส่ง payment amount fields)

**ต้องแน่ใจว่า API response มี fields เหล่านี้:**

```typescript
return NextResponse.json({
  event,
  summary,
  attendees: attendees.map(a => ({
    registration: {
      // ... other fields ...
      fullPaymentAmountPaid: a.registration.fullPaymentAmountPaid || 0,
      depositAmountPaid: a.registration.depositAmountPaid || 0,
      remainingAmountPaid: a.registration.remainingAmountPaid || 0,
      paidAmount: a.registration.paidAmount || 0,
    }
  }))
});
```

---

### 🔧 Layer 2B: Member API Route

**ไฟล์:** `src/app/api/events/[eventId]/detail/route.ts`

**บรรทัด:** ~236-240, 249-250

**ต้องเพิ่มใน userRegistration object:**

```typescript
userRegistration = {
  registrationId: latestReg.registrationId,
  status: latestReg.status,
  // ... other fields ...

  // ✅ CRITICAL: Payment amount fields - needed for frontend display!
  fullPaymentAmountPaid: (latestReg as any).fullPaymentAmountPaid || 0,
  depositAmountPaid: (latestReg as any).depositAmountPaid || 0,
  remainingAmountPaid: (latestReg as any).remainingAmountPaid || 0,
  paidAmount: (latestReg as any).paidAmount || 0,

  // Additional payments
  additionalPayments: (latestReg as any).additionalPayments || '',

  // ... rest of fields ...
};
```

**📍 Commit ที่แก้:** `4ae460d`

---

### 🔧 Layer 3: Frontend Display

#### A. Member Events Detail Page

**ไฟล์:** `src/app/events/[eventId]/page.tsx`

**บรรทัด:** ~1654-1694

**การคำนวณและแสดงผล:**

```typescript
{(() => {
  const totalAmount = userRegistration.totalAmount || 0;
  const fullPaymentAmountPaid = (userRegistration as any).fullPaymentAmountPaid || 0;
  const depositAmountPaid = (userRegistration as any).depositAmountPaid || 0;
  const remainingAmountPaid = (userRegistration as any).remainingAmountPaid || 0;

  // รวมยอดที่ชำระไปทั้งหมด
  const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid;

  // คำนวณยอดที่ต้องชำระเพิ่ม
  const additionalRequired = Math.max(0, totalAmount - paidAmount);

  // คำนวณยอดชำระเกิน (ถ้ามี)
  const overpaid = Math.max(0, paidAmount - totalAmount);

  return (
    <div className="border-t border-blue-500 pt-3 space-y-2 text-sm">
      {paidAmount > 0 && (
        <div className="flex items-center justify-between">
          <span className="opacity-90">ยอดชำระแล้ว:</span>
          <span className="font-semibold">฿{paidAmount.toLocaleString()}</span>
        </div>
      )}
      {additionalRequired > 0 && (
        <div className="flex items-center justify-between">
          <span className="opacity-90">คงเหลือยอดค้างชำระ:</span>
          <span className="font-semibold">฿{additionalRequired.toLocaleString()}</span>
        </div>
      )}
      {overpaid > 0 && (
        <div className="flex items-center justify-between text-cyan-200">
          <span className="opacity-90">ชำระเกิน:</span>
          <span className="font-semibold">฿{overpaid.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
})()}
```

#### B. Admin Event Detail Page

**ไฟล์:** `src/app/admin/events/[eventId]/page.tsx`

**ต้องแน่ใจว่า Attendee interface มี payment amount fields:**

```typescript
interface Attendee {
  registration: {
    // ... other fields ...
    eventFee?: number;              // ค่าเข้าร่วมกิจกรรม
    roomFee?: number;               // ค่าห้องพัก
    totalAmount: number;            // ยอดรวมทั้งหมด
    paidAmount?: number;            // ยอดที่ชำระไปทั้งหมด
    additionalPayments?: string;    // JSON stringified AdditionalPayment[]
    fullPaymentAmountPaid?: number; // ยอดชำระแบบเต็มจำนวน
    depositAmountPaid?: number;     // ยอดมัดจำที่ชำระจริง
    remainingAmountPaid?: number;   // ยอดคงเหลือที่ชำระจริง
  };
}
```

**การแสดงผลในหน้า Admin:** (ดู pattern เดียวกับ Member page)

---

## 🔄 Payment Status Recalculation

เมื่อ totalAmount เปลี่ยนแปลง (เช่น เพิ่ม/ลบ special charges) ต้องมีการ recalculate payment status

### ฟังก์ชันสำคัญ:

**ไฟล์:** `src/lib/payment-status.ts`

**ฟังก์ชัน:** `recalculatePaymentStatus()`

**บรรทัด:** ~300-356

```typescript
export function recalculatePaymentStatus(
  registration: EventRegistration,
  newTotalAmount: number,
  paymentMode: string = 'full'
): { payment_status: string; status?: string } {
  // Calculate actual total paid from tracked amounts
  const depositAmountPaid = (registration as any).depositAmountPaid || 0;
  const remainingAmountPaid = (registration as any).remainingAmountPaid || 0;
  const fullPaymentAmountPaid = (registration as any).fullPaymentAmountPaid || 0;
  const actualTotalPaid = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid;

  // Fallback to legacy paidAmount if no tracked amounts
  const currentPaidAmount = actualTotalPaid || registration.paidAmount || 0;
  const additionalPayments = parseAdditionalPayments(registration.additionalPayments);
  const fullyPaid = isFullyPaid(newTotalAmount, currentPaidAmount, additionalPayments);

  const result: { payment_status: string; status?: string } = {
    payment_status: registration.paymentStatus || 'รอชำระเงิน'
  };

  // ✅ CHECK FOR OVERPAYMENT (paid > totalAmount)
  if (currentPaidAmount > newTotalAmount && currentPaidAmount > 0) {
    result.payment_status = 'ชำระเกินจำนวน';
    result.status = 'ยืนยันแล้ว'; // Still confirmed, just overpaid
  } else if (!fullyPaid && currentPaidAmount > 0) {
    // Was fully paid before, but not anymore due to totalAmount increase
    // Update paymentStatus to indicate additional payment needed
    if (paymentMode === 'deposit') {
      // Deposit mode: check what's been paid
      if (registration.depositPaid && !(registration as any).remainingPaid) {
        result.payment_status = 'รอชำระยอดที่เหลือ';
      } else if (registration.depositPaid && (registration as any).remainingPaid) {
        result.payment_status = 'รอชำระเพิ่มเติม'; // Need additional payment
      } else {
        result.payment_status = 'รอชำระมัดจำ';
      }
    } else {
      // Full payment mode
      if (registration.fullPaymentPaid) {
        result.payment_status = 'รอชำระเพิ่มเติม'; // Need additional payment
      } else {
        result.payment_status = 'รอชำระเงิน';
      }
    }

    // Change status from "ยืนยันแล้ว" back to "รอดำเนินการ" if payment is no longer complete
    if (registration.status === 'ยืนยันแล้ว') {
      result.status = 'รอดำเนินการ';
    }
  } else if (fullyPaid) {
    // Still fully paid after recalculation
    result.payment_status = 'ชำระเต็มจำนวนแล้ว';
    result.status = 'ยืนยันแล้ว';
  }

  return result;
}
```

### จุดที่ต้องเรียก recalculatePaymentStatus():

#### 1. Special Charges API (เพิ่ม/ลบค่าใช้จ่ายเสริม)

**ไฟล์:** `src/app/api/events/[eventId]/special-charges/route.ts`

**ทั้ง POST และ DELETE handlers:**

```typescript
// ✅ CRITICAL: Recalculate payment status when totalAmount changes
const paymentStatusUpdate = recalculatePaymentStatus(
  registration,
  newTotalAmount,
  eventData.paymentMode || 'full'
);
updateData.payment_status = paymentStatusUpdate.payment_status;
if (paymentStatusUpdate.status) {
  updateData.status = paymentStatusUpdate.status;
}

console.log('[Special Charges] Payment status recalculated:', {
  oldTotal: registration.totalAmount,
  newTotal: newTotalAmount,
  oldPaymentStatus: registration.paymentStatus,
  newPaymentStatus: updateData.payment_status,
  oldStatus: registration.status,
  newStatus: updateData.status,
});
```

**📍 Commit ที่แก้:** `415b4ac`, `953943f`

#### 2. Payment Slip Approval (อนุมัติสลิป)

**ไฟล์:** `src/lib/payment-slips.ts`

**ฟังก์ชัน:** `approvePaymentSlip()`

**บรรทัด:** ~291-320

```typescript
// ✅ AUTO-UPDATE REGISTRATION STATUS based on payment completion
// Build updated registration data for recalculation
const updatedRegistrationData = {
  ...registrationData,
  ...updateData,
};

// ✅ CRITICAL: Recalculate payment status based on CURRENT totalAmount
// This handles scenarios where admin added special charges after user paid
const totalAmount = registrationData.totalAmount || 0;
const paymentStatusUpdate = recalculatePaymentStatus(
  updatedRegistrationData as any,
  totalAmount,
  paymentMode
);

// Apply recalculated payment status
updateData.paymentStatus = paymentStatusUpdate.payment_status;
if (paymentStatusUpdate.status) {
  updateData.status = paymentStatusUpdate.status;
}

console.log('[Approve Slip] Payment status recalculated:', {
  totalAmount,
  paidAmount: updateData.paidAmount,
  oldPaymentStatus: registrationData.paymentStatus,
  newPaymentStatus: updateData.paymentStatus,
  oldStatus: registrationData.status,
  newStatus: updateData.status,
});
```

#### 3. Admin Update Registration

**ไฟล์:** `src/app/api/events/[eventId]/admin-update-registration/route.ts`

*(มีการใช้ recalculatePaymentStatus อยู่แล้วในการ update)*

---

## 📊 Payment Status Values

### สถานะทั้งหมดที่เป็นไปได้:

```typescript
// Free event
'ลงทะเบียนแล้ว'

// Full payment mode
'รอชำระเงิน'              // Waiting for payment
'รอตรวจสอบ'               // Slip uploaded, pending review
'ชำระเต็มจำนวนแล้ว'       // Fully paid
'รอชำระเงินเพิ่มเติม'     // Need additional payment (after amount increase)
'รอตรวจสอบเงินเพิ่มเติม'  // Additional payment slip pending review

// Deposit payment mode
'รอชำระมัดจำ'            // Waiting for deposit
'รอตรวจสอบมัดจำ'         // Deposit slip pending review
'ชำระมัดจำแล้ว'          // Deposit paid
'รอชำระยอดที่เหลือ'      // Waiting for remaining payment
'รอตรวจสอบยอดคงเหลือ'    // Remaining payment slip pending review
'ชำระครบแล้ว'            // Fully paid (deposit + remaining)
'รอชำระเพิ่มเติม'        // Need additional payment (deposit mode)

// Overpayment
'ชำระเกินจำนวน'          // Paid more than required

// Other
'พ้นกำหนด'               // Overdue (deadline passed)
'ปฏิเสธสลิป'             // Slip rejected
```

---

## 🎨 Badge Colors

**ไฟล์:** `src/lib/payment-status.ts`

**ฟังก์ชัน:** `getStatusBadgeClass()`

```typescript
// Success states (green)
'ชำระครบแล้ว', 'ชำระเต็มจำนวนแล้ว', contains('ยืนยัน')

// Overpayment (cyan)
'ชำระเกินจำนวน'

// Pending verification (purple - waiting for admin)
'รอตรวจสอบสลิป', 'รอตรวจสอบ', 'รอตรวจสอบมัดจำ', 'รอตรวจสอบยอดคงเหลือ', 'รอตรวจสอบเงินเพิ่มเติม'

// Rejected (red)
contains('ปฏิเสธ')

// Overdue (red)
'พ้นกำหนด'

// Waiting for payment (yellow - user action required)
'รอชำระมัดจำ', 'รอชำระเงิน', 'รอชำระเงินเพิ่มเติม'

// Partial payment (blue)
'รอชำระยอดที่เหลือ'

// Free/registered (gray)
'ลงทะเบียนแล้ว'
```

---

## 📝 Checklist สำหรับการแก้ไขในอนาคต

เมื่อมีการเพิ่ม/แก้ไข Payment Fields ใหม่ ต้องตรวจสอบทั้ง **3 ชั้น**:

### ✅ Layer 1: Firestore Reader
- [ ] `src/lib/event-sheets.ts` → `getEventRegistrationsFromFirestore()`
- [ ] เพิ่ม field mapping ใหม่ใน return object
- [ ] ตรวจสอบว่า field type ถูกต้อง (string, number, boolean, etc.)

### ✅ Layer 2: API Routes
- [ ] `src/app/api/events/[eventId]/route.ts` (Admin API)
- [ ] `src/app/api/events/[eventId]/detail/route.ts` (Member API)
- [ ] ตรวจสอบว่า response object มี field ที่เพิ่มใหม่
- [ ] ใช้ type assertion `(... as any).newField` ถ้าจำเป็น

### ✅ Layer 3: Frontend Display
- [ ] `src/app/admin/events/[eventId]/page.tsx` (Admin page)
- [ ] `src/app/events/[eventId]/page.tsx` (Member page)
- [ ] เพิ่ม field ใน interface `Attendee` หรือ type definition
- [ ] แสดงผลข้อมูลใหม่ใน UI

### ✅ Payment Status Logic
- [ ] `src/lib/payment-status.ts` → อัพเดท logic ใน `recalculatePaymentStatus()` ถ้าจำเป็น
- [ ] เรียก `recalculatePaymentStatus()` ในทุกจุดที่ totalAmount เปลี่ยนแปลง:
  - [ ] Special Charges API (POST/DELETE)
  - [ ] Payment Slip Approval
  - [ ] Admin Update Registration
  - [ ] (อื่นๆ ที่เกี่ยวข้อง)

---

## 🚨 ข้อควรระวัง

### 1. Type Assertion
เนื่องจาก TypeScript type definition อาจไม่ครอบคลุม field ทั้งหมด (เพราะข้อมูลใน Firestore dynamic) จำเป็นต้องใช้ type assertion:

```typescript
const fullPaymentAmountPaid = (registration as any).fullPaymentAmountPaid || 0;
```

### 2. Backward Compatibility
เมื่อเพิ่ม field ใหม่ ต้องมี fallback value:

```typescript
fullPaymentAmountPaid: data.fullPaymentAmountPaid || 0  // ถ้าไม่มีข้อมูล ให้ใช้ 0
```

### 3. Console Logging
ใส่ console.log ทุกจุดที่สำคัญเพื่อ debug:

```typescript
console.log('[Special Charges] Payment status recalculated:', {
  oldTotal: registration.totalAmount,
  newTotal: newTotalAmount,
  oldPaymentStatus: registration.paymentStatus,
  newPaymentStatus: updateData.payment_status,
});
```

### 4. Testing Checklist
ทดสอบทุก scenario:
- [ ] ชำระเต็มจำนวนแล้ว → Admin เพิ่ม special charge → ต้องแสดงยอดค้างชำระ
- [ ] ชำระมัดจำแล้ว → Admin เพิ่ม special charge → ต้องแสดงยอดค้างชำระเพิ่ม
- [ ] ชำระเกิน → ต้องแสดงสถานะและยอดชำระเกิน
- [ ] ลบ special charge → ต้อง recalculate ใหม่
- [ ] ตรวจสอบทั้งหน้า Admin และ Member

---

## 📍 Related Commits

- `ae5f461` - เพิ่ม payment amount fields mapping ใน Firestore reader
- `4ae460d` - เพิ่ม payment amount fields ใน Member API
- `415b4ac` - เพิ่ม recalculatePaymentStatus ใน special charges
- `953943f` - เพิ่ม payment display ใน Member Events Detail
- `9864fe8` - แก้ไข Admin real-time calculation

---

## 🔗 Related Documentation

- `PAYMENT_SYSTEM.md` - ระบบชำระเงินโดยรวม
- `FIRESTORE_STRUCTURE.md` - โครงสร้าง Firestore collections
- `API_DOCUMENTATION.md` - API endpoints ทั้งหมด

---

**สร้างเมื่อ:** 2026-07-17
**อัพเดทล่าสุด:** 2026-07-17
**Status:** ✅ แก้ไขสำเร็จ - Tested and Deployed
