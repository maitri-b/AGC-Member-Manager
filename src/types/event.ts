// Event and Attendance Type Definitions
// Based on Agents Club Google Sheet - Event Registration Data

// Event registration from Google Sheet "10 Yearth Meeting registration"
export interface EventRegistration {
  // Registration Info
  registrationId: string;           // registration_id
  registrationDate: string;         // registration_date
  eventId: string;                  // event_id (which event this registration is for)

  // Company Info
  companyName: string;              // company_name
  licenseNumber: string;            // license_number

  // Contact Info
  contactName: string;              // contact_name
  contactPhone: string;             // contact_phone
  contactEmail: string;             // contact_email
  lineUserId: string;               // LINE_userID (for user identification)
  memberId: string;                 // memberID (from member sheet)

  // Club Representative
  hasClubRep: boolean;              // has_club_rep
  lineRepName: string;              // line_rep_name

  // Attendees
  attendeeCount: number;            // attendee_count
  attendeeNames: string;            // attendee_names (comma-separated)

  // Merchandise
  shirtCount: number;               // shirt_count
  shirtSizes: string;               // shirt_sizes
  shirtReceived: boolean;           // shirt_received

  // Payment
  eventFee: number;                 // event_fee
  roomFee?: number;                 // room_fee (optional, for events with room allocation)
  shirtFee: number;                 // shirt_fee
  totalAmount: number;              // total_amount
  slipUrl: string;                  // slip_url (for full payment or legacy)

  // Full Payment Mode Fields (New - for paymentMode = 'full')
  fullPaymentDeadline?: string;     // full_payment_deadline - ISO timestamp when full payment is due
  fullPaymentPaid?: boolean;        // full_payment_paid - Has full payment been paid?
  fullPaymentPaidDate?: string;     // full_payment_paid_date - When full payment was paid (ISO timestamp)
  fullPaymentSlipUrl?: string;      // full_payment_slip_url - Slip for full payment
  fullPaymentAmountPaid?: number;   // full_payment_amount_paid - Actual amount paid (for validation)

  // Deposit Payment Mode Fields (for paymentMode = 'deposit')
  depositAmount: number;            // deposit_amount - Deposit for this registration
  remainingAmount: number;          // remaining_amount - Remaining balance
  depositPaid: boolean;             // deposit_paid - Has deposit been paid?
  depositPaidDate: string;          // deposit_paid_date - When deposit was paid (ISO timestamp)
  depositAmountPaid?: number;       // deposit_amount_paid - Actual deposit amount paid (for validation)
  remainingPaid?: boolean;          // remaining_paid - Has remaining been paid?
  remainingPaidDate: string;        // remaining_paid_date - When remaining was paid (ISO timestamp)
  remainingAmountPaid?: number;     // remaining_amount_paid - Actual remaining amount paid (for validation)
  depositSlipUrl: string;           // deposit_slip_url - Slip for deposit payment
  remainingSlipUrl: string;         // remaining_slip_url - Slip for remaining payment
  depositDeadline: string;          // deposit_deadline - ISO timestamp when deposit is due
  remainingDeadline: string;        // remaining_deadline - ISO timestamp when remaining is due

  // Payment Status
  paymentStatus: string;            // payment_status - Current computed payment status

  // Verification
  status: EventRegistrationStatus;  // status
  verifiedBy: string;               // verified_by
  verifiedDate: string;             // verified_date

  // Tokens & Codes
  clientToken: string;              // client_token
  codeParent: string;               // code_parent
  tableCode: string;                // table_code
  codeSplit: string;                // code_split

  // Event Day
  tableNumber: string;              // table_number
  checkinSections: string;          // checkin_sections
  cardReceived: boolean;            // card_received

  // Type
  attendanceType: AttendanceType;   // attendance_type

  // Notes
  specialRequests: string;          // special_requests
  adminNotes: string;               // admin_notes
  lastUpdateInfo: string;           // last_update_info

  // Attendee Type Pricing (New - for events with different attendee categories)
  attendeeTypeSelections?: string;  // attendee_type_selections (JSON stringified AttendeeTypeSelection[])

  // Room Allocation (New - for events with accommodation)
  roomAllocations?: string;         // room_allocations (JSON stringified RoomAllocation[])

  // Special Charges (New - admin can add custom charges to specific registrations)
  specialCharges?: string;          // special_charges (JSON stringified SpecialCharge[])

  // Cancellation Info (New - for tracking cancellation details)
  cancellationReason?: string;      // cancellation_reason - Reason for cancellation
  cancelledAt?: string;             // cancelled_at - ISO timestamp when cancelled

  // Payment Tracking (New - for tracking total paid amount and additional payments)
  paidAmount?: number;              // paid_amount - Total amount paid so far (deposit + remaining + additional)
  additionalPayments?: string;      // additional_payments - JSON stringified AdditionalPayment[]
}

// Event metadata (for managing multiple events)
export interface Event {
  eventId: string;                  // Unique event identifier (auto-generated or custom)
  eventName: string;                // ชื่อกิจกรรม
  eventNameEN: string;              // Event name in English
  eventDate: string;                // วันที่จัดกิจกรรม (DD/MM/YYYY or year)
  location: string;                 // สถานที่จัดกิจกรรม
  description: string;              // รายละเอียด
  sheetName: string;                // Google Sheet name for registration data
  year: number;                     // ปีของกิจกรรม (พ.ศ.)
  isActive: boolean;                // กิจกรรมที่กำลังดำเนินการ
  isPublished: boolean;             // แสดงในหน้าสมาชิก (เปิด/ปิด)
  countsAttendance: boolean;        // เก็บคะแนนการเข้าร่วม
  maxCapacity: number;              // จำนวนที่เปิดรับ (0 = ไม่จำกัด)
  maxPerCompany: number;            // จำนวนที่อนุญาตต่อ 1 บริษัท (0 = ไม่จำกัด)
  registrationFee: number;          // ค่าสมัคร (0 = ฟรี) - DEPRECATED: use pricingType instead
  pricingType?: 'fixed' | 'tiered'; // ประเภทการคิดราคา ('fixed' = ราคาเดียว, 'tiered' = ราคาตามจำนวนคน)
  baseFee?: number;                 // ราคาคนแรก (tiered pricing) - DEPRECATED: use priceTiers instead
  additionalFeePerPerson?: number;  // ราคาคนที่ 2+ (tiered pricing) - DEPRECATED: use priceTiers instead
  priceTiers?: PriceTier[];         // Array of price tiers (flexible multi-tier pricing)
  memberDiscount?: number;          // ส่วนลดสำหรับสมาชิก (บาท)
  registrationOpen: boolean;        // เปิดรับสมัคร
  documentName?: string;            // ชื่อเอกสารเพิ่มเติม
  documentUrl?: string;             // Link download เอกสาร
  mainImageUrl?: string;            // Link รูป Main Image (header)
  paymentBankName?: string;         // ชื่อธนาคาร
  paymentAccountName?: string;      // ชื่อบัญชีธนาคาร
  paymentAccountNumber?: string;    // เลขที่บัญชีธนาคาร
  paymentQrCodeUrl?: string;        // Link รูป QR Code สำหรับสแกนจ่ายเงิน
  paymentTerms?: string;            // เงื่อนไขการชำระเงิน (รองรับ markdown/plain text)
  paymentSlipSubmissionUrl?: string; // URL สำหรับส่งหลักฐานการชำระเงิน (Google Form / ฟอร์มอื่นๆ)
  paymentSlipButtonText?: string;   // ข้อความปุ่มส่งหลักฐานการชำระเงิน (Default: "ส่งหลักฐานการชำระเงิน")
  paymentInstructionText?: string;  // ข้อความคำแนะนำการชำระเงิน (แสดงก่อนปุ่ม)
  useExternalPaymentLink?: boolean; // true = เปิด URL ตรงๆ (Google Form/LINE), false/undefined = ใช้ GAS upload slip พร้อม parameters (Default: false)

  // Payment Configuration (New)
  paymentTiming?: 'deferred' | 'immediate'; // เวลาการชำระเงิน (Default: 'deferred' - ชำระหลังลงทะเบียน, 'immediate' - ชำระพร้อมลงทะเบียน)
  paymentMode?: 'full' | 'deposit'; // รูปแบบการชำระเงิน (Default: 'full')

  // Full Payment Deadline Configuration (for paymentMode = 'full')
  paymentDeadlineType?: 'none' | 'fixed' | 'hours'; // ประเภทกำหนดชำระเงิน (Full Payment Mode)
  paymentDeadlineFixed?: string;    // วันที่ตายตัว (YYYY-MM-DD)
  paymentDeadlineHours?: number;    // จำนวนชั่วโมงนับจากลงทะเบียน

  // Deposit Payment Configuration (for paymentMode = 'deposit')
  depositAmount?: number;           // จำนวนเงินมัดจำคงที่ (บาท)
  depositPercentage?: number;       // เปอร์เซ็นต์มัดจำ (%)
  useDepositPercentage?: boolean;   // ใช้เปอร์เซ็นต์หรือจำนวนคงที่

  // Deposit Deadline Configuration
  depositDeadlineType?: 'none' | 'fixed' | 'hours'; // ประเภทกำหนดชำระมัดจำ (Deposit Mode only)
  depositDeadlineFixed?: string;    // วันที่ตายตัว (YYYY-MM-DD)
  depositDeadlineHours?: number;    // จำนวนชั่วโมงนับจากลงทะเบียน

  // Remaining Balance Deadline Configuration
  remainingDeadlineType?: 'none' | 'fixed' | 'hours'; // ประเภทกำหนดชำระยอดคงเหลือ (Deposit Mode only)
  remainingDeadlineFixed?: string;  // วันที่ตายตัว (YYYY-MM-DD)
  remainingDeadlineHours?: number;  // จำนวนชั่วโมงนับจากชำระมัดจำ

  // Registration Edit Control
  allowMemberEdit?: boolean;        // อนุญาตให้สมาชิกแก้ไขข้อมูลการลงทะเบียนหลังจากลงทะเบียนแล้ว (Default: true)
  requireAttendeeNames?: boolean;    // จำเป็นต้องกรอกชื่อผู้เข้าร่วมกิจกรรม (Default: true) // ผู้เข้าร่วมคนแรกต้องเป็นสมาชิก (Default: false)

  // LINE Notification Control
  sendLineNotification?: boolean;    // ส่งการแจ้งเตือนผ่าน LINE ให้สมาชิกที่ลงทะเบียน (Default: true)

  // Attendee Type Pricing (New - for events with accommodation or different attendee categories)
  useAttendeeTypePricing?: boolean; // ใช้ระบบราคาตามประเภทผู้เข้าร่วม (Default: false)
  attendeeTypes?: AttendeeType[];   // ประเภทผู้เข้าร่วมและราคา

  // Room Allocation (New - for events with accommodation)
  roomTypes?: RoomType[];           // ประเภทห้องพักและราคา (only when useAttendeeTypePricing is true)

  createdAt: string;                // ISO timestamp
  updatedAt: string;                // ISO timestamp
  createdBy?: string;               // User ID who created the event
  updatedBy?: string;               // User ID who last updated the event
}

// Input type for creating/updating events (without auto-generated fields)
export interface EventInput {
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  location: string;
  description: string;
  sheetName: string;
  year: number;
  isActive: boolean;
  isPublished: boolean;             // แสดงในหน้าสมาชิก
  countsAttendance: boolean;        // เก็บคะแนนการเข้าร่วม
  maxCapacity: number;              // จำนวนที่เปิดรับ (0 = ไม่จำกัด)
  maxPerCompany: number;            // จำนวนที่อนุญาตต่อ 1 บริษัท (0 = ไม่จำกัด)
  registrationFee: number;          // ค่าสมัคร (0 = ฟรี) - DEPRECATED: use pricingType instead
  pricingType?: 'fixed' | 'tiered'; // ประเภทการคิดราคา
  baseFee?: number;                 // ราคาคนแรก (tiered pricing) - DEPRECATED: use priceTiers instead
  additionalFeePerPerson?: number;  // ราคาคนที่ 2+ (tiered pricing) - DEPRECATED: use priceTiers instead
  priceTiers?: PriceTier[];         // Array of price tiers (flexible multi-tier pricing)
  memberDiscount?: number;          // ส่วนลดสำหรับสมาชิก (บาท)
  registrationOpen: boolean;        // เปิดรับสมัคร
  documentName?: string;            // ชื่อเอกสารเพิ่มเติม
  documentUrl?: string;             // Link download เอกสาร
  mainImageUrl?: string;            // Link รูป Main Image (header)
  paymentBankName?: string;         // ชื่อธนาคาร
  paymentAccountName?: string;      // ชื่อบัญชีธนาคาร
  paymentAccountNumber?: string;    // เลขที่บัญชีธนาคาร
  paymentQrCodeUrl?: string;        // Link รูป QR Code สำหรับสแกนจ่ายเงิน
  paymentTerms?: string;            // เงื่อนไขการชำระเงิน (รองรับ markdown/plain text)
  paymentSlipSubmissionUrl?: string; // URL สำหรับส่งหลักฐานการชำระเงิน (Google Form / ฟอร์มอื่นๆ)
  paymentSlipButtonText?: string;   // ข้อความปุ่มส่งหลักฐานการชำระเงิน (Default: "ส่งหลักฐานการชำระเงิน")
  paymentInstructionText?: string;  // ข้อความคำแนะนำการชำระเงิน (แสดงก่อนปุ่ม)
  useExternalPaymentLink?: boolean; // true = เปิด URL ตรงๆ (Google Form/LINE), false/undefined = ใช้ GAS upload slip พร้อม parameters (Default: false)

  // Payment Configuration (New)
  paymentTiming?: 'deferred' | 'immediate'; // เวลาการชำระเงิน (Default: 'deferred' - ชำระหลังลงทะเบียน, 'immediate' - ชำระพร้อมลงทะเบียน)
  paymentMode?: 'full' | 'deposit'; // รูปแบบการชำระเงิน (Default: 'full')

  // Full Payment Deadline Configuration (for paymentMode = 'full')
  paymentDeadlineType?: 'none' | 'fixed' | 'hours'; // ประเภทกำหนดชำระเงิน (Full Payment Mode)
  paymentDeadlineFixed?: string;    // วันที่ตายตัว (YYYY-MM-DD)
  paymentDeadlineHours?: number;    // จำนวนชั่วโมงนับจากลงทะเบียน

  // Deposit Payment Configuration (for paymentMode = 'deposit')
  depositAmount?: number;           // จำนวนเงินมัดจำคงที่ (บาท)
  depositPercentage?: number;       // เปอร์เซ็นต์มัดจำ (%)
  useDepositPercentage?: boolean;   // ใช้เปอร์เซ็นต์หรือจำนวนคงที่

  // Deposit Deadline Configuration
  depositDeadlineType?: 'none' | 'fixed' | 'hours'; // ประเภทกำหนดชำระมัดจำ (Deposit Mode only)
  depositDeadlineFixed?: string;    // วันที่ตายตัว (YYYY-MM-DD)
  depositDeadlineHours?: number;    // จำนวนชั่วโมงนับจากลงทะเบียน

  // Remaining Balance Deadline Configuration
  remainingDeadlineType?: 'none' | 'fixed' | 'hours'; // ประเภทกำหนดชำระยอดคงเหลือ (Deposit Mode only)
  remainingDeadlineFixed?: string;  // วันที่ตายตัว (YYYY-MM-DD)
  remainingDeadlineHours?: number;  // จำนวนชั่วโมงนับจากชำระมัดจำ

  // Registration Edit Control
  allowMemberEdit?: boolean;        // อนุญาตให้สมาชิกแก้ไขข้อมูลการลงทะเบียนหลังจากลงทะเบียนแล้ว (Default: true)
  requireAttendeeNames?: boolean;    // จำเป็นต้องกรอกชื่อผู้เข้าร่วมกิจกรรม (Default: true) // ผู้เข้าร่วมคนแรกต้องเป็นสมาชิก (Default: false)

  // LINE Notification Control
  sendLineNotification?: boolean;    // ส่งการแจ้งเตือนผ่าน LINE ให้สมาชิกที่ลงทะเบียน (Default: true)

  // Attendee Type Pricing (New - for events with accommodation or different attendee categories)
  useAttendeeTypePricing?: boolean; // ใช้ระบบราคาตามประเภทผู้เข้าร่วม (Default: false)
  attendeeTypes?: AttendeeType[];   // ประเภทผู้เข้าร่วมและราคา

  // Room Allocation (New - for events with accommodation)
  roomTypes?: RoomType[];           // ประเภทห้องพักและราคา (only when useAttendeeTypePricing is true)
}

// Member attendance summary
export interface MemberAttendance {
  memberId: string;                 // MemberID from member sheet
  memberName: string;               // ชื่อสมาชิก
  companyName: string;              // ชื่อบริษัท
  licenseNumber: string;            // เลขใบอนุญาต
  eventsAttended: EventAttendanceRecord[];  // รายการกิจกรรมที่เข้าร่วม
  totalEventsThisYear: number;      // จำนวนกิจกรรมที่เข้าร่วมในปีนี้ (legacy - for backward compatibility)
  eventsLast12Months: number;       // จำนวนกิจกรรมใน 12 เดือนที่ผ่านมา
  lastAttendedEvent: string;        // กิจกรรมล่าสุดที่เข้าร่วม
  lastAttendedDate: string;         // วันที่เข้าร่วมล่าสุด (DD/MM/YYYY)
  noActivityWarning: boolean;       // แจ้งเตือนว่าไม่มีกิจกรรมใน 12 เดือนที่ผ่านมา
}

// Individual event attendance record
export interface EventAttendanceRecord {
  eventId: string;                  // Event identifier
  eventName: string;                // ชื่อกิจกรรม
  eventDate: string;                // วันที่กิจกรรม
  registrationId: string;           // Registration ID from event sheet
  attendeeNames: string;            // ชื่อผู้เข้าร่วม
  attendeeCount: number;            // จำนวนผู้เข้าร่วม
  status: EventRegistrationStatus;  // สถานะการลงทะเบียน
  checkedIn: boolean;               // เช็คอินแล้วหรือยัง
}

// Status types
export type EventRegistrationStatus =
  | 'pending'       // รอตรวจสอบ
  | 'confirmed'     // ยืนยันแล้ว
  | 'cancelled'     // ยกเลิก
  | 'waitlist'      // รายชื่อสำรอง
  | string;

// Payment Status types (New - for deposit payment system)
export type PaymentStatus =
  // Deposit mode statuses
  | 'รอชำระมัดจำ'           // Waiting for deposit payment
  | 'รอตรวจสอบมัดจำ'        // Deposit slip uploaded, pending review
  | 'ชำระมัดจำแล้ว'         // Deposit approved
  | 'รอชำระยอดคงเหลือ'      // Deposit paid, waiting for remaining balance
  | 'รอตรวจสอบยอดคงเหลือ'   // Remaining slip uploaded, pending review
  | 'ชำระยอดคงเหลือแล้ว'    // Remaining approved (fully paid for deposit mode)

  // Full payment mode statuses
  | 'รอชำระเงิน'            // Waiting for payment (full payment mode)
  | 'รอตรวจสอบ'             // Slip uploaded, pending review
  | 'ชำระเต็มจำนวนแล้ว'     // Fully paid (full payment mode)

  // Additional payment statuses (for amount adjustments)
  | 'รอชำระเงินเพิ่มเติม'    // Awaiting additional payment (after amount increase)
  | 'รอตรวจสอบเงินเพิ่มเติม' // Additional payment slip uploaded, pending review
  | 'ชำระครบถ้วนแล้ว'       // Fully paid including additional payments

  // Other statuses
  | 'พ้นกำหนด'              // Overdue (deadline passed)
  | 'ปฏิเสธสลิป'            // Slip rejected
  | 'ลงทะเบียนแล้ว'         // Legacy: registered (for free events)
  | string;

export type AttendanceType =
  | 'agent'         // สมาชิก Agent Club
  | 'wholesales'    // Wholesales
  | 'land_operation' // Land Operation
  | 'guest'         // แขกรับเชิญ
  | string;

// Price Tier (New - for flexible multi-tier pricing system)
export interface PriceTier {
  upToCount: number;             // จำนวนคนสูงสุดใน tier นี้ (e.g., 2 = applies to person 1-2)
  price: number;                 // ราคา (บาท)
  priceType: 'total' | 'per_person'; // 'total' = ราคารวม, 'per_person' = ราคาต่อคน
}

// Attendee Type Pricing (New - for events with different pricing per attendee category)
export interface AttendeeType {
  typeId: string;                // 'adult', 'child_with_bed', 'child_no_bed', 'infant', or custom
  typeName: string;              // 'ผู้ใหญ่', 'เด็กพักเพิ่มเตียง', 'เด็กไม่เพิ่มเตียง', 'ทารก'
  price: number;                 // Price for this attendee type
  description?: string;          // Optional description
  isActive: boolean;             // Admin can enable/disable
  sortOrder: number;             // Display order
}

export interface AttendeeTypeSelection {
  typeId: string;                // Reference to AttendeeType.typeId
  quantity: number;              // Number of attendees of this type
}

// Room Type (New - for events with accommodation)
export interface RoomType {
  typeId: string;                // 'single', 'double', 'twin', 'triple', or custom
  typeName: string;              // 'พักเดี่ยว', 'พักคู่ Double', 'พักคู่ Twin', 'พัก 3 ท่าน'
  capacity: number;              // Number of people per room (1, 2, 3)
  price: number;                 // Additional price for this room type
  note?: string;                 // Optional note/description for this room type
  isActive: boolean;             // Admin can enable/disable
  sortOrder: number;             // Display order
}

export interface RoomAllocation {
  roomTypeId: string;            // Reference to RoomType.typeId
  roomCount: number;             // Number of rooms of this type
}

// Special Charge (New - admin can add custom charges to specific registrations)
export interface SpecialCharge {
  chargeId: string;              // Unique ID for this charge
  description: string;           // Description of the charge (e.g., "ค่าตั๋วเครื่องบินเพิ่ม", "อัพเกรดห้อง")
  amount: number;                // Charge amount
  addedBy: string;               // Admin user ID who added this charge
  addedAt: string;               // ISO timestamp when added
}

// Additional Payment (New - for tracking additional payments when amount changes)
export interface AdditionalPayment {
  paymentId: string;             // Unique ID for this payment
  amount: number;                // Amount for this additional payment
  reason: string;                // Reason (e.g., "เพิ่มจำนวนผู้เข้าร่วมจาก 2 เป็น 3 คน")
  slipUrl?: string;              // URL of payment slip
  uploadedAt?: string;           // ISO timestamp when slip was uploaded
  approvedAt?: string;           // ISO timestamp when payment was approved
  approvedBy?: string;           // Admin user ID who approved
  rejectedAt?: string;           // ISO timestamp when payment was rejected
  rejectedBy?: string;           // Admin user ID who rejected
  rejectionReason?: string;      // Reason for rejection
  status: 'รอชำระ' | 'รอตรวจสอบ' | 'อนุมัติแล้ว' | 'ปฏิเสธ'; // Payment status
}

// Google Sheet column mapping for Event Registration
export const EVENT_REGISTRATION_COLUMN_MAP: Record<keyof EventRegistration, string> = {
  registrationId: 'registration_id',
  registrationDate: 'registration_date',
  eventId: 'event_id',
  companyName: 'company_name',
  licenseNumber: 'license_number',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
  lineUserId: 'line_userid',
  memberId: 'memberid',
  hasClubRep: 'has_club_rep',
  lineRepName: 'line_rep_name',
  attendeeCount: 'attendee_count',
  attendeeNames: 'attendee_names',
  shirtCount: 'shirt_count',
  shirtSizes: 'shirt_sizes',
  shirtReceived: 'shirt_received',
  eventFee: 'event_fee',
  roomFee: 'room_fee',
  shirtFee: 'shirt_fee',
  totalAmount: 'total_amount',
  slipUrl: 'slip_url',
  // Deposit payment fields (New)
  // See PAYMENT_SYSTEM.md for detailed payment flow documentation
  depositAmount: 'deposit_amount',           // Column R: Amount for deposit payment (in deposit mode)
  remainingAmount: 'remaining_amount',       // Column S: Amount for remaining payment (in deposit mode)
  depositPaid: 'deposit_paid',               // Column T: Boolean - set by Admin when deposit is verified
  depositPaidDate: 'deposit_paid_date',      // Column U: Date (YYYY-MM-DD) when deposit slip was uploaded by user (set by GAS)
  remainingPaidDate: 'remaining_paid_date',  // Column V: Date (YYYY-MM-DD) when remaining slip was uploaded by user (set by GAS)
  depositSlipUrl: 'deposit_slip_url',        // Column W: Google Drive URL for deposit payment slip
  remainingSlipUrl: 'remaining_slip_url',    // Column X: Google Drive URL for remaining payment slip
  depositDeadline: 'deposit_deadline',       // Column Y: ISO DateTime - deadline for deposit payment
  remainingDeadline: 'remaining_deadline',   // Column Z: ISO DateTime - deadline for remaining payment
  paymentStatus: 'payment_status',           // Column AA: Current payment status (see PAYMENT_SYSTEM.md for values)
  // End deposit payment fields
  status: 'status',
  verifiedBy: 'verified_by',
  verifiedDate: 'verified_date',
  clientToken: 'client_token',
  codeParent: 'code_parent',
  tableCode: 'table_code',
  codeSplit: 'code_split',
  tableNumber: 'table_number',
  checkinSections: 'checkin_sections',
  cardReceived: 'card_received',
  attendanceType: 'attendance_type',
  specialRequests: 'special_requests',
  adminNotes: 'admin_notes',
  lastUpdateInfo: 'last_update_info',
  // Attendee type pricing (New)
  attendeeTypeSelections: 'attendee_type_selections',
  // Room allocation (New)
  roomAllocations: 'room_allocations',
  // Special charges (New)
  specialCharges: 'special_charges',
  // Cancellation info (New)
  cancellationReason: 'cancellation_reason',
  cancelledAt: 'cancelled_at',
  // Payment tracking (New - for additional payments)
  paidAmount: 'paid_amount',
  additionalPayments: 'additional_payments',
  // Full Payment Mode Fields (New)
  fullPaymentDeadline: 'full_payment_deadline',
  fullPaymentPaid: 'full_payment_paid',
  fullPaymentPaidDate: 'full_payment_paid_date',
  fullPaymentSlipUrl: 'full_payment_slip_url',
  fullPaymentAmountPaid: 'full_payment_amount_paid',
  // Additional amount tracking fields (New - for flexible payment validation)
  depositAmountPaid: 'deposit_amount_paid',
  remainingPaid: 'remaining_paid',
  remainingAmountPaid: 'remaining_amount_paid',
};

// Reverse mapping for sheet to registration conversion
export const COLUMN_TO_EVENT_REGISTRATION_MAP = Object.fromEntries(
  Object.entries(EVENT_REGISTRATION_COLUMN_MAP).map(([key, value]) => [value, key])
) as Record<string, keyof EventRegistration>;

// Default events (fallback if Firestore is empty)
// These will be migrated to Firestore on first admin access
export const DEFAULT_EVENTS: Event[] = [
  {
    eventId: '10yearth-meeting-2026',
    eventName: '10 Yearth Meeting',
    eventNameEN: '10th Anniversary Meeting',
    eventDate: '2569',  // พ.ศ.
    location: 'TBD',
    description: 'งานครบรอบ 10 ปี Agents Club',
    sheetName: '10 Yearth Meeting',
    year: 2569,  // พ.ศ. 2569 = ค.ศ. 2026
    isActive: true,
    isPublished: true,
    countsAttendance: true,
    maxCapacity: 0,
    maxPerCompany: 0,
    registrationFee: 0,
    pricingType: 'fixed',
    baseFee: 0,
    additionalFeePerPerson: 0,
    memberDiscount: 0,
    registrationOpen: false,
    documentName: '',
    documentUrl: '',
    mainImageUrl: '',
    paymentBankName: '',
    paymentAccountName: '',
    paymentAccountNumber: '',
    paymentQrCodeUrl: '',
    paymentTerms: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Legacy export for backward compatibility
export const TRACKED_EVENTS = DEFAULT_EVENTS;

// Helper to check if a member meets minimum attendance requirement
export function meetsAttendanceRequirement(attendance: MemberAttendance, minEvents: number = 1): boolean {
  return attendance.eventsLast12Months >= minEvents;
}

// Helper to parse date from DD/MM/YYYY or YYYY format
export function parseEventDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try DD/MM/YYYY format
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    // Convert Buddhist year to Gregorian if year > 2500
    const gregorianYear = parseInt(year) > 2500 ? parseInt(year) - 543 : parseInt(year);
    return new Date(gregorianYear, parseInt(month) - 1, parseInt(day));
  }

  // Try YYYY format (year only - assume Jan 1)
  const yearMatch = dateStr.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    const gregorianYear = year > 2500 ? year - 543 : year;
    return new Date(gregorianYear, 0, 1);
  }

  return null;
}

// Helper to check if a date is within last N months
export function isWithinLastMonths(dateStr: string, months: number = 12): boolean {
  const date = parseEventDate(dateStr);
  if (!date) return false;

  const now = new Date();
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());

  return date >= cutoffDate;
}

// Helper to get current year (พ.ศ.)
export function getCurrentBuddhistYear(): number {
  return new Date().getFullYear() + 543;
}

// Helper to convert พ.ศ. to ค.ศ.
export function buddhistToGregorian(buddhistYear: number): number {
  return buddhistYear - 543;
}

// Helper to migrate legacy pricing to new tier system
export function migrateLegacyPricing(event: Event | EventInput): PriceTier[] | undefined {
  if (event.pricingType === 'tiered' && event.baseFee !== undefined && event.additionalFeePerPerson !== undefined) {
    // Convert old baseFee/additionalFeePerPerson to new tier system
    return [
      {
        upToCount: 1,
        price: event.baseFee,
        priceType: 'per_person'
      },
      {
        upToCount: 999,
        price: event.additionalFeePerPerson,
        priceType: 'per_person'
      }
    ];
  }
  return undefined;
}

// Helper to calculate event registration fee based on pricing type
export function calculateRegistrationFee(
  event: Event | EventInput,
  attendeeCount: number,
  isMember: boolean = true
): number {
  // Use new tier pricing system
  if (event.pricingType === 'tiered' && event.priceTiers && event.priceTiers.length > 0) {
    let totalFee = 0;
    let remainingCount = attendeeCount;

    // Sort tiers by upToCount ascending
    const sortedTiers = [...event.priceTiers].sort((a, b) => a.upToCount - b.upToCount);

    for (let i = 0; i < sortedTiers.length; i++) {
      const tier = sortedTiers[i];
      const prevTierMax = i > 0 ? sortedTiers[i - 1].upToCount : 0;
      const tierCapacity = tier.upToCount - prevTierMax;

      if (remainingCount <= 0) break;

      if (tier.priceType === 'total') {
        // Tier 1: Total price for up to N people
        if (attendeeCount <= tier.upToCount) {
          totalFee += tier.price;
          remainingCount = 0;
        } else if (i === 0) {
          // Only apply total price once for first tier
          totalFee += tier.price;
          remainingCount -= tier.upToCount;
        }
      } else {
        // Tier 2+: Price per person
        const countInThisTier = Math.min(remainingCount, tierCapacity);
        totalFee += countInThisTier * tier.price;
        remainingCount -= countInThisTier;
      }
    }

    // If there are still people beyond defined tiers, use last tier's price
    if (remainingCount > 0 && sortedTiers.length > 0) {
      const lastTier = sortedTiers[sortedTiers.length - 1];
      if (lastTier.priceType === 'per_person') {
        totalFee += remainingCount * lastTier.price;
      }
    }

    // Apply member discount if applicable
    const discount = isMember && event.memberDiscount ? event.memberDiscount : 0;
    return Math.max(0, totalFee - discount);
  }

  // Legacy tiered pricing (baseFee + additionalFeePerPerson)
  if (event.pricingType === 'tiered' && event.baseFee !== undefined && event.additionalFeePerPerson !== undefined) {
    // Tiered pricing: first person at baseFee, additional persons at additionalFeePerPerson
    const baseAmount = event.baseFee;
    const additionalAmount = (attendeeCount - 1) * event.additionalFeePerPerson;
    const totalBeforeDiscount = baseAmount + additionalAmount;

    // Apply member discount if applicable
    const discount = isMember && event.memberDiscount ? event.memberDiscount : 0;
    return Math.max(0, totalBeforeDiscount - discount);
  }

  // Fall back to legacy fixed pricing
  return event.registrationFee * attendeeCount;
}

// Helper to get pricing summary for display
export function getPricingSummary(event: Event | EventInput): string {
  // New tier pricing system
  if (event.pricingType === 'tiered' && event.priceTiers && event.priceTiers.length > 0) {
    const firstTier = event.priceTiers[0];

    if (firstTier.price === 0) {
      return 'ฟรี';
    }

    if (firstTier.priceType === 'total') {
      return `${firstTier.upToCount} คนแรก ${firstTier.price.toLocaleString()} บาท`;
    } else {
      return `เริ่มต้น ${firstTier.price.toLocaleString()} บาท/คน`;
    }
  }

  // Legacy tiered pricing (baseFee + additionalFeePerPerson)
  if (event.pricingType === 'tiered' && event.baseFee !== undefined && event.additionalFeePerPerson !== undefined) {
    if (event.baseFee === 0 && event.additionalFeePerPerson === 0) {
      return 'ฟรี';
    }
    // Simplified pricing display - just show starting price
    return `เริ่มต้น ${event.baseFee.toLocaleString()} บาท`;
  }

  // Legacy fixed pricing
  if (event.registrationFee === 0) {
    return 'ฟรี';
  }
  return `${event.registrationFee.toLocaleString()} บาท/คน`;
}
