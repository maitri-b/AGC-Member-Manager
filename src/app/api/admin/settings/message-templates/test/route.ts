/**
 * API Endpoint: Test Message Template
 * POST /api/admin/settings/message-templates/test
 *
 * Send a test message using a specific template to a selected user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import {
  sendApplicationApprovedNotification,
  sendApplicationRejectedNotification,
  sendPushMessage
} from '@/lib/line-messaging';
import { DEFAULT_TEMPLATES, MessageTemplateType } from '@/lib/message-templates';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { templateType, lineUserId, userData } = body;

    if (!templateType || !lineUserId || !userData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate template type
    if (!DEFAULT_TEMPLATES[templateType as MessageTemplateType]) {
      return NextResponse.json(
        { error: 'Invalid template type' },
        { status: 400 }
      );
    }

    // Get custom template from settings if available
    const db = adminDb();
    const settingsDoc = await db.collection('settings').doc('system').get();
    const customTemplate = settingsDoc.exists
      ? settingsDoc.data()?.messageTemplates?.[templateType]
      : undefined;

    let success = false;

    // Handle different template types
    switch (templateType) {
      case 'application_approved':
        success = await sendApplicationApprovedNotification(
          lineUserId,
          {
            memberName: userData.lineDisplayName || userData.name || 'คุณสมาชิก',
            memberId: userData.memberId || 'M-XXXX',
            fullName: userData.name || 'ชื่อเต็ม',
            companyName: userData.companyNameEN || 'บริษัท',
            memberStatus: 'Active Member',
          },
          customTemplate
        );
        break;

      case 'application_rejected':
        success = await sendApplicationRejectedNotification(
          lineUserId,
          {
            memberName: userData.lineDisplayName || userData.name || 'คุณสมาชิก',
            rejectionReason: 'นี่เป็นข้อความทดสอบ - ไม่มีเหตุผลจริง',
          },
          customTemplate
        );
        break;

      case 'remaining_payment':
      case 'full_payment':
      case 'deadline_warning':
      case 'overdue_notice':
        // For payment templates, send with example data
        const template = customTemplate || DEFAULT_TEMPLATES[templateType as MessageTemplateType].template;

        // Replace variables with example data
        const message = template
          .replace(/\{\{memberName\}\}/g, userData.lineDisplayName || userData.name || 'คุณสมาชิก')
          .replace(/\{\{eventName\}\}/g, 'ทริปญี่ปุ่น โตเกียว-ฟูจิ 5 วัน 4 คืน (ตัวอย่าง)')
          .replace(/\{\{amountText\}\}/g, '25,000')
          .replace(/\{\{deadlineText\}\}/g, '15 สิงหาคม 2569 (อีก 3 วัน - เร่งด่วน!)')
          .replace(/\{\{paymentTypeLabel\}\}/g, 'มัดจำ')
          .replace(/\{\{daysOverdue\}\}/g, '2')
          .replace(/\{\{registrationId\}\}/g, 'REG-TEST-001')
          .replace(/\{\{eventLink\}\}/g, 'https://agc-member-manager.vercel.app/events/example')
          .replace(/\{\{profileLink\}\}/g, 'https://agc-member-manager.vercel.app/profile')
          .replace(/\{\{lineOfficialAccount\}\}/g, 'https://lin.ee/nzAjXXq');

        success = await sendPushMessage(lineUserId, [
          { type: 'text', text: `[ข้อความทดสอบ]\n\n${message}` }
        ]);
        break;

      default:
        return NextResponse.json(
          { error: 'Unsupported template type for testing' },
          { status: 400 }
        );
    }

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Test message sent successfully',
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to send test message' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error sending test message:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send test message' },
      { status: 500 }
    );
  }
}
