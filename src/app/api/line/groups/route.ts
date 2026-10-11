import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

/**
 * Get all LINE Groups that the bot has joined
 * Admin only
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    // Get all groups from Firestore
    const snapshot = await adminDb().collection('lineGroups').get();

    const groups = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      joinedAt: doc.data().joinedAt?.toDate?.() || null,
      lastActivity: doc.data().lastActivity?.toDate?.() || null,
      leftAt: doc.data().leftAt?.toDate?.() || null,
    }));

    // Sort by last activity
    groups.sort((a, b) => {
      const dateA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const dateB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Error fetching LINE groups:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
