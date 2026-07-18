// API Route: POST /api/admin/payments/upload-for-user
// Admin uploads payment slip on behalf of user
// ✅ Admin uploads are AUTOMATICALLY APPROVED - no manual approval needed
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminStorage, adminDb } from '@/lib/firebase-admin';
import { createPaymentSlip, getPaymentSlipsByRegistration, getPaymentTypeLabel, approvePaymentSlip } from '@/lib/payment-slips';
import { getEventRegistrationByRegistrationId } from '@/lib/event-sheets';
import { PaymentType } from '@/types/payment';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
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

    // Debug: Log incoming request body
    console.log('[Admin Upload] === INCOMING REQUEST ===');
    console.log('[Admin Upload] Request body keys:', Object.keys(body));
    console.log('[Admin Upload] registrationId:', registrationId);
    console.log('[Admin Upload] eventId from body:', eventId, 'Type:', typeof eventId);

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

    // Debug logging - detailed comparison
    console.log('[Admin Upload] === VALIDATION CHECK ===');
    console.log('[Admin Upload] Received eventId:', JSON.stringify(eventId), 'Type:', typeof eventId, 'Length:', eventId?.length);
    console.log('[Admin Upload] Registration eventId:', JSON.stringify(registration.eventId), 'Type:', typeof registration.eventId, 'Length:', registration.eventId?.length);
    console.log('[Admin Upload] Are they equal?', registration.eventId === eventId);
    console.log('[Admin Upload] Trimmed equal?', registration.eventId?.trim() === eventId?.trim());
    console.log('[Admin Upload] Registration has eventId?', !!registration.eventId);

    // Show first 200 chars of registration data
    const regDataPreview = JSON.stringify(registration).substring(0, 200);
    console.log('[Admin Upload] Registration preview:', regDataPreview + '...');

    // Verify eventId matches registration (only if registration has eventId)
    if (registration.eventId && registration.eventId !== eventId) {
      console.error('[Admin Upload] ❌ EVENT ID MISMATCH!');
      console.error('[Admin Upload] Expected (from request):', JSON.stringify(eventId));
      console.error('[Admin Upload] Got (from registration):', JSON.stringify(registration.eventId));
      console.error('[Admin Upload] Registration ID:', registrationId);
      return NextResponse.json(
        {
          error: 'Event ID does not match registration',
          debug: {
            receivedEventId: eventId,
            registrationEventId: registration.eventId,
            registrationId,
          }
        },
        { status: 400 }
      );
    }

    console.log('[Admin Upload] ✅ Event ID validation passed');

    // ========== SERVER-SIDE PAYMENT VALIDATION ==========
    // Same validation as member upload to prevent duplicates and enforce rules

    // 1. Fetch existing slips for validation
    console.log('[Admin Upload] Fetching existing slips for validation...');
    const existingSlips = await getPaymentSlipsByRegistration(registrationId);
    console.log('[Admin Upload] Found', existingSlips.length, 'existing slip(s)');

    // 2. Filter active slips (exclude refund)
    const activeSlips = existingSlips.filter(slip =>
      (slip.status === 'approved' || slip.status === 'pending') &&
      slip.paymentType !== 'refund'
    );
    console.log('[Admin Upload] Active slips (approved + pending, excluding refund):', activeSlips.length);

    // 3. Check for duplicate payment type (except 'additional' and 'refund')
    // Note: Admin can override by approving/rejecting existing slip first
    if (paymentType !== 'additional' && paymentType !== 'refund') {
      const hasDuplicate = activeSlips.some(slip => slip.paymentType === paymentType);

      if (hasDuplicate) {
        console.log('[Admin Upload] ⚠️ Warning: Duplicate payment type detected:', paymentType);
        console.log('[Admin Upload] Admin can proceed, but should verify this is intentional');
        // ⚠️ For admin, we just log a warning but don't block
        // Admin might intentionally upload a replacement slip
      }
    }

    // 4. Block refund if there are pending slips
    if (paymentType === 'refund') {
      const hasPendingSlips = existingSlips.some(slip => slip.status === 'pending');

      if (hasPendingSlips) {
        console.log('[Admin Upload] ❌ Cannot create refund - pending slips exist');
        return NextResponse.json({
          error: 'ไม่สามารถสร้าง refund ได้',
          details: 'มีสลิปที่รออนุมัติอยู่ กรุณาดำเนินการอนุมัติหรือปฏิเสธสลิปก่อน'
        }, { status: 400 });
      }
    }

    console.log('[Admin Upload] ✅ Payment validation passed - proceeding with upload');

    // Upload file to Firebase Storage
    const storage = adminStorage();
    // Try server-side env first, fallback to public env (for local dev)
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    if (!bucketName) {
      console.error('[Admin Upload] FIREBASE_STORAGE_BUCKET is not configured');
      return NextResponse.json(
        { error: 'Storage configuration error. Please contact administrator.' },
        { status: 500 }
      );
    }

    console.log('[Admin Upload] Using storage bucket:', bucketName);
    const bucket = storage.bucket(bucketName);
    const fileExtension = fileName.split('.').pop();
    const storagePath = `payment-slips/${eventId}/${registrationId}/${Date.now()}.${fileExtension}`;
    const file = bucket.file(storagePath);

    console.log('[Admin Upload] Storage path:', storagePath);

    // Decode base64 and upload
    const fileBuffer = Buffer.from(fileData, 'base64');
    await file.save(fileBuffer, {
      metadata: {
        contentType: mimeType || 'application/octet-stream',
        metadata: {
          uploadedBy: session.user.email || session.user.id,
          uploadedByAdmin: 'true',
          registrationId,
          eventId,
          paymentType,
        },
      },
    });

    // Use direct public URL
    // Note: Requires Public Access Prevention to be disabled on bucket
    const slipUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    console.log('[Admin Upload] File uploaded, public URL:', slipUrl);

    console.log('[Admin Upload] Creating payment slip in database...');

    // Create payment slip with 'approved' status (admin uploads are pre-approved)
    let slip;
    try {
      // Build slip data, only include fields that are not undefined
      const slipData: any = {
        registrationId,
        eventId,
        amount: Number(amount),
        paymentType,
        description: description || `อัพโหลดโดย Admin: ${session.user.email || session.user.name || 'Unknown'}`,
        slipUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: session.user.lineUserId || session.user.id || 'admin',
        status: 'approved', // ✅ Admin uploads are automatically approved
        reviewedBy: session.user.id, // ✅ Auto-approved by the admin who uploaded
        reviewedAt: new Date().toISOString(), // ✅ Reviewed at upload time
      };

      // ✅ CRITICAL FIX: Only add reviewer fields if they have values (Firestore rejects undefined)
      if (session.user.email) {
        slipData.reviewerEmail = session.user.email;
      }
      if (session.user.name || session.user.email) {
        slipData.reviewerName = session.user.name || session.user.email;
      }

      // Only add optional fields if they have values
      if (paymentMethod) slipData.paymentMethod = paymentMethod;
      if (bankName) slipData.bankName = bankName;
      if (transferDate) slipData.transferDate = transferDate;

      slip = await createPaymentSlip(slipData);
      console.log('[Admin Upload] ✅ Payment slip created with approved status, slipId:', slip.slipId);

      // ✅ CRITICAL: Immediately sync to eventRegistrations (same as manual approval)
      console.log('[Admin Upload] Syncing payment to eventRegistrations...');
      const adminNote = `อัพโหลดและอนุมัติโดย Admin: ${session.user.email || session.user.name || 'Unknown'} (${getPaymentTypeLabel(paymentType)}: ${amount.toLocaleString()} บาท)`;
      await approvePaymentSlip(
        slip.slipId,
        session.user.id,
        adminNote
      );
      console.log('[Admin Upload] ✅ Payment synced to eventRegistrations');
    } catch (error) {
      console.error('[Admin Upload] ❌ Error creating/approving payment slip:', error);
      throw error; // Re-throw to be caught by outer try-catch
    }

    console.log('[Admin Upload] Logging admin action...');

    // Log admin action
    try {
      await adminDb().collection('adminLogs').add({
        action: 'upload_payment_slip_for_user',
        adminId: session.user.id,
        adminEmail: session.user.email,
        registrationId,
        eventId,
        slipId: slip.slipId,
        paymentType,
        amount: Number(amount),
        timestamp: new Date().toISOString(),
      });
      console.log('[Admin Upload] ✅ Admin action logged');
    } catch (error) {
      console.error('[Admin Upload] ⚠️ Error logging admin action (non-critical):', error);
      // Don't throw - logging is non-critical
    }

    console.log('[Admin Upload] ✅ Upload complete, returning response');

    return NextResponse.json({
      success: true,
      slip,
      slipUrl,
      message: 'Payment slip uploaded and approved successfully by admin',
    });
  } catch (error) {
    console.error('[Admin Upload] ❌ FATAL ERROR:', error);
    console.error('[Admin Upload] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to upload payment slip', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
