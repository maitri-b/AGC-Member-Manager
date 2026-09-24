# Agent Club Member Database Structure

## Google Sheet: Check_Member_List2023

**Spreadsheet ID:** `1CLNyVwqJ-TeeqvCiuBkW4g4BMoExh9sQ7036mznIAtE`

## Column Structure (A - N)

| Column | Header (Thai) | Header (English) | Description |
|--------|---------------|------------------|-------------|
| A | No. | No. | ลำดับที่ |
| B | บริษัท (ภาษาอังกฤษ) | Company (English) | ชื่อบริษัทภาษาอังกฤษ |
| C | ชื่อ-นามสกุล (ภาษาไทย) | Full Name (Thai) | ชื่อ-นามสกุลภาษาไทย |
| D | ชื่อเล่น | Nickname | ชื่อเล่น |
| E | ไอดี ไลน์ | Line ID | LINE ID |
| F | ชื่อไลน์ | Line Name | ชื่อที่แสดงใน LINE |
| G | เบอร์โทร | Phone | เบอร์โทรศัพท์บ้าน/สำนักงาน |
| H | เบอร์มือถือ | Mobile | เบอร์โทรศัพท์มือถือ |
| I | ใบอนุญาตนำเที่ยวเลขที่ | License No. | เลขที่ใบอนุญาตนำเที่ยว (TAT License) |
| J | ชื่อบริษัทตามที่จดทะเบียน | Registered Company Name | ชื่อบริษัทตามทะเบียน |
| K | สถานะ | Status | สถานะใบอนุญาต (ปกติ/ยกเลิก) |
| L | วันที่หมดอายุ | Expiry Date | วันที่ใบอนุญาตหมดอายุ |
| M | วันที่หมดอายุ | Expiry Date (2) | วันที่หมดอายุ (สำรอง) |
| N | สถานะไลน์กลุ่ม | Line Group Status | สถานะการเป็นสมาชิกกลุ่ม LINE |

## Output Columns (Q onwards)

| Column | Data | Source |
|--------|------|--------|
| Q | ชื่อบริษัท | ดึงจากเว็บ DOT |
| R | สถานะ | ดึงจากเว็บ DOT (ปกติ/ยกเลิก) |
| S | วันที่หมดอายุ | ดึงจากเว็บ DOT |

## Data Source

- **Input:** Column I (ใบอนุญาตนำเที่ยวเลขที่)
- **Website:** https://esvcs.dot.go.th/e-service/LicenseInformationPage
- **Output:** Columns Q, R, S (ข้อมูลที่ดึงจากเว็บกรมการท่องเที่ยว)

## Related Files

| File | Purpose |
|------|---------|
| `AgentTour_CheckMember_v2.py` | Python script สำหรับดึงข้อมูลจากเว็บ DOT และอัพเดทลง Google Sheet |
| `keys.json` | Service Account credentials สำหรับเชื่อมต่อ Google Sheets API |
| `Code.js` | Google Apps Script (Clasp) |

---

## Google Sheet: Users

## Column Structure (A - K)

| Column | Header | Data Type | Description |
|--------|--------|-----------|-------------|
| A | UserID | String/Number | รหัสผู้ใช้ (Primary Key) |
| B | Name | String | ชื่อ-นามสกุล |
| C | Nickname | String | ชื่อเล่น |
| D | Email | String | อีเมล |
| E | Password | String | รหัสผ่าน (encrypted) |
| F | IsActive | Boolean | สถานะการใช้งาน (TRUE/FALSE) |
| G | CreatedDate | Date | วันที่สร้างบัญชี |
| H | DefaultOrgID | String/Number | รหัสองค์กรเริ่มต้น |
| I | LastLoginOrgID | String/Number | รหัสองค์กรที่ login ล่าสุด |
| J | LastLoginDate | DateTime | วันเวลาที่ login ล่าสุด |
| K | UserSignature | String | ลายเซ็นผู้ใช้ |

---

## Notes

- ข้อมูลใบอนุญาตจะถูกค้นหาจากเว็บกรมการท่องเที่ยว (DOT)
- ระบบจะอัพเดทข้อมูล: ชื่อบริษัท, สถานะ, วันหมดอายุ
- สถานะปกติ = ใบอนุญาตยังใช้งานได้
- สถานะยกเลิก = ใบอนุญาตถูกยกเลิกแล้ว
