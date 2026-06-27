# บันทึกการพัฒนา: Event-Staff และ Event-Co Roles

**วันที่เริ่มต้น:** 2026-06-28
**สถานะ:** 🟡 กำลังดำเนินการ

---

## สรุปความต้องการ

### 1. การจำกัดสิทธิ์สมาชิกที่ไม่ครบเกณฑ์
สมาชิกที่มี LINE_UserID แต่ไม่ผ่านเกณฑ์ทั้ง 3 ข้อนี้ จะถูกจำกัดสิทธิ์เหมือน Guest:
- ✅ `memberInfo.status !== 'ปกติ'` (จาก Google Sheets)
- ✅ `memberInfo.lineGroupStatus !== 'ปกติ'` (จาก Google Sheets)
- ✅ `user.isActive !== true` (จาก Firestore)

### 2. User Type ใหม่: Event-Staff (role level 2.5)
- จัดการข้อมูลผู้ลงทะเบียนได้เฉพาะกิจกรรมที่ได้รับมอบหมาย
- ไม่สามารถเข้าถึงฟีเจอร์ admin อื่นๆ
- มี quick menu เข้าหน้ากิจกรรมที่ดูแล
- เลือกกิจกรรมผ่าน checkbox (เฉพาะ active & published)

**สิทธิ์:**
- ✅ ดูรายชื่อผู้ลงทะเบียน
- ✅ แก้ไขข้อมูล (ชื่อ, จำนวน, สถานะ)
- ✅ บันทึกการชำระเงิน
- ✅ เพิ่ม/ลบค่าใช้จ่ายพิเศษ

### 3. User Type ใหม่: Event-Co (role level 2.7)
- มีสิทธิ์เหมือนสมาชิก (ลงทะเบียน, ดูรายละเอียด, เมนูต่างๆ)
- **บวก** การจัดการกิจกรรมที่ได้รับมอบหมาย (เหมือน Event-Staff)
- สามารถลงทะเบียนได้ทุกกิจกรรม (รวมที่ตัวเองดูแล)

---

## ความคืบหน้า

### ✅ PHASE 1.1: อัพเดท Type Definitions (next-auth.d.ts)
**สถานะ:** เสร็จสมบูรณ์
**วันที่:** 2026-06-28

**การเปลี่ยนแปลง:**
- ✅ เพิ่ม `'event-co'` และ `'event-staff'` ใน `UserRole` type
- ✅ เพิ่ม `assignedEventIds?: string[]` ใน Session.user interface
- ✅ เพิ่ม `assignedEventIds?: string[]` ใน User interface
- ✅ เพิ่ม `assignedEventIds?: string[]` ใน JWT interface
- ✅ เพิ่ม permission `'events:manage-assigned': 'Manage assigned events'`
- ✅ เพิ่ม `event-co` และ `event-staff` ใน ROLE_PERMISSIONS

**ไฟล์ที่แก้ไข:**
- `src/types/next-auth.d.ts`

---

### 🟡 PHASE 1.2: อัพเดท Permission System (permissions.ts)
**สถานะ:** กำลังดำเนินการ
**วันที่:** 2026-06-28

**การเปลี่ยนแปลง:**
- ✅ อัพเดท `hasMinimumRole()` ให้รองรับ role ใหม่
  - admin: 4
  - committee: 3
  - event-co: 2.7
  - event-staff: 2.5
  - member: 2
  - guest: 1
- ✅ เพิ่มฟังก์ชัน `canManageEvent()` - เช็คว่า user สามารถจัดการ event ได้หรือไม่
- ✅ เพิ่มฟังก์ชัน `isFullMember()` - เช็คสถานะสมาชิกครบ 3 เกณฑ์
- ✅ เพิ่มฟังก์ชัน `getEffectivePermissions()` - คืนสิทธิ์จริงตามสถานะ

**ไฟล์ที่แก้ไข:**
- `src/lib/permissions.ts`

---

### ⏳ PHASE 2: อัพเดท Authentication Flow (auth-options.ts)
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] อัพเดท JWT callback:
  - ดึง `assignedEventIds` จาก Firestore
  - ถ้ามี memberId → ดึง status และ lineGroupStatus จาก Google Sheets
  - ใช้ `getEffectivePermissions()` คำนวณสิทธิ์จริง
  - เพิ่ม assignedEventIds ลงใน token
- [ ] อัพเดท Session callback:
  - เพิ่ม assignedEventIds ลงใน session.user
- [ ] อัพเดท SignIn callback:
  - เพิ่ม `assignedEventIds: []` ตอนสร้าง user ใหม่

**ไฟล์ที่ต้องแก้:**
- `src/lib/auth-options.ts`

---

### ⏳ PHASE 3: Database Schema
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] สร้าง migration script เพิ่ม `assignedEventIds: []` ให้ users ที่มีอยู่แล้ว

---

### ⏳ PHASE 4.1: อัพเดท Admin User Management UI
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] เพิ่ม role options: `event-staff`, `event-co`
- [ ] เพิ่ม role colors และ display names
- [ ] เพิ่ม state สำหรับ `activePublishedEvents` และ `editForm.assignedEventIds`
- [ ] เพิ่ม UI section "มอบหมายกิจกรรม" (แสดงเฉพาะ event-staff/event-co)
- [ ] Fetch events ตอนเปิด modal
- [ ] บันทึก assignedEventIds เมื่อ save

**ไฟล์ที่ต้องแก้:**
- `src/app/admin/page.tsx`

---

### ⏳ PHASE 4.2: อัพเดท Admin Users API
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] GET: รวม `assignedEventIds` ใน response
- [ ] PUT: รับและบันทึก `assignedEventIds`

**ไฟล์ที่ต้องแก้:**
- `src/app/api/admin/users/route.ts`

---

### ⏳ PHASE 5.1: อัพเดท Middleware
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] อนุญาตให้ event-staff และ event-co เข้า `/admin/events/*`
- [ ] ห้ามเข้า `/admin` routes อื่นๆ (เฉพาะ event-staff)

**ไฟล์ที่ต้องแก้:**
- `src/middleware.ts`

---

### ⏳ PHASE 5.2: อัพเดท Event APIs
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] เพิ่มการเช็ค `canManageEvent()` ใน 4 APIs:
  - `src/app/api/events/[eventId]/route.ts`
  - `src/app/api/events/[eventId]/admin-update-registration/route.ts`
  - `src/app/api/events/[eventId]/update-payment/route.ts`
  - `src/app/api/events/[eventId]/special-charges/route.ts`

---

### ⏳ PHASE 5.3-5.4: อัพเดท Admin Event Pages
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] Event List Page:
  - Filter events สำหรับ event-staff (แสดงเฉพาะ assigned)
  - ซ่อนปุ่ม "สร้างกิจกรรม" สำหรับ event-staff
- [ ] Event Detail Page:
  - เช็ค permission และ assigned events ตอน load

**ไฟล์ที่ต้องแก้:**
- `src/app/admin/events/page.tsx`
- `src/app/admin/events/[eventId]/page.tsx`

---

### ⏳ PHASE 6.1: อัพเดท Member Dashboard
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] เพิ่ม quick menu card "กิจกรรมที่ดูแล" สำหรับ event-staff
- [ ] เพิ่ม quick menu card "จัดการกิจกรรม" สำหรับ event-co
- [ ] เพิ่ม `MemberStatusWarning` component

**ไฟล์ที่ต้องแก้:**
- `src/app/dashboard/page.tsx`

---

### ⏳ PHASE 6.2: สร้าง Member Status Check API
**สถานะ:** รอดำเนินการ

**สิ่งที่ต้องทำ:**
- [ ] สร้าง API endpoint ใหม่
- [ ] ดึง isActive จาก Firestore
- [ ] ดึง status และ lineGroupStatus จาก Google Sheets
- [ ] คืน `isRestricted: boolean` และรายละเอียด

**ไฟล์ใหม่:**
- `src/app/api/member/status-check/route.ts`

---

### ⏳ PHASE 7: Build และทดสอบระบบ
**สถานะ:** รอดำเนินการ

---

## Test Cases ที่ต้องทดสอบ

### Test Case 1: Event-Staff Creation & Assignment
**สถานะ:** ⏳ รอดำเนินการ

**ขั้นตอน:**
1. [ ] สร้าง user role = event-staff
2. [ ] assign 2 events
3. [ ] ตรวจสอบ assignedEventIds บันทึกใน Firestore
4. [ ] ตรวจสอบ JWT และ session มี assignedEventIds

**ผลที่คาดหวัง:**
- assignedEventIds ถูกบันทึกใน Firestore
- JWT token มี assignedEventIds
- Session มี assignedEventIds

---

### Test Case 2: Event-Staff Access Control
**สถานะ:** ⏳ รอดำเนินการ

**ขั้นตอน:**
1. [ ] Login เป็น event-staff
2. [ ] เข้า /admin → ควร redirect ไป unauthorized
3. [ ] เข้า /admin/events → เห็นเฉพาะ assigned events
4. [ ] เข้า event detail ที่ assigned → ใช้งานได้
5. [ ] เข้า event detail ที่ไม่ได้ assign → error
6. [ ] แก้ไข registration → สำเร็จ
7. [ ] บันทึกชำระเงิน → สำเร็จ
8. [ ] เพิ่มค่าใช้จ่าย → สำเร็จ

**ผลที่คาดหวัง:**
- Event-staff เข้า /admin ไม่ได้
- Event-staff เห็นเฉพาะ assigned events
- Event-staff จัดการ assigned events ได้ทุกฟีเจอร์
- Event-staff จัดการ non-assigned events ไม่ได้

---

### Test Case 3: Event-Co Full Access
**สถานะ:** ⏳ รอดำเนินการ

**ขั้นตอน:**
1. [ ] สร้าง user role = event-co พร้อม memberId
2. [ ] assign 1 event
3. [ ] ตรวจสอบเข้า dashboard ได้
4. [ ] ตรวจสอบดูรายชื่อสมาชิกได้
5. [ ] ลงทะเบียนเข้าร่วมทุกกิจกรรม (รวมที่ตัวเองดูแล)
6. [ ] จัดการ assigned event ได้

**ผลที่คาดหวัง:**
- Event-co มีสิทธิ์ member ทั้งหมด
- Event-co จัดการ assigned events ได้
- Event-co ลงทะเบียนได้ทุกกิจกรรม

---

### Test Case 4: Member Status Restriction
**สถานะ:** ⏳ รอดำเนินการ

**ขั้นตอน:**
1. [ ] ตั้ง member status ≠ 'ปกติ' → permissions ลดเป็น guest
2. [ ] ตั้ง lineGroupStatus ≠ 'ปกติ' → permissions ลดเป็น guest
3. [ ] ตั้ง isActive = false → permissions ลดเป็น guest
4. [ ] ตรวจสอบ warning แสดงใน dashboard

**ผลที่คาดหวัง:**
- สถานะไม่ครบถ้วน → downgrade เป็น guest
- แสดง warning ใน dashboard
- ระบุสาเหตุที่ชัดเจน

---

### Test Case 5: Role Hierarchy
**สถานะ:** ⏳ รอดำเนินการ

**ขั้นตอน:**
1. [ ] ทดสอบ hasMinimumRole(event-co, event-staff) → true
2. [ ] ทดสอบ hasMinimumRole(event-staff, member) → true
3. [ ] ทดสอบ hasMinimumRole(member, event-staff) → false

**ผลที่คาดหวัง:**
- Role hierarchy ทำงานถูกต้องตามค่า numeric

---

## บันทึกปัญหาและการแก้ไข

### ปัญหา 1: (ยังไม่มี)
**วันที่:**
**คำอธิบาย:**
**วิธีแก้:**
**สถานะ:**

---

## หมายเหตุสำคัญ

- Event-Co สามารถลงทะเบียนเข้าร่วมกิจกรรมที่ตัวเองดูแลได้ (ไม่มี conflict of interest)
- เฉพาะกิจกรรม active และ published เท่านั้นที่จะแสดงใน assignment UI
- Member ที่ไม่ผ่านเกณฑ์สถานะจะถูกจำกัดสิทธิ์ realtime (ผ่าน JWT refresh)
- Event-Staff ไม่มีสิทธิ์อะไรนอกจากจัดการ assigned events
- Event-Co = Member + Event Management (assigned events)

---

## ขั้นตอนการ Deploy

- [ ] รัน migration script เพิ่ม assignedEventIds ให้ users เดิม
- [ ] Deploy code ทั้งหมดพร้อมกัน
- [ ] ทดสอบสร้าง event-staff user คนแรก
- [ ] ทดสอบ assign events
- [ ] ทดสอบ access control
- [ ] Monitor logs สำหรับ permission errors

---

**อัพเดทล่าสุด:** 2026-06-28
**ผู้รับผิดชอบ:** Claude Sonnet 4.5
