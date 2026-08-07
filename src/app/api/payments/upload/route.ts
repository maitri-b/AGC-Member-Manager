// API Route: POST /api/payments/upload - Upload new payment slip
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminStorage, adminDb } from '@/lib/firebase-admin';
import { createPaymentSlip, getPaymentSlipsByRegistration, getPaymentTypeLabel } from '@/lib/payment-slips';
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

    console.log('[Member Upload] ✅ Basic validation passed');

    // ========== SERVER-SIDE PAYMENT VALIDATION ==========

    // 1. Block member from uploading refund - allow admin, committee, event-co
    if (paymentType === 'refund') {
      const userRole = session.user.role || 'member';
      const allowedRoles = ['admin', 'committee', 'event-co'];

      if (!allowedRoles.includes(userRole)) {
        console.log('[Member Upload] ❌ Unauthorized role attempted to upload refund:', userRole);
        return NextResponse.json({
          error: 'เฉพาะ Admin, Committee, และ Event Coordinator เท่านั้นที่สามารถสร้าง refund ได้'
        }, { status: 403 });
      }
    }

    // 2. Fetch existing slips for validation
    console.log('[Member Upload] Fetching existing slips for validation...');
    const existingSlips = await getPaymentSlipsByRegistration(registrationId);
    console.log('[Member Upload] Found', existingSlips.length, 'existing slip(s)');

    // 3. Filter active slips (exclude refund)
    const activeSlips = existingSlips.filter(slip =>
      (slip.status === 'approved' || slip.status === 'pending') &&
      slip.paymentType !== 'refund'
    );
    console.log('[Member Upload] Active slips (approved + pending, excluding refund):', activeSlips.length);

    // 4. Check for duplicate payment type (except 'additional')
    if (paymentType !== 'additional') {
      const hasDuplicate = activeSlips.some(slip => slip.paymentType === paymentType);

      if (hasDuplicate) {
        console.log('[Member Upload] ❌ Duplicate payment type detected:', paymentType);
        return NextResponse.json({
          error: `ไม่สามารถอัพโหลดสลิปประเภท "${getPaymentTypeLabel(paymentType)}" ได้`,
          details: 'มีสลิปประเภทนี้รออนุมัติหรืออนุมัติแล้ว กรุณารอการตรวจสอบก่อน'
        }, { status: 400 });
      }
    }

    // 5. Block refund if there are pending slips (only for admin creating refund)
    if (paymentType === 'refund') {
      const hasPendingSlips = existingSlips.some(slip => slip.status === 'pending');

      if (hasPendingSlips) {
        console.log('[Member Upload] ❌ Cannot create refund - pending slips exist');
        return NextResponse.json({
          error: 'ไม่สามารถสร้าง refund ได้',
          details: 'มีสลิปที่รออนุมัติอยู่ กรุณาดำเนินการอนุมัติหรือปฏิเสธสลิปก่อน'
        }, { status: 400 });
      }
    }

    console.log('[Member Upload] ✅ Payment validation passed - proceeding with upload');

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

    console.log('[Member Upload] File saved to storage:', storagePath);

    // Generate URL based on bucket configuration
    let slipUrl: string;
    try {
      const [metadata] = await bucket.getMetadata();
      const iamConfiguration = metadata?.iamConfiguration;

      // Check if uniform bucket-level access is enabled
      if (iamConfiguration?.uniformBucketLevelAccess?.enabled) {
        console.log('[Member Upload] Uniform bucket-level access enabled, using signed URL');

        // Generate a long-lived signed URL (10 years for payment records)
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
        });

        slipUrl = signedUrl;
      } else {
        console.log('[Member Upload] Using direct public URL');
        // Use direct public URL if bucket is publicly accessible
        slipUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      }
    } catch (error) {
      console.error('[Member Upload] Error checking bucket metadata, defaulting to signed URL:', error);

      // Default to signed URL if we can't determine bucket settings
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
      });

      slipUrl = signedUrl;
    }

    console.log('[Member Upload] Slip URL generated:', slipUrl);

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
        uploadedByName: session.user.name || session.user.email || 'User',
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
