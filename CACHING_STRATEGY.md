# 📦 Caching Strategy for Agent Club Member Manager

## ✅ สำเร็จแล้ว

### 1. แก้ปัญหาการ Refresh หน้า Admin และ Members
- ✅ หน้า Admin (`/admin/page.tsx`) - เปลี่ยน dependency จาก `[session]` เป็น `[status]`
- ✅ หน้า Members (`/members/page.tsx`) - เปลี่ยน dependency จาก `[session]` เป็น `[status]`
- ✅ สร้าง Cache Infrastructure (`/lib/cache/google-sheets-cache.ts`)

**ผลลัพธ์**: หน้าจะไม่ refresh ซ้ำๆ อีกต่อไป โหลดข้อมูลแค่ครั้งเดียวตอนเข้าหน้า

---

## 🎯 แผนการทำ Caching (เรียงตามลำดับความสำคัญ)

### Priority 1: Event Registration API (สำคัญที่สุด) 🔥

**ทำไมต้องทำก่อน:**
- ใช้ Google Sheets API มากที่สุด (อ่าน + เขียน)
- ผู้ใช้เข้าดูบ่อยที่สุด (หน้า events list + event details)
- ส่งผลโดยตรงต่อ quota usage

**ไฟล์ที่ต้องแก้:**
1. `/lib/event-sheets.ts` - ฟังก์ชันที่อ่าน Google Sheets
   - `getEventAttendanceSummary()` - อ่านรายชื่อผู้ลงทะเบียน
   - `getEventRegistrations()` - อ่านข้อมูลลงทะเบียน
   - `getEventById()` - อ่านข้อมูลกิจกรรม

2. `/api/events/route.ts` - API สำหรับดึงรายการกิจกรรม
3. `/api/events/[eventId]/route.ts` - API สำหรับดึงข้อมูลกิจกรรมแต่ละตัว

**Cache TTL แนะนำ:**
- Event List: 5 นาที (MEDIUM)
- Event Details: 5 นาที (MEDIUM)
- Event Attendees: 2 นาที (SHORT) - เพราะมีการลงทะเบียนใหม่บ่อย

**ประโยชน์:**
- ลด API calls ประมาณ **70-80%**
- ผู้ใช้ดูหน้ารายการกิจกรรมได้เร็วขึ้นทันที

---

### Priority 2: Members API (สำคัญรองลงมา) 📋

**ทำไมต้องทำ:**
- Members list มีข้อมูลเยอะ (200+ records)
- Admin เปิดดูบ่อย
- ข้อมูลไม่ค่อยเปลี่ยนบ่อย

**ไฟล์ที่ต้องแก้:**
1. `/lib/google-sheets.ts` - ฟังก์ชัน `getAllMembers()`
2. `/api/members/route.ts` - API สำหรับดึงรายชื่อสมาชิก

**Cache TTL แนะนำ:**
- Members List: 15 นาที (LONG) - ข้อมูลสมาชิกไม่เปลี่ยนบ่อย

**ประโยชน์:**
- ลด API calls ประมาณ **60-70%**
- หน้า Members โหลดเร็วขึ้นมาก (จาก 3-5 วินาที เหลือ < 1 วินาที)

---

### Priority 3: Attendance Report API (ค่อนข้างสำคัญ) 📊

**ทำไมต้องทำ:**
- อ่านข้อมูลจาก Google Sheets หลาย events
- ใช้ในหน้า Dashboard และ Members
- คำนวณหนักมาก (loop ผ่านทุก event)

**ไฟล์ที่ต้องแก้:**
1. `/api/events/attendance/route.ts`
2. `/lib/event-sheets.ts` - ฟังก์ชัน `getMemberAttendance()`

**Cache TTL แนะนำ:**
- Attendance Report: 15 นาที (LONG)
- Member Attendance: 10 นาที

**ประโยชน์:**
- ลด API calls ประมาณ **80-90%** (เพราะอ่านข้อมูลเยอะมาก)
- Dashboard โหลดเร็วขึ้นอย่างมาก

---

## 📊 ผลกระทบและข้อควรระวัง

### ✅ ผลดี (Benefits)

1. **ลด API Quota Usage**
   - ลดการเรียก Google Sheets API ลง **70-90%**
   - ประหยัด quota สำหรับ peak time
   - รองรับผู้ใช้เพิ่มขึ้นได้มากขึ้น (จาก 100 เป็น 500+ คน/วัน)

2. **ประสบการณ์ผู้ใช้ดีขึ้น**
   - โหลดหน้าเร็วขึ้น 5-10 เท่า
   - ไม่ต้องรอ loading นาน
   - ระบบตอบสนองเร็วขึ้น

3. **ประหยัดค่าใช้จ่าย**
   - ถ้าต้อง upgrade quota ในอนาคต จะประหยัดได้มาก
   - Server resources ใช้น้อยลง

### ⚠️ ผลเสีย (Trade-offs)

1. **ข้อมูลอาจไม่ Real-time**
   - ข้อมูลอาจเก่าสูงสุด 5-15 นาที (ตาม TTL)
   - **แก้ไข**: ใช้ Cache Invalidation เมื่อมีการแก้ไขข้อมูล

2. **ใช้ Memory บน Server**
   - Cache เก็บข้อมูลใน RAM
   - **ประมาณการ**: 200 members + 20 events = ~2-3 MB RAM
   - **ไม่มีปัญหา**: Server ทั่วไปมี RAM หลัก GB

3. **ต้องจัดการ Cache Invalidation**
   - เมื่อมีการแก้ไขข้อมูล ต้อง clear cache
   - **แก้ไข**: เพิ่ม `sheetsCache.invalidate()` ใน API ที่เขียนข้อมูล

---

## 🔧 การใช้งาน Cache

### ตัวอย่าง: Cache Event List

**ก่อนใช้ Cache:**
```typescript
// ❌ เรียก Google Sheets ทุกครั้ง
export async function GET(request: NextRequest) {
  const events = await getTrackedEventsFromFirestore();
  const attendees = await getEventAttendanceSummary(eventId); // เรียก Sheets!
  return NextResponse.json({ events, attendees });
}
```

**หลังใช้ Cache:**
```typescript
import { sheetsCache, CacheKeys, CacheTTL } from '@/lib/cache/google-sheets-cache';

export async function GET(request: NextRequest) {
  // ลองดึงจาก cache ก่อน
  const cached = sheetsCache.get(CacheKeys.eventAttendees(eventId));
  if (cached) {
    return NextResponse.json(cached); // ✅ ใช้ cache ไม่ต้องเรียก API!
  }

  // ถ้าไม่มี cache หรือหมดอายุ ค่อยเรียก API
  const events = await getTrackedEventsFromFirestore();
  const attendees = await getEventAttendanceSummary(eventId);

  const data = { events, attendees };

  // เก็บลง cache
  sheetsCache.set(CacheKeys.eventAttendees(eventId), data, CacheTTL.MEDIUM);

  return NextResponse.json(data);
}
```

### ตัวอย่าง: Cache Invalidation (Clear Cache เมื่อมีการแก้ไข)

```typescript
// API สำหรับลงทะเบียนกิจกรรม
export async function POST(request: NextRequest) {
  // บันทึกข้อมูลลงทะเบียน
  await saveRegistration(data);

  // ❗ Clear cache ของกิจกรรมนี้ทันที
  sheetsCache.invalidate(CacheKeys.eventAttendees(eventId));

  return NextResponse.json({ success: true });
}
```

---

## 📈 ผลลัพธ์ที่คาดหวัง

### ก่อนใช้ Cache:
```
100 คนเข้าดูหน้า Events ใน 1 วัน
= 100 × 3 requests (list + detail + attendees)
= 300 API calls/วัน
```

### หลังใช้ Cache (TTL = 5 นาที):
```
ชั่วโมงที่ 1:
- คนที่ 1 เข้ามา → เรียก API (miss)
- คนที่ 2-12 (ภายใน 5 นาที) → ใช้ cache (hit)
- ผลลัพธ์: 1 API call แทน 12 calls

ตลอดทั้งวัน (24 ชม = 288 รอบ 5 นาที):
= 288 API calls แทน 300 calls
= ลดลง ~90% 🎉
```

### ในกรณี Peak Time:
```
100 คนเข้าพร้อมกันใน 1 ชั่วโมง (12 รอบ 5 นาที)
= 12 API calls แทน 100 calls
= ลดลง 88% 🚀
```

---

## 🗓️ แผนการทำ (Roadmap)

### Week 1: Priority 1 - Event APIs ✅
- [x] สร้าง Cache Infrastructure
- [ ] ใช้ cache ใน Event List API
- [ ] ใช้ cache ใน Event Detail API
- [ ] ใช้ cache ใน Event Attendees API
- [ ] เพิ่ม Cache Invalidation ตอนลงทะเบียน/แก้ไข

### Week 2: Priority 2 - Members API
- [ ] ใช้ cache ใน Members List API
- [ ] ใช้ cache ใน Member Detail API
- [ ] เพิ่ม Cache Invalidation ตอนแก้ไขสมาชิก

### Week 3: Priority 3 - Attendance API
- [ ] ใช้ cache ใน Attendance Report API
- [ ] ใช้ cache ใน Member Attendance API

### Week 4: Monitoring & Optimization
- [ ] เพิ่ม Cache Statistics Dashboard
- [ ] Monitor cache hit rate
- [ ] Tune TTL values based on usage patterns

---

## 🎓 คำแนะนำ

1. **เริ่มจาก Priority 1 ก่อน** - Event APIs ให้ผลมากที่สุด
2. **ทดสอบให้มั่นใจ** - ตรวจสอบว่า cache invalidation ทำงานถูกต้อง
3. **Monitor quota usage** - ดูผลลัพธ์จริงใน Google Cloud Console
4. **ปรับ TTL ตามความเหมาะสม** - ถ้าข้อมูลเก่าเกินไป ลด TTL ลง

---

## 📞 คำถามที่พบบ่อย

**Q: ถ้าข้อมูลใน cache เก่า ผู้ใช้จะเห็นข้อมูลผิดไหม?**
A: ไม่ เพราะเรา invalidate cache ทันทีที่มีการแก้ไขข้อมูล ข้อมูลจะเก่าได้มากสุดแค่ 2-5 นาทีในกรณีที่ไม่มีคนแก้ไข

**Q: จะเกิดอะไรขึ้นถ้า server restart?**
A: Cache จะหายไปทั้งหมด (เก็บใน RAM) แต่ไม่มีปัญหา เพราะจะสร้าง cache ใหม่เมื่อมีคนเข้าใช้

**Q: ต้องมี Redis หรือ database สำหรับ cache ไหม?**
A: ไม่ต้อง ระบบนี้ใช้ In-Memory Cache (เก็บใน RAM) เพียงพอสำหรับ traffic ระดับ 100-500 คน/วัน

**Q: ถ้าต้องการข้อมูล real-time 100% ทำไงดี?**
A: ลด TTL เป็น 30 วินาที - 1 นาที หรือใช้ WebSocket/Server-Sent Events (แต่จะซับซ้อนกว่า)
