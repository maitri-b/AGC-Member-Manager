// API Route: GET /api/payments/slips - Fetch payment slips for a registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');

    console.log('[Fetch Slips] === INCOMING REQUEST ===');
    console.log('[Fetch Slips] registrationId:', registrationId);
    console.log('[Fetch Slips] userId:', session.user.id);

    // Validation
    if (!registrationId) {
      return NextResponse.json(
        { error: 'Missing required parameter: registrationId' },
        { status: 400 }
      );
    }

    const db = adminDb();

    // Fetch payment slips for this registration
    console.log('[Fetch Slips] Querying paymentSlips collection...');
    const slipsSnapshot = await db.collection('paymentSlips')
      .where('registrationId', '==', registrationId)
      .get();

    console.log('[Fetch Slips] Found', slipsSnapshot.size, 'slip(s)');

    // Map slips to array
    const slips = slipsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        slipId: doc.id,
        registrationId: data.registrationId,
        eventId: data.eventId,
        paymentType: data.paymentType,
        amount: data.amount,
        status: data.status,
        uploadedAt: data.uploadedAt,
        uploadedBy: data.uploadedBy,
        slipUrl: data.slipUrl,
        description: data.description,
        approvedAt: data.approvedAt,
        approvedBy: data.approvedBy,
        rejectedAt: data.rejectedAt,
        rejectedBy: data.rejectedBy,
        rejectionReason: data.rejectionReason,
      };
    });

    console.log('[Fetch Slips] Returning slips:', slips.map(s => ({
      slipId: s.slipId,
      paymentType: s.paymentType,
      amount: s.amount,
      status: s.status,
    })));

    return NextResponse.json({
      success: true,
      slips,
    });
  } catch (error) {
    console.error('[Fetch Slips] ❌ FATAL ERROR:', error);
    console.error('[Fetch Slips] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to fetch payment slips', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
