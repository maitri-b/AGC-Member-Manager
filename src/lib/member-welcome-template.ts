/**
 * Member Welcome Message Template
 * Sent when a new member is approved
 */

export interface MemberWelcomeData {
  memberName: string;
  companyName: string;
  memberId: string;
  licenseNumber: string;
  status: string;
  baseUrl: string;
  licenseStatus?: string; // สถานะใบอนุญาต
}

/**
 * Generate welcome message for newly approved member
 */
export function generateWelcomeMessage(data: MemberWelcomeData): string {
  const {
    memberName,
    companyName,
    memberId,
    licenseNumber,
    status,
    baseUrl,
    licenseStatus,
  } = data;

  // Build license status message conditionally
  const licenseStatusMessage = licenseStatus === 'รอตรวจสอบ'
    ? '\n\n⚠️ สถานะใบอนุญาต: รอตรวจสอบข้อมูลใบอนุญาตธุรกิจนำเที่ยว'
    : '';

  return `🎉 ยินดีต้อนรับสู่ Agents Club!

สวัสดีครับ คุณ${memberName} 🙏
บริษัท ${companyName}

ขอแสดงความยินดี! ใบสมัครสมาชิกของคุณได้รับการอนุมัติแล้ว

👤 ข้อมูลสมาชิก
• หมายเลขสมาชิก: ${memberId}
• บริษัท: ${companyName}
• ใบอนุญาต: ${licenseNumber}${licenseStatusMessage}

📱 ขั้นตอนถัดไป
1. โปรดตรวจสอบข้อมูลสมาชิกของคุณ
2. เริ่มเข้าร่วมกิจกรรมได้ทันที!
3. รอคำเชิญเข้ากลุ่ม Line โดยปัจจุบันสมาชิกใน Line กลุ่มเต็ม 500 ท่านแล้ว
อาจจะใช้เวลารอคิวเข้ากลุ่ม 1-2 เดือน นายทะเบียนของชมรมจะติดต่อคุณ เมื่อถึงคิวที่จะเชิญท่านเข้ากลุ่ม

🔗 เข้าสู่ระบบ: ${baseUrl}

ขอบคุณที่เป็นส่วนหนึ่งของครอบครัว Agents Club
Helping & Sharing 💚`;
}

/**
 * Generate rejection message
 */
export function generateRejectionMessage(data: {
  memberName?: string;
  reason: string;
  baseUrl: string;
}): string {
  const { memberName, reason, baseUrl } = data;

  const greeting = memberName ? `สวัสดีครับ คุณ${memberName}` : 'สวัสดีครับ';

  return `${greeting}

ขออภัย คำขอสมัครสมาชิกของคุณไม่ผ่านการอนุมัติ

เหตุผล: ${reason}

หากคุณต้องการสอบถามเพิ่มเติม
กรุณาติดต่อทีมงานผ่าน LINE Official Account
หรือผ่านระบบ: ${baseUrl}/dashboard

ขอบคุณครับ`;
}
