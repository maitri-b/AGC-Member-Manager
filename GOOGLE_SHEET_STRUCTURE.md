# Google Sheet Structure for Event Registration

## Required Columns for Payment Slip Upload System

### คอลัมน์ที่จำเป็นสำหรับระบบอัพโหลดสลิปการชำระเงิน

| Column | Header Name | Data Type | Description |
|--------|-------------|-----------|-------------|
| A | `registration_id` | Text | รหัสลงทะเบียน (ต้องมี - Primary Key) |
| B | `registration_date` | Date | วันที่ลงทะเบียน |
| C | `company_name` | Text | ชื่อบริษัท |
| D | `license_number` | Text | เลขที่ใบอนุญาต |
| E | `contact_name` | Text | ชื่อผู้ติดต่อ |
| F | `contact_phone` | Text | เบอร์โทรศัพท์ |
| G | `contact_email` | Text | อีเมล |
| H | `LINE_userID` | Text | LINE User ID (สำหรับ verify ownership) |
| I | `memberID` | Text | Member ID |
| J | `attendee_count` | Number | จำนวนผู้เข้าร่วม |
| K | `attendee_names` | Text | ชื่อผู้เข้าร่วม (JSON Array) |
| L | `shirt_count` | Number | จำนวนเสื้อ |
| M | `shirt_sizes` | Text | ไซส์เสื้อ |
| N | `event_fee` | Number | ค่าธรรมเนียมกิจกรรม |
| O | `shirt_fee` | Number | ค่าเสื้อ |
| P | `total_amount` | Number | ยอดรวม (ต้องมี - สำหรับเช็คว่ามีค่าใช้จ่าย) |
| Q | `slip_url` | Text | URL สลิป (Legacy - สำหรับชำระเต็มจำนวน) |
| R | `deposit_amount` | Number | ยอดมัดจำ |
| S | `remaining_amount` | Number | ยอดคงเหลือ |
| T | `deposit_paid` | Boolean | จ่ายมัดจำแล้ว (true/false) |
| U | `deposit_paid_date` | Date | วันที่จ่ายมัดจำ |
| V | `deposit_slip_url` | Text | **URL สลิปมัดจำ** (GAS จะอัพเดทคอลัมน์นี้) |
| W | `remaining_slip_url` | Text | **URL สลิปยอดคงเหลือ** (GAS จะอัพเดทคอลัมน์นี้) |
| X | `deposit_deadline` | Date/DateTime | กำหนดชำระมัดจำ |
| Y | `remaining_deadline` | Date/DateTime | กำหนดชำระยอดคงเหลือ |
| Z | `payment_status` | Text | **สถานะการชำระเงิน** (GAS จะอัพเดทคอลัมน์นี้) |
| AA | `status` | Text | สถานะการลงทะเบียน |
| AB | `verified_by` | Text | ตรวจสอบโดย |
| AC | `verified_date` | Date | วันที่ตรวจสอบ |
| AD | `client_token` | Text | Token |
| AE | `code_parent` | Text | รหัส Parent |
| AF | `table_code` | Text | รหัสโต๊ะ |
| AG | `special_requests` | Text | คำขอพิเศษ |
| AH | `card_received` | Boolean | รับบัตรแล้ว |
| AI | `admin_notes` | Text | หมายเหตุแอดมิน |
| AJ | `last_update_info` | Text | ข้อมูลอัพเดทล่าสุด |
| AK | `shirt_received` | Boolean | รับเสื้อแล้ว |
| AL | `table_number` | Text | หมายเลขโต๊ะ |
| AM | `code_split` | Text | รหัส Split |
| AN | `checkin_sections` | Text | ส่วน Check-in |
| AO | `attendance_type` | Text | ประเภทการเข้าร่วม |
| AP | `attendee_type_selections` | Text | การเลือกประเภทผู้เข้าร่วม (JSON) |
| AQ | `room_allocations` | Text | การจัดสรรห้องพัก (JSON) |
| AR | `special_charges` | Text | ค่าใช้จ่ายพิเศษ (JSON) |

## ⚠️ คอลัมน์ที่ขาดหายไป (ต้องเพิ่ม)

### คอลัมน์ที่ควรเพิ่มหลัง `deposit_paid_date` (คอลัมน์ U):

| Column | Header Name | Data Type | Description |
|--------|-------------|-----------|-------------|
| **ใหม่** | `remaining_paid_date` | Date | **วันที่จ่ายยอดคงเหลือ** (GAS ต้องการคอลัมน์นี้) |

### วิธีเพิ่มคอลัมน์:

1. เปิด Google Sheet ของคุณ
2. คลิกขวาที่คอลัมน์ V (`deposit_slip_url`)
3. เลือก "Insert 1 column left"
4. ตั้งชื่อ header ใหม่เป็น `remaining_paid_date`
5. ทำซ้ำกับทุก Event Sheet ที่ใช้ระบบ Deposit Payment

## 🔧 GAS Code Behavior

เมื่อสมาชิกอัพโหลดสลิปผ่าน GAS Web App:

### Payment Type: `full` (ชำระเต็มจำนวน)
- อัพเดทคอลัมน์ `slip_url` → URL ของไฟล์ที่อัพโหลด
- อัพเดทคอลัมน์ `payment_status` → "รอตรวจสอบ"

### Payment Type: `deposit` (มัดจำ)
- อัพเดทคอลัมน์ `deposit_slip_url` → URL ของไฟล์ที่อัพโหลด
- อัพเดทคอลัมน์ `deposit_paid_date` → วันที่ปัจจุบัน (YYYY-MM-DD)
- อัพเดทคอลัมน์ `payment_status` → "รอตรวจสอบมัดจำ"

### Payment Type: `remaining` (ยอดคงเหลือ)
- อัพเดทคอลัมน์ `remaining_slip_url` → URL ของไฟล์ที่อัพโหลด
- อัพเดทคอลัมน์ `remaining_paid_date` → วันที่ปัจจุบัน (YYYY-MM-DD)
- อัพเดทคอลัมน์ `payment_status` → "รอตรวจสอบยอดคงเหลือ"

## 📝 Notes

1. คอลัมน์ที่มี `**bold**` คือคอลัมน์ที่ GAS จะอัพเดทโดยอัตโนมัติ
2. Header names ต้องตรงกับที่ระบุ (case-insensitive แต่แนะนำให้ใช้ lowercase + underscore)
3. ถ้าคอลัมน์ไหนไม่มี GAS จะข้ามการอัพเดทคอลัมน์นั้น (ไม่ error)
4. สำหรับ Event แบบชำระเต็มจำนวน (Full Payment) จะใช้คอลัมน์ `slip_url` แทน

## 🔗 Related Files

- GAS Code: `gas-upload-slip/Code.gs`
- GAS Upload Form: `gas-upload-slip/UploadForm.html`
- Event Page (Frontend): `src/app/events/[eventId]/page.tsx`
- Event Type Definitions: `src/types/event.ts`
