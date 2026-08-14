// API Route for Member Status Check
import { NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { getMemberById } from '@/lib/google-sheets';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ isRestricted: false });
    }

    // Only check for members and event-co (roles that can be restricted)
    if (session.user.role !== 'member' && session.user.role !== 'event-co') {
      return NextResponse.json({ isRestricted: false });
    }

    // If no memberId, no restriction needed
    if (!session.user.memberId) {
      return NextResponse.json({ isRestricted: false });
    }

    // Get user data from Firestore
    const db = adminDb();
    const userDoc = await db.collection('users').doc(session.user.id).get();
    const isActive = userDoc.data()?.isActive || false;

    // Get member data from Google Sheets
    let status: string | undefined;
    let lineGroupStatus: string | undefined;

    try {
      const memberData = await getMemberById(session.user.memberId);
      if (memberData) {
        status = memberData.status;
        lineGroupStatus = memberData.lineGroupStatus;
      }
    } catch (error) {
      console.error('Error fetching member data:', error);
      // If can't fetch, assume not restricted (fail open)
      return NextResponse.json({ isRestricted: false });
    }

    // Check if restricted (any criterion fails)
    const isRestricted = !(
      isActive === true &&
      status === 'ปกติ' &&
      lineGroupStatus === 'ปกติ'
    );

    return NextResponse.json({
      isRestricted,
      status,
      lineGroupStatus,
      isActive,
    });
  } catch (error) {
    console.error('Error checking member status:', error);
    return NextResponse.json(
      { error: 'Failed to check member status' },
      { status: 500 }
    );
  }
}
