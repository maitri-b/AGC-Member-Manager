// API Route: POST /api/admin/payments/upload-for-user
// Admin uploads payment slip on behalf of user
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

    // Upload file to Firebase Storage
    const bucket = adminStorage().bucket();
    const fileExtension = fileName.split('.').pop();
    const storagePath = `payment-slips/${eventId}/${registrationId}/${Date.now()}.${fileExtension}`;
    const file = bucket.file(storagePath);

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

    // Make file publicly accessible
    await file.makePublic();

    // Get public URL
    const slipUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    // Create payment slip
    const slip = await createPaymentSlip({
      registrationId,
      eventId,
      amount: Number(amount),
      paymentType,
      description: description || `อัพโหลดโดย Admin: ${session.user.email || session.user.name || 'Unknown'}`,
      slipUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: session.user.lineUserId || session.user.id || 'admin',
      status: 'pending', // Start as pending, admin can approve immediately after
      paymentMethod: paymentMethod || undefined,
      bankName: bankName || undefined,
      transferDate: transferDate || undefined,
    });

    // Log admin action
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

    return NextResponse.json({
      success: true,
      slip,
      slipUrl,
      message: 'Payment slip uploaded successfully by admin',
    });
  } catch (error) {
    console.error('Error uploading payment slip for user:', error);
    return NextResponse.json(
      { error: 'Failed to upload payment slip', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
