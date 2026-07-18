# แผนการ Validate Payment Type Upload - ฉบับร่าง

> ⚠️ **สถานะ: ร่างแผนที่รอการอนุมัติ**
>
> แผนนี้เป็นเพียง**ฉบับร่างเพื่อศึกษา** ยังไม่ได้รับการอนุมัติและยังไม่ได้ดำเนินการใดๆ
>
> ⛔ **ห้าม**อ้างอิงว่าระบบปัจจุบันทำงานตามแผนนี้
>
> 📅 วันที่สร้าง: 2026-07-19

---

## 📋 สรุปแผนการ

เพิ่ม validation สำหรับการอัพโหลดสลิปการชำระเงิน เพื่อป้องกันการอัพโหลด payment type ซ้ำ (เช่น อัพโหลด "full" payment สองครั้ง)

---

## 🎯 วัตถุประสงค์

ป้องกันสถานการณ์เช่น:
- Registration P8ACQL มี 2 สลิป "full" payment ที่ถูก approved (150 บาท x 2 = 300 บาท)
- แต่ totalAmount จริงคือ 150 บาท เท่านั้น
- สร้างความสับสนในข้อมูลและการคำนวณ

---

## 📐 Validation Logic

### 1. Full Payment Mode

```
สถานะเริ่มต้น: ยังไม่มี approved payment slips
├─ ✅ อนุญาต: "full", "additional"
│
หลังมี "full" payment approved แล้ว:
├─ ❌ ห้าม: "full" (ไม่ให้เลือกซ้ำ)
└─ ✅ อนุญาต: "additional" เท่านั้น
```

---

### 2. Deposit Payment Mode

#### Path A: เลือก Deposit ครั้งแรก

```
สถานะเริ่มต้น: ยังไม่มี approved slips
├─ ✅ อนุญาต: "deposit", "full"
│
หลังมี "deposit" approved แล้ว:
├─ ❌ ห้าม: "deposit", "full"
├─ ✅ อนุญาต: "remaining" เท่านั้น
│
หลังมี "deposit" + "remaining" approved แล้ว:
├─ ❌ ห้าม: "deposit", "full", "remaining"
└─ ✅ อนุญาต: "additional" เท่านั้น
```

#### Path B: เลือก Full ครั้งแรก (จ่ายทั้งหมดเลย)

```
สถานะเริ่มต้น: ยังไม่มี approved slips
├─ ✅ อนุญาต: "deposit", "full"
│
หลังมี "full" approved แล้ว:
├─ ❌ ห้าม: "deposit", "full", "remaining"
└─ ✅ อนุญาต: "additional" เท่านั้น
```

---

### 3. Additional Payment Type

- ✅ **ไม่จำกัดจำนวนครั้ง**
- ใช้เมื่อ Admin เพิ่มค่าใช้จ่ายพิเศษหลายครั้ง
- Member สามารถจ่ายเป็นงวดๆ ได้

---

### 4. Refund Payment Type

- ✅ **Admin เท่านั้น**ที่สามารถสร้าง refund ได้
- ❌ **ไม่แสดง**ในตัวเลือกของ Member
- Member เป็นผู้รับเงินคืน ไม่ใช่ผู้คืนเงิน

---

## 🔍 กฎการนับ Payment Slips

### ✅ **นับทั้ง Approved และ Pending Slips**

```typescript
// ✅ ถูกต้อง - นับทั้ง approved และ pending
const activeSlips = allSlips.filter(slip =>
  slip.status === 'approved' || slip.status === 'pending'
);
```

**เหตุผล:**
- ⚠️ **ป้องกันการอัพโหลดซ้ำ** ขณะที่มี slip รออนุมัติ
- ตราบเท่าที่ slip ยังไม่ถูก **rejected** จะไม่สามารถอัพโหลด payment type เดิมได้
- ยกเว้น `additional` ที่สามารถอัพโหลดได้หลายครั้ง

### ❌ **ไม่นับ Rejected Slips**

```typescript
// ❌ ผิด - ห้ามนับ rejected
const activeSlips = allSlips.filter(slip =>
  slip.status === 'approved' || slip.status === 'pending' || slip.status === 'rejected'
);

// ✅ ถูกต้อง
const activeSlips = allSlips.filter(slip =>
  slip.status === 'approved' || slip.status === 'pending'
);
```

**เหตุผล:**
- Rejected slips = slip ที่ถูกปฏิเสธ → ไม่มีผลต่อ registration
- Member สามารถอัพโหลด slip ใหม่ด้วย payment type เดิมได้

---

## 🛠️ แผนการ Implementation

### จุดที่ต้องแก้ไข

#### 1. **Member UI** - `src/components/PaymentSlipUploadModal.tsx`

**การเปลี่ยนแปลง:**
- เพิ่ม state สำหรับ fetch approved payment slips
- แก้ไข function `getAvailablePaymentTypes()` ให้ตรวจสอบจาก approved slips แทน flags
- Fetch payment slips เมื่อเปิด modal (ตัวเลือก A)

**Logic ใหม่:**
```typescript
const [approvedSlips, setApprovedSlips] = useState<PaymentSlip[]>([]);

useEffect(() => {
  if (!isOpen) return;

  const fetchSlips = async () => {
    const res = await fetch(`/api/payments/slips?registrationId=${registrationId}`);
    const data = await res.json();
    const approved = data.slips.filter(s => s.status === 'approved');
    setApprovedSlips(approved);
  };

  fetchSlips();
}, [isOpen, registrationId]);

const getAvailablePaymentTypes = () => {
  const hasApprovedFull = approvedSlips.some(s => s.paymentType === 'full');
  const hasApprovedDeposit = approvedSlips.some(s => s.paymentType === 'deposit');
  const hasApprovedRemaining = approvedSlips.some(s => s.paymentType === 'remaining');

  // Full Payment Mode
  if (paymentMode === 'full') {
    if (hasApprovedFull) {
      return [{ value: 'additional', label: 'ค่าใช้จ่ายเพิ่มเติม', suggestedAmount: 0 }];
    } else {
      return [
        { value: 'full', label: 'เต็มจำนวน', suggestedAmount: fullPaymentRemaining },
        { value: 'additional', label: 'ค่าใช้จ่ายเพิ่มเติม', suggestedAmount: 0 }
      ];
    }
  }

  // Deposit Payment Mode
  if (paymentMode === 'deposit') {
    if (hasApprovedFull) {
      // Path B: Paid full already
      return [{ value: 'additional', label: 'ค่าใช้จ่ายเพิ่มเติม', suggestedAmount: 0 }];
    } else if (hasApprovedDeposit && hasApprovedRemaining) {
      // Path A: Paid deposit + remaining
      return [{ value: 'additional', label: 'ค่าใช้จ่ายเพิ่มเติม', suggestedAmount: 0 }];
    } else if (hasApprovedDeposit) {
      // Path A: Paid deposit only
      return [
        { value: 'remaining', label: 'ยอดคงเหลือ', suggestedAmount: remainingNeeded },
        { value: 'additional', label: 'ค่าใช้จ่ายเพิ่มเติม', suggestedAmount: 0 }
      ];
    } else {
      // No payment yet
      return [
        { value: 'deposit', label: 'มัดจำ', suggestedAmount: depositRemaining },
        { value: 'full', label: 'เต็มจำนวน (ชำระทั้งหมด)', suggestedAmount: totalRemaining },
        { value: 'additional', label: 'ค่าใช้จ่ายเพิ่มเติม', suggestedAmount: 0 }
      ];
    }
  }
};
```

**ไม่แสดง Refund:**
```typescript
// ❌ Refund จะไม่อยู่ใน available payment types สำหรับ Member
```

---

#### 2. **Server-side Validation** - `src/app/api/payments/upload/route.ts`

**การเปลี่ยนแปลง:**
- เพิ่ม validation logic หลังตรวจสอบ registration exists
- Fetch approved payment slips
- Validate ว่า paymentType ที่ส่งมาถูกต้องตาม logic หรือไม่

**Logic ใหม่:**
```typescript
// ✅ NEW: Validate payment type based on approved slips
const { getPaymentSlipsByRegistration } = await import('@/lib/payment-slips');
const existingSlips = await getPaymentSlipsByRegistration(registrationId);
const approvedSlips = existingSlips.filter(slip => slip.status === 'approved');

const hasApprovedFull = approvedSlips.some(s => s.paymentType === 'full');
const hasApprovedDeposit = approvedSlips.some(s => s.paymentType === 'deposit');
const hasApprovedRemaining = approvedSlips.some(s => s.paymentType === 'remaining');

// Get event to check payment mode
const { getEventById } = await import('@/lib/events');
const event = await getEventById(eventId);
const paymentMode = event?.paymentMode || 'full';

// Validate based on payment mode
if (paymentMode === 'full') {
  // Full Payment Mode
  if (hasApprovedFull && paymentType === 'full') {
    return NextResponse.json({
      error: 'ไม่สามารถอัพโหลดสลิป "ชำระเต็มจำนวน" ได้อีก',
      details: 'มีการชำระเต็มจำนวนที่ได้รับการอนุมัติแล้ว\nหากต้องการชำระเพิ่มเติม กรุณาเลือกประเภท "ค่าใช้จ่ายเพิ่มเติม"'
    }, { status: 400 });
  }

  // Only allow 'full' or 'additional' in full payment mode
  if (paymentType !== 'full' && paymentType !== 'additional') {
    return NextResponse.json({
      error: 'ประเภทการชำระเงินไม่ถูกต้อง',
      details: `Event นี้รับชำระแบบเต็มจำนวน สามารถเลือกได้เฉพาะ "เต็มจำนวน" หรือ "ค่าใช้จ่ายเพิ่มเติม" เท่านั้น`
    }, { status: 400 });
  }
} else if (paymentMode === 'deposit') {
  // Deposit Payment Mode
  if (hasApprovedFull) {
    // Path B: Already paid full
    if (paymentType !== 'additional') {
      return NextResponse.json({
        error: 'ไม่สามารถอัพโหลดสลิปประเภทนี้ได้',
        details: 'มีการชำระเต็มจำนวนที่ได้รับการอนุมัติแล้ว\nสามารถชำระเพิ่มเติมได้เฉพาะประเภท "ค่าใช้จ่ายเพิ่มเติม" เท่านั้น'
      }, { status: 400 });
    }
  } else if (hasApprovedDeposit && hasApprovedRemaining) {
    // Path A: Paid deposit + remaining
    if (paymentType !== 'additional') {
      return NextResponse.json({
        error: 'ไม่สามารถอัพโหลดสลิปประเภทนี้ได้',
        details: 'มีการชำระมัดจำและยอดคงเหลือที่ได้รับการอนุมัติแล้ว\nสามารถชำระเพิ่มเติมได้เฉพาะประเภท "ค่าใช้จ่ายเพิ่มเติม" เท่านั้น'
      }, { status: 400 });
    }
  } else if (hasApprovedDeposit) {
    // Path A: Paid deposit only
    if (paymentType !== 'remaining' && paymentType !== 'additional') {
      return NextResponse.json({
        error: 'ไม่สามารถอัพโหลดสลิปประเภทนี้ได้',
        details: 'มีการชำระมัดจำที่ได้รับการอนุมัติแล้ว\nสามารถชำระได้เฉพาะ "ยอดคงเหลือ" หรือ "ค่าใช้จ่ายเพิ่มเติม" เท่านั้น'
      }, { status: 400 });
    }
  } else {
    // No payment yet - allow deposit, full, or additional
    if (paymentType !== 'deposit' && paymentType !== 'full' && paymentType !== 'additional') {
      return NextResponse.json({
        error: 'ประเภทการชำระเงินไม่ถูกต้อง',
        details: 'สามารถเลือกได้เฉพาะ "มัดจำ", "เต็มจำนวน", หรือ "ค่าใช้จ่ายเพิ่มเติม" เท่านั้น'
      }, { status: 400 });
    }
  }
}

// ✅ Block refund for members (only admin can create refund)
if (paymentType === 'refund') {
  return NextResponse.json({
    error: 'ไม่สามารถอัพโหลดสลิปประเภท "คืนเงิน" ได้',
    details: 'การคืนเงินสามารถดำเนินการได้โดย Admin เท่านั้น'
  }, { status: 400 });
}

console.log('[Member Upload] ✅ Payment type validation passed');
```

---

#### 3. **Admin Upload** (ถ้ามี)

**การเปลี่ยนแปลง:**
- ใช้ logic เดียวกับ Member Upload
- ยกเว้น: Admin สามารถสร้าง "refund" ได้

---

## 📊 ตัวอย่าง Use Case

### Use Case 1: Full Payment Mode - ชำระครั้งที่ 1

**สถานะ:**
- Approved slips: ไม่มี
- Payment mode: full

**ตัวเลือกที่แสดง:**
```
☑ เต็มจำนวน (150 บาท)
☑ ค่าใช้จ่ายเพิ่มเติม
```

**Member เลือก:** "เต็มจำนวน" 150 บาท → อัพโหลดสำเร็จ ✅

---

### Use Case 2: Full Payment Mode - พยายามชำระ "full" ซ้ำ

**สถานะ:**
- Approved slips: 1 slip "full" 150 บาท
- Payment mode: full

**ตัวเลือกที่แสดง:**
```
☑ ค่าใช้จ่ายเพิ่มเติม
```

**Member พยายามเลือก:** "เต็มจำนวน" (ไม่มีในตัวเลือก)

**ถ้า hack API โดยตรง:**
```json
{
  "error": "ไม่สามารถอัพโหลดสลิป \"ชำระเต็มจำนวน\" ได้อีก",
  "details": "มีการชำระเต็มจำนวนที่ได้รับการอนุมัติแล้ว\nหากต้องการชำระเพิ่มเติม กรุณาเลือกประเภท \"ค่าใช้จ่ายเพิ่มเติม\""
}
```

---

### Use Case 3: Deposit Mode - Admin เพิ่มค่าใช้จ่าย

**สถานะ:**
- Approved slips: "deposit" 50 บาท, "remaining" 100 บาท
- Payment mode: deposit
- Admin เพิ่มค่าห้อง 500 บาท → totalAmount = 650 บาท

**ตัวเลือกที่แสดง:**
```
☑ ค่าใช้จ่ายเพิ่มเติม (แนะนำ 500 บาท)
```

**Member เลือก:** "ค่าใช้จ่ายเพิ่มเติม" 500 บาท → อัพโหลดสำเร็จ ✅

---

## 🔧 Technical Details

### Fetch Strategy

**เลือก: ตัวเลือก A - Fetch ใน Component**

**เหตุผล:**
1. ✅ ง่ายกว่า - ไม่ต้องแก้ parent component
2. ✅ ข้อมูล real-time เสมอ
3. ✅ Performance ไม่เป็นปัญหา (เปิด modal ไม่บ่อย)
4. ✅ Scalable - parent component ใหม่ๆ ไม่ต้องแก้

**Code Pattern:**
```typescript
useEffect(() => {
  if (!isOpen) return;

  const fetchSlips = async () => {
    try {
      setLoadingSlips(true);
      const res = await fetch(`/api/payments/slips?registrationId=${registrationId}`);
      const data = await res.json();
      const approved = data.slips.filter((s: any) => s.status === 'approved');
      setApprovedSlips(approved);
    } finally {
      setLoadingSlips(false);
    }
  };

  fetchSlips();
}, [isOpen, registrationId]);
```

---

## ⚠️ ข้อควรระวัง

### 1. API Endpoint
- ต้องตรวจสอบว่ามี endpoint `/api/payments/slips` หรือยัง
- ถ้ายังไม่มี ต้องสร้างใหม่

### 2. Event Data
- Server-side validation ต้อง fetch event data เพื่อรู้ว่า paymentMode คืออะไร
- ต้องใช้ `getEventById()` หรือ function ที่เทียบเท่า

### 3. Backward Compatibility
- Registration เก่าๆ ที่ไม่มี tracked amounts อาจมีปัญหา
- ต้องใช้ fallback logic

### 4. Admin Override
- ควรมี flag สำหรับ Admin ที่สามารถข้าม validation ได้หรือไม่?
- ยังไม่ได้ระบุในแผนนี้

---

## ✅ Checklist ก่อน Implement

- [ ] ยืนยันว่า logic ถูกต้องครบถ้วน
- [ ] ตรวจสอบว่ามี API endpoint `/api/payments/slips` หรือยัง
- [ ] ตรวจสอบว่า `getEventById()` ใช้งานได้
- [ ] กำหนด error messages ภาษาไทยให้ชัดเจน
- [ ] วางแผน test cases
- [ ] พิจารณา Admin override (ถ้าจำเป็น)
- [ ] Review กับทีมก่อน implement

---

## 📝 คำถามที่ยังค้างอยู่

1. **Admin Override**: Admin ควรสามารถข้าม validation นี้ได้หรือไม่?
2. **API Endpoint**: มี `/api/payments/slips` อยู่แล้วหรือยัง?
3. **Error Handling**: ถ้า fetch slips ล้มเหลว จะทำอย่างไร? (fallback behavior)
4. **Loading State**: แสดง loading indicator ขณะ fetch slips หรือไม่?
5. **Cache**: ควร cache approved slips ไว้หรือไม่? (เพื่อไม่ต้อง fetch ทุกครั้งที่เปิด modal)

---

## 📅 Timeline (ยังไม่กำหนด)

> ⚠️ แผนนี้ยังไม่ได้รับการอนุมัติ ยังไม่มี timeline การดำเนินการ

---

## 🔖 สถานะเอกสาร

- **เวอร์ชัน**: Draft 1.0
- **สร้างเมื่อ**: 2026-07-19
- **สถานะ**: 🟡 รอการทบทวนและอนุมัติ
- **ผู้เขียน**: Claude Sonnet 4.5
- **ผู้ทบทวน**: รอการทบทวน

---

## 📌 หมายเหตุสำคัญ

> ⛔ **เอกสารนี้เป็นเพียงแผนร่าง ไม่ใช่แผนที่ระบบใช้อยู่ปัจจุบัน**
>
> ก่อนดำเนินการใดๆ ต้องได้รับการอนุมัติและทบทวนโดยทีมพัฒนาก่อน
>
> แผนนี้อาจมีการเปลี่ยนแปลง แก้ไข หรือยกเลิกได้

---
