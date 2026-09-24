# Agent Club - System Overview

## Project Description
ระบบจัดการข้อมูลสมาชิกชมรม Agent Club
สำหรับตรวจสอบสถานะใบอนุญาตธุรกิจนำเที่ยวของสมาชิก

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Google Apps Script (GAS) |
| Frontend | HTML5, Bootstrap 5, jQuery |
| Database | Google Sheets |
| Development | Clasp CLI |
| Data Source | DOT Website (กรมการท่องเที่ยว) |

---

## Features

### 1. Authentication
- Login ด้วย Email/Password จาก Sheet "Users"
- Token-based session (24 hours expiry)
- Session เก็บใน sessionStorage

### 2. Member Management (CRUD)
- **View**: ดูรายละเอียดสมาชิก
- **Add**: เพิ่มสมาชิกใหม่
- **Edit**: แก้ไขข้อมูลสมาชิก
- **Delete**: ลบสมาชิก

### 3. Search & Filter
- **Search**: ค้นหาตาม ชื่อ, บริษัท, เลขใบอนุญาต, ชื่อเล่น
- **Status Filter**: กรองสถานะ ปกติ/ไม่ปกติ
- **Expiry Filter**: กรองใบอนุญาตที่จะหมดอายุใน 1/3/6 เดือน

### 4. Notification Generator
- สร้างข้อความแจ้งเตือนสำหรับสมาชิกที่มีสถานะไม่ปกติ
- คัดลอกไปใช้ส่งทาง LINE

### 5. Dashboard Statistics
- จำนวนสมาชิกทั้งหมด
- จำนวนสถานะปกติ
- จำนวนสถานะไม่ปกติ
- จำนวนใบอนุญาตใกล้หมดอายุ (3 เดือน)

---

## File Structure

```
Agentclub/
├── .clasp.json              # Clasp configuration
├── appsscript.json          # GAS manifest
├── Code.js                  # Backend functions
├── Index.html               # Main SPA file
├── JavaScript.html          # Frontend JavaScript
├── Styles.html              # CSS styles
├── Modals.html              # Bootstrap modals
├── CONSTITUTION.md          # Development rules
├── SYSTEM_OVERVIEW.md       # This file
├── DATABASE_STRUCTURE.md    # Database schema
├── AgentTour_CheckMember_v2.py  # Python scraper for DOT
└── keys.json                # Service account credentials
```

---

## Google Sheets Structure

### Sheet: Check_Member_List2023

| Column | Field | Description |
|--------|-------|-------------|
| A | MemberID | รหัสสมาชิก (Primary Key) |
| B | Company (EN) | ชื่อบริษัท (อังกฤษ) |
| C | Name | ชื่อ-นามสกุล |
| D | Nickname | ชื่อเล่น |
| E | LINE ID | LINE ID |
| F | LINE Name | ชื่อ LINE |
| G | Phone | เบอร์โทร |
| H | Mobile | เบอร์มือถือ |
| I | License No | เลขใบอนุญาต |
| J | Company (Reg) | ชื่อบริษัทจดทะเบียน |
| K | Status | สถานะ (เดิม) |
| L | Exp Date 1 | วันหมดอายุ (เดิม) |
| M | Exp Date 2 | วันหมดอายุ 2 |
| N | Line Group | สถานะกลุ่ม (เดิม) |
| Q | Company Q | ชื่อบริษัท (จาก DOT) |
| R | Status R | สถานะ (จาก DOT) |
| S | Exp Date S | วันหมดอายุ (จาก DOT) |
| T | Exp Date T | วันหมดอายุ (แปลงแล้ว) |
| U | Line Group U | สถานะไลน์กลุ่ม (ปัจจุบัน) |

**หมายเหตุ**:
- Column A (MemberID) เป็น Primary Key ใช้อ้างอิงข้อมูลสมาชิก
- Column Q, R, S, T มาจากการ scrape เว็บ DOT
- ใช้ Column R (statusR) และ Column T (expDateT) เป็นหลัก
- ใช้ Column U (lineGroupU) สำหรับสถานะกลุ่ม LINE

### Sheet: CRM_ContactHistory

| Column | Field | Description |
|--------|-------|-------------|
| A | ID | Auto ID |
| B | MemberID | รหัสสมาชิก (FK อ้างอิง Check_Member_List2023) |
| C | LicenseNo | เลขใบอนุญาต |
| D | ContactDate | วันที่ติดต่อ |
| E | ContactReason | เหตุผลในการติดต่อ |
| F | ContactResult | ผลการติดต่อ (ติดต่อแล้ว/ติดต่อไม่ได้) |
| G | SubResult | รายละเอียดผลการติดต่อ |
| H | Notes | หมายเหตุ |
| I | RecordedBy | ผู้บันทึก |
| J | RecordedAt | เวลาที่บันทึก |
| K | StatusUpdated | อัพเดทสถานะหรือไม่ (Yes/No) |

**หมายเหตุ**:
- Sheet นี้จะถูกสร้างอัตโนมัติเมื่อมีการบันทึกการติดต่อครั้งแรก
- ใช้ MemberID เป็น key ในการเชื่อมโยงกับข้อมูลสมาชิก

### Sheet: Users

| Column | Field | Description |
|--------|-------|-------------|
| A | UserID | รหัสผู้ใช้ |
| B | Name | ชื่อ-นามสกุล |
| C | Nickname | ชื่อเล่น |
| D | Email | อีเมล (ใช้ login) |
| E | Password | รหัสผ่าน |
| F | IsActive | สถานะ (TRUE/FALSE) |
| G | CreatedDate | วันที่สร้าง |
| J | LastLoginDate | วันที่ login ล่าสุด |

---

## Backend Functions (Code.js)

### Authentication
| Function | Description |
|----------|-------------|
| `login(email, password)` | Login และสร้าง token |
| `verifyToken(token)` | ตรวจสอบ token |
| `logout(token)` | ลบ token ออกจาก cache |
| `generateToken(userId)` | สร้าง token ใหม่ |

### Member CRUD
| Function | Description |
|----------|-------------|
| `getMembers(token, filters)` | ดึงรายการสมาชิก (พร้อม filter) |
| `getMember(token, rowIndex)` | ดึงข้อมูลสมาชิกรายบุคคล |
| `addMember(token, memberData)` | เพิ่มสมาชิกใหม่ |
| `updateMember(token, rowIndex, memberData)` | อัปเดตข้อมูลสมาชิก |
| `deleteMember(token, rowIndex)` | ลบสมาชิก |

### Utilities
| Function | Description |
|----------|-------------|
| `getDashboardStats(token)` | ดึงสถิติ dashboard |
| `generateNotificationMessage(token, rowIndex)` | สร้างข้อความแจ้งเตือน |
| `cleanDataForWeb(data)` | แปลงข้อมูลก่อนส่งไป frontend |
| `parseThaiDate(dateStr)` | แปลง string เป็น Date |
| `safeString(value)` | แปลงค่าเป็น string อย่างปลอดภัย |

---

## Frontend Functions (JavaScript.html)

### Section Management
| Function | Description |
|----------|-------------|
| `showLogin()` | แสดงหน้า login |
| `showDashboard()` | แสดงหน้า dashboard |
| `clearSession()` | ล้าง session |

### Authentication
| Function | Description |
|----------|-------------|
| `handleLogin(event)` | จัดการ login |
| `handleLogout()` | จัดการ logout |

### Data Loading
| Function | Description |
|----------|-------------|
| `loadDashboardStats()` | โหลดสถิติ |
| `loadMembers(filters)` | โหลดรายการสมาชิก |
| `renderMembersTable(members)` | แสดงตาราง |

### Filters
| Function | Description |
|----------|-------------|
| `applyFilters()` | ใช้ตัวกรอง |
| `resetFilters()` | รีเซ็ตตัวกรอง |

### Member Actions
| Function | Description |
|----------|-------------|
| `viewMember(rowIndex)` | ดูรายละเอียด |
| `editMember(rowIndex)` | เปิด modal แก้ไข |
| `saveMember()` | บันทึกการแก้ไข |
| `showAddMemberModal()` | เปิด modal เพิ่ม |
| `addNewMember()` | เพิ่มสมาชิก |
| `deleteMember(rowIndex, name)` | เปิด modal ลบ |
| `confirmDelete()` | ยืนยันการลบ |

### Notification
| Function | Description |
|----------|-------------|
| `showNotification(rowIndex)` | แสดงข้อความแจ้งเตือน |
| `copyNotification()` | คัดลอกข้อความ |

---

## Data Scraping (Python)

### AgentTour_CheckMember_v2.py
สคริปต์ Python สำหรับดึงข้อมูลจากเว็บ DOT

**Process:**
1. อ่านเลขใบอนุญาตจาก Google Sheet (Column I)
2. ค้นหาข้อมูลจากเว็บ DOT ทีละรายการ
3. ดึงข้อมูล: ชื่อบริษัท, สถานะ, วันหมดอายุ
4. บันทึกกลับไปที่ Google Sheet (Column Q, R, S)

**Dependencies:**
- selenium
- google-api-python-client
- google-auth

**การใช้งาน:**
```bash
python AgentTour_CheckMember_v2.py
```

---

## Notification Message Template

```
เรียน [ชื่อ-นามสกุล]
[ชื่อบริษัทจดทะเบียน]
เนื่องจากทางระบบทะเบียนของชมรม พบว่าข้อมูลใบอนุญาตธุรกิจนำเที่ยวของคุณ
หมายเลขทะเบียน [เลขใบอนุญาต] ได้มีสถานะ [สถานะ]
[วันหมดอายุ ... (แสดงเฉพาะกรณีหมดอายุแล้ว)]

ทางชมรมมีนโยบายที่จะอนุญาตให้เฉพาะสมาชิกที่เป็นบริษัทตัวแทนท่องเที่ยว
ที่มีใบอนุญาตที่ยังไม่หมดอายุ และเป็นบริษัทที่ยังคงเปิดดำเนินธุรกิจ เท่านั้นสามารถอยู่ในกลุ่ม

เพื่อเป็นการรักษาสมาชิกภาพในชมรม
ขอให้คุณติดต่อกลับมาที่ LINE นี้ เพื่ออัพเดทข้อมูลใบอนุญาตที่เป็นปัจจุบัน

หากไม่ได้รับการติดต่อกลับจากท่าน ภายใน 3 วัน นับจากวันที่ได้รับข้อความนี้
ทางระบบทะเบียนขออนุญาตลบ Line ของคุณออกจาก Line กลุ่ม
ทั้งนี้คุณสามารถติดต่อเพื่ออัพเดทข้อมูลที่เป็นปัจจุบันได้
ทีมงานจะนำท่านกลับเข้ากลุ่มอีกครั้ง ภายหลังได้รับเอกสารและทำการตรวจสอบเรียบร้อยแล้ว

ด้วยความนับถือ
ไมตรี บุญกิจรุ่งไพศาล
นายทะเบียนชมรม Agent Club
```

---

## Status Values

### License Status (Column R)
| Value | Meaning |
|-------|---------|
| ปกติ | ใบอนุญาตยังใช้งานได้ |
| ยกเลิกใบอนุญาต | ใบอนุญาตถูกยกเลิก |
| ไม่พบข้อมูล | ไม่พบในระบบ DOT |

### Line Group Status (Column U)
| Value | Display | Meaning |
|-------|---------|---------|
| อยู่ในกลุ่ม | อยู่ในกลุ่ม | ยังอยู่ใน LINE กลุ่ม |
| ออกจากกลุ่ม | ออกจากกลุ่ม | ออกจาก LINE กลุ่มแล้ว |
| รอตรวจสอบ | รอตรวจสอบ | รอการตรวจสอบข้อมูล |
| ยกเลิกข้อมูล/ลงทะเบียนใหม่แล้ว | ยกเลิกแล้ว | ข้อมูลถูกยกเลิก |

---

## Deployment

### Prerequisites
1. Node.js installed
2. Clasp CLI installed: `npm install -g @google/clasp`
3. Login to Clasp: `clasp login`

### Deploy Commands
```bash
# Push code to GAS
clasp push

# Create new deployment
clasp deploy

# Update existing deployment
clasp deploy --deploymentId <ID>

# View deployments
clasp deployments

# Open in browser
clasp open
```

---

## Troubleshooting

### Common Issues

1. **Login ไม่ได้**
   - ตรวจสอบ Email/Password ใน Sheet "Users"
   - ตรวจสอบ IsActive = TRUE

2. **ข้อมูลไม่โหลด**
   - ตรวจสอบ Token หมดอายุหรือไม่
   - ดู Console log ใน Browser
   - ดู Execution log ใน Apps Script Editor

3. **Filter ไม่ทำงาน**
   - ตรวจสอบรูปแบบวันที่ใน Sheet
   - ดู Logger.log ใน Apps Script

4. **Date parsing error**
   - รองรับรูปแบบ: Thai, ISO, DD/MM/YYYY
   - ใช้ parseThaiDate() สำหรับแปลง

---

## Contact

**นายทะเบียนชมรม**: ไมตรี บุญกิจรุ่งไพศาล

---

*Last Updated: February 2025*
