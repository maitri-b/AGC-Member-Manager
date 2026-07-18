# Payment System Test Scenarios & Checklist

> **Test Configuration**:
> - ค่าเข้าร่วมกิจกรรม: ฿100
> - ค่าห้องพักเดี่ยว: ฿50
> - **รวมทั้งหมด (Total Amount)**: ฿150

---

## 📋 Group A: Full Payment Mode - Perfect Payment (ชำระพอดี)

### ✅ A1: ชำระเต็มจำนวนครั้งเดียว

**Steps**:
1. Member อัพโหลดสลิป ฿150
2. Admin อนุมัติสลิป

**Expected Results**:
- [x] `paidAmount` = ฿150
- [x] `totalAmount` = ฿150
- [x] `payment_status` = "ชำระเต็มจำนวนแล้ว"
- [x] `status` = "ยืนยันแล้ว"
- [x] `overpayment_amount` = 0

**UI Checks (Member)**:
- [x] แสดงสถานะเขียว "ชำระครบแล้ว"
- [x] ยอดคงเหลือค้างชำระ: ฿0
- [x] Badge สีเขียว

**UI Checks (Admin)**:
- [x] แสดงสถานะเขียว
- [x] ไม่มีข้อความเตือน
- [x] แสดงสลิปที่อนุมัติในตาราง

---

## 📋 Group B: Underpayment Cases (ชำระไว้ขาด)

### ✅ B1: ชำระไว้ขาดครั้งแรก

**Steps**:
1. Member อัพโหลดสลิป ฿100 (ขาดอีก ฿50)
2. Admin อนุมัติสลิป

**Expected Results**:
- [ ] `paidAmount` = ฿100
- [ ] `totalAmount` = ฿150
- [ ] `payment_status` = "รอชำระเพิ่มเติม" หรือ "รอชำระยอดที่เหลือ"
- [ ] `status` = "รอดำเนินการ"
- [ ] `overpayment_amount` = 0

**UI Checks (Member)**:
- [ ] สถานะเหลือง/น้ำเงิน "รอชำระยอดที่เหลือ"
- [ ] แสดง: ยอดรวม ฿150
- [ ] แสดง: ยอดชำระแล้ว ฿100
- [ ] แสดง: ยอดคงเหลือค้างชำระ ฿50

**UI Checks (Admin)**:
- [ ] แสดงสถานะ "รอชำระเพิ่มเติม"
- [ ] แสดงยอดคงเหลือ ฿50
- [ ] Badge สีเหลือง/น้ำเงิน

---

### ✅ B2: ชำระไว้ขาด → ชำระเพิ่มเติมให้พอดี

**Initial State**: `paidAmount` = ฿100, `totalAmount` = ฿150

**Steps**:
1. Member อัพโหลดสลิปเพิ่มเติม ฿50
2. Admin อนุมัติสลิป

**Expected Results**:
- [ ] `paidAmount` = ฿150
- [ ] `totalAmount` = ฿150
- [ ] `payment_status` = "ชำระเต็มจำนวนแล้ว"
- [ ] `status` = "ยืนยันแล้ว"
- [ ] `overpayment_amount` = 0

**UI Checks (Member)**:
- [ ] สถานะเปลี่ยนจากเหลือง → เขียว "ชำระครบแล้ว"
- [ ] แสดงสลิป 2 ใบในประวัติ (฿100, ฿50)
- [ ] ยอดชำระแล้ว: ฿150

**UI Checks (Admin)**:
- [ ] สถานะเปลี่ยนเป็นเขียว
- [ ] แสดงสลิปทั้ง 2 ใบที่อนุมัติแล้ว

---

### ✅ B3: ชำระไว้ขาด → Admin เพิ่มค่าใช้จ่ายเสริม (Special Charge)

**Initial State**: `paidAmount` = ฿100, `totalAmount` = ฿150

**Steps**:
1. Admin เพิ่ม Special Charge "ค่าอาหารเพิ่มเติม" ฿30

**Expected Results**:
- [ ] `paidAmount` = ฿100 (ไม่เปลี่ยน)
- [ ] `totalAmount` = ฿180 (เพิ่มขึ้น +฿30)
- [ ] `payment_status` = "รอชำระเพิ่มเติม"
- [ ] `status` = "รอดำเนินการ"
- [ ] `overpayment_amount` = 0

**UI Checks (Member)**:
- [ ] สถานะ "รอชำระเพิ่มเติม" (เหลือง/น้ำเงิน)
- [ ] ยอดรวมทั้งหมด: ฿180
- [ ] ยอดชำระแล้ว: ฿100
- [ ] ยอดคงเหลือค้างชำระ: ฿80
- [ ] แสดงรายการ Special Charge "ค่าอาหารเพิ่มเติม ฿30" ในตาราง

**UI Checks (Admin)**:
- [ ] แสดงรายการ Special Charge ใหม่
- [ ] แสดงยอดคงเหลือ ฿80
- [ ] Admin Notes บันทึกการเพิ่ม Special Charge

---

## 📋 Group C: Overpayment Cases (ชำระไว้เกิน)

### ✅ C1: ชำระเกินครั้งแรก

**Steps**:
1. Member อัพโหลดสลิป ฿200 (เกิน ฿50)
2. Admin อนุมัติสลิป

**Expected Results**:
- [ ] `paidAmount` = ฿200
- [ ] `totalAmount` = ฿150
- [ ] `payment_status` = "ชำระเกินจำนวน"
- [ ] `status` = "ยืนยันแล้ว"
- [ ] `overpayment_amount` = ฿50

**UI Checks (Member)**:
- [ ] สถานะฟ้า/cyan "ชำระเกินจำนวน"
- [ ] แสดงส่วน "ชำระไว้เกิน" สีน้ำเงิน:
  - [ ] ยอดรวมทั้งหมด: ฿150
  - [ ] ยอดชำระแล้ว: ฿200
  - [ ] ชำระไว้เกิน: ฿50

**UI Checks (Admin)**:
- [ ] สถานะ "ชำระเกินจำนวน" (cyan/blue)
- [ ] แสดงยอดเกิน ฿50 สีน้ำเงิน
- [ ] Badge สีฟ้า

---

### ✅ C2: ชำระพอดี → Admin ลดค่าใช้จ่าย (Discount)

**Initial State**: `paidAmount` = ฿150, `totalAmount` = ฿150

**Steps**:
1. Admin ให้ส่วนลด "Early Bird 20%" (ลด ฿30)

**Expected Results**:
- [ ] `paidAmount` = ฿150 (ไม่เปลี่ยน)
- [ ] `totalAmount` = ฿120 (ลดลง -฿30)
- [ ] `payment_status` = "ชำระเกินจำนวน"
- [ ] `status` = "ยืนยันแล้ว"
- [ ] `overpayment_amount` = ฿30

**UI Checks (Member)**:
- [ ] สถานะเปลี่ยนจากเขียว → ฟ้า "ชำระเกินจำนวน"
- [ ] ยอดรวมทั้งหมด: ฿120
- [ ] ยอดชำระแล้ว: ฿150
- [ ] ชำระไว้เกิน: ฿30 (สีน้ำเงิน)
- [ ] แสดงรายการ Discount "Early Bird 20% (-฿30)" ในตาราง

**UI Checks (Admin)**:
- [ ] แสดง Discount รายการใหม่
- [ ] แสดงยอดเกิน ฿30 สีน้ำเงิน
- [ ] Admin Notes บันทึกการให้ส่วนลด

---

### ✅ C3: ชำระเกิน → Admin คืนเงิน (Refund)

**Initial State**: `paidAmount` = ฿200, `totalAmount` = ฿150, `overpayment_amount` = ฿50

**Steps**:
1. Admin อัพโหลดสลิปคืนเงิน ฿50 (เลือก "โอนเงินคืน - Refund")
2. Admin อนุมัติสลิปคืนเงิน

**Expected Results**:
- [ ] `paidAmount` = ฿150 (ลดลง -฿50)
- [ ] `totalAmount` = ฿150 (ไม่เปลี่ยน)
- [ ] `totalRefunded` = ฿50
- [ ] `refundHistory` = JSON array มี 1 รายการ
- [ ] `payment_status` = "ชำระเต็มจำนวนแล้ว"
- [ ] `status` = "ยืนยันแล้ว"
- [ ] `overpayment_amount` = 0

**UI Checks (Member)**:
- [ ] สถานะเปลี่ยนจากฟ้า → เขียว "ชำระครบแล้ว"
- [ ] แสดง **Purple Refund Card**:
  - [ ] ยอดรวมทั้งหมด: ฿150
  - [ ] ยอดชำระแล้ว: ฿150 (แสดงว่าหักคืนเงินแล้ว)
  - [ ] ยอดคืนเงิน: -฿50 (สีม่วง)
  - [ ] ยอดคงเหลือสุทธิ: ฿150
- [ ] แสดงสลิปคืนเงินในตารางประวัติการชำระเงิน:
  - [ ] Badge สีแดง "💸คืน"
  - [ ] จำนวนเงิน: -฿50 (สีแดง)

**UI Checks (Admin)**:
- [ ] แสดงสลิปคืนเงินในตาราง
- [ ] สลิปคืนเงินมี Badge สีแดง "💸คืน"
- [ ] จำนวนเงินแสดงเป็น -฿50
- [ ] สถานะเขียว "ชำระครบแล้ว"

---

## 📋 Group D: Complex Scenarios (สถานการณ์ซับซ้อน)

### ✅ D1: Multi-Step Journey (ชำระขาด → เพิ่มค่าใช้จ่าย → ชำระเพิ่ม → ให้ส่วนลด → เกิน → คืนเงิน)

**Step 1: ชำระไว้ขาด**
- [ ] Member อัพโหลดสลิป ฿100 (ขาด ฿50)
- [ ] Admin อนุมัติ
- [ ] `paidAmount` = ฿100, `totalAmount` = ฿150
- [ ] สถานะ: "รอชำระเพิ่มเติม"

**Step 2: Admin เพิ่ม Special Charge**
- [ ] Admin เพิ่ม "ค่าขนส่ง" ฿20
- [ ] `paidAmount` = ฿100, `totalAmount` = ฿170
- [ ] สถานะ: "รอชำระเพิ่มเติม"
- [ ] ยอดคงเหลือ: ฿70

**Step 3: Member ชำระเพิ่ม**
- [ ] Member อัพโหลดสลิปเพิ่ม ฿80
- [ ] Admin อนุมัติ
- [ ] `paidAmount` = ฿180, `totalAmount` = ฿170
- [ ] สถานะ: "ชำระเกินจำนวน"
- [ ] `overpayment_amount` = ฿10

**Step 4: Admin ให้ส่วนลด**
- [ ] Admin ให้ส่วนลด "ส่วนลดสมาชิกพิเศษ" ฿30
- [ ] `paidAmount` = ฿180, `totalAmount` = ฿140
- [ ] สถานะ: "ชำระเกินจำนวน"
- [ ] `overpayment_amount` = ฿40

**Step 5: Admin คืนเงิน**
- [ ] Admin คืนเงิน ฿40
- [ ] `paidAmount` = ฿140, `totalAmount` = ฿140
- [ ] สถานะ: "ชำระเต็มจำนวนแล้ว"
- [ ] `overpayment_amount` = 0

**UI Checks (Member - Final State)**:
- [ ] แสดงสลิปทั้งหมด 3 ใบ: ฿100, ฿80, -฿40 (คืน)
- [ ] แสดง Special Charge "ค่าขนส่ง ฿20"
- [ ] แสดง Discount "ส่วนลดสมาชิกพิเศษ -฿30"
- [ ] แสดง Refund Card ยอดคืนเงิน ฿40
- [ ] สถานะสุดท้าย: เขียว "ชำระครบแล้ว"

**UI Checks (Admin - Final State)**:
- [ ] Payment History แสดงทุก transaction
- [ ] Special Charges และ Discounts แสดงในตาราง
- [ ] Refund slip แสดงด้วย badge สีแดง

---

### ✅ D2: Deposit Mode - ชำระมัดจำขาด → ชำระยอดคงเหลือเกิน → คืนเงิน

**Setup**: Event ใช้ Deposit Mode
- [ ] `depositAmount` = ฿80
- [ ] `remainingAmount` = ฿70
- [ ] `totalAmount` = ฿150

**Step 1: ชำระมัดจำขาด**
- [ ] Member อัพโหลดสลิปมัดจำ ฿70 (ขาด ฿10)
- [ ] Admin อนุมัติ
- [ ] `depositAmountPaid` = ฿70
- [ ] `depositPaid` = true
- [ ] สถานะ: "รอชำระยอดที่เหลือ"

**Step 2: ชำระยอดคงเหลือเกิน**
- [ ] Member อัพโหลดสลิปยอดคงเหลือ ฿90 (เกิน ฿10)
- [ ] Admin อนุมัติ
- [ ] `remainingAmountPaid` = ฿90
- [ ] `remainingPaid` = true
- [ ] `paidAmount` = ฿160
- [ ] สถานะ: "ชำระเกินจำนวน"
- [ ] `overpayment_amount` = ฿10

**Step 3: คืนเงิน**
- [ ] Admin คืนเงิน ฿10
- [ ] `paidAmount` = ฿150
- [ ] สถานะ: "ชำระเต็มจำนวนแล้ว"
- [ ] `overpayment_amount` = 0

**UI Checks**:
- [ ] แสดงทั้ง deposit และ remaining slips
- [ ] แสดง refund slip ด้วย badge สีแดง
- [ ] สถานะสุดท้าย: เขียว "ชำระครบแล้ว"

---

### ✅ D3: Pending Slips Validation Test

**Setup**:
- [ ] Member อัพโหลดสลิป ฿100
- [ ] สถานะสลิป: `pending` (ยังไม่อนุมัติ)

**Test 1: Block Special Charge**
- [ ] Admin พยายามเพิ่ม Special Charge
- [ ] ระบบ **block** และแสดง error:
  - [ ] "ไม่สามารถเพิ่มค่าใช้จ่ายได้ในขณะนี้"
  - [ ] "พบสลิปการชำระเงิน 1 รายการที่รอการอนุมัติ"
  - [ ] "กรุณาอนุมัติหรือปฏิเสธสลิปที่รออนุมัติทั้งหมดก่อน"

**Test 2: Block Discount**
- [ ] Admin พยายามเพิ่ม Discount
- [ ] ระบบ **block** และแสดง error:
  - [ ] "ไม่สามารถเพิ่มส่วนลดได้ในขณะนี้"
  - [ ] "พบสลิปการชำระเงิน 1 รายการที่รอการอนุมัติ"

**Test 3: After Approval**
- [ ] Admin อนุมัติสลิป
- [ ] Admin สามารถเพิ่ม Special Charge ได้
- [ ] Admin สามารถเพิ่ม Discount ได้

---

### ✅ D4: Cancellation + Full Refund

**Initial State**: `paidAmount` = ฿150, `totalAmount` = ฿150 (ชำระครบแล้ว)

**Steps**:
1. Member ขอยกเลิกการเข้าร่วม
2. Admin อัพโหลดสลิปคืนเงินเต็มจำนวน ฿150
   - Reason: "ยกเลิกการลงทะเบียน"
3. Admin อนุมัติสลิปคืนเงิน

**Expected Results**:
- [ ] `paidAmount` = ฿0
- [ ] `totalAmount` = ฿150 (ไม่เปลี่ยน)
- [ ] `totalRefunded` = ฿150
- [ ] `payment_status` = "คืนเงินแล้ว" หรือ "รอชำระเงิน"

**UI Checks (Member)**:
- [ ] แสดง Purple Refund Card
- [ ] ยอดคืนเงิน: -฿150
- [ ] สลิปคืนเงิน -฿150 ในประวัติ
- [ ] Badge สีแดง "💸คืน"

**UI Checks (Admin)**:
- [ ] แสดงสลิปคืนเงินในตาราง
- [ ] จำนวน: -฿150 สีแดง
- [ ] Admin Notes บันทึกเหตุผลการคืนเงิน

---

## 📊 Quick Test Matrix

| Scenario | Initial Paid | Total Amount | Final Paid | Final Total | Expected Status | Overpayment | Refunded |
|----------|-------------|--------------|------------|-------------|-----------------|-------------|----------|
| **A1** | ฿0 | ฿150 | ฿150 | ฿150 | ชำระครบแล้ว | ฿0 | ฿0 |
| **B1** | ฿0 | ฿150 | ฿100 | ฿150 | รอชำระเพิ่มเติม | ฿0 | ฿0 |
| **B2** | ฿100 | ฿150 | ฿150 | ฿150 | ชำระครบแล้ว | ฿0 | ฿0 |
| **B3** | ฿100 | ฿150 | ฿100 | ฿180 | รอชำระเพิ่มเติม | ฿0 | ฿0 |
| **C1** | ฿0 | ฿150 | ฿200 | ฿150 | ชำระเกินจำนวน | ฿50 | ฿0 |
| **C2** | ฿150 | ฿150 | ฿150 | ฿120 | ชำระเกินจำนวน | ฿30 | ฿0 |
| **C3** | ฿200 | ฿150 | ฿150 | ฿150 | ชำระครบแล้ว | ฿0 | ฿50 |
| **D4** | ฿150 | ฿150 | ฿0 | ฿150 | คืนเงินแล้ว | ฿0 | ฿150 |

---

## ✅ Overall System Checks

### Payment Status Badge Colors
- [ ] "ชำระครบแล้ว" = เขียว (green)
- [ ] "ชำระเกินจำนวน" = ฟ้า/cyan
- [ ] "รอชำระเพิ่มเติม" = เหลือง (yellow)
- [ ] "รอตรวจสอบสลิป" = ม่วง (purple)
- [ ] "ปฏิเสธสลิป" = แดง (red)
- [ ] "พ้นกำหนด" = แดง (red)

### UI Display Consistency
- [ ] ยอดเงินทุกตัวแสดงรูปแบบ ฿X,XXX (มี comma)
- [ ] Overpayment แสดงสีน้ำเงินทุกที่
- [ ] Refund Card แสดงสีม่วง (purple)
- [ ] Refund slips มี badge "💸คืน" สีแดง
- [ ] Refund amounts แสดงเป็น -฿X (มีเครื่องหมายลบ)

### Business Logic
- [ ] Special Charge → totalAmount เพิ่ม, paidAmount ไม่เปลี่ยน
- [ ] Discount → totalAmount ลด, paidAmount ไม่เปลี่ยน
- [ ] Refund → paidAmount ลด, totalAmount ไม่เปลี่ยน
- [ ] Pending slips block Special Charge/Discount operations
- [ ] Refund deducts proportionally from tracked amounts

### Payment History
- [ ] แสดงสลิปทั้งหมดตามลำดับเวลา
- [ ] Payment slips แสดงจำนวนเป็นบวก (฿X)
- [ ] Refund slips แสดงจำนวนเป็นลบ (-฿X)
- [ ] Badge สีถูกต้องตามประเภทสลิป

### Data Integrity
- [ ] `paidAmount` = sum of all approved payment slips - refunds
- [ ] `totalAmount` = base amount + special charges - discounts
- [ ] `overpaymentAmount` = max(0, paidAmount - totalAmount)
- [ ] `totalRefunded` = sum of all approved refund slips

---

## 🎯 Critical Edge Cases to Test

### Edge Case 1: Multiple Pending Slips
- [ ] Upload 3 pending slips
- [ ] Try to add Special Charge → should block
- [ ] Approve 1 slip → still 2 pending → should still block
- [ ] Approve all → should now allow

### Edge Case 2: Rapid Status Changes
- [ ] Underpaid → Add Special Charge → Overpaid → Give Discount → Back to exact amount
- [ ] Verify status updates correctly at each step

### Edge Case 3: Partial Refund
- [ ] Overpaid by ฿50
- [ ] Refund only ฿30
- [ ] Should still show overpayment ฿20

### Edge Case 4: Multiple Refunds
- [ ] Overpaid by ฿100
- [ ] Refund ฿50
- [ ] Refund ฿50 again
- [ ] Total refunded should be ฿100
- [ ] Both refund slips should appear in history

---

## 📝 Test Execution Notes

**Date**: ___________
**Tester**: ___________
**Environment**: ___________

### Issues Found:
1. ___________________________________________
2. ___________________________________________
3. ___________________________________________

### Notes:
___________________________________________
___________________________________________
___________________________________________

---

**Test Status**: ⬜ Not Started | 🟡 In Progress | ✅ Passed | ❌ Failed
