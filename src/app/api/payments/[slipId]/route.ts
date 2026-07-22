// API Route: GET/PUT/DELETE /api/payments/[slipId] - Get, update, or delete payment slip
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { getPaymentSlipById, updatePaymentSlip, hardDeletePaymentSlip } from '@/lib/payment-slips';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slipId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slipId } = await params;

    const slip = await getPaymentSlipById(slipId);

    if (!slip) {
      return NextResponse.json({ error: 'Payment slip not found' }, { status: 404 });
    }

    return NextResponse.json({ slip });
  } catch (error) {
    console.error('Error fetching payment slip:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment slip' },
      { status: 500 }
    );
  }
}

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
    const canUpdate =
      hasPermission(session.user.permissions || [], 'admin:access') ||
      hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!canUpdate) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { slipId } = await params;
    const body = await request.json();

    // Verify slip exists
    const slip = await getPaymentSlipById(slipId);
    if (!slip) {
      return NextResponse.json({ error: 'Payment slip not found' }, { status: 404 });
    }

    // Update the slip
    await updatePaymentSlip(slipId, body);

    return NextResponse.json({
      success: true,
      message: 'Payment slip updated successfully',
    });
  } catch (error) {
    console.error('Error updating payment slip:', error);
    return NextResponse.json(
      { error: 'Failed to update payment slip' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slipId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission - must be admin only
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied - Admin only' }, { status: 403 });
    }

    const { slipId } = await params;
    const { reason } = await request.json();

    if (!reason) {
      return NextResponse.json(
        { error: 'Reason for deletion is required' },
        { status: 400 }
      );
    }

    // Verify slip exists
    const slip = await getPaymentSlipById(slipId);
    if (!slip) {
      return NextResponse.json({ error: 'Payment slip not found' }, { status: 404 });
    }

    // Delete the slip permanently and update registration status
    await hardDeletePaymentSlip(
      slipId,
      session.user.id,
      reason
    );

    return NextResponse.json({
      success: true,
      message: 'Payment slip deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting payment slip:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment slip' },
      { status: 500 }
    );
  }
}
