// API Route for Admin - Get User Search Logs
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { id: userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const db = adminDb();

    // Get search logs for this user
    // Avoid using where + orderBy together to prevent composite index requirement
    const logsSnapshot = await db.collection('searchLogs')
      .where('userId', '==', userId)
      .limit(100)
      .get();

    let logs = logsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        searchQuery: data.searchQuery,
        searchType: data.searchType,
        searchedAt: data.searchedAt?.toDate?.() || data.searchedAt,
        attemptNumber: data.attemptNumber,
      };
    });

    // Sort by searchedAt descending in JavaScript
    logs.sort((a, b) => {
      const dateA = a.searchedAt instanceof Date ? a.searchedAt.getTime() : new Date(a.searchedAt || 0).getTime();
      const dateB = b.searchedAt instanceof Date ? b.searchedAt.getTime() : new Date(b.searchedAt || 0).getTime();
      return dateB - dateA;
    });

    // Limit to 50
    logs = logs.slice(0, 50);

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Error fetching search logs:', error);
    return NextResponse.json({ error: 'Failed to fetch search logs' }, { status: 500 });
  }
}
