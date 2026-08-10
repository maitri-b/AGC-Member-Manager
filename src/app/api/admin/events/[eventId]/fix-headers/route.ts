// API Route for Admin - Fix Event Sheet Headers
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { ensureSheetHeaders } from '@/lib/events';

// POST - Fix headers for an event sheet
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
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

    const { eventId } = await params;

    const db = adminDb();
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();
    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'Event has no sheet configured' }, { status: 400 });
    }

    // Fix headers
    const result = await ensureSheetHeaders(eventData.sheetName);

    if (!result.success) {
      return NextResponse.json({ error: 'Failed to fix headers' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: result.addedHeaders.length > 0
        ? `Added ${result.addedHeaders.length} missing headers`
        : 'All headers are already present',
      addedHeaders: result.addedHeaders,
    });
  } catch (error) {
    console.error('Error fixing event sheet headers:', error);
    return NextResponse.json({ error: 'Failed to fix headers' }, { status: 500 });
  }
}
