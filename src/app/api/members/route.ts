// API Route for Member Data from Google Sheets - Agents Club
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAllMembers, searchMembers, getMembersByStatus, getMemberStats } from '@/lib/google-sheets';
import { hasPermission } from '@/lib/permissions';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - only admin and committee can view all members list
    if (!hasPermission(session.user.permissions || [], 'members:list')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const includeStats = searchParams.get('stats') === 'true';

    let members;

    if (search) {
      members = await searchMembers(search);
    } else if (status) {
      members = await getMembersByStatus(status as 'Active' | 'Inactive' | 'Pending');
    } else {
      members = await getAllMembers();
    }

    // Get LINE profiles from Firestore users collection
    const db = adminDb();
    const usersSnapshot = await db.collection('users').get();

    // Build a map of memberId -> LINE profile
    const lineProfilesMap = new Map<string, { lineDisplayName: string; lineProfilePicture: string }>();
    usersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.memberId) {
        lineProfilesMap.set(data.memberId, {
          lineDisplayName: data.lineDisplayName || data.name || '',
          lineProfilePicture: data.lineProfilePicture || data.image || '',
        });
      }
    });

    // Enrich members with LINE profile data
    const membersWithProfile = members.map(member => {
      const lineProfile = member.memberId ? lineProfilesMap.get(member.memberId) : null;
      return {
        ...member,
        lineProfile: lineProfile || null,
      };
    });

    // Optionally include stats
    let stats = null;
    if (includeStats) {
      stats = await getMemberStats();
    }

    return NextResponse.json({
      members: membersWithProfile,
      total: membersWithProfile.length,
      ...(stats && { stats })
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}
