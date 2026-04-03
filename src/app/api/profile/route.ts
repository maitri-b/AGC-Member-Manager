// API Route for User Profile - Agents Club
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getMemberByLineUserId, updateMember } from '@/lib/google-sheets';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user data from Firestore
    const db = adminDb();
    const userDoc = await db.collection('users').doc(session.user.id).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    // Get member data from Google Sheet if linked
    let memberData = null;
    if (session.user.lineUserId) {
      memberData = await getMemberByLineUserId(session.user.lineUserId);
    }

    return NextResponse.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        image: session.user.image,
        role: session.user.role,
        memberId: userData?.memberId || null,
        permissions: session.user.permissions,
        ...userData,
      },
      member: memberData,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const updates = await request.json();

    // Update member data in Google Sheet if linked
    if (session.user.memberId) {
      // Allowed fields for Agents Club members to update
      const allowedFields = [
        'phone', 'mobile', 'email', 'lineId', 'website'
      ];

      const memberUpdates: Record<string, string> = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          memberUpdates[field] = updates[field];
        }
      }

      if (Object.keys(memberUpdates).length > 0) {
        memberUpdates.updatedBy = session.user.name || session.user.id;
        await updateMember(session.user.memberId, memberUpdates);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
