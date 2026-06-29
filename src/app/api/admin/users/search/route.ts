// API Route for searching members and guests for admin-assisted registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';
import { getAllMembers } from '@/lib/google-sheets';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'events:register-on-behalf')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q')?.toLowerCase() || '';

    if (!query || query.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Search in Firestore users collection (includes both members and guests)
    const db = adminDb();
    const usersSnapshot = await db.collection('users').get();

    // Get all members from Google Sheets for member data
    const members = await getAllMembers();
    const memberMap = new Map(members.map(m => [m.memberId, m]));

    const results: Array<{
      userId: string;
      lineUserId: string;
      memberId?: string;
      displayName: string;
      companyName?: string;
      licenseNumber?: string;
      phone?: string;
      role: string;
      isMember: boolean;
    }> = [];

    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const memberId = userData.memberId;
      const member = memberId ? memberMap.get(memberId) : null;

      // Build searchable text
      const searchableText = [
        userData.lineDisplayName || '',
        member?.fullNameTH || '',
        member?.nickname || '',
        member?.companyNameTH || '',
        member?.companyNameEN || '',
        member?.licenseNumber || '',
        memberId || '',
      ].join(' ').toLowerCase();

      // Check if matches query
      if (searchableText.includes(query)) {
        results.push({
          userId: doc.id,
          lineUserId: userData.lineUserId || doc.id,
          memberId: memberId || undefined,
          displayName: userData.lineDisplayName || member?.fullNameTH || member?.nickname || 'ไม่ระบุชื่อ',
          companyName: member?.companyNameTH || member?.companyNameEN || undefined,
          licenseNumber: member?.licenseNumber || undefined,
          phone: member?.mobile || member?.phone || undefined,
          role: userData.role || 'guest',
          isMember: !!memberId,
        });
      }
    });

    // Sort: members first, then by display name
    results.sort((a, b) => {
      if (a.isMember && !b.isMember) return -1;
      if (!a.isMember && b.isMember) return 1;
      return a.displayName.localeCompare(b.displayName, 'th');
    });

    // Limit to 20 results
    const limitedResults = results.slice(0, 20);

    return NextResponse.json({ users: limitedResults });
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
  }
}
