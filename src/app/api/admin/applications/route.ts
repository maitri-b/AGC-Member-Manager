// API Route for Managing Membership Applications
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

// GET - List all membership applications
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending, approved, rejected, all

    const db = adminDb();
    let query = db.collection('membershipApplications').orderBy('createdAt', 'desc');

    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.limit(100).get();

    const applications = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
      };
    });

    return NextResponse.json({ applications });
  } catch (error) {
    console.error('Error fetching applications:', error);
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
  }
}

// PUT - Update application status (approve/reject)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { applicationId, status, documentStatus, rejectionReason, notes } = body;

    if (!applicationId) {
      return NextResponse.json({ error: 'Application ID is required' }, { status: 400 });
    }

    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('membershipApplications').doc(applicationId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: session.user.id,
      updatedByName: session.user.name || '',
    };

    if (status) {
      updateData.status = status;
      if (status === 'approved') {
        updateData.approvedAt = new Date();
        updateData.approvedBy = session.user.id;
        updateData.approvedByName = session.user.name || '';
      } else if (status === 'rejected') {
        updateData.rejectedAt = new Date();
        updateData.rejectedBy = session.user.id;
        updateData.rejectedByName = session.user.name || '';
        if (rejectionReason) {
          updateData.rejectionReason = rejectionReason;
        }
      }
    }

    if (documentStatus) {
      updateData.documentStatus = documentStatus;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await docRef.update(updateData);

    console.log(`Application ${applicationId} updated by ${session.user.name}: status=${status}, documentStatus=${documentStatus}`);

    return NextResponse.json({
      success: true,
      message: 'Application updated successfully',
    });
  } catch (error) {
    console.error('Error updating application:', error);
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 });
  }
}

// DELETE - Delete an application
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(session.user.permissions || [], 'admin:users')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('id');

    if (!applicationId) {
      return NextResponse.json({ error: 'Application ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('membershipApplications').doc(applicationId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    await docRef.delete();

    console.log(`Application ${applicationId} deleted by ${session.user.name}`);

    return NextResponse.json({
      success: true,
      message: 'Application deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting application:', error);
    return NextResponse.json({ error: 'Failed to delete application' }, { status: 500 });
  }
}
