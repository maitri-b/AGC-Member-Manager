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

    // Verify eventId matches (only if registration has eventId)
    if (registration.eventId && registration.eventId !== eventId) {
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
      uploadedBy: lineUserId || registration.lineUserId || 'gas-upload',
      status: 'pending', // All uploads start as pending for admin review
    });

    console.log(`[GAS Webhook] Created payment slip:`, {
      slipId: slip.slipId,
      registrationId,
      paymentType,
      amount: paymentAmount,
      status: slip.status,
    });

    // 7. Update eventRegistrations record (in-place update for legacy compatibility)
    const db = adminDb();
    const registrationsRef = db.collection('eventRegistrations');
    const snapshot = await registrationsRef
      .where('registrationId', '==', registrationId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const registrationDoc = snapshot.docs[0];
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Update slip URL fields and ONLY payment_status (not status)
      if (paymentType === 'deposit') {
        updateData.depositSlipUrl = slipUrl;
        updateData.depositPaidDate = today;
        updateData.paymentStatus = 'รอตรวจสอบมัดจำ';
        // Do NOT update 'status' - that's for registration confirmation by admin
      } else if (paymentType === 'remaining') {
        updateData.remainingSlipUrl = slipUrl;
        updateData.remainingPaidDate = today;
        updateData.paymentStatus = 'รอตรวจสอบยอดคงเหลือ';
        // Do NOT update 'status'
      } else if (paymentType === 'full') {
        // ✅ Use Full Payment Fields for Full Payment Mode
        updateData.fullPaymentSlipUrl = slipUrl;
        updateData.fullPaymentPaidDate = today;
        updateData.paymentStatus = 'รอตรวจสอบ';

        // ✅ Keep legacy fields for backward compatibility (but don't set paidDate for old fields)
        updateData.depositSlipUrl = slipUrl;
        updateData.remainingSlipUrl = slipUrl;
        // Do NOT update 'status'
      } else if (paymentType === 'additional') {
        // Handle additional payment tracking
        const currentData = registrationDoc.data();
        let additionalPayments: any[] = [];

        // Parse existing additional payments
        if (currentData.additionalPayments) {
          try {
            additionalPayments = JSON.parse(currentData.additionalPayments);
            if (!Array.isArray(additionalPayments)) {
              additionalPayments = [];
            }
          } catch (error) {
            console.error('[GAS Webhook] Error parsing additionalPayments:', error);
            additionalPayments = [];
          }
        }

        // Create new additional payment record
        const newPayment = {
          paymentId: slip.slipId,
          amount: Number(paymentAmount),
          reason: description || `การชำระเงินเพิ่มเติม`,
          slipUrl: slipUrl,
          uploadedAt: uploadedAt || new Date().toISOString(),
          status: 'รอตรวจสอบ' as const,
        };

        additionalPayments.push(newPayment);

        // Save back to Firestore
        updateData.additionalPayments = JSON.stringify(additionalPayments);
        updateData.paymentStatus = 'รอตรวจสอบเงินเพิ่มเติม';
        // Do NOT update 'status'
      }

      await registrationDoc.ref.update(updateData);

      console.log(`[GAS Webhook] Updated eventRegistrations record:`, {
        registrationId,
        paymentType,
        paymentStatus: updateData.paymentStatus,
      });
    }

    // 8. Invalidate caches
    sheetsCache.invalidate(CacheKeys.eventAttendees(eventId));
    sheetsCache.invalidate(`event:${eventId}:registrations`);

    // 9. Return success
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
