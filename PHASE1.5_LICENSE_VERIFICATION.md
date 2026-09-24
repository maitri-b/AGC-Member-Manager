# 🔍 Phase 1.5: License Verification Integration

**เริ่มต้น:** (หลัง Phase 1 เสร็จ)
**เป้าหมาย:** นำระบบตรวจสอบใบอนุญาตจาก Python script มารวมในระบบ Next.js
**Status:** 🟡 Waiting for Phase 1

---

## 📊 สถานะโดยรวม

- **ความคืบหน้า:** 0% (0/6 steps completed)
- **Prerequisites:** Phase 1 Migration ต้องเสร็จก่อน ✅
- **Last Updated:** 2025-01-XX

---

## 🎯 Overview

### ปัจจุบัน (Python Script)
```
Python Script (AgentTour_CheckMember_v2.py)
├─ อ่านข้อมูลจาก Google Sheets
├─ ใช้ Selenium scrape เว็บ DOT
├─ ดึงข้อมูล: ชื่อบริษัท, สถานะ, วันหมดอายุ
└─ เขียนกลับ Google Sheets (Column Q, R, S, T)

❌ ต้องรันแยก
❌ ไม่อัพเดท Firestore
❌ Manual process
```

### เป้าหมาย (Phase 1.5)
```
Next.js API + Puppeteer
├─ Admin กดปุ่มตรวจสอบใบอนุญาต
├─ Scrape เว็บ DOT (เหมือน Python)
├─ อัพเดททั้ง Google Sheets และ Firestore
└─ Auto-verify หลังอนุมัติสมาชิกใหม่ (optional)

✅ รวมในระบบเดียว
✅ อัพเดท Firestore realtime
✅ Click เดียวได้เลย
```

---

## 🏗️ Architecture

### Data Flow

```
Admin clicks "Verify License" button
         ↓
POST /api/admin/verify-license
         ↓
lib/dot-scraper.ts (Puppeteer)
         ↓
Scrape DOT Website
https://esvcs.dot.go.th/e-service/LicenseInformationPage
         ↓
Extract: companyName, status, expiryDate
         ↓
Update Google Sheets (Column Q, R, S, T)
         ↓
Update Firestore members/{memberId}
         ↓
Return results to Admin UI
```

### DOT Website Structure

**URL:** `https://esvcs.dot.go.th/e-service/LicenseInformationPage`

**Scraping Steps:**
1. Input license number in `#Search`
2. Click search button
3. Wait 3 seconds
4. Click company name link (`a[href*="TourbusinessDetail"]`)
5. Wait 2 seconds
6. Extract from `<dd class="text-gray-700">`:
   - `allDD[2]` = วันหมดอายุ (Thai format: "15 มีนาคม 2569")
   - `allDD[3]` = สถานะ (e.g., "ปกติ")
7. Convert Thai date to mm/dd/yyyy (Christian Era)

---

## 📝 Implementation Checklist

### ✅ Step 1: Setup Puppeteer
**Dependencies & Configuration**

- [ ] Install Puppeteer: `npm install puppeteer`
- [ ] Install types: `npm install -D @types/puppeteer`
- [ ] Test Puppeteer locally
- [ ] Configure for Vercel deployment
  - [ ] Add `@vercel/node` for serverless
  - [ ] Update `vercel.json` if needed
  - [ ] Test on Vercel (Puppeteer requires special config)

**Completion Date:** ___________
**Notes:**

**Vercel Puppeteer Configuration:**
```json
// vercel.json
{
  "functions": {
    "api/admin/verify-license.ts": {
      "memory": 1024,
      "maxDuration": 60
    }
  }
}
```

---

### ✅ Step 2: Create DOT Scraper Library
**File:** `src/lib/dot-scraper.ts`

- [ ] Create `checkLicenseWithDOT(licenseNumber)` function
- [ ] Implement Puppeteer scraping logic
- [ ] Add date conversion function `convertThaiDateToMMDDYYYY()`
- [ ] Add error handling (license not found)
- [ ] Add timeout handling (30 seconds max)
- [ ] Add logging for debugging
- [ ] Test with real license numbers

**Completion Date:** ___________
**Notes:**

**Key Functions:**
```typescript
export interface LicenseInfo {
  companyName: string;
  status: string;           // ปกติ, ไม่ปกติ, etc.
  expiryDate: string;       // mm/dd/yyyy format
  found: boolean;
  error?: string;
}

export async function checkLicenseWithDOT(
  licenseNumber: string
): Promise<LicenseInfo>
```

---

### ✅ Step 3: Create Verify License API
**File:** `src/app/api/admin/verify-license/route.ts`

- [ ] POST endpoint for license verification
- [ ] Permission check (admin:users required)
- [ ] Support single member ID
- [ ] Support multiple member IDs (array)
- [ ] Call `checkLicenseWithDOT()` for each member
- [ ] Update Google Sheets with results
- [ ] Update Firestore members collection
- [ ] Return detailed results
- [ ] Add rate limiting (optional)
- [ ] Test with 1 member
- [ ] Test with multiple members

**Completion Date:** ___________
**Notes:**

**API Request:**
```typescript
POST /api/admin/verify-license
{
  "memberIds": ["674", "302", "455"]
}
```

**API Response:**
```typescript
{
  "results": [
    {
      "memberId": "674",
      "status": "success",
      "data": {
        "companyName": "บริษัท ABC",
        "status": "ปกติ",
        "expiryDate": "03/15/2026",
        "found": true
      }
    },
    {
      "memberId": "302",
      "status": "skipped",
      "reason": "No license number"
    }
  ],
  "summary": {
    "total": 2,
    "success": 1,
    "failed": 0,
    "skipped": 1
  }
}
```

---

### ✅ Step 4: Add Admin UI
**File:** `src/app/admin/members/page.tsx` (or create new page)

- [ ] Add "🔍 ตรวจสอบใบอนุญาต" button
- [ ] Support single member verification
- [ ] Support bulk verification (select multiple)
- [ ] Add loading state during verification
- [ ] Display results (success/failed/skipped)
- [ ] Show progress for bulk operations
- [ ] Add error handling
- [ ] Test UI functionality

**Completion Date:** ___________
**Notes:**

**UI Features:**
- ✅ Single member: Click row → "Verify License" button
- ✅ Bulk: Select multiple → "Verify Selected" button
- ✅ Progress bar for bulk operations
- ✅ Results modal showing summary

---

### ✅ Step 5: Auto-Verify After Approval (Optional)
**File:** `src/app/api/admin/verification/route.ts`

- [ ] Add auto-verify option to approval flow
- [ ] After approving new member
- [ ] Check if license number exists
- [ ] Call `/api/admin/verify-license` automatically
- [ ] Update member data with verification results
- [ ] Add toggle in settings (enable/disable auto-verify)
- [ ] Test approval + auto-verify flow

**Completion Date:** ___________
**Notes:**

**Settings:**
```typescript
// System Settings
{
  autoVerifyLicenseOnApproval: true/false
}
```

---

### ✅ Step 6: Testing & Deployment
**Testing**

- [ ] Unit test: `dot-scraper.ts` functions
- [ ] Integration test: API endpoint
- [ ] UI test: Admin verification flow
- [ ] Test error cases:
  - [ ] Invalid license number
  - [ ] Network timeout
  - [ ] DOT website down
  - [ ] Member without license number
- [ ] Performance test: Bulk verification (10+ members)

**Deployment:**

- [ ] Test Puppeteer on Vercel staging
- [ ] Configure memory/timeout settings
- [ ] Deploy to production
- [ ] Monitor first 24 hours
- [ ] Check logs for errors

**Completion Date:** ___________
**Notes:**

---

## 🧪 Testing Checklist

### Functional Tests

- [ ] **Test Case 1:** Verify single member with valid license
  - Input: MemberID with license number
  - Expected: Success, data updated in both Google Sheets and Firestore

- [ ] **Test Case 2:** Verify member without license number
  - Input: MemberID without license number
  - Expected: Skipped with reason

- [ ] **Test Case 3:** Verify member with invalid license
  - Input: MemberID with non-existent license
  - Expected: Not found, "ไม่พบข้อมูล" in results

- [ ] **Test Case 4:** Bulk verify 10 members
  - Input: Array of 10 member IDs
  - Expected: All processed, results returned

- [ ] **Test Case 5:** Network timeout
  - Input: Simulate slow network
  - Expected: Timeout error handled gracefully

### Performance Tests

- [ ] Single verification time: ______ seconds (target: <10s)
- [ ] Bulk 10 members time: ______ seconds (target: <60s)
- [ ] API memory usage: ______ MB (target: <512MB)

---

## 📊 Comparison: Python vs Next.js

| Feature | Python Script | Next.js Integration | Winner |
|---------|---------------|---------------------|--------|
| **Ease of Use** | Manual run, CLI | Click button in Admin UI | ✅ Next.js |
| **Data Update** | Google Sheets only | Google Sheets + Firestore | ✅ Next.js |
| **Automation** | Manual | Can auto-verify on approval | ✅ Next.js |
| **Technology** | Selenium + Chrome | Puppeteer (headless) | ✅ Next.js |
| **Deployment** | Local only | Vercel serverless | ✅ Next.js |
| **Speed** | ~5s per member | ~5s per member | 🟰 Same |
| **Maintenance** | Python + dependencies | All in Next.js | ✅ Next.js |

---

## ⚠️ Important Notes

### Puppeteer on Vercel

Puppeteer **can** run on Vercel but requires:
1. **Headless mode:** `{ headless: true }`
2. **Memory:** At least 512MB (set to 1024MB recommended)
3. **Timeout:** 60 seconds max
4. **Chrome binary:** Puppeteer includes bundled Chromium

**Reference:** https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md#running-puppeteer-on-aws-lambda

### Alternative: Puppeteer Core

If Vercel has issues, use `puppeteer-core` + Chrome AWS Lambda:
```bash
npm install puppeteer-core chrome-aws-lambda
```

### Rate Limiting

DOT website may have rate limits. Add delay between requests:
```typescript
// Wait 2 seconds between each verification
await new Promise(resolve => setTimeout(resolve, 2000));
```

---

## 🐛 Known Issues & Solutions

### Issue 1: Puppeteer too slow on Vercel
- **Solution:** Use `puppeteer-core` + `chrome-aws-lambda`
- **Alternative:** Run verification as background job

### Issue 2: DOT website structure changed
- **Solution:** Update selectors in `dot-scraper.ts`
- **Monitoring:** Add alert if scraping fails

### Issue 3: Timeout on bulk verification
- **Solution:** Implement queue system (max 5 concurrent)
- **Alternative:** Process in batches of 10

---

## 📅 Timeline

| Step | Task | Estimated Time | Dependencies |
|------|------|----------------|--------------|
| 1 | Setup Puppeteer | 1 hour | Phase 1 complete |
| 2 | DOT Scraper Library | 2 hours | Step 1 |
| 3 | Verify License API | 2 hours | Step 2 |
| 4 | Admin UI | 1 hour | Step 3 |
| 5 | Auto-Verify (Optional) | 1 hour | Step 3, 4 |
| 6 | Testing & Deployment | 2 hours | All above |

**Total Estimated Time:** 9 hours
**Actual Time Spent:** ___________

---

## 🔗 Related Files

### Current System (Python)
- `ระบบเช็คอัพเดทสมาชิกภาพ Python/Agentclub/AgentTour_CheckMember_v2.py`
- Uses Selenium + Google Sheets API
- Manual CLI operation

### New System (Next.js)
- **Library:** `src/lib/dot-scraper.ts`
- **API:** `src/app/api/admin/verify-license/route.ts`
- **UI:** `src/app/admin/members/page.tsx`
- **Types:** Update `src/types/member.ts`

---

## 🎓 Migration from Python Script

### What to Keep
- ✅ DOT website URL and scraping logic
- ✅ Date conversion function (Thai → mm/dd/yyyy)
- ✅ Column mapping (Q, R, S, T)

### What to Change
- ❌ Selenium → Puppeteer
- ❌ CLI interaction → Admin UI
- ❌ Google Sheets only → Google Sheets + Firestore
- ❌ Manual run → Click button / Auto-verify

### Migration Steps
1. Extract scraping logic from Python
2. Convert to TypeScript + Puppeteer
3. Test locally with same license numbers
4. Verify results match Python output
5. Deploy and monitor

---

## 📞 Next Steps After Phase 1.5

- [ ] Monitor verification success rate
- [ ] Add license expiry alerts
- [ ] Create dashboard for license statistics
- [ ] Schedule automatic verification (monthly)

---

**Last Updated By:** Claude Code
**Last Updated Date:** 2025-01-XX
**Status:** 🟡 Waiting for Phase 1 → 🔵 In Progress → 🟢 Completed
