// API Route: POST /api/payments/upload - Upload new payment slip
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { createPaymentSlip } from '@/lib/payment-slips';
import { getEventRegistrationByRegistrationId } from '@/lib/event-sheets';
import { PaymentType, PaymentSlip } from '@/types/payment';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      registrationId,
      eventId,
      amount,
      paymentType,
      description,
      slipUrl,
      uploadedAt, // Accept uploadedAt from GAS
      paymentMethod,
      bankName,
      transferDate,
    } = body;

    // Validation
    if (!registrationId || !eventId || !amount || !paymentType || !slipUrl) {
      return NextResponse.json(
        {
          error: 'Missing required fields: registrationId, eventId, amount, paymentType, slipUrl',
        },
        { status: 400 }
      );
    }

    // Validate payment type
    const validPaymentTypes: PaymentType[] = ['full', 'deposit', 'remaining', 'additional'];
    if (!validPaymentTypes.includes(paymentType)) {
      return NextResponse.json(
        { error: 'Invalid payment type. Must be: full, deposit, remaining, or additional' },
        { status: 400 }
      );
    }

    // Verify registration exists
    const registration = await getEventRegistrationByRegistrationId(registrationId);
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    // Verify eventId matches registration (only if registration has eventId)
    if (registration.eventId && registration.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Event ID does not match registration' },
        { status: 400 }
      );
    }

    // Create payment slip
    const slip = await createPaymentSlip({
      registrationId,
      eventId,
      amount: Number(amount),
      paymentType,
      description: description || undefined,
      slipUrl,
      uploadedAt: uploadedAt || new Date().toISOString(), // Use GAS uploadedAt if provided
      uploadedBy: session.user.lineUserId || session.user.id || 'unknown',
      status: 'pending', // All new uploads start as pending
      paymentMethod: paymentMethod || undefined,
      bankName: bankName || undefined,
      transferDate: transferDate || undefined,
    });

    return NextResponse.json({
      success: true,
      slip,
      message: 'Payment slip uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading payment slip:', error);
    return NextResponse.json(
      { error: 'Failed to upload payment slip' },
      { status: 500 }
    );
  }
}
