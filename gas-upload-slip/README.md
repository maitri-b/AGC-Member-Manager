# 📤 ระบบอัพโหลดสลิปการชำระเงิน (Google Apps Script)

ระบบนี้ทำงานร่วมกับ Vercel App เพื่อให้สมาชิกสามารถอัพโหลดสลิปการชำระเงินได้โดยตรง

## 🚀 ขั้นตอนการติดตั้ง

### 1. เปิด Google Apps Script Editor

1. ไปที่ https://script.google.com
2. เปิด project ที่มี Script ID: `1U7JqO-OaO972n_bH1LtwF_lez06XjAh0RXRmq9feLOZ5UrkexVkPGahG`
3. หรือสร้าง project ใหม่

### 2. Copy Code

1. **Code.gs**: Copy เนื้อหาจากไฟล์ `Code.gs` ไปวางใน GAS Editor
2. **UploadForm.html**: สร้างไฟล์ HTML ใหม่ชื่อ `UploadForm` และ copy เนื้อหาจาก `UploadForm.html`

### 3. ตั้งค่า Configuration

แก้ไขค่าในส่วน `CONFIG` ของไฟล์ `Code.gs`:

```javascript
const CONFIG = {
  SHEET_ID: 'YOUR_GOOGLE_SHEET_ID', // ใส่ค่าจาก .env.local
  DRIVE_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID', // สร้าง folder ใหม่

  EVENT_SHEETS: {
    '10yearth-meeting-2026': '10 Yearth Meeting',
    // เพิ่ม event อื่นๆ
  }
};
```

#### วิธีหาค่าต่างๆ:

**SHEET_ID:**
- ดูจาก URL ของ Google Sheets: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`
- หรือดูจากไฟล์ `.env.local` → `GOOGLE_SHEET_ID`

**DRIVE_FOLDER_ID:**
1. สร้าง folder ใหม่ใน Google Drive ชื่อ "Event Payment Slips"
2. เปิด folder นั้น
3. ดู URL: `https://drive.google.com/drive/folders/{FOLDER_ID}`
4. Copy `FOLDER_ID`

### 4. Deploy เป็น Web App

1. ใน GAS Editor คลิก **Deploy** → **New deployment**
2. เลือก type: **Web app**
3. ตั้งค่า:
   - **Description**: Upload Slip System v1
   - **Execute as**: Me (your_email@gmail.com)
   - **Who has access**: Anyone
4. คลิก **Deploy**
5. Copy **Deployment ID** และ **Web app URL**

### 5. เพิ่ม URL ใน Vercel

ใน Vercel project ไปที่ `src/lib/constants.ts` (หรือสร้างใหม่):

```typescript
export const GAS_UPLOAD_SLIP_URL = 'https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec';
```

## 🔧 การใช้งานใน Vercel

### ตัวอย่างการเรียกใช้ในหน้า Event Detail:

```typescript
import { GAS_UPLOAD_SLIP_URL } from '@/lib/constants';

const handleUploadSlip = (paymentType: 'deposit' | 'remaining') => {
  if (!userRegistration) return;

  const url = new URL(GAS_UPLOAD_SLIP_URL);
  url.searchParams.append('registrationId', userRegistration.registrationId);
  url.searchParams.append('eventId', eventId);
  url.searchParams.append('lineUserId', session.user.id);
  url.searchParams.append('paymentType', paymentType);

  // Open in popup
  const popup = window.open(
    url.toString(),
    'uploadSlip',
    'width=600,height=700,scrollbars=yes'
  );

  // Refresh when closed
  const checkClosed = setInterval(() => {
    if (popup?.closed) {
      clearInterval(checkClosed);
      fetchEventDetail(); // Refresh data
    }
  }, 500);
};
```

## 📋 Parameter ที่ส่งไป GAS

| Parameter | Required | Description |
|-----------|----------|-------------|
| `registrationId` | ✅ | รหัสลงทะเบียน 6 หลัก |
| `eventId` | ✅ | Event ID (เช่น `10yearth-meeting-2026`) |
| `lineUserId` | ⚠️ | LINE User ID (สำหรับ verify ownership) |
| `paymentType` | ❌ | `deposit` หรือ `remaining` (default: `deposit`) |

## 🗂️ Google Sheet Columns ที่ใช้

ระบบจะอัพเดท columns ต่อไปนี้:

### สำหรับ Deposit:
- `deposit_slip_url` - URL ของสลิปที่อัพโหลด
- `deposit_paid_date` - วันที่อัพโหลด
- `payment_status` - เปลี่ยนเป็น "รอตรวจสอบมัดจำ"

### สำหรับ Remaining:
- `remaining_slip_url` - URL ของสลิปที่อัพโหลด
- `remaining_paid_date` - วันที่อัพโหลด (อาจต้องเพิ่ม column)
- `payment_status` - เปลี่ยนเป็น "รอตรวจสอบยอดคงเหลือ"

## 🔒 Security Features

1. **Ownership Verification**: ตรวจสอบว่า LINE User ID ตรงกับการลงทะเบียนหรือไม่
2. **File Size Limit**: จำกัดขนาดไฟล์ไม่เกิน 5MB
3. **File Type Validation**: รับเฉพาะ image/* และ application/pdf
4. **Error Handling**: จัดการ error และ rollback ถ้าอัพเดท Sheet ไม่สำเร็จ

## 🧪 การทดสอบ

### ทดสอบ URL โดยตรง:
```
https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec?registrationId=ABC123&eventId=10yearth-meeting-2026
```

### Expected Result:
- ✅ แสดงหน้าฟอร์มอัพโหลดพร้อมข้อมูลการลงทะเบียน
- ✅ สามารถเลือกไฟล์และอัพโหลดได้
- ✅ หลังอัพโหลดสำเร็จ Google Sheet อัพเดทข้อมูล
- ✅ ไฟล์ปรากฏใน Google Drive folder

## 📝 Logs

ตรวจสอบ logs ใน GAS Editor:
1. คลิก **Executions** (ด้านซ้าย)
2. ดู execution history และ error logs

## 🔄 การอัพเดท

เมื่อแก้ไขโค้ด:
1. แก้ไขใน GAS Editor
2. **Deploy** → **Manage deployments**
3. เลือก deployment → **Edit**
4. **Version**: New version
5. **Deploy**

**สำคัญ**: Deployment ID จะเหมือนเดิม URL ไม่ต้องเปลี่ยน

## ⚠️ Troubleshooting

### ปัญหา: "The caller does not have permission"
- ตรวจสอบว่า "Who has access" ตั้งเป็น **Anyone**

### ปัญหา: ไม่พบ Sheet
- ตรวจสอบ `CONFIG.SHEET_ID` ถูกต้อง
- ตรวจสอบ `CONFIG.EVENT_SHEETS` มี mapping ของ eventId

### ปัญหา: อัพโหลดไฟล์ไม่ได้
- ตรวจสอบ `CONFIG.DRIVE_FOLDER_ID` ถูกต้อง
- ตรวจสอบว่า Google Account ที่ deploy มีสิทธิ์เข้าถึง folder

### ปัญหา: Google Sheet ไม่อัพเดท
- ตรวจสอบชื่อ columns ใน Sheet ตรงกับใน code
- ดู logs ใน Executions

## 📞 Support

หากมีปัญหาติดต่อ Admin ที่ https://lin.ee/nzAjXXq
