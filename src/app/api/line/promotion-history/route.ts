// API Route: GET /api/line/promotion-history - Get promotion message history
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'member:read')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Fetch promotion history for this event
    // IMPORTANT: Don't use .where() + .orderBy() together to avoid composite index requirement
    const historySnapshot = await adminDb()
      .collection('promotionHistory')
      .where('eventId', '==', eventId)
      .get();

    // Map to array and convert dates
    let history = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      sentAt: doc.data().sentAt?.toDate?.()?.toISOString() || doc.data().sentAt,
    }));

    // Sort in JavaScript instead of Firestore
    history.sort((a: any, b: any) => {
      const dateA = new Date(a.sentAt).getTime();
      const dateB = new Date(b.sentAt).getTime();
      return dateB - dateA; // descending order
    });

    // Get member details for each line user
    const lineUserIds = [...new Set(history.map((h: any) => h.lineUserId))];

    // Fetch from users collection to get member info
    const usersSnapshot = await adminDb()
      .collection('users')
      .where('lineUserId', 'in', lineUserIds.slice(0, 10)) // Firestore limit
      .get();

    // Also fetch all members to get full details
    const membersSnapshot = await adminDb()
      .collection('members')
      .get();

    const membersDataMap: Record<string, any> = {};
    membersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      membersDataMap[doc.id] = {
        fullNameTH: data.fullNameTH,
        companyNameTH: data.companyNameTH,
      };
    });

    const memberMap: Record<string, any> = {};
    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const memberId = userData.memberId;
      const memberDetails = memberId ? membersDataMap[memberId] : null;

      memberMap[userData.lineUserId] = {
        memberId: userData.memberId || doc.id,
        fullNameTH: memberDetails?.fullNameTH || userData.fullNameTH || '',
        companyNameTH: memberDetails?.companyNameTH || userData.companyNameTH || '',
        lineDisplayName: userData.lineDisplayName || userData.displayName || userData.name || '',
      };
    });

    // Merge member data with history
    const historyWithMembers = history.map((h: any) => ({
      ...h,
      member: memberMap[h.lineUserId] || null,
    }));

    return NextResponse.json({ history: historyWithMembers });
  } catch (error) {
    console.error('Error fetching promotion history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch promotion history' },
      { status: 500 }
    );
  }
}
