/**
 * Party Table Message Template
 * Generate Flex Message for Party Table Assignment Notifications
 */

import { EventRegistration } from '@/types/event';

/**
 * Generate Flex Message for Party Table Assignment Notification
 * Supports displaying multiple tables if member's registration has attendees in multiple tables
 */
export function generatePartyTableAssignmentFlexMessage(
  tablesData: Array<{
    tableNumber: number;
    members: Array<{
      name: string;
      registrationId: string;
      companyName?: string;
      isFromRecipient: boolean;
      isReservation?: boolean;
      reservationName?: string;
      reservationSeats?: number;
    }>;
  }>,
  registration: EventRegistration,
  eventName: string,
  seatingChartUrl?: string
): any {
  // Validate required data
  if (!tablesData || tablesData.length === 0) {
    console.error('[generatePartyTableAssignmentFlexMessage] Invalid tablesData:', tablesData);
    throw new Error('Invalid tables data - no tables provided');
  }

  console.log('[generatePartyTableAssignmentFlexMessage] Creating message for tables:', tablesData.length);
  console.log('[generatePartyTableAssignmentFlexMessage] Registration ID:', registration.registrationId);
  console.log('[generatePartyTableAssignmentFlexMessage] Event name length:', eventName?.length || 0);

  // Build table sections
  const tableSections: any[] = [];

  tablesData.forEach((table, tableIndex) => {
    if (!table.members || table.members.length === 0) {
      console.warn(`[generatePartyTableAssignmentFlexMessage] Table ${table.tableNumber} has no members, skipping`);
      return;
    }

    console.log(`[generatePartyTableAssignmentFlexMessage] Table ${table.tableNumber}: ${table.members.length} members`);

    // Add separator between tables (except first)
    if (tableIndex > 0) {
      tableSections.push({
        type: 'separator',
        margin: 'xl',
      });
    }

    // Table number header
    tableSections.push({
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: `โต๊ะที่ ${table.tableNumber}`,
          size: '3xl',
          weight: 'bold',
          color: '#7c3aed',
          align: 'center',
        },
        {
          type: 'text',
          text: `${table.members.length} คน`,
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
    });

    // Build member list for this table
    const membersList: any[] = [];
    let memberIndex = 1;

    table.members.forEach((member) => {
      // Handle reservation groups
      if (member.isReservation) {
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
              text: `${member.reservationName} (${member.reservationSeats} ที่นั่ง)`,
              size: 'sm',
              color: '#7c3aed',
              flex: 1,
              margin: 'sm',
              wrap: true,
              weight: 'bold',
            },
          ],
          margin: 'sm',
        });
        memberIndex++;
        return;
      }

      // Handle regular members
      let displayName = member.name;

      // Show company name only if member is NOT from recipient's registration
      if (!member.isFromRecipient && member.companyName) {
        displayName = `${member.name} (${member.companyName})`;
      }

      console.log(`[generatePartyTableAssignmentFlexMessage] Table ${table.tableNumber}, Member ${memberIndex}:`, {
        name: member.name,
        isFromRecipient: member.isFromRecipient,
        displayName,
      });

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
      memberIndex++;
    });

    // Add member list section
    tableSections.push({
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '👥 รายชื่อสมาชิกในโต๊ะ',
          size: 'sm',
          weight: 'bold',
          color: '#333333',
          margin: 'md',
        },
        ...membersList,
      ],
    });
  });

  // Build the complete Flex Message
  const bubbleContents: any = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: '🍽️ แจ้งเลขโต๊ะปาร์ตี้',
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
      contents: [
        // Event info section
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
        // Table sections (one or more tables)
        ...tableSections,
      ],
      paddingAll: '15px',
    },
  };

  // Add footer only if seatingChartUrl exists
  if (seatingChartUrl) {
    bubbleContents.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          action: {
            type: 'uri',
            label: '🗺️ ดูผังโต๊ะ',
            uri: seatingChartUrl,
          },
          style: 'primary',
          color: '#7c3aed',
          height: 'sm',
        },
      ],
      paddingAll: '12px',
      backgroundColor: '#f9fafb',
    };
  }

  const flexMessage = {
    type: 'flex',
    altText: `แจ้งเลขโต๊ะปาร์ตี้ - ${tablesData.map(t => `โต๊ะ ${t.tableNumber}`).join(', ')}`,
    contents: bubbleContents,
  };

  // Log the complete message size for debugging
  const messageJSON = JSON.stringify(flexMessage);
  console.log('[generatePartyTableAssignmentFlexMessage] Message size:', messageJSON.length, 'bytes');
  console.log('[generatePartyTableAssignmentFlexMessage] altText:', flexMessage.altText);

  // Check for extremely long messages (LINE has limits)
  if (messageJSON.length > 50000) {
    console.warn('[generatePartyTableAssignmentFlexMessage] WARNING: Message size exceeds 50KB');
  }

  return flexMessage;
}
