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

    // Validate required fields
    if (!body.baseUrl || !body.websiteName) {
      return NextResponse.json(
        { error: 'Missing required fields: baseUrl, websiteName' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.baseUrl);
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid baseUrl format. Must be a valid URL (e.g., https://example.com)' },
        { status: 400 }
      );
    }

    const input: SystemSettingsInput = {
      baseUrl: body.baseUrl.trim().replace(/\/$/, ''), // Remove trailing slash
      websiteName: body.websiteName,
      websiteNameEN: body.websiteNameEN,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      lineOfficialAccount: body.lineOfficialAccount,
      defaultLanguage: body.defaultLanguage || 'th',
      timezone: body.timezone || 'Asia/Bangkok',
      enableEmailNotifications: body.enableEmailNotifications ?? false,
      enableLineNotifications: body.enableLineNotifications ?? true,
      enableSmsNotifications: body.enableSmsNotifications ?? false,
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
