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

### ✅ Phase 2: Event Settings - Types & Database (COMPLETED - 2026-08-08)
- [x] อัปเดต Event interface เพื่อรองรับ Carpool settings
  - File: `src/types/event.ts`
  - Added `hasCarpoolFeature?: boolean`
  - Added `carpoolSettings?: CarpoolSettings`
  - Added `carpoolId?: string` in EventRegistration

### ✅ Phase 3: Event Settings - Admin UI (COMPLETED - 2026-08-08)
- [x] เพิ่ม checkbox "มีการจัด Carpool" ในหน้าสร้าง/แก้ไขกิจกรรม
  - Location: `src/app/admin/events/page.tsx`
  - UI: Checkbox + Carpool settings section (conditional)
  - Form state: Updated EventFormData interface
  - Event loading: Added Carpool fields to form initialization
- [x] อัปเดต Event API เพื่อรองรับ Carpool fields
  - File: `src/app/api/admin/events/route.ts`
  - GET: Added `hasCarpoolFeature` and `carpoolSettings` to response mapping
  - POST: Added Carpool fields to event creation
  - PUT: Carpool fields already supported via spread operator

### ✅ Phase 4A: API Routes - Carpool CRUD (COMPLETED - 2026-08-08)
- [x] สร้าง API endpoints สำหรับ Carpool Management
  - [x] `POST /api/carpools` - สร้าง Carpool ใหม่
  - [x] `GET /api/carpools/[carpoolId]` - ดึงข้อมูล Carpool ตาม ID
  - [x] `PUT /api/carpools/[carpoolId]` - อัปเดตข้อมูล Carpool
  - [x] `DELETE /api/carpools/[carpoolId]` - ลบ Carpool
  - [x] `POST /api/carpools/[carpoolId]/add-members` - เพิ่มสมาชิกเข้า Carpool
  - [x] `POST /api/carpools/[carpoolId]/remove-members` - ลบสมาชิกออกจาก Carpool
  - [x] `GET /api/events/[eventId]/carpools` - ดึง Carpool ทั้งหมดของ event (พร้อม enrich ข้อมูลบริษัท)

### ✅ Phase 4B: Admin UI - Carpool List & Basic Management (COMPLETED - 2026-08-08)
- [x] สร้าง CarpoolManagementModal component
  - Location: `src/components/admin/CarpoolManagementModal.tsx`
  - Features:
    - [x] แสดงรายการ Carpool ทั้งหมด (รหัสจอง, ชื่อบริษัท, ทะเบียนรถ, จำนวนสมาชิก)
    - [x] สร้าง Carpool ใหม่ (form modal)
    - [x] แก้ไขข้อมูล Carpool (ทะเบียนรถ)
    - [x] ลบ Carpool (พร้อม confirmation modal)
- [x] เพิ่มปุ่มเปิด Modal ในหน้า admin event detail
  - Location: `src/app/admin/events/[eventId]/page.tsx`
  - แสดงเฉพาะเมื่อ `hasCarpoolFeature = true`

### ✅ Phase 4C: Admin UI - Member Management (COMPLETED - 2026-08-08)
- [x] เพิ่มฟีเจอร์จัดการสมาชิกใน CarpoolManagementModal
  - [x] แสดงรายการสมาชิกใน Carpool (expand/collapse)
  - [x] ลบสมาชิกออกจาก Carpool (ป้องกันไม่ให้ลบเจ้าของ)
  - [x] เพิ่มสมาชิกจากรหัสจองอื่น (search by registrationId)
  - [x] แสดงสถานะสมาชิกที่อยู่ Carpool แล้ว (disabled checkbox)
  - [x] สร้าง API endpoint `/api/registrations/[registrationId]` สำหรับค้นหาการจอง

### ✅ Phase 5: Admin UI - Car Number Assignment (COMPLETED - 2026-08-08)
- [x] สร้าง API endpoints สำหรับการจัดเลขรถ
  - [x] `PUT /api/carpools/[carpoolId]/assign-car-number` - กำหนดเลขรถให้ Carpool
  - [x] `PUT /api/carpools/[carpoolId]/unassign-car-number` - ยกเลิกเลขรถ
  - [x] `GET /api/events/[eventId]/car-assignments` - ดึงข้อมูลการ assign ทั้งหมด
- [x] สร้าง CarNumberAssignmentModal component
  - Location: `src/components/admin/CarNumberAssignmentModal.tsx`
  - Features:
    - [x] Input จำนวนรถทั้งหมด (1-100 คัน)
    - [x] Grid แสดง Car Slots ทั้งหมด (เลข 1-N)
    - [x] แต่ละ slot แสดง: เลขรถ, Carpool ที่กำหนด (ถ้ามี), จำนวนสมาชิก
    - [x] ปุ่ม "กำหนด Carpool" สำหรับ slot ว่าง
    - [x] ปุ่ม "ยกเลิกเลขรถ" สำหรับ slot ที่มี Carpool แล้ว
    - [x] Modal เลือก Carpool จาก List (แสดงเฉพาะ Carpool ที่ยังไม่มีเลข)
    - [x] Validation: เลขรถไม่ซ้ำ (API level), Carpool assign ได้ครั้งละ 1 เลข
- [x] เพิ่มปุ่มเปิด Modal ในหน้า admin event detail
  - Location: `src/app/admin/events/[eventId]/page.tsx`
  - ปุ่ม "จัดเลขรถ" (สีม่วง) ถัดจากปุ่ม "จัดการ Carpool"
  - แสดงเฉพาะเมื่อ `hasCarpoolFeature = true`

### ⏳ Phase 6: Member UI - Carpool Section (PENDING)
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

### ✅ Phase 7: API Routes - Car Number Assignment (COMPLETED - Merged into Phase 5)
- [x] `PUT /api/carpools/[carpoolId]/assign-car-number` - กำหนดเลขรถ
- [x] `PUT /api/carpools/[carpoolId]/unassign-car-number` - ยกเลิกเลขรถ
- [x] `GET /api/events/[eventId]/car-assignments` - ดึงข้อมูลการ assign เลขรถทั้งหมด

**Note**: Phase 7 ถูก merge เข้า Phase 5 แล้วเนื่องจากทำพร้อมกันกับ UI

### ⏳ Phase 8: Testing & Documentation (PENDING)
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
**Last Updated:** 2026-08-08 19:00
**Current Phase:** Phase 5 - Admin UI: Car Number Assignment ✅ COMPLETED
**Completed:**
- Phase 1: Backend types & lib functions
- Phase 2: Event interface updates
- Phase 3: Event settings UI & API integration
- Phase 4A: API Routes - Carpool CRUD (7 endpoints)
- Phase 4B: Admin UI - Carpool List & Basic Management
- Phase 4C: Admin UI - Member Management (expand/collapse, add/remove members)
- Phase 5: Admin UI - Car Number Assignment (APIs + UI)
- Phase 7: API Routes - Car Number Assignment (merged into Phase 5)
**Next Task:** Phase 6 - Member UI: Carpool Section
