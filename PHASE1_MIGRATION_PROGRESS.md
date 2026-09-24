# 🚀 Phase 1 Migration Progress: Google Sheets → Firestore Members Collection

**เริ่มต้น:** 2025-01-XX
**แนวทาง:** แนวทาง 2 - สร้าง `members` collection แยกจาก `users`
**เป้าหมาย:** เพิ่มความเร็ว 5-10x, ลด Google Sheets API calls 80%

---

## 📊 สถานะโดยรวม

- **ความคืบหน้า:** 0% (0/8 steps completed)
- **Status:** 🟡 Not Started
- **Last Updated:** 2025-01-XX

---

## 🎯 Architecture Overview

### Firestore Collections Structure

```
users/{userId}                    members/{memberId}
├─ lineUserId                     ├─ memberId (same as doc ID)
├─ lineDisplayName                ├─ fullNameTH
├─ lineProfilePicture             ├─ nickname
├─ role                           ├─ companyNameTH
├─ permissions                    ├─ companyNameEN
├─ memberId ───────────────────┐  ├─ phone
├─ verificationStatus          │  ├─ mobile
├─ isActive                    │  ├─ email
└─ assignedEventIds            └─>├─ lineUserId
                                  ├─ lineDisplayName
                                  ├─ licenseNumber
                                  ├─ licenseExpiry
                                  ├─ status (ปกติ/ไม่ปกติ)
                                  ├─ positionCompany
                                  ├─ positionClub
                                  ├─ sponsor1, sponsor2
                                  ├─ lineGroupStatus
                                  ├─ lineGroupJoinDate
                                  ├─ ... (all 38+ fields)
                                  ├─ syncedAt
                                  └─ syncedFrom: 'google-sheets'
```

### Query Strategy

- **List all members:** Query `members` collection ✅ (no join needed)
- **Single user profile:** Query `users` → then `members` (1 join, +50ms)
- **Authentication:** Query `users` only ✅ (no join needed)
- **LINE messaging:** Query `members` with filters ✅ (no join needed)

---

## 📝 Implementation Checklist

### ✅ Step 1: Create Member Sync Service
**File:** `src/lib/member-sync.ts`

- [ ] Create `syncSingleMemberToFirestore(memberId)` function
- [ ] Create `syncAllMembersToFirestore()` function
- [ ] Add error handling and logging
- [ ] Add sync metadata (syncedAt, syncedFrom)
- [ ] Test with 1 member first
- [ ] Test with all members (~450)

**Completion Date:** ___________
**Notes:**

---

### ✅ Step 2: Create Firestore Members Query Service
**File:** `src/lib/members-firestore.ts`

- [ ] Create `getAllMembersFromFirestore()` function
- [ ] Create `getMemberByIdFromFirestore(memberId)` function
- [ ] Create `getMembersByStatusFromFirestore(status)` function
- [ ] Create `getActiveMembersFromFirestore()` function
- [ ] Add caching strategy (optional)
- [ ] Add TypeScript types

**Completion Date:** ___________
**Notes:**

---

### ✅ Step 3: Create Manual Sync API
**File:** `src/app/api/admin/sync-members/route.ts`

- [ ] POST endpoint for manual sync
- [ ] Permission check (admin:access required)
- [ ] Call `syncAllMembersToFirestore()`
- [ ] Return sync results (count, errors)
- [ ] Add progress tracking
- [ ] Test sync functionality

**Completion Date:** ___________
**Notes:**

---

### ✅ Step 4: Create Cron Sync API
**File:** `src/app/api/cron/sync-members/route.ts`

- [ ] GET endpoint for cron job
- [ ] Verify CRON_SECRET for security
- [ ] Call `syncAllMembersToFirestore()`
- [ ] Log sync results
- [ ] Handle errors gracefully
- [ ] Test locally

**Completion Date:** ___________
**Notes:**

---

### ✅ Step 5: Add Sync UI to Admin Dashboard
**File:** `src/app/admin/page.tsx`

- [ ] Add "🔄 Sync Members" button
- [ ] Display last sync time
- [ ] Display sync status (success/failed + count)
- [ ] Add loading state
- [ ] Show sync results
- [ ] Add error handling

**Completion Date:** ___________
**Notes:**

---

### ✅ Step 6: Update Verification Approval Flow
**File:** `src/app/api/admin/verification/route.ts`

- [ ] After updating Google Sheets
- [ ] Call `syncSingleMemberToFirestore(memberId)`
- [ ] Handle sync errors
- [ ] Test approval flow end-to-end
- [ ] Verify member doc created in Firestore

**Completion Date:** ___________
**Notes:**

---

### ✅ Step 7: Replace Google Sheets Calls in Critical Files
**Priority 1 - Admin Pages (slowest):**

- [ ] `src/app/api/admin/users/route.ts`
  - Replace `getAllMembers()` with `getAllMembersFromFirestore()`
  - Update to query `members` collection for member data
  - Keep `users` query for auth data
  - Test admin users page

**Priority 2 - LINE Messaging:**

- [ ] `src/components/admin/PromoteEventModal.tsx`
  - Replace `getAllMembers()` with query to `members` collection
  - Update validation to use Firestore data
  - Test message sending

**Priority 3 - Other APIs:**

- [ ] `src/app/api/admin/verification/route.ts`
  - Use `getMemberByIdFromFirestore()` where needed
  - Keep Google Sheets update for backward compatibility

**Completion Date:** ___________
**Notes:**

---

### ✅ Step 8: Setup Vercel Cron Job
**File:** `vercel.json`

- [ ] Add cron configuration
  ```json
  {
    "crons": [{
      "path": "/api/cron/sync-members",
      "schedule": "0 * * * *"
    }]
  }
  ```
- [ ] Add CRON_SECRET to Vercel environment variables
- [ ] Deploy to production
- [ ] Verify cron job runs
- [ ] Monitor first 24 hours

**Completion Date:** ___________
**Notes:**

---

## 🚀 Deployment Plan

### Pre-Deployment Checklist

- [ ] All code reviewed
- [ ] TypeScript compilation successful
- [ ] No linting errors
- [ ] Environment variables ready
  - [ ] CRON_SECRET generated
  - [ ] GOOGLE_SHEET_ID verified
  - [ ] Firebase credentials verified

### Deployment Steps

1. [ ] **Initial Deployment**
   - Deploy code to production
   - Do NOT run sync yet

2. [ ] **First Manual Sync**
   - Navigate to admin dashboard
   - Click "🔄 Sync Members"
   - Verify results: ~450 members synced
   - Check Firestore Console → members collection

3. [ ] **Enable Cron Job**
   - Verify vercel.json deployed
   - Check Vercel Dashboard → Cron Jobs
   - Wait for first automatic sync (next hour)

4. [ ] **Monitor & Validate**
   - Check admin page load time (should be <1 sec)
   - Verify LINE messaging works
   - Monitor Vercel Logs for 24 hours
   - Check Firestore usage/costs

**Deployment Date:** ___________
**Notes:**

---

## 🧪 Testing Checklist

### Unit Tests

- [ ] `member-sync.ts` - sync functions
- [ ] `members-firestore.ts` - query functions
- [ ] Sync APIs - manual and cron

### Integration Tests

- [ ] Admin dashboard - member list loads fast
- [ ] Member approval - creates Firestore doc
- [ ] LINE messaging - uses Firestore data
- [ ] Cron job - runs successfully

### Performance Tests

- [ ] Admin page load time: ______ ms (target: <1000ms)
- [ ] Member query time: ______ ms (target: <100ms)
- [ ] Sync time (450 members): ______ sec (target: <30sec)

**Testing Date:** ___________
**Notes:**

---

## 📊 Metrics & Monitoring

### Before Migration (Baseline)

- Admin page load time: ~3-5 sec
- Google Sheets API calls/day: 500+
- Member query time: ~500ms
- Total API quota usage: High

**Measured Date:** ___________

### After Migration (Target)

- [ ] Admin page load time: <1 sec ✅
- [ ] Google Sheets API calls/day: <100 ✅
- [ ] Member query time: <100ms ✅
- [ ] Firestore reads/day: ~1000
- [ ] Firestore writes/day: ~100 (sync)
- [ ] Cost: ~$0.10/month

**Measured Date:** ___________

---

## ⚠️ Rollback Plan

If Phase 1 has critical issues:

1. [ ] Revert imports back to `@/lib/google-sheets`
2. [ ] Deploy rollback
3. [ ] Disable cron job in vercel.json
4. [ ] (Optional) Delete members collection
5. [ ] Investigate issues
6. [ ] Fix and re-deploy

**Rollback Date (if needed):** ___________
**Reason:** ___________

---

## 🐛 Issues & Solutions

### Issue 1: [Title]
- **Date:** ___________
- **Description:**
- **Solution:**
- **Status:** 🔴 Open / 🟡 In Progress / 🟢 Resolved

### Issue 2: [Title]
- **Date:** ___________
- **Description:**
- **Solution:**
- **Status:** 🔴 Open / 🟡 In Progress / 🟢 Resolved

---

## 📅 Timeline

| Step | Task | Estimated Time | Start Date | End Date | Status |
|------|------|----------------|------------|----------|--------|
| 1 | Create Member Sync Service | 2 hours | ___ | ___ | 🟡 Not Started |
| 2 | Create Query Service | 1 hour | ___ | ___ | 🟡 Not Started |
| 3 | Manual Sync API | 1 hour | ___ | ___ | 🟡 Not Started |
| 4 | Cron Sync API | 1 hour | ___ | ___ | 🟡 Not Started |
| 5 | Admin UI | 1 hour | ___ | ___ | 🟡 Not Started |
| 6 | Update Verification Flow | 1 hour | ___ | ___ | 🟡 Not Started |
| 7 | Replace Google Sheets Calls | 2 hours | ___ | ___ | 🟡 Not Started |
| 8 | Setup Cron Job | 0.5 hour | ___ | ___ | 🟡 Not Started |
| 9 | Testing & Validation | 1 hour | ___ | ___ | 🟡 Not Started |
| 10 | Deployment & Monitoring | 1 hour | ___ | ___ | 🟡 Not Started |

**Total Estimated Time:** 11.5 hours
**Actual Time Spent:** ___________

---

## 🎓 Learning & Notes

### Key Decisions Made

1. **Decision:** Use members collection (not merge into users)
   - **Reason:** Separation of concerns, scalability
   - **Date:** ___________

2. **Decision:** Sync frequency = 1 hour
   - **Reason:** Balance between freshness and API quota
   - **Date:** ___________

### Lessons Learned

1. ___________
2. ___________
3. ___________

---

## 🔗 Related Documents

- [MEMBERS_MIGRATION_PLAN.md](./MEMBERS_MIGRATION_PLAN.md) - Original migration plan
- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - API documentation
- [GOOGLE_SHEET_STRUCTURE.md](./GOOGLE_SHEET_STRUCTURE.md) - Sheet structure

---

## 📞 Next Steps After Phase 1

Once Phase 1 is complete and stable:

- [ ] Monitor for 1 week
- [ ] Gather performance metrics
- [ ] User feedback collection
- [ ] **Start Phase 1.5** (License Verification Integration) - See [PHASE1.5_LICENSE_VERIFICATION.md](./PHASE1.5_LICENSE_VERIFICATION.md)
- [ ] Plan Phase 2 (Firestore-First Architecture)

---

## 🔗 Related Phases

- **Phase 1.5:** [License Verification Integration](./PHASE1.5_LICENSE_VERIFICATION.md) - Migrate Python license checking to Next.js
- **Phase 2:** Firestore-First Architecture (Future)

---

**Last Updated By:** Claude Code
**Last Updated Date:** 2025-01-XX
**Migration Status:** 🟡 Not Started → 🔵 In Progress → 🟢 Completed → 🔴 Issues
