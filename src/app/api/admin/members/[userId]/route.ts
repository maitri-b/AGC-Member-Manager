/**
 * Get single member by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can view member details
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { userId } = params;

    const db = adminDb();
    const memberDoc = await db.collection('members').doc(userId).get();

    if (!memberDoc.exists) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const data = memberDoc.data();

    const member = {
      lineUserId: memberDoc.id,
      displayName: data?.displayName || data?.lineDisplayName || 'Unknown',
      email: data?.email || '',
      licenseNumber: data?.licenseNumber || '',
      licenseStatus: data?.licenseStatus || '',
      lineGroupStatus: data?.lineGroupStatus || '',
      membershipStatus: data?.membershipStatus || '',
      role: data?.role || 'member',
      permissions: data?.permissions || [],
      testAccount: data?.testAccount || false,
      pictureUrl: data?.pictureUrl || data?.lineProfilePicture || '',
      memberId: data?.memberId || null,
      assignedEventIds: data?.assignedEventIds || [],
    };

    return NextResponse.json({
      success: true,
      member,
    });

  } catch (error) {
    console.error('Error fetching member:', error);
    return NextResponse.json({ error: 'Failed to fetch member' }, { status: 500 });
  }
}
