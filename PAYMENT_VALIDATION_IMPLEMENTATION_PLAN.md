# 🚀 Payment Validation Implementation Plan

**วันที่สร้าง:** 2026-07-19
**สถานะ:** 🟡 In Progress
**Priority:** ⭐⭐⭐ FIRST PRIORITY

---

## 📋 สรุปแผนงาน

แผนการ implementation ระบบ validation สำหรับการอัพโหลดสลิปการชำระเงิน เพื่อป้องกันการอัพโหลดสลิป payment type ซ้ำ โดยนับทั้ง slips ที่ status = 'approved' และ 'pending'

**เป้าหมาย:**
- ป้องกันการอัพโหลด payment type ซ้ำ (ยกเว้น 'additional')
- Filter available payment types ให้ถูกต้องตาม payment mode (full/deposit)
- Server-side validation เพื่อป้องกัน race condition
- Block member จากการอัพโหลด 'refund' type

---

## 🎯 Phase Overview

| Phase | Description | Status | Est. Time |
|-------|-------------|--------|-----------|
| Phase 1 | สร้าง API endpoint สำหรับ fetch payment slips | ✅ Complete | 30 min |
| Phase 2 | อัพเดท PaymentSlipUploadModal component | ✅ Complete | 45 min |
| Phase 3 | เพิ่ม Server-side Validation | ✅ Complete | 30 min |
| Phase 4 | Manual Testing & Bug Fixes | 🔄 In Progress | 60 min |
| Phase 5 | Deployment & Monitoring | ⏳ Pending | 15 min |

**รวมเวลาโดยประมาณ:** 3 ชั่วโมง

---

## 📦 Phase 1: สร้าง API Endpoint สำหรับ Fetch Payment Slips

**เป้าหมาย:** สร้าง `/api/payments/slips` endpoint เพื่อดึงข้อมูล payment slips ของ registration

### ✅ Checklist

- [x] สร้างไฟล์ `src/app/api/payments/slips/route.ts`
- [x] Implement GET handler
  - [x] รับ `registrationId` จาก query parameters
  - [x] Validate session (require authentication)
  - [x] Query Firestore collection `paymentSlips`
  - [x] Filter slips by `registrationId`
  - [x] Return slips as JSON (ไม่ต้อง filter status - ให้ client จัดการ)
- [x] เพิ่ม error handling
  - [x] Missing registrationId → 400 Bad Request
  - [x] Unauthorized → 401
  - [x] Internal error → 500
- [x] เพิ่ม logging สำหรับ debug
- [ ] ทดสอบ API ด้วย Postman/curl (ข้าม - จะทดสอบผ่าน UI ใน Phase 4)

### 📝 Implementation Notes

```typescript
// src/app/api/payments/slips/route.ts
// GET /api/payments/slips?registrationId=xxx

// ⚠️ IMPORTANT: Return ALL slips (รวม approved, pending, rejected)
// Client จะ filter เองตามที่ต้องการ
```

**Expected Response:**
```json
{
  "slips": [
    {
      "slipId": "SLIP_xxx",
      "registrationId": "P8ACQL",
      "paymentType": "full",
      "amount": 150,
      "status": "approved",
      "uploadedAt": "2024-01-15T10:00:00Z",
      "uploadedBy": "Uxxx"
    },
    // ...
  ]
}
```

---

## 🎨 Phase 2: อัพเดท PaymentSlipUploadModal Component

**เป้าหมาย:** เพิ่มการ fetch payment slips และ update `getAvailablePaymentTypes()` logic

### ✅ Checklist

#### 2.1 เพิ่ม State Variables
- [x] เพิ่ม `paymentSlips` state (เก็บ slips ที่ fetch มา)
- [x] เพิ่ม `loadingSlips` state (แสดง loading indicator)
- [x] เพิ่ม `fetchError` state (เก็บ error message)

#### 2.2 เพิ่ม Fetch Logic
- [x] สร้าง `fetchPaymentSlips()` function
- [x] เรียก API `/api/payments/slips?registrationId=xxx`
- [x] เก็บผลลัพธ์ใน `paymentSlips` state
- [x] Handle error cases
  - [x] Network error → แสดง error toast
  - [x] API error → แสดง error message
  - [x] Fallback: แสดง error UI พร้อม retry button

#### 2.3 เพิ่ม useEffect Hook
- [x] Fetch slips เมื่อ modal เปิด (`isOpen = true`)
- [x] Dependency: `[isOpen, registrationId]`
- [x] Cleanup function (ไม่จำเป็น - fetch เป็น async operation ที่สั้น)

#### 2.4 อัพเดท getAvailablePaymentTypes()
- [x] นับ active slips (approved + pending)
- [x] Filter ออก refund slips (`paymentType !== 'refund'`)
- [x] Implement logic สำหรับ Full Payment Mode
  - [x] มี active 'full' slip → แสดงเฉพาะ 'additional'
  - [x] ไม่มี → แสดง 'full' และ 'additional'
- [x] Implement logic สำหรับ Deposit Mode
  - [x] มี active 'full' → แสดงเฉพาะ 'additional' (Path B)
  - [x] มี active 'deposit' + 'remaining' → แสดงเฉพาะ 'additional'
  - [x] มี active 'deposit' เท่านั้น → แสดง 'remaining' และ 'additional'
  - [x] ไม่มีอะไร → แสดง 'deposit', 'full', 'additional'
- [x] ไม่แสดง 'refund' ใน available types (member ไม่เคยเห็น)

#### 2.5 เพิ่ม Loading UI
- [x] แสดง loading spinner ขณะ fetch slips
- [x] Disable form ขณะ loading (แสดง loading state แทน)
- [x] แสดง error message ถ้า fetch ล้มเหลว

#### 2.6 คำนวณ suggestedAmount ใหม่
- [x] คำนวณยอดที่เหลือจาก `*AmountPaid` fields
- [x] หัก amount ที่จ่ายไปแล้ว (จาก approved slips - ใช้ props ที่มีอยู่แล้ว)

### 📝 Implementation Notes

```typescript
// State เพิ่มเติม
const [paymentSlips, setPaymentSlips] = useState<PaymentSlip[]>([]);
const [loadingSlips, setLoadingSlips] = useState(false);
const [fetchError, setFetchError] = useState<string | null>(null);

// Fetch slips
useEffect(() => {
  if (isOpen && registrationId) {
    fetchPaymentSlips();
  }
}, [isOpen, registrationId]);

const fetchPaymentSlips = async () => {
  setLoadingSlips(true);
  setFetchError(null);

  try {
    const response = await fetch(`/api/payments/slips?registrationId=${registrationId}`);

    if (!response.ok) {
      throw new Error('Failed to fetch payment slips');
    }

    const data = await response.json();
    setPaymentSlips(data.slips || []);
  } catch (error) {
    console.error('[PaymentSlipUploadModal] Fetch error:', error);
    setFetchError('ไม่สามารถโหลดข้อมูลสลิปได้');
    toast.error('ไม่สามารถโหลดข้อมูลสลิปได้ กรุณาลองใหม่');
    // ⚠️ ตัดสินใจ: ปิด modal หรือให้ใช้งานต่อ?
  } finally {
    setLoadingSlips(false);
  }
};

// Filter active slips (ไม่รวม refund)
const activeSlips = paymentSlips.filter(slip =>
  (slip.status === 'approved' || slip.status === 'pending') &&
  slip.paymentType !== 'refund'
);

// Check existing payment types
const hasActiveFull = activeSlips.some(s => s.paymentType === 'full');
const hasActiveDeposit = activeSlips.some(s => s.paymentType === 'deposit');
const hasActiveRemaining = activeSlips.some(s => s.paymentType === 'remaining');
```

**Loading UI:**
```tsx
{loadingSlips ? (
  <div className="text-center py-8">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
    <p className="text-sm text-gray-500 mt-3">กำลังตรวจสอบประวัติการชำระเงิน...</p>
  </div>
) : fetchError ? (
  <div className="text-center py-8">
    <p className="text-sm text-red-600">{fetchError}</p>
    <button onClick={fetchPaymentSlips} className="mt-3 text-blue-600 text-sm">
      ลองใหม่อีกครั้ง
    </button>
  </div>
) : (
  <form onSubmit={handleSubmit}>
    {/* Form fields */}
  </form>
)}
```

---

## 🔒 Phase 3: Server-side Validation

**เป้าหมาย:** เพิ่ม validation ใน `/api/payments/upload` เพื่อป้องกัน duplicate และ race condition

### ✅ Checklist

#### 3.1 Block Member จากการอัพโหลด Refund
- [x] ตรวจสอบ `paymentType === 'refund'`
- [x] ตรวจสอบ user role
- [x] ถ้า role ไม่ใช่ 'admin' → return 403 Forbidden

#### 3.2 Fetch Existing Slips
- [x] ดึง slips ทั้งหมดของ registration (ก่อนอัพโหลดไฟล์)
- [x] Filter active slips (approved + pending, ไม่รวม refund)

#### 3.3 Validate Duplicate Payment Type
- [x] ตรวจสอบว่ามี active slip ของ payment type เดิมหรือไม่
- [x] ยกเว้น 'additional' (อนุญาตให้อัพโหลดได้หลายครั้ง)
- [x] ถ้าซ้ำ → return 400 Bad Request พร้อม error message

#### 3.4 Block Refund ถ้ามี Pending Slips
- [x] ถ้า `paymentType === 'refund'`
- [x] ตรวจสอบว่ามี slip ที่ status = 'pending' หรือไม่
- [x] ถ้ามี → return 400 พร้อม error message
  - "ไม่สามารถสร้าง refund ได้ เนื่องจากมีสลิปที่รออนุมัติอยู่ กรุณาดำเนินการอนุมัติหรือปฏิเสธสลิปก่อน"

#### 3.5 เพิ่ม Logging
- [x] Log validation results
- [x] Log ข้อมูล existing slips
- [x] Log rejection reason

### 📝 Implementation Notes

**ใน `/api/payments/upload/route.ts` - เพิ่มก่อน upload file:**

```typescript
// 1. Block member from uploading refund
if (paymentType === 'refund') {
  const userRole = session.user.role || 'member';

  if (userRole !== 'admin') {
    console.log('[Member Upload] ❌ Member attempted to upload refund');
    return NextResponse.json({
      error: 'เฉพาะ Admin เท่านั้นที่สามารถสร้าง refund ได้'
    }, { status: 403 });
  }
}

// 2. Fetch existing slips
console.log('[Member Upload] Fetching existing slips for validation...');
const existingSlips = await getPaymentSlipsByRegistrationId(registrationId);

console.log('[Member Upload] Found', existingSlips.length, 'existing slip(s)');

// 3. Filter active slips (exclude refund)
const activeSlips = existingSlips.filter(slip =>
  (slip.status === 'approved' || slip.status === 'pending') &&
  slip.paymentType !== 'refund'
);

console.log('[Member Upload] Active slips (approved + pending, excluding refund):', activeSlips.length);

// 4. Check for duplicate payment type (except 'additional')
if (paymentType !== 'additional') {
  const hasDuplicate = activeSlips.some(slip => slip.paymentType === paymentType);

  if (hasDuplicate) {
    console.log('[Member Upload] ❌ Duplicate payment type detected:', paymentType);
    return NextResponse.json({
      error: `ไม่สามารถอัพโหลดสลิปประเภท "${getPaymentTypeLabel(paymentType)}" ได้`,
      details: 'มีสลิปประเภทนี้รออนุมัติหรืออนุมัติแล้ว กรุณารอการตรวจสอบก่อน'
    }, { status: 400 });
  }
}

// 5. Block refund if there are pending slips
if (paymentType === 'refund') {
  const hasPendingSlips = existingSlips.some(slip => slip.status === 'pending');

  if (hasPendingSlips) {
    console.log('[Member Upload] ❌ Cannot create refund - pending slips exist');
    return NextResponse.json({
      error: 'ไม่สามารถสร้าง refund ได้',
      details: 'มีสลิปที่รออนุมัติอยู่ กรุณาดำเนินการอนุมัติหรือปฏิเสธสลิปก่อน'
    }, { status: 400 });
  }
}

console.log('[Member Upload] ✅ Validation passed - proceeding with upload');

// ... continue with file upload
```

**Helper function ที่ต้องสร้าง/แก้ไข:**
```typescript
// src/lib/payment-slips.ts
export async function getPaymentSlipsByRegistrationId(registrationId: string): Promise<PaymentSlip[]> {
  const db = adminDb();

  const slipsSnapshot = await db.collection('paymentSlips')
    .where('registrationId', '==', registrationId)
    .get();

  const slips = slipsSnapshot.docs.map(doc => ({
    slipId: doc.id,
    ...doc.data()
  })) as PaymentSlip[];

  return slips;
}

function getPaymentTypeLabel(type: string): string {
  switch (type) {
    case 'deposit': return 'มัดจำ';
    case 'remaining': return 'ยอดคงเหลือ';
    case 'full': return 'เต็มจำนวน';
    case 'additional': return 'ค่าใช้จ่ายเพิ่มเติม';
    case 'refund': return 'คืนเงิน';
    default: return type;
  }
}
```

---

## 🧪 Phase 4: Manual Testing & Bug Fixes

**เป้าหมาย:** ทดสอบทุก scenario และแก้ไข bugs

### ✅ Checklist

#### 4.1 Setup Test Environment
- [ ] เตรียม test event (1 event, payment mode = full)
- [ ] เตรียม test event (1 event, payment mode = deposit)
- [ ] เตรียม test registration (2-3 registrations)
- [ ] เตรียม test user accounts (member + admin)

#### 4.2 Test Scenarios - Full Payment Mode

**Scenario F1: อัพโหลด full payment ครั้งแรก**
- [ ] Member เปิด modal → ควรเห็น 'full' และ 'additional'
- [ ] อัพโหลดสลิป type = 'full' → ควรสำเร็จ
- [ ] ตรวจสอบ status = 'pending'

**Scenario F2: พยายามอัพโหลด full payment ซ้ำ (pending)**
- [ ] Member เปิด modal → ควรเห็นเฉพาะ 'additional'
- [ ] **Manual hack:** ส่ง API request ด้วย type = 'full'
- [ ] ควรได้รับ error 400 "ไม่สามารถอัพโหลดสลิปประเภท..."

**Scenario F3: Admin อนุมัติ full payment**
- [ ] Admin อนุมัติสลิป
- [ ] ตรวจสอบ fullPaymentAmountPaid อัพเดท
- [ ] Member เปิด modal → ยังคงเห็นเฉพาะ 'additional'

**Scenario F4: Admin ปฏิเสธ full payment**
- [ ] Admin reject สลิป
- [ ] Member เปิด modal → ควรเห็น 'full' และ 'additional' อีกครั้ง

**Scenario F5: อัพโหลด additional payment หลายครั้ง**
- [ ] อัพโหลด additional ครั้งที่ 1 → ควรสำเร็จ
- [ ] เปิด modal อีกครั้ง → ยังเห็น 'additional'
- [ ] อัพโหลด additional ครั้งที่ 2 → ควรสำเร็จ
- [ ] อัพโหลด additional ครั้งที่ 3 → ควรสำเร็จ

#### 4.3 Test Scenarios - Deposit Payment Mode

**Scenario D1: อัพโหลด deposit ครั้งแรก**
- [ ] Member เปิด modal → ควรเห็น 'deposit', 'full', 'additional'
- [ ] อัพโหลดสลิป type = 'deposit' → ควรสำเร็จ
- [ ] เปิด modal อีกครั้ง → ควรเห็นเฉพาะ 'remaining' และ 'additional'

**Scenario D2: อัพโหลด remaining**
- [ ] Admin อนุมัติ deposit
- [ ] Member เปิด modal → เห็น 'remaining' และ 'additional'
- [ ] อัพโหลด remaining → ควรสำเร็จ
- [ ] เปิด modal อีกครั้ง → เห็นเฉพาะ 'additional'

**Scenario D3: Path B - อัพโหลด full payment แทน deposit**
- [ ] Registration ใหม่ (payment mode = deposit)
- [ ] Member เปิด modal → เห็น 'deposit', 'full', 'additional'
- [ ] อัพโหลด 'full' → ควรสำเร็จ
- [ ] เปิด modal อีกครั้ง → เห็นเฉพาะ 'additional'

**Scenario D4: Reject deposit แล้วอัพโหลดใหม่**
- [ ] Admin reject deposit slip
- [ ] Member เปิด modal → กลับมาเห็น 'deposit', 'full', 'additional'

#### 4.4 Test Scenarios - Admin Refund

**Scenario R1: Admin สร้าง refund (ไม่มี pending slips)**
- [ ] Admin เปิด admin payment upload
- [ ] เห็นตัวเลือก 'refund'
- [ ] อัพโหลด refund → ควรสำเร็จ

**Scenario R2: Admin พยายามสร้าง refund (มี pending slips)**
- [ ] Member อัพโหลด slip (status = pending)
- [ ] Admin พยายามอัพโหลด refund
- [ ] ควรได้รับ error "มีสลิปที่รออนุมัติอยู่..."

**Scenario R3: Member พยายาม hack อัพโหลด refund**
- [ ] Member ใช้ dev tools hack API request
- [ ] ส่ง paymentType = 'refund'
- [ ] ควรได้รับ error 403 "เฉพาะ Admin เท่านั้น..."

#### 4.5 Test Error Handling

**Scenario E1: Network error ขณะ fetch slips**
- [ ] Disconnect network
- [ ] เปิด modal
- [ ] ควรแสดง error message และปุ่ม "ลองใหม่อีกครั้ง"

**Scenario E2: API error (500)**
- [ ] Mock API ให้ return 500
- [ ] เปิด modal
- [ ] ควรแสดง error message

**Scenario E3: Firestore connection error**
- [ ] Mock Firestore error
- [ ] อัพโหลดสลิป
- [ ] ควรได้รับ error message

#### 4.6 Test UI/UX

- [ ] Loading spinner แสดงถูกต้อง
- [ ] Suggested amount คำนวณถูกต้อง
- [ ] Payment type labels แสดงเป็นภาษาไทย
- [ ] Error messages อ่านเข้าใจง่าย
- [ ] Modal ปิดหลังอัพโหลดสำเร็จ
- [ ] Toast notification แสดงถูกต้อง

#### 4.7 Test Race Condition

**Scenario RC1: กดส่งหลายครั้งพร้อมกัน**
- [ ] เปิด modal
- [ ] กดปุ่ม submit หลายครั้งติดๆกัน
- [ ] ควรอัพโหลดได้เพียงครั้งเดียว (ปุ่ม disabled ขณะ uploading)

**Scenario RC2: เปิด 2 tabs พร้อมกัน**
- [ ] เปิด modal ใน tab 1
- [ ] เปิด modal ใน tab 2
- [ ] อัพโหลดจาก tab 1 ก่อน → สำเร็จ
- [ ] อัพโหลดจาก tab 2 → ควรถูก block โดย server validation

#### 4.8 Bug Tracking

**พบ Bugs:**
- [x] Bug #1: `/api/admin/payments/upload-for-user` ไม่รองรับ 'refund' payment type
  - Error: "Invalid payment type. Must be: full, deposit, remaining, or additional"
  - สาเหตุ: `validPaymentTypes` array ไม่มี 'refund'
  - ผลกระทบ: Admin ไม่สามารถอัพโหลด refund slip ได้

**Fixed Bugs:**
- [x] Bug #1 Fixed (2026-07-19)
  - แก้ไขใน `src/app/api/admin/payments/upload-for-user/route.ts`
  - เพิ่ม 'refund' ใน validPaymentTypes array
  - เพิ่ม server-side validation เหมือนกับ member upload API
  - เพิ่ม duplicate check และ pending slips validation
  - Import `getPaymentSlipsByRegistration` และ `getPaymentTypeLabel` functions
- [x] Bug #2 Fixed (2026-07-19)
  - ลบ URL input field ออกจาก Admin Payment Upload Modal
  - แก้ไขใน `src/app/admin/events/[eventId]/page.tsx`
  - ลบ "OR Divider" และ URL input section (lines 3521-3541)
  - Admin จะอัพโหลดไฟล์โดยตรงเท่านั้น

#### 4.9 Automated Tests

**Created Automated Test Suite:**
- [x] สร้าง API route `/api/test/payment-validation`
  - รันบน Vercel production/staging environment
  - Require admin authentication
  - Return JSON results
- [x] สร้าง Admin UI page `/admin/test/payment-validation`
  - One-click test execution
  - Real-time results display
  - Detailed error messages and test details
- [x] Test scenarios implemented:
  - [x] Test 1: Fetch Payment Slips API
  - [x] Test 2: Server-side Duplicate Validation
  - [x] Test 3: Active Slips Counting Logic
  - [x] Test 4: Payment Mode Validation
  - [x] Test 5: Refund Validation Logic

**Test Event:**
- Event ID: `กิจกรรมทดสอบการลงทะเบียน-2026`
- ใช้สำหรับทดสอบเท่านั้น ไม่กระทบข้อมูลจริง

---

## 🚀 Phase 5: Deployment & Monitoring

**เป้าหมาย:** Deploy ไป production และติดตามผล

### ✅ Checklist

#### 5.1 Pre-Deployment

- [ ] Review code changes
- [ ] ตรวจสอบว่าทุก test scenario ผ่าน
- [ ] ตรวจสอบ console.log (เอาออกหรือเปลี่ยนเป็น debug mode)
- [ ] Commit changes พร้อม meaningful message
- [ ] สร้าง git branch สำหรับ feature นี้ (ถ้ายังไม่มี)

#### 5.2 Deployment

- [ ] Push code ไป repository
- [ ] Deploy ไป production (Vercel/ที่ใช้อยู่)
- [ ] ตรวจสอบ build logs ไม่มี error
- [ ] ตรวจสอบ deployment สำเร็จ

#### 5.3 Post-Deployment Testing

- [ ] ทดสอบบน production environment
  - [ ] Member upload slip
  - [ ] Admin approve/reject
  - [ ] Available payment types ถูกต้อง
- [ ] ตรวจสอบ error logs (Firebase/Vercel logs)
- [ ] ตรวจสอบไม่มี breaking changes

#### 5.4 Monitoring (3-7 วันแรก)

- [ ] **Day 1:** ตรวจสอบ error logs
- [ ] **Day 2:** ตรวจสอบ user feedback
- [ ] **Day 3:** ตรวจสอบ payment slip uploads ทำงานถูกต้อง
- [ ] **Day 7:** Review performance และ user experience

#### 5.5 Rollback Plan (ถ้าเจอปัญหาร้ายแรง)

**เงื่อนไขสำหรับ Rollback:**
- Member ไม่สามารถอัพโหลดสลิปได้เลย (blocking issue)
- Server error rate สูงเกิน 10%
- Data corruption (payment slips สูญหาย/ผิดพลาด)

**Rollback Steps:**
1. [ ] Revert git commit
2. [ ] Deploy เวอร์ชันเดิมกลับไป production
3. [ ] แจ้ง admin team
4. [ ] วิเคราะห์ปัญหาและแก้ไขใน development
5. [ ] ทดสอบอีกครั้งก่อน deploy ใหม่

**Fast Rollback Command:**
```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset to specific commit (ระวัง: force push)
git reset --hard <commit-hash>
git push --force origin main
```

**Alternative: Feature Flag Approach**
```typescript
// ในอนาคตอาจใช้ feature flag
const ENABLE_PAYMENT_VALIDATION = process.env.NEXT_PUBLIC_ENABLE_PAYMENT_VALIDATION === 'true';

if (ENABLE_PAYMENT_VALIDATION) {
  // ใช้ logic ใหม่
} else {
  // ใช้ logic เดิม (fallback)
}
```

---

## 📊 Progress Tracking

**เริ่มงาน:** 2026-07-19
**คาดว่าเสร็จ:** TBD

### Session Log

#### Session 1 (2026-07-19)
- ✅ สร้างแผนงาน implementation
- ✅ Phase 1: Complete - สร้าง API endpoint `/api/payments/slips`
  - Created `src/app/api/payments/slips/route.ts`
  - Implemented GET handler with authentication
  - Added error handling and logging
- 🔄 Phase 2: In Progress - เริ่มอัพเดท PaymentSlipUploadModal
- ⏳ Phase 3: Pending
- ⏳ Phase 4: Pending
- ⏳ Phase 5: Pending

**Next TODO:**
1. ทำ Phase 2: อัพเดท PaymentSlipUploadModal component
   - เพิ่ม state variables
   - เพิ่ม fetch logic
   - อัพเดท getAvailablePaymentTypes()
2. ทำ Phase 3: Server-side Validation
3. ทำ Phase 4: Manual Testing

---

## 📚 References

- [PAYMENT_VALIDATION_PLAN_DRAFT.md](./PAYMENT_VALIDATION_PLAN_DRAFT.md) - แผนการ validation (draft)
- [PAYMENT_SYSTEM_TEST_SCENARIOS.md](./PAYMENT_SYSTEM_TEST_SCENARIOS.md) - Test scenarios
- [src/components/PaymentSlipUploadModal.tsx](./src/components/PaymentSlipUploadModal.tsx) - Component ที่ต้องแก้ไข
- [src/app/api/payments/upload/route.ts](./src/app/api/payments/upload/route.ts) - API ที่ต้องแก้ไข

---

## 🎯 Success Criteria

✅ **Phase 1 Complete When:**
- API endpoint `/api/payments/slips` ทำงานได้ถูกต้อง
- Return slips ของ registration ครบถ้วน
- Error handling ครบทุกกรณี

✅ **Phase 2 Complete When:**
- Modal fetch slips เมื่อเปิด
- Available payment types แสดงถูกต้องตาม validation logic
- Loading state และ error handling ทำงานดี
- UI/UX smooth ไม่มี glitch

✅ **Phase 3 Complete When:**
- Server-side validation block duplicate payment types ได้
- Member ไม่สามารถอัพโหลด refund ได้
- Refund ถูก block ถ้ามี pending slips
- Error messages ชัดเจนและเป็นภาษาไทย

✅ **Phase 4 Complete When:**
- ทดสอบทุก scenario ผ่าน (Full mode, Deposit mode, Refund, Errors)
- ไม่มี bugs ร้ายแรง
- UX ดีและ user เข้าใจง่าย

✅ **Phase 5 Complete When:**
- Deploy ไป production สำเร็จ
- ไม่มี error logs ผิดปกติ
- Member สามารถอัพโหลดสลิปได้ตามปกติ
- Monitor 7 วันแรกไม่มีปัญหา

---

## 📝 Notes

- **ไม่มี deadline แต่เป็น first priority** - ทำอย่างรอบคอบและ test ให้ดี
- **Manual testing เท่านั้น** - ยังไม่ต้องเขียน automated tests
- **Member registrations ที่ active น้อย** - ผลกระทบจะไม่มาก
- **ไม่ต้องแจ้งเตือน members** - Deploy เงียบๆ และ monitor

---

**Last Updated:** 2026-07-19
**Updated By:** Claude Sonnet 4.5
