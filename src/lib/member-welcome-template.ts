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
  } = data;

  return `สวัสดีครับ คุณ${memberName}
บริษัท ${companyName}

ยินดีต้อนรับสู่ Agents Club!
คำขอสมัครสมาชิกของคุณได้รับการอนุมัติเรียบร้อยแล้ว

📋 รายละเอียดสมาชิก:
• หมายเลขสมาชิก: ${memberId}
• บริษัท: ${companyName}
• ใบอนุญาต: ${licenseNumber}
• สถานะ: ${status}

คุณสามารถเข้าสู่ระบบเพื่อ:
✓ ตรวจสอบกิจกรรมของชมรม
✓ ลงทะเบียนเข้าร่วมกิจกรรมต่างๆ
✓ อัพเดทข้อมูลส่วนตัว

🔗 เข้าสู่ระบบ: ${baseUrl}

📌 หมายเหตุ:
LINE กลุ่ม Agents Club ปัจจุบันมีสมาชิกเต็มแล้ว
ระบบจะเพิ่มคุณเข้ากลุ่มตาม Waiting List
เมื่อมีที่ว่างจากสมาชิกเดิมออกจากห้อง

ขอบคุณครับ`;
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
