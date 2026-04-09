// API Route for sending verification result via LINE Push Message
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getMemberById } from '@/lib/google-sheets';
import { sendPushMessage, createMemberProfileFlexMessage } from '@/lib/line-messaging';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - only admin can send verification results
    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { lineUserId, memberId, status, rejectionReason, lineDisplayName } = await request.json();

    if (!lineUserId || !status) {
      return NextResponse.json({ error: 'lineUserId and status are required' }, { status: 400 });
    }

    const messages: unknown[] = [];
    const profileUrl = process.env.NEXTAUTH_URL || 'https://agentsclub.vercel.app';

    if (status === 'approved') {
      // Approved: Send text message + member profile flex message
      const textMessage = {
        type: 'text',
        text: `🎉 ยินดีด้วย! คำขอยืนยันตัวตนของคุณได้รับการอนุมัติแล้ว

คุณสามารถเข้าถึงข้อมูลและบริการต่างๆ ของ Agents Club ได้แล้วครับ

📌 รหัสสมาชิก: ${memberId}

🛑 สำคัญ! โปรดตรวจสอบข้อมูลชื่อ ชื่อบริษัท เบอร์ติดต่อ ของท่านที่อยู่ในระบบ
หากพบข้อมูลไม่ถูกต้อง หรือมีการอัพเดทใหม่
กรุณาแก้ไขและส่งคำร้องขอแก้ไขได้ที่ หน้า Profile ของฉัน
ทีมทะเบียนจะตรวจสอบข้อมูล และบันทึกข้อมูลใหม่ให้ครับ

ขอบคุณที่เป็นส่วนหนึ่งของ Agents Club
Helping & Sharing`,
      };
      messages.push(textMessage);

      // Get member data and send profile flex message
      if (memberId) {
        const member = await getMemberById(memberId);
        if (member) {
          const flexMessage = createMemberProfileFlexMessage(member);
          messages.push(flexMessage);
        }
      }
    } else if (status === 'rejected') {
      // Rejected: Send rejection message
      const reason = rejectionReason || 'ไม่ผ่านการตรวจสอบข้อมูล';
      const textMessage = {
        type: 'text',
        text: `ขออภัย คำขอยืนยันตัวตนของคุณไม่ผ่านการอนุมัติ

📋 เหตุผล: ${reason}

หากคุณเชื่อว่าเป็นข้อผิดพลาด หรือต้องการส่งคำขอใหม่ กรุณาเข้าสู่ระบบและยืนยันตัวตนอีกครั้ง

🔗 ${profileUrl}/verify

หากมีข้อสงสัย สามารถติดต่อทีมงาน Agents Club ได้เลยครับ`,
      };
      messages.push(textMessage);
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages to send' }, { status: 400 });
    }

    // Send via LINE Push API
    await sendPushMessage(lineUserId, messages);

    return NextResponse.json({
      success: true,
      message: `ส่งแจ้งผลการยืนยันตัวตนไปยัง ${lineDisplayName || 'ผู้ใช้'} เรียบร้อยแล้ว`,
    });
  } catch (error) {
    console.error('Error sending verification result:', error);
    return NextResponse.json({
      error: 'Failed to send LINE message',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
