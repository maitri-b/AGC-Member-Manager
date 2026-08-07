// API Route: PUT /api/payments/[slipId]/approve - Approve payment slip
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { approvePaymentSlip, getPaymentSlipById } from '@/lib/payment-slips';

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
    const canApprove =
      hasPermission(session.user.permissions || [], 'admin:access') ||
      hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!canApprove) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { slipId } = await params;
    const body = await request.json();
    const { adminNotes } = body;

    // Verify slip exists
    const slip = await getPaymentSlipById(slipId);
    if (!slip) {
      return NextResponse.json({ error: 'Payment slip not found' }, { status: 404 });
    }

    // Get reviewer name from session
    const reviewerName = session.user.displayName || session.user.name || session.user.email || 'Admin';

    // Approve the slip
    await approvePaymentSlip(
      slipId,
      session.user.lineUserId || session.user.id || 'unknown',
      adminNotes,
      reviewerName
    );

    return NextResponse.json({
      success: true,
      message: 'Payment slip approved successfully',
    });
  } catch (error) {
    console.error('Error approving payment slip:', error);
    return NextResponse.json(
      { error: 'Failed to approve payment slip' },
      { status: 500 }
    );
  }
}
