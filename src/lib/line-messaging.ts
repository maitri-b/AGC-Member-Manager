// LINE Messaging API Service for Push Messages
import { Member, formatThaiDate as formatMemberThaiDate } from '@/types/member';

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';
const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

interface FlexMessage {
  type: 'flex';
  altText: string;
  contents: FlexContainer;
}

interface FlexContainer {
  type: 'bubble' | 'carousel';
  [key: string]: unknown;
}

// Send Push Message to a LINE user
export async function sendPushMessage(userId: string, messages: unknown[]): Promise<boolean> {
  if (!CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  }

  const requestBody = {
    to: userId,
    messages: messages,
  };

  console.log('LINE Push Request:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(LINE_MESSAGING_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify(requestBody),
  });

  const responseText = await response.text();
  console.log('LINE API Response:', response.status, responseText);

  if (!response.ok) {
    let errorDetails = responseText;
    try {
      const errorJson = JSON.parse(responseText);
      errorDetails = errorJson.message || JSON.stringify(errorJson);
    } catch {
      // Keep raw text
    }
    throw new Error(`LINE API Error (${response.status}): ${errorDetails}`);
  }

  return true;
}

// Create Member Profile Flex Message for Agents Club
export function createMemberProfileFlexMessage(member: Member): FlexMessage {
  // URL to profile page for editing
  const profileUrl = process.env.NEXTAUTH_URL || 'https://agentsclub.vercel.app';

  // Check if member is verified (has lineUserId)
  const isVerified = !!member.lineUserId;

  // Header contents - build dynamically based on verification status
  const headerContents: unknown[] = [
    {
      type: 'text',
      text: 'Agents Club',
      weight: 'bold',
      size: 'md',
      color: '#FFFFFF',
    },
    {
      type: 'text',
      text: member.nickname || '-',
      weight: 'bold',
      size: 'xl',
      color: '#FFFFFF',
      margin: 'md',
    },
    {
      type: 'text',
      text: member.fullNameTH || '-',
      size: 'sm',
      color: '#FFFFFF',
      margin: 'sm',
    },
    {
      type: 'text',
      text: `รหัสสมาชิก: ${member.memberId}`,
      size: 'xs',
      color: '#FFFFFF',
      margin: 'sm',
    },
  ];

  // Add verified text if member is verified (green circle icon with text)
  if (isVerified) {
    headerContents.push({
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          width: '18px',
          height: '18px',
          backgroundColor: '#22C55E',
          cornerRadius: '50px',
          justifyContent: 'center',
          alignItems: 'center',
          flex: 0,
          contents: [
            {
              type: 'text',
              text: '✓',
              size: 'xxs',
              color: '#FFFFFF',
              weight: 'bold',
              align: 'center',
            },
          ],
        },
        {
          type: 'text',
          text: 'ยืนยันตัวตนแล้ว',
          size: 'xs',
          color: '#FFFFFF',
          margin: 'sm',
          flex: 0,
        },
      ],
    });
  }

  return {
    type: 'flex',
    altText: `ข้อมูลสมาชิก Agents Club: ${member.nickname || member.fullNameTH || 'Unknown'}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1E40AF',
        paddingAll: '20px',
        contents: headerContents,
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          // Company Section
          {
            type: 'text',
            text: 'ข้อมูลบริษัท',
            weight: 'bold',
            color: '#1E40AF',
            size: 'sm',
          },
          {
            type: 'text',
            text: member.companyNameEN || '-',
            size: 'md',
            wrap: true,
            margin: 'sm',
            weight: 'bold',
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          // Contact Section
          {
            type: 'text',
            text: 'ข้อมูลติดต่อ',
            weight: 'bold',
            color: '#1E40AF',
            size: 'sm',
            margin: 'lg',
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'โทรมือถือ:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.mobile || '-',
                size: 'sm',
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'Email:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.email || '-',
                size: 'sm',
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'LINE ID:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.lineId || '-',
                size: 'sm',
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'ชื่อใน LINE:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.lineDisplayName || '-',
                size: 'sm',
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: 'separator',
            margin: 'lg',
          },
          // License Section
          {
            type: 'text',
            text: 'ข้อมูลใบอนุญาต',
            weight: 'bold',
            color: '#1E40AF',
            size: 'sm',
            margin: 'lg',
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'ชื่อบริษัท:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.companyNameTH || '-',
                size: 'sm',
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'เลขที่ใบอนุญาต:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.licenseNumber || '-',
                size: 'sm',
                flex: 5,
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'วันหมดอายุใบอนุญาต:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: formatMemberThaiDate(member.licenseExpiry),
                size: 'sm',
                flex: 5,
              },
            ],
          },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: 'สถานะ:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.status || '-',
                size: 'sm',
                flex: 5,
                color: member.status === 'ปกติ' ? '#16A34A' : '#DC2626',
                weight: 'bold',
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '15px',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'ดู/แก้ไข Profile',
              uri: `${profileUrl}/profile`,
            },
            style: 'primary',
            color: '#1E40AF',
          },
          {
            type: 'text',
            text: 'Agents Club',
            size: 'xs',
            color: '#AAAAAA',
            align: 'center',
            margin: 'md',
          },
        ],
      },
    },
  };
}

// Send Member Profile to LINE user
export async function sendMemberProfile(lineUserId: string, member: Member): Promise<boolean> {
  const flexMessage = createMemberProfileFlexMessage(member);
  return sendPushMessage(lineUserId, [flexMessage]);
}

// Send Event Registration Confirmation to LINE user
export async function sendEventRegistrationConfirmation(
  lineUserId: string,
  eventData: {
    eventName: string;
    eventNameEN: string;
    eventDate: string;
    location: string;
    registrationId: string;
    attendeeCount: number;
    registrationFee: number;
    memberName: string;
    eventId: string;
    paymentMode?: string;
    depositAmount?: number;
    remainingAmount?: number;
    depositDeadline?: string;
    remainingDeadline?: string;
  }
): Promise<boolean> {
  const hasPayment = eventData.registrationFee > 0;
  const isDepositMode = eventData.paymentMode === 'deposit' && hasPayment;
  const baseUrl = process.env.NEXTAUTH_URL || 'https://agentsclub.vercel.app';
  const eventDetailUrl = `${baseUrl}/events/${eventData.eventId}`;

  // Format Thai date/time for deadlines
  const formatThaiDateTime = (isoString: string): string => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const thaiDate = date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const thaiTime = date.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${thaiDate} เวลา ${thaiTime} น.`;
    } catch {
      return isoString;
    }
  };

  let message = `✅ ลงทะเบียนกิจกรรมสำเร็จ

สวัสดีครับ คุณ${eventData.memberName}

ระบบได้รับข้อมูลการลงทะเบียนของคุณเรียบร้อยแล้ว

📋 รายละเอียดกิจกรรม
${eventData.eventName}${eventData.eventNameEN ? `\n${eventData.eventNameEN}` : ''}

📅 วันที่จัดงาน: ${eventData.eventDate}
📍 สถานที่: ${eventData.location}

🎫 รหัสลงทะเบียน: ${eventData.registrationId}
👥 จำนวนผู้เข้าร่วม: ${eventData.attendeeCount} ท่าน`;

  if (!hasPayment) {
    // Free event
    message += `

✅ สถานะการลงทะเบียน: ลงทะเบียนสำเร็จ`;
  } else if (isDepositMode) {
    // Deposit payment mode
    message += `

💵 การชำระเงิน (แบบมัดจำ)
• ค่าลงทะเบียนรวม: ${eventData.registrationFee.toLocaleString()} บาท
• เงินมัดจำ: ${(eventData.depositAmount || 0).toLocaleString()} บาท
• ยอดคงเหลือ: ${(eventData.remainingAmount || 0).toLocaleString()} บาท`;

    if (eventData.depositDeadline) {
      message += `

⏰ กำหนดชำระเงินมัดจำ
กรุณาชำระภายในวันที่: ${formatThaiDateTime(eventData.depositDeadline)}`;
    }

    message += `

📤 อัพโหลดสลิปการโอนเงินมัดจำได้ที่:
${eventDetailUrl}

⚠️ สถานะการลงทะเบียน: รอชำระเงินมัดจำ

📌 หมายเหตุ: กรุณาชำระเงินมัดจำภายในกำหนดเพื่อยืนยันการเข้าร่วมงาน`;

    if (eventData.remainingDeadline) {
      message += `\nยอดคงเหลือสามารถชำระได้ภายในวันที่: ${formatThaiDateTime(eventData.remainingDeadline)}`;
    } else {
      message += `\nยอดคงเหลือสามารถชำระได้ภายหลัง`;
    }
  } else {
    // Full payment mode
    message += `
💰 ค่าลงทะเบียน: ${eventData.registrationFee.toLocaleString()} บาท`;

    if (eventData.depositDeadline) {
      message += `

⏰ กำหนดชำระเงิน
กรุณาชำระภายในวันที่: ${formatThaiDateTime(eventData.depositDeadline)}`;
    }

    message += `

📤 อัพโหลดสลิปการโอนได้ที่:
${eventDetailUrl}

⚠️ สถานะการลงทะเบียน: รอชำระเงิน`;
  }

  message += `

ขอบคุณที่เข้าร่วมกิจกรรมของ Agents Club
Helping & Sharing`;

  return sendPushMessage(lineUserId, [
    {
      type: 'text',
      text: message,
    },
  ]);
}

// Send Membership Application Approved Notification
export async function sendApplicationApprovedNotification(
  lineUserId: string,
  applicationData: {
    memberName: string;
    memberId: string;
    fullName: string;
    companyName: string;
    memberStatus: string;
  },
  customTemplate?: string
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://agentsclub.vercel.app';
  const profileLink = `${baseUrl}/profile`;

  // Use custom template or default
  const template = customTemplate || `🎉 ยินดีต้อนรับสู่ Agents Club!

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
Helping & Sharing 💚`;

  // Replace variables
  let message = template;
  const variables: Record<string, string> = {
    memberName: applicationData.memberName,
    memberId: applicationData.memberId,
    fullName: applicationData.fullName,
    companyName: applicationData.companyName,
    memberStatus: applicationData.memberStatus,
    profileLink,
  };

  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    message = message.replace(new RegExp(placeholder, 'g'), value);
  });

  return sendPushMessage(lineUserId, [
    {
      type: 'text',
      text: message,
    },
  ]);
}

// Send Membership Application Rejected Notification
export async function sendApplicationRejectedNotification(
  lineUserId: string,
  applicationData: {
    memberName: string;
    rejectionReason: string;
  },
  customTemplate?: string
): Promise<boolean> {
  const lineOfficialAccount = process.env.LINE_OFFICIAL_ACCOUNT_URL || 'https://lin.ee/nzAjXXq';

  // Use custom template or default
  const template = customTemplate || `📋 แจ้งผลการพิจารณาใบสมัครสมาชิก

สวัสดีครับคุณ {{memberName}} 🙏

ขออภัยค่ะ ใบสมัครสมาชิกของคุณยังไม่ได้รับการอนุมัติในครั้งนี้

⚠️ เหตุผล:
{{rejectionReason}}

📞 ติดต่อสอบถาม
หากมีข้อสงสัยหรือต้องการข้อมูลเพิ่มเติม
กรุณาติดต่อทีมงาน Agents Club
LINE: {{lineOfficialAccount}}

ขอบคุณที่สนใจเข้าร่วม Agents Club ค่ะ 🙏`;

  // Replace variables
  let message = template;
  const variables: Record<string, string> = {
    memberName: applicationData.memberName,
    rejectionReason: applicationData.rejectionReason,
    lineOfficialAccount,
  };

  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    message = message.replace(new RegExp(placeholder, 'g'), value);
  });

  return sendPushMessage(lineUserId, [
    {
      type: 'text',
      text: message,
    },
  ]);
}

// Send Event Cancellation Notification
export async function sendEventCancellationNotification(
  lineUserId: string,
  cancellationData: {
    eventName: string;
    eventNameEN?: string;
    eventDate: string;
    registrationId: string;
    memberName: string;
    refundAmount: number;
    refundPercentage: number;
    chargeAmount: number;
    cancelledBy: 'member' | 'admin';
    cancellationReason?: string;
    appliedRuleName: string;
  }
): Promise<boolean> {
  const hasRefund = cancellationData.refundAmount > 0;

  let message = `❌ แจ้งการยกเลิกการจอง

สวัสดีครับ คุณ${cancellationData.memberName}

การจองของคุณได้ถูกยกเลิกแล้ว

📋 รายละเอียดกิจกรรม
${cancellationData.eventName}${cancellationData.eventNameEN ? `\n${cancellationData.eventNameEN}` : ''}

📅 วันที่จัดงาน: ${cancellationData.eventDate}
🎫 รหัสลงทะเบียน: ${cancellationData.registrationId}`;

  if (cancellationData.cancelledBy === 'admin' && cancellationData.cancellationReason) {
    message += `

📝 เหตุผลการยกเลิก:
${cancellationData.cancellationReason}`;
  }

  if (hasRefund) {
    message += `

💰 ข้อมูลการคืนเงิน
• เงื่อนไข: ${cancellationData.appliedRuleName}
• เปอร์เซ็นต์คืน: ${cancellationData.refundPercentage}%
• ยอดคืน: ${cancellationData.refundAmount.toLocaleString()} บาท
• ค่าใช้จ่ายที่หัก: ${cancellationData.chargeAmount.toLocaleString()} บาท

📌 หมายเหตุ: ทีมงานจะดำเนินการคืนเงินให้ท่านโดยเร็วที่สุด
คุณจะได้รับการแจ้งเตือนอีกครั้งเมื่อมีการโอนเงินคืน`;
  } else {
    message += `

💰 การคืนเงิน
• เงื่อนไข: ${cancellationData.appliedRuleName}
• ไม่มีการคืนเงิน`;
  }

  message += `

ขออภัยในความไม่สะดวก
หากมีข้อสงสัย กรุณาติดต่อทีมงาน Agents Club

ด้วยความเคารพ
Agents Club - Helping & Sharing`;

  return sendPushMessage(lineUserId, [
    {
      type: 'text',
      text: message,
    },
  ]);
}

// Send Refund Completed Notification
export async function sendRefundCompletedNotification(
  lineUserId: string,
  refundData: {
    eventName: string;
    eventNameEN?: string;
    registrationId: string;
    memberName: string;
    refundAmount: number;
    refundMethod?: string;
    refundDate: string;
  }
): Promise<boolean> {
  const formatThaiDate = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const message = `✅ แจ้งการคืนเงินสำเร็จ

สวัสดีครับ คุณ${refundData.memberName}

ทีมงาน Agents Club ได้ทำการคืนเงินให้ท่านแล้ว

📋 รายละเอียด
กิจกรรม: ${refundData.eventName}${refundData.eventNameEN ? `\n${refundData.eventNameEN}` : ''}
รหัสลงทะเบียน: ${refundData.registrationId}

💰 ข้อมูลการคืนเงิน
• ยอดคืน: ${refundData.refundAmount.toLocaleString()} บาท
• วันที่โอนคืน: ${formatThaiDate(refundData.refundDate)}
${refundData.refundMethod ? `• วิธีการคืนเงิน: ${refundData.refundMethod}` : ''}

กรุณาตรวจสอบบัญชีของท่าน
หากมีข้อสงสัย กรุณาติดต่อทีมงาน

ขอบคุณที่ใช้บริการ Agents Club
Helping & Sharing`;

  return sendPushMessage(lineUserId, [
    {
      type: 'text',
      text: message,
    },
  ]);
}

// Send Event Registration Confirmation (Admin-Assisted Registration)
export async function sendEventRegistrationConfirmationOnBehalf(
  lineUserId: string,
  eventData: {
    eventName: string;
    eventNameEN: string;
    eventDate: string;
    location: string;
    registrationId: string;
    attendeeCount: number;
    registrationFee: number;
    memberName: string;
    eventId: string;
    paymentMode?: string;
    depositAmount?: number;
    remainingAmount?: number;
    depositDeadline?: string;
    remainingDeadline?: string;
    registeredBy: string;
  }
): Promise<boolean> {
  const hasPayment = eventData.registrationFee > 0;
  const isDepositMode = eventData.paymentMode === 'deposit' && hasPayment;
  const baseUrl = process.env.NEXTAUTH_URL || 'https://agentsclub.vercel.app';
  const eventDetailUrl = `${baseUrl}/events/${eventData.eventId}`;

  // Format Thai date/time for deadlines
  const formatThaiDateTime = (isoString: string): string => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const thaiDate = date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const thaiTime = date.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${thaiDate} เวลา ${thaiTime} น.`;
    } catch {
      return isoString;
    }
  };

  let message = `✅ ได้รับการลงทะเบียนกิจกรรมแล้ว

สวัสดีครับ คุณ${eventData.memberName}

ทีมงาน Agents Club ได้ทำการลงทะเบียนกิจกรรมให้คุณแล้ว

📋 รายละเอียดกิจกรรม
${eventData.eventName}${eventData.eventNameEN ? `\n${eventData.eventNameEN}` : ''}

📅 วันที่จัดงาน: ${eventData.eventDate}
📍 สถานที่: ${eventData.location}

🎫 รหัสลงทะเบียน: ${eventData.registrationId}
👥 จำนวนผู้เข้าร่วม: ${eventData.attendeeCount} ท่าน`;

  if (!hasPayment) {
    // Free event
    message += `

✅ สถานะการลงทะเบียน: ลงทะเบียนสำเร็จ`;
  } else if (isDepositMode) {
    // Deposit payment mode
    message += `

💵 การชำระเงิน (แบบมัดจำ)
• ค่าลงทะเบียนรวม: ${eventData.registrationFee.toLocaleString()} บาท
• เงินมัดจำ: ${(eventData.depositAmount || 0).toLocaleString()} บาท
• ยอดคงเหลือ: ${(eventData.remainingAmount || 0).toLocaleString()} บาท`;

    if (eventData.depositDeadline) {
      message += `

⏰ กำหนดชำระเงินมัดจำ
กรุณาชำระภายในวันที่: ${formatThaiDateTime(eventData.depositDeadline)}`;
    }

    message += `

📤 อัพโหลดสลิปการโอนเงินมัดจำได้ที่:
${eventDetailUrl}

⚠️ สถานะการลงทะเบียน: รอชำระเงินมัดจำ

📌 หมายเหตุ: กรุณาชำระเงินมัดจำภายในกำหนดเพื่อยืนยันการเข้าร่วมงาน`;

    if (eventData.remainingDeadline) {
      message += `\nยอดคงเหลือสามารถชำระได้ภายในวันที่: ${formatThaiDateTime(eventData.remainingDeadline)}`;
    } else {
      message += `\nยอดคงเหลือสามารถชำระได้ภายหลัง`;
    }
  } else {
    // Full payment mode
    message += `
💰 ค่าลงทะเบียน: ${eventData.registrationFee.toLocaleString()} บาท`;

    if (eventData.depositDeadline) {
      message += `

⏰ กำหนดชำระเงิน
กรุณาชำระภายในวันที่: ${formatThaiDateTime(eventData.depositDeadline)}`;
    }

    message += `

📤 อัพโหลดสลิปการโอนได้ที่:
${eventDetailUrl}

⚠️ สถานะการลงทะเบียน: รอชำระเงิน`;
  }

  message += `

ดูรายละเอียดเพิ่มเติมได้ที่: ${eventDetailUrl}

ขอบคุณที่เข้าร่วมกิจกรรมของ Agents Club
Helping & Sharing`;

  return sendPushMessage(lineUserId, [
    {
      type: 'text',
      text: message,
    },
  ]);
}
