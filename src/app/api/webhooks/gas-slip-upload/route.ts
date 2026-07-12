// API Route for GAS Slip Upload Webhook
// This endpoint receives slip upload notifications from Google Apps Script
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { sheetsCache, CacheKeys } from '@/lib/cache/google-sheets-cache';

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
      paymentType, // 'deposit' | 'remaining' | 'full'
      slipUrl,
      uploadedAt,
    } = body;

    console.log(`[GAS Webhook] Received slip upload:`, {
      registrationId,
      eventId,
      paymentType,
      slipUrl: slipUrl?.substring(0, 50) + '...',
    });

    // 3. Validate required fields
    if (!registrationId || !eventId || !paymentType || !slipUrl) {
      return NextResponse.json({
        error: 'Missing required fields',
        required: ['registrationId', 'eventId', 'paymentType', 'slipUrl'],
      }, { status: 400 });
    }

    // 4. Find registration in Firestore
    const db = adminDb();
    const registrationsRef = db.collection('eventRegistrations');

    const snapshot = await registrationsRef
      .where('eventId', '==', eventId)
      .where('registrationId', '==', registrationId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.error(`[GAS Webhook] Registration not found: ${registrationId}`);
      return NextResponse.json({
        error: 'Registration not found',
        registrationId,
        eventId,
      }, { status: 404 });
    }

    const registrationDoc = snapshot.docs[0];
    const registrationData = registrationDoc.data();

    // 5. Prepare update data based on payment type
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (paymentType === 'deposit') {
      // Deposit payment
      updateData.depositSlipUrl = slipUrl;
      updateData.depositPaidDate = today;
      updateData.depositPaid = false; // Will be verified by admin
      updateData.paymentStatus = 'รอตรวจสอบมัดจำ';
      updateData.status = 'รอตรวจสอบมัดจำ';
    } else if (paymentType === 'remaining') {
      // Remaining payment
      updateData.remainingSlipUrl = slipUrl;
      updateData.remainingPaidDate = today;
      updateData.paymentStatus = 'รอตรวจสอบยอดคงเหลือ';
      updateData.status = 'รอตรวจสอบยอดคงเหลือ';
    } else {
      // Full payment (paymentType === 'full')
      // Use remaining_slip_url for full payment (modern approach)
      updateData.remainingSlipUrl = slipUrl;
      updateData.remainingPaidDate = today;
      updateData.paymentStatus = 'รอตรวจสอบ';
      updateData.status = 'รอตรวจสอบ';
    }

    // 6. Update Firestore
    await registrationDoc.ref.update(updateData);

    console.log(`[GAS Webhook] Updated registration ${registrationId}:`, {
      paymentType,
      status: updateData.paymentStatus,
    });

    // 7. Invalidate caches
    sheetsCache.invalidate(CacheKeys.eventAttendees(eventId));
    sheetsCache.invalidate(`event:${eventId}:registrations`);

    // 8. Return success
    return NextResponse.json({
      success: true,
      message: 'Slip uploaded successfully',
      registrationId,
      paymentType,
      status: updateData.paymentStatus,
    });

  } catch (error) {
    console.error('[GAS Webhook] Error processing slip upload:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// GET - Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'GAS Slip Upload Webhook',
    timestamp: new Date().toISOString(),
  });
}
