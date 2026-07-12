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

- Legacy slip URLs (`depositSlipUrl`, `remainingSlipUrl`) are still kept for backward compatibility
- Use PaymentDetailsModal for new slip management
- Old payment confirmation modal still works but is deprecated
- Gradually migrate to new system by using PaymentDetailsModal instead

## Future Enhancements

- [ ] Bulk approve/reject
- [ ] Email notifications on approve/reject
- [ ] Payment receipt generation
- [ ] Export payment history to Excel
- [ ] Payment analytics dashboard
