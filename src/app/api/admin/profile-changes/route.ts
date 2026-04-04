// API Route for Admin to manage Profile Change Requests
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { getMemberById, updateMember } from '@/lib/google-sheets';

// Get all pending change requests (Admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';

    let query = adminDb().collection('profileChangeRequests').orderBy('createdAt', 'desc');

    if (status !== 'all') {
      query = query.where('status', '==', status);
    }

    const requestsSnapshot = await query.limit(50).get();

    const requests = requestsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt,
      processedAt: doc.data().processedAt?.toDate?.()?.toISOString() || doc.data().processedAt,
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching change requests:', error);
    return NextResponse.json({ error: 'Failed to fetch change requests' }, { status: 500 });
  }
}

// Approve or reject a change request
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { requestId, action, adminNote } = body;

    if (!requestId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Get the change request
    const requestDoc = await adminDb().collection('profileChangeRequests').doc(requestId).get();

    if (!requestDoc.exists) {
      return NextResponse.json({ error: 'Change request not found' }, { status: 404 });
    }

    const changeRequest = requestDoc.data();

    if (changeRequest?.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been processed' }, { status: 400 });
    }

    const processedAt = new Date();

    if (action === 'approve') {
      // Build updates for Google Sheet
      const updates: Record<string, string> = {};
      for (const [field, values] of Object.entries(changeRequest.changes as Record<string, { oldValue: string; newValue: string }>)) {
        updates[field] = values.newValue;
      }

      // Update Google Sheet
      const updateSuccess = await updateMember(changeRequest.memberId, updates);

      if (!updateSuccess) {
        return NextResponse.json({ error: 'Failed to update member data' }, { status: 500 });
      }

      // Log the change history
      await adminDb().collection('profileChangeHistory').add({
        memberId: changeRequest.memberId,
        userId: changeRequest.userId,
        lineDisplayName: changeRequest.lineDisplayName,
        changes: changeRequest.changes,
        reason: changeRequest.reason,
        requestId: requestId,
        approvedBy: session.user.id,
        approvedByName: session.user.name || 'Admin',
        adminNote: adminNote || '',
        processedAt: processedAt,
      });

      // Update the request status
      await adminDb().collection('profileChangeRequests').doc(requestId).update({
        status: 'approved',
        processedBy: session.user.id,
        processedByName: session.user.name || 'Admin',
        adminNote: adminNote || '',
        processedAt: processedAt,
        updatedAt: processedAt,
      });

      return NextResponse.json({
        success: true,
        message: 'Change request approved and member data updated'
      });
    } else {
      // Reject the request
      await adminDb().collection('profileChangeRequests').doc(requestId).update({
        status: 'rejected',
        processedBy: session.user.id,
        processedByName: session.user.name || 'Admin',
        adminNote: adminNote || '',
        processedAt: processedAt,
        updatedAt: processedAt,
      });

      return NextResponse.json({
        success: true,
        message: 'Change request rejected'
      });
    }
  } catch (error) {
    console.error('Error processing change request:', error);
    return NextResponse.json({ error: 'Failed to process change request' }, { status: 500 });
  }
}
