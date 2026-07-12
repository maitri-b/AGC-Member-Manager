// API Route for GAS to Get Registration Data from Firestore
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

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

  const token = authHeader.replace('Bearer ', '');
  return token === gasSecret;
}

// GET - Get registration data
export async function GET(request: NextRequest) {
  try {
    // 1. Verify authentication
    if (!verifyGasToken(request)) {
      console.error('Unauthorized GAS get registration request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get query parameters
    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');
    const eventId = searchParams.get('eventId');

    console.log(`[GAS Get Registration] Request:`, {
      registrationId,
      eventId,
    });

    // 3. Validate required fields
    if (!registrationId || !eventId) {
      return NextResponse.json({
        error: 'Missing required parameters',
        required: ['registrationId', 'eventId'],
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
      console.error(`[GAS Get Registration] Not found: ${registrationId}`);
      return NextResponse.json({
        error: 'Registration not found',
        registrationId,
        eventId,
      }, { status: 404 });
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // 5. Return registration data
    const registrationData = {
      registrationId: data.registrationId || '',
      eventId: data.eventId || '',
      companyName: data.companyName || '',
      totalAmount: data.totalAmount || 0,
      depositAmount: data.depositAmount || 0,
      remainingAmount: data.remainingAmount || 0,
      lineUserId: data.lineUserId || '',
      status: data.status || '',
      paymentStatus: data.paymentStatus || '',
      depositPaid: data.depositPaid || false,
      depositSlipUrl: data.depositSlipUrl || '',
      depositPaidDate: data.depositPaidDate || '',
      remainingSlipUrl: data.remainingSlipUrl || '',
      remainingPaidDate: data.remainingPaidDate || '',
    };

    console.log(`[GAS Get Registration] Found:`, {
      registrationId: data.registrationId,
      companyName: data.companyName,
      status: data.status,
    });

    return NextResponse.json({
      success: true,
      registration: registrationData,
    });

  } catch (error) {
    console.error('[GAS Get Registration] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
