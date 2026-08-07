// API Route: Get Registration by ID
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';

/**
 * GET /api/registrations/[registrationId]
 * Get registration details by registration ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { registrationId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access permission
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

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
    const registration = {
      id: doc.id,
      ...doc.data(),
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
