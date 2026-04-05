// LINE Messaging API Service for Push Messages
import { Member } from '@/types/member';

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

  return {
    type: 'flex',
    altText: `ข้อมูลสมาชิก Agents Club: ${member.companyNameEN || member.companyNameTH || 'Unknown'}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#1E40AF',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'Agents Club',
            weight: 'bold',
            size: 'lg',
            color: '#FFFFFF',
          },
          {
            type: 'text',
            text: 'ข้อมูลสมาชิก',
            size: 'sm',
            color: '#FFFFFF',
            margin: 'sm',
          },
        ],
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
                text: member.lineName || member.lineDisplayName || '-',
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
                text: 'วันที่หมดอายุ:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.membershipExpiry || '-',
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
              label: 'แก้ไขข้อมูล',
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
