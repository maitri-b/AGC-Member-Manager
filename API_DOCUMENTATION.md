# API Documentation - Agents Club Member Manager

> เอกสารนี้รวบรวม API Endpoints ทั้งหมดของระบบ Agents Club Member Manager
> จัดหมวดหมู่ตามฟีเจอร์หลัก พร้อมระบุ HTTP Method, Authentication และ Permission ที่จำเป็น

**วันที่อัปเดต:** 2024

---

## สารบัญ (Table of Contents)

1. [Authentication & Authorization](#1-authentication--authorization)
2. [Admin - Users Management](#2-admin---users-management)
3. [Admin - Events Management](#3-admin---events-management)
4. [Admin - Applications & Verifications](#4-admin---applications--verifications)
5. [Admin - Bank Accounts](#5-admin---bank-accounts)
6. [Admin - Settings](#6-admin---settings)
7. [Admin - Operations](#7-admin---operations)
8. [Members Management](#8-members-management)
9. [Events (Member-facing)](#9-events-member-facing)
10. [Event Registration](#10-event-registration)
11. [Carpool Management](#11-carpool-management)
12. [Party Tables Management](#12-party-tables-management)
13. [Payments Management](#13-payments-management)
14. [Profile Management](#14-profile-management)
15. [LINE Integration](#15-line-integration)
16. [Utilities & Debug](#16-utilities--debug)

---

## 1. Authentication & Authorization

### 1.1 NextAuth
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth.js authentication endpoints | No | - |

### 1.2 Impersonation (Admin)
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/impersonate` | POST | เริ่มการ impersonate user อื่น | Yes | admin:access |
| `/api/admin/impersonate` | DELETE | หยุดการ impersonate | Yes | - |
| `/api/admin/impersonate` | GET | ตรวจสอบสถานะการ impersonate | Yes | - |

---

## 2. Admin - Users Management

### 2.1 Users
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/users` | GET | ดึงรายการ users ทั้งหมด | Yes | admin:users |
| `/api/admin/users` | PUT | อัปเดตข้อมูล user (role, memberId, assignedEvents) | Yes | admin:users |
| `/api/admin/users/search` | GET | ค้นหา users | Yes | admin:access |
| `/api/admin/users/note` | PUT | เพิ่ม/แก้ไข note ของ user | Yes | admin:users |
| `/api/admin/users/send-message` | POST | ส่ง LINE message ถึง users | Yes | admin:users |
| `/api/admin/members` | GET | ดึงรายการ members ทั้งหมด (รวม test accounts) | Yes | admin:access |
| `/api/admin/members/[userId]` | GET | ดึงข้อมูล member รายบุคคล | Yes | admin:access |

### 2.2 Staff Management
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/staff` | GET | ดึงรายการ staff ทั้งหมด | Yes | admin:access |

---

## 3. Admin - Events Management

### 3.1 Events CRUD
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/events` | GET | ดึงรายการ events ทั้งหมด | Yes | admin:access / events:manage-assigned |
| `/api/admin/events` | POST | สร้าง event ใหม่ | Yes | admin:access |
| `/api/admin/events` | PUT | อัปเดตข้อมูล event | Yes | admin:access / events:manage-assigned |
| `/api/admin/events` | DELETE | ลบ event | Yes | admin:access |
| `/api/admin/events/summary` | GET | ดึงสรุปข้อมูล events ทั้งหมด | Yes | admin:access |

### 3.2 Event Operations
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/events/[eventId]/pending-count` | GET | นับจำนวน registrations ที่รอดำเนินการ | Yes | admin:access / events:manage-assigned |
| `/api/admin/events/[eventId]/update-deadlines` | POST | อัปเดต payment deadlines สำหรับ event | Yes | admin:access / events:manage-assigned |
| `/api/admin/events/[eventId]/recalculate-deadlines` | POST | คำนวณ payment deadlines ใหม่ทั้งหมด | Yes | admin:access / events:manage-assigned |

---

## 4. Admin - Applications & Verifications

### 4.1 Membership Applications
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/applications` | GET | ดึงรายการใบสมัครสมาชิก (พร้อม search lock status) | Yes | admin:users |
| `/api/admin/applications` | PUT | อัปเดตสถานะใบสมัคร (approve/reject) | Yes | admin:users |
| `/api/admin/applications` | DELETE | ลบใบสมัคร | Yes | admin:users |

### 4.2 Verifications
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/verification` | GET | ดึงรายการคำขอยืนยันตัวตน | Yes | admin:users |
| `/api/admin/verification` | PUT | อัปเดตสถานะการยืนยันตัวตน (approve/reject) | Yes | admin:users |

### 4.3 Dispute Requests
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/disputes` | GET | ดึงรายการ dispute requests | Yes | admin:users |
| `/api/admin/disputes` | PUT | จัดการ dispute request (approve/reject) | Yes | admin:users |

### 4.4 Contact Requests
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/contacts` | GET | ดึงรายการ contact requests | Yes | members:list |
| `/api/admin/contacts` | POST | สร้าง contact request ใหม่ | Yes | members:list |
| `/api/admin/contacts` | PUT | อัปเดตสถานะ contact request (resolve) | Yes | members:list |

### 4.5 Profile Change Requests
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/profile-changes` | GET | ดึงรายการคำขอแก้ไขข้อมูลส่วนตัว | Yes | admin:users |
| `/api/admin/profile-changes` | PUT | อนุมัติ/ปฏิเสธคำขอแก้ไขข้อมูล | Yes | admin:users |

---

## 5. Admin - Bank Accounts

| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/bank-accounts` | GET | ดึงรายการบัญชีธนาคารทั้งหมด | Yes | admin:access |
| `/api/admin/bank-accounts` | POST | สร้างบัญชีธนาคารใหม่ | Yes | admin:access |
| `/api/admin/bank-accounts` | PUT | อัปเดตข้อมูลบัญชีธนาคาร | Yes | admin:access |
| `/api/admin/bank-accounts` | DELETE | ลบบัญชีธนาคาร | Yes | admin:access |

---

## 6. Admin - Settings

### 6.1 System Settings
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/settings` | GET | ดึงการตั้งค่าระบบ | Yes | role:admin |
| `/api/admin/settings` | PUT | อัปเดตการตั้งค่าระบบ | Yes | role:admin |

### 6.2 Message Templates
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/settings/message-templates` | GET | ดึง message templates | Yes | role:admin |
| `/api/admin/settings/message-templates` | PUT | อัปเดต message templates | Yes | role:admin |
| `/api/admin/settings/message-templates/test` | POST | ทดสอบส่ง message template | Yes | role:admin |

---

## 7. Admin - Operations

### 7.1 Pending Counts
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/pending-counts` | GET | นับจำนวนรายการที่รอดำเนินการทั้งหมด | Yes | admin:access |

### 7.2 Attendance Cache
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/attendance-cache` | GET | ตรวจสอบสถานะ attendance cache | Yes | admin:access |
| `/api/admin/attendance-cache` | POST | Rebuild attendance cache | Yes | admin:access |

### 7.3 User Migration
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/migrate-users` | GET | ตรวจสอบสถานะการ migrate users | Yes | admin:access |
| `/api/admin/migrate-users` | POST | Migrate users จาก members collection | Yes | admin:access |

### 7.4 Payments (Admin)
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/admin/payments/upload-for-user` | POST | Admin อัปโหลด payment slip ให้ user | Yes | admin:access |

---

## 8. Members Management

### 8.1 Public Member Endpoints
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/members` | GET | ดึงรายการ members (filtered by permissions) | Yes | members:list / members:view |
| `/api/members/[id]` | GET | ดึงข้อมูล member รายบุคคล | Yes | members:view / members:self |
| `/api/members/[id]` | PUT | อัปเดตข้อมูล member | Yes | members:edit / members:self |
| `/api/members/attendance` | GET | ดึงข้อมูลการเข้าร่วมกิจกรรมของ member | Yes | members:view |

### 8.2 Member Status Management
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/members/[id]/update-status` | PUT | อัปเดตสถานะสมาชิก | Yes | members:edit |
| `/api/members/[id]/update-line-group-status` | PUT | อัปเดตสถานะ LINE Group | Yes | members:edit |
| `/api/member/status-check` | GET | ตรวจสอบสถานะสมาชิกปัจจุบัน | Yes | - |

### 8.3 License Upload
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/members/upload-license` | POST | อัปโหลดรูปใบอนุญาต | Yes | members:self |

---

## 9. Events (Member-facing)

### 9.1 Event Listing & Detail
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events` | GET | ดึงรายการ events (published events for members) | Yes | - |
| `/api/events/[eventId]` | GET | ดึงข้อมูล event รายการเดียว | Yes | - |
| `/api/events/[eventId]/detail` | GET | ดึงรายละเอียด event พร้อมข้อมูล registration ของ user | Yes | - |

### 9.2 Event Reports
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events/attendance` | GET | ดึงข้อมูลการเข้าร่วมกิจกรรมทั้งหมด | Yes | admin:access / events:manage-assigned |
| `/api/events/report` | GET | ดึงรายงาน events | Yes | admin:access / events:manage-assigned |

---

## 10. Event Registration

### 10.1 Registration CRUD
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events/[eventId]/register` | POST | ลงทะเบียนเข้าร่วม event (member) | Yes | - |
| `/api/events/[eventId]/register-on-behalf` | POST | Admin ลงทะเบียนแทน user | Yes | admin:access / events:manage-assigned |
| `/api/events/[eventId]/update-registration` | PUT | อัปเดตข้อมูลการลงทะเบียน (member) | Yes | - |
| `/api/events/[eventId]/admin-update-registration` | PUT | Admin อัปเดตข้อมูลการลงทะเบียน | Yes | admin:access / events:manage-assigned |
| `/api/events/[eventId]/admin-update-registration` | DELETE | Admin ลบการลงทะเบียน | Yes | admin:access / events:manage-assigned |
| `/api/events/[eventId]/cancel-registration` | POST | ยกเลิกการลงทะเบียน | Yes | - |

### 10.2 My Registrations
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/my-registrations` | GET | ดึงรายการลงทะเบียนของ user ปัจจุบัน | Yes | - |
| `/api/registrations/[registrationId]` | GET | ดึงข้อมูลการลงทะเบียนรายการเดียว | Yes | - |

### 10.3 Payment Updates
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events/[eventId]/update-payment` | PUT | อัปเดตสถานะการชำระเงิน | Yes | admin:access / events:manage-assigned |

### 10.4 Discounts & Special Charges
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events/[eventId]/discounts` | POST | เพิ่มส่วนลดให้การลงทะเบียน | Yes | admin:access / events:manage-assigned |
| `/api/events/[eventId]/discounts` | DELETE | ลบส่วนลด | Yes | admin:access / events:manage-assigned |
| `/api/events/[eventId]/special-charges` | POST | เพิ่มค่าใช้จ่ายพิเศษ | Yes | admin:access / events:manage-assigned |
| `/api/events/[eventId]/special-charges` | DELETE | ลบค่าใช้จ่ายพิเศษ | Yes | admin:access / events:manage-assigned |

### 10.5 Receipts
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events/[eventId]/receipt` | GET | ดึงข้อมูลใบเสร็จ | Yes | - |
| `/api/receipt-pdf` | GET | ดึงรายการ receipts ทั้งหมด | Yes | admin:access |
| `/api/receipt-pdf` | POST | สร้าง PDF receipt | Yes | - |

---

## 11. Carpool Management

### 11.1 Carpool CRUD
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/carpools` | POST | สร้าง carpool ใหม่ | Yes | - |
| `/api/carpools/[carpoolId]` | GET | ดึงข้อมูล carpool | Yes | - |
| `/api/carpools/[carpoolId]` | PUT | อัปเดตข้อมูล carpool | Yes | - |
| `/api/carpools/[carpoolId]` | DELETE | ลบ carpool | Yes | - |

### 11.2 Carpool Members
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/carpools/[carpoolId]/add-members` | POST | เพิ่มสมาชิกเข้า carpool | Yes | - |
| `/api/carpools/[carpoolId]/remove-members` | POST | ลบสมาชิกออกจาก carpool | Yes | - |

### 11.3 Car Number Assignment
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/carpools/[carpoolId]/assign-car-number` | PUT | มอบหมายหมายเลขรถ | Yes | admin:access / events:manage-assigned |
| `/api/carpools/[carpoolId]/unassign-car-number` | PUT | ยกเลิกหมายเลขรถ | Yes | admin:access / events:manage-assigned |

### 11.4 Event Carpools
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events/[eventId]/carpools` | GET | ดึงรายการ carpools ของ event | Yes | - |
| `/api/events/[eventId]/carpools/search` | GET | ค้นหา carpools | Yes | - |
| `/api/events/[eventId]/my-carpool` | GET | ดึงข้อมูล carpool ของ user | Yes | - |
| `/api/events/[eventId]/car-assignments` | GET | ดึงรายการมอบหมายหมายเลขรถ | Yes | admin:access / events:manage-assigned |

---

## 12. Party Tables Management

### 12.1 Party Table CRUD
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/party-tables` | POST | สร้าง party table ใหม่ | Yes | - |
| `/api/party-tables/create-reservation` | POST | สร้าง reservation สำหรับ party table | Yes | - |
| `/api/party-tables/[tableId]` | GET | ดึงข้อมูล party table | Yes | - |
| `/api/party-tables/[tableId]` | PUT | อัปเดตข้อมูล party table | Yes | - |
| `/api/party-tables/[tableId]` | DELETE | ลบ party table | Yes | - |

### 12.2 Party Table Members
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/party-tables/[tableId]/add-members` | POST | เพิ่มสมาชิกเข้า party table | Yes | - |
| `/api/party-tables/[tableId]/remove-members` | POST | ลบสมาชิกออกจาก party table | Yes | - |

### 12.3 Table Number Assignment
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/party-tables/[tableId]/assign-number` | POST | มอบหมายหมายเลขโต๊ะ | Yes | admin:access / events:manage-assigned |
| `/api/party-tables/[tableId]/unassign-number` | POST | ยกเลิกหมายเลขโต๊ะ | Yes | admin:access / events:manage-assigned |

### 12.4 Event Party Tables
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events/[eventId]/party-tables` | GET | ดึงรายการ party tables ของ event | Yes | - |
| `/api/events/[eventId]/my-party-tables` | GET | ดึงข้อมูล party tables ของ user | Yes | - |

---

## 13. Payments Management

### 13.1 Payment Slips
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/payments` | GET | ดึงรายการ payment slips | Yes | admin:access / events:manage-assigned |
| `/api/payments/slips` | GET | ดึงรายการ payment slips ทั้งหมด | Yes | admin:access |
| `/api/payments/upload` | POST | อัปโหลด payment slip | Yes | - |
| `/api/payments/summary` | GET | ดึงสรุปการชำระเงิน | Yes | admin:access / events:manage-assigned |
| `/api/payments/check-pending` | GET | ตรวจสอบ payment slips ที่รอตรวจสอบ | Yes | - |

### 13.2 Payment Slip Actions
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/payments/[slipId]` | GET | ดึงข้อมูล payment slip รายการเดียว | Yes | - |
| `/api/payments/[slipId]` | PUT | อัปเดตข้อมูล payment slip | Yes | admin:access / events:manage-assigned |
| `/api/payments/[slipId]` | DELETE | ลบ payment slip | Yes | admin:access |
| `/api/payments/[slipId]/approve` | PUT | อนุมัติ payment slip | Yes | admin:access / events:manage-assigned |
| `/api/payments/[slipId]/reject` | PUT | ปฏิเสธ payment slip | Yes | admin:access / events:manage-assigned |

---

## 14. Profile Management

### 14.1 Profile
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/profile` | GET | ดึงข้อมูล profile ของ user ปัจจุบัน | Yes | - |
| `/api/profile` | PUT | อัปเดตข้อมูล profile | Yes | - |

### 14.2 Profile Change Requests
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/profile/change-request` | GET | ดึงคำขอแก้ไขข้อมูลของ user | Yes | - |
| `/api/profile/change-request` | POST | สร้างคำขอแก้ไขข้อมูล | Yes | - |

---

## 15. LINE Integration

### 15.1 LINE Notifications
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/line/send-notification` | POST | ส่ง LINE notification | Yes | admin:access |
| `/api/line/send-profile` | POST | ส่งข้อมูล profile ทาง LINE | Yes | members:self |
| `/api/line/send-verification-result` | POST | ส่งผลการยืนยันตัวตนทาง LINE | Yes | admin:users |

### 15.2 LINE Promotions
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/line/promote-event` | POST | ส่งข้อความโปรโมท event ทาง LINE | Yes | admin:access / events:manage-assigned |
| `/api/line/promotion-history` | GET | ดึงประวัติการโปรโมท | Yes | admin:access / events:manage-assigned |

### 15.3 LINE Message History
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/line/message-history` | GET | ดึงประวัติ LINE messages | Yes | admin:access |
| `/api/line/message-history` | POST | บันทึก LINE message ใหม่ | Yes | admin:access |

---

## 16. Utilities & Debug

### 16.1 Applications
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/apply` | POST | ส่งใบสมัครสมาชิก | Yes | - |
| `/api/apply` | GET | ดึงข้อมูลใบสมัครของ user | Yes | - |
| `/api/apply/check-license` | POST | ตรวจสอบใบอนุญาต | Yes | - |

### 16.2 Verifications
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/verification/request` | POST | ส่งคำขอยืนยันตัวตน | Yes | - |
| `/api/verification/request` | GET | ดึงคำขอยืนยันตัวตนของ user | Yes | - |
| `/api/verification/search` | POST | ค้นหาข้อมูลสมาชิกเพื่อยืนยันตัวตน | Yes | - |
| `/api/verification/dispute` | POST | ส่ง dispute request | Yes | - |
| `/api/verification/dispute` | GET | ดึง dispute requests ของ user | Yes | - |

### 16.3 Rooms
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/events/[eventId]/rooms` | GET | ดึงรายการห้องพักของ event | Yes | - |
| `/api/events/[eventId]/rooms` | POST | สร้างห้องพักใหม่ | Yes | admin:access / events:manage-assigned |
| `/api/events/[eventId]/rooms/[roomId]` | PUT | อัปเดตข้อมูลห้องพัก | Yes | admin:access / events:manage-assigned |
| `/api/events/[eventId]/rooms/[roomId]` | DELETE | ลบห้องพัก | Yes | admin:access / events:manage-assigned |

### 16.4 Image Upload
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/upload-image` | POST | อัปโหลดรูปภาพ (Firebase Storage) | Yes | - |

### 16.5 Settings (Public)
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/settings` | GET | ดึงการตั้งค่าระบบสาธารณะ | Yes | - |

### 16.6 Debug & Testing
| Endpoint | Method | คำอธิบาย | Auth | Permission |
|---------|---------|---------|------|-----------|
| `/api/debug-event` | GET | Debug event data | No | - |
| `/api/test/payment-validation` | GET | ทดสอบ payment validation logic | Yes | admin:access |

---

## Permission Levels

### Role-based Permissions

| Role | Permissions |
|------|-------------|
| **admin** | ทุก permissions |
| **committee** | members:list, members:view, members:edit, events:view |
| **event-co** | events:manage-assigned |
| **event-staff** | events:manage-assigned |
| **member** | members:self, events:view |
| **guest** | - |

### Permission Types

- `admin:access` - สิทธิ์ admin ทั่วไป
- `admin:users` - จัดการ users และ verifications
- `admin:roles` - เปลี่ยนแปลง roles ของ users
- `members:list` - ดูรายชื่อสมาชิก
- `members:view` - ดูข้อมูลสมาชิกรายบุคคล
- `members:edit` - แก้ไขข้อมูลสมาชิก
- `members:self` - จัดการข้อมูลตัวเอง
- `events:view` - ดู events
- `events:manage-assigned` - จัดการ events ที่ได้รับมอบหมาย

---

## Authentication Flow

### 1. LINE Login
1. User คลิก "เข้าสู่ระบบด้วย LINE"
2. Redirect ไป LINE Login
3. Callback มาที่ NextAuth
4. ระบบตรวจสอบว่า LINE User ID มี `memberId` หรือไม่
5. ถ้ามี → เข้าสู่ระบบสำเร็จ
6. ถ้าไม่มี → Redirect ไปหน้ายืนยันตัวตน

### 2. Verification Flow
1. User ค้นหาข้อมูลสมาชิก (`/api/verification/search`)
2. ส่งคำขอยืนยันตัวตน (`/api/verification/request`)
3. Admin อนุมัติ/ปฏิเสธ (`/api/admin/verification`)
4. ระบบส่ง LINE notification หา user
5. ถ้าอนุมัติ → Link LINE User ID กับ Member ID

### 3. Impersonation Flow (Admin)
1. Admin เลือก user ที่จะ impersonate
2. เรียก `/api/admin/impersonate` (POST)
3. ระบบสร้าง cookie `impersonating` และ `originalAdminId`
4. ระบบบันทึก audit log
5. Admin เห็นข้อมูลและทำงานในนามของ user นั้น
6. เรียก `/api/admin/impersonate` (DELETE) เพื่อหยุด

---

## Important Notes

### 1. Impersonation Mode
- APIs ที่เป็น member-facing ต้องใช้ `getEffectiveSession()` แทน `getServerSession()`
- Components ต้องใช้ `useEffectiveSessionContext()` แทน `useSession()`
- รายละเอียดใน `/CLAUDE.md` (impersonation-session-rules)

### 2. Firestore Query Rules
- ⚠️ **ห้าม** ใช้ `.where()` + `.orderBy()` ร่วมกัน (requires composite index)
- ควร fetch ข้อมูลมาแล้ว sort ใน JavaScript แทน
- รายละเอียดใน `/AGENTS.md` (firestore-rules)

### 3. Payment System
- รองรับทั้ง **Full Payment** และ **Deposit Payment** modes
- รองรับทั้ง **Immediate** และ **Deferred** payment timing
- Payment slips เก็บใน `paymentSlips` collection
- Registration data เก็บใน `eventRegistrations` collection

### 4. Deprecated Collections
- `members` collection → ย้ายไปใช้ `users` collection แล้ว
- ข้อมูลสมาชิกทั้งหมดอยู่ใน Google Sheets และ sync ไปยัง Firestore `users`

---

## Data Sources

### 1. Firestore Collections
- `users` - ข้อมูล users และ members
- `events` - กิจกรรมทั้งหมด
- `eventRegistrations` - การลงทะเบียนเข้าร่วมกิจกรรม
- `paymentSlips` - หลักฐานการชำระเงิน
- `carpools` - ข้อมูล carpools
- `partyTables` - ข้อมูล party tables
- `membershipApplications` - ใบสมัครสมาชิก
- `verificationRequests` - คำขอยืนยันตัวตน
- `disputeRequests` - คำร้องขัดแย้ง
- `contactRequests` - คำขอติดต่อสมาชิก
- `bankAccounts` - บัญชีธนาคาร
- `settings` - การตั้งค่าระบบ

### 2. Google Sheets
- Members database (master data)
- Event registrations (legacy, migrated to Firestore)

### 3. Firebase Storage
- Payment slips
- License photos
- Event images
- QR codes

---

## Error Handling

### Common HTTP Status Codes
- `200 OK` - สำเร็จ
- `201 Created` - สร้างสำเร็จ
- `400 Bad Request` - ข้อมูลไม่ถูกต้อง
- `401 Unauthorized` - ไม่ได้ login
- `403 Forbidden` - ไม่มีสิทธิ์
- `404 Not Found` - ไม่พบข้อมูล
- `409 Conflict` - ข้อมูลซ้ำ
- `500 Internal Server Error` - เกิดข้อผิดพลาดในระบบ

---

## ติดต่อ & สนับสนุน

หากพบปัญหาหรือต้องการสอบถามเพิ่มเติม กรุณาติดต่อทีมพัฒนา

**Last Updated:** 2024
**Version:** 2.0
