// API Route for Batch Registration - Register multiple users at once
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';

interface BatchRegistrationRequest {
  userId: string;
  displayName: string;
  fullNameTH?: string;
  memberId?: string;
  licenseNumber?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'events:manage-assigned')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { eventId } = await params;
    const body = await request.json();
    const { registrations, sendNotification = true } = body;

    if (!Array.isArray(registrations) || registrations.length === 0) {
      return NextResponse.json({ error: 'Registrations array is required' }, { status: 400 });
    }

    const db = adminDb();
    const results = [];
    const errors = [];

    // Process each registration sequentially
    for (const reg of registrations as BatchRegistrationRequest[]) {
      try {
        // Call the existing register-on-behalf API for each user
        const response = await fetch(`${request.nextUrl.origin}/api/events/${eventId}/register-on-behalf`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            userId: reg.userId,
            memberId: reg.memberId,
            licenseNumber: reg.licenseNumber,
            attendeeCount: 1, // Each registration is for 1 person
            attendeeNames: [reg.fullNameTH || reg.displayName], // Use fullNameTH as first attendee name
            attendeeTypeSelections: [],
            roomAllocations: [],
            specialRequests: `Batch registration by ${session.user.name || 'Admin'}`,
            sendNotification,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          results.push({
            userId: reg.userId,
            displayName: reg.displayName,
            success: true,
            registrationId: data.registrationId,
          });
        } else {
          errors.push({
            userId: reg.userId,
            displayName: reg.displayName,
            error: data.error || 'Registration failed',
          });
        }
      } catch (error) {
        console.error(`Error registering user ${reg.userId}:`, error);
        errors.push({
          userId: reg.userId,
          displayName: reg.displayName,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalRequested: registrations.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error('Error in batch registration:', error);
    return NextResponse.json({ error: 'Failed to process batch registration' }, { status: 500 });
  }
}
