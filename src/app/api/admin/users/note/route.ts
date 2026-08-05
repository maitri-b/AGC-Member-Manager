// API Route for managing admin notes on users
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, adminNote, adminNoteIcon } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const userRef = db.collection('users').doc(userId);

    // Update admin note
    await userRef.update({
      adminNote: adminNote || '',
      adminNoteIcon: adminNoteIcon || 'note',
      adminNoteUpdatedAt: new Date(),
      adminNoteUpdatedBy: session.user.id,
      adminNoteUpdatedByName: session.user.name || 'Unknown',
    });

    return NextResponse.json({
      success: true,
      message: 'บันทึกหมายเหตุเรียบร้อยแล้ว'
    });
  } catch (error) {
    console.error('Error updating admin note:', error);
    return NextResponse.json({
      error: 'Failed to update admin note',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
