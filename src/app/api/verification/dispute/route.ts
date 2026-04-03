// API Route for Dispute Request - When member data is already linked to another LINE account
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getAllMembers } from '@/lib/google-sheets';

// POST: Submit a dispute request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId, licenseNumber, phone, email, reason } = await request.json();

    if (!memberId || !licenseNumber) {
      return NextResponse.json({ error: 'Member ID and License number are required' }, { status: 400 });
    }

    if (!phone && !email) {
      return NextResponse.json({ error: 'Phone or email is required for verification' }, { status: 400 });
    }

    // Verify member exists and is already linked
    const members = await getAllMembers();
    const member = members.find(m => m.memberId === memberId);

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (!member.lineUserId) {
      return NextResponse.json({
        error: 'This member is not linked to any LINE account. Please use normal verification.',
      }, { status: 400 });
    }

    const db = adminDb();

    // Check if user already has a pending dispute
    const existingDisputes = await db.collection('disputeRequests')
      .where('userId', '==', session.user.id)
      .where('status', '==', 'pending')
      .get();

    if (!existingDisputes.empty) {
      return NextResponse.json({
        error: 'คุณมีคำร้องที่รอการพิจารณาอยู่แล้ว กรุณารอการตอบกลับจากทีมนายทะเบียน',
        hasPending: true
      }, { status: 400 });
    }

    // Get info of current linked user
    const currentLinkedUserQuery = await db.collection('users')
      .where('lineUserId', '==', member.lineUserId)
      .limit(1)
      .get();

    let currentLinkedUserInfo = null;
    if (!currentLinkedUserQuery.empty) {
      const currentUser = currentLinkedUserQuery.docs[0].data();
      currentLinkedUserInfo = {
        displayName: currentUser.displayName || currentUser.name || 'Unknown',
        lineUserId: member.lineUserId,
      };
    }

    // Create dispute request
    const disputeRequest = {
      // Requester info (B)
      userId: session.user.id,
      lineUserId: session.user.lineUserId || session.user.id,
      lineDisplayName: session.user.name || '',
      lineImage: session.user.image || '',

      // Member info being claimed
      memberId: memberId,
      licenseNumber: licenseNumber,
      memberInfo: {
        companyNameTH: member.companyNameTH,
        companyNameEN: member.companyNameEN,
        fullNameTH: member.fullNameTH,
        nickname: member.nickname,
        positionClub: member.positionClub,
      },

      // Contact info for verification
      contactPhone: phone || '',
      contactEmail: email || '',
      reason: reason || '',

      // Current linked user info (A)
      currentLinkedLineUserId: member.lineUserId,
      currentLinkedUserInfo: currentLinkedUserInfo,

      status: 'pending', // pending, approved, rejected
      type: 'dispute', // To differentiate from normal verification requests

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('disputeRequests').add(disputeRequest);

    // Update user's dispute status
    await db.collection('users').doc(session.user.id).update({
      hasDisputePending: true,
      disputeRequestId: docRef.id,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      requestId: docRef.id,
      message: 'คำร้องของคุณถูกส่งไปยังทีมนายทะเบียนแล้ว เราจะติดต่อกลับโดยเร็วที่สุด'
    });

  } catch (error) {
    console.error('Error creating dispute request:', error);
    return NextResponse.json({ error: 'Failed to create dispute request' }, { status: 500 });
  }
}

// GET: Check dispute status
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = adminDb();

    const disputes = await db.collection('disputeRequests')
      .where('userId', '==', session.user.id)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (disputes.empty) {
      return NextResponse.json({ hasDispute: false });
    }

    const dispute = disputes.docs[0];
    const data = dispute.data();

    return NextResponse.json({
      hasDispute: true,
      disputeId: dispute.id,
      status: data.status,
      memberId: data.memberId,
      memberInfo: data.memberInfo,
      createdAt: data.createdAt?.toDate?.() || data.createdAt,
      resolvedAt: data.resolvedAt?.toDate?.() || data.resolvedAt,
      resolution: data.resolution || null,
    });

  } catch (error) {
    console.error('Error getting dispute status:', error);
    return NextResponse.json({ error: 'Failed to get dispute status' }, { status: 500 });
  }
}
