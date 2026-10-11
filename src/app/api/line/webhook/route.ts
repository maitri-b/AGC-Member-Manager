import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';

/**
 * LINE Webhook Endpoint
 * ใช้สำหรับรับ events จาก LINE Platform
 * เช่น join group, message, follow, etc.
 */

// Verify LINE signature
function verifySignature(body: string, signature: string): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error('LINE_CHANNEL_SECRET not configured');
    return false;
  }

  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');

  return hash === signature;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-line-signature');

    // Verify signature
    if (!signature || !verifySignature(body, signature)) {
      console.error('❌ Invalid LINE signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const events = data.events || [];

    console.log('📨 Received LINE webhook:', {
      eventsCount: events.length,
      timestamp: new Date().toISOString()
    });

    // Process each event
    for (const event of events) {
      console.log('\n🔔 LINE Event:', {
        type: event.type,
        source: event.source,
        timestamp: new Date(event.timestamp).toISOString()
      });

      // Log Group ID if available
      if (event.source?.type === 'group') {
        console.log('👥 GROUP ID FOUND:', event.source.groupId);
        console.log('📋 Full event data:', JSON.stringify(event, null, 2));
      }

      // Handle different event types
      switch (event.type) {
        case 'join':
          await handleJoinEvent(event);
          break;
        case 'message':
          await handleMessageEvent(event);
          break;
        case 'follow':
          await handleFollowEvent(event);
          break;
        case 'leave':
          await handleLeaveEvent(event);
          break;
        default:
          console.log('ℹ️ Unhandled event type:', event.type);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Handle when bot joins a group/room
 */
async function handleJoinEvent(event: any) {
  if (event.source.type === 'group') {
    const groupId = event.source.groupId;

    console.log('🎉 Bot joined group!');
    console.log('Group ID:', groupId);

    // Save to Firestore for future reference
    try {
      await adminDb().collection('lineGroups').doc(groupId).set({
        groupId: groupId,
        joinedAt: new Date(),
        source: 'webhook_join',
        eventType: 'join',
        lastActivity: new Date()
      });
      console.log('✅ Group ID saved to Firestore');
    } catch (error) {
      console.error('❌ Error saving group ID:', error);
    }
  }
}

/**
 * Handle message events
 */
async function handleMessageEvent(event: any) {
  if (event.source.type === 'group') {
    const groupId = event.source.groupId;
    const userId = event.source.userId;

    console.log('💬 Message in group:', groupId);
    console.log('From user:', userId);
    console.log('Message:', event.message);

    // Update last activity
    try {
      await adminDb().collection('lineGroups').doc(groupId).set({
        groupId: groupId,
        lastActivity: new Date(),
        lastMessageAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('❌ Error updating group activity:', error);
    }
  }
}

/**
 * Handle follow event (user adds bot as friend)
 */
async function handleFollowEvent(event: any) {
  const userId = event.source.userId;
  console.log('👤 User followed bot:', userId);

  // You can save this to track bot followers
  try {
    await adminDb().collection('lineFollowers').doc(userId).set({
      userId: userId,
      followedAt: new Date(),
      source: 'webhook_follow'
    });
  } catch (error) {
    console.error('❌ Error saving follower:', error);
  }
}

/**
 * Handle leave event (bot removed from group)
 */
async function handleLeaveEvent(event: any) {
  if (event.source.type === 'group') {
    const groupId = event.source.groupId;
    console.log('👋 Bot left group:', groupId);

    try {
      await adminDb().collection('lineGroups').doc(groupId).update({
        leftAt: new Date(),
        active: false
      });
    } catch (error) {
      console.error('❌ Error updating group leave status:', error);
    }
  }
}

// Allow OPTIONS for CORS
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
