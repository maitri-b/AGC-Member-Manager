// API Route: GET /api/payments/summary - Get payment summary for registration or event
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import {
  getPaymentSummaryForRegistration,
  getEventPaymentStatistics,
} from '@/lib/payment-slips';
import { getEventRegistrationByRegistrationId } from '@/lib/event-sheets';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');
    const eventId = searchParams.get('eventId');

    // Permission check
    const canViewPayments =
      hasPermission(session.user.permissions || [], 'members:list') ||
      hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!canViewPayments) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get summary based on query parameters
    if (registrationId) {
      // Get registration to find totalAmount
      const registration = await getEventRegistrationByRegistrationId(registrationId);
      if (!registration) {
        return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
      }

      const summary = await getPaymentSummaryForRegistration(
        registrationId,
        registration.totalAmount || 0
      );

      return NextResponse.json({ summary });
    } else if (eventId) {
      const statistics = await getEventPaymentStatistics(eventId);
      return NextResponse.json({ statistics });
    } else {
      return NextResponse.json(
        { error: 'Please provide either registrationId or eventId' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error fetching payment summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment summary' },
      { status: 500 }
    );
  }
}
