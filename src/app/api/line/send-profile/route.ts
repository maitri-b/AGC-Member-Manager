// API Route for sending member profile via LINE Push Message
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getMemberById } from '@/lib/google-sheets';
import { sendMemberProfile } from '@/lib/line-messaging';

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

    const { memberId } = await request.json();

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

    // Send profile via LINE
    await sendMemberProfile(member.lineUserId, member);

    return NextResponse.json({
      success: true,
      message: `ส่งข้อมูลสมาชิกไปยัง ${member.nickname || member.fullNameTH || ''} เรียบร้อยแล้ว`
    });
  } catch (error) {
    console.error('Error sending LINE message:', error);
    return NextResponse.json({
      error: 'Failed to send LINE message',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
