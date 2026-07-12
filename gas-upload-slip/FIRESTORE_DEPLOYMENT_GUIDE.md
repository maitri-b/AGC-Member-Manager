# 🔥 Firestore Integration Deployment Guide
## การอัพเดท GAS เพื่อบันทึกข้อมูลลง Firestore

**วันที่อัพเดท:** 2026-07-12
**Version:** 2.0 (Firestore Integration)

---

## 📋 สรุปการเปลี่ยนแปลง

### ปัญหาเดิม
- GAS บันทึกข้อมูลสลิปลง **Google Sheets เท่านั้น**
- Vercel อ่านข้อมูลจาก **Firestore**
- ทำให้เกิด data inconsistency

### วิธีแก้ (Architecture ใหม่)
```
User Upload Slip
    ↓
GAS Web App
    ↓
1. Upload file to Google Drive
    ↓
2. Update Google Sheets (backward compatibility)
    ↓
3. ✨ Callback to Vercel API
    ↓
4. Vercel updates Firestore
    ↓
Done!
```

---

## 🚀 ขั้นตอนการ Deploy

### Step 1: เพิ่ม Environment Variable ใน Vercel

1. ไปที่ [Vercel Dashboard](https://vercel.com/)
2. เลือก Project: **Agents Club Member Manager**
3. ไปที่ **Settings** → **Environment Variables**
4. เพิ่มตัวแปรใหม่:
   ```
   Key: GAS_WEBHOOK_SECRET
   Value: 0992680eb489d5003f1c9a65fcaf9fdd94da77f613acacbbee80e46415c176f6
   ```
5. Apply to: **Production**, **Preview**, **Development**
6. คลิก **Save**

### Step 2: Deploy Vercel API (Automatic)

Vercel API ถูกสร้างไว้แล้วที่:
- **Path:** `src/app/api/webhooks/gas-slip-upload/route.ts`
- **URL:** `https://your-app.vercel.app/api/webhooks/gas-slip-upload`

เมื่อคุณ push code ไป GitHub, Vercel จะ auto-deploy ให้อัตโนมัติ

### Step 3: อัพเดท GAS Code

#### 3.1 เปิด Google Apps Script Editor
1. ไปที่ [Google Apps Script](https://script.google.com/)
2. เปิดโปรเจค: **Agents Club - Upload Slip System**

#### 3.2 อัพเดท Configuration
เปิดไฟล์ `Code.gs` และแก้ไข CONFIG ดังนี้:

```javascript
const CONFIG = {
  SHEET_ID: '1pVx91b0tA6IHIfKTvGq6ywYYzkNe1HPkGh7rSiHlmb0',
  DRIVE_FOLDER_ID: '17PF4Za5QPcxtZFUuHi2FgQOT7yFocu1i',

  // ✨ เพิ่มส่วนนี้
  VERCEL_API_URL: 'https://your-actual-domain.vercel.app/api/webhooks/gas-slip-upload',
  VERCEL_WEBHOOK_SECRET: '0992680eb489d5003f1c9a65fcaf9fdd94da77f613acacbbee80e46415c176f6',

  get EVENT_SHEETS() {
    return getEventMappings();
  }
};
```

**⚠️ สำคัญ:** แทนที่ `your-actual-domain.vercel.app` ด้วย domain จริงของคุณ!

#### 3.3 คัดลอกโค้ดใหม่
1. เปิดไฟล์ `gas-upload-slip/Code-Firestore.gs` ในโปรเจคนี้
2. คัดลอกโค้ดทั้งหมด
3. แทนที่โค้ดใน `Code.gs` ของ GAS

#### 3.4 Deploy Version ใหม่

**วิธีที่ 1: Update Existing Deployment (แนะนำ - URL ไม่เปลี่ยน)**

1. คลิก **Deploy** → **Manage deployments**
2. คลิกไอคอน **Edit** (ดินสอ) ที่ deployment ปัจจุบัน
3. ตั้งค่า:
   - **Version:** New version
   - **Description:** "Firestore integration via Vercel API callback (2026-07-12)"
4. คลิก **Deploy**
5. ✅ URL เดิมยังใช้งานได้ ไม่ต้องเปลี่ยนใน Firestore

**วิธีที่ 2: New Deployment (URL ใหม่)**

1. คลิก **Deploy** → **New deployment**
2. เลือก **Web app**
3. ตั้งค่า:
   - **Description:** Firestore Integration v2.0
   - **Execute as:** Me
   - **Who has access:** Anyone
4. คลิก **Deploy**
5. ⚠️ ต้องอัพเดท `paymentSlipSubmissionUrl` ในทุก Event

---

## 🧪 ขั้นตอนการทดสอบ

### Test 1: ทดสอบ Vercel API Endpoint

```bash
curl -X GET https://your-app.vercel.app/api/webhooks/gas-slip-upload
```

**Expected Response:**
```json
{
  "status": "ok",
  "endpoint": "GAS Slip Upload Webhook",
  "timestamp": "2026-07-12T10:30:00.000Z"
}
```

### Test 2: ทดสอบ GAS Callback (ใน GAS Script Editor)

เพิ่มฟังก์ชันทดสอบใน GAS:

```javascript
function testFirestoreCallback() {
  const result = updateFirestore(
    'ABC123',              // registrationId
    'test-event-2026',     // eventId
    'deposit',             // paymentType
    'https://drive.google.com/thumbnail?id=TEST123&sz=w1000'
  );

  Logger.log('Test result: ' + JSON.stringify(result));
}
```

รันฟังก์ชันนี้และตรวจสอบ Logs:
- คลิก **Executions** ทางซ้าย
- ดู logs ว่ามี `[Firestore] Successfully updated Firestore` หรือไม่

### Test 3: ทดสอบอัพโหลดสลิปจริง

1. ลงทะเบียน Event ใหม่
2. คลิก "ส่งหลักฐานการโอนเงิน"
3. อัพโหลดรูปสลิป
4. ตรวจสอบผลลัพธ์:

**ใน Google Sheet:**
- Column `remaining_slip_url` ควรมี URL
- Column `remaining_paid_date` ควรมีวันที่
- Column `payment_status` ควรเป็น "รอตรวจสอบ"

**ใน Firestore (Firebase Console):**
1. ไปที่ [Firebase Console](https://console.firebase.google.com/)
2. เลือก Project: **agent-clubs-member-manager**
3. ไปที่ **Firestore Database**
4. เปิด collection: `eventRegistrations`
5. หา document ที่มี `registrationId` ที่ทดสอบ
6. ตรวจสอบว่ามีฟิลด์เหล่านี้:
   - `remainingSlipUrl`: URL ของสลิป
   - `remainingPaidDate`: วันที่อัพโหลด
   - `paymentStatus`: "รอตรวจสอบ"
   - `updatedAt`: timestamp ล่าสุด

**ใน Vercel Logs:**
1. ไปที่ Vercel Dashboard
2. เลือก Project → **Deployments** → คลิก deployment ล่าสุด
3. ไปที่ **Functions** → คลิก `/api/webhooks/gas-slip-upload`
4. ดู logs ว่ามีการเรียก API และ success หรือไม่

---

## 🔍 Troubleshooting

### Problem 1: Vercel API ตอบ 401 Unauthorized

**สาเหตุ:**
- `GAS_WEBHOOK_SECRET` ใน GAS ไม่ตรงกับใน Vercel

**วิธีแก้:**
1. ตรวจสอบ `.env.local` (local) หรือ Vercel Environment Variables (production)
2. ตรวจสอบ `CONFIG.VERCEL_WEBHOOK_SECRET` ใน GAS
3. ทั้งสองต้องเหมือนกัน 100%

### Problem 2: Firestore ไม่ได้อัพเดท แต่ Google Sheet อัพเดท

**สาเหตุ:**
- GAS callback ไปที่ Vercel ล้มเหลว
- ดู GAS Logs ที่ **Executions**

**วิธีแก้:**
1. ตรวจสอบว่า `CONFIG.VERCEL_API_URL` ถูกต้อง
2. ตรวจสอบว่า Vercel app ทำงานอยู่
3. ตรวจสอบว่า Firestore Rules อนุญาตให้เขียนได้

### Problem 3: รูปสลิปยังไม่แสดงใน Member Event Detail

**สาเหตุ:**
- Frontend ยังไม่ได้ refresh data

**วิธีแก้:**
- Refresh หน้าเว็บ
- หรือรอ cache หมดอายุ (30 วินาที)

### Problem 4: Registration not found (404)

**สาเหตุ:**
- ข้อมูลใน Firestore ยังไม่ถูก migrate
- หรือ registrationId ไม่ตรงกัน

**วิธีแก้:**
1. ตรวจสอบใน Firestore Console ว่ามี document นั้นหรือไม่
2. ตรวจสอบว่า `eventId` และ `registrationId` ถูกต้อง
3. อาจต้อง migrate ข้อมูลนั้นใหม่

---

## 📊 Architecture Flow Diagram

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ 1. Click "Upload Slip"
       ↓
┌──────────────────┐
│  Vercel Frontend │
└──────┬───────────┘
       │ 2. Open GAS Web App
       ↓
┌──────────────────┐
│   GAS Web App    │
│                  │
│ ┌──────────────┐ │
│ │Upload to Drive│ │ 3. Upload file
│ └──────┬───────┘ │
│        ↓         │
│ ┌──────────────┐ │
│ │Update Sheet  │ │ 4. Backward compatibility
│ └──────┬───────┘ │
│        ↓         │
│ ┌──────────────┐ │
│ │Callback API  │ │ 5. POST to Vercel
│ └──────┬───────┘ │
└────────┼─────────┘
         │
         ↓
┌──────────────────┐
│   Vercel API     │
│  (Webhook)       │
│                  │
│ ┌──────────────┐ │
│ │Verify Token  │ │ 6. Auth check
│ └──────┬───────┘ │
│        ↓         │
│ ┌──────────────┐ │
│ │Find Document │ │ 7. Query Firestore
│ └──────┬───────┘ │
│        ↓         │
│ ┌──────────────┐ │
│ │Update Fields │ │ 8. Update slip URL
│ └──────┬───────┘ │
│        ↓         │
│ ┌──────────────┐ │
│ │Invalidate    │ │ 9. Clear cache
│ │Cache         │ │
│ └──────────────┘ │
└──────────────────┘
```

---

## 📝 Checklist หลัง Deploy

- [ ] เพิ่ม `GAS_WEBHOOK_SECRET` ใน Vercel Environment Variables
- [ ] Push code ไป GitHub → Vercel auto-deploy
- [ ] อัพเดท `CONFIG.VERCEL_API_URL` ใน GAS
- [ ] อัพเดท `CONFIG.VERCEL_WEBHOOK_SECRET` ใน GAS
- [ ] Deploy GAS version ใหม่
- [ ] ทดสอบ Vercel API endpoint (GET request)
- [ ] ทดสอบ GAS callback function
- [ ] ทดสอบอัพโหลดสลิปจริง
- [ ] ตรวจสอบ Google Sheet อัพเดท
- [ ] ตรวจสอบ Firestore อัพเดท
- [ ] ตรวจสอบรูปสลิปแสดงที่หน้า Member Event Detail
- [ ] ตรวจสอบ Vercel logs ว่าไม่มี error
- [ ] แจ้งผู้ใช้ให้ทดสอบระบบ

---

## 🔐 Security Notes

1. **GAS_WEBHOOK_SECRET** ต้องเก็บเป็นความลับ
   - ไม่ commit ลง GitHub
   - เก็บใน Environment Variables เท่านั้น

2. **Vercel API Endpoint** มี authentication
   - ตรวจสอบ Bearer token ก่อนดำเนินการ
   - Reject unauthorized requests

3. **Firestore Security Rules** ยังใช้งานตามเดิม
   - Vercel ใช้ Firebase Admin SDK (bypass rules)
   - แต่ direct client access ยังถูก protect

---

## 📚 Related Files

- **Vercel API:** `src/app/api/webhooks/gas-slip-upload/route.ts`
- **GAS Code (New):** `gas-upload-slip/Code-Firestore.gs`
- **GAS Code (Old):** `gas-upload-slip/Code.gs`
- **Integration Guide:** `gas-upload-slip/INTEGRATION_GUIDE.md`
- **Firestore Rules:** `firestore.rules`
- **Firestore Indexes:** `firestore.indexes.json`

---

**Last Updated:** 2026-07-12
**Author:** Claude Sonnet 4.5
**Version:** 2.0 (Firestore Integration)
