// API Route for Admin - Get Staff List (Admin/Committee)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

interface StaffMember {
  id: string;
  lineDisplayName: string;
  lineProfilePicture?: string;
  role: string;
  memberId?: string;
}

// GET - Fetch admin and committee users for dropdown
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'members:list')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();

    // Get all users with role 'admin' or 'committee'
    const snapshot = await db.collection('users')
      .where('role', 'in', ['admin', 'committee'])
      .where('isActive', '==', true)
      .get();

    const staff: StaffMember[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      staff.push({
        id: doc.id,
        lineDisplayName: data.lineDisplayName || data.displayName || data.name || 'Unknown',
        lineProfilePicture: data.lineProfilePicture || data.pictureUrl || data.image,
        role: data.role,
        memberId: data.memberId,
      });
    });

    // Sort: admin first, then committee, then by name
    staff.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return a.lineDisplayName.localeCompare(b.lineDisplayName);
    });

    return NextResponse.json({ staff });
  } catch (error) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
  }
}
