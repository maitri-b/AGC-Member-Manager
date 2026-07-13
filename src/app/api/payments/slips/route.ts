// API Route to get payment slips for a registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';

// GET - Get payment slips for a registration
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');

    if (!registrationId) {
      return NextResponse.json(
        { error: 'registrationId is required' },
        { status: 400 }
      );
    }

    const db = adminDb();

    // Get all payment slips for this registration
    const slipsSnapshot = await db
      .collection('paymentSlips')
      .where('registrationId', '==', registrationId)
      .orderBy('uploadedAt', 'desc')
      .get();

    const slips = slipsSnapshot.docs.map(doc => ({
      slipId: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({
      success: true,
      slips,
    });
  } catch (error) {
    console.error('[Get Payment Slips] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
