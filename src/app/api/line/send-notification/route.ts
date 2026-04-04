// API Route for sending license expiry notification via LINE Push Message
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getMemberById } from '@/lib/google-sheets';

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

    // Build notification message
    const message = `สวัสดีครับ คุณ${member.fullNameTH || member.nickname || ''}
บริษัท ${member.companyNameTH || member.companyNameEN || ''}

ทางทีมทะเบียนชมรม Agents Club ตรวจพบว่า
ใบอนุญาตธุรกิจนำเที่ยว เลขที่ ${member.licenseNumber || '-'}
มีสถานะ ${member.status || '-'} (หมดอายุ ${member.licenseExpiry || '-'})

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
