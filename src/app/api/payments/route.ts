// API Route: GET /api/payments - Get payment slips
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import {
  getPaymentSlipsByRegistration,
  getPaymentSlipsByEvent,
  getPendingPaymentSlips,
  getPaymentSlipsByStatus,
  getPaymentSlipsByType,
} from '@/lib/payment-slips';
import { PaymentStatus, PaymentType } from '@/types/payment';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');
    const eventId = searchParams.get('eventId');
    const status = searchParams.get('status') as PaymentStatus | null;
    const paymentType = searchParams.get('paymentType') as PaymentType | null;
    const pendingOnly = searchParams.get('pending') === 'true';

    // Permission check
    const canViewPayments =
      hasPermission(session.user.permissions || [], 'members:list') ||
      hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!canViewPayments) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get payment slips based on query parameters
    let slips;

    if (pendingOnly) {
      slips = await getPendingPaymentSlips(eventId || undefined);
    } else if (registrationId) {
      slips = await getPaymentSlipsByRegistration(registrationId);
    } else if (status) {
      slips = await getPaymentSlipsByStatus(status, eventId || undefined);
    } else if (paymentType) {
      slips = await getPaymentSlipsByType(paymentType, eventId || undefined);
    } else if (eventId) {
      slips = await getPaymentSlipsByEvent(eventId);
    } else {
      return NextResponse.json(
        { error: 'Please provide registrationId, eventId, status, paymentType, or pending=true' },
        { status: 400 }
      );
    }

    return NextResponse.json({ slips });
  } catch (error) {
    console.error('Error fetching payment slips:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment slips' },
      { status: 500 }
    );
  }
}
