// API Route: GET /api/settings
// Get public system settings (accessible to all authenticated users)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSystemSettings } from '@/lib/settings';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is authenticated (any role)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch full settings
    const settings = await getSystemSettings();

    // Return only public fields that members should be able to see
    return NextResponse.json({
      websiteName: settings.websiteName,
      websiteNameEN: settings.websiteNameEN,
      lineOfficialAccount: settings.lineOfficialAccount,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
    });
  } catch (error) {
    console.error('Error fetching public settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
