// API Route for Profile Change Requests
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getMemberById } from '@/lib/google-sheets';

// Get user's change requests
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestsSnapshot = await adminDb()
      .collection('profileChangeRequests')
      .where('userId', '==', session.user.id)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const requests = requestsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt,
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching change requests:', error);
    return NextResponse.json({ error: 'Failed to fetch change requests' }, { status: 500 });
  }
}

// Create a new change request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.user.memberId) {
      return NextResponse.json({ error: 'No member ID linked to this account' }, { status: 400 });
    }

    const body = await request.json();
    const { changes, reason } = body;

    if (!changes || Object.keys(changes).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    // Get current member data for comparison
    const currentMember = await getMemberById(session.user.memberId);
    if (!currentMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Check for pending requests
    const pendingRequests = await adminDb()
      .collection('profileChangeRequests')
      .where('userId', '==', session.user.id)
      .where('status', '==', 'pending')
      .get();

    if (!pendingRequests.empty) {
      return NextResponse.json({
        error: 'You already have a pending change request. Please wait for it to be processed.'
      }, { status: 400 });
    }

    // Build change details with old and new values
    const changeDetails: Record<string, { oldValue: string; newValue: string }> = {};
    const allowedFields = ['fullNameTH', 'nickname', 'companyNameTH', 'companyNameEN', 'positionCompany', 'licenseNumber'];

    for (const field of Object.keys(changes)) {
      if (allowedFields.includes(field) && changes[field] !== currentMember[field as keyof typeof currentMember]) {
        changeDetails[field] = {
          oldValue: String(currentMember[field as keyof typeof currentMember] || ''),
          newValue: String(changes[field] || ''),
        };
      }
    }

    if (Object.keys(changeDetails).length === 0) {
      return NextResponse.json({ error: 'No valid changes detected' }, { status: 400 });
    }

    // Create the change request
    const changeRequest = {
      userId: session.user.id,
      memberId: session.user.memberId,
      lineDisplayName: session.user.name || '',
      lineImage: session.user.image || '',
      changes: changeDetails,
      reason: reason || '',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await adminDb().collection('profileChangeRequests').add(changeRequest);

    return NextResponse.json({
      success: true,
      requestId: docRef.id,
      message: 'Change request submitted successfully'
    });
  } catch (error) {
    console.error('Error creating change request:', error);
    return NextResponse.json({ error: 'Failed to create change request' }, { status: 500 });
  }
}
