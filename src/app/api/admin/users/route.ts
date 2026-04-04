// API Route for Admin - Users Management
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { ROLE_PERMISSIONS } from '@/types/next-auth.d';
import { updateMember } from '@/lib/google-sheets';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();
    const usersSnapshot = await db.collection('users').get();

    // Get all verification requests to join with users
    const verificationSnapshot = await db.collection('verificationRequests').get();
    const verificationMap = new Map<string, { licenseNumber: string; phone: string; status: string }>();

    verificationSnapshot.docs.forEach(doc => {
      const data = doc.data();
      // Store the latest verification request for each user
      const existing = verificationMap.get(data.userId);
      if (!existing || (data.status === 'pending')) {
        verificationMap.set(data.userId, {
          licenseNumber: data.licenseNumber || '',
          phone: data.phone || '',
          status: data.status || '',
        });
      }
    });

    const users = usersSnapshot.docs.map(doc => {
      const userData = doc.data();
      const verificationData = verificationMap.get(doc.id);

      return {
        id: doc.id,
        ...userData,
        // Add verification data if available
        licenseNumber: verificationData?.licenseNumber || userData.licenseNumber || '',
        phone: verificationData?.phone || userData.phone || '',
        verificationStatus: verificationData?.status || userData.verificationStatus || '',
      };
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { userId, role, memberId, isActive } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: session.user.id,
    };

    if (role !== undefined) {
      updates.role = role;
      updates.permissions = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] || [];
    }

    if (memberId !== undefined) {
      updates.memberId = memberId;
    }

    if (isActive !== undefined) {
      updates.isActive = isActive;
    }

    await userRef.update(updates);

    // If memberId is set, update LINE_UserID and lineDisplayName in Google Sheet
    if (memberId) {
      try {
        const userData = userDoc.data();
        const lineUserId = userData?.lineUserId || userId; // LINE User ID from Firestore
        const lineDisplayName = userData?.name || userData?.displayName || ''; // LINE Display Name

        await updateMember(memberId, {
          lineUserId: lineUserId,
          lineDisplayName: lineDisplayName,
          lastUpdated: new Date().toISOString(),
          updatedBy: session.user.name || session.user.id,
        });

        console.log(`Updated Google Sheet: Member ${memberId} linked to LINE User ${lineUserId}, Display Name: ${lineDisplayName}`);
      } catch (sheetError) {
        console.error('Error updating Google Sheet:', sheetError);
        // Don't fail the whole request if Google Sheet update fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
