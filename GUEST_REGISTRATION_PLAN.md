# Guest Registration System - Implementation Plan

## Overview
ระบบสำหรับให้บุคคลภายนอก (Guest) สามารถลงทะเบียนเข้าร่วมกิจกรรมของชมรมได้

## 1. Data Structure

### Google Sheets (Event Registration)
เพิ่มคอลัมน์ใหม่ในตาราง Event Registration:

```
| Column Name           | Description                          | For Member | For Guest |
|-----------------------|--------------------------------------|------------|-----------|
| user_type             | ประเภทผู้ใช้ (member/guest)           | ✓          | ✓         |
| member_id             | รหัสสมาชิก                           | ✓          | -         |
| license_number        | เลขใบอนุญาต (สมาชิก)                 | ✓          | -         |
| company_name          | ชื่อบริษัท (สมาชิก)                  | ✓          | -         |
| guest_company_name    | ชื่อบริษัท (บุคคลภายนอก)             | -          | ✓         |
| guest_license_number  | เลขใบอนุญาต (บุคคลภายนอก - optional) | -          | ✓         |
| guest_contact_name    | ชื่อผู้ติดต่อ                        | -          | ✓         |
| guest_position        | ตำแหน่ง                              | -          | ✓         |
| guest_contact_phone   | เบอร์โทรติดต่อ                       | -          | ✓         |
| guest_email           | อีเมล                                | -          | ✓         |
```

### Firestore - Guest Profiles Collection

```typescript
guestProfiles (collection)
  └── {lineUserId} (document)
      ├── lineUserId: string           // LINE User ID
      ├── displayName: string          // LINE Display Name
      ├── pictureUrl: string           // LINE Profile Picture
      ├── companyName: string          // ชื่อบริษัท
      ├── licenseNumber: string        // เลขใบอนุญาต (optional)
      ├── contactName: string          // ชื่อผู้ติดต่อ
      ├── position: string             // ตำแหน่ง
      ├── contactPhone: string         // เบอร์โทรติดต่อ
      ├── email: string                // อีเมล
      ├── createdAt: timestamp         // วันที่สร้างข้อมูล
      ├── lastUpdatedAt: timestamp     // วันที่อัปเดตล่าสุด
```

## 2. User Flow

### Guest Registration Flow

```
1. Guest เข้าหน้ารายการกิจกรรม
   ↓
2. เห็นเฉพาะกิจกรรมที่ allowGuestRegistration = true และ isPublished = true
   ↓
3. คลิก "ดูรายละเอียดกิจกรรม"
   ↓
4. คลิกปุ่ม "ลงทะเบียน"
   ↓
5. ระบบตรวจสอบ Guest Profile

   [กรณีที่ 1: มี Guest Profile แล้ว]
   → Pre-fill ข้อมูลธุรกิจจาก Profile
   → แสดงฟอร์มลงทะเบียนพร้อมข้อมูล
   → Guest สามารถแก้ไขข้อมูลได้
   → กรอกข้อมูลการลงทะเบียน (จำนวนคน, รายชื่อ, etc.)
   → ยืนยันและส่ง
   → บันทึกลง Google Sheet พร้อม user_type = "guest"

   [กรณีที่ 2: ยังไม่มี Guest Profile]
   → แสดงฟอร์ม 2 ส่วน:
      1. ข้อมูลธุรกิจ (จะบันทึกเป็น Guest Profile)
      2. ข้อมูลการลงทะเบียนกิจกรรม
   → ☑ Checkbox: "บันทึกข้อมูลนี้สำหรับครั้งถัดไป"
   → ยืนยันและส่ง
   → บันทึก Guest Profile ไป Firestore (ถ้าเลือก checkbox)
   → บันทึกการลงทะเบียนลง Google Sheet พร้อม user_type = "guest"
```

## 3. UI/UX Design

### Guest Registration Form

```
┌──────────────────────────────────────────┐
│  ลงทะเบียนเข้าร่วมกิจกรรม                 │
│  กิจกรรม: [ชื่อกิจกรรม]                   │
├──────────────────────────────────────────┤
│                                           │
│  📋 ข้อมูลธุรกิจ                          │
│  ┌─────────────────────────────────────┐ │
│  │ ชื่อบริษัท *                        │ │
│  │ [___________________________]       │ │
│  │                                     │ │
│  │ เลขที่ใบอนุญาต (ถ้ามี)              │ │
│  │ [___________________________]       │ │
│  │                                     │ │
│  │ ชื่อผู้ติดต่อ *                      │ │
│  │ [___________________________]       │ │
│  │                                     │ │
│  │ ตำแหน่ง *                           │ │
│  │ [___________________________]       │ │
│  │                                     │ │
│  │ เบอร์โทรติดต่อ *                    │ │
│  │ [___________________________]       │ │
│  │                                     │ │
│  │ อีเมล *                             │ │
│  │ [___________________________]       │ │
│  │                                     │ │
│  │ ☑ บันทึกข้อมูลนี้สำหรับครั้งถัดไป    │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  👥 ข้อมูลการลงทะเบียน                    │
│  ┌─────────────────────────────────────┐ │
│  │ จำนวนผู้เข้าร่วม: [2] คน           │ │
│  │                                     │ │
│  │ รายชื่อผู้เข้าร่วม:                 │ │
│  │ 1. [_________________________]      │ │
│  │ 2. [_________________________]      │ │
│  │                                     │ │
│  │ [ข้อมูลอื่นๆ เช่น ห้องพัก ฯลฯ]     │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  💳 ข้อมูลการชำระเงิน                     │
│  ┌─────────────────────────────────────┐ │
│  │ ค่าลงทะเบียน: 5,000 บาท            │ │
│  │ [แสดงรายละเอียดการชำระเงิน]        │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  [ ยกเลิก ]  [ ยืนยันลงทะเบียน ]         │
└──────────────────────────────────────────┘
```

## 4. Benefits

### สำหรับ Guest
✅ กรอกข้อมูลครั้งเดียว ครั้งต่อไปไม่ต้องกรอกใหม่
✅ Process ไม่ซับซ้อน ง่ายต่อการใช้งาน
✅ สามารถแก้ไขข้อมูลได้ทุกครั้งก่อนลงทะเบียน

### สำหรับ Admin
✅ จัดการข้อมูลง่าย - เห็นทั้ง member และ guest ในที่เดียว
✅ แยกประเภทผู้ใช้ชัดเจนด้วย user_type column
✅ สามารถ filter/export ข้อมูลตาม user_type ได้
✅ Track ได้ว่า guest คนไหนเข้าร่วมบ่อย (อาจเชิญเป็น member)

### สำหรับระบบ
✅ ไม่ซับซ้อน - ใช้ structure เดิม เพิ่มเฉพาะ columns ใหม่
✅ Scalable - รองรับ guest ได้ไม่จำกัด
✅ Maintainable - Admin ไม่ต้องจัดการหลาย sheets
✅ Flexible - สามารถเปิด/ปิด guest registration ต่อกิจกรรมได้

## 5. Implementation Steps

### Phase 1: Event Settings (Admin)
- [ ] เพิ่ม checkbox "เปิดให้บุคคลภายนอกเข้าร่วม" ในฟอร์มสร้าง/แก้ไขกิจกรรม
- [ ] เพิ่มฟิลด์ `allowGuestRegistration` ใน Event interface
- [ ] อัปเดต API `/api/admin/events` เพื่อรองรับฟิลด์ใหม่
- [ ] บันทึกค่า `allowGuestRegistration` ลง Firestore

### Phase 2: Event List Visibility
- [ ] ปรับ `/api/events` ให้ filter กิจกรรมตาม user type:
  - Member: เห็นกิจกรรมที่ published
  - Guest: เห็นเฉพาะกิจกรรมที่ published + allowGuestRegistration
- [ ] เปลี่ยน header หน้า Events เป็น "กิจกรรมชมรม"
- [ ] แบ่ง section: "กิจกรรมที่เปิดรับสมัคร" และ "กิจกรรมที่สิ้นสุดแล้ว"

### Phase 3: Guest Profile System
- [ ] สร้าง Firestore collection `guestProfiles`
- [ ] สร้าง API endpoints:
  - `GET /api/guest/profile` - ดึง Guest Profile
  - `POST /api/guest/profile` - บันทึก/อัปเดต Guest Profile
- [ ] เพิ่ม TypeScript interfaces สำหรับ Guest Profile

### Phase 4: Guest Registration Form
- [ ] ปรับฟอร์มลงทะเบียนให้รองรับทั้ง member และ guest
- [ ] เพิ่มส่วนกรอกข้อมูลธุรกิจสำหรับ guest
- [ ] Pre-fill ข้อมูลจาก Guest Profile (ถ้ามี)
- [ ] เพิ่ม checkbox "บันทึกข้อมูลนี้สำหรับครั้งถัดไป"

### Phase 5: Registration API Update
- [ ] อัปเดต API `/api/events/[eventId]/register`:
  - รับข้อมูล guest ที่เพิ่มเข้ามา
  - ตรวจสอบ user_type
  - บันทึก guest data ใน columns ที่เหมาะสม
- [ ] อัปเดต `ensureSheetHeaders()` เพื่อเพิ่ม guest columns

### Phase 6: Admin Dashboard Update
- [ ] แสดงสถิติแยก: "สมาชิก: X คน | บุคคลภายนอก: Y คน"
- [ ] เพิ่ม filter ตาม user_type
- [ ] อัปเดต Export Excel ให้แสดงข้อมูล guest columns

### Phase 7: Testing
- [ ] ทดสอบ guest registration flow ทั้งหมด
- [ ] ทดสอบ guest profile save/load
- [ ] ทดสอบ admin dashboard statistics
- [ ] ทดสอบ export Excel

## 6. Database Schema Changes

### Firestore - Events Collection
```typescript
events/{eventId}
  allowGuestRegistration: boolean  // NEW: เปิดให้บุคคลภายนอกลงทะเบียน
```

### Google Sheets - Required New Columns
```
user_type
guest_company_name
guest_license_number
guest_contact_name
guest_position
guest_contact_phone
guest_email
```

## 7. Admin Features

### Event Management
- Toggle "เปิดให้บุคคลภายนอกเข้าร่วม" per event
- View statistics split by user_type
- Filter attendees by user_type
- Export with guest data columns

### Guest Management (Future Enhancement)
- View all guest profiles
- See guest participation history
- Invite frequent guests to become members
- Bulk email/LINE notifications to guests

## 8. Security & Permissions

### Guest Permissions
- ❌ Cannot access admin pages
- ❌ Cannot access member-only pages
- ✅ Can view events with allowGuestRegistration = true
- ✅ Can register for allowed events
- ✅ Can view/edit their own registrations
- ✅ Can update their guest profile

### Data Privacy
- Guest profile data stored separately from member data
- Guest can update their own profile only
- Admin can view all guest profiles and registrations
- Guest data exported with proper data privacy handling

## 9. Future Enhancements

1. **Guest Dashboard**: แสดงประวัติการเข้าร่วมกิจกรรมของ guest
2. **Invitation System**: เชิญ guest ที่เข้าร่วมบ่อยให้สมัครเป็น member
3. **Guest Analytics**: วิเคราะห์พฤติกรรมการเข้าร่วมกิจกรรมของ guest
4. **Auto-fill from LINE Profile**: ดึงข้อมูลบางส่วนจาก LINE profile (name, phone ถ้ามี)
5. **Guest Feedback**: รับ feedback จาก guest หลังเข้าร่วมกิจกรรม

## 10. Notes

- Guest registration ไม่จำเป็นต้องมี member_id หรือ license_number
- Guest อาจมีหรือไม่มี license_number ก็ได้ (optional)
- ระบบจะใช้ LINE User ID เป็น unique identifier สำหรับ guest
- Guest profile จะถูกบันทึกใน Firestore เพื่อ reuse ในครั้งถัดไป
- Google Sheets จะเป็น source of truth สำหรับ registration data ทั้ง member และ guest

---

**Status**: Pending Implementation
**Last Updated**: 2026-06-29
**Author**: Claude Sonnet 4.5
