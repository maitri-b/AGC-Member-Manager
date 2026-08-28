/**
 * Message Template System for Payment Reminders
 * Supports personalized LINE messages with auto-filled payment details
 */

import { EventRegistration } from '@/types/event';
import { Event } from '@/types/event';
import { formatThaiDate, formatThaiDateTime } from './date-utils';

export type MessageTemplateType =
  // Event Payment Templates
  | 'remaining_payment'    // แจ้งชำระยอดคงเหลือ
  | 'full_payment'         // แจ้งชำระเต็มจำนวน
  | 'deadline_warning'     // แจ้งเตือนใกล้ครบกำหนด
  | 'overdue_notice'       // แจ้งเตือนพ้นกำหนด
  | 'verification_reminder'// แจ้งเตือนให้ยืนยันตัวตน
  // Event Management Templates
  | 'car_assignment'       // แจ้งเลขรถที่ได้รับ
  // Member Contact Templates
  | 'license_renewal'      // แจ้งเตือนต่ออายุใบอนุญาต
  | 'license_expired'      // แจ้งใบอนุญาตหมดอายุ
  | 'inactive_member'      // แจ้งสมาชิกไม่ active
  | 'complaint'            // แจ้งเรื่องร้องเรียน
  | 'line_not_found'       // LINE ไม่อยู่ในกลุ่ม
  | 'not_verified';        // ยังไม่ยืนยันตัวตน

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

  car_assignment: {
    id: 'car_assignment',
    name: 'แจ้งเลขรถที่ได้รับ',
    description: 'ส่งแจ้งเลขรถที่ได้รับมอบหมายให้กับผู้ลงทะเบียนรถ',
    template: `FLEX_MESSAGE`, // Special marker for Flex message
    variables: ['companyName', 'registrationId', 'licensePlate', 'carNumber', 'memberNames'],
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

  license_expired: {
    id: 'license_expired',
    name: 'แจ้งใบอนุญาตหมดอายุ',
    description: 'แจ้งสมาชิกที่มีใบอนุญาตหมดอายุให้ส่งใบอนุญาตใหม่',
    template: `สวัสดีครับ คุณ{{contactName}}
บริษัท {{companyName}}

ทางทีมทะเบียนชมรม Agents Club ตรวจพบว่า
ใบอนุญาตธุรกิจนำเที่ยว เลขที่ {{licenseNumber}}
มีสถานะ {{status}} (หมดอายุ {{expiryDate}})

หากคุณได้ต่ออายุใบอนุญาตแล้ว หรือมีข้อมูลที่อัพเดท
รบกวนส่งสำเนาใบอนุญาตใหม่มาทาง LINE นี้ด้วยนะครับ

เนื่องจากนโยบายของชมรม อนุญาตให้เฉพาะสมาชิกที่มีใบอนุญาตที่ยังไม่หมดอายุอยู่ในกลุ่ม
หากไม่ได้รับการติดต่อกลับ ทางทีมทะเบียนจะขอนำชื่อออกจาก LINE กลุ่มไว้ก่อนนะครับ

ถ้าทีมทะเบียนได้รับข้อมูลอัพเดทและตรวจสอบเรียบร้อยแล้ว
ทางทีมงานจะนำกลับเข้ากลุ่มให้ทันทีครับ

ขอบคุณครับ
ทีมทะเบียนชมรม Agents Club`,
    variables: ['contactName', 'companyName', 'licenseNumber', 'status', 'expiryDate'],
  },

  inactive_member: {
    id: 'inactive_member',
    name: 'แจ้งสมาชิกไม่ active',
    description: 'แจ้งสมาชิกที่ไม่เข้าร่วมกิจกรรมนาน',
    template: `สวัสดีครับ คุณ{{contactName}}
บริษัท {{companyName}}

ทางชมรม Agents Club พบว่าท่านไม่ได้เข้าร่วมกิจกรรมของชมรมมาเกิน 12 เดือนแล้ว

เราอยากทราบว่าท่านยังประกอบธุรกิจนำเที่ยวอยู่หรือไม่
และยังสนใจเข้าร่วมกิจกรรมกับชมรมอยู่มั้ยครับ

ชมรม Agents Club เน้นการมีส่วนร่วมของสมาชิก
การไม่เข้าร่วมกิจกรรมเป็นเวลานานจะมีผลต่อการอยู่ในกลุ่ม LINE ของชมรม

รบกวนตอบกลับมาทาง LINE นี้ด้วยนะครับ

ขอบคุณครับ
ทีมทะเบียนชมรม Agents Club`,
    variables: ['contactName', 'companyName'],
  },

  complaint: {
    id: 'complaint',
    name: 'แจ้งเรื่องร้องเรียน',
    description: 'แจ้งสมาชิกเมื่อมีเรื่องร้องเรียน',
    template: `เรียนคุณ{{contactName}} {{companyName}}

ทางคณะกรรมการ ได้รับการร้องเรียนจากสมาชิกของชมรม {{complaintAgainst}} ({{complaintCompany}}) ตามหนังสือที่แนบมาด้วย

ทางชมรมจึงขอให้สมาชิกได้เคลียร์กันให้เรียบร้อยตามที่มีเรื่องร้องเรียนมา หรือสามารถชี้แจงมาที่คณะกรรมการของชมรมได้ครับ

ในกรณีที่ไม่สามารถเคลียร์กันได้ ทางคณะกรรมการและทีมทะเบียนจะต้องนำท่านออกจากห้องชมรมก่อน

เมื่อเคลียร์กันเรียบร้อยแล้ว ทางทีมทะเบียนจะนำ LINE ของท่านกลับมาในห้องไลน์กลุ่มชมรมอีกครั้ง

#คณะกรรมการชมรม Agents Club`,
    variables: ['contactName', 'companyName', 'complaintAgainst', 'complaintCompany'],
  },

  line_not_found: {
    id: 'line_not_found',
    name: 'LINE ไม่อยู่ในกลุ่ม',
    description: 'แจ้งสมาชิกที่ไม่พบ LINE ในกลุ่ม',
    template: `สวัสดีครับ คุณ{{contactName}}
บริษัท {{companyName}}

ทางทีมทะเบียนชมรม Agents Club ไม่พบไลน์ที่ท่านเคยลงทะเบียนไว้ในกลุ่มชมรม

ไม่ทราบว่า:
- ท่านยังอยู่ในกลุ่มอยู่หรือไม่
- มีการเปลี่ยนชื่อไลน์หรือไม่
- หรือมีการเปลี่ยนตัว LINE Account ที่เข้าร่วมหรือไม่

รบกวนช่วยอัพเดทข้อมูลให้ทีมทะเบียนด้วยนะครับ
เพื่อทางทีมจะได้อัพเดทในระบบต่อไป

ขอบคุณครับ
ทีมทะเบียนชมรม Agents Club`,
    variables: ['contactName', 'companyName'],
  },

  not_verified: {
    id: 'not_verified',
    name: 'ยังไม่ยืนยันตัวตน',
    description: 'แจ้งสมาชิกที่ยังไม่ได้ยืนยันตัวตน',
    template: `สวัสดีครับ คุณ{{contactName}}
บริษัท {{companyName}}

สืบเนื่องจากที่ชมรมได้มีการปรับปรุงระบบการยืนยันตัวตนสมาชิก และกำหนดให้ทุกท่านเข้าสู่ระบบเพื่อทำการยืนยันภายในวันที่ 30 เมษายน 2569

ทางทีมทะเบียนตรวจสอบแล้วพบว่าท่านยังไม่ได้ดำเนินการยืนยันตัวตนตามกำหนดเวลาดังกล่าว จึงอยากติดต่อเพื่อสอบถามสถานะและความสนใจของท่านครับ

ขณะนี้มีผู้สนใจที่รอเข้าร่วมกลุ่มจำนวนมาก ในขณะที่กลุ่มสามารถรองรับสมาชิกได้เพียง 500 ท่านเท่านั้น

หากท่านยังมีความประสงค์ที่จะคงสมาชิกภาพและอยู่ใน LINE กลุ่มปิดของชมรมต่อไป
รบกวนท่านเข้าทำการยืนยันตัวตนผ่านลิงก์นี้ครับ
👉 https://lin.ee/X2vrCYN (คลิกเมนู "เข้าสู่ระบบ/ยืนยันตัวตน")

ทางทีมทะเบียนจะรอรับการตอบกลับจากท่านภายใน 3 วัน (นับจากวันที่ส่งข้อความนี้)

หากไม่ได้รับการตอบกลับภายในกำหนด ทางทีมทะเบียนจำเป็นต้องดำเนินการนำท่านออกจาก LINE กลุ่มก่อน เพื่อเปิดโอกาสให้กับผู้สนใจท่านอื่นๆ

ทั้งนี้ หากภายหลังท่านมีความประสงค์จะกลับเข้ามาเป็นสมาชิกอีกครั้ง สามารถติดต่อนายทะเบียนเพื่อดำเนินการตามขั้นตอนได้ตลอดเวลาครับ

ขอบคุณสำหรับความเข้าใจและความร่วมมือครับ

ด้วยความนับถือ
นายทะเบียน ชมรม Agents Club`,
    variables: ['contactName', 'companyName'],
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
    eventLink: `${appBaseUrl}/events/${encodeURIComponent(event.eventId)}`,
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

/**
 * Helper function to format car number as 3-digit string
 */
function formatCarNumber(carNumber: number | undefined | null): string {
  if (!carNumber || carNumber <= 0) return '-';
  return String(carNumber).padStart(3, '0');
}

/**
 * Generate LINE Flex Message for car assignment notification
 * @param carpoolData Carpool data including license plate, car number, and members
 * @param registration Registration data for the carpool owner
 * @param eventName Name of the event
 */
export function generateCarAssignmentFlexMessage(
  carpoolData: {
    licensePlate: string;
    assignedCarNumber?: number;
    members: Array<{ name: string; registrationId: string }>;
  },
  registration: EventRegistration,
  eventName: string
): any {
  const carNumber = formatCarNumber(carpoolData.assignedCarNumber);
  const membersList = carpoolData.members
    .map((m, index) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: `${index + 1}.`,
          size: 'sm',
          color: '#666666',
          flex: 0,
          margin: 'none',
        },
        {
          type: 'text',
          text: m.name,
          size: 'sm',
          color: '#333333',
          flex: 1,
          margin: 'sm',
          wrap: true,
        },
      ],
      margin: 'sm',
    }));

  return {
    type: 'flex',
    altText: `แจ้งเลขรถแรลลี่ของคุณ - ${carNumber}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🚗 แจ้งเลขรถแรลลี่ของคุณ',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#2563eb',
        paddingAll: '15px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: carNumber,
                size: '3xl',
                weight: 'bold',
                color: '#2563eb',
                align: 'center',
              },
              {
                type: 'text',
                text: 'เลขรถที่ได้รับ',
                size: 'sm',
                color: '#666666',
                align: 'center',
                margin: 'sm',
              },
            ],
            backgroundColor: '#eff6ff',
            paddingAll: '15px',
            cornerRadius: '8px',
            margin: 'md',
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: 'กิจกรรม:',
                    size: 'sm',
                    color: '#666666',
                    flex: 0,
                    margin: 'none',
                  },
                  {
                    type: 'text',
                    text: eventName,
                    size: 'sm',
                    color: '#333333',
                    flex: 1,
                    margin: 'sm',
                    wrap: true,
                    weight: 'bold',
                  },
                ],
                margin: 'md',
              },
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: 'บริษัท:',
                    size: 'sm',
                    color: '#666666',
                    flex: 0,
                  },
                  {
                    type: 'text',
                    text: registration.companyName || '-',
                    size: 'sm',
                    color: '#333333',
                    flex: 1,
                    margin: 'sm',
                    wrap: true,
                  },
                ],
                margin: 'sm',
              },
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: 'รหัสจอง:',
                    size: 'sm',
                    color: '#666666',
                    flex: 0,
                  },
                  {
                    type: 'text',
                    text: registration.registrationId,
                    size: 'sm',
                    color: '#333333',
                    flex: 1,
                    margin: 'sm',
                  },
                ],
                margin: 'sm',
              },
              {
                type: 'box',
                layout: 'baseline',
                contents: [
                  {
                    type: 'text',
                    text: 'ทะเบียนรถ:',
                    size: 'sm',
                    color: '#666666',
                    flex: 0,
                  },
                  {
                    type: 'text',
                    text: carpoolData.licensePlate || 'ไม่ระบุ',
                    size: 'sm',
                    color: '#333333',
                    flex: 1,
                    margin: 'sm',
                    weight: 'bold',
                  },
                ],
                margin: 'sm',
              },
            ],
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '👥 รายชื่อผู้ร่วมรถ',
                size: 'sm',
                weight: 'bold',
                color: '#333333',
                margin: 'md',
              },
              ...membersList,
              {
                type: 'text',
                text: `รวม ${carpoolData.members.length} คน`,
                size: 'xs',
                color: '#999999',
                margin: 'md',
                align: 'end',
              },
            ],
          },
        ],
        paddingAll: '15px',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '💡 โปรดแสดงเลขรถนี้ ณ จุดลงทะเบียน',
            size: 'xs',
            color: '#999999',
            align: 'center',
          },
        ],
        paddingAll: '10px',
      },
    },
  };
}
