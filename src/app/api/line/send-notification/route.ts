// API Route for sending license expiry notification via LINE Push Message
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getMemberById } from '@/lib/google-sheets';
import { adminDb } from '@/lib/firebase-admin';
import { getBaseUrl } from '@/lib/settings';
import { generateSignedUrl } from '@/lib/firebase-storage';

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

// Thai month names
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// Format date from Google Sheet (MM/DD/YYYY in Gregorian year) to Thai format with Buddhist year
// Example: "5/2/2027" -> "2 พฤษภาคม 2570"
function formatThaiDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';

  try {
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        // Google Sheet Column S uses MM/DD/YYYY (US format, Gregorian year)
        const month = parseInt(parts[0], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10); // Already in Gregorian year (ค.ศ.)

        const yearBE = year + 543; // Convert to Buddhist Era (พ.ศ.)

        return `${day} ${THAI_MONTHS[month - 1]} ${yearBE}`;
      }
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - only admin and committee can send messages
    if (!hasPermission(session.user.permissions || [], 'member:read')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      memberId,
      lineUserIds,
      message: customMessage,
      imageUrl,
      flexMessage,
      subject,
      eventId,
      eventName,
      enablePersonalization
    } = body;

    // Support both old API (memberId) and new API (lineUserIds + custom message)
    if (!memberId && (!lineUserIds || lineUserIds.length === 0)) {
      return NextResponse.json({ error: 'Member ID or LINE User IDs are required' }, { status: 400 });
    }

    // Custom message mode (new)
    if (lineUserIds) {
      // Allow sending image only (without text message) or Flex message
      if (!customMessage?.trim() && !imageUrl?.trim() && !flexMessage) {
        return NextResponse.json({ error: 'Message, image, or Flex message is required' }, { status: 400 });
      }

      // Send custom message to multiple users
      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
        successfulSends: [] as { lineUserId: string; message: string }[],
      };

      // Fetch base URL from settings once before the loop
      const baseUrl = await getBaseUrl();

      for (const lineUserId of lineUserIds) {
        try {
          let personalizedMessage = customMessage;

          // Personalize message if enabled
          if (enablePersonalization) {
            try {
              // Fetch user data from Firestore
              const userSnapshot = await adminDb().collection('users')
                .where('lineUserId', '==', lineUserId)
                .limit(1)
                .get();

              if (!userSnapshot.empty) {
                const userData = userSnapshot.docs[0].data();

                // Replace personalization tags with multiple fallback options
                personalizedMessage = personalizedMessage
                  .replace(/{LINE_NAME}/g, userData.lineDisplayName || userData.displayName || userData.name || userData.fullNameTH || '')
                  .replace(/{CONTACT_NAME}/g, userData.fullNameTH || userData.lineDisplayName || userData.displayName || userData.name || '')
                  .replace(/{COMPANY_NAME}/g, userData.companyNameTH || userData.companyNameEN || '')
                  .replace(/{EVENT_URL}/g, `${baseUrl}/events/${encodeURIComponent(eventId)}`)
                  .replace(/{EVENT_NAME}/g, eventName || '');
              } else {
                // Fallback if user not found
                personalizedMessage = personalizedMessage
                  .replace(/{LINE_NAME}/g, '')
                  .replace(/{CONTACT_NAME}/g, '')
                  .replace(/{COMPANY_NAME}/g, '')
                  .replace(/{EVENT_URL}/g, `${baseUrl}/events/${encodeURIComponent(eventId)}`)
                  .replace(/{EVENT_NAME}/g, eventName || '');
              }
            } catch (err) {
              console.error('Error personalizing message:', err);
              // Continue with non-personalized message on error
            }
          }

          // Build messages array (Flex first if provided, then image if provided, then text if provided)
          const messages: any[] = [];

          // Add Flex message if provided (takes priority)
          if (flexMessage) {
            messages.push(flexMessage);
          }

          // Add image message first if imageUrl is provided (images appear before text in LINE)
          if (imageUrl && imageUrl.trim()) {
            // Validate that imageUrl is a valid HTTPS URL
            try {
              const url = new URL(imageUrl.trim());
              if (url.protocol === 'https:') {
                // If it's a storage.googleapis.com URL, generate signed URL for LINE to access
                let finalImageUrl = imageUrl.trim();

                if (imageUrl.includes('storage.googleapis.com')) {
                  console.log('[LINE Send Notification] Detected Firebase Storage URL, generating signed URL');
                  // Extract file path from URL
                  const pathParts = url.pathname.split('/');
                  pathParts.shift(); // Remove empty string from leading /
                  pathParts.shift(); // Remove bucket name
                  const filePath = pathParts.join('/');

                  if (filePath) {
                    try {
                      finalImageUrl = await generateSignedUrl(filePath);
                      console.log('[LINE Send Notification] Using signed URL for LINE');
                    } catch (err) {
                      console.warn('[LINE Send Notification] Error generating signed URL, using original:', err);
                    }
                  }
                }

                messages.push({
                  type: 'image',
                  originalContentUrl: finalImageUrl,
                  previewImageUrl: finalImageUrl,
                });
                console.log('[LINE Send Notification] Adding image to message');
              } else {
                console.warn('[LINE Send Notification] Image URL is not HTTPS, skipping image:', imageUrl);
              }
            } catch (error) {
              console.error('[LINE Send Notification] Invalid image URL, skipping image:', imageUrl, error);
            }
          }

          // Add text message after image if provided
          if (personalizedMessage && personalizedMessage.trim()) {
            messages.push({
              type: 'text',
              text: personalizedMessage,
            });
          }

          const response = await fetch(LINE_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              to: lineUserId,
              messages,
            }),
          });

          if (response.ok) {
            results.success++;
            results.successfulSends.push({ lineUserId, message: personalizedMessage });
          } else {
            const errorData = await response.json();
            results.failed++;
            results.errors.push(`${lineUserId}: ${errorData.message || 'Unknown error'}`);
          }
        } catch (err) {
          results.failed++;
          results.errors.push(`${lineUserId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Save custom message history to Firestore (always save, even without eventId)
      if (results.successfulSends.length > 0) {
        try {
          const promotionHistoryRef = adminDb().collection('promotionHistory');
          const batch = adminDb().batch();
          const sentAt = new Date();

          for (const send of results.successfulSends) {
            const historyDoc = promotionHistoryRef.doc();
            batch.set(historyDoc, {
              eventId: eventId || null,
              eventName: eventName || '',
              lineUserId: send.lineUserId,
              sentAt,
              sentBy: session.user.lineUserId || session.user.id || 'unknown',
              sentByName: session.user.name || 'Unknown',
              message: send.message,
              messageType: 'custom',
              subject: subject || 'ข้อความกำหนดเอง',
            });
          }

          await batch.commit();
          console.log(`[Send Notification] Saved ${results.successfulSends.length} history records`);
        } catch (error) {
          console.error('Error saving custom message history:', error);
          // Don't fail the request if history save fails
        }
      }

      return NextResponse.json({
        success: true,
        message: `ส่งข้อความสำเร็จ ${results.success} คน${results.failed > 0 ? `, ไม่สำเร็จ ${results.failed} คน` : ''}`,
        results,
      });
    }

    // Legacy mode - send license expiry notification to single member
    if (!memberId) {
      return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
    }

    // Get member data from Google Sheet
    const member = await getMemberById(memberId);

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Check if member has LINE User ID
    if (!member.lineUserId) {
      return NextResponse.json({
        error: 'สมาชิกนี้ยังไม่ได้เชื่อมต่อ LINE Account',
        details: 'กรุณาให้ Admin เชื่อมต่อ LINE Account ของสมาชิกก่อน'
      }, { status: 400 });
    }

    // Build notification message
    // Use licenseExpiry (column S - วันหมดอายุ) for license expiry date
    const message = `สวัสดีครับ คุณ${member.fullNameTH || member.nickname || ''}
บริษัท ${member.companyNameTH || member.companyNameEN || ''}

ทางทีมทะเบียนชมรม Agents Club ตรวจพบว่า
ใบอนุญาตธุรกิจนำเที่ยว เลขที่ ${member.licenseNumber || '-'}
มีสถานะ ${member.status || '-'} (หมดอายุ ${formatThaiDate(member.licenseExpiry)})

หากคุณได้ต่ออายุใบอนุญาตแล้ว หรือมีข้อมูลที่อัพเดท
รบกวนส่งสำเนาใบอนุญาตใหม่มาทาง LINE นี้ด้วยนะครับ

เนื่องจากนโยบายของชมรม อนุญาตให้เฉพาะสมาชิกที่มีใบอนุญาตที่ยังไม่หมดอายุอยู่ในกลุ่ม
หากไม่ได้รับการติดต่อกลับ ทางทีมทะเบียนจะขอนำชื่อออกจาก LINE กลุ่มไว้ก่อนนะครับ

ถ้าทีมทะเบียนได้รับข้อมูลอัพเดทและตรวจสอบเรียบร้อยแล้ว
ทีมงานจะนำกลับเข้ากลุ่มให้ทันทีครับ

ขอบคุณครับ
ไมตรี บุญกิจรุ่งไพศาล
ทีมทะเบียนชมรม Agents Club`;

    // Send via LINE Push API
    const response = await fetch(LINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: member.lineUserId,
        messages: [
          {
            type: 'text',
            text: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('LINE API Error:', errorData);
      throw new Error(errorData.message || 'Failed to send LINE message');
    }

    return NextResponse.json({
      success: true,
      message: `ส่งแจ้งเตือนไปยัง ${member.nickname || member.fullNameTH || ''} เรียบร้อยแล้ว`
    });
  } catch (error) {
    console.error('Error sending LINE notification:', error);
    return NextResponse.json({
      error: 'Failed to send LINE notification',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
