# 🔗 คู่มือการเชื่อมต่อ GAS Upload Slip กับ Vercel

## ⚠️ ปัญหาที่เจอ

ระบบเดิมออกแบบให้เก็บ **URL แบบตายตัว** ใน Firestore (เหมือน Google Form):

```typescript
event.paymentSlipSubmissionUrl = "https://forms.google.com/..."
```

**แต่** GAS ต้องการ **dynamic URL** ที่มี parameters:
```
https://script.google.com/.../exec?registrationId=ABC123&eventId=...
```

## ✅ วิธีแก้

### แนวทาง 1: เก็บ Base URL + สร้าง Full URL แบบ Dynamic (แนะนำ)

#### ใน Firestore Event:
เก็บแค่ **Base URL** (ไม่มี parameters):
```
paymentSlipSubmissionUrl: "https://script.google.com/macros/s/AKfycbzH4k3qwZ40NMil_YhEMJ5qL478C4HXKPVOjklc_eD8b0-vQAhqY6n23-8-QV4Y4Af5Hw/exec"
```

#### ใน Frontend (Event Detail Page):
สร้าง URL แบบ dynamic:

```typescript
// src/app/events/[eventId]/page.tsx

import { useSession } from 'next-auth/react';

const handleUploadSlip = (paymentType: 'deposit' | 'remaining') => {
  if (!userRegistration || !event.paymentSlipSubmissionUrl) return;

  // สร้าง URL พร้อม parameters
  const url = new URL(event.paymentSlipSubmissionUrl);
  url.searchParams.append('registrationId', userRegistration.registrationId);
  url.searchParams.append('eventId', eventId);
  url.searchParams.append('lineUserId', session?.user?.id || '');
  url.searchParams.append('paymentType', paymentType);

  // เปิดหน้าต่างใหม่
  const popup = window.open(
    url.toString(),
    'uploadSlip',
    'width=600,height=700,scrollbars=yes'
  );

  // Refresh เมื่อปิดหน้าต่าง
  const checkClosed = setInterval(() => {
    if (popup?.closed) {
      clearInterval(checkClosed);
      fetchEventDetail(); // Refresh data
    }
  }, 500);
};
```

#### ตัวอย่างการใช้ใน JSX:

```tsx
{/* ในส่วน Payment Information */}
{event.paymentSlipSubmissionUrl && (
  <div className="mt-4">
    <button
      onClick={() => handleUploadSlip('deposit')}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
    >
      📤 อัพโหลดสลิปมัดจำ
    </button>

    {userRegistration.remainingAmount > 0 && (
      <button
        onClick={() => handleUploadSlip('remaining')}
        className="ml-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
      >
        📤 อัพโหลดสลิปยอดคงเหลือ
      </button>
    )}
  </div>
)}
```

---

### แนวทาง 2: ใช้ Constants แทน Firestore

ถ้าไม่ต้องการเก็บใน Firestore เลย สามารถใช้ constants:

```typescript
// src/lib/constants.ts (already created)
export const GAS_UPLOAD_SLIP_URL = 'https://script.google.com/.../exec';
```

```typescript
// ในหน้า Event Detail
import { GAS_UPLOAD_SLIP_URL } from '@/lib/constants';

const handleUploadSlip = (paymentType: 'deposit' | 'remaining') => {
  const url = new URL(GAS_UPLOAD_SLIP_URL);
  url.searchParams.append('registrationId', userRegistration.registrationId);
  url.searchParams.append('eventId', eventId);
  url.searchParams.append('lineUserId', session?.user?.id || '');
  url.searchParams.append('paymentType', paymentType);

  window.open(url.toString(), 'uploadSlip', 'width=600,height=700');
};
```

---

## 📋 Parameters ที่ GAS รองรับ

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `registrationId` | ✅ | string | รหัสลงทะเบียน 6 หลัก |
| `eventId` | ✅ | string | Event ID (เช่น `🎉-งานแรลลี่-10th-anniversary-agents-club-2026`) |
| `lineUserId` | ⚠️ | string | LINE User ID (สำหรับ verify ownership) |
| `paymentType` | ❌ | `deposit` \| `remaining` | ประเภทการชำระ (default: `deposit`) |

---

## 🎯 ตัวอย่าง Complete Code

```typescript
'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { GAS_UPLOAD_SLIP_URL } from '@/lib/constants';

export default function EventDetailPage({ params }: { params: { eventId: string } }) {
  const { data: session } = useSession();
  const [eventData, setEventData] = useState<any>(null);

  const handleUploadSlip = (paymentType: 'deposit' | 'remaining') => {
    if (!eventData?.userRegistration) {
      alert('กรุณาลงทะเบียนก่อนอัพโหลดสลิป');
      return;
    }

    // สร้าง URL พร้อม parameters
    const url = new URL(GAS_UPLOAD_SLIP_URL);
    url.searchParams.append('registrationId', eventData.userRegistration.registrationId);
    url.searchParams.append('eventId', params.eventId);
    url.searchParams.append('lineUserId', session?.user?.id || '');
    url.searchParams.append('paymentType', paymentType);

    console.log('Opening upload window:', url.toString());

    // เปิดหน้าต่างใหม่
    const popup = window.open(
      url.toString(),
      'uploadSlip',
      'width=600,height=700,scrollbars=yes,resizable=yes'
    );

    if (!popup) {
      alert('กรุณาอนุญาตให้เปิดหน้าต่างใหม่ (Popup)');
      return;
    }

    // Auto-refresh เมื่อปิดหน้าต่าง
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        console.log('Upload window closed, refreshing data...');
        fetchEventDetail(); // Refresh data
      }
    }, 500);
  };

  return (
    <div>
      {/* ... event detail UI ... */}

      {/* Upload Slip Buttons */}
      {eventData?.userRegistration && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-3">อัพโหลดสลิปการชำระเงิน</h3>

          {/* Deposit Slip */}
          {eventData.userRegistration.depositAmount > 0 && !eventData.userRegistration.depositPaid && (
            <button
              onClick={() => handleUploadSlip('deposit')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              📤 อัพโหลดสลิปมัดจำ ({eventData.userRegistration.depositAmount.toLocaleString()} บาท)
            </button>
          )}

          {/* Remaining Slip */}
          {eventData.userRegistration.remainingAmount > 0 && eventData.userRegistration.depositPaid && (
            <button
              onClick={() => handleUploadSlip('remaining')}
              className="ml-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              📤 อัพโหลดสลิปยอดคงเหลือ ({eventData.userRegistration.remainingAmount.toLocaleString()} บาท)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 🔍 Debugging

### ตรวจสอบ URL ที่สร้าง:
```typescript
console.log('Upload URL:', url.toString());
// Output: https://script.google.com/.../exec?registrationId=ABC123&eventId=...
```

### ทดสอบ URL โดยตรง:
```
https://script.google.com/macros/s/AKfycbzH4k3qwZ40NMil_YhEMJ5qL478C4HXKPVOjklc_eD8b0-vQAhqY6n23-8-QV4Y4Af5Hw/exec?registrationId=ABC123&eventId=🎉-งานแรลลี่-10th-anniversary-agents-club-2026&paymentType=deposit
```

---

## 📝 สรุป

**แนะนำให้ใช้ แนวทาง 1** (เก็บ Base URL ใน Firestore):

1. ✅ ยืดหยุ่น - เปลี่ยน URL ได้ใน Admin Panel
2. ✅ รองรับหลาย Event - แต่ละ Event ใช้ URL ต่างกันได้
3. ✅ ง่ายต่อการ Maintain

**ถ้าต้องการความเรียบง่าย** ใช้ **แนวทาง 2** (Constants):

1. ✅ เร็วกว่า - ไม่ต้องดึงจาก Firestore
2. ✅ ง่ายกว่า - ไม่ต้องตั้งค่าใน Admin
3. ⚠️ แต่ถ้าเปลี่ยน URL ต้อง deploy ใหม่
