# Cancellation Feature - แผนการพัฒนาระบบยกเลิกการจอง

**สถานะ:** 🚧 In Progress
**เริ่มพัฒนา:** 2026-08-09
**อัปเดตล่าสุด:** 2026-08-09

---

## สารบัญ

1. [ภาพรวม](#ภาพรวม)
2. [ความต้องการ](#ความต้องการ)
3. [Database Schema](#database-schema)
4. [Implementation Plan](#implementation-plan)
5. [Progress Tracking](#progress-tracking)

---

## ภาพรวม

ระบบยกเลิกการจอง (Cancellation System) เป็น feature ที่ให้สมาชิกและ admin สามารถยกเลิกการลงทะเบียนกิจกรรมได้ พร้อมทั้งมีระบบคำนวณเงินคืนตามเงื่อนไขที่กำหนดไว้ล่วงหน้า

### วัตถุประสงค์

- ให้สมาชิกสามารถยกเลิกการจองได้เอง
- ให้ admin สามารถยกเลิกแทนสมาชิกได้
- มีระบบคำนวณเงินคืนอัตโนมัติตามนโยบายที่กำหนด
- บันทึกประวัติการยกเลิกและข้อมูลที่เคยเลือก (ห้องพัก, carpool)
- แจ้งเตือนผ่าน LINE เมื่อมีการยกเลิกและคืนเงิน

---

## ความต้องการ

### 1. การตั้งค่าเงื่อนไขการยกเลิก (Cancellation Policy)

**ตำแหน่ง:** หน้าสร้างกิจกรรม / แก้ไขกิจกรรม

#### เงื่อนไขแบบที่ 1: ไม่คืนเงินในทุกกรณี
- ชื่อ: "ไม่คืนเงินในทุกกรณี" (ตายตัว)
- คำอธิบาย: `<textarea>` - optional
- Active/Inactive: `<checkbox>`

#### เงื่อนไขแบบที่ 2: ยกเลิกตามวันที่แน่นอน (สร้างได้หลายเงื่อนไข)
- **ชื่อเงื่อนไข:** `<input text>` เช่น "ยกเลิกก่อน 1 มี.ค."
- **ยกเลิกก่อนวันที่:** `<date picker>` - **วันที่ห้ามซ้ำกัน** (มี validation)
- **ประเภทการคืนเงิน:**
  - ○ **คืนเงิน** → เลือกประเภท:
    - ● **เปอร์เซ็นต์:** `<input number>` %
    - ● **จำนวนเงิน:** `<input number>` บาท
  - ○ **เก็บเงินเต็มจำนวน** (ไม่คืน)
- **คำอธิบาย:** `<textarea>` - optional
- **Active/Inactive:** `<checkbox>`

#### การตั้งค่าเพิ่มเติม
- **ส่ง LINE แจ้งเตือน:** `<checkbox>` - default: checked

#### ความหมายของ "ยกเลิกก่อน"
- **"ยกเลิกก่อนวันที่ 2026-03-01"** = ต้องยกเลิกภายใน **23:59 น. ของวันที่ 2026-02-28**
- วันที่ 2026-03-01 00:00 น. เป็นต้นไป = เกินกำหนด

**ตัวอย่างการตั้งค่า:**
```
✓ ยกเลิกก่อนวันที่ 2026-03-01 → คืน 80%
✓ ยกเลิกก่อนวันที่ 2026-03-15 → คืน 50%
✓ ยกเลิกก่อนวันที่ 2026-03-22 → คืน 20%
✗ ยกเลิกก่อนวันที่ 2026-03-25 → ไม่คืนเงิน (inactive)
```

---

### 2. ขั้นตอนการยกเลิกจอง (Cancellation Flow)

#### กรณีที่ 1: ยกเลิกโดยยังไม่ชำระเงิน
1. ผู้ใช้/Admin กดยกเลิกการจอง
2. ระบบตรวจสอบยอดชำระ → ถ้า `paidAmount = 0` หรือ `undefined`
3. แสดงข้อความยืนยัน: "ยกเลิกการจองโดยไม่มียอดต้องชำระคืน"
4. เปลี่ยนสถานะเป็น `status = 'cancelled'` ทันที
5. บันทึก:
   - `cancelledAt` = ปัจจุบัน
   - `cancelledBy` = user/admin
   - `refundAmount = 0`
   - `refundStatus = 'not_applicable'`

#### กรณีที่ 2: ยกเลิกโดยชำระเงินแล้ว
1. ผู้ใช้/Admin กดยกเลิกการจอง
2. ระบบตรวจสอบยอดชำระ → ถ้า `paidAmount > 0`
3. **คำนวณยอดคืนเงินตามนโยบาย:**
   - เช็ควันที่ยกเลิกกับเงื่อนไขที่ active
   - หาเงื่อนไขที่ตรงกับช่วงเวลา (ถ้ามีหลายเงื่อนไข ใช้เงื่อนไขที่ตรงกับวันที่ปัจจุบัน)
   - คำนวณยอดคืน:
     - ถ้าเป็น `percentage` → `refundAmount = paidAmount × (percentage / 100)`
     - ถ้าเป็น `fixed` → `refundAmount = fixedAmount`
     - ถ้า `none` → `refundAmount = 0`
4. **แสดงสรุปก่อนยืนยัน:**
   ```
   ยอดที่ชำระแล้ว: X บาท
   เงื่อนไขที่ใช้: [ชื่อเงื่อนไข]
   ยอดคืน: Y บาท
   ยอดหักค่าใช้จ่าย: Z บาท
   ```
5. ยืนยันการยกเลิก → เปลี่ยนสถานะเป็น `status = 'cancelled'`
6. บันทึก:
   - `cancelledAt` = ปัจจุบัน
   - `cancelledBy` = user/admin
   - `appliedCancellationRule` = ruleId
   - `refundAmount` = calculated amount
   - `refundPercentage` = calculated %
   - `refundStatus = 'pending'`
   - `previousRoomInfo` = JSON ของห้องที่เคยเลือก
   - `previousCarpoolInfo` = JSON ของ carpool ที่เคยอยู่
7. **ปลดห้องและ carpool อัตโนมัติ:**
   - ลบ `roomAssignments`
   - ลบ `carpoolId`
   - อัพเดทข้อมูลใน carpool collection (ลบสมาชิก)

---

### 3. การจัดการคืนเงิน (Refund Management)

#### ในหน้า Admin Event Detail:
1. แสดงรายการ `cancelled` registrations ที่ `refundStatus = 'pending'`
2. แสดงยอดเงินที่ต้องคืน (`refundAmount`)
3. ปุ่ม **"อัพโหลดสลิปคืนเงิน"**

#### เมื่อ Admin คลิกอัพโหลดสลิป:
1. เปิด modal อัพโหลดสลิป (ใช้ระบบเดิม)
2. Pre-fill:
   - `paymentType = 'refund'`
   - `amount = refundAmount` (แสดงเป็นยอดแนะนำ)
3. Admin อัพโหลด + confirm
4. บันทึก Payment Slip ประเภท `refund`
5. อัพเดท:
   - `refundStatus = 'completed'`
   - เพิ่มใน `refundHistory`
   - อัพเดท `totalRefunded`

---

### 4. การแสดงผลในระบบ

#### หน้า Member (My Registrations):
- แสดงปุ่ม **"ยกเลิกการจอง"** (ถ้า `status !== 'cancelled'`)
- เมื่อยกเลิกแล้ว แสดง:
  ```
  สถานะ: ยกเลิกแล้ว
  ยอดคืน: X บาท
  สถานะการคืนเงิน: รอดำเนินการ / คืนแล้ว
  ```

#### หน้า Admin (Event Detail):
- Tab/Section แสดง "รายการยกเลิก"
- แสดง:
  - จำนวนการยกเลิกทั้งหมด
  - ยอดเงินที่ต้องคืนรวม
  - รายการที่รอดำเนินการคืนเงิน
- มีปุ่ม **"อัพโหลดสลิปคืนเงิน"** สำหรับแต่ละ registration

---

### 5. LINE Notification

**เงื่อนไข:** ส่งเฉพาะเมื่อ `event.cancellationPolicy.sendLineNotification = true`

#### Template 1: แจ้งยกเลิกสำเร็จ
```
🚫 ยกเลิกการลงทะเบียนสำเร็จ

กิจกรรม: [Event Name]
รหัสลงทะเบียน: [Registration ID]
ยอดที่ชำระไว้: [Paid Amount] บาท
ยอดคืน: [Refund Amount] บาท
สถานะการคืนเงิน: รอดำเนินการ

เงื่อนไขที่ใช้: [Rule Name]
```

#### Template 2: แจ้งเมื่อคืนเงินแล้ว
```
✅ คืนเงินสำเร็จ

กิจกรรม: [Event Name]
รหัสลงทะเบียน: [Registration ID]
จำนวนเงินที่คืน: [Refund Amount] บาท

กรุณาตรวจสอบบัญชีของท่าน
```

---

## Database Schema

### เพิ่มใน Event Interface

```typescript
// src/types/event.ts

// Cancellation Policy Configuration
cancellationPolicy?: CancellationPolicy;
```

```typescript
// Cancellation Policy Configuration (New - for event cancellation rules)
export interface CancellationPolicy {
  enabled: boolean;                    // เปิดใช้งานระบบยกเลิก
  noRefundPolicy?: {
    active: boolean;                   // เปิดใช้งานเงื่อนไข "ไม่คืนเงินในทุกกรณี"
    description?: string;              // คำอธิบายเพิ่มเติม (optional)
  };
  dateBasedPolicies: DateBasedCancellationRule[]; // เงื่อนไขตามวันที่
  sendLineNotification: boolean;       // ส่ง LINE แจ้งเตือนเมื่อยกเลิก (default: true)
}

// Date-based cancellation rule
export interface DateBasedCancellationRule {
  ruleId: string;                      // Unique ID (auto-generated)
  ruleName: string;                    // ชื่อเงื่อนไข เช่น "ยกเลิกก่อน 30 วัน"
  cancelBeforeDate: string;            // วันที่ที่ต้องยกเลิกก่อน (YYYY-MM-DD) - วันที่แน่นอน
  refundType: 'percentage' | 'fixed' | 'none'; // ประเภทการคืนเงิน
  refundValue: number;                 // ค่าคืนเงิน (% หรือจำนวนเงิน)
  description?: string;                // คำอธิบายเพิ่มเติม (optional)
  active: boolean;                     // เปิด/ปิดใช้งาน
  createdAt: string;                   // ISO timestamp
}
```

### เพิ่ม/แก้ไขใน EventRegistration Interface

```typescript
// Cancellation Info (Enhanced) - แก้ไขจากเดิม
cancellationReason?: string;           // เหตุผลการยกเลิก
cancelledAt?: string;                  // วันเวลาที่ยกเลิก (ISO timestamp)
cancelledBy?: string;                  // ยกเลิกโดย (lineUserId หรือ admin email)
cancellationMethod?: 'member' | 'admin'; // ยกเลิกโดยสมาชิกหรือ admin
appliedCancellationRule?: string;      // ruleId ของเงื่อนไขที่ใช้
refundAmount?: number;                 // จำนวนเงินที่ต้องคืน (calculated)
refundPercentage?: number;             // เปอร์เซ็นต์ที่คืน (for display)
refundStatus?: 'pending' | 'completed' | 'not_applicable'; // สถานะการคืนเงิน
previousRoomInfo?: string;             // ข้อมูลห้องพักที่เคยเลือก (JSON string)
previousCarpoolInfo?: string;          // ข้อมูล carpool ที่เคยเลือก (JSON string)
```

---

## Implementation Plan

### Phase 1: Database Schema & Types ✅

**วัตถุประสงค์:** เพิ่ม TypeScript types และ helper functions

**งานที่ต้องทำ:**
- [x] เพิ่ม `CancellationPolicy` interface ใน `src/types/event.ts`
- [x] เพิ่ม `DateBasedCancellationRule` interface
- [x] เพิ่ม `RefundCalculationResult` interface
- [x] แก้ไข `Event` interface (เพิ่ม `cancellationPolicy` field)
- [x] แก้ไข `EventInput` interface (เพิ่ม `cancellationPolicy` field)
- [x] แก้ไข `EventRegistration` interface (เพิ่ม 9 cancellation fields)
- [x] สร้าง helper function `validateCancellationPolicyDates()`
- [x] สร้าง helper function `calculateRefundAmount()`
- [x] เพิ่ม column mappings ใน `EVENT_REGISTRATION_COLUMN_MAP`

**ไฟล์ที่เกี่ยวข้อง:**
- `src/types/event.ts`

**Acceptance Criteria:**
- ✅ TypeScript compile ผ่านไม่มี error
- ✅ Helper functions มี logic ครบถ้วน
- ✅ Schema รองรับทุก use case ตามความต้องการ

**สิ่งที่เพิ่ม:**
1. **3 New Interfaces:**
   - `CancellationPolicy` - นโยบายการยกเลิก
   - `DateBasedCancellationRule` - เงื่อนไขตามวันที่
   - `RefundCalculationResult` - ผลลัพธ์การคำนวณเงินคืน

2. **9 New Fields in EventRegistration:**
   - `cancelledBy` - ผู้ยกเลิก
   - `cancellationMethod` - วิธีการยกเลิก (member/admin)
   - `appliedCancellationRule` - เงื่อนไขที่ใช้
   - `refundAmount` - ยอดเงินคืน
   - `refundPercentage` - เปอร์เซ็นต์คืน
   - `refundStatus` - สถานะการคืนเงิน
   - `previousRoomInfo` - ข้อมูลห้องเดิม
   - `previousCarpoolInfo` - ข้อมูล carpool เดิม
   - (รวมกับ `cancellationReason` และ `cancelledAt` ที่มีอยู่แล้ว)

3. **2 Helper Functions:**
   - `validateCancellationPolicyDates()` - ตรวจสอบวันที่ซ้ำ
   - `calculateRefundAmount()` - คำนวณเงินคืนตามนโยบาย

---

### Phase 2: Event Creation/Edit UI ❌

**วัตถุประสงค์:** เพิ่ม UI สำหรับตั้งค่า Cancellation Policy

**งานที่ต้องทำ:**
- [ ] สร้าง component `CancellationPolicySettings.tsx`
- [ ] Toggle "เปิดใช้งานระบบยกเลิก"
- [ ] Section "ไม่คืนเงินในทุกกรณี"
  - [ ] Checkbox active/inactive
  - [ ] Textarea description
- [ ] Section "เงื่อนไขตามวันที่"
  - [ ] ปุ่ม "เพิ่มเงื่อนไข"
  - [ ] Form สร้าง/แก้ไขเงื่อนไข:
    - [ ] Input ชื่อเงื่อนไข
    - [ ] Date picker (วันที่ห้ามซ้ำ - validation)
    - [ ] Radio: คืนเงิน / เก็บเต็มจำนวน
    - [ ] Conditional input: % หรือ บาท
    - [ ] Textarea description
    - [ ] Checkbox active/inactive
  - [ ] แสดงรายการเงื่อนไขที่สร้างแล้ว (sortable by date)
  - [ ] ปุ่มแก้ไข/ลบเงื่อนไข
- [ ] Checkbox "ส่ง LINE แจ้งเตือน"
- [ ] Validation:
  - [ ] ห้ามวันที่ซ้ำกัน
  - [ ] ต้องกรอกค่าคืนเงิน (ถ้าเลือกคืนเงิน)
- [ ] เพิ่ม CancellationPolicySettings ในหน้าสร้างกิจกรรม
- [ ] เพิ่ม CancellationPolicySettings ในหน้าแก้ไขกิจกรรม
- [ ] บันทึกลง Firestore

**ไฟล์ที่เกี่ยวข้อง:**
- `src/components/admin/CancellationPolicySettings.tsx` (new)
- `src/app/admin/events/create/page.tsx`
- `src/app/admin/events/[eventId]/edit/page.tsx`

**Acceptance Criteria:**
- ✅ สร้าง/แก้ไขเงื่อนไขได้ถูกต้อง
- ✅ Validation ทำงานถูกต้อง
- ✅ บันทึกลง Firestore สำเร็จ
- ✅ UI responsive และใช้งานง่าย

---

### Phase 3: Member Cancellation Flow ❌

**วัตถุประสงค์:** ให้สมาชิกสามารถยกเลิกการจองได้เอง

**งานที่ต้องทำ:**
- [ ] เพิ่มปุ่ม "ยกเลิกการจอง" ในหน้า My Registrations
- [ ] สร้าง `CancellationModal.tsx`
  - [ ] แสดงข้อมูลการจอง
  - [ ] เช็คยอดชำระ
  - [ ] คำนวณเงินคืน (ถ้ามี)
  - [ ] แสดงสรุป:
    - ยอดชำระ
    - เงื่อนไขที่ใช้
    - ยอดคืน
    - ยอดหัก
  - [ ] Input เหตุผลการยกเลิก (optional)
  - [ ] ปุ่มยืนยัน/ยกเลิก
- [ ] สร้าง API `/api/events/[eventId]/cancel-registration`
  - [ ] ตรวจสอบสิทธิ์
  - [ ] Validate registration status
  - [ ] คำนวณเงินคืน
  - [ ] บันทึกข้อมูล carpool/room เก่า
  - [ ] ปลด carpool อัตโนมัติ
  - [ ] ปลดห้องพักอัตโนมัติ
  - [ ] Update registration status
  - [ ] ส่ง LINE notification (ถ้า enabled)
- [ ] แสดงสถานะ cancelled ในหน้า My Registrations
  - [ ] Badge "ยกเลิกแล้ว"
  - [ ] แสดงยอดคืน
  - [ ] แสดงสถานะการคืนเงิน

**ไฟล์ที่เกี่ยวข้อง:**
- `src/app/my-registrations/page.tsx`
- `src/components/member/CancellationModal.tsx` (new)
- `src/app/api/events/[eventId]/cancel-registration/route.ts` (new)

**Acceptance Criteria:**
- ✅ สมาชิกยกเลิกได้สำเร็จ
- ✅ คำนวณเงินคืนถูกต้อง
- ✅ ปลด carpool/room อัตโนมัติ
- ✅ บันทึกประวัติถูกต้อง
- ✅ ส่ง LINE notification (ถ้า enabled)

---

### Phase 4: Admin Cancellation Flow ❌

**วัตถุประสงค์:** ให้ admin สามารถยกเลิกแทนสมาชิกได้

**งานที่ต้องทำ:**
- [ ] เพิ่มปุ่ม "ยกเลิกแทนสมาชิก" ในหน้า Admin Event Detail
- [ ] ใช้ `CancellationModal.tsx` เดิม (ปรับเพิ่ม admin mode)
  - [ ] เพิ่มช่อง admin notes
  - [ ] แสดงข้อมูลสมาชิก
- [ ] อัพเดท API `/api/events/[eventId]/cancel-registration`
  - [ ] รองรับ admin cancellation
  - [ ] บันทึก `cancelledBy` = admin email
  - [ ] บันทึก `cancellationMethod` = 'admin'
- [ ] แสดง Tab "รายการยกเลิก" ในหน้า Admin Event Detail
  - [ ] สรุปจำนวนการยกเลิก
  - [ ] ยอดเงินที่ต้องคืนรวม
  - [ ] Filter: pending refund / completed

**ไฟล์ที่เกี่ยวข้อง:**
- `src/app/admin/events/[eventId]/page.tsx`
- `src/components/admin/CancellationModal.tsx` (reuse)
- `src/app/api/events/[eventId]/cancel-registration/route.ts` (update)

**Acceptance Criteria:**
- ✅ Admin ยกเลิกแทนสมาชิกได้สำเร็จ
- ✅ แสดงรายการยกเลิกใน admin panel
- ✅ Filter/search ทำงานถูกต้อง

---

### Phase 5: Refund Management ❌

**วัตถุประสงค์:** Integration กับระบบ upload slip สำหรับคืนเงิน

**งานที่ต้องทำ:**
- [ ] แสดงรายการ pending refund ในหน้า Admin Event Detail
- [ ] ปุ่ม "อัพโหลดสลิปคืนเงิน" สำหรับแต่ละ registration
- [ ] เปิด PaymentDetailsModal (ระบบเดิม)
  - [ ] Pre-fill `paymentType = 'refund'`
  - [ ] Pre-fill `amount = refundAmount`
  - [ ] แสดง "ยอดแนะนำที่ต้องคืน"
- [ ] อัพเดทการอัพโหลดสลิปคืนเงิน
  - [ ] บันทึก Payment Slip ประเภท `refund`
  - [ ] Update `refundStatus = 'completed'`
  - [ ] เพิ่มใน `refundHistory`
  - [ ] อัพเดท `totalRefunded`
  - [ ] ส่ง LINE notification "คืนเงินสำเร็จ"
- [ ] แสดงประวัติ refund ในหน้า registration detail

**ไฟล์ที่เกี่ยวข้อง:**
- `src/app/admin/events/[eventId]/page.tsx`
- `src/components/admin/PaymentDetailsModal.tsx` (update)
- `src/app/api/payments/upload/route.ts` (update)

**Acceptance Criteria:**
- ✅ อัพโหลดสลิปคืนเงินได้สำเร็จ
- ✅ อัพเดทสถานะถูกต้อง
- ✅ ส่ง LINE notification
- ✅ แสดงประวัติครบถ้วน

---

### Phase 6: LINE Notifications ❌

**วัตถุประสงค์:** แจ้งเตือนผ่าน LINE เมื่อมีการยกเลิกและคืนเงิน

**งานที่ต้องทำ:**
- [ ] สร้าง LINE template: "แจ้งยกเลิกสำเร็จ"
  - [ ] แสดงชื่อกิจกรรม
  - [ ] รหัสลงทะเบียน
  - [ ] ยอดชำระ
  - [ ] ยอดคืน
  - [ ] เงื่อนไขที่ใช้
- [ ] สร้าง LINE template: "แจ้งคืนเงินสำเร็จ"
  - [ ] แสดงชื่อกิจกรรม
  - [ ] รหัสลงทะเบียน
  - [ ] จำนวนเงินที่คืน
- [ ] เพิ่ม function `sendCancellationNotification()`
- [ ] เพิ่ม function `sendRefundCompletedNotification()`
- [ ] Respect `event.cancellationPolicy.sendLineNotification`
- [ ] Testing ส่งข้อความจริง

**ไฟล์ที่เกี่ยวข้อง:**
- `src/lib/line-notifications.ts` (new/update)
- `src/app/api/events/[eventId]/cancel-registration/route.ts` (update)
- `src/app/api/payments/upload/route.ts` (update)

**Acceptance Criteria:**
- ✅ ส่งแจ้งเตือนยกเลิกได้สำเร็จ
- ✅ ส่งแจ้งเตือนคืนเงินได้สำเร็จ
- ✅ Respect checkbox setting
- ✅ ข้อความถูกต้องและครบถ้วน

---

## Progress Tracking

### Legend
- ✅ = เสร็จสมบูรณ์
- 🚧 = กำลังดำเนินการ
- ❌ = ยังไม่เริ่ม

### Overall Progress

| Phase | Status | Start Date | End Date | Notes |
|-------|--------|------------|----------|-------|
| Phase 1: Database Schema & Types | ✅ | 2026-08-09 | 2026-08-09 | Complete |
| Phase 2: Event Creation/Edit UI | ❌ | - | - | - |
| Phase 3: Member Cancellation Flow | ❌ | - | - | - |
| Phase 4: Admin Cancellation Flow | ❌ | - | - | - |
| Phase 5: Refund Management | ❌ | - | - | - |
| Phase 6: LINE Notifications | ❌ | - | - | - |

### Change Log

#### 2026-08-09 (Phase 1 Complete)
- 📝 สร้างเอกสารวางแผนเริ่มต้น
- 📋 กำหนด 6 phases พัฒนา
- 📐 ออกแบบ database schema
- 📝 เขียน requirements และ acceptance criteria
- ✅ **Phase 1 Complete:**
  - เพิ่ม 3 interfaces: `CancellationPolicy`, `DateBasedCancellationRule`, `RefundCalculationResult`
  - เพิ่ม 9 fields ใน `EventRegistration` สำหรับ cancellation tracking
  - เพิ่ม 2 helper functions: `validateCancellationPolicyDates()`, `calculateRefundAmount()`
  - อัพเดท column mappings ครบถ้วน
  - TypeScript compilation ผ่าน ✅

---

## Notes & Considerations

### Technical Decisions

1. **วันที่ห้ามซ้ำ:**
   - ใช้ validation ใน frontend และ backend
   - ไม่ให้สร้างเงื่อนไขที่วันที่ซ้ำกัน

2. **คำนวณเงินคืน:**
   - ทำ server-side เท่านั้น (ป้องกัน manipulation)
   - Cache result ใน registration document

3. **Carpool & Room:**
   - บันทึก JSON string ของข้อมูลเก่าก่อนปลด
   - ลบ reference อัตโนมัติ
   - อัพเดท carpool members count

4. **LINE Notification:**
   - ส่งเฉพาะเมื่อ checkbox checked
   - Handle error gracefully (ไม่ block transaction)

### Future Enhancements

- [ ] Export รายงาน cancelled registrations
- [ ] Analytics: cancellation rate, refund amount
- [ ] Bulk cancellation (admin)
- [ ] Auto-reminder ก่อนถึง cancellation deadline
- [ ] Partial refund (manual adjustment)

---

## Testing Checklist

### Unit Tests
- [ ] `validateCancellationPolicyDates()`
- [ ] `calculateRefundAmount()`
- [ ] Date validation logic

### Integration Tests
- [ ] API `/api/events/[eventId]/cancel-registration`
- [ ] Carpool member removal
- [ ] Room assignment removal
- [ ] Payment slip upload (refund)

### E2E Tests
- [ ] Member cancels registration (with refund)
- [ ] Member cancels registration (no refund)
- [ ] Admin cancels on behalf
- [ ] Admin uploads refund slip
- [ ] LINE notifications sent

---

## References

- [Payment System Documentation](./PAYMENT_SYSTEM.md)
- [Event Types](./src/types/event.ts)
- [Carpool Types](./src/types/carpool.ts)
