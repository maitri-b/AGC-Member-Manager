/**
 * Notification Helper
 * Helper functions for sending notifications based on system settings
 */

import { adminDb } from '@/lib/firebase-admin';
import { sendPushMessage } from '@/lib/line-messaging';
import { NotificationSettings, NotificationTarget, DEFAULT_NOTIFICATION_SETTINGS } from '@/types/settings';

const SETTINGS_DOC_ID = 'notification-settings';

/**
 * Get notification settings from Firestore
 */
async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const db = adminDb();
    const doc = await db.collection('systemSettings').doc(SETTINGS_DOC_ID).get();

    if (!doc.exists) {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }

    return doc.data() as NotificationSettings;
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/**
 * Get list of LINE user IDs to send notifications to based on targets
 */
async function getTargetUserIds(targets: NotificationTarget[]): Promise<string[]> {
  const userIds: string[] = [];
  const db = adminDb();

  for (const target of targets) {
    if (!target.enabled) continue;

    switch (target.type) {
      case 'admin_users':
        // Get all admin users with LINE
        try {
          const usersSnapshot = await db.collection('users').where('role', '==', 'admin').get();
          const adminLineIds = usersSnapshot.docs
            .map(doc => doc.data().lineUserId)
            .filter(id => id); // Only users with LINE ID
          userIds.push(...adminLineIds);
        } catch (error) {
          console.error('Error fetching admin users:', error);
        }
        break;

      case 'line_group':
        // Add LINE group ID
        if (target.targetId) {
          userIds.push(target.targetId);
        }
        break;

      case 'specific_user':
        // Add specific user ID
        if (target.targetId) {
          userIds.push(target.targetId);
        }
        break;
    }
  }

  // Remove duplicates
  return [...new Set(userIds)];
}

/**
 * Send membership application notification based on settings
 */
export async function sendMembershipApplicationNotification(applicationData: {
  companyNameTH: string;
  companyNameEN: string;
  nickname: string;
  positionCompany: string;
  licenseNumber: string;
  email?: string;
  phone?: string;
  mobile?: string;
}): Promise<void> {
  try {
    // Get notification settings
    const settings = await getNotificationSettings();

    // Check if membership application notifications are enabled
    if (!settings.membershipApplication?.enabled) {
      console.log('Membership application notifications are disabled');
      return;
    }

    // Get target user IDs
    const targetUserIds = await getTargetUserIds(settings.membershipApplication.targets);

    if (targetUserIds.length === 0) {
      console.log('No notification targets configured for membership applications');
      return;
    }

    // Create notification message
    const message = `📋 มีใบสมัครสมาชิกใหม่!\n\n` +
      `ชื่อบริษัท: ${applicationData.companyNameTH}\n` +
      `(${applicationData.companyNameEN})\n\n` +
      `ชื่อผู้สมัคร: ${applicationData.nickname}\n` +
      `ตำแหน่ง: ${applicationData.positionCompany}\n` +
      `เลขใบอนุญาต: ${applicationData.licenseNumber}\n\n` +
      `📞 ติดต่อ:\n` +
      `Email: ${applicationData.email || '-'}\n` +
      `โทร: ${applicationData.phone || '-'}\n` +
      `มือถือ: ${applicationData.mobile || '-'}\n\n` +
      `กรุณาตรวจสอบและอนุมัติใบสมัครที่หน้า Admin`;

    // Send to all targets
    const sendPromises = targetUserIds.map((userId) =>
      sendPushMessage(userId, [{ type: 'text', text: message }])
        .catch(err => console.error(`Failed to send notification to ${userId}:`, err))
    );

    await Promise.all(sendPromises);
    console.log(`✅ Sent membership application notification to ${targetUserIds.length} target(s)`);
  } catch (error) {
    console.error('Error sending membership application notification:', error);
    // Don't throw error - notification failure should not block the main process
  }
}
