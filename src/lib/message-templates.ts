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
  | 'room_assignment'      // แจ้งหมายเลขห้องพัก
  | 'registration_info'    // แจ้งข้อมูลการลงทะเบียน
  | 'felix_registration_info' // แจ้งข้อมูลการลงทะเบียน + จุดจอดรถ Felix
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

  room_assignment: {
    id: 'room_assignment',
    name: 'แจ้งหมายเลขห้องพัก',
    description: 'ส่งแจ้งหมายเลขห้องพักที่ได้รับมอบหมายให้กับผู้ลงทะเบียน',
    template: `FLEX_MESSAGE`, // Special marker for Flex message
    variables: ['eventName', 'companyName', 'registrationId', 'roomNumber', 'buildingName', 'memberNames'],
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

  registration_info: {
    id: 'registration_info',
    name: 'แจ้งข้อมูลการลงทะเบียน',
    description: 'ส่งข้อมูลการลงทะเบียนแรลลี่ รวมรายชื่อผู้เข้าร่วมและข้อมูลรถ (Flex Message)',
    template: `[ข้อความนี้จะถูกส่งเป็น Flex Message Card แสดงข้อมูลการลงทะเบียน รายชื่อผู้เข้าร่วม และข้อมูลรถ]`,
    variables: [],
  },
  felix_registration_info: {
    id: 'felix_registration_info',
    name: 'ข้อมูลลงทะเบียน รร. Felix',
    description: 'ข้อมูลการลงทะเบียน + จุดจอดรถที่แนะนำตามอาคารที่พัก (สำหรับ Felix Hotel)',
    template: `[ข้อความนี้จะถูกส่งเป็น Flex Message Card แสดงข้อมูลการลงทะเบียน รายชื่อผู้เข้าร่วม ข้อมูลรถ และจุดจอดรถที่แนะนำ]`,
    variables: [],
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
    members: Array<{ name: string; registrationId: string; companyName?: string }>;
    ownerRegistrationId?: string;
  },
  registration: EventRegistration,
  eventName: string
): any {
  // Determine if this is a joined car (not owned by the registration)
  const isJoinedCar = carpoolData.ownerRegistrationId &&
                      carpoolData.ownerRegistrationId !== registration.registrationId;
  const carNumber = formatCarNumber(carpoolData.assignedCarNumber);

  // Group members: Owner's members first, then joiners grouped by company
  const ownerMembers = carpoolData.members.filter(m => m.registrationId === carpoolData.ownerRegistrationId);
  const joinerMembers = carpoolData.members.filter(m => m.registrationId !== carpoolData.ownerRegistrationId);

  // Group joiners by company
  const joinersByCompany: Record<string, Array<{ name: string; registrationId: string; companyName?: string }>> = {};
  joinerMembers.forEach(member => {
    const company = member.companyName || 'ไม่ระบุบริษัท';
    if (!joinersByCompany[company]) {
      joinersByCompany[company] = [];
    }
    joinersByCompany[company].push(member);
  });

  // Build member list with grouping
  const membersList: any[] = [];
  let memberIndex = 1;

  // Add owner's members first
  if (ownerMembers.length > 0) {
    // Add company header for owner's members
    const ownerCompanyName = ownerMembers[0]?.companyName || 'ไม่ระบุบริษัท';
    membersList.push({
      type: 'text',
      text: `--- ${ownerCompanyName} ---`,
      size: 'xs',
      color: '#8b7e9e',
      weight: 'bold',
      margin: 'md',
    });

    ownerMembers.forEach(member => {
      membersList.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: `${memberIndex}.`,
            size: 'sm',
            color: '#666666',
            flex: 0,
            margin: 'none',
          },
          {
            type: 'text',
            text: member.name,
            size: 'sm',
            color: '#333333',
            flex: 1,
            margin: 'sm',
            wrap: true,
          },
        ],
        margin: 'sm',
      });
      memberIndex++;
    });
  }

  // Add joiners grouped by company
  Object.keys(joinersByCompany).sort().forEach(company => {
    // Add company header
    if (joinerMembers.length > 0) {
      membersList.push({
        type: 'text',
        text: `--- ${company} ---`,
        size: 'xs',
        color: '#8b7e9e',
        weight: 'bold',
        margin: 'md',
      });
    }

    // Add members from this company
    joinersByCompany[company].forEach(member => {
      membersList.push({
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'text',
            text: `${memberIndex}.`,
            size: 'sm',
            color: '#666666',
            flex: 0,
            margin: 'none',
          },
          {
            type: 'text',
            text: member.name,
            size: 'sm',
            color: '#333333',
            flex: 1,
            margin: 'sm',
            wrap: true,
          },
        ],
        margin: 'sm',
      });
      memberIndex++;
    });
  });

  return {
    type: 'flex',
    altText: isJoinedCar ? `แจ้งเลขรถที่ขอ Join - ${carNumber}` : `แจ้งเลขรถแรลลี่ของคุณ - ${carNumber}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: isJoinedCar ? '🚗 แจ้งเลขรถที่ขอ Join' : '🚗 แจ้งเลขรถแรลลี่ของคุณ',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: isJoinedCar ? '#8b7e9e' : '#2563eb', // Purple-gray for joined, blue for owned
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
                color: isJoinedCar ? '#8b7e9e' : '#2563eb',
                align: 'center',
              },
              {
                type: 'text',
                text: 'โปรดแสดงเลขรถนี้ ณ จุดลงทะเบียน',
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
                    weight: 'bold', // Make company name bold
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
    },
  };
}

/**
 * Generate Flex Message for Room Assignment Notification
 */
export function generateRoomAssignmentFlexMessage(
  roomData: {
    buildingName: string;
    roomNumber: string;
    members: Array<{ name: string; registrationId: string; companyName?: string }>;
  },
  registration: EventRegistration,
  eventName: string
): any {
  // Validate required data
  if (!roomData || !roomData.buildingName || !roomData.roomNumber) {
    console.error('[generateRoomAssignmentFlexMessage] Invalid roomData:', roomData);
    throw new Error('Invalid room data - missing building or room number');
  }

  if (!roomData.members || roomData.members.length === 0) {
    console.error('[generateRoomAssignmentFlexMessage] No members in room');
    throw new Error('Invalid room data - no members');
  }

  const roomNumber = `${roomData.buildingName}-${roomData.roomNumber}`;
  console.log('[generateRoomAssignmentFlexMessage] Creating message for room:', roomNumber);
  console.log('[generateRoomAssignmentFlexMessage] Members count:', roomData.members.length);
  console.log('[generateRoomAssignmentFlexMessage] Registration ID:', registration.registrationId);
  console.log('[generateRoomAssignmentFlexMessage] Event name length:', eventName?.length || 0);

  // Build member list with company names
  const membersList: any[] = [];
  roomData.members.forEach((member, index) => {
    console.log(`[generateRoomAssignmentFlexMessage] Member ${index}:`, {
      name: member.name,
      nameLength: member.name?.length || 0,
      company: member.companyName,
      companyLength: member.companyName?.length || 0,
    });

    // Show "name (company)" format
    const displayName = member.companyName
      ? `${member.name} (${member.companyName})`
      : member.name;

    console.log(`[generateRoomAssignmentFlexMessage] Display name ${index}:`, displayName, 'length:', displayName.length);

    membersList.push({
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
          text: displayName,
          size: 'sm',
          color: '#333333',
          flex: 1,
          margin: 'sm',
          wrap: true,
        },
      ],
      margin: 'sm',
    });
  });

  const flexMessage = {
    type: 'flex',
    altText: `แจ้งหมายเลขห้องพัก - ${roomNumber}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🏨 แจ้งหมายเลขห้องพัก',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#7c3aed', // Purple color
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
                text: roomNumber,
                size: '3xl',
                weight: 'bold',
                color: '#7c3aed',
                align: 'center',
              },
              {
                type: 'text',
                text: 'หมายเลขห้องพักของคุณ',
                size: 'sm',
                color: '#666666',
                align: 'center',
                margin: 'sm',
              },
            ],
            backgroundColor: '#f5f3ff',
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
                    weight: 'bold',
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
                text: '👥 รายชื่อสมาชิกในห้อง',
                size: 'sm',
                weight: 'bold',
                color: '#333333',
                margin: 'md',
              },
              ...membersList,
              {
                type: 'text',
                text: `รวม ${roomData.members.length} คน`,
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
            type: 'button',
            action: {
              type: 'uri',
              label: '📤 แชร์ข้อความนี้',
              uri: `https://line.me/R/share?text=${encodeURIComponent(`🏨 แจ้งหมายเลขห้องพัก ${roomNumber}\nกิจกรรม: ${eventName}`)}`,
            },
            style: 'primary',
            color: '#7c3aed',
            height: 'sm',
          },
        ],
        paddingAll: '12px',
        backgroundColor: '#f9fafb',
      },
    },
  };

  // Log the complete message size for debugging
  const messageJSON = JSON.stringify(flexMessage);
  console.log('[generateRoomAssignmentFlexMessage] Message size:', messageJSON.length, 'bytes');
  console.log('[generateRoomAssignmentFlexMessage] altText:', flexMessage.altText);

  // Check for extremely long messages (LINE has limits)
  if (messageJSON.length > 50000) {
    console.warn('[generateRoomAssignmentFlexMessage] WARNING: Message size exceeds 50KB');
  }

  return flexMessage;
}

/**
 * Helper function to normalize member names from JSON array format
 */
/**
 * Normalize member name from various formats (string, array, JSON-encoded)
 * Handles multiple levels of JSON encoding
 * @param name - Member name in any format
 * @returns Normalized comma-separated string
 */
export function normalizeMemberName(name: any): string {
  if (!name) return '';
  let current = name;

  // Handle multiple levels of JSON encoding
  while (typeof current === 'string' && (current.startsWith('[') || current.startsWith('{'))) {
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) {
        if (parsed.length === 1) {
          current = parsed[0];
          continue;
        }
        return parsed.join(', ').trim();
      }
      current = parsed;
    } catch {
      break;
    }
  }

  if (Array.isArray(current)) {
    return current.join(', ').trim();
  }
  return String(current).trim();
}

/**
 * Parse attendeeNames field and return array of names
 * Handles multiple formats: string, array, JSON-encoded string
 * @param attendeeNames - Raw attendeeNames data
 * @returns Array of attendee names
 */
export function parseAttendeeNames(attendeeNames: any): string[] {
  if (!attendeeNames) return [];

  // If already an array, normalize each element
  if (Array.isArray(attendeeNames)) {
    return attendeeNames.map(name => normalizeMemberName(name)).filter(n => n.length > 0);
  }

  // If string, try to parse as JSON first
  if (typeof attendeeNames === 'string') {
    // Try JSON parsing (handles multiple levels)
    const normalized = normalizeMemberName(attendeeNames);

    // If result contains comma, split it
    if (normalized.includes(',')) {
      return normalized.split(',').map(n => n.trim()).filter(n => n.length > 0);
    }

    // Single name
    return normalized.length > 0 ? [normalized] : [];
  }

  return [];
}

/**
 * Generate LINE Flex Message for registration information
 * Shows registration details with attendee list and carpool information
 * @param registration Registration data
 * @param eventName Name of the event
 * @param ownedCarpools Array of carpools where this registration is the owner
 * @param joinedCarpools Array of carpools where this registration joined others
 */
export function generateRegistrationInfoFlexMessage(
  registration: EventRegistration,
  eventName: string,
  ownedCarpools: Array<{
    licensePlate: string;
    assignedCarNumber?: number;
  }> = [],
  joinedCarpools: Array<{
    licensePlate: string;
    assignedCarNumber?: number;
  }> = []
): any {
  // Parse attendee names with normalization
  let attendeeNames: string[] = [];
  if (registration.attendeeNames) {
    if (typeof registration.attendeeNames === 'string') {
      attendeeNames = registration.attendeeNames
        .split(',')
        .map(n => normalizeMemberName(n.trim()))
        .filter(n => n);
    } else if (Array.isArray(registration.attendeeNames)) {
      attendeeNames = (registration.attendeeNames as any[])
        .map((n: any) => normalizeMemberName(n))
        .filter((n: string) => n);
    }
  }

  const totalAttendees = attendeeNames.length || 1;

  // Build attendee list
  const attendeeList: any[] = attendeeNames.map((name, index) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${index + 1}.`,
        size: 'sm',
        color: '#666666',
        flex: 0,
      },
      {
        type: 'text',
        text: name,
        size: 'sm',
        color: '#333333',
        flex: 1,
        margin: 'sm',
        wrap: true,
      },
    ],
    margin: 'xs',
  }));

  // Build body contents
  const bodyContents: any[] = [
    // Event name
    {
      type: 'text',
      text: eventName,
      size: 'md',
      weight: 'bold',
      color: '#2563eb',
      wrap: true,
    },
    {
      type: 'separator',
      margin: 'md',
    },
    // Company name
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
          text: registration.companyName || 'ไม่ระบุ',
          size: 'sm',
          color: '#333333',
          flex: 1,
          margin: 'sm',
          weight: 'bold',
          wrap: true,
        },
      ],
      margin: 'md',
    },
    // Registration ID
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
      type: 'separator',
      margin: 'md',
    },
    // Attendee list header
    {
      type: 'text',
      text: '👥 รายชื่อผู้เข้าร่วมกิจกรรม',
      size: 'sm',
      weight: 'bold',
      color: '#333333',
      margin: 'md',
    },
  ];

  // Add attendee list
  bodyContents.push(...attendeeList);

  // Add total count with large text
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: `${totalAttendees}`,
        size: '3xl',
        weight: 'bold',
        color: '#2563eb',
        align: 'center',
      },
      {
        type: 'text',
        text: 'รวมจำนวนผู้ร่วมเดินทาง (คน)',
        size: 'xs',
        color: '#666666',
        align: 'center',
      },
    ],
    margin: 'lg',
    paddingAll: '10px',
    backgroundColor: '#f3f4f6',
    cornerRadius: 'md',
  });

  // Add owned carpools if any
  if (ownedCarpools.length > 0) {
    bodyContents.push({
      type: 'separator',
      margin: 'lg',
    });

    ownedCarpools.forEach((carpool, index) => {
      const carNumber = formatCarNumber(carpool.assignedCarNumber);

      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🚗 หมายเลขรถแรลลี่ของคุณ',
            size: 'sm',
            weight: 'bold',
            color: '#1e40af',
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'ทะเบียน:',
                size: 'xs',
                color: '#666666',
                flex: 0,
              },
              {
                type: 'text',
                text: carpool.licensePlate || 'ไม่ระบุ',
                size: 'xs',
                color: '#333333',
                flex: 1,
                margin: 'sm',
              },
            ],
            margin: 'sm',
          },
          {
            type: 'text',
            text: carNumber,
            size: '3xl',
            weight: 'bold',
            color: '#2563eb',
            align: 'center',
            margin: 'md',
          },
          {
            type: 'text',
            text: '⚠️ โปรดแสดงเลขรถนี้ ณ จุดลงทะเบียน',
            size: 'sm',
            color: '#dc2626',
            align: 'center',
            weight: 'bold',
          },
        ],
        margin: 'md',
        paddingAll: '12px',
        backgroundColor: '#dbeafe',
        cornerRadius: 'md',
      });
    });
  }

  // Add joined carpools if any
  if (joinedCarpools.length > 0) {
    if (ownedCarpools.length === 0) {
      bodyContents.push({
        type: 'separator',
        margin: 'lg',
      });
    }

    joinedCarpools.forEach((carpool, index) => {
      const carNumber = formatCarNumber(carpool.assignedCarNumber);

      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🚗 หมายเลขรถแรลลี่ที่คุณ Join',
            size: 'sm',
            weight: 'bold',
            color: '#c2410c',
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'ทะเบียน:',
                size: 'xs',
                color: '#666666',
                flex: 0,
              },
              {
                type: 'text',
                text: carpool.licensePlate || 'ไม่ระบุ',
                size: 'xs',
                color: '#333333',
                flex: 1,
                margin: 'sm',
              },
            ],
            margin: 'sm',
          },
          {
            type: 'text',
            text: carNumber,
            size: '3xl',
            weight: 'bold',
            color: '#ea580c',
            align: 'center',
            margin: 'md',
          },
        ],
        margin: 'md',
        paddingAll: '12px',
        backgroundColor: '#fed7aa',
        cornerRadius: 'md',
      });
    });
  }

  return {
    type: 'flex',
    altText: `ข้อมูลการลงทะเบียน - ${registration.companyName || registration.registrationId}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '📋 ข้อมูลการลงทะเบียนแรลลี่',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#059669',
        paddingAll: '15px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents,
        paddingAll: '15px',
      },
    },
  };
}

/**
 * Get recommended parking zones for Felix Hotel based on building name
 * @param buildingName Name of the building (A-T)
 * @returns Array of recommended parking zone names
 */
function getFelixParkingZones(buildingName: string): string[] {
  const building = buildingName.toUpperCase().trim();

  // Mapping based on hotel building locations
  if (['A', 'B', 'C'].includes(building)) {
    return ['P2'];
  } else if (['D', 'E', 'F'].includes(building)) {
    return ['P2', 'P3'];
  } else if (['O', 'P', 'Q'].includes(building)) {
    return ['P3'];
  } else if (['M', 'N', 'R'].includes(building)) {
    return ['P3', 'P4'];
  } else if (['I', 'K', 'J', 'L', 'H', 'G', 'S', 'T'].includes(building)) {
    return ['P4', 'P5'];
  }

  return []; // Unknown building
}

/**
 * Extract building name from room assignment string
 * Expected format: "Building-RoomNumber" or "BUILDING RoomNumber"
 * @param roomAssignment Room assignment string
 * @returns Building name or empty string
 */
function extractBuildingName(roomAssignment: string): string {
  if (!roomAssignment) return '';

  const room = roomAssignment.trim();

  // Try to match "Building-Room" pattern (e.g., "A-101", "O-202")
  const dashMatch = room.match(/^([A-Z]+)-/);
  if (dashMatch) {
    return dashMatch[1];
  }

  // Try to match "Building Room" pattern (e.g., "A 101", "O 202")
  const spaceMatch = room.match(/^([A-Z]+)\s+/);
  if (spaceMatch) {
    return spaceMatch[1];
  }

  // Try to get first letter(s) if all uppercase at start
  const letterMatch = room.match(/^([A-Z]+)/);
  if (letterMatch) {
    return letterMatch[1];
  }

  return '';
}

/**
 * Generate LINE Flex Message for registration information with Felix Hotel parking info
 * Shows registration details, attendee list, carpool information, and recommended parking zones
 * @param registration Registration data
 * @param eventName Name of the event
 * @param ownedCarpools Array of carpools where this registration is the owner
 * @param joinedCarpools Array of carpools where this registration joined others
 * @param rooms Array of room data for looking up room names from roomIds
 */
export function generateFelixRegistrationInfoFlexMessage(
  registration: EventRegistration,
  eventName: string,
  ownedCarpools: Array<{
    licensePlate: string;
    assignedCarNumber?: number;
  }> = [],
  joinedCarpools: Array<{
    licensePlate: string;
    assignedCarNumber?: number;
  }> = [],
  rooms: Array<{
    roomId: string;
    buildingName: string;
    roomNumber: string;
    [key: string]: any;
  }> = []
): any {
  // Parse attendee names with normalization using helper function
  const attendeeNames = parseAttendeeNames(registration.attendeeNames);

  const totalAttendees = attendeeNames.length || 1;

  // Build attendee list
  const attendeeList: any[] = attendeeNames.map((name, index) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'text',
        text: `${index + 1}.`,
        size: 'sm',
        color: '#666666',
        flex: 0,
      },
      {
        type: 'text',
        text: name,
        size: 'sm',
        color: '#333333',
        flex: 1,
        margin: 'sm',
        wrap: true,
      },
    ],
    margin: 'xs',
  }));

  // Build body contents
  const bodyContents: any[] = [
    // Event name
    {
      type: 'text',
      text: eventName,
      size: 'md',
      weight: 'bold',
      color: '#2563eb',
      wrap: true,
    },
    {
      type: 'separator',
      margin: 'md',
    },
    // Company name
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
          text: registration.companyName || 'ไม่ระบุ',
          size: 'sm',
          color: '#333333',
          flex: 1,
          margin: 'sm',
          weight: 'bold',
          wrap: true,
        },
      ],
      margin: 'md',
    },
    // Registration ID
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
      type: 'separator',
      margin: 'md',
    },
    // Attendee list header
    {
      type: 'text',
      text: '👥 รายชื่อผู้เข้าร่วมกิจกรรม',
      size: 'sm',
      weight: 'bold',
      color: '#333333',
      margin: 'md',
    },
  ];

  // Add attendee list
  bodyContents.push(...attendeeList);

  // Add total count with large text
  bodyContents.push({
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: `${totalAttendees}`,
        size: '3xl',
        weight: 'bold',
        color: '#2563eb',
        align: 'center',
      },
      {
        type: 'text',
        text: 'รวมจำนวนผู้ร่วมเดินทาง (คน)',
        size: 'xs',
        color: '#666666',
        align: 'center',
      },
    ],
    margin: 'lg',
    paddingAll: '10px',
    backgroundColor: '#f3f4f6',
    cornerRadius: 'md',
  });

  // Add parking recommendation based on room assignments
  let parkingZones: string[] = [];
  let buildings: string[] = [];

  // Debug logging
  console.log('[Felix Parking] Processing registration:', registration.registrationId);
  console.log('[Felix Parking] roomAssignments type:', typeof registration.roomAssignments);
  console.log('[Felix Parking] roomAssignments value:', registration.roomAssignments);

  if (registration.roomAssignments) {
    let roomData: any[] = [];

    // Parse room assignments
    if (typeof registration.roomAssignments === 'string') {
      console.log('[Felix Parking] Parsing string roomAssignments');
      try {
        roomData = JSON.parse(registration.roomAssignments);
        console.log('[Felix Parking] Parsed roomData:', roomData);
      } catch (e) {
        console.log('[Felix Parking] Failed to parse JSON, treating as single room string');
        // If not JSON, treat as single room string
        const building = extractBuildingName(registration.roomAssignments);
        console.log('[Felix Parking] Extracted building from string:', building);
        if (building) {
          buildings.push(building);
        }
      }
    } else if (Array.isArray(registration.roomAssignments)) {
      console.log('[Felix Parking] roomAssignments is already an array');
      roomData = registration.roomAssignments;
    }

    // Extract all unique buildings from room assignments
    if (Array.isArray(roomData)) {
      console.log('[Felix Parking] Processing roomData array, length:', roomData.length);
      console.log('[Felix Parking] Available rooms for lookup:', rooms.length);

      roomData.forEach((room: any, index: number) => {
        // First try to get roomId and lookup in rooms array
        const roomId = room?.roomId;
        console.log(`[Felix Parking] Room ${index} roomId:`, roomId);

        let roomStr = '';

        if (roomId && rooms.length > 0) {
          // Lookup room data from rooms array using roomId
          const roomInfo = rooms.find(r => r.roomId === roomId);
          console.log(`[Felix Parking] Looked up room info for ${roomId}:`, roomInfo);

          if (roomInfo) {
            // Use buildingName-roomNumber format from room data
            roomStr = roomInfo.buildingName && roomInfo.roomNumber
              ? `${roomInfo.buildingName}-${roomInfo.roomNumber}`
              : roomInfo.buildingName || '';
            console.log(`[Felix Parking] Constructed room string from lookup:`, roomStr);
          }
        }

        // Fallback: if no roomId or lookup failed, try to get from room object directly
        if (!roomStr) {
          roomStr = typeof room === 'string' ? room : (room?.room || room?.roomNumber || '');
          console.log(`[Felix Parking] Using fallback room string:`, roomStr);
        }

        const building = extractBuildingName(roomStr);
        console.log(`[Felix Parking] Extracted building from room ${index}:`, building);
        if (building && !buildings.includes(building)) {
          buildings.push(building);
        }
      });
    }

    console.log('[Felix Parking] All extracted buildings:', buildings);

    // Get parking zones for all buildings
    const allZones = new Set<string>();
    buildings.forEach(building => {
      const zones = getFelixParkingZones(building);
      console.log(`[Felix Parking] Building ${building} -> Zones:`, zones);
      zones.forEach(zone => allZones.add(zone));
    });
    parkingZones = Array.from(allZones).sort();
    console.log('[Felix Parking] Final parking zones:', parkingZones);
  } else {
    console.log('[Felix Parking] No roomAssignments found');
  }

  // Store parking recommendation for later (will add at the end)
  const parkingCard = parkingZones.length > 0 ? {
    type: 'box',
    layout: 'vertical',
    contents: [
      {
        type: 'text',
        text: '🅿️ จุดจอดรถที่โรงแรมแนะนำสำหรับคุณ',
        size: 'sm',
        weight: 'bold',
        color: '#7c3aed',
      },
      {
        type: 'box',
        layout: 'baseline',
        contents: [
          {
            type: 'text',
            text: 'อาคาร:',
            size: 'xs',
            color: '#666666',
            flex: 0,
          },
          {
            type: 'text',
            text: buildings.join(', '),
            size: 'xs',
            color: '#333333',
            flex: 1,
            margin: 'sm',
            weight: 'bold',
          },
        ],
        margin: 'sm',
      },
      {
        type: 'text',
        text: parkingZones.join(', '),
        size: 'xl',
        weight: 'bold',
        color: '#7c3aed',
        align: 'center',
        margin: 'md',
      },
      {
        type: 'separator',
        margin: 'md',
      },
      {
        type: 'text',
        text: '📌 หมายเหตุ:',
        size: 'xs',
        color: '#666666',
        weight: 'bold',
        margin: 'sm',
      },
      {
        type: 'text',
        text: '• แนะนำจุดจอดรถที่ใกล้ห้องพักของคุณ',
        size: 'xs',
        color: '#666666',
        wrap: true,
      },
      {
        type: 'text',
        text: '• โรงแรมมีรถบริการรับ-ส่ง ถึงหน้าอาคาร',
        size: 'xs',
        color: '#666666',
        wrap: true,
      },
      {
        type: 'button',
        action: {
          type: 'uri',
          label: '🗺️ ดูแผนผังโรงแรม',
          uri: 'https://storage.googleapis.com/agents-club-event-slips/images/download/Gemini_Generated_Image_faurxqfaurxqfaur.jfif',
        },
        style: 'primary',
        color: '#7c3aed',
        margin: 'md',
      },
    ],
    margin: 'md',
    paddingAll: '12px',
    backgroundColor: '#f5f3ff',
    cornerRadius: 'md',
  } : null;

  // Add owned carpools if any
  if (ownedCarpools.length > 0) {
    bodyContents.push({
      type: 'separator',
      margin: 'lg',
    });

    ownedCarpools.forEach((carpool, index) => {
      const carNumber = formatCarNumber(carpool.assignedCarNumber);

      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🚗 หมายเลขรถแรลลี่ของคุณ',
            size: 'sm',
            weight: 'bold',
            color: '#1e40af',
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'ทะเบียน:',
                size: 'xs',
                color: '#666666',
                flex: 0,
              },
              {
                type: 'text',
                text: carpool.licensePlate || 'ไม่ระบุ',
                size: 'xs',
                color: '#333333',
                flex: 1,
                margin: 'sm',
              },
            ],
            margin: 'sm',
          },
          {
            type: 'text',
            text: carNumber,
            size: '3xl',
            weight: 'bold',
            color: '#2563eb',
            align: 'center',
            margin: 'md',
          },
          {
            type: 'text',
            text: '⚠️ โปรดแสดงเลขรถนี้ ณ จุดลงทะเบียน',
            size: 'sm',
            color: '#dc2626',
            align: 'center',
            weight: 'bold',
          },
        ],
        margin: 'md',
        paddingAll: '12px',
        backgroundColor: '#dbeafe',
        cornerRadius: 'md',
      });
    });
  }

  // Add joined carpools if any
  if (joinedCarpools.length > 0) {
    if (ownedCarpools.length === 0) {
      bodyContents.push({
        type: 'separator',
        margin: 'lg',
      });
    }

    joinedCarpools.forEach((carpool, index) => {
      const carNumber = formatCarNumber(carpool.assignedCarNumber);

      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '🚗 หมายเลขรถแรลลี่ที่คุณ Join',
            size: 'sm',
            weight: 'bold',
            color: '#c2410c',
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              {
                type: 'text',
                text: 'ทะเบียน:',
                size: 'xs',
                color: '#666666',
                flex: 0,
              },
              {
                type: 'text',
                text: carpool.licensePlate || 'ไม่ระบุ',
                size: 'xs',
                color: '#333333',
                flex: 1,
                margin: 'sm',
              },
            ],
            margin: 'sm',
          },
          {
            type: 'text',
            text: carNumber,
            size: '3xl',
            weight: 'bold',
            color: '#ea580c',
            align: 'center',
            margin: 'md',
          },
        ],
        margin: 'md',
        paddingAll: '12px',
        backgroundColor: '#fed7aa',
        cornerRadius: 'md',
      });
    });
  }

  // Add parking recommendation at the end if available
  if (parkingCard) {
    bodyContents.push({
      type: 'separator',
      margin: 'lg',
    });
    bodyContents.push(parkingCard);
  }

  return {
    type: 'flex',
    altText: `ข้อมูลการลงทะเบียน (Felix) - ${registration.companyName || registration.registrationId}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '📋 ข้อมูลลงทะเบียนของคุณ',
            weight: 'bold',
            size: 'lg',
            color: '#ffffff',
          },
        ],
        backgroundColor: '#7c3aed',
        paddingAll: '15px',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents,
        paddingAll: '15px',
      },
    },
  };
}
