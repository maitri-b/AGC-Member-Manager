// Member Profile Type Definition
// Based on Agents Club Google Sheet - Check_Member_List2023

export interface Member {
  // รหัสสมาชิก
  memberId: string;

  // Company Info
  companyNameEN: string; // บริษัท (ภาษาอังกฤษ)
  companyNameTH: string; // ชื่อบริษัทตามที่จดทะเบียน

  // Personal Info
  fullNameTH: string; // ชื่อ-นามสกุล (ภาษาไทย)
  nickname: string; // ขื่อเล่น

  // LINE Info
  lineId: string; // ไอดี ไลน์
  lineName: string; // ชื่อไลน์

  // Contact
  phone: string; // เบอร์โทร
  mobile: string; // เบอร์มือถือ
  email: string; // อีเมล
  website: string; // เว็บไซต์

  // License Info (ใบอนุญาตนำเที่ยว)
  licenseNumber: string; // ใบอนุญาตนำเที่ยวเลขที่
  licenseExpiry: string; // วันหมดอายุ (ใบอนุญาต)

  // Position
  positionCompany: string; // ตำแหน่งในบริษัท
  positionClub: string; // ตำแหน่ง (ในสมาคม)

  // Membership
  membershipExpiry: string; // วันที่หมดอายุ (สมาชิกภาพ)
  status: MemberStatus; // สถานะ

  // Sponsor
  sponsor1: string; // ผู้รับรองสมาชิก ท่านที่ 1
  sponsor2: string; // ผู้รับรองสมาชิก ท่านที่ 2

  // LINE Group
  lineGroupStatus: string; // สถานะไลน์กลุ่ม
  lineGroupJoinDate: string; // วันที่เข้ากลุ่ม
  lineGroupJoinBy: string; // ผู้บันทึกเข้า
  lineGroupLeaveDate: string; // วันที่ออกจากกลุ่ม
  lineGroupLeaveBy: string; // ผู้บันทึกออก

  // System fields (for LINE login integration)
  lineUserId?: string; // LINE_UserID
  lastUpdated?: string; // LastUpdated
  updatedBy?: string; // UpdatedBy
  lineDisplayName?: string; // lineDisplayName
}

export type MemberStatus = 'Active' | 'Inactive' | 'Pending' | 'Suspended' | 'Expired' | string;

// Member ID generator helper
export function generateMemberId(year: number, runningNumber: number): string {
  const yearCode = year.toString().slice(-2);
  const runNo = runningNumber.toString().padStart(3, '0');
  return `${yearCode}${runNo}`;
}

// Parse member ID to get year and running number
export function parseMemberId(memberId: string): { year: number; runningNumber: number } | null {
  if (!memberId || memberId.length < 3) return null;

  // Try to parse flexible format
  const yearCode = parseInt(memberId.slice(0, 2), 10);
  const runningNumber = parseInt(memberId.slice(2), 10);

  if (isNaN(yearCode) || isNaN(runningNumber)) return null;

  // Assume 20xx century
  const year = 2000 + yearCode;

  return { year, runningNumber };
}

// Google Sheet column mapping (Check_Member_List2023)
export const SHEET_COLUMN_MAP: Record<keyof Member, string> = {
  memberId: 'MemberID',
  companyNameEN: 'บริษัท (ภาษาอังกฤษ)',
  fullNameTH: 'ชื่อ-นามสกุล (ภาษาไทย)',
  nickname: 'ขื่อเล่น',
  lineId: 'ไอดี ไลน์',
  lineName: 'ชื่อไลน์',
  phone: 'เบอร์โทร',
  mobile: 'เบอร์มือถือ',
  licenseNumber: 'ใบอนุญาตนำเที่ยวเลขที่',
  website: 'เว็บไซต์',
  email: 'อีเมล',
  licenseExpiry: 'วันหมดอายุ',
  positionCompany: 'ตำแหน่งในบริษัท',
  sponsor1: 'ผู้รับรองสมาชิก ท่านที่ 1',
  sponsor2: 'ผู้รับรองสมาชิก ท่านที่ 2',
  positionClub: 'ตำแหน่ง',
  companyNameTH: 'ชื่อบริษัทตามที่จดทะเบียน',
  status: 'สถานะ',
  membershipExpiry: 'วันที่หมดอายุ',
  lineGroupStatus: 'สถานะไลน์กลุ่ม',
  lineGroupJoinDate: 'วันที่เข้ากลุ่ม',
  lineGroupJoinBy: 'ผู้บันทึกเข้า',
  lineGroupLeaveDate: 'วันที่ออกจากกลุ่ม',
  lineGroupLeaveBy: 'ผู้บันทึกออก',
  lineUserId: 'LINE_UserID',
  lastUpdated: 'LastUpdated',
  updatedBy: 'UpdatedBy',
  lineDisplayName: 'lineDisplayName',
};

// Reverse mapping for sheet to member conversion
export const COLUMN_TO_MEMBER_MAP = Object.fromEntries(
  Object.entries(SHEET_COLUMN_MAP).map(([key, value]) => [value, key])
) as Record<string, keyof Member>;

// Helper to check if license is expiring soon (within N days)
export function isLicenseExpiringSoon(member: Member, days: number = 30): boolean {
  if (!member.licenseExpiry) return false;

  const expiry = parseThaiDate(member.licenseExpiry);
  if (!expiry) return false;

  const today = new Date();
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays > 0 && diffDays <= days;
}

// Helper to check if license is expired
export function isLicenseExpired(member: Member): boolean {
  if (!member.licenseExpiry) return false;

  const expiry = parseThaiDate(member.licenseExpiry);
  if (!expiry) return false;

  return expiry < new Date();
}

// Parse date format from Google Sheet column S (วันหมดอายุ)
// Format is MM/DD/YYYY (e.g., 5/2/2027 means May 2, 2027)
export function parseThaiDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try MM/DD/YYYY format (Google Sheet format - US)
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10) - 1; // Month is first
    const day = parseInt(parts[1], 10);       // Day is second
    let year = parseInt(parts[2], 10);

    // Convert Buddhist year to Gregorian if needed
    if (year > 2500) {
      year -= 543;
    }

    return new Date(year, month, day);
  }

  // Try ISO format
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  return null;
}
