/**
 * Admin Impersonation API
 *
 * Allows admins to view the system as another user for debugging purposes.
 * Creates an audit trail of all impersonation sessions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { cookies } from 'next/headers';

// POST - Start impersonation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can impersonate
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { targetUserId } = await request.json();

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user ID is required' }, { status: 400 });
    }

    // Prevent impersonating yourself
    if (targetUserId === session.user.id) {
      return NextResponse.json({ error: 'Cannot impersonate yourself' }, { status: 400 });
    }

    const db = adminDb();

    // Verify target user exists
    const targetUserDoc = await db.collection('members').doc(targetUserId).get();
    if (!targetUserDoc.exists) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const targetUser = targetUserDoc.data();

    // Create audit log
    await db.collection('impersonationLogs').add({
      adminUserId: session.user.id,
      adminEmail: session.user.email || '',
      adminName: session.user.name || '',
      targetUserId,
      targetName: targetUser?.displayName || 'Unknown',
      targetEmail: targetUser?.email || '',
      startedAt: new Date().toISOString(),
      endedAt: null,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    });

    // Set impersonation cookie (httpOnly for security)
    const cookieStore = await cookies();
    cookieStore.set('impersonating', targetUserId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4, // 4 hours
      path: '/',
    });

    // Also set original admin ID to know who's impersonating
    cookieStore.set('originalAdminId', session.user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 4,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      message: `Now impersonating ${targetUser?.displayName || targetUserId}`,
      targetUser: {
        id: targetUserId,
        name: targetUser?.displayName,
        email: targetUser?.email,
      }
    });

  } catch (error) {
    console.error('Error starting impersonation:', error);
    return NextResponse.json({ error: 'Failed to start impersonation' }, { status: 500 });
  }
}

// DELETE - Stop impersonation
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const impersonatingUserId = cookieStore.get('impersonating')?.value;
    const originalAdminId = cookieStore.get('originalAdminId')?.value;

    if (!impersonatingUserId) {
      return NextResponse.json({ error: 'Not currently impersonating' }, { status: 400 });
    }

    const db = adminDb();

    // Update audit log (find most recent open session)
    // ⚠️ Avoid .where() + .orderBy() - fetch and sort in JavaScript instead
    if (originalAdminId) {
      const logsSnapshot = await db.collection('impersonationLogs')
        .where('adminUserId', '==', originalAdminId)
        .where('targetUserId', '==', impersonatingUserId)
        .where('endedAt', '==', null)
        .get();

      if (!logsSnapshot.empty) {
        // Sort by startedAt desc in JavaScript
        const sortedDocs = logsSnapshot.docs.sort((a, b) => {
          const aTime = new Date(a.data().startedAt || 0).getTime();
          const bTime = new Date(b.data().startedAt || 0).getTime();
          return bTime - aTime; // descending
        });

        // Update the most recent one
        await sortedDocs[0].ref.update({
          endedAt: new Date().toISOString(),
        });
      }
    }

    // Clear impersonation cookies
    cookieStore.delete('impersonating');
    cookieStore.delete('originalAdminId');

    return NextResponse.json({
      success: true,
      message: 'Impersonation ended'
    });

  } catch (error) {
    console.error('Error ending impersonation:', error);
    return NextResponse.json({ error: 'Failed to end impersonation' }, { status: 500 });
  }
}

// GET - Get current impersonation status
export async function GET() {
  try {
    const cookieStore = await cookies();
    const impersonatingUserId = cookieStore.get('impersonating')?.value;
    const originalAdminId = cookieStore.get('originalAdminId')?.value;

    if (!impersonatingUserId) {
      return NextResponse.json({ impersonating: false });
    }

    const db = adminDb();
    const targetUserDoc = await db.collection('members').doc(impersonatingUserId).get();
    const adminUserDoc = originalAdminId ? await db.collection('members').doc(originalAdminId).get() : null;

    return NextResponse.json({
      impersonating: true,
      targetUser: {
        id: impersonatingUserId,
        name: targetUserDoc.data()?.displayName || 'Unknown',
        email: targetUserDoc.data()?.email || '',
      },
      originalAdmin: adminUserDoc ? {
        id: originalAdminId,
        name: adminUserDoc.data()?.displayName || 'Unknown',
      } : null,
    });

  } catch (error) {
    console.error('Error getting impersonation status:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
