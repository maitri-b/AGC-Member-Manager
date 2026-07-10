# GAS Payment Slip Upload System - Deployment Guide

## 📋 System Overview

ระบบอัพโหลดสลิปการชำระเงินผ่าน Google Apps Script (GAS) สำหรับ Agents Club Member Manager

**คุณสมบัติหลัก:**
- รองรับ 3 รูปแบบการชำระเงิน: Full Payment, Deposit (มัดจำ), Remaining (ยอดคงเหลือ)
- อัพโหลดสลิปไปเก็บใน Google Drive
- บันทึกข้อมูลลงใน Google Sheets โดยอัตโนมัติ
- ตรวจสอบ ownership ผ่าน LINE User ID
- รองรับ Dynamic Event Mapping

---

## 🏗️ System Architecture

```
┌─────────────────┐
│  Vercel App     │
│  (Frontend)     │
└────────┬────────┘
         │
         │ Opens popup with parameters
         │ (registrationId, eventId, lineUserId, paymentType)
         ↓
┌─────────────────┐
│  GAS Web App    │
│  (UploadForm)   │
└────────┬────────┘
         │
         │ Upload file + form data
         ↓
┌─────────────────┐
│  Google Drive   │  ← File storage
└─────────────────┘
         │
         │ Return file URL
         ↓
┌─────────────────┐
│  Google Sheets  │  ← Data storage
└─────────────────┘
```

---

## 📁 File Structure

```
gas-upload-slip/
├── Code.gs               # Main backend logic
├── UploadForm.html       # Frontend upload form
├── AuthTest.gs           # Authentication testing
├── Debug.gs              # Debug utilities
├── SyncTest.gs           # Event mapping sync testing
├── appsscript.json       # GAS project configuration
├── .clasp.json           # clasp configuration
├── AUTO_SYNC_GUIDE.md    # Event mapping sync guide
├── INTEGRATION_GUIDE.md  # Integration documentation
├── README.md             # Project overview
└── GAS_DEPLOYMENT_GUIDE.md # This file
```

---

## 🔑 Key Components

### 1. Code.gs

**Main Functions:**

- `doGet(e)` - Handles GET requests, displays upload form
- `doPost(e)` - Handles POST requests for event mapping sync
- `processForm(formObject)` - Processes uploaded slip
- `findRegistration(registrationId, eventId)` - Finds registration in Google Sheet
- `updateRegistrationSlip(registrationId, eventId, paymentType, fileUrl)` - Updates Google Sheet
- `getEventMappings()` - Gets event ID to sheet name mappings
- `saveEventMapping(eventId, sheetName)` - Saves new event mapping

**Important Configuration:**

```javascript
const CONFIG = {
  SHEET_ID: '1pVx91b0tA6IHIfKTvGq6ywYYzkNe1HPkGh7rSiHlmb0',
  DRIVE_FOLDER_ID: '17PF4Za5QPcxtZFUuHi2FgQOT7yFocu1i',
  get EVENT_SHEETS() {
    return getEventMappings(); // Dynamic from Properties Service
  }
};
```

### 2. UploadForm.html

**Template Variables:**
- `registrationId` - Registration ID
- `eventId` - Event ID
- `paymentType` - Payment type (full/deposit/remaining)
- `registration` - Registration data object
- `amount` - Amount to pay

**Display Logic:**
```html
<?= paymentType === 'deposit'
    ? 'งวดที่ 1: ชำระมัดจำ'
    : (paymentType === 'remaining'
        ? 'งวดที่ 2: ชำระยอดคงเหลือ'
        : 'ชำระเต็มจำนวน')
?>
```

---

## 💳 Payment Types & Google Sheet Columns

### Payment Type: `full` (ชำระเต็มจำนวน)
**Updates:**
- `slip_url` → URL ของไฟล์ที่อัพโหลด
- `payment_status` → "รอตรวจสอบ"

### Payment Type: `deposit` (มัดจำ)
**Updates:**
- `deposit_slip_url` → URL ของไฟล์ที่อัพโหลด
- `deposit_paid_date` → วันที่ปัจจุบัน (YYYY-MM-DD)
- `payment_status` → "รอตรวจสอบมัดจำ"

### Payment Type: `remaining` (ยอดคงเหลือ)
**Updates:**
- `remaining_slip_url` → URL ของไฟล์ที่อัพโหลด
- `remaining_paid_date` → วันที่ปัจจุบัน (YYYY-MM-DD)
- `payment_status` → "รอตรวจสอบยอดคงเหลือ"

**See:** `GOOGLE_SHEET_STRUCTURE.md` for complete column reference

---

## 🚀 Deployment Process

### ⚠️ CRITICAL: How to Deploy WITHOUT Changing URL

**❌ WRONG WAY (URL changes every time):**
```bash
clasp deploy  # Creates new versioned deployment with new URL
```

**✅ CORRECT WAY (URL stays the same):**

#### Step 1: Push Code Only
```bash
cd gas-upload-slip
clasp push --force
```

#### Step 2: Update Web App Deployment (via UI)
1. Open Google Apps Script Editor:
   - https://script.google.com/home/projects/1U7JqO-OaO972n_bH1LtwF_lez06XjAh0RXRmq9feLOZ5UrkexVkPGahG/edit

2. Click **Deploy** → **Manage deployments**

3. Click **Edit** (pencil icon) on the **Web app** deployment

4. Under **Version**, select:
   - **"New version"** - Creates new version but keeps same URL
   - **"HEAD"** - Always uses latest code (recommended for development)

5. Click **Deploy**

6. ✅ URL remains the same! No need to update Vercel environment variables

---

## 🔗 Current Configuration

### GAS Web App URL
```
https://script.google.com/macros/s/AKfycbwSJuKyQqxxvriNYt32jea-lLc9S455l5Al44JRPdqzs0CMFlANPFE-gXet3KQmlWCW3w/exec
```

### Vercel Environment Variable
```
NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL=https://script.google.com/macros/s/AKfycbwSJuKyQqxxvriNYt32jea-lLc9S455l5Al44JRPdqzs0CMFlANPFE-gXet3KQmlWCW3w/exec
```

### Local Environment
Location: `.env.local` (line 54)
```env
NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL=https://script.google.com/macros/s/AKfycbwSJuKyQqxxvriNYt32jea-lLc9S455l5Al44JRPdqzs0CMFlANPFE-gXet3KQmlWCW3w/exec
```

### Constants File
Location: `src/lib/constants.ts` (line 6-7)
```typescript
export const GAS_UPLOAD_SLIP_URL = process.env.NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL ||
  'https://script.google.com/macros/s/AKfycbwSJuKyQqxxvriNYt32jea-lLc9S455l5Al44JRPdqzs0CMFlANPFE-gXet3KQmlWCW3w/exec';
```

---

## 🔄 Frontend Integration

### Event Detail Page
Location: `src/app/events/[eventId]/page.tsx`

**Payment Type Determination Logic:**
```typescript
let paymentType: 'deposit' | 'remaining' | 'full' = 'full';

if (event.paymentMode === 'deposit') {
  // Deposit mode: Check if deposit already paid
  if (userRegistration.depositPaid && userRegistration.remainingAmount > 0) {
    paymentType = 'remaining';
  } else {
    paymentType = 'deposit';
  }
} else {
  // Full payment mode (or undefined = default to full)
  paymentType = 'full';
}
```

**URL Construction:**
```typescript
const url = new URL(event.paymentSlipSubmissionUrl);
url.searchParams.append('registrationId', userRegistration.registrationId);
url.searchParams.append('eventId', event.eventId);
url.searchParams.append('lineUserId', session?.user?.id || '');
url.searchParams.append('paymentType', paymentType);

// Open in popup window
window.open(url.toString(), 'payment-slip', 'width=600,height=800');
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "ReferenceError: out is not defined"

**Cause:** Using `out.print()` in GAS template (not supported)

**Solution:** Use `<?= expression ?>` syntax instead
```html
<!-- ❌ Wrong -->
<? out.print('text'); ?>

<!-- ✅ Correct -->
<?= 'text' ?>
```

### Issue 2: URL Changes After Every Deploy

**Cause:** Using `clasp deploy` instead of updating existing Web App deployment

**Solution:** Follow correct deployment process (see Deployment Process section)

### Issue 3: Wrong Payment Type Displayed

**Cause:** Payment type not validated against `event.paymentMode`

**Solution:** Check `event.paymentMode` before determining `paymentType` (see Frontend Integration section)

### Issue 4: Vercel Shows Old URL

**Cause:** Environment variable not updated or deployment not restarted

**Solution:**
1. Update `NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL` in Vercel Dashboard
2. Trigger redeploy
3. Verify in browser console that correct URL is used

---

## 📊 Event Mapping System

### How It Works
- Event ID → Sheet Name mappings stored in **Script Properties**
- Vercel app can sync mappings via `/api/admin/sync-events-to-gas`
- GAS reads mappings dynamically on each request

### Sync Process
```typescript
// Vercel sends POST to GAS Web App URL
fetch(GAS_URL, {
  method: 'POST',
  body: JSON.stringify({
    action: 'sync_event',
    eventId: 'event-slug',
    sheetName: 'Sheet Name'
  })
});
```

### Manual Mapping (Fallback)
If sync fails, update manually in `Code.gs`:
```javascript
// Default mappings (fallback)
return {
  '10yearth-meeting-2026': '10 Yearth Meeting',
  '🎉-งานแรลลี่-10th-anniversary-agents-club-2026': 'Rally2026',
};
```

---

## 🔐 Security Considerations

1. **Ownership Verification:**
   - Compares `lineUserId` from URL parameter with `LINE_userID` in Google Sheet
   - Only allows upload if they match

2. **File Validation:**
   - Max file size: 5MB
   - Accepted types: `image/*`, `application/pdf`

3. **Authorization:**
   - Web App must be deployed with **"Anyone"** access (required for popup to work)
   - Security enforced by ownership check, not deployment access level

---

## 🧪 Testing Checklist

### Before Deployment
- [ ] Code passes `clasp push` without errors
- [ ] Test with full payment event
- [ ] Test with deposit payment event (first payment)
- [ ] Test with deposit payment event (second payment)
- [ ] Verify Google Sheet columns are updated correctly
- [ ] Verify file uploads to Google Drive
- [ ] Check browser console for errors

### After Deployment
- [ ] URL remains unchanged
- [ ] Popup opens correctly from Vercel app
- [ ] Upload form displays correct payment type
- [ ] File upload succeeds
- [ ] Google Sheet updates with correct data
- [ ] `payment_status` column shows correct status

---

## 📚 Related Documentation

- [GOOGLE_SHEET_STRUCTURE.md](../GOOGLE_SHEET_STRUCTURE.md) - Sheet column reference
- [AUTO_SYNC_GUIDE.md](AUTO_SYNC_GUIDE.md) - Event mapping sync guide
- [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) - Integration with Vercel app
- [README.md](README.md) - Project overview

---

## 🔧 Maintenance Tasks

### Adding New Event
1. Create sheet in Google Sheets with proper columns
2. Trigger sync from Vercel admin panel: `/admin/events` → "Sync Events to GAS"
3. Verify mapping in GAS Properties Service

### Updating Display Text
Edit `UploadForm.html` line 166:
```html
<?= paymentType === 'deposit'
    ? 'งวดที่ 1: ชำระมัดจำ'
    : (paymentType === 'remaining'
        ? 'งวดที่ 2: ชำระยอดคงเหลือ'
        : 'ชำระเต็มจำนวน')
?>
```

### Changing Google Drive Folder
Update `CONFIG.DRIVE_FOLDER_ID` in `Code.gs`:
```javascript
const CONFIG = {
  DRIVE_FOLDER_ID: 'NEW_FOLDER_ID_HERE',
  // ...
};
```

---

## 💡 Tips & Best Practices

1. **Always use `clasp push --force`** to ensure all files are uploaded
2. **Never use `clasp deploy`** for routine updates
3. **Use "New version" in Web App deployment** to keep URL stable
4. **Test locally first** before deploying to production
5. **Check browser console** for debugging information
6. **Monitor Google Apps Script Executions** for errors
7. **Keep Vercel env vars in sync** with actual GAS URL

---

## 📝 Version History

### Version @23 (Current)
- Fixed GAS template syntax for payment type display
- Support for all 3 payment types (full/deposit/remaining)
- Correct status updates in Google Sheets

### Version @22
- Attempted fix with `out.print()` (failed - syntax error)

### Version @21
- Initial implementation of payment type validation
- Added payment type parameter to URL

---

## 👨‍💻 Developer Notes

**Created:** 2026-07-10
**Last Updated:** 2026-07-10
**GAS Project ID:** 1U7JqO-OaO972n_bH1LtwF_lez06XjAh0RXRmq9feLOZ5UrkexVkPGahG
**Current Deployment:** @23

**Key Learnings:**
- GAS templates use `<?= ?>` syntax, not `out.print()`
- `clasp deploy` creates new versioned deployments with new URLs
- Web App deployments must be updated via UI to keep URL stable
- Payment type validation must happen before URL construction
- Always validate against `event.paymentMode` to determine correct `paymentType`
