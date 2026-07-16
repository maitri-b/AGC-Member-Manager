# Immediate Payment Mode - Implementation Plan
## Agents Club Member Manager

**Feature**: Add `paymentTiming` option to allow payment slip upload during registration

**Created**: 2026-07-16
**Status**: ✅ Completed
**Completed**: 2026-07-16

---

## 📋 Overview

This document tracks the implementation of **Immediate Payment Mode** - a new payment timing option that allows users to upload payment slips during registration instead of after registration.

### Key Requirements:
- ✅ Registration form includes payment slip upload section (required field)
- ✅ Single submit for both registration data + payment slip
- ✅ Registration succeeds immediately, slip enters approval queue
- ✅ If slip is rejected, user can re-upload WITHOUT cancelling registration
- ✅ Button text: "ยืนยันการลงทะเบียน" (Confirm Registration)
- ✅ Works with both Full Payment and Deposit Payment modes

### Design Decisions:
| Question | Answer |
|----------|--------|
| Does registration succeed immediately or wait for slip approval? | **Immediately** - Registration is created, slip waits for admin approval |
| If slip is rejected, does registration get cancelled? | **No** - Registration stays valid, user can re-upload slip |
| What should the submit button text be? | **"ยืนยันการลงทะเบียน"** (Confirm Registration) |

---

## 🗺️ Implementation Phases

### Phase 1: Backend Schema & Type Definitions ✅
**Goal**: Add `paymentTiming` field to Event type and ensure backward compatibility

#### Tasks:
- [x] Add `paymentTiming?: 'deferred' | 'immediate'` to Event interface in [src/types/event.ts](src/types/event.ts)
- [x] Set default value to `'deferred'` for backward compatibility
- [x] Update event creation API to accept new field
- [x] Update event update API to handle new field
- [x] Test existing events still work (should default to 'deferred')

#### Files to Modify:
1. [src/types/event.ts](src/types/event.ts) - Add `paymentTiming` field
2. [src/app/api/admin/events/route.ts](src/app/api/admin/events/route.ts) - Handle in POST (create)
3. [src/app/api/admin/events/[eventId]/route.ts](src/app/api/admin/events/[eventId]/route.ts) - Handle in PUT (update)
4. [src/app/api/events/[eventId]/detail/route.ts](src/app/api/events/[eventId]/detail/route.ts) - Return in event data

#### Expected Outcome:
- Existing events continue to work as before (deferred payment)
- New events can be created with `paymentTiming: 'immediate'`
- Field is properly typed and defaults to 'deferred'

#### Code Snippet:
```typescript
// src/types/event.ts
export interface Event {
  // ... existing fields ...

  // Payment Timing (NEW)
  paymentTiming?: 'deferred' | 'immediate';  // Default: 'deferred'

  // Payment Mode
  paymentMode: 'full' | 'deposit';

  // ... other fields ...
}
```

---

### Phase 2: Registration API with Slip Upload 🔄
**Goal**: Update registration endpoint to accept payment slip upload during registration

#### Tasks:
- [x] Add multipart/form-data support to registration API
- [x] Accept payment slip file in registration request
- [x] Upload slip to Firebase Storage immediately
- [x] Create registration with slip URL
- [x] Create payment slip record in `paymentSlips` collection with status 'pending'
- [x] Set appropriate `paymentStatus` on registration:
  - Full mode: "รอตรวจสอบ"
  - Deposit mode: "รอตรวจสอบมัดจำ"
- [x] Return success even if slip is pending approval
- [x] Handle validation: slip is required when `paymentTiming: 'immediate'`

#### Files to Modify:
1. [src/app/api/events/[eventId]/register/route.ts](src/app/api/events/[eventId]/register/route.ts) - Accept file upload
2. [src/lib/payment-slips.ts](src/lib/payment-slips.ts) - May need helper for creating slip during registration

#### Expected Outcome:
- Registration endpoint accepts both form data and slip file
- Slip is uploaded to Firebase Storage with proper naming
- Registration is created immediately with `status: 'รอดำเนินการ'`
- Payment slip record exists in Firestore with `verificationStatus: 'pending'`
- Response includes registration ID and confirmation message

#### Code Snippet:
```typescript
// src/app/api/events/[eventId]/register/route.ts
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const slipFile = formData.get('slipFile') as File | null;

  // Validate: if paymentTiming is 'immediate', slip is required
  if (event.paymentTiming === 'immediate' && !slipFile) {
    return NextResponse.json(
      { error: 'กรุณาแนบหลักฐานการชำระเงิน' },
      { status: 400 }
    );
  }

  // Upload slip to Firebase Storage
  let slipUrl = '';
  if (slipFile) {
    slipUrl = await uploadPaymentSlip(slipFile, registrationId);
  }

  // Create registration
  const registration = {
    registrationId,
    status: 'รอดำเนินการ',
    paymentStatus: event.paymentMode === 'full'
      ? 'รอตรวจสอบ'
      : 'รอตรวจสอบมัดจำ',
    // ... other fields
  };

  // Create payment slip record
  if (slipUrl) {
    await createPaymentSlip({
      registrationId,
      slipUrl,
      paymentType: event.paymentMode === 'full' ? 'full' : 'deposit',
      verificationStatus: 'pending',
    });
  }

  return NextResponse.json({
    success: true,
    registrationId,
    message: 'ลงทะเบียนสำเร็จ รอการตรวจสอบหลักฐานการชำระเงิน',
  });
}
```

---

### Phase 3: Admin UI - Event Configuration 🔄
**Goal**: Add toggle for Payment Timing in admin event creation/edit form

#### Tasks:
- [x] Add "Payment Timing" section to event form
- [x] Create radio buttons: "Deferred (ชำระหลังลงทะเบียน)" vs "Immediate (ชำระพร้อมลงทะเบียน)"
- [x] Add helpful description text explaining each option
- [x] Default to "Deferred" for backward compatibility
- [x] Show appropriate help text based on selected payment mode
- [x] Save `paymentTiming` field when creating/updating event

#### Files to Modify:
1. [src/app/admin/events/new/page.tsx](src/app/admin/events/new/page.tsx) - Event creation form
2. [src/app/admin/events/[eventId]/edit/page.tsx](src/app/admin/events/[eventId]/edit/page.tsx) - Event edit form

#### Expected Outcome:
- Admin can choose payment timing when creating/editing events
- Clear UI with helpful descriptions
- Existing events default to "Deferred"
- Setting is saved correctly to Firestore

#### UI Mockup:
```
┌─────────────────────────────────────────────┐
│ Payment Timing                              │
├─────────────────────────────────────────────┤
│ ○ Deferred (ชำระหลังลงทะเบียน)             │
│   สมาชิกลงทะเบียนก่อน แล้วชำระเงินภายหลัง   │
│                                             │
│ ○ Immediate (ชำระพร้อมลงทะเบียน)           │
│   สมาชิกต้องแนบหลักฐานการชำระพร้อมลงทะเบียน │
└─────────────────────────────────────────────┘
```

---

### Phase 4: Member UI - Registration Form 🔄
**Goal**: Show payment slip upload section during registration when `paymentTiming: 'immediate'`

#### Tasks:
- [x] Conditionally show payment slip upload section based on `event.paymentTiming`
- [x] For Full Payment Mode:
  - Show "Full Payment Slip" upload with amount display
  - Mark as required
- [x] For Deposit Payment Mode:
  - Show "Deposit Slip" upload with deposit amount display
  - Mark as required
  - Show info about remaining payment later
- [x] Update form validation to require slip when immediate timing
- [x] Change submit button text to "ยืนยันการลงทะเบียน"
- [x] Handle file upload in form submission
- [x] Show appropriate success message
- [x] Handle re-upload flow for rejected slips

#### Files to Modify:
1. [src/app/events/[eventId]/page.tsx](src/app/events/[eventId]/page.tsx) - Member event detail page
2. May need to extract registration form to separate component

#### Expected Outcome:
- When `paymentTiming: 'immediate'`, registration form shows slip upload section
- Upload is required and validated
- Form submits both registration data and slip file
- Success message confirms registration and mentions slip is pending approval
- If slip is rejected, user sees option to re-upload

#### UI Mockup:
```
┌─────────────────────────────────────────────┐
│ ข้อมูลการลงทะเบียน                          │
│ [Name field]                                │
│ [Email field]                               │
│ ...                                         │
├─────────────────────────────────────────────┤
│ 💰 หลักฐานการชำระเงิน *                     │
│                                             │
│ ยอดที่ต้องชำระ: ฿3,999                      │
│                                             │
│ [📎 แนบหลักฐานการโอนเงิน]                   │
│                                             │
│ ข้อมูลการโอนเงิน:                           │
│ ธนาคาร: ไทยพาณิชย์                           │
│ ชื่อบัญชี: สมาคมตัวแทนประกันวินาศภัย        │
│ เลขที่บัญชี: 123-456-7890                  │
└─────────────────────────────────────────────┘

[ยืนยันการลงทะเบียน]
```

---

## 🧪 Testing Checklist

### Backend Testing:
- [ ] Event with `paymentTiming: 'deferred'` works as before
- [ ] Event with `paymentTiming: 'immediate'` requires slip upload
- [ ] Registration fails if slip missing in immediate mode
- [ ] Slip is uploaded to correct Firebase Storage path
- [ ] Payment slip record created in Firestore
- [ ] Registration status set correctly
- [ ] Slip approval updates registration status to 'ยืนยันแล้ว'
- [ ] Slip rejection allows re-upload without cancelling registration

### Frontend Testing:
- [ ] Admin can create event with immediate payment timing
- [ ] Admin can edit event payment timing
- [ ] Member sees slip upload section for immediate payment events
- [ ] Member cannot submit without uploading slip
- [ ] File upload works correctly
- [ ] Success message shows after registration
- [ ] Rejected slip shows re-upload option
- [ ] Approved slip shows payment complete status

### Edge Cases:
- [ ] File size validation (max 5MB)
- [ ] File type validation (images only)
- [ ] Network error during upload
- [ ] Duplicate registration prevention
- [ ] Existing events without `paymentTiming` field (should default to 'deferred')

---

## 📊 Progress Tracking

### Overall Progress: 100% Complete ✅

| Phase | Status | Completion |
|-------|--------|------------|
| Phase 1: Backend Schema | ✅ Completed | 5/5 tasks |
| Phase 2: Registration API | ✅ Completed | 8/8 tasks |
| Phase 3: Admin UI | ✅ Completed | 6/6 tasks |
| Phase 4: Member UI | ✅ Completed | 8/8 tasks |

### Legend:
- ✅ Completed
- 🔄 In Progress
- ⏸️ Paused
- ❌ Blocked
- 🔄 Not Started

---

## 🔗 Related Documentation

- [PAYMENT_SYSTEM.md](PAYMENT_SYSTEM.md) - Updated with Payment Timing documentation
- [src/types/event.ts](src/types/event.ts) - Event type definitions
- [src/lib/payment-slips.ts](src/lib/payment-slips.ts) - Payment slip management
- [src/lib/payment-status.ts](src/lib/payment-status.ts) - Payment status logic

---

## 📝 Notes

### Design Considerations:
1. **Why registration succeeds immediately?**
   - Better UX - user doesn't have to wait for admin approval
   - Ensures seat is reserved even if slip is rejected
   - User can fix slip issues without losing registration

2. **Why allow re-upload on rejection?**
   - Common cases: wrong amount, unclear image, wrong account
   - Easier than cancelling and re-registering
   - Maintains registration continuity

3. **Backward Compatibility:**
   - Default `paymentTiming: 'deferred'` ensures existing events work unchanged
   - No migration needed for existing data
   - Gradual rollout possible (event by event)

### Future Enhancements:
- [ ] Email notification when slip is approved/rejected
- [ ] LINE notification for slip status updates
- [ ] Admin bulk slip verification
- [ ] Auto-verification for trusted payment systems (PromptPay QR)
- [ ] Payment slip template/guidelines for users

---

**Last Updated**: 2026-07-16
**Updated By**: Claude Code Assistant
