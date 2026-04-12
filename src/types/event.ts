// Event and Attendance Type Definitions
// Based on Agents Club Google Sheet - Event Registration Data

// Event registration from Google Sheet "10 Yearth Meeting registration"
export interface EventRegistration {
  // Registration Info
  registrationId: string;           // registration_id
  registrationDate: string;         // registration_date

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
  shirtFee: number;                 // shirt_fee
  totalAmount: number;              // total_amount
  slipUrl: string;                  // slip_url

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
  registrationFee: number;          // ค่าสมัคร (0 = ฟรี)
  registrationOpen: boolean;        // เปิดรับสมัคร
  documentName?: string;            // ชื่อเอกสารเพิ่มเติม
  documentUrl?: string;             // Link download เอกสาร
  mainImageUrl?: string;            // Link รูป Main Image (header)
  paymentAccountName?: string;      // ชื่อบัญชีธนาคาร
  paymentAccountNumber?: string;    // เลขที่บัญชีธนาคาร
  paymentQrCodeUrl?: string;        // Link รูป QR Code สำหรับสแกนจ่ายเงิน
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
  registrationFee: number;          // ค่าสมัคร (0 = ฟรี)
  registrationOpen: boolean;        // เปิดรับสมัคร
  documentName?: string;            // ชื่อเอกสารเพิ่มเติม
  documentUrl?: string;             // Link download เอกสาร
  mainImageUrl?: string;            // Link รูป Main Image (header)
  paymentAccountName?: string;      // ชื่อบัญชีธนาคาร
  paymentAccountNumber?: string;    // เลขที่บัญชีธนาคาร
  paymentQrCodeUrl?: string;        // Link รูป QR Code สำหรับสแกนจ่ายเงิน
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

export type AttendanceType =
  | 'agent'         // สมาชิก Agent Club
  | 'wholesales'    // Wholesales
  | 'land_operation' // Land Operation
  | 'guest'         // แขกรับเชิญ
  | string;

// Google Sheet column mapping for Event Registration
export const EVENT_REGISTRATION_COLUMN_MAP: Record<keyof EventRegistration, string> = {
  registrationId: 'registration_id',
  registrationDate: 'registration_date',
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
  shirtFee: 'shirt_fee',
  totalAmount: 'total_amount',
  slipUrl: 'slip_url',
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
    registrationOpen: false,
    documentName: '',
    documentUrl: '',
    mainImageUrl: '',
    paymentAccountName: '',
    paymentAccountNumber: '',
    paymentQrCodeUrl: '',
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
