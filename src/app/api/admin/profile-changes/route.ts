// API Route for Admin to manage Profile Change Requests
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { updateMember } from '@/lib/google-sheets';

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

    const db = adminDb();

    // Fetch all requests and filter in JavaScript to avoid Firestore composite index requirement
    const requestsSnapshot = await db
      .collection('profileChangeRequests')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    let requests = requestsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        processedAt: data.processedAt?.toDate?.()?.toISOString() || data.processedAt,
        // Use snapshot data instead of fetching from Google Sheets
        currentCompanyName: data.currentCompanyName || '',
        currentLicenseNumber: data.currentLicenseNumber || '',
        currentLicenseDocumentUrl: data.currentLicenseDocumentUrl || '',
      };
    });

    // Filter by status in JavaScript
    if (status !== 'all') {
      requests = requests.filter(r => (r as { status?: string }).status === status);
    }

    // Count pending for badge display
    const pendingCount = requestsSnapshot.docs.filter(doc => doc.data().status === 'pending').length;

    return NextResponse.json({ requests, pendingCount });
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

      // ✅ If new license document uploaded, add to updates
      if (changeRequest.newLicenseDocumentUrl) {
        updates['licenseDocumentUrl'] = changeRequest.newLicenseDocumentUrl;
      }

      // Update Google Sheet with timeout and better error handling
      let updateSuccess = false;
      try {
        console.log(`[Profile Change] Updating member ${changeRequest.memberId} in Google Sheets...`);

        // Add timeout wrapper (30 seconds max for mobile)
        updateSuccess = await Promise.race([
          updateMember(changeRequest.memberId, updates),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Update timeout after 30 seconds')), 30000)
          )
        ]);

        console.log(`[Profile Change] Update result: ${updateSuccess}`);
      } catch (error) {
        console.error('[Profile Change] Error updating Google Sheets:', error);
        return NextResponse.json({
          error: 'ไม่สามารถอัพเดทข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
          details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
      }

      if (!updateSuccess) {
        console.error('[Profile Change] Update failed - updateMember returned false');
        return NextResponse.json({ error: 'ไม่สามารถอัพเดทข้อมูลได้ กรุณาลองใหม่อีกครั้ง' }, { status: 500 });
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
