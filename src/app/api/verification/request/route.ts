// API Route for Member Verification - Submit Verification Request
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getAllMembers } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { memberId, licenseNumber, companyNameInput, phone } = await request.json();

    if (!memberId || !licenseNumber) {
      return NextResponse.json({ error: 'Member ID and License number are required' }, { status: 400 });
    }

    // Verify member exists in Google Sheet
    const members = await getAllMembers();
    const member = members.find(m => m.memberId === memberId);

    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Check if already linked
    if (member.lineUserId) {
      return NextResponse.json({
        error: 'This member is already linked to a LINE account',
        alreadyLinked: true
      }, { status: 400 });
    }

    const db = adminDb();

    // Check if user already has a pending request
    const existingRequests = await db.collection('verificationRequests')
      .where('userId', '==', session.user.id)
      .where('status', '==', 'pending')
      .get();

    if (!existingRequests.empty) {
      return NextResponse.json({
        error: 'คุณมีคำขอยืนยันตัวตนที่รอการอนุมัติอยู่แล้ว',
        hasPending: true
      }, { status: 400 });
    }

    // Create verification request
    const verificationRequest = {
      userId: session.user.id,
      lineUserId: session.user.lineUserId || session.user.id,
      lineDisplayName: session.user.name || '',
      lineImage: session.user.image || '',
      memberId: memberId,
      licenseNumber: licenseNumber,
      companyNameInput: companyNameInput || '', // User input for admin comparison
      phone: phone || '',
      memberInfo: {
        companyNameTH: member.companyNameTH,
        companyNameEN: member.companyNameEN,
        fullNameTH: member.fullNameTH,
        nickname: member.nickname,
        positionClub: member.positionClub,
      },
      status: 'pending', // pending, approved, rejected
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection('verificationRequests').add(verificationRequest);

    // Update user's verification status
    await db.collection('users').doc(session.user.id).update({
      verificationStatus: 'pending',
      verificationRequestId: docRef.id,
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      requestId: docRef.id,
      message: 'คำขอยืนยันตัวตนถูกส่งแล้ว รอการอนุมัติจาก Admin'
    });

  } catch (error) {
    console.error('Error creating verification request:', error);
    return NextResponse.json({ error: 'Failed to create verification request' }, { status: 500 });
  }
}

// GET: Check current verification status
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = adminDb();

    // Get user's verification requests (without orderBy to avoid index requirement)
    const requests = await db.collection('verificationRequests')
      .where('userId', '==', session.user.id)
      .get();

    if (requests.empty) {
      return NextResponse.json({
        hasRequest: false,
        status: null
      });
    }

    // Sort by createdAt in memory to get the latest request
    const sortedDocs = requests.docs.sort((a, b) => {
      const aDate = a.data().createdAt?.toDate?.() || new Date(0);
      const bDate = b.data().createdAt?.toDate?.() || new Date(0);
      return bDate.getTime() - aDate.getTime();
    });

    const latestRequest = sortedDocs[0];
    const data = latestRequest.data();

    return NextResponse.json({
      hasRequest: true,
      requestId: latestRequest.id,
      status: data.status,
      memberId: data.memberId,
      memberInfo: data.memberInfo,
      createdAt: data.createdAt?.toDate?.() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      rejectionReason: data.rejectionReason || null,
    });

  } catch (error) {
    console.error('Error getting verification status:', error);
    return NextResponse.json({ error: 'Failed to get verification status' }, { status: 500 });
  }
}
