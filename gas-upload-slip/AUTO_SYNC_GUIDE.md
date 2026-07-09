# Auto-Sync Event Mappings Guide

## ภาพรวม

ระบบนี้ทำให้ Event Mappings (Event ID → Sheet Name) สามารถ sync อัตโนมัติจาก Vercel ไปยัง Google Apps Script ได้ โดยไม่ต้องแก้ไข code ใน GAS ทุกครั้งที่สร้าง Event ใหม่

## สถาปัตยกรรม

```
Vercel (Firestore)
    ↓
    Event Created/Updated
    ↓
    POST to GAS Web App
    ↓
GAS (Properties Service)
    ↓
    Event Mappings Stored
    ↓
    CONFIG.EVENT_SHEETS อ่านแบบ dynamic
```

## การทำงาน

### 1. Properties Service
- เก็บ Event Mappings ในรูปแบบ JSON
- อ่าน/เขียนเร็ว ไม่ต้องใช้ Google Sheet
- Persistent storage (ไม่หายเมื่อ redeploy)

### 2. Dynamic CONFIG
```javascript
const CONFIG = {
  get EVENT_SHEETS() {
    return getEventMappings(); // อ่านจาก Properties Service
  }
};
```

### 3. API Endpoints

#### Sync Event (POST)
```bash
curl -X POST "GAS_WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "sync_event",
    "eventId": "annual-dinner-2026",
    "sheetName": "AnnualDinner2026"
  }'
```

**Response:**
```json
{
  "success": true
}
```

#### Get Mappings (POST)
```bash
curl -X POST "GAS_WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get_mappings"
  }'
```

**Response:**
```json
{
  "success": true,
  "mappings": {
    "10yearth-meeting-2026": "10 Yearth Meeting",
    "🎉-งานแรลลี่-10th-anniversary-agents-club-2026": "Rally2026",
    "annual-dinner-2026": "AnnualDinner2026"
  }
}
```

## Implementation ฝั่ง Vercel

### Option 1: Sync เมื่อสร้าง Event (แนะนำ)

**ไฟล์:** `src/app/api/events/create/route.ts`

```typescript
// หลังจากสร้าง Event ใน Firestore สำเร็จ
await fetch(process.env.NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL!, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'sync_event',
    eventId: eventData.eventId,
    sheetName: eventData.sheetName,
  }),
});
```

### Option 2: Sync เมื่อแก้ไข Event

**ไฟล์:** `src/app/api/events/[eventId]/update/route.ts`

```typescript
// ถ้า sheetName เปลี่ยน ให้ sync ใหม่
if (updates.sheetName) {
  await fetch(process.env.NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'sync_event',
      eventId: eventId,
      sheetName: updates.sheetName,
    }),
  });
}
```

### Option 3: Manual Sync Command

สร้าง API endpoint สำหรับ sync ทั้งหมด:

**ไฟล์:** `src/app/api/admin/sync-events/route.ts`

```typescript
import { adminDb } from '@/lib/firebase-admin';

export async function POST() {
  try {
    // ดึง Events ทั้งหมดจาก Firestore
    const eventsSnapshot = await adminDb()
      .collection('events')
      .where('sheetName', '!=', '')
      .get();

    // Sync แต่ละ event
    for (const doc of eventsSnapshot.docs) {
      const event = doc.data();

      await fetch(process.env.NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_event',
          eventId: event.eventId,
          sheetName: event.sheetName,
        }),
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

## Testing ใน Apps Script Editor

### 1. ทดสอบบันทึก Event Mapping
```javascript
function testSaveEventMapping()
```
รันฟังก์ชันนี้ใน Apps Script Editor

### 2. ทดสอบอ่าน Event Mappings
```javascript
function testGetEventMappings()
```

### 3. ทดสอบ doPost Endpoint
```javascript
function testDoPostSyncEvent()
```

### 4. รีเซ็ตค่าเริ่มต้น
```javascript
function resetEventMappings()
```

### 5. ลบทั้งหมด
```javascript
function clearAllEventMappings()
```

## Error Handling

### ถ้า Properties Service fail
- ระบบจะ fallback ไปใช้ default mappings
- Log error แต่ไม่ crash
- ยังคงทำงานได้ตามปกติ

### ถ้า POST request fail
- Vercel จะได้ error response
- ไม่กระทบการสร้าง Event
- สามารถ retry หรือ sync ทีหลังได้

## ข้อดี

✅ **ไม่ต้องแก้ไข GAS code** เมื่อสร้าง Event ใหม่
✅ **Auto-sync** จาก Vercel โดยอัตโนมัติ
✅ **Persistent** ข้อมูลไม่หายเมื่อ redeploy
✅ **Fast** อ่าน/เขียนเร็วกว่า Google Sheet
✅ **Fallback** มี default values กรณี error
✅ **Scalable** รองรับ Events ได้ไม่จำกัด

## ข้อจำกัด

- Properties Service มีข้อจำกัดขนาด 500KB per property
- แต่สำหรับ Event Mappings ไม่น่าจะเกิน (รองรับได้หลักพัน events)

## Migration จากระบบเดิม

### ครั้งแรก: Sync Events ที่มีอยู่แล้ว

1. Deploy GAS ใหม่ (clasp push)
2. เรียก manual sync endpoint จาก Vercel
3. ตรวจสอบว่า mappings ถูกต้อง (รัน `testGetEventMappings()`)
4. เสร็จ! ตั้งแต่นี้จะ sync อัตโนมัติ

## สรุป

ระบบนี้ทำให้การจัดการ Event Mappings ง่ายขึ้นมาก โดยไม่ต้องแก้ไข GAS code ทุกครั้ง เหมาะสำหรับการใช้งานจริงในระยะยาว
