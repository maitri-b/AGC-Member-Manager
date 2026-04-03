// Debug API Route - Test LINE Push Message
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const { userId, message } = await request.json();
    const targetUserId = userId || session.user.id;

    const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!CHANNEL_ACCESS_TOKEN) {
      return NextResponse.json({
        error: 'LINE_CHANNEL_ACCESS_TOKEN is not configured',
      }, { status: 500 });
    }

    // Send a simple text message first
    const response = await fetch(LINE_MESSAGING_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: targetUserId,
        messages: [
          {
            type: 'text',
            text: message || `ทดสอบส่งข้อความจาก BNI Member Manager\n\nUser ID: ${targetUserId}`,
          },
        ],
      }),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      targetUserId,
      tokenPreview: CHANNEL_ACCESS_TOKEN.substring(0, 20) + '...',
      response: responseData,
    });
  } catch (error) {
    console.error('Debug LINE test error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  return NextResponse.json({
    message: 'Use POST to test LINE message',
    yourLineUserId: session.user.id,
    hasToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
  });
}
