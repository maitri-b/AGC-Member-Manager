/**
 * Admin Members Ban API
 *
 * POST - Ban or unban a member
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can ban/unban members
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { userId, isBanned, banReason } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (isBanned && !banReason) {
      return NextResponse.json({ error: 'Ban reason is required when banning a member' }, { status: 400 });
    }

    const db = adminDb();
    const userRef = db.collection('users').doc(userId);

    // Check if user exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update banned status
    const updateData: any = {
      isBanned,
      updatedAt: new Date().toISOString(),
    };

    if (isBanned) {
      // Banning the user
      updateData.bannedAt = new Date().toISOString();
      updateData.bannedBy = session.user.id || session.user.email || 'unknown';
      updateData.bannedReason = banReason;
    } else {
      // Unbanning the user - clear ban fields
      updateData.bannedAt = null;
      updateData.bannedBy = null;
      updateData.bannedReason = null;
    }

    await userRef.update(updateData);

    // Log the action
    await db.collection('auditLogs').add({
      action: isBanned ? 'member_banned' : 'member_unbanned',
      performedBy: session.user.id || session.user.email || 'unknown',
      performedByEmail: session.user.email,
      targetUserId: userId,
      targetUserEmail: userDoc.data()?.email,
      targetUserName: userDoc.data()?.displayName || userDoc.data()?.lineDisplayName,
      banReason: isBanned ? banReason : null,
      timestamp: new Date().toISOString(),
      metadata: {
        previousStatus: userDoc.data()?.isBanned || false,
        newStatus: isBanned,
      },
    });

    return NextResponse.json({
      success: true,
      message: isBanned ? 'Member banned successfully' : 'Member unbanned successfully',
    });

  } catch (error) {
    console.error('Error updating ban status:', error);
    return NextResponse.json({ error: 'Failed to update ban status' }, { status: 500 });
  }
}
