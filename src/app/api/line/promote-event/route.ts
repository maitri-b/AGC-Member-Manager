// API Route for sending event promotion via LINE Push Message
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

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

    const { memberIds, eventId, eventName, eventDescription, eventUrl, attachImage, imageUrl } = await request.json();

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: 'Member IDs are required' }, { status: 400 });
    }

    if (!eventId || !eventName || !eventUrl) {
      return NextResponse.json({ error: 'Event details are required' }, { status: 400 });
    }

    // Truncate description to 600 characters
    let shortDescription = eventDescription || '';
    if (shortDescription.length > 600) {
      shortDescription = shortDescription.substring(0, 600) + '...';
    }

    // Build full event URL with domain
    const fullEventUrl = eventUrl.startsWith('http')
      ? eventUrl
      : `https://agc-member-manager.vercel.app${eventUrl}`;

    // Build promotion message
    const message = `🎉 ${eventName}

${shortDescription}

คลิกเพื่อดูรายละเอียดและลงทะเบียน:
${fullEventUrl}`;

    const results: { lineUserId: string; success: boolean; error?: string }[] = [];

    // Prepare messages array
    const messages: any[] = [];

    // Add image message first if attachImage is enabled and imageUrl exists
    if (attachImage && imageUrl) {
      messages.push({
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: imageUrl,
      });
    }

    // Add text message
    messages.push({
      type: 'text',
      text: message,
    });

    // Send messages to all selected members
    for (const lineUserId of memberIds) {
      try {
        const response = await fetch(LINE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: lineUserId,
            messages: messages,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`LINE API Error for ${lineUserId}:`, errorData);
          results.push({
            lineUserId,
            success: false,
            error: errorData.message || 'Failed to send'
          });
        } else {
          results.push({
            lineUserId,
            success: true
          });
        }
      } catch (error) {
        console.error(`Error sending to ${lineUserId}:`, error);
        results.push({
          lineUserId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

      // Add small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    // Save promotion history for successful sends
    const promotionHistoryRef = adminDb().collection('promotionHistory');
    const batch = adminDb().batch();
    const sentAt = new Date();

    for (const result of results) {
      if (result.success) {
        const historyDoc = promotionHistoryRef.doc();
        batch.set(historyDoc, {
          eventId,
          eventName,
          lineUserId: result.lineUserId,
          sentAt,
          sentBy: session.user.lineUserId || session.user.id || 'unknown',
          sentByName: session.user.name || 'Unknown',
          message,
          messageType: 'promote',
          subject: eventName,
        });
      }
    }

    try {
      await batch.commit();
    } catch (error) {
      console.error('Error saving promotion history:', error);
      // Don't fail the request if history save fails
    }

    return NextResponse.json({
      success: true,
      message: `ส่งข้อความสำเร็จ ${successCount} คน${failCount > 0 ? `, ล้มเหลว ${failCount} คน` : ''}`,
      results
    });
  } catch (error) {
    console.error('Error sending LINE promotion:', error);
    return NextResponse.json({
      error: 'Failed to send LINE promotion',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
