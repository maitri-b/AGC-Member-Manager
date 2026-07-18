// API Route: POST /api/payments/upload - Upload new payment slip
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminStorage, adminDb } from '@/lib/firebase-admin';
import { createPaymentSlip } from '@/lib/payment-slips';
import { getEventRegistrationByRegistrationId } from '@/lib/event-sheets';
import { PaymentType } from '@/types/payment';

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
      fileData, // base64 encoded file
      fileName,
      mimeType,
      paymentMethod,
      bankName,
      transferDate,
    } = body;

    console.log('[Member Upload] === INCOMING REQUEST ===');
    console.log('[Member Upload] registrationId:', registrationId);
    console.log('[Member Upload] eventId:', eventId);
    console.log('[Member Upload] paymentType:', paymentType);
    console.log('[Member Upload] userId:', session.user.id);

    // Validation
    if (!registrationId || !eventId || !amount || !paymentType || !fileData || !fileName) {
      return NextResponse.json(
        {
          error: 'Missing required fields: registrationId, eventId, amount, paymentType, fileData, fileName',
        },
        { status: 400 }
      );
    }

    // Validate payment type
    const validPaymentTypes: PaymentType[] = ['full', 'deposit', 'remaining', 'additional', 'refund'];
    if (!validPaymentTypes.includes(paymentType)) {
      return NextResponse.json(
        { error: 'Invalid payment type. Must be: full, deposit, remaining, additional, or refund' },
        { status: 400 }
      );
    }

    // Verify registration exists
    const registration = await getEventRegistrationByRegistrationId(registrationId);
    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    // Verify user owns this registration
    if (registration.lineUserId !== session.user.id && (registration as any).userId !== session.user.id) {
      console.error('[Member Upload] ❌ User does not own this registration');
      return NextResponse.json({ error: 'Unauthorized - This is not your registration' }, { status: 403 });
    }

    // Verify eventId matches registration (only if registration has eventId)
    if (registration.eventId && registration.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Event ID does not match registration' },
        { status: 400 }
      );
    }

    console.log('[Member Upload] ✅ Validation passed');

    // Upload file to Firebase Storage
    const storage = adminStorage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    if (!bucketName) {
      console.error('[Member Upload] FIREBASE_STORAGE_BUCKET is not configured');
      return NextResponse.json(
        { error: 'Storage configuration error. Please contact administrator.' },
        { status: 500 }
      );
    }

    console.log('[Member Upload] Using storage bucket:', bucketName);
    const bucket = storage.bucket(bucketName);
    const fileExtension = fileName.split('.').pop();
    const storagePath = `payment-slips/${eventId}/${registrationId}/${Date.now()}.${fileExtension}`;
    const file = bucket.file(storagePath);

    console.log('[Member Upload] Storage path:', storagePath);

    // Decode base64 and upload
    const fileBuffer = Buffer.from(fileData, 'base64');
    await file.save(fileBuffer, {
      metadata: {
        contentType: mimeType || 'application/octet-stream',
        metadata: {
          uploadedBy: session.user.id,
          uploadedByMember: 'true',
          registrationId,
          eventId,
          paymentType,
        },
      },
    });

    // Use direct public URL
    const slipUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    console.log('[Member Upload] File uploaded, public URL:', slipUrl);

    console.log('[Member Upload] Creating payment slip in database...');

    // Create payment slip
    let slip;
    try {
      // Build slip data, only include fields that are not undefined
      const slipData: any = {
        registrationId,
        eventId,
        amount: Number(amount),
        paymentType,
        slipUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: session.user.lineUserId || session.user.id || 'unknown',
        status: 'pending', // All new uploads start as pending
      };

      // Only add optional fields if they have values
      if (description) slipData.description = description;
      if (paymentMethod) slipData.paymentMethod = paymentMethod;
      if (bankName) slipData.bankName = bankName;
      if (transferDate) slipData.transferDate = transferDate;

      slip = await createPaymentSlip(slipData);
      console.log('[Member Upload] ✅ Payment slip created successfully, slipId:', slip.slipId);
    } catch (error) {
      console.error('[Member Upload] ❌ Error creating payment slip:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      slip,
      slipUrl,
      message: 'Payment slip uploaded successfully',
    });
  } catch (error) {
    console.error('[Member Upload] ❌ FATAL ERROR:', error);
    console.error('[Member Upload] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to upload payment slip', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
