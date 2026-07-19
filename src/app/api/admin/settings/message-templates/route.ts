// API Route: GET/PUT /api/admin/settings/message-templates
// Get and update message templates
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSystemSettings, updateSystemSettings } from '@/lib/settings';
import { DEFAULT_TEMPLATES, MessageTemplateType } from '@/lib/message-templates';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const settings = await getSystemSettings();

    // Return custom templates merged with defaults
    const templates: Record<string, { default: string; custom?: string }> = {};

    Object.keys(DEFAULT_TEMPLATES).forEach((key) => {
      const templateType = key as MessageTemplateType;
      templates[key] = {
        default: DEFAULT_TEMPLATES[templateType].template,
        custom: settings.messageTemplates?.[key],
      };
    });

    return NextResponse.json({
      templates,
      defaults: DEFAULT_TEMPLATES,
    });
  } catch (error) {
    console.error('Error fetching message templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch message templates' },
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
    const { templateType, customTemplate } = body;

    if (!templateType) {
      return NextResponse.json(
        { error: 'Missing required field: templateType' },
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

    // Get current settings
    const currentSettings = await getSystemSettings();

    // Update message templates
    const updatedTemplates: Record<string, string> = {
      ...(currentSettings.messageTemplates || {}),
    };

    if (customTemplate) {
      updatedTemplates[templateType] = customTemplate;
    } else {
      // Remove template if customTemplate is empty (reset to default)
      delete updatedTemplates[templateType];
    }

    // Update settings
    const settings = await updateSystemSettings(
      {
        baseUrl: currentSettings.baseUrl,
        websiteName: currentSettings.websiteName,
        websiteNameEN: currentSettings.websiteNameEN,
        contactEmail: currentSettings.contactEmail,
        contactPhone: currentSettings.contactPhone,
        lineOfficialAccount: currentSettings.lineOfficialAccount,
        defaultLanguage: currentSettings.defaultLanguage,
        timezone: currentSettings.timezone,
        enableEmailNotifications: currentSettings.enableEmailNotifications,
        enableLineNotifications: currentSettings.enableLineNotifications,
        enableSmsNotifications: currentSettings.enableSmsNotifications,
        messageTemplates: updatedTemplates,
      },
      session.user.id
    );

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('Error updating message template:', error);
    return NextResponse.json(
      { error: 'Failed to update message template' },
      { status: 500 }
    );
  }
}
