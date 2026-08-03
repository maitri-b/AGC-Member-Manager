/**
 * Message Template System for Payment Reminders
 * Supports personalized LINE messages with auto-filled payment details
 */

import { EventRegistration } from '@/types/event';
import { Event } from '@/types/event';
import { formatThaiDate, formatThaiDateTime } from './date-utils';

export type MessageTemplateType =
  | 'remaining_payment'    // แจ้งชำระยอดคงเหลือ
  | 'full_payment'         // แจ้งชำระเต็มจำนวน
  | 'deadline_warning'     // แจ้งเตือนใกล้ครบกำหนด
  | 'overdue_notice'       // แจ้งเตือนพ้นกำหนด
  | 'application_approved' // แจ้งใบสมัครได้รับการอนุมัติ
  | 'application_rejected' // แจ้งใบสมัครไม่ได้รับการอนุมัติ
  | 'verification_reminder'// แจ้งเตือนให้ยืนยันตัวตน
  | 'license_renewal';     // แจ้งเตือนต่ออายุใบอนุญาต

export interface MessageTemplate {
  id: MessageTemplateType;
  name: string;
  description: string;
  template: string;
  variables: string[];
}

export interface PersonalizedMessageData {
  memberName: string;
  eventName: string;
  paymentType: 'deposit' | 'remaining' | 'full';
  paymentTypeLabel: string;
  amount: number;
  amountText: string;
  deadline?: string;
  deadlineText?: string;
  daysOverdue?: number;
  registrationId: string;
  eventLink?: string;
}

/**
 * Default message templates (can be customized)
 */
export const DEFAULT_TEMPLATES: Record<MessageTemplateType, MessageTemplate> = {
  remaining_payment: {
    id: 'remaining_payment',
    name: 'แจ้งชำระยอดคงเหลือ',
    description: 'ส่งให้ผู้ที่ชำระมัดจำแล้ว เพื่อแจ้งให้ชำระยอดคงเหลือ',
    template: `สวัสดีครับคุณ {{memberName}} 🙏

เรียนแจ้งการชำระยอดคงเหลือสำหรับ
📌 {{eventName}}

💰 ยอดคงเหลือที่ต้องชำระ: {{amountText}} บาท
📅 กำหนดชำระ: {{deadlineText}}

กรุณาชำระเงินและส่งหลักฐานการโอนผ่านระบบ
🔗 {{eventLink}}

หากมีข้อสงสัย กรุณาติดต่อทีมงาน
ขอบคุณครับ 😊`,
    variables: ['memberName', 'eventName', 'amountText', 'deadlineText', 'eventLink'],
  },

  full_payment: {
    id: 'full_payment',
    name: 'แจ้งชำระเต็มจำนวน',
    description: 'ส่งให้ผู้ที่ยังไม่ได้ชำระเงิน เพื่อแจ้งให้ชำระเต็มจำนวน',
    template: `สวัสดีครับคุณ {{memberName}} 🙏

เรียนแจ้งการชำระเงินสำหรับ
📌 {{eventName}}

💰 ค่าใช้จ่ายทั้งหมด: {{amountText}} บาท
📅 กำหนดชำระ: {{deadlineText}}

กรุณาชำระเงินและส่งหลักฐานการโอนผ่านระบบ
🔗 {{eventLink}}

รหัสลงทะเบียนของคุณ: {{registrationId}}

หากมีข้อสงสัย กรุณาติดต่อทีมงาน
ขอบคุณครับ 😊`,
    variables: ['memberName', 'eventName', 'amountText', 'deadlineText', 'eventLink', 'registrationId'],
  },

  deadline_warning: {
    id: 'deadline_warning',
    name: 'แจ้งเตือนใกล้ครบกำหนด',
    description: 'ส่งเตือนเมื่อใกล้ครบกำหนดชำระเงิน (เหลือเวลาไม่กี่วัน)',
    template: `สวัสดีครับคุณ {{memberName}} 🙏

⏰ เตือนความจำ: ใกล้ครบกำหนดชำระเงิน

📌 {{eventName}}
💰 ยอดที่ต้องชำระ: {{amountText}} บาท
📅 กำหนดชำระ: {{deadlineText}}

⚠️ กรุณาชำระเงินโดยเร็วเพื่อยืนยันการเข้าร่วม

ส่งหลักฐานการโอนผ่านระบบ:
🔗 {{eventLink}}

รหัสลงทะเบียน: {{registrationId}}

ขอบคุณครับ 😊`,
    variables: ['memberName', 'eventName', 'amountText', 'deadlineText', 'eventLink', 'registrationId'],
  },

  overdue_notice: {
    id: 'overdue_notice',
    name: 'แจ้งเตือนพ้นกำหนด',
    description: 'ส่งแจ้งเมื่อพ้นกำหนดชำระเงินแล้ว หากยังต้องการจองให้ติดต่อ admin',
    template: `สวัสดีครับคุณ {{memberName}} 🙏

แจ้งเตือน: พ้นกำหนดชำระเงินแล้ว

📌 {{eventName}}
💰 ยอดที่ต้องชำระ: {{amountText}} บาท
📅 กำหนดชำระเดิม: {{deadlineText}}
⚠️ พ้นกำหนดมาแล้ว {{daysOverdue}} วัน

หากท่านยังมีความประสงค์เข้าร่วมกิจกรรม
กรุณาติดต่อทีมงานโดยเร็ว
📞 Line: https://lin.ee/nzAjXXq

หรือส่งหลักฐานการโอนผ่านระบบ:
🔗 {{eventLink}}

รหัสลงทะเบียน: {{registrationId}}

ขอบคุณครับ 😊`,
    variables: ['memberName', 'eventName', 'amountText', 'deadlineText', 'daysOverdue', 'eventLink', 'registrationId'],
  },

  application_approved: {
    id: 'application_approved',
    name: 'แจ้งใบสมัครได้รับการอนุมัติ',
    description: 'ส่งแจ้งเมื่อใบสมัครสมาชิกได้รับการอนุมัติ',
    template: `🎉 ยินดีต้อนรับสู่ Agents Club!

สวัสดีครับคุณ {{memberName}} 🙏

ขอแสดงความยินดี! ใบสมัครสมาชิกของคุณได้รับการอนุมัติแล้ว

👤 ข้อมูลสมาชิก
• รหัสสมาชิก: {{memberId}}
• ชื่อ: {{fullName}}
• บริษัท: {{companyName}}

✅ สถานะ: {{memberStatus}}

📱 ขั้นตอนถัดไป
1. ตรวจสอบข้อมูลสมาชิกของคุณ
2. เข้ากลุ่ม LINE Agents Club (รอคำเชิญ)
3. เริ่มเข้าร่วมกิจกรรมได้ทันที!

🔗 ดูข้อมูลสมาชิกของคุณ: {{profileLink}}

ขอบคุณที่เป็นส่วนหนึ่งของครอบครัว Agents Club
Helping & Sharing 💚`,
    variables: ['memberName', 'memberId', 'fullName', 'companyName', 'memberStatus', 'profileLink'],
  },

  application_rejected: {
    id: 'application_rejected',
    name: 'แจ้งใบสมัครไม่ได้รับการอนุมัติ',
    description: 'ส่งแจ้งเมื่อใบสมัครสมาชิกไม่ได้รับการอนุมัติ',
    template: `📋 แจ้งผลการพิจารณาใบสมัครสมาชิก

สวัสดีครับคุณ {{memberName}} 🙏

ขออภัยค่ะ ใบสมัครสมาชิกของคุณยังไม่ได้รับการอนุมัติในครั้งนี้

⚠️ เหตุผล:
{{rejectionReason}}

📞 ติดต่อสอบถาม
หากมีข้อสงสัยหรือต้องการข้อมูลเพิ่มเติม
กรุณาติดต่อทีมงาน Agents Club
LINE: {{lineOfficialAccount}}

ขอบคุณที่สนใจเข้าร่วม Agents Club ค่ะ 🙏`,
    variables: ['memberName', 'rejectionReason', 'lineOfficialAccount'],
  },

  verification_reminder: {
    id: 'verification_reminder',
    name: 'แจ้งเตือนให้ยืนยันตัวตน',
    description: 'ส่งแจ้งให้สมาชิกที่ยังไม่ได้ยืนยันตัวตนดำเนินการยืนยัน',
    template: `สวัสดีครับ 🙏

ทางทีมทะเบียนชมรม Agents Club ตรวจพบว่า
คุณเป็นสมาชิกในระบบของเราแล้ว แต่ยังไม่ได้ทำการยืนยันตัวตน

📋 เพื่อให้สามารถใช้งานระบบได้เต็มรูปแบบ
กรุณายืนยันตัวตนผ่านลิงก์ด้านล่างนี้

🔗 ยืนยันตัวตนที่นี่: {{verificationLink}}

ระบุข้อมูลดังนี้:
• เลขที่ใบอนุญาตนำเที่ยว
• ชื่อบริษัท
• เบอร์โทรศัพท์

✅ หลังจากยืนยันตัวตนแล้ว คุณจะสามารถ:
• ดูข้อมูลสมาชิกของคุณ
• ลงทะเบียนเข้าร่วมกิจกรรม
• ตรวจสอบประวัติการเข้าร่วมกิจกรรม

หากมีข้อสงสัย กรุณาติดต่อทีมงาน
ขอบคุณครับ 😊

ทีมทะเบียนชมรม Agents Club`,
    variables: ['verificationLink'],
  },

  license_renewal: {
    id: 'license_renewal',
    name: 'แจ้งเตือนต่ออายุใบอนุญาต',
    description: 'แจ้งเตือนสมาชิกให้ต่ออายุใบอนุญาตธุรกิจนำเที่ยวก่อนหมดอายุ',
    template: `🔔 แจ้งเตือนต่ออายุใบอนุญาตธุรกิจนำเที่ยว

เรียน คุณ{{contactName}}
{{companyName}} (ทะเบียน {{licenseNumber}})

ใบอนุญาตธุรกิจนำเที่ยวของท่านจะหมดอายุวันที่ {{expiryDate}}

📌 กรุณาดำเนินการต่ออายุกับกรมการท่องเที่ยวก่อนวันหมดอายุ

⚠️ นโยบายชมรม:
สมาชิกต้องมีใบอนุญาตที่ยังไม่หมดอายุเท่านั้น หากไม่ต่ออายุ ชมรมขอสงวนสิทธิ์นำชื่อออกจากกลุ่ม

ℹ️ หมายเหตุ:
• ต่ออายุเลขที่เดิม: ไม่ต้องส่งหลักฐาน (ทีมทะเบียนอัปเดตจากเว็บกรมท่องเที่ยวทุกเดือน)
• ขอใบอนุญาตใหม่: โปรดติดต่อนายทะเบียนชมรม

ทีมทะเบียนชมรม Agents Club`,
    variables: ['contactName', 'companyName', 'licenseNumber', 'expiryDate'],
  },
};

/**
 * Calculate days until deadline
 * ✅ CRITICAL FIX: Use Thailand timezone (GMT+7) for accurate day calculation
 */
export function calculateDaysUntilDeadline(deadline: string): number {
  // ✅ CRITICAL FIX: Deadline is already stored as Thailand time in database
  // We only need to convert current time to Thailand timezone

  const deadlineDate = new Date(deadline);

  // Get current time and convert to Thailand timezone components
  const nowUTC = new Date();
  const nowThailandString = nowUTC.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  const nowThailand = new Date(nowThailandString);

  // Get deadline in Thailand timezone components
  const deadlineThailandString = deadlineDate.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  const deadlineThailand = new Date(deadlineThailandString);

  // Reset both to start of day for accurate day counting
  const nowDayStart = new Date(nowThailand.getFullYear(), nowThailand.getMonth(), nowThailand.getDate());
  const deadlineDayStart = new Date(deadlineThailand.getFullYear(), deadlineThailand.getMonth(), deadlineThailand.getDate());

  const diffTime = deadlineDayStart.getTime() - nowDayStart.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Format deadline text in Thai
 */
export function formatDeadlineText(deadline: string | undefined): string {
  if (!deadline) return 'ไม่ระบุ';

  const daysUntil = calculateDaysUntilDeadline(deadline);
  const dateText = formatThaiDate(deadline);

  if (daysUntil < 0) {
    return `${dateText} (พ้นกำหนดแล้ว ${Math.abs(daysUntil)} วัน)`;
  } else if (daysUntil === 0) {
    return `${dateText} (วันนี้!)`;
  } else if (daysUntil === 1) {
    return `${dateText} (พรุ่งนี้)`;
  } else if (daysUntil <= 3) {
    return `${dateText} (อีก ${daysUntil} วัน - เร่งด่วน!)`;
  } else if (daysUntil <= 7) {
    return `${dateText} (อีก ${daysUntil} วัน)`;
  } else {
    return dateText;
  }
}

/**
 * Determine payment type based on registration data
 */
export function determinePaymentType(
  registration: EventRegistration,
  event: Event
): { type: 'deposit' | 'remaining' | 'full'; label: string; amount: number } {
  const paymentMode = event.paymentMode || 'full';

  if (paymentMode === 'deposit') {
    // Deposit mode: check if deposit is paid
    if (registration.depositPaid && !registration.remainingPaid) {
      return {
        type: 'remaining',
        label: 'ยอดคงเหลือ',
        amount: registration.remainingAmount || 0,
      };
    } else {
      return {
        type: 'deposit',
        label: 'มัดจำ',
        amount: registration.depositAmount || 0,
      };
    }
  } else {
    // Full payment mode
    return {
      type: 'full',
      label: 'เต็มจำนวน',
      amount: registration.totalAmount || 0,
    };
  }
}

/**
 * Personalize message template with registration data
 * @param baseUrl Base URL of the application (from settings)
 */
export function personalizeMessage(
  templateType: MessageTemplateType,
  registration: EventRegistration,
  event: Event,
  customTemplate?: string,
  baseUrl?: string
): string {
  const template = customTemplate || DEFAULT_TEMPLATES[templateType].template;
  const paymentInfo = determinePaymentType(registration, event);

  // Determine deadline based on payment type
  let deadline: string | undefined;
  if (paymentInfo.type === 'deposit') {
    deadline = registration.depositDeadline || event.depositDeadlineFixed;
  } else if (paymentInfo.type === 'remaining') {
    deadline = registration.remainingDeadline;
  } else {
    deadline = registration.fullPaymentDeadline || registration.remainingDeadline;
  }

  // Calculate days overdue (if applicable)
  const daysOverdue = deadline ? Math.abs(Math.min(0, calculateDaysUntilDeadline(deadline))) : 0;

  // Use provided baseUrl or fallback to env variable or default
  const appBaseUrl = baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'https://agc-member-manager.vercel.app';

  // Build data object
  const data: PersonalizedMessageData = {
    memberName: registration.contactName || 'คุณสมาชิก',
    eventName: event.eventName || 'กิจกรรม',
    paymentType: paymentInfo.type,
    paymentTypeLabel: paymentInfo.label,
    amount: paymentInfo.amount,
    amountText: paymentInfo.amount.toLocaleString(),
    deadline,
    deadlineText: formatDeadlineText(deadline),
    daysOverdue,
    registrationId: registration.registrationId,
    eventLink: `${appBaseUrl}/events/${event.eventId}`,
  };

  // Replace all variables in template
  let result = template;
  Object.entries(data).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value ?? ''));
  });

  return result;
}

/**
 * Get appropriate template based on registration status
 */
export function suggestTemplate(
  registration: EventRegistration,
  event: Event
): MessageTemplateType {
  const paymentInfo = determinePaymentType(registration, event);

  // Determine deadline
  let deadline: string | undefined;
  if (paymentInfo.type === 'deposit') {
    deadline = registration.depositDeadline || event.depositDeadlineFixed;
  } else if (paymentInfo.type === 'remaining') {
    deadline = registration.remainingDeadline;
  } else {
    deadline = registration.fullPaymentDeadline || registration.remainingDeadline;
  }

  // Check if overdue
  if (deadline) {
    const daysUntil = calculateDaysUntilDeadline(deadline);

    if (daysUntil < 0) {
      return 'overdue_notice';
    } else if (daysUntil <= 3) {
      return 'deadline_warning';
    }
  }

  // Based on payment type
  if (paymentInfo.type === 'remaining') {
    return 'remaining_payment';
  } else {
    return 'full_payment';
  }
}
