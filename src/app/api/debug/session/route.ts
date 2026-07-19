// Debug API Route - Check current session data
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    // Get user data from Firestore
    const db = adminDb();
    const userDoc = await db.collection('users').doc(session.user.id).get();
    const firestoreData = userDoc.exists ? userDoc.data() : null;

    // Check admin access specifically
    const hasAdminAccessPermission = session.user.permissions?.includes('admin:access') || false;

    return NextResponse.json({
      session: {
        user: session.user,
      },
      firestore: firestoreData,
      adminMenuCheck: {
        hasAdminAccess: hasAdminAccessPermission,
        role: session.user.role,
        permissionsArray: session.user.permissions || [],
        permissionsCount: session.user.permissions?.length || 0,
        shouldSeeAdminMenu: hasAdminAccessPermission,
      },
      message: hasAdminAccessPermission
        ? 'Admin menu should be visible in navbar'
        : 'Admin menu NOT visible - need admin:access permission. If firestore.role is "admin" but session.user.permissions is empty, please logout and login again.',
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
