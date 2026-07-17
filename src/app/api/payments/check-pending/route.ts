// API Route to check if a registration has pending payment slips
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPendingPaymentSlips } from '@/lib/payment-slips';

/**
 * GET /api/payments/check-pending?registrationId=xxx
 * Check if a registration has pending payment slips
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get registrationId from query params
    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');

    if (!registrationId) {
      return NextResponse.json(
        { error: 'registrationId is required' },
        { status: 400 }
      );
    }

    // Check for pending slips
    const hasPending = await hasPendingPaymentSlips(registrationId);

    return NextResponse.json({
      hasPending,
      registrationId,
    });
  } catch (error) {
    console.error('Error checking pending payment slips:', error);
    return NextResponse.json(
      { error: 'Failed to check pending slips' },
      { status: 500 }
    );
  }
}
