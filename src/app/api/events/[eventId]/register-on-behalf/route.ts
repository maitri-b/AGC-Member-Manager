// API Route for Admin-Assisted Event Registration (Register on behalf of members/guests)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission, canManageEvent } from '@/lib/permissions';
import { getMemberById } from '@/lib/google-sheets';
import { getEventRegistrations, addEventRegistration } from '@/lib/event-sheets';
import { EventRegistration, calculateRegistrationFee, Event } from '@/types/event';
import { sendEventRegistrationConfirmationOnBehalf } from '@/lib/line-messaging';
import { calculatePaymentSplit, calculateDepositDeadline, calculateRemainingDeadline } from '@/lib/payment-deadlines';
import { sheetsCache, CacheKeys } from '@/lib/cache/google-sheets-cache';

// Generate a unique 6-character registration ID
function generateRegistrationId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0,O,1,I
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper function to check if registration is cancelled
function isRegistrationCancelled(registration: EventRegistration): boolean {
  const status = registration.status || '';
  const statusLower = status.toLowerCase();
  return statusLower === 'cancelled' || status.includes('ยกเลิก');
}

// POST - Register on behalf of member/guest
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

    // Check permission
    const hasRegisterPermission = hasPermission(session.user.permissions || [], 'events:register-on-behalf');
    if (!hasRegisterPermission) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ลงทะเบียนแทนสมาชิก' }, { status: 403 });
    }

    // For event-co, check if they're assigned to this event
    if (session.user.role === 'event-co') {
      const assignedEventIds = session.user.assignedEventIds || [];
      if (!canManageEvent(session.user.role, assignedEventIds, eventId)) {
        return NextResponse.json({ error: 'คุณไม่ได้รับมอบหมายให้ดูแลกิจกรรมนี้' }, { status: 403 });
      }
    }

    const body = await request.json();
    const {
      targetUserId, // LINE user ID of the person we're registering for
      attendeeCount = 1,
      attendeeNames = [],
      specialRequests = '',
      attendeeTypeSelections = [],
      roomAllocations = [],
    } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: 'กรุณาเลือกผู้ใช้ที่ต้องการลงทะเบียนให้' }, { status: 400 });
    }

    const db = adminDb();

    // Get target user details
    const targetUserDoc = await db.collection('users').doc(targetUserId).get();
    if (!targetUserDoc.exists) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลผู้ใช้' }, { status: 404 });
    }

    const targetUserData = targetUserDoc.data();
    const targetMemberId = targetUserData?.memberId;
    const targetLineUserId = targetUserData?.lineUserId || targetUserId;

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'กิจกรรมนี้ยังไม่พร้อมรับลงทะเบียน' }, { status: 400 });
    }

    // Get member details if target is a member
    let member = null;
    if (targetMemberId) {
      member = await getMemberById(targetMemberId);
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

    // Check if user already registered (and not cancelled)
    const existingReg = activeRegistrations.find(r =>
      r.lineUserId === targetLineUserId ||
      (targetMemberId && r.memberId === targetMemberId)
    );

    if (existingReg) {
      return NextResponse.json({ error: 'ผู้ใช้ท่านนี้ลงทะเบียนกิจกรรมนี้แล้ว' }, { status: 400 });
    }

    // Check capacity (existing attendees + new attendees)
    const currentCount = activeRegistrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);
    if (eventData.maxCapacity > 0 && (currentCount + attendeeCount) > eventData.maxCapacity) {
      return NextResponse.json({
        error: `กิจกรรมนี้เต็มแล้ว (จำนวนคงเหลือ: ${eventData.maxCapacity - currentCount} ที่นั่ง)`,
      }, { status: 400 });
    }

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

        // Calculate total room capacity
        const totalRoomCapacity = roomAllocations.reduce((sum: number, r: { roomTypeId: string; roomCount: number }) => {
          const roomType = eventData.roomTypes.find((rt: { typeId: string; capacity: number }) => rt.typeId === r.roomTypeId);
          if (!roomType) {
            return sum;
          }
          return sum + (roomType.capacity * r.roomCount);
        }, 0);

        // Calculate room fees
        const roomFee = roomAllocations.reduce((sum: number, r: { roomTypeId: string; roomCount: number }) => {
          const roomType = eventData.roomTypes.find((rt: { typeId: string; price: number }) => rt.typeId === r.roomTypeId);
          if (!roomType) {
            return sum;
          }
          return sum + (roomType.price * r.roomCount);
        }, 0);

        // Validate: room capacity must match or exceed attendee count
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
      totalFee = calculateRegistrationFee(eventData as Event, attendeeCount, !!targetMemberId);
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

      paymentStatus = 'รอชำระเงินมัดจำ';
    }

    // Generate unique registration ID
    let registrationId = generateRegistrationId();
    // Ensure uniqueness
    while (activeRegistrations.some(r => r.registrationId === registrationId)) {
      registrationId = generateRegistrationId();
    }

    // Prepare registration data
    const registrationData = {
      registration_id: registrationId,
      registration_date: new Date().toISOString(),
      event_id: eventId,
      company_name: member?.companyNameTH || member?.companyNameEN || '',
      contact_name: targetUserData?.lineDisplayName || member?.fullNameTH || member?.nickname || 'ไม่ระบุชื่อ',
      license_number: member?.licenseNumber || '',
      member_id: targetMemberId || '',
      line_user_id: targetLineUserId,
      attendee_count: attendeeCount,
      attendee_names: JSON.stringify(attendeeNames),
      contact_phone: member?.mobile || member?.phone || '',
      contact_email: member?.email || '',
      event_fee: totalFee,
      shirt_fee: 0,
      total_amount: totalFee,
      slip_url: '',
      // Deposit payment fields
      deposit_amount: depositAmount,
      remaining_amount: remainingAmount,
      deposit_paid: false,
      deposit_paid_date: '',
      deposit_slip_url: '',
      remaining_slip_url: '',
      deposit_deadline: depositDeadline,
      remaining_deadline: remainingDeadline,
      payment_status: paymentStatus,
      // Attendee type pricing
      attendee_type_selections: JSON.stringify(attendeeTypeSelections),
      // Room allocation
      room_allocations: JSON.stringify(roomAllocations),
      status: paymentStatus,
      verified_by: '',
      verified_date: '',
      client_token: '',
      code_parent: '',
      table_code: '',
      special_requests: specialRequests,
      card_received: '',
      admin_notes: `ลงทะเบียนโดย: ${session.user.name || session.user.id} (${session.user.role})`,
      last_update_info: JSON.stringify({
        registered: {
          by: `${session.user.name || session.user.id} (admin-assisted)`,
          at: new Date().toISOString(),
        },
      }),
      shirt_received: '',
      table_number: '',
      code_split: '',
      checkin_sections: '',
      attendance_type: member ? 'agent' : 'guest',
    };

    // Add to Google Sheet
    await addEventRegistration(eventData.sheetName, registrationData);

    // Invalidate caches for this event
    sheetsCache.invalidate(CacheKeys.eventAttendees(eventId));
    sheetsCache.invalidate(`event:${eventId}:registrations`);
    sheetsCache.invalidate(CacheKeys.allEvents());

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
        }
      }
    }

    // Send LINE confirmation message to the registered user
    if (targetLineUserId) {
      try {
        await sendEventRegistrationConfirmationOnBehalf(targetLineUserId, {
          eventName: eventData.eventName || '',
          eventNameEN: eventData.eventNameEN || '',
          eventDate: eventData.eventDate || '',
          location: eventData.location || '',
          registrationId,
          attendeeCount,
          registrationFee: totalFee,
          memberName: targetUserData?.lineDisplayName || member?.fullNameTH || member?.nickname || 'ไม่ระบุชื่อ',
          eventId,
          paymentMode: eventData.paymentMode || 'full',
          depositAmount,
          remainingAmount,
          depositDeadline,
          remainingDeadline,
          registeredBy: session.user.name || session.user.id,
        });
      } catch (lineError) {
        console.error('Failed to send LINE confirmation:', lineError);
        // Don't fail the registration if LINE message fails
      }
    }

    return NextResponse.json({
      success: true,
      registrationId,
      message: 'ลงทะเบียนสำเร็จ',
    });
  } catch (error) {
    console.error('Error in admin-assisted registration:', error);
    return NextResponse.json({ error: 'ไม่สามารถลงทะเบียนได้ กรุณาลองใหม่' }, { status: 500 });
  }
}
