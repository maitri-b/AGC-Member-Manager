// API Route for Event Registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getMemberById } from '@/lib/google-sheets';
import { getEventRegistrations, addEventRegistration } from '@/lib/event-sheets';
import { EventRegistration, calculateRegistrationFee, Event } from '@/types/event';
import { sendEventRegistrationConfirmation } from '@/lib/line-messaging';
import { calculatePaymentSplit, calculateDepositDeadline, calculateRemainingDeadline } from '@/lib/payment-deadlines';
import { sheetsCache, CacheKeys } from '@/lib/cache/google-sheets-cache';
import { isGuestEligibleForEventRegistration } from '@/lib/permissions';

// Generate a unique 6-character registration ID
function generateRegistrationId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0,O,1,I
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
    const body = await request.json();
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

    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'กิจกรรมนี้ยังไม่พร้อมรับลงทะเบียน' }, { status: 400 });
    }

    // Helper function to check if registration is cancelled
    function isRegistrationCancelled(registration: EventRegistration): boolean {
      const status = registration.status || '';
      const statusLower = status.toLowerCase();
      return statusLower === 'cancelled' || status.includes('ยกเลิก');
    }

    // Get existing registrations to check capacity and duplicates
    let existingRegistrations: EventRegistration[] = [];
    try {
      existingRegistrations = await getEventRegistrations(eventData.sheetName);
    } catch (err) {
      console.error('Error fetching registrations:', err);
    }

    // Filter out cancelled registrations
    const activeRegistrations = existingRegistrations.filter(r => !isRegistrationCancelled(r));

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
      totalFee = attendeeTypeSelections.reduce((sum: number, s: { typeId: string; quantity: number }) => {
        const type = eventData.attendeeTypes.find((t: { typeId: string; price: number }) => t.typeId === s.typeId);
        if (!type) {
          return sum;
        }
        return sum + (type.price * s.quantity);
      }, 0);

      // Validate and calculate room allocation fees (if room types are configured)
      if (eventData.roomTypes && eventData.roomTypes.length > 0) {
        if (!roomAllocations || roomAllocations.length === 0) {
          return NextResponse.json({ error: 'กรุณาเลือกประเภทห้องพัก' }, { status: 400 });
        }

        // Calculate total room capacity and validate
        let totalRoomCapacity = 0;
        let roomFee = 0;
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

        // Add room fees to total
        totalFee += roomFee;
      }
    } else {
      // Original fee calculation (fixed or tiered pricing)
      totalFee = calculateRegistrationFee(eventData as Event, attendeeCount, true); // true = isMember
    }

    // Calculate payment breakdown if deposit mode
    let depositAmount = 0;
    let remainingAmount = totalFee;
    let depositDeadline = '';
    let remainingDeadline = '';
    let paymentStatus = totalFee > 0 ? 'รอชำระเงิน' : 'ลงทะเบียนแล้ว';

    if (eventData.paymentMode === 'deposit' && totalFee > 0) {
      const split = calculatePaymentSplit(totalFee, eventData as Event, attendeeCount);
      depositAmount = split.depositAmount;
      remainingAmount = split.remainingAmount;

      // Calculate deposit deadline
      const registrationDate = new Date().toISOString();
      depositDeadline = calculateDepositDeadline(eventData as Event, registrationDate);

      // Calculate remaining deadline (if configured)
      if (eventData.remainingDeadlineType && eventData.remainingDeadlineType !== 'none') {
        remainingDeadline = calculateRemainingDeadline(eventData as Event, registrationDate);
      }

      paymentStatus = 'รอชำระมัดจำ';
    }

    // Prepare registration data (matching sheet columns)
    // Write to BOTH old and new column names for backward compatibility
    // Use guest info if staff without member, otherwise use member data
    const registrationData = {
      registration_id: registrationId,
      registration_date: new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }),
      company_name: member ? (member.companyNameTH || member.companyNameEN || '') : (guestInfo?.companyName || ''),
      license_number: member ? (member.licenseNumber || '') : (guestInfo?.licenseNumber || ''),
      contact_name: member ? (member.fullNameTH || member.nickname || session.user.name || '') : (guestInfo?.contactName || session.user.name || ''),
      contact_phone: member ? (member.mobile || member.phone || '') : (guestInfo?.phone || ''),
      contact_email: member?.email || '',
      // New format (lowercase)
      line_userid: session.user.id || '',
      memberid: session.user.memberId || '', // Will be empty for staff without member
      // Old format (mixed case) - for backward compatibility
      LINE_userID: session.user.id || '',
      memberID: session.user.memberId || '', // Will be empty for staff without member
      attendee_count: attendeeCount,
      attendee_names: JSON.stringify(attendeeNames.length > 0 ? attendeeNames : [member ? (member.fullNameTH || member.nickname || '') : (guestInfo?.contactName || '')]),
      shirt_count: 0,
      shirt_sizes: '[]',
      event_fee: totalFee,
      shirt_fee: 0,
      total_amount: totalFee,
      slip_url: '',
      // Deposit payment fields (New)
      deposit_amount: depositAmount,
      remaining_amount: remainingAmount,
      deposit_paid: false,
      deposit_paid_date: '',
      deposit_slip_url: '',
      remaining_slip_url: '',
      deposit_deadline: depositDeadline,
      remaining_deadline: remainingDeadline,
      payment_status: paymentStatus,
      // End deposit payment fields
      // Attendee type pricing (New)
      attendee_type_selections: JSON.stringify(attendeeTypeSelections),
      // Room allocation (New)
      room_allocations: JSON.stringify(roomAllocations),
      status: paymentStatus, // Keep for backward compatibility
      verified_by: '',
      verified_date: '',
      client_token: '',
      code_parent: '',
      table_code: '',
      special_requests: specialRequests,
      card_received: '',
      admin_notes: '',
      last_update_info: JSON.stringify({ registered: { by: 'system', at: new Date().toISOString() } }),
      shirt_received: '',
      table_number: '',
      code_split: '',
      checkin_sections: '',
      attendance_type: 'agent',
    };

    // Add to Google Sheet
    await addEventRegistration(eventData.sheetName, registrationData);

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
