// LINE Messaging API Service for Push Messages
import { Member } from '@/types/member';

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';

// Thai month names
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// Format date to Thai format: "วันที่ ชื่อเดือนภาษาไทย ปีค.ศ."
// Google Sheet stores dates as MM/DD/YYYY (US format)
function formatThaiDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';

  try {
    // Handle various date formats
    let date: Date;

    // Try parsing as ISO date or common formats
    if (dateStr.includes('/')) {
      // Handle MM/DD/YYYY format (Google Sheet format - US)
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        // Google Sheet uses MM/DD/YYYY (US format)
        const [month, day, year] = parts.map(Number);

        // Convert Buddhist year to Gregorian if needed (year > 2500)
        const gregorianYear = year > 2500 ? year - 543 : year;

        date = new Date(gregorianYear, month - 1, day);
      } else {
        date = new Date(dateStr);
      }
    } else if (dateStr.includes('-')) {
      // Handle YYYY-MM-DD format
      date = new Date(dateStr);
    } else {
      date = new Date(dateStr);
    }

    if (isNaN(date.getTime())) {
      return dateStr; // Return original if parsing fails
    }

    const day = date.getDate();
    const month = THAI_MONTHS[date.getMonth()];
    const year = date.getFullYear(); // CE year

    return `${day} ${month} ${year}`;
  } catch {
    return dateStr; // Return original if any error
  }
}
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
          // NOTE: License expiry date hidden temporarily while updating Google Sheet data
          // {
          //   type: 'box',
          //   layout: 'horizontal',
          //   margin: 'sm',
          //   contents: [
          //     {
          //       type: 'text',
          //       text: 'วันที่หมดอายุ:',
          //       size: 'sm',
          //       color: '#666666',
          //       flex: 3,
          //     },
          //     {
          //       type: 'text',
          //       text: formatThaiDate(member.membershipExpiry),
          //       size: 'sm',
          //       flex: 5,
          //     },
          //   ],
          // },
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
