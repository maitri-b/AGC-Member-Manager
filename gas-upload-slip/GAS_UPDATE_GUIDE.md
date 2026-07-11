# GAS Update Guide - Fix Full Payment Slip Display
## วันที่อัปเดต: 2026-07-12

---

## 📋 สรุปการเปลี่ยนแปลง

### ปัญหาที่แก้ไข:
1. **Full Payment Mode ไม่บันทึก slip URL** - GAS ใช้ `slip_url` (legacy column) แทนที่จะใช้ `remaining_slip_url`
2. **ไม่บันทึกวันที่อัปโหลดสลิป** - Full Payment Mode ไม่บันทึก `remaining_paid_date`
3. **รูปสลิปแสดงเป็นไอคอนสีดำ** - Google Drive URL ไม่ใช่ direct image URL

### การแก้ไข:

#### 1. เปลี่ยน URL format เป็น thumbnail URL (บรรทัด 204-220)
```javascript
// เดิม (ไม่แสดงเป็นรูป):
const fileUrl = file.getUrl();

// ใหม่ (แสดงเป็นรูป):
file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
const fileId = file.getId();
const fileUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';
```

#### 2. แก้ Full Payment Mode ให้ใช้ `remaining_slip_url` (บรรทัด 333-350)
```javascript
// เดิม:
} else {
  slipUrlCol = normalizedHeaders.indexOf('slip_url');  // ❌ legacy
  paidDateCol = -1;  // ❌ ไม่บันทึกวันที่
  newStatus = 'รอตรวจสอบ';
}

// ใหม่:
} else {
  // Full payment mode - use remaining_slip_url and remaining_paid_date
  slipUrlCol = normalizedHeaders.indexOf('remaining_slip_url');  // ✅
  paidDateCol = normalizedHeaders.indexOf('remaining_paid_date');  // ✅
  newStatus = 'รอตรวจสอบ';
}
```

---

## 🚀 วิธีการ Deploy GAS ที่อัปเดต

### ขั้นตอนที่ 1: เปิด Google Apps Script Editor
1. ไปที่ [Google Apps Script](https://script.google.com/)
2. เปิดโปรเจค: **Agents Club - Upload Slip System**
3. หรือใช้ลิงก์โดยตรง: [Script ID: YOUR_SCRIPT_ID]

### ขั้นตอนที่ 2: อัปเดต Code.gs
1. คลิกที่ไฟล์ `Code.gs`
2. แทนที่โค้ดเดิมด้วยโค้ดใหม่จากไฟล์นี้: `gas-upload-slip/Code.gs`
3. กด `Ctrl+S` (Windows) หรือ `Cmd+S` (Mac) เพื่อบันทึก

### ขั้นตอนที่ 3: Deploy เวอร์ชันใหม่ (ใช้ URL เดิม)

**สำคัญ:** ใช้วิธี Update Existing Deployment เพื่อให้ URL เดิมยังใช้งานได้

1. คลิก **Deploy** → **Manage deployments**
2. คลิกไอคอน **Edit** (ดินสอ) ที่ deployment ที่ใช้งานอยู่
3. ตั้งค่า:
   - **Version**: เลือก **New version**
   - **Description**: "Fix Full Payment slip display and thumbnail URL (2026-07-12)"
4. คลิก **Deploy**
5. ✅ URL จะยังเหมือนเดิม - **ไม่ต้องเปลี่ยนอะไรใน Firestore**

**หมายเหตุ:** ถ้าต้องการสร้าง deployment ใหม่ (URL ใหม่):
1. คลิก **Deploy** → **New deployment**
2. ต้องอัปเดต `paymentSlipSubmissionUrl` ในทุก Event ที่ใช้งาน

### ขั้นตอนที่ 4: ทดสอบการทำงาน
1. ลงทะเบียน Event ที่เป็น Full Payment Mode
2. อัปโหลดสลิปผ่าน GAS Web App
3. ตรวจสอบใน Google Sheet:
   - Column `remaining_slip_url` (W) ควรมีค่า URL
   - Column `remaining_paid_date` (V) ควรมีวันที่ (YYYY-MM-DD)
   - Column `payment_status` (AA) ควรเป็น "รอตรวจสอบ"
4. ตรวจสอบที่หน้า Member Event Detail:
   - ควรเห็น thumbnail รูปสลิป (ไม่ใช่ไอคอนสีดำ)
   - ควรเห็นวันเวลาที่อัปโหลด

---

## 🔍 วิธีตรวจสอบว่า Deploy สำเร็จ

### 1. ตรวจสอบ Version ใน GAS
1. ไปที่ **Deploy** → **Manage deployments**
2. ตรวจสอบว่า **Active version** เป็น version ล่าสุด
3. ดู Description ว่าตรงกับที่ระบุไว้หรือไม่

### 2. ทดสอบการอัปโหลดสลิป
1. เปิด Web App URL ในเบราว์เซอร์
2. ใส่พารามิเตอร์ทดสอบ:
   ```
   ?registrationId=ABC123&eventId=test-event&paymentType=full
   ```
3. ตรวจสอบว่าหน้าฟอร์มแสดงถูกต้อง

### 3. ตรวจสอบ Logs
1. คลิก **Executions** ที่แถบด้านซ้าย
2. ดูว่ามี error หรือไม่
3. ตรวจสอบ log message ว่ามีการเขียน URL ที่ถูกต้อง

---

## 📝 Google Sheet Columns ที่เกี่ยวข้อง

| Column | Field Name | Full Payment | Deposit Mode |
|--------|------------|--------------|--------------|
| Q | `slip_url` | ❌ Legacy (ไม่ใช้แล้ว) | ❌ |
| V | `remaining_paid_date` | ✅ ใช้ | ✅ ใช้ (ยอดคงเหลือ) |
| W | `deposit_slip_url` | ❌ | ✅ ใช้ (มัดจำ) |
| X | `remaining_slip_url` | ✅ **ใช้** | ✅ ใช้ (ยอดคงเหลือ) |
| AA | `payment_status` | ✅ "รอตรวจสอบ" | ✅ |

---

## ⚠️ Breaking Changes

### สำหรับข้อมูลเก่าที่ใช้ `slip_url`:
- Vercel ได้รองรับ backward compatibility แล้ว
- ข้อมูลเก่าที่มี `slip_url` จะยังแสดงได้ปกติ
- ข้อมูลใหม่จะใช้ `remaining_slip_url` แทน

### สำหรับ Google Drive sharing:
- ไฟล์ทั้งหมดจะถูกตั้งค่าเป็น "Anyone with the link can view"
- URL format เปลี่ยนเป็น thumbnail URL: `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000`

---

## 🐛 Troubleshooting

### ปัญหา: รูปยังแสดงเป็นไอคอนสีดำ
**สาเหตุ:** ไฟล์ที่อัปโหลดก่อน deploy version ใหม่ ยังใช้ URL เดิม

**วิธีแก้:**
1. ให้ผู้ใช้อัปโหลดสลิปใหม่
2. หรือ Admin ไปแก้ URL ใน Google Sheet ด้วยตัวเอง:
   - หา File ID จาก URL เดิม
   - แทนที่ด้วย: `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000`

### ปัญหา: ไม่เห็น thumbnail ในหน้า Member Event Detail
**สาเหตุ:** Vercel ยังไม่ได้ deploy version ใหม่

**วิธีแก้:**
1. รอให้ Vercel auto-deploy (จาก GitHub push)
2. หรือ manual deploy ใน Vercel dashboard

### ปัญหา: Column ไม่ตรงกับที่ระบุ
**สาเหตุ:** Sheet structure อาจต่างจากมาตรฐาน

**วิธีแก้:**
1. ตรวจสอบ header row ว่ามีชื่อ column ถูกต้องหรือไม่
2. ดู GAS logs เพื่อหา column index ที่ถูกต้อง

---

## 📚 Related Files

- **GAS Code**: `gas-upload-slip/Code.gs`
- **Vercel Payment Status**: `src/lib/payment-status.ts`
- **Event Detail Page**: `src/app/events/[eventId]/page.tsx`
- **Documentation**: `PAYMENT_SYSTEM.md`

---

## ✅ Checklist หลัง Deploy

- [ ] Deploy GAS version ใหม่สำเร็จ
- [ ] ทดสอบอัปโหลดสลิป Full Payment Mode
- [ ] ตรวจสอบ Google Sheet มีข้อมูลใน `remaining_slip_url` และ `remaining_paid_date`
- [ ] ตรวจสอบรูป thumbnail แสดงถูกต้อง (ไม่ใช่ไอคอนสีดำ)
- [ ] ตรวจสอบวันเวลาแสดงถูกต้อง
- [ ] ทดสอบ lightbox ว่าเปิดรูปขนาดใหญ่ได้
- [ ] อัปเดต Vercel (ถ้ายังไม่ได้ push code)
- [ ] แจ้งผู้ใช้ให้ทดสอบระบบ

---

**Last Updated**: 2026-07-12
**Updated By**: Claude Sonnet 4.5
