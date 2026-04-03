// API Route for Member Data from Google Sheets - Agents Club
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAllMembers, searchMembers, getMembersByStatus, getMemberStats } from '@/lib/google-sheets';
import { hasPermission } from '@/lib/permissions';

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

    // Optionally include stats
    let stats = null;
    if (includeStats) {
      stats = await getMemberStats();
    }

    return NextResponse.json({
      members,
      total: members.length,
      ...(stats && { stats })
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}
