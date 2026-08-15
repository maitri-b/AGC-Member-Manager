// API Route: Get Registration by ID
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { adminDb } from '@/lib/firebase-admin';

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
