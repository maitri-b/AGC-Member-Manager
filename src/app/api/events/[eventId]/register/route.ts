// API Route for Event Registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { getMemberById } from '@/lib/google-sheets';
import { getEventRegistrationsByEventId, addEventRegistrationToFirestore } from '@/lib/event-sheets';
import { EventRegistration, calculateRegistrationFee, Event } from '@/types/event';
import { sendEventRegistrationConfirmation } from '@/lib/line-messaging';
import { calculatePaymentSplit, calculateDepositDeadline, calculateRemainingDeadline, calculateFullPaymentDeadline } from '@/lib/payment-deadlines';
import { sheetsCache, CacheKeys } from '@/lib/cache/google-sheets-cache';
import { isGuestEligibleForEventRegistration } from '@/lib/permissions';
import { createPaymentSlip } from '@/lib/payment-slips';
// Removed - using adminStorage() from @/lib/firebase-admin instead

// Generate a unique 6-character registration ID
function generateRegistrationId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0,O,1,I
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Upload payment slip to Firebase Storage
async function uploadPaymentSlipToStorage(
  file: File,
  eventId: string,
  registrationId: string
): Promise<string> {
  const storage = adminStorage();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error('Firebase Storage bucket name is not configured');
  }

  const bucket = storage.bucket(bucketName);
  const timestamp = Date.now();
  const fileName = `payment-slips/${eventId}/${registrationId}_${timestamp}.${file.name.split('.').pop()}`;

  const fileBuffer = await file.arrayBuffer();
  const blob = bucket.file(fileName);

  await blob.save(Buffer.from(fileBuffer), {
    metadata: {
      contentType: file.type,
    },
  });

  console.log(`[uploadPaymentSlipToStorage] File saved: ${fileName}`);

  // Try to get bucket metadata to check if bucket is public
  try {
    const [metadata] = await bucket.getMetadata();
    const iamConfiguration = metadata?.iamConfiguration;

    // Check if uniform bucket-level access is enabled
    if (iamConfiguration?.uniformBucketLevelAccess?.enabled) {
      console.log(`[uploadPaymentSlipToStorage] Uniform bucket-level access enabled, using signed URL`);

      // Generate a long-lived signed URL (10 years for payment records)
      const [signedUrl] = await blob.getSignedUrl({
        action: 'read',
        expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
      });

      return signedUrl;
    } else {
      console.log(`[uploadPaymentSlipToStorage] Using makePublic() for file-level access`);

      // Make file publicly readable (old method)
      await blob.makePublic();

      // Return public URL
      return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    }
  } catch (error) {
    console.error(`[uploadPaymentSlipToStorage] Error checking bucket metadata, defaulting to signed URL:`, error);

    // Default to signed URL if we can't determine bucket settings
    const [signedUrl] = await blob.getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });

    return signedUrl;
  }
}

// POST - Register for event
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    // Check if request is multipart/form-data (for file upload) or JSON
    const contentType = request.headers.get('content-type') || '';
    const isFormData = contentType.includes('multipart/form-data');

    console.log(`[Member Register] Request type: ${isFormData ? 'FormData' : 'JSON'}`);

    let body: any = {};
    let slipFile: File | null = null;

    if (isFormData) {
      const formData = await request.formData();

      // Extract file if present
      const fileEntry = formData.get('slipFile');
      if (fileEntry && fileEntry instanceof File) {
        slipFile = fileEntry;
        console.log(`[Member Register] SlipFile received: ${slipFile.name}, size: ${slipFile.size} bytes`);
      } else {
        console.log(`[Member Register] No slipFile in FormData`);
      }

      // Parse JSON fields from FormData
      body.attendeeCount = parseInt(formData.get('attendeeCount') as string) || 1;
      body.attendeeNames = formData.get('attendeeNames') ? JSON.parse(formData.get('attendeeNames') as string) : [];
      body.specialRequests = formData.get('specialRequests') as string || '';
      body.attendeeTypeSelections = formData.get('attendeeTypeSelections') ? JSON.parse(formData.get('attendeeTypeSelections') as string) : [];
      body.roomAllocations = formData.get('roomAllocations') ? JSON.parse(formData.get('roomAllocations') as string) : [];
      body.guestInfo = formData.get('guestInfo') ? JSON.parse(formData.get('guestInfo') as string) : null;
    } else {
      // Regular JSON request (backward compatibility)
      body = await request.json();
    }

    const { attendeeCount = 1, attendeeNames = [], specialRequests = '', attendeeTypeSelections = [], roomAllocations = [], guestInfo } = body;

    // Check if user is staff without memberId
    const isStaffWithoutMember = !session.user.memberId && ['admin', 'committee', 'event-co', 'event-staff'].includes(session.user.role || '');

    // Get member details first if memberId exists
    let member = null;
    if (session.user.memberId) {
      member = await getMemberById(session.user.memberId);
      if (!member) {
        return NextResponse.json({ error: 'ไม่พบข้อมูลสมาชิก' }, { status: 404 });
      }
    }

    // Check if user is an eligible guest (guest with valid member status)
    const isEligibleGuest = isGuestEligibleForEventRegistration(
      session.user.role || 'guest',
      session.user.memberId,
      member?.status,
      member?.lineGroupStatus
    );

    // Validate based on user type
    if (!isStaffWithoutMember && !session.user.memberId && !isEligibleGuest) {
      return NextResponse.json({ error: 'กรุณาเชื่อมต่อบัญชีสมาชิกก่อนลงทะเบียน' }, { status: 400 });
    }

    // For staff without member, validate guest info
    if (isStaffWithoutMember) {
      if (!guestInfo || !guestInfo.companyName || !guestInfo.contactName || !guestInfo.phone) {
        return NextResponse.json({ error: 'กรุณากรอกข้อมูลผู้ลงทะเบียนให้ครบถ้วน' }, { status: 400 });
      }
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    // Check if registration is open
    if (!eventData?.registrationOpen) {
      return NextResponse.json({ error: 'กิจกรรมนี้ยังไม่เปิดรับสมัคร' }, { status: 400 });
    }

    // DEPRECATED: sheetName check removed - now using Firestore only
    // Events no longer require sheetName since we migrated to Firestore-only approach

    // Helper function to check if registration is cancelled
    function isRegistrationCancelled(registration: EventRegistration): boolean {
      const status = registration.status || '';
      const statusLower = status.toLowerCase();
      return statusLower === 'cancelled' || status.includes('ยกเลิก');
    }

    // Get existing registrations to check capacity and duplicates
    let existingRegistrations: EventRegistration[] = [];
    try {
      existingRegistrations = await getEventRegistrationsByEventId(eventId);
    } catch (err) {
      console.error('Error fetching registrations:', err);
    }

    // Filter out cancelled registrations
    const activeRegistrations = existingRegistrations.filter(r => !isRegistrationCancelled(r));

    // Check if user already registered (by LINE User ID or Member ID)
    // This prevents duplicate registrations from the same user
    if (session.user.id || session.user.memberId) {
      const userAlreadyRegistered = activeRegistrations.find(r => {
        return (
          (session.user.id && r.lineUserId === session.user.id) ||
          (session.user.memberId && r.memberId === session.user.memberId)
        );
      });

      if (userAlreadyRegistered) {
        return NextResponse.json({
          error: 'คุณลงทะเบียนกิจกรรมนี้แล้ว หากต้องการเพิ่ม/ลดจำนวนผู้เข้าร่วมหรือแก้ไขข้อมูล กรุณาใช้ปุ่มแก้ไขข้อมูลการลงทะเบียน'
        }, { status: 400 });
      }
    }

    // Check if company (by license number) already registered (check only active registrations)
    // For staff without member, use guest license number or company name
    const checkLicenseNumber = member?.licenseNumber || guestInfo?.licenseNumber;

    if (checkLicenseNumber) {
      const companyAlreadyRegistered = activeRegistrations.find(r => {
        const regData = r as unknown as Record<string, unknown>;
        // Check by license number (1 company = 1 license = 1 registration)
        return regData.license_number === checkLicenseNumber;
      });

      if (companyAlreadyRegistered) {
        return NextResponse.json({
          error: 'บริษัทของคุณลงทะเบียนกิจกรรมนี้แล้ว หากต้องการเพิ่ม/ลดจำนวนผู้เข้าร่วม กรุณาใช้ปุ่มแก้ไขข้อมูลการลงทะเบียน'
        }, { status: 400 });
      }
    }

    // Check maxPerCompany limit
    if (eventData.maxPerCompany > 0 && attendeeCount > eventData.maxPerCompany) {
      return NextResponse.json({
        error: `ไม่สามารถลงทะเบียนได้ เนื่องจากจำกัด ${eventData.maxPerCompany} คนต่อ 1 บริษัท`
      }, { status: 400 });
    }

    // Calculate current attendee count (for capacity check and auto-close)
    const currentCount = activeRegistrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);

    // Check capacity (use active registrations only)
    if (eventData.maxCapacity > 0) {
      const availableSlots = eventData.maxCapacity - currentCount;

      if (currentCount + attendeeCount > eventData.maxCapacity) {
        if (availableSlots === 0) {
          return NextResponse.json({
            error: 'กิจกรรมนี้รับสมัครเต็มแล้ว'
          }, { status: 400 });
        } else {
          return NextResponse.json({
            error: `ไม่สามารถลงทะเบียนได้ เนื่องจากที่นั่งเหลือเพียง ${availableSlots} ที่ (คุณพยายามจอง ${attendeeCount} ที่)`
          }, { status: 400 });
        }
      }
    }

    // Generate registration ID
    const registrationId = generateRegistrationId();

    // Calculate registration fee
    let eventFee = 0;
    let roomFee = 0;
    let totalFee = 0;

    if (eventData.useAttendeeTypePricing && eventData.attendeeTypes) {
      // Calculate fee based on attendee types
      if (!attendeeTypeSelections || attendeeTypeSelections.length === 0) {
        return NextResponse.json({ error: 'กรุณาระบุจำนวนผู้เข้าร่วมตามประเภท' }, { status: 400 });
      }

      // Validate: calculated count must match attendeeCount
      const calculatedCount = attendeeTypeSelections.reduce((sum: number, s: { typeId: string; quantity: number }) => sum + s.quantity, 0);
      if (calculatedCount !== attendeeCount) {
        return NextResponse.json({ error: 'จำนวนผู้เข้าร่วมไม่ตรงกัน' }, { status: 400 });
      }

      // Calculate fee from attendee types
      eventFee = attendeeTypeSelections.reduce((sum: number, s: { typeId: string; quantity: number }) => {
        const type = eventData.attendeeTypes.find((t: { typeId: string; price: number }) => t.typeId === s.typeId);
        if (!type) {
          return sum;
        }
        return sum + (type.price * s.quantity);
      }, 0);
    } else {
      // Original fee calculation (fixed or tiered pricing)
      eventFee = calculateRegistrationFee(eventData as Event, attendeeCount, true); // true = isMember
    }

    // Validate and calculate room allocation fees (if room types are configured)
    if (eventData.roomTypes && eventData.roomTypes.length > 0) {
      if (!roomAllocations || roomAllocations.length === 0) {
        return NextResponse.json({ error: 'กรุณาเลือกประเภทห้องพัก' }, { status: 400 });
      }

      // Calculate total room capacity and validate
      let totalRoomCapacity = 0;
      for (const alloc of roomAllocations) {
        const roomType = eventData.roomTypes.find((rt: { typeId: string; capacity: number; price: number }) => rt.typeId === alloc.roomTypeId);
        if (!roomType) {
          return NextResponse.json({ error: `ไม่พบประเภทห้อง: ${alloc.roomTypeId}` }, { status: 400 });
        }
        totalRoomCapacity += roomType.capacity * alloc.roomCount;
        roomFee += roomType.price * alloc.roomCount;
      }

      // Exact match required
      if (totalRoomCapacity !== attendeeCount) {
        return NextResponse.json({
          error: `จำนวนผู้เข้าพักในห้องไม่ตรงกับจำนวนผู้เข้าร่วม (รองรับ ${totalRoomCapacity} คน แต่ลงทะเบียน ${attendeeCount} คน)`
        }, { status: 400 });
      }
    }

    // Calculate total fee = event fee + room fee
    totalFee = eventFee + roomFee;

    // Calculate payment breakdown and deadlines based on payment mode
    let depositAmount = 0;
    let remainingAmount = 0;
    let depositDeadline = '';
    let remainingDeadline = '';
    let fullPaymentDeadline = '';
    let paymentStatus = totalFee > 0 ? 'รอชำระเงิน' : 'ลงทะเบียนแล้ว';

    const registrationDate = new Date().toISOString();

    // ✅ Check if immediate payment is required
    const paymentTiming = eventData.paymentTiming || 'deferred';
    const isImmediatePayment = paymentTiming === 'immediate';

    console.log(`[Member Register] Payment timing: ${paymentTiming}, isImmediate: ${isImmediatePayment}, totalFee: ${totalFee}, hasSlipFile: ${!!slipFile}`);

    // Validate slip upload for immediate payment
    if (isImmediatePayment && totalFee > 0 && !slipFile) {
      return NextResponse.json({
        error: 'กรุณาแนบหลักฐานการชำระเงิน'
      }, { status: 400 });
    }

    if (eventData.paymentMode === 'deposit' && totalFee > 0) {
      // ✅ Deposit Mode: Split payment into two installments
      const split = calculatePaymentSplit(totalFee, eventData as Event, attendeeCount);
      depositAmount = split.depositAmount;
      remainingAmount = split.remainingAmount;

      // Calculate deposit deadline
      depositDeadline = calculateDepositDeadline(eventData as Event, registrationDate);

      // Calculate remaining deadline (if configured)
      if (eventData.remainingDeadlineType && eventData.remainingDeadlineType !== 'none') {
        remainingDeadline = calculateRemainingDeadline(eventData as Event, registrationDate);
      }

      // Set paymentStatus based on payment timing
      if (isImmediatePayment && slipFile) {
        paymentStatus = 'รอตรวจสอบมัดจำ'; // Slip uploaded, waiting for verification
      } else {
        paymentStatus = 'รอชำระมัดจำ'; // Deferred payment
      }
    } else if (totalFee > 0) {
      // ✅ Full Payment Mode: No deposit/remaining split, use full payment deadline only
      fullPaymentDeadline = calculateFullPaymentDeadline(eventData as Event, registrationDate);

      // ✅ Keep deposit/remaining amounts as 0 (no split in full payment mode)
      depositAmount = 0;
      remainingAmount = 0;

      // Set paymentStatus based on payment timing
      if (isImmediatePayment && slipFile) {
        paymentStatus = 'รอตรวจสอบ'; // Slip uploaded, waiting for verification
      } else {
        paymentStatus = 'รอชำระเงิน'; // Deferred payment
      }
    }

    // Prepare registration data for Firestore
    // Use guest info if staff without member, otherwise use member data
    const registrationData = {
      registrationId: registrationId,
      eventId: eventId,
      userId: session.user.id || '',
      lineUserId: session.user.id || '',
      memberId: session.user.memberId || '', // Will be empty for staff without member
      companyName: member ? (member.companyNameTH || member.companyNameEN || '') : (guestInfo?.companyName || ''),
      licenseNumber: member ? (member.licenseNumber || '') : (guestInfo?.licenseNumber || ''),
      contactName: member ? (member.fullNameTH || member.nickname || session.user.name || '') : (guestInfo?.contactName || session.user.name || ''),
      phone: member ? (member.mobile || member.phone || '') : (guestInfo?.phone || ''),
      email: member?.email || '',
      attendeeCount: attendeeCount,
      attendeeNames: JSON.stringify(attendeeNames.length > 0 ? attendeeNames : [member ? (member.fullNameTH || member.nickname || '') : (guestInfo?.contactName || '')]),
      shirtCount: 0,
      shirtSizes: '[]',
      eventFee: eventFee,
      roomFee: roomFee,
      shirtFee: 0,
      totalAmount: totalFee,
      depositAmount: depositAmount,
      remainingAmount: remainingAmount,
      depositPaid: false,
      depositPaidDate: '',
      depositSlipUrl: '',
      remainingSlipUrl: '',
      depositDeadline: depositDeadline,
      remainingDeadline: remainingDeadline,
      fullPaymentDeadline: fullPaymentDeadline,
      paymentStatus: paymentStatus,
      paymentTiming: paymentTiming, // ✅ Save payment timing flag
      attendeeTypeSelections: JSON.stringify(attendeeTypeSelections),
      roomAllocations: JSON.stringify(roomAllocations),
      status: paymentStatus,
      verifiedBy: '',
      verifiedDate: '',
      specialRequests: specialRequests,
      adminNotes: '',
      lastUpdateInfo: JSON.stringify({ registered: { by: 'system', at: new Date().toISOString() } }),
      attendanceType: 'agent',
      registeredAt: new Date().toISOString(),
    };

    // Add to Firestore and get the document ID
    const registrationDocId = await addEventRegistrationToFirestore(eventId, registrationData);
    console.log(`[Registration] Created registration ${registrationId} with doc ID: ${registrationDocId}`);

    // ✅ Handle immediate payment slip upload
    let slipUrl = '';
    console.log(`[Member Register] Checking immediate payment conditions - isImmediate: ${isImmediatePayment}, hasSlipFile: ${!!slipFile}, totalFee: ${totalFee}`);

    if (isImmediatePayment && slipFile && totalFee > 0) {
      console.log(`[Member Register] ✅ Starting immediate payment slip upload process`);
      try {
        // Upload slip to Firebase Storage
        slipUrl = await uploadPaymentSlipToStorage(slipFile, eventId, registrationId);
        console.log(`[Immediate Payment] Uploaded slip to: ${slipUrl}`);

        // Determine payment type based on payment mode
        const paymentType = eventData.paymentMode === 'deposit' ? 'deposit' : 'full';
        const paymentAmount = eventData.paymentMode === 'deposit' ? depositAmount : totalFee;

        console.log(`[Immediate Payment] Creating payment slip - Type: ${paymentType}, Amount: ${paymentAmount}, registrationDocId: ${registrationDocId}`);

        // Create payment slip record in paymentSlips collection
        // Pass registrationDocId to update registration directly without querying
        await createPaymentSlip({
          registrationId,
          eventId,
          slipUrl,
          amount: paymentAmount,
          paymentType,
          uploadedBy: session.user.id || '',
          uploadedAt: new Date().toISOString(),
          status: 'pending',
        }, registrationDocId); // ✅ Pass document ID for direct update

        console.log(`[Immediate Payment] ✅ Slip created successfully for registration ${registrationId}`);
      } catch (uploadError) {
        console.error('[Immediate Payment] ❌ Failed to upload/create slip:', uploadError);
        // Don't fail the registration if slip upload fails
        // User can re-upload later
      }
    } else {
      console.log(`[Member Register] ⚠️ Skipping immediate payment slip upload - conditions not met`);
    }

    // ✅ Invalidate caches for this event (so next request gets fresh data)
    sheetsCache.invalidate(CacheKeys.eventAttendees(eventId));
    sheetsCache.invalidate(`event:${eventId}:registrations`);
    sheetsCache.invalidate(CacheKeys.allEvents()); // Also invalidate events list

    // Check if event is now full and auto-close registration
    if (eventData.maxCapacity > 0) {
      const newTotalCount = currentCount + attendeeCount;
      if (newTotalCount >= eventData.maxCapacity) {
        try {
          console.log(`[AutoClose] Event ${eventId} reached capacity (${newTotalCount}/${eventData.maxCapacity}), closing registration`);
          await db.collection('events').doc(eventId).update({
            registrationOpen: false,
            updatedAt: new Date().toISOString(),
          });
        } catch (closeError) {
          console.error('Failed to auto-close registration:', closeError);
          // Don't fail the registration if auto-close fails
        }
      }
    }

    // Send LINE confirmation message (only if event has notification enabled)
    const sendNotification = eventData.sendLineNotification ?? true; // Default: true (backward compatibility)
    if (sendNotification && session.user.id) {
      try {
        await sendEventRegistrationConfirmation(session.user.id, {
          eventName: eventData.eventName || '',
          eventNameEN: eventData.eventNameEN || '',
          eventDate: eventData.eventDate || '',
          location: eventData.location || '',
          registrationId,
          attendeeCount,
          registrationFee: totalFee,
          memberName: member ? (member.fullNameTH || member.nickname || '') : (guestInfo?.contactName || session.user.name || ''),
          eventId,
          paymentMode: eventData.paymentMode || 'full',
          depositAmount,
          remainingAmount,
          depositDeadline,
          remainingDeadline,
        });
      } catch (lineError) {
        console.error('Failed to send LINE confirmation:', lineError);
        // Don't fail the registration if LINE message fails
      }
    }

    return NextResponse.json({
      success: true,
      registrationId,
      message: 'ลงทะเบียนเรียบร้อยแล้ว',
    });
  } catch (error) {
    console.error('Error registering for event:', error);
    return NextResponse.json({ error: 'ไม่สามารถลงทะเบียนได้ กรุณาลองใหม่' }, { status: 500 });
  }
}
