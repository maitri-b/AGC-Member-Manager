// API Route for GAS Slip Upload Webhook
// This endpoint receives slip upload notifications from Google Apps Script
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { sheetsCache, CacheKeys } from '@/lib/cache/google-sheets-cache';
import { createPaymentSlip } from '@/lib/payment-slips';
import { getEventRegistrationByRegistrationId } from '@/lib/event-sheets';
import { PaymentType } from '@/types/payment';

// Verify GAS request using secret token
function verifyGasToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const gasSecret = process.env.GAS_WEBHOOK_SECRET;

  if (!gasSecret) {
    console.error('GAS_WEBHOOK_SECRET not configured');
    return false;
  }

  if (!authHeader) {
    return false;
  }

  // Expected format: "Bearer SECRET_TOKEN"
  const token = authHeader.replace('Bearer ', '');
  return token === gasSecret;
}

// POST - Receive slip upload from GAS
export async function POST(request: NextRequest) {
  try {
    // 1. Verify authentication
    if (!verifyGasToken(request)) {
      console.error('Unauthorized GAS webhook request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    const {
      registrationId,
      eventId,
      paymentType, // 'deposit' | 'remaining' | 'full' | 'additional'
      amount,
      description,
      slipUrl,
      uploadedAt,
      lineUserId,
    } = body;

    console.log(`[GAS Webhook] Received slip upload:`, {
      registrationId,
      eventId,
      paymentType,
      amount,
      slipUrl: slipUrl?.substring(0, 50) + '...',
    });

    // 3. Validate required fields
    if (!registrationId || !eventId || !paymentType || !slipUrl) {
      return NextResponse.json({
        error: 'Missing required fields',
        required: ['registrationId', 'eventId', 'paymentType', 'slipUrl'],
      }, { status: 400 });
    }

    // Validate payment type
    const validPaymentTypes: PaymentType[] = ['full', 'deposit', 'remaining', 'additional'];
    if (!validPaymentTypes.includes(paymentType as PaymentType)) {
      return NextResponse.json({
        error: 'Invalid payment type',
        validTypes: validPaymentTypes,
      }, { status: 400 });
    }

    // 4. Verify registration exists
    const registration = await getEventRegistrationByRegistrationId(registrationId);

    if (!registration) {
      console.error(`[GAS Webhook] Registration not found: ${registrationId}`);
      return NextResponse.json({
        error: 'Registration not found',
        registrationId,
        eventId,
      }, { status: 404 });
    }

    // Verify eventId matches
    if (registration.eventId !== eventId) {
      console.error(`[GAS Webhook] Event ID mismatch: ${registration.eventId} vs ${eventId}`);
      return NextResponse.json({
        error: 'Event ID does not match registration',
        registrationId,
        eventId,
      }, { status: 400 });
    }

    // 5. Determine payment amount if not provided
    let paymentAmount = amount;
    if (!paymentAmount || paymentAmount === 0) {
      // Auto-calculate based on payment type
      if (paymentType === 'deposit') {
        paymentAmount = registration.depositAmount || 0;
      } else if (paymentType === 'remaining') {
        paymentAmount = registration.remainingAmount || 0;
      } else if (paymentType === 'full') {
        paymentAmount = registration.totalAmount || 0;
      } else {
        // For 'additional', amount must be provided
        return NextResponse.json({
          error: 'Amount is required for additional payment type',
        }, { status: 400 });
      }
    }

    // 6. Create payment slip record
    const slip = await createPaymentSlip({
      registrationId,
      eventId,
      amount: Number(paymentAmount),
      paymentType: paymentType as PaymentType,
      description: description || getPaymentTypeDescription(paymentType as PaymentType),
      slipUrl,
      uploadedAt: uploadedAt || new Date().toISOString(),
      uploadedBy: lineUserId || registration.lineUserId || registration.userId || 'gas-upload',
      status: 'pending', // All uploads start as pending for admin review
    });

    console.log(`[GAS Webhook] Created payment slip:`, {
      slipId: slip.slipId,
      registrationId,
      paymentType,
      amount: paymentAmount,
      status: slip.status,
    });

    // 7. Invalidate caches
    sheetsCache.invalidate(CacheKeys.eventAttendees(eventId));
    sheetsCache.invalidate(`event:${eventId}:registrations`);

    // 8. Return success
    return NextResponse.json({
      success: true,
      message: 'Payment slip uploaded successfully',
      slipId: slip.slipId,
      registrationId,
      paymentType,
      amount: paymentAmount,
      status: slip.status,
    });

  } catch (error) {
    console.error('[GAS Webhook] Error processing slip upload:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// Helper function to get Thai description for payment type
function getPaymentTypeDescription(paymentType: PaymentType): string {
  const descriptions: Record<PaymentType, string> = {
    full: 'ชำระเต็มจำนวน',
    deposit: 'ชำระมัดจำ',
    remaining: 'ชำระยอดคงเหลือ',
    additional: 'ชำระเพิ่มเติม',
  };
  return descriptions[paymentType];
}

// GET - Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'GAS Slip Upload Webhook',
    timestamp: new Date().toISOString(),
  });
}
