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

// Create Member Profile Flex Message - Simplified version
export function createMemberProfileFlexMessage(member: Member): FlexMessage {
  return {
    type: 'flex',
    altText: `ข้อมูลสมาชิก: ${member.nickname || member.fullName || 'Unknown'}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#CC0000',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: member.nickname || member.fullName || 'Unknown',
            weight: 'bold',
            size: 'xl',
            color: '#FFFFFF',
          },
          {
            type: 'text',
            text: member.fullNameTH || member.fullName || '-',
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
            color: '#CC0000',
            size: 'sm',
          },
          {
            type: 'text',
            text: member.companyNameTH || member.companyNameEN || '-',
            size: 'sm',
            wrap: true,
            margin: 'sm',
          },
          {
            type: 'text',
            text: member.industry || '-',
            size: 'xs',
            color: '#999999',
            margin: 'sm',
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
            color: '#CC0000',
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
                text: 'โทร:',
                size: 'sm',
                color: '#666666',
                flex: 2,
              },
              {
                type: 'text',
                text: member.mobile || member.officeTel || '-',
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
                flex: 2,
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
                text: 'LINE:',
                size: 'sm',
                color: '#666666',
                flex: 2,
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
            type: 'separator',
            margin: 'lg',
          },
          // BNI Section
          {
            type: 'text',
            text: 'ข้อมูล BNI',
            weight: 'bold',
            color: '#CC0000',
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
                text: 'Powerteam:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.powerteam || '-',
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
                text: 'อายุสมาชิก:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.membershipAge ? `${member.membershipAge} ปี` : '-',
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
                text: 'ต่ออายุ:',
                size: 'sm',
                color: '#666666',
                flex: 3,
              },
              {
                type: 'text',
                text: member.renewByMonthName || '-',
                size: 'sm',
                flex: 5,
              },
            ],
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        contents: [
          {
            type: 'text',
            text: 'BNI Excellence - Member Manager',
            size: 'xs',
            color: '#AAAAAA',
            align: 'center',
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
