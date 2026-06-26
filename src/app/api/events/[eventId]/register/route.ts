// API Route for Event Registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getMemberById } from '@/lib/google-sheets';
import { getEventRegistrations, addEventRegistration } from '@/lib/event-sheets';
import { EventRegistration, calculateRegistrationFee, Event } from '@/types/event';
import { sendEventRegistrationConfirmation } from '@/lib/line-messaging';
import { calculatePaymentSplit, calculateDepositDeadline } from '@/lib/payment-deadlines';

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

    if (!session.user.memberId) {
      return NextResponse.json({ error: 'กรุณาเชื่อมต่อบัญชีสมาชิกก่อนลงทะเบียน' }, { status: 400 });
    }

    const { eventId } = await params;
    const body = await request.json();
    const { attendeeCount = 1, attendeeNames = [], specialRequests = '' } = body;

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

    // Get member details
    const member = await getMemberById(session.user.memberId);
    if (!member) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลสมาชิก' }, { status: 404 });
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
    const companyAlreadyRegistered = activeRegistrations.find(r => {
      const regData = r as unknown as Record<string, unknown>;
      // Check by license number (1 company = 1 license = 1 registration)
      return member.licenseNumber && regData.license_number === member.licenseNumber;
    });

    if (companyAlreadyRegistered) {
      return NextResponse.json({
        error: 'บริษัทของคุณลงทะเบียนกิจกรรมนี้แล้ว หากต้องการเพิ่ม/ลดจำนวนผู้เข้าร่วม กรุณาใช้ปุ่มแก้ไขข้อมูลการลงทะเบียน'
      }, { status: 400 });
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
      if (currentCount + attendeeCount > eventData.maxCapacity) {
        return NextResponse.json({ error: 'กิจกรรมนี้รับสมัครเต็มแล้ว' }, { status: 400 });
      }
    }

    // Generate registration ID
    const registrationId = generateRegistrationId();

    // Calculate registration fee using tiered pricing if applicable
    const totalFee = calculateRegistrationFee(eventData as Event, attendeeCount, true); // true = isMember

    // Calculate payment breakdown if deposit mode
    let depositAmount = 0;
    let remainingAmount = totalFee;
    let depositDeadline = '';
    let paymentStatus = totalFee > 0 ? 'รอชำระเงิน' : 'ลงทะเบียนแล้ว';

    if (eventData.paymentMode === 'deposit' && totalFee > 0) {
      const split = calculatePaymentSplit(totalFee, eventData as Event, attendeeCount);
      depositAmount = split.depositAmount;
      remainingAmount = split.remainingAmount;

      // Calculate deposit deadline
      const registrationDate = new Date().toISOString();
      depositDeadline = calculateDepositDeadline(eventData as Event, registrationDate);

      paymentStatus = 'รอชำระมัดจำ';
    }

    // Prepare registration data (matching sheet columns)
    // Write to BOTH old and new column names for backward compatibility
    const registrationData = {
      registration_id: registrationId,
      registration_date: new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }),
      company_name: member.companyNameTH || member.companyNameEN || '',
      license_number: member.licenseNumber || '',
      contact_name: member.fullNameTH || member.nickname || session.user.name || '',
      contact_phone: member.mobile || member.phone || '',
      contact_email: member.email || '',
      // New format (lowercase)
      line_userid: session.user.id || '',
      memberid: session.user.memberId || '',
      // Old format (mixed case) - for backward compatibility
      LINE_userID: session.user.id || '',
      memberID: session.user.memberId || '',
      attendee_count: attendeeCount,
      attendee_names: JSON.stringify(attendeeNames.length > 0 ? attendeeNames : [member.fullNameTH || member.nickname || '']),
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
      remaining_deadline: '',
      payment_status: paymentStatus,
      // End deposit payment fields
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

    // Send LINE confirmation message
    if (session.user.id) {
      try {
        await sendEventRegistrationConfirmation(session.user.id, {
          eventName: eventData.eventName || '',
          eventNameEN: eventData.eventNameEN || '',
          eventDate: eventData.eventDate || '',
          location: eventData.location || '',
          registrationId,
          attendeeCount,
          registrationFee: totalFee,
          memberName: member.fullNameTH || member.nickname || '',
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
