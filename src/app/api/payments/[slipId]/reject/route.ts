// API Route: PUT /api/payments/[slipId]/reject - Reject payment slip
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { rejectPaymentSlip, getPaymentSlipById } from '@/lib/payment-slips';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slipId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - must be admin, committee, or event staff
    const canReject =
      hasPermission(session.user.permissions || [], 'admin:access') ||
      hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!canReject) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { slipId } = await params;
    const body = await request.json();
    const { rejectionReason, adminNotes } = body;

    if (!rejectionReason) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      );
    }

    // Verify slip exists
    const slip = await getPaymentSlipById(slipId);
    if (!slip) {
      return NextResponse.json({ error: 'Payment slip not found' }, { status: 404 });
    }

    // Reject the slip
    await rejectPaymentSlip(
      slipId,
      session.user.lineUserId || session.user.id || 'unknown',
      rejectionReason,
      adminNotes
    );

    return NextResponse.json({
      success: true,
      message: 'Payment slip rejected successfully',
    });
  } catch (error) {
    console.error('Error rejecting payment slip:', error);
    return NextResponse.json(
      { error: 'Failed to reject payment slip' },
      { status: 500 }
    );
  }
}
