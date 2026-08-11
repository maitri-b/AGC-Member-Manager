# 🚀 Members Migration Plan: Google Sheets → Firestore

**เป้าหมาย**: Migration สมาชิกจาก Google Sheets เป็น Firestore Single Source of Truth

**Timeline**: 2 Phases
- **Phase 1**: Sync Google Sheets → Firestore (ทำทันที - เพิ่มความเร็ว)
- **Phase 2**: Firestore-First Architecture (อนาคต - ทดแทน Google Sheets ทั้งหมด)

---

## 📊 สถานะปัจจุบัน

### Google Sheets Structure
- **Sheet**: AGC_Membership  
- **Fields**: 38 fields (ดูใน src/types/member.ts)
- **ใช้งานที่**: 35+ files ใช้ google-sheets.ts

### Firestore Structure (ปัจจุบัน)
- **Collection**: users (เก็บ LINE login + permissions)
- **ยังไม่มี**: members collection สำหรับข้อมูลสมาชิกแบบเต็ม

---

## 🎯 Phase 1: Sync Google Sheets → Firestore (ทำเลย)

### เป้าหมาย
✅ เพิ่มความเร็วหน้า Admin (query จาก Firestore แทน Google Sheets)
✅ รักษา Google Sheets เป็น Source of Truth (ยังแก้ที่ Sheet ได้)  
✅ เตรียมพร้อมสำหรับ Phase 2

### 1.1 Firestore Collection Structure

Collection: **members**  
Document ID: **memberId** (e.g., "302", "674")

```typescript
{
  memberId: string,              // Document ID + field

  // Company
  companyNameEN: string,
  companyNameTH: string,

  // Personal
  fullNameTH: string,
  nickname: string,

  // LINE  
  lineId: string,
  lineName: string,
  lineUserId?: string,
  lineDisplayName?: string,

  // Contact
  phone: string,
  mobile: string,
  email: string,
  website: string,

  // License
  licenseNumber: string,
  licenseExpiry: string,         // MM/DD/YYYY
  licenseDocumentUrl?: string,

  // Position
  positionCompany: string,
  positionClub: string,

  // Status
  status: string,                // Active | Inactive | Expired | ...

  // Sponsor
  sponsor1: string,
  sponsor2: string,

  // LINE Group
  lineGroupStatus: string,
  lineGroupJoinDate: string,
  lineGroupJoinBy: string,
  lineGroupLeaveDate: string,
  lineGroupLeaveBy: string,

  // Sync metadata
  syncedAt: Timestamp,           // เวลาที่ sync ล่าสุด
  syncedFrom: 'google-sheets',   // แหล่งที่มา
  lastUpdated?: string,          // จาก Google Sheets
  updatedBy?: string,            // จาก Google Sheets
}
```

### 1.2 Implementation Files

#### ไฟล์ที่ต้องสร้างใหม่:

1. **src/lib/member-sync.ts** - Sync logic
2. **src/lib/members.ts** - Firestore queries (fast)
3. **src/app/api/admin/sync-members/route.ts** - Manual sync API
4. **src/app/api/cron/sync-members/route.ts** - Auto sync (Vercel Cron)

#### ไฟล์ที่ต้องแก้ไข:

1. **src/app/admin/page.tsx** - เพิ่มปุ่ม Sync + เปลี่ยนจาก google-sheets → members
2. **src/app/api/members/route.ts** - เปลี่ยนเป็น query Firestore
3. **vercel.json** - เพิ่ม cron job

### 1.3 Performance Comparison

| Metric | Before (Google Sheets) | After (Firestore) | Improvement |
|--------|------------------------|-------------------|-------------|
| Admin page load | 3-5 sec | 0.5-1 sec | **5-10x faster** |
| API calls/day | 500+ | ~100 (sync only) | 80% reduction |
| Query time | ~500ms | ~50ms | **10x faster** |

---

## 📝 Phase 1 Implementation Steps

### Step 1: สร้าง Member Sync Service
**File**: src/lib/member-sync.ts

### Step 2: สร้าง Firestore Query Service  
**File**: src/lib/members.ts

### Step 3: สร้าง Manual Sync API
**File**: src/app/api/admin/sync-members/route.ts

### Step 4: เพิ่ม Sync UI ในหน้า Admin
- เพิ่มปุ่ม "🔄 Sync Members from Google Sheets"
- แสดง last sync time
- แสดง sync status (success/failed + count)

### Step 5: แทนที่ imports ในไฟล์สำคัญ
```typescript
// Before
import { getAllMembers } from '@/lib/google-sheets';

// After
import { getAllMembers } from '@/lib/members';
```

**ไฟล์ที่แนะนำให้แทนที่ก่อน**:
- src/app/admin/page.tsx (ช้ามาก)
- src/app/api/members/route.ts
- src/app/api/members/attendance/route.ts

### Step 6: Setup Auto Sync (Vercel Cron)
**File**: vercel.json
```json
{
  "crons": [{
    "path": "/api/cron/sync-members",
    "schedule": "0 * * * *"
  }]
}
```

### Step 7: รัน Sync ครั้งแรก
1. Deploy code
2. เข้า /admin
3. กดปุ่ม "Sync Members"
4. รอผลลัพธ์ (should sync 400+ members)

### Step 8: Monitor & Validate
- ตรวจสอบ Firestore Console → members collection
- เช็ค Admin page load time
- ดู Vercel Logs → cron job running

---

## 🎯 Phase 2: Firestore-First Architecture (อนาคต)

### เป้าหมาย
- Firestore = Single Source of Truth  
- ไม่พึ่ง Google Sheets อีกต่อไป
- Member registration → สร้างใน Firestore โดยตรง

### 2.1 สร้างระบบสมัครสมาชิกใหม่

**Flow**:
1. Guest ส่งใบสมัคร → applications collection
2. Admin อนุมัติ → สร้าง members/{memberId}
3. Auto-generate memberId (YYNNN format)
4. Link ไป users collection
5. ส่ง LINE welcome message

### 2.2 ทดแทน Google Sheets ทั้งหมด

**ลบทิ้ง**:
- src/lib/google-sheets.ts
- Google Sheets API credentials
- 35+ import statements

**เปลี่ยนเป็น**:
- Query Firestore members collection
- Firestore triggers สำหรับ real-time updates

### 2.3 Optional: Backward Sync

ถ้าต้องการเก็บ Google Sheets ไว้เป็น backup:
- Firestore → Google Sheets (reverse sync)
- Export ทุกวัน เป็น backup

### 2.4 Benefits

1. ⚡ **Performance**: 10x faster queries
2. 📈 **Scalability**: รองรับ 10,000+ members
3. 🔄 **Real-time**: อัปเดตแบบ real-time
4. 🧹 **Simplicity**: ลด complexity (1 system)
5. 💰 **Cost**: ถูกกว่า (Firestore free tier)

---

## ✅ Phase 1 Checklist

### Development
- [ ] สร้าง src/lib/member-sync.ts
- [ ] สร้าง src/lib/members.ts  
- [ ] สร้าง /api/admin/sync-members
- [ ] สร้าง /api/cron/sync-members
- [ ] เพิ่ม Sync UI ใน Admin
- [ ] แทนที่ imports ในไฟล์สำคัญ (3-5 files)

### Deployment
- [ ] Setup Vercel Cron
- [ ] เพิ่ม CRON_SECRET env variable
- [ ] Deploy to production
- [ ] รัน manual sync ครั้งแรก

### Validation
- [ ] ตรวจสอบ members collection ใน Firestore
- [ ] เทียบจำนวน members (Google Sheets vs Firestore)
- [ ] ทดสอบ Admin page speed
- [ ] Monitor sync logs (24 hours)
- [ ] ตรวจสอบ Firestore usage/costs

---

## 🚨 Important Notes

### Phase 1 - Data Consistency
- **Google Sheets = Source of Truth**
- แก้ไขที่ Google Sheets → sync → Firestore
- **อย่าแก้ Firestore โดยตรง** (จะถูก overwrite)

### Phase 2 - Migration  
- **Firestore = Source of Truth**
- แก้ไขที่ Firestore
- Optional: backward sync → Google Sheets

### Rollback Plan
ถ้า Phase 1 มีปัญหา:
1. เปลี่ยน imports กลับเป็น google-sheets
2. Deploy
3. ปิด cron job
4. ลบ members collection (ถ้าจำเป็น)

---

## 💰 Cost Estimate

### Google Sheets API
- Reads: 500-1000/day  
- Cost: Free (แต่มี quota limits + ช้า)

### Firestore (Phase 1)
- Reads: ~1,000/day
- Writes: ~400/day (initial) + ~100/day (sync)
- Storage: ~1 MB  
- **Cost**: ~$0.10/month

### Firestore (Phase 2)
- Reads: ~2,000/day
- Writes: ~200/day
- Storage: ~2 MB
- **Cost**: ~$0.20/month

---

## 📞 Support & Questions

**Documentation**:
- Firestore: https://firebase.google.com/docs/firestore
- Vercel Cron: https://vercel.com/docs/cron-jobs

**Migration Issues**:
- Check logs: Vercel Dashboard → Functions → Logs
- Firestore Console → Data → members collection
- Admin page → Sync status

---

**Created**: 2026-08-11  
**Author**: Claude Code  
**Status**: ✅ Ready to implement Phase 1
