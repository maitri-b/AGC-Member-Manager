// Debug API Route - Test LINE Flex Message
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getMemberById } from '@/lib/google-sheets';
import { createMemberProfileFlexMessage, sendPushMessage } from '@/lib/line-messaging';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const { memberId } = await request.json();
    const targetMemberId = memberId || '14015';

    // Get member data
    const member = await getMemberById(targetMemberId);

    if (!member) {
      return NextResponse.json({
        error: 'Member not found',
        memberId: targetMemberId,
      }, { status: 404 });
    }

    if (!member.lineUserId) {
      return NextResponse.json({
        error: 'Member has no LINE User ID',
        memberId: targetMemberId,
      }, { status: 400 });
    }

    // Create flex message
    const flexMessage = createMemberProfileFlexMessage(member);

    // Log the flex message for debugging
    console.log('Flex Message:', JSON.stringify(flexMessage, null, 2));

    // Try to send
    try {
      await sendPushMessage(member.lineUserId, [flexMessage]);
      return NextResponse.json({
        success: true,
        memberId: member.memberId,
        lineUserId: member.lineUserId,
        flexMessagePreview: flexMessage.altText,
      });
    } catch (sendError) {
      return NextResponse.json({
        success: false,
        error: sendError instanceof Error ? sendError.message : 'Unknown send error',
        memberId: member.memberId,
        lineUserId: member.lineUserId,
        flexMessage: flexMessage,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Debug flex test error:', error);
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
    message: 'Use POST with { "memberId": "14015" } to test Flex Message',
    yourLineUserId: session.user.id,
  });
}
