import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { NotificationSettings, DEFAULT_NOTIFICATION_SETTINGS } from '@/types/settings';

const SETTINGS_DOC_ID = 'notification-settings';

/**
 * GET - Fetch notification settings
 * Admin only
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const db = adminDb();
    const doc = await db.collection('systemSettings').doc(SETTINGS_DOC_ID).get();

    if (!doc.exists) {
      // Return default settings if not exists
      return NextResponse.json({ settings: DEFAULT_NOTIFICATION_SETTINGS });
    }

    const settings = doc.data() as NotificationSettings;

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * POST - Update notification settings
 * Admin only
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings) {
      return NextResponse.json({ error: 'Settings data is required' }, { status: 400 });
    }

    const db = adminDb();

    // Update settings with metadata
    const updatedSettings: NotificationSettings = {
      ...settings,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id || session.user.email || 'unknown',
    };

    await db.collection('systemSettings').doc(SETTINGS_DOC_ID).set(updatedSettings, { merge: true });

    console.log(`Notification settings updated by ${session.user.name || session.user.id}`);

    return NextResponse.json({
      success: true,
      message: 'บันทึกการตั้งค่าเรียบร้อยแล้ว',
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
