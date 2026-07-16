# Room Fee Calculation Fix

**Date**: 2026-07-16
**Status**: ✅ Fixed and Committed
**Commit**: 28bef347eb995c750db19ce0d6c79778dc139311

---

## 🐛 Problem

Room allocation fees were **not being included correctly** in event registration totals:

### Bug Symptoms:
1. **Frontend showed correct preview**: Room fees were calculated and displayed in the UI
2. **Backend saved incorrect data**: After clicking "confirm registration", room fees were missing or incorrect
3. **Only eventFee was saved**: The `totalAmount` did not include room fees

### Root Cause:

The room fee calculation code was **nested inside the Attendee Type Pricing block only**:

```typescript
if (eventData.useAttendeeTypePricing && eventData.attendeeTypes) {
  // Calculate attendee type fees
  totalFee = ...;

  // Room fees ONLY calculated here! ❌
  if (eventData.roomTypes && roomAllocations) {
    roomFee = ...;
    totalFee += roomFee;
  }
} else {
  // Fixed/Tiered pricing
  totalFee = calculateRegistrationFee(...);
  // NO ROOM FEE CALCULATION! ❌
}
```

**Impact**:
- ✅ **Attendee Type Pricing**: Room fees were calculated but saved incorrectly (added to `eventFee` instead of separate `roomFee`)
- ❌ **Fixed/Tiered Pricing**: Room fees were **not calculated at all**

---

## ✅ Solution

### Code Changes

**1. Separated fee variables** in [src/app/api/events/[eventId]/register/route.ts](src/app/api/events/[eventId]/register/route.ts:231-280):

```typescript
// Before (WRONG):
let totalFee = 0;
// Room fees were mixed with eventFee

// After (CORRECT):
let eventFee = 0;   // Registration fee only
let roomFee = 0;    // Room allocation fee only
let totalFee = 0;   // Sum of both
```

**2. Moved room calculation outside pricing block**:

```typescript
// Calculate event fee first (attendee types OR fixed/tiered)
if (eventData.useAttendeeTypePricing && eventData.attendeeTypes) {
  eventFee = calculateFromAttendeeTypes();
} else {
  eventFee = calculateRegistrationFee(...);
}

// Calculate room fees (works for ALL pricing types) ✅
if (eventData.roomTypes && roomAllocations) {
  for (const alloc of roomAllocations) {
    const roomType = eventData.roomTypes.find(...);
    roomFee += roomType.price * alloc.roomCount;
  }
}

// Calculate total
totalFee = eventFee + roomFee;
```

**3. Updated EventRegistration interface** in [src/types/event.ts](src/types/event.ts:35-38):

```typescript
// Payment fields
eventFee: number;      // event_fee (registration only)
roomFee?: number;      // room_fee (NEW - room allocation)
shirtFee: number;      // shirt_fee
totalAmount: number;   // total_amount (sum of all)
```

**4. Updated SHEET_COLUMN_MAPPING** in [src/types/event.ts](src/types/event.ts:405-407):

```typescript
eventFee: 'event_fee',
roomFee: 'room_fee',    // NEW mapping
shirtFee: 'shirt_fee',
```

---

## 🔄 Migration for Existing Data

### Why Migration is Needed

Existing registrations created **before this fix** may have:
- Missing `roomFee` field
- Incorrect `eventFee` (includes room fees)
- Correct `totalAmount` (but not broken down properly)

### How to Run Migration

A migration script has been created: [scripts/migrate-room-fees.js](scripts/migrate-room-fees.js)

**Run the migration:**

```bash
node scripts/migrate-room-fees.js
```

**What it does:**
1. ✅ Finds all registrations with `roomAllocations`
2. ✅ Recalculates `roomFee` from room type pricing
3. ✅ Separates `eventFee` and `roomFee`
4. ✅ Ensures `totalAmount = eventFee + roomFee`
5. ✅ Skips registrations without room allocations
6. ✅ Skips already migrated registrations

**Safety:**
- Read-only check first (shows what will be updated)
- Updates only registrations that need fixing
- Adds `migrationNote` field with timestamp
- Reports errors without stopping migration

---

## 🧪 Testing

### Test Cases

After the fix, verify:

1. **New registrations work correctly**:
   - [ ] Registration with room allocation saves correct `roomFee`
   - [ ] `totalAmount = eventFee + roomFee`
   - [ ] Works with Attendee Type Pricing
   - [ ] Works with Fixed/Tiered Pricing

2. **Existing registrations (after migration)**:
   - [ ] `roomFee` field exists and is correct
   - [ ] `eventFee` only contains registration fee
   - [ ] `totalAmount` is unchanged (sum is correct)

### Manual Test

1. Create a test event with room types
2. Register with room allocation
3. Check Firestore data:
   ```javascript
   {
     eventFee: 3000,      // Event registration fee
     roomFee: 999,        // Room allocation fee
     shirtFee: 0,
     totalAmount: 3999    // 3000 + 999
   }
   ```

---

## 📝 Files Changed

| File | Changes |
|------|---------|
| [src/app/api/events/[eventId]/register/route.ts](src/app/api/events/[eventId]/register/route.ts) | Fixed room fee calculation logic |
| [src/types/event.ts](src/types/event.ts) | Added `roomFee` field to EventRegistration |
| [scripts/migrate-room-fees.js](scripts/migrate-room-fees.js) | Migration script for existing data |

---

## 🎯 Impact

### Before Fix:
- ❌ Room fees not saved for Fixed/Tiered pricing events
- ❌ Room fees mixed with event fees for Attendee Type pricing
- ❌ Incorrect fee breakdown in admin reports
- ❌ Events with room allocation added later had calculation issues

### After Fix:
- ✅ Room fees correctly calculated for ALL pricing types
- ✅ Clean separation of `eventFee` and `roomFee`
- ✅ Accurate fee breakdown for reporting
- ✅ Works whether room types are added during event creation or later

---

## 💡 Context

This issue was discovered when:
> User reported: "ตอนเลือกประเภทห้องพัก แล้วระบบ preview คำนวณค่าห้องพักที่ต้องชำระให้ดู และคำรวณยอดรวมให้ แต่พอกดยืนยัน ทำไมไม่มียอดจากประเภทห้องพักมารวมด้วย ทำไมมีแต่ค่า eventfee"
>
> Translation: "When selecting room types, the system preview shows room fees and total. But after confirming, why doesn't the room fee get included? Why is there only the eventfee?"

User also mentioned:
> "กิจกรรมนี้ เดิมทีไม่ได้มีเรื่อง Room allocation ตอนสร้างเสร็จ แต่เพิ่งมาปรับเปลี่ยนให้มีทีหลัง"
>
> Translation: "This event originally didn't have Room allocation when created, but it was added later."

This helped identify that the bug affected events regardless of when room types were configured.

---

**Last Updated**: 2026-07-16
**Updated By**: Claude Code Assistant
