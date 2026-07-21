// API Route for sending custom LINE messages to users
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getSystemSettings } from '@/lib/settings';
import { DEFAULT_TEMPLATES, MessageTemplateType } from '@/lib/message-templates';

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { lineUserId, message, templateType } = body;

    if (!lineUserId) {
      return NextResponse.json({ error: 'LINE User ID is required' }, { status: 400 });
    }

    let finalMessage = message;

    // If templateType is provided, use template
    if (templateType) {
      const settings = await getSystemSettings();
      const customTemplate = settings.messageTemplates?.[templateType];
      const template = customTemplate || DEFAULT_TEMPLATES[templateType as MessageTemplateType]?.template;

      if (!template) {
        return NextResponse.json({ error: 'Invalid template type' }, { status: 400 });
      }

      finalMessage = template;

      // Replace common variables
      const baseUrl = settings.baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'https://agc-member-manager.vercel.app';
      const verificationLink = `${baseUrl}/verify`;

      finalMessage = finalMessage.replace(/\{\{verificationLink\}\}/g, verificationLink);
      finalMessage = finalMessage.replace(/\{\{lineOfficialAccount\}\}/g, settings.lineOfficialAccount || 'https://lin.ee/nzAjXXq');
    }

    if (!finalMessage || !finalMessage.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Send via LINE Push API
    const response = await fetch(LINE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: 'text',
            text: finalMessage,
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
      message: 'ส่งข้อความเรียบร้อยแล้ว'
    });
  } catch (error) {
    console.error('Error sending LINE message:', error);
    return NextResponse.json({
      error: 'Failed to send LINE message',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
