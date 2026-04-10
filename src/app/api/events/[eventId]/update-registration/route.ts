// API Route for Updating Event Registration (Member self-service)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrations, updateEventRegistration } from '@/lib/event-sheets';
import { EventRegistration } from '@/types/event';

// PUT - Update registration (Member can only update their own registration)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.user.memberId) {
      return NextResponse.json({ error: 'กรุณาเชื่อมต่อบัญชีสมาชิกก่อน' }, { status: 400 });
    }

    const { eventId } = await params;
    const body = await request.json();
    const { attendeeCount, attendeeNames, requestNameChange } = body;

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'กิจกรรมนี้ยังไม่พร้อมรับการแก้ไข' }, { status: 400 });
    }

    // Get existing registrations
    let existingRegistrations: EventRegistration[] = [];
    try {
      existingRegistrations = await getEventRegistrations(eventData.sheetName);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      return NextResponse.json({ error: 'ไม่สามารถโหลดข้อมูลได้' }, { status: 500 });
    }

    // Find user's registration
    const userReg = existingRegistrations.find(r => {
      const regData = r as unknown as Record<string, unknown>;
      return (
        (session.user.id && regData.LINE_userID === session.user.id) ||
        (session.user.memberId && regData.memberID === session.user.memberId)
      );
    });

    if (!userReg) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลการลงทะเบียนของคุณ' }, { status: 404 });
    }

    // Parse current attendee names
    let currentAttendeeNames: string[] = [];
    try {
      currentAttendeeNames = JSON.parse(userReg.attendeeNames || '[]');
      if (!Array.isArray(currentAttendeeNames)) {
        currentAttendeeNames = [userReg.attendeeNames];
      }
    } catch {
      currentAttendeeNames = [userReg.attendeeNames || ''];
    }

    // Check if trying to change attendee count
    if (attendeeCount !== undefined && attendeeCount !== userReg.attendeeCount) {
      // Validate against maxCapacity
      if (eventData.maxCapacity > 0) {
        const currentTotal = existingRegistrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);
        const difference = attendeeCount - userReg.attendeeCount;
        const newTotal = currentTotal + difference;

        if (newTotal > eventData.maxCapacity) {
          return NextResponse.json({ error: 'ไม่สามารถเพิ่มจำนวนผู้เข้าร่วมได้ เนื่องจากจำนวนที่รับสมัครเต็มแล้ว' }, { status: 400 });
        }
      }

      // Validate against maxPerCompany
      if (eventData.maxPerCompany > 0 && attendeeCount > eventData.maxPerCompany) {
        return NextResponse.json({
          error: `ไม่สามารถเพิ่มจำนวนผู้เข้าร่วมได้ เนื่องจากจำกัด ${eventData.maxPerCompany} คนต่อ 1 บริษัท`
        }, { status: 400 });
      }
    }

    // Check if requesting name change
    if (requestNameChange) {
      // Create a change request in Firebase (if change request system exists)
      // For now, we'll just log it and notify admin
      const changeRequestData = {
        type: 'event_registration_name_change',
        eventId,
        eventName: eventData.eventName,
        registrationId: userReg.registrationId,
        memberId: session.user.memberId,
        currentNames: currentAttendeeNames,
        requestedNames: attendeeNames,
        status: 'pending',
        createdAt: new Date().toISOString(),
        createdBy: session.user.id,
      };

      await db.collection('changeRequests').add(changeRequestData);

      return NextResponse.json({
        success: true,
        message: 'ส่งคำร้องขอแก้ไขชื่อเรียบร้อยแล้ว รอการอนุมัติจากเจ้าหน้าที่',
        requiresApproval: true,
      });
    }

    // If just updating attendee count (not changing names)
    const updateData: Record<string, unknown> = {};

    if (attendeeCount !== undefined && attendeeCount !== userReg.attendeeCount) {
      updateData.attendee_count = attendeeCount;

      // Adjust attendee names array if needed
      const newNames = [...currentAttendeeNames];
      if (attendeeCount > newNames.length) {
        while (newNames.length < attendeeCount) {
          newNames.push('');
        }
      } else {
        newNames.length = attendeeCount;
      }
      updateData.attendee_names = JSON.stringify(newNames);

      // Update total amount if there's a fee
      if (eventData.registrationFee > 0) {
        updateData.event_fee = eventData.registrationFee;
        updateData.total_amount = eventData.registrationFee * attendeeCount;
      }
    }

    if (Object.keys(updateData).length > 0) {
      updateData.last_update_info = JSON.stringify({
        ...JSON.parse(userReg.lastUpdateInfo || '{}'),
        updated: { by: 'member', at: new Date().toISOString() },
      });

      await updateEventRegistration(eventData.sheetName, userReg.registrationId, updateData);

      return NextResponse.json({
        success: true,
        message: 'อัพเดทข้อมูลเรียบร้อยแล้ว',
      });
    }

    return NextResponse.json({ error: 'ไม่มีข้อมูลที่ต้องอัพเดท' }, { status: 400 });
  } catch (error) {
    console.error('Error updating registration:', error);
    return NextResponse.json({ error: 'ไม่สามารถอัพเดทข้อมูลได้ กรุณาลองใหม่' }, { status: 500 });
  }
}
