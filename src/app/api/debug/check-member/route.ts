// Debug API Route - Check member LINE User ID in Google Sheet
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getMemberById } from '@/lib/google-sheets';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId') || '23081';

    const member = await getMemberById(memberId);

    if (!member) {
      return NextResponse.json({
        error: 'Member not found',
        memberId,
      }, { status: 404 });
    }

    return NextResponse.json({
      memberId: member.memberId,
      nickname: member.nickname,
      fullName: member.fullNameTH || '',
      lineUserId: member.lineUserId || 'NOT SET',
      lineUserIdLength: member.lineUserId?.length || 0,
      hasLineUserId: !!member.lineUserId,
      yourLineUserId: session.user.id,
      isMatch: member.lineUserId === session.user.id,
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
