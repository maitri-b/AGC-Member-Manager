# Payment Slips System - Usage Guide

## Overview
ระบบการจัดการสลิปการชำระเงินแบบใหม่ที่รองรับการชำระเงินหลายครั้งต่อ 1 การลงทะเบียน

## Components

### 1. PaymentDetailsModal
Modal component สำหรับแสดงประวัติการชำระเงินและจัดการสลิป

**Usage:**
```tsx
import PaymentDetailsModal from '@/components/admin/PaymentDetailsModal';

function MyComponent() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        ดูประวัติการชำระ
      </button>

      {showModal && (
        <PaymentDetailsModal
          registrationId="REG-001"
          totalAmount={5000}
          companyName="บริษัท ABC"
          contactName="คุณสมชาย"
          onClose={() => setShowModal(false)}
          onUpdate={() => {
            // Refresh parent data after approve/reject
            fetchData();
          }}
        />
      )}
    </>
  );
}
```

**Props:**
- `registrationId` (string): รหัสการลงทะเบียน
- `totalAmount` (number): ยอดเงินรวมทั้งหมด
- `companyName` (string): ชื่อบริษัท
- `contactName` (string): ชื่อผู้ติดต่อ
- `onClose` (function): Callback เมื่อปิด modal
- `onUpdate` (function, optional): Callback เมื่อมีการ approve/reject สลิป

**Features:**
- แสดงสรุปการชำระเงิน (PaymentSummary)
- แสดงประวัติสลิปทั้งหมด (PaymentTimeline)
- อนุมัติ/ปฏิเสธสลิปได้โดยตรง
- Auto-refresh หลังจาก approve/reject
- แสดง loading และ error states

### 2. PaymentSummary
Component แสดงสรุปการชำระเงิน

**Usage:**
```tsx
import PaymentSummary from '@/components/admin/PaymentSummary';

<PaymentSummary summary={paymentSummary} compact={false} />
```

**Display Modes:**
- `compact={false}`: แสดงแบบเต็ม (default)
- `compact={true}`: แสดงแบบกระทัดรัด

### 3. PaymentTimeline
Component แสดงประวัติสลิปการชำระเงิน

**Usage:**
```tsx
import PaymentTimeline from '@/components/admin/PaymentTimeline';

<PaymentTimeline
  slips={paymentSlips}
  onApprove={handleApprove}
  onReject={handleReject}
  readonly={false}
/>
```

**Props:**
- `slips`: Array ของ PaymentSlip objects
- `onApprove`: Callback function (slipId, notes?) => Promise<void>
- `onReject`: Callback function (slipId, reason, notes?) => Promise<void>
- `readonly`: Boolean - ถ้า true จะไม่แสดงปุ่ม approve/reject

## API Endpoints

### GET /api/payments
ดึงรายการสลิปการชำระเงิน

**Query Parameters:**
- `registrationId`: รหัสการลงทะเบียน (required)
- `status`: Filter by status (optional) - 'pending' | 'approved' | 'rejected'

**Response:**
```json
{
  "slips": [
    {
      "slipId": "SLIP-001",
      "registrationId": "REG-001",
      "eventId": "EVENT-001",
      "amount": 2500,
      "paymentType": "deposit",
      "slipUrl": "https://...",
      "status": "pending",
      "uploadedAt": "2025-01-15T10:00:00Z",
      "uploadedBy": "U123456"
    }
  ]
}
```

### GET /api/payments/summary
ดึงสรุปการชำระเงิน

**Query Parameters:**
- `registrationId`: รหัสการลงทะเบียน (required)
- `totalAmount`: ยอดเงินรวมทั้งหมด (required)

**Response:**
```json
{
  "summary": {
    "registrationId": "REG-001",
    "totalAmount": 5000,
    "totalPaid": 2500,
    "totalPending": 2500,
    "balance": 0,
    "paymentStatus": "partial",
    "paymentsCount": 2,
    "approvedCount": 1,
    "pendingCount": 1,
    "rejectedCount": 0
  }
}
```

### PUT /api/payments/[slipId]/approve
อนุมัติสลิปการชำระเงิน

**Body:**
```json
{
  "notes": "อนุมัติแล้ว" // optional
}
```

### PUT /api/payments/[slipId]/reject
ปฏิเสธสลิปการชำระเงิน

**Body:**
```json
{
  "reason": "สลิปไม่ชัดเจน", // required
  "notes": "กรุณาอัพโหลดใหม่" // optional
}
```

## Payment Types

- `full`: ชำระเต็มจำนวน
- `deposit`: ชำระมัดจำ (งวดที่ 1)
- `remaining`: ชำระยอดคงเหลือ (งวดที่ 2)
- `additional`: ชำระเพิ่มเติม (ค่าใช้จ่ายพิเศษ)

## Payment Status

- `pending`: รอตรวจสอบ (สีเหลือง)
- `approved`: อนุมัติแล้ว (สีเขียว)
- `rejected`: ปฏิเสธ (สีแดง)

## Integration Example: Admin Event Detail Page

```tsx
'use client';

import { useState } from 'react';
import PaymentDetailsModal from '@/components/admin/PaymentDetailsModal';

export default function EventDetailPage() {
  const [selectedRegistration, setSelectedRegistration] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const handleViewPayments = (registration) => {
    setSelectedRegistration(registration);
    setShowPaymentModal(true);
  };

  return (
    <div>
      {/* Attendee Table */}
      <table>
        <tbody>
          {attendees.map((attendee) => (
            <tr key={attendee.registration.registrationId}>
              {/* ... other cells ... */}
              <td>
                <button
                  onClick={() => handleViewPayments(attendee.registration)}
                  className="px-3 py-1 bg-blue-600 text-white rounded"
                >
                  ดูประวัติการชำระ
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Payment Details Modal */}
      {showPaymentModal && selectedRegistration && (
        <PaymentDetailsModal
          registrationId={selectedRegistration.registrationId}
          totalAmount={selectedRegistration.totalAmount}
          companyName={selectedRegistration.companyName}
          contactName={selectedRegistration.contactName}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedRegistration(null);
          }}
          onUpdate={() => {
            // Refresh attendee list after approve/reject
            fetchAttendees();
          }}
        />
      )}
    </div>
  );
}
```

## Google Apps Script Upload Flow

1. User clicks "อัพโหลดสลิป" button (generated from registration form)
2. GAS form shows with:
   - Payment type selector (deposit/remaining/full/additional)
   - Amount input (pre-filled based on payment type)
   - File upload
3. User uploads slip image
4. GAS uploads to Google Drive
5. GAS calls `/api/webhooks/gas-slip-upload` webhook
6. Webhook creates paymentSlip record in Firestore
7. Status = 'pending' for admin review
8. Admin reviews and approves/rejects via PaymentDetailsModal

## Migration Notes

### Production Migration Completed (2026-07-13)
✅ Successfully migrated existing payment slips to paymentSlips collection:
- **419 registrations** scanned
- **1 registration** with existing slip URLs migrated
- **2 payment slips** created from legacy fields
- **0 errors** during migration

### Backward Compatibility
- Legacy slip URLs (`depositSlipUrl`, `remainingSlipUrl`) are still kept for backward compatibility
- GAS webhook updates both paymentSlips collection AND legacy fields (in-place update)
- Use PaymentDetailsModal for new slip management
- Old payment confirmation modal still works but is deprecated
- Gradually migrate to new system by using PaymentDetailsModal instead

## Admin Payment Management Features

### PAYMENT_ADJUSTMENT_FLOW Progress

#### ✅ Task #1: Admin Approve/Reject Additional Payment (Completed)
- Admin สามารถอนุมัติ/ปฏิเสธสลิป additional payment ได้
- ระบบจะอัพเดท `eventRegistrations.additionalPayments` อัตโนมัติ
- Sync ข้อมูลระหว่าง `paymentSlips` collection และ `eventRegistrations`
- เก็บประวัติสลิปที่อนุมัติและปฏิเสธ

#### ✅ Task #2: Admin Upload Slip on Behalf of User (Completed - 2026-07-13)
Admin สามารถอัพโหลดสลิปแทนผู้ใช้ได้ผ่าน Payment Confirmation Modal

**Features:**
- **API Endpoint**: `/api/admin/payments/upload-for-user`
  - รับไฟล์แบบ base64
  - อัพโหลดไปที่ Firebase Storage: `payment-slips/{eventId}/{registrationId}/{timestamp}.ext`
  - สร้าง paymentSlip record พร้อมสถานะ "pending"
  - บันทึก admin action log ใน Firestore
  - ตรวจสอบสิทธิ์ admin เท่านั้น

- **Enhanced UI**:
  - พื้นที่อัพโหลดไฟล์แบบ drag-and-drop style
  - แสดงตัวอย่างไฟล์ที่เลือก (ชื่อไฟล์, ขนาด)
  - ปุ่มลบไฟล์
  - รองรับไฟล์: JPG, PNG, PDF (สูงสุด 5MB)
  - ตัวเลือกกรอก URL โดยตรง (สำหรับไฟล์ที่อัพโหลดไว้แล้ว)
  - แสดงสถานะการอัพโหลดแบบ real-time

- **วิธีใช้**:
  1. Admin เปิด Payment Confirmation Modal
  2. เลือกวิธีใดวิธีหนึ่ง:
     - คลิกพื้นที่อัพโหลด → เลือกไฟล์ → ดูตัวอย่าง
     - พิมพ์ URL ของสลิปที่อัพโหลดไว้แล้ว
  3. กด "✓ ยืนยันการชำระ"
  4. ระบบจะอัพโหลดไฟล์อัตโนมัติก่อนบันทึกการชำระเงิน

- **Security & Audit**:
  - ตรวจสอบ admin role (return 403 if not admin)
  - File metadata ระบุข้อมูล admin
  - Log การกระทำใน `adminLogs` collection:
    ```typescript
    {
      action: 'upload_payment_slip_for_user',
      adminId: string,
      adminEmail: string,
      registrationId: string,
      eventId: string,
      slipId: string,
      paymentType: PaymentType,
      amount: number,
      timestamp: ISO string
    }
    ```

**Files Modified:**
- `src/app/api/admin/payments/upload-for-user/route.ts` (new)
- `src/app/admin/events/[eventId]/page.tsx` (enhanced payment modal)

#### ⏳ Task #3: Admin Cancel Approved Slips (Pending)
Admin สามารถยกเลิกสลิปที่อนุมัติแล้วได้ (กรณีคืนเงิน)

**Planned Features:**
- ยกเลิกสลิปที่อนุมัติไปแล้ว
- ระบุเหตุผลการคืนเงิน
- Revert การอัพเดทใน eventRegistrations
- บันทึก audit log

#### ⏳ Task #4: Admin Force Status Override (Pending)
Admin สามารถเปลี่ยนสถานะการชำระเงินได้โดยไม่ต้องมีสลิป

**Planned Features:**
- เปลี่ยนสถานะเป็น "ชำระครบ" โดยไม่ต้องมีสลิป
- ระบุเหตุผล (เช่น "ชำระด้วยเงินสด", "ยกเว้นค่าธรรมเนียม")
- บันทึก audit log พร้อมเหตุผล
- UI สำหรับ override status

## Future Enhancements

- [ ] Bulk approve/reject
- [ ] Email notifications on approve/reject
- [ ] Payment receipt generation
- [ ] Export payment history to Excel
- [ ] Payment analytics dashboard
