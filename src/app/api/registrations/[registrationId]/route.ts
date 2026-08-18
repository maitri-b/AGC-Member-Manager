// API Route: Get Registration by ID
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { adminDb } from '@/lib/firebase-admin';

// Helper function to normalize member names from JSON array format
function normalizeMemberName(name: any): string {
  if (!name) return '';
  let current = name;

  // Handle multiple levels of JSON encoding
  while (typeof current === 'string' && (current.startsWith('[') || current.startsWith('{'))) {
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) {
        if (parsed.length === 1) {
          current = parsed[0];
          continue;
        }
        return parsed.join(', ').trim();
      }
      current = parsed;
    } catch {
      break;
    }
  }

  if (Array.isArray(current)) {
    return current.join(', ').trim();
  }
  return String(current).trim();
}

/**
 * GET /api/registrations/[registrationId]
 * Get registration details by registration ID
 * - Supports impersonation mode
 * - Available to all authenticated users (members can search for inviting to carpools/tables)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { registrationId: string } }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // No admin permission required - members need this for inviting to carpools/tables

    const { registrationId } = params;

    if (!registrationId) {
      return NextResponse.json({ error: 'Registration ID is required' }, { status: 400 });
    }

    // Find registration by registrationId
    const db = adminDb();
    const snapshot = await db
      .collection('eventRegistrations')
      .where('registrationId', '==', registrationId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Normalize attendeeNames if it's a string (could be JSON array format or comma-separated)
    let normalizedAttendeeNames = data.attendeeNames;
    if (typeof data.attendeeNames === 'string') {
      const names = data.attendeeNames.split(',').map((name: string) => normalizeMemberName(name.trim()));
      normalizedAttendeeNames = names.join(', ');
    }

    const registration = {
      id: doc.id,
      ...data,
      attendeeNames: normalizedAttendeeNames,
    };

    return NextResponse.json({ registration });
  } catch (error) {
    console.error('Error fetching registration:', error);
    return NextResponse.json(
      { error: 'Failed to fetch registration', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
