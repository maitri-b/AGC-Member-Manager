# Carpool Feature Implementation Plan

## Overview
ระบบจัดการ Carpool สำหรับกิจกรรมที่มีการเดินทางร่วมกัน ให้สมาชิกสามารถสร้างกลุ่มรถ ชวนเพื่อนจากรหัสลงทะเบียนอื่น และ Admin สามารถจัดเลขรถได้

## Database Structure

### Collection: `carpools`
```typescript
{
  carpoolId: string;           // Auto-generated unique ID
  eventId: string;             // Event ID
  ownerRegistrationId: string; // รหัสการจองของคนสร้าง Carpool
  licensePlate: string;        // เลขทะเบียนรถ (free text)
  members: Array<{
    registrationId: string;
    lineUserId: string;
    name: string;
    isOwner: boolean;
  }>;
  assignedCarNumber?: number;  // เลขรถที่ admin assign (ถ้ามี)
  createdAt: string;
  updatedAt: string;
}
```

### Collection: `events` (เพิ่ม fields)
```typescript
{
  // ... existing fields
  hasCarpoolFeature: boolean;
  carpoolSettings?: {
    totalCarNumbers: number;
    showCarNumbersToMembers: boolean;
    maxSeatsPerCar?: number;
  };
}
```

### Collection: `eventRegistrations` (เพิ่ม field)
```typescript
{
  // ... existing fields
  carpoolId?: string;  // ID ของ Carpool ที่สมาชิกอยู่
}
```

---

## Implementation Progress

### ✅ Phase 1: Backend & Types (COMPLETED - 2026-08-08)
- [x] สร้าง TypeScript interfaces (`src/types/carpool.ts`)
  - [x] `Carpool` interface
  - [x] `CarpoolMember` interface
  - [x] `CarpoolSettings` interface
  - [x] `CreateCarpoolData` interface
  - [x] `UpdateCarpoolData` interface

- [x] สร้าง lib functions (`src/lib/carpools.ts`)
  - [x] `createCarpool()` - สร้าง Carpool ใหม่
  - [x] `getCarpoolById()` - ดึงข้อมูล Carpool ตาม ID
  - [x] `getCarpoolsByEvent()` - ดึง Carpool ทั้งหมดของ event
  - [x] `getCarpoolsByOwner()` - ดึง Carpool ของเจ้าของ
  - [x] `updateCarpool()` - อัปเดต Carpool
  - [x] `addMembersToCarpool()` - เพิ่มสมาชิกเข้า Carpool
  - [x] `removeMembersFromCarpool()` - ลบสมาชิกออกจาก Carpool
  - [x] `deleteCarpool()` - ลบ Carpool
  - [x] `assignCarNumber()` - กำหนดเลขรถ
  - [x] `unassignCarNumber()` - ยกเลิกเลขรถ
  - [x] `getCarpoolByCarNumber()` - ดึง Carpool จากเลขรถ
  - [x] `getMemberCarpool()` - ดึง Carpool ของสมาชิก

### ✅ Phase 2: Event Settings (COMPLETED - 2026-08-08)
- [x] อัปเดต Event interface เพื่อรองรับ Carpool settings
  - File: `src/types/event.ts`
  - Added `hasCarpoolFeature?: boolean`
  - Added `carpoolSettings?: CarpoolSettings`
  - Added `carpoolId?: string` in EventRegistration
- [ ] เพิ่ม checkbox "มีการจัด Carpool" ในหน้าสร้าง/แก้ไขกิจกรรม
  - Location: `src/app/admin/events/page.tsx`
  - UI: Checkbox + Carpool settings section (conditional)
  - Status: PENDING (Next task)

### ⏳ Phase 3: Admin UI - Carpool Management (PENDING)
- [ ] สร้างแท็บ "จัดการ Carpool" ในหน้า admin event detail
  - Location: `src/app/admin/events/[eventId]/page.tsx`
  - Features:
    - [ ] แสดงรายการ Carpool ทั้งหมด (รหัสจอง, ชื่อบริษัท, ทะเบียนรถ)
    - [ ] สร้าง Carpool ใหม่
    - [ ] แก้ไข/ลบ Carpool
    - [ ] เพิ่ม/ลดสมาชิกจากรหัสจองเดียวกัน
    - [ ] เพิ่มสมาชิกจากรหัสจองอื่น

### ⏳ Phase 4: Admin UI - Car Number Assignment (PENDING)
- [ ] สร้างแท็บ "จัดเลขรถ" ในหน้า admin event detail
  - Location: `src/app/admin/events/[eventId]/page.tsx`
  - Features:
    - [ ] Input จำนวนรถทั้งหมด
    - [ ] สร้าง List Box รถ (เลข 1-N)
    - [ ] ปุ่ม "Assign Carpool" ในแต่ละ List Box
    - [ ] Modal เลือก Carpool จาก List
    - [ ] แสดงจำนวนที่นั่ง + validation เตือนเกิน
    - [ ] Validation: เลขรถไม่ซ้ำ, Carpool ไม่ซ้ำ
    - [ ] Toggle แสดงเลขรถให้ Member เห็น

### ⏳ Phase 5: Member UI - Carpool Section (PENDING)
- [ ] สร้าง Section Carpool ในหน้า member event detail
  - Location: `src/app/events/[eventId]/page.tsx`
  - Features:
    - [ ] แสดงรายการ Carpool ที่สร้าง
    - [ ] ปุ่ม "สร้าง Carpool"
    - [ ] Modal สร้าง Carpool:
      - [ ] Input เลขทะเบียนรถ
      - [ ] Checkbox เลือกสมาชิกจากรหัสจองเดียวกัน
      - [ ] ปุ่ม "เลือกทั้งหมด"
    - [ ] ปุ่ม "ชวนเพื่อนร่วม Carpool"
    - [ ] Modal ชวนเพื่อน:
      - [ ] Input รหัสการจอง
      - [ ] แสดงข้อมูลบริษัท, จำนวนสมาชิก
      - [ ] Checkbox เลือกสมาชิกที่จะชวน
      - [ ] Inactive checkbox สำหรับคนที่อยู่ Carpool แล้ว
    - [ ] แสดง Icon "Joined Carpool" ที่รายชื่อสมาชิก
    - [ ] Modal รายละเอียดรถที่ร่วม
    - [ ] ปุ่ม "ยกเลิกการ Join Carpool"
    - [ ] แสดงเลขรถ (ถ้า admin เปิด toggle)

### ⏳ Phase 6: API Routes (PENDING)
- [ ] `POST /api/carpools` - สร้าง Carpool
- [ ] `GET /api/carpools/[carpoolId]` - ดึงข้อมูล Carpool
- [ ] `PUT /api/carpools/[carpoolId]` - อัปเดต Carpool
- [ ] `DELETE /api/carpools/[carpoolId]` - ลบ Carpool
- [ ] `POST /api/carpools/[carpoolId]/add-members` - เพิ่มสมาชิก
- [ ] `POST /api/carpools/[carpoolId]/remove-members` - ลบสมาชิก
- [ ] `PUT /api/carpools/[carpoolId]/assign-car-number` - กำหนดเลขรถ
- [ ] `GET /api/events/[eventId]/carpools` - ดึง Carpool ทั้งหมดของ event

### ⏳ Phase 7: Testing & Documentation (PENDING)
- [ ] Test Carpool creation flow
- [ ] Test member invitation flow
- [ ] Test car number assignment flow
- [ ] Test validation rules
- [ ] Update user documentation

---

## Key Features & Business Rules

### Member Features
1. **สร้าง Carpool**
   - 1 รหัสลงทะเบียนสามารถสร้างได้หลายคัน
   - กำหนดเลขทะเบียนรถ (free text)
   - เลือกสมาชิกจากรหัสจองเดียวกัน

2. **ชวนเพื่อนจากรหัสอื่น**
   - ใส่รหัสการจอง → แสดงรายชื่อ
   - เลือกคนที่จะชวน (checkbox)
   - สมาชิกที่อยู่ Carpool แล้ว → checkbox inactive

3. **Join/Leave Carpool**
   - Icon "Joined Carpool" ที่รายชื่อ
   - กดดูรายละเอียดรถ
   - ยกเลิกการ Join ได้

### Admin Features
1. **จัดการ Carpool**
   - เห็นสรุป Carpool ทั้งหมด
   - สร้าง/แก้ไข/ลบ Carpool
   - เพิ่มสมาชิกจากรหัสเดียวกัน หรือรหัสอื่น

2. **จัดเลขรถ**
   - กำหนดจำนวนรถ
   - Assign Carpool ให้แต่ละเลขรถ
   - Validation: เลขรถไม่ซ้ำ, Carpool ไม่ซ้ำ
   - แสดง warning ถ้าเกินที่นั่ง

3. **Toggle แสดงเลขรถ**
   - เปิด/ปิด การแสดงเลขรถให้ Member เห็น

### Validation Rules
- ✅ สมาชิก 1 คนอยู่ได้แค่ 1 Carpool
- ✅ Carpool 1 คันถูก assign ได้แค่ 1 เลขรถ
- ✅ เลขรถไม่ซ้ำกัน
- ⚠️ เตือนถ้าจำนวนสมาชิกเกินที่นั่ง (แต่ไม่บล็อก)

---

## Current Status
**Last Updated:** 2026-08-08 14:30
**Current Phase:** Phase 2 - Event Settings (Completing UI)
**Completed:** Backend types, lib functions, Event interface updates
**Next Task:** เพิ่ม Carpool checkbox และ settings UI ในหน้าสร้าง/แก้ไขกิจกรรม (Admin)
