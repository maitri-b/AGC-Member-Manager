/**
 * Admin Members API
 *
 * GET - List all members for admin use (including test accounts)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can view all members
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();

    // Fetch all members
    const membersSnapshot = await db.collection('members').get();

    const members = membersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        lineUserId: doc.id,
        displayName: data.displayName || data.lineDisplayName || 'Unknown',
        email: data.email || '',
        licenseNumber: data.licenseNumber || '',
        licenseStatus: data.licenseStatus || '',
        lineGroupStatus: data.lineGroupStatus || '',
        membershipStatus: data.membershipStatus || '',
        role: data.role || 'member',
        testAccount: data.testAccount || false,
        pictureUrl: data.pictureUrl || data.lineProfilePicture || '',
      };
    });

    return NextResponse.json({
      success: true,
      members,
      total: members.length
    });

  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}
