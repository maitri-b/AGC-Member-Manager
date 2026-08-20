// API Route: GET/PUT /api/admin/settings
// Get and update system settings
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSystemSettings, updateSystemSettings } from '@/lib/settings';
import { SystemSettingsInput } from '@/types/settings';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const settings = await getSystemSettings();

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const body = await request.json();

    // Get current settings first
    const currentSettings = await getSystemSettings();

    // If only updating partial settings (e.g., savedMessageTemplates), merge with current
    const baseUrl = body.baseUrl || currentSettings.baseUrl;
    const websiteName = body.websiteName || currentSettings.websiteName;

    // Validate required fields
    if (!baseUrl || !websiteName) {
      return NextResponse.json(
        { error: 'Missing required fields: baseUrl, websiteName' },
        { status: 400 }
      );
    }

    // Validate URL format only if baseUrl is being updated
    if (body.baseUrl) {
      try {
        new URL(body.baseUrl);
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid baseUrl format. Must be a valid URL (e.g., https://example.com)' },
          { status: 400 }
        );
      }
    }

    const input: SystemSettingsInput = {
      baseUrl: baseUrl.trim().replace(/\/$/, ''), // Remove trailing slash
      websiteName: websiteName,
      websiteNameEN: body.websiteNameEN ?? currentSettings.websiteNameEN,
      contactEmail: body.contactEmail ?? currentSettings.contactEmail,
      contactPhone: body.contactPhone ?? currentSettings.contactPhone,
      lineOfficialAccount: body.lineOfficialAccount ?? currentSettings.lineOfficialAccount,
      defaultLanguage: body.defaultLanguage ?? currentSettings.defaultLanguage ?? 'th',
      timezone: body.timezone ?? currentSettings.timezone ?? 'Asia/Bangkok',
      enableEmailNotifications: body.enableEmailNotifications ?? currentSettings.enableEmailNotifications ?? false,
      enableLineNotifications: body.enableLineNotifications ?? currentSettings.enableLineNotifications ?? true,
      enableSmsNotifications: body.enableSmsNotifications ?? currentSettings.enableSmsNotifications ?? false,
      // Preserve existing messageTemplates unless explicitly provided
      messageTemplates: body.messageTemplates ?? currentSettings.messageTemplates ?? {},
      // Add savedMessageTemplates support
      savedMessageTemplates: body.savedMessageTemplates ?? currentSettings.savedMessageTemplates ?? [],
    };

    const settings = await updateSystemSettings(input, session.user.id);

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
