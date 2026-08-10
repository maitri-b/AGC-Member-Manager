import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { Event, EventRegistration, calculateRefundAmount } from '@/types/event';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEventCancellationNotification } from '@/lib/line-messaging';

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const db = adminDb();

    // Get session
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, message: 'กรุณาเข้าสู่ระบบ' },
        { status: 401 }
      );
    }

    // Decode eventId in case it comes URL-encoded
    const eventId = decodeURIComponent(params.eventId);
    const body = await request.json();
    const { registrationId, cancellationReason, isAdmin } = body;

    if (!registrationId) {
      return NextResponse.json(
        { success: false, message: 'ข้อมูลไม่ครบถ้วน' },
        { status: 400 }
      );
    }

    // Get event
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return NextResponse.json(
        { success: false, message: 'ไม่พบกิจกรรมนี้' },
        { status: 404 }
      );
    }

    const event = { eventId: eventDoc.id, ...eventDoc.data() } as Event;

    // Get registration
    const regDoc = await db
      .collection('events')
      .doc(eventId)
      .collection('registrations')
      .doc(registrationId)
      .get();

    if (!regDoc.exists) {
      return NextResponse.json(
        { success: false, message: 'ไม่พบการจองนี้' },
        { status: 404 }
      );
    }

    const registration = { registrationId: regDoc.id, ...regDoc.data() } as EventRegistration;

    // Verify ownership (member can only cancel their own registration, admin can cancel any)
    if (!isAdmin && registration.lineUserId !== session.user.id) {
      return NextResponse.json(
        { success: false, message: 'คุณไม่มีสิทธิ์ยกเลิกการจองนี้' },
        { status: 403 }
      );
    }

    // Check if already cancelled
    if (registration.status?.toLowerCase() === 'cancelled') {
      return NextResponse.json(
        { success: false, message: 'การจองนี้ถูกยกเลิกไปแล้ว' },
        { status: 400 }
      );
    }

    // Calculate refund
    const refundCalculation = calculateRefundAmount(registration, event);

    // Save previous room and carpool info
    const previousRoomInfo = registration.roomAssignments
      ? JSON.stringify(registration.roomAssignments)
      : undefined;

    const previousCarpoolInfo = registration.carpoolId
      ? JSON.stringify({
          carpoolId: registration.carpoolId,
          cancelledAt: new Date().toISOString()
        })
      : undefined;

    // ✅ Create discount to reduce totalAmount and create overpayment
    // This allows the refund option to appear in the upload modal
    // Logic: totalAmount - discount = amount customer should pay after cancellation fee
    //        paidAmount - (totalAmount - discount) = overpayment = refundAmount
    const currentDiscounts = registration.discounts
      ? JSON.parse(registration.discounts)
      : [];

    const refundAmount = refundCalculation.refundAmount;
    if (refundAmount > 0) {
      // Add refund as discount to create overpayment
      currentDiscounts.push({
        discountId: `refund-${Date.now()}`,
        name: `ส่วนลดจากการยกเลิก (${refundCalculation.ruleName})`,
        description: `คืนเงิน ${refundCalculation.refundPercentage}% = ${refundAmount.toLocaleString()} บาท`,
        type: 'fixed',
        value: refundAmount,
        calculatedAmount: refundAmount,
        addedAt: new Date().toISOString(),
        addedBy: isAdmin ? session.user.email || session.user.id : session.user.id,
        reason: 'cancellation_refund',
      });
    }

    // Calculate new totalAmount (reduce by refund amount)
    const currentTotalAmount = registration.totalAmount || 0;
    const newTotalAmount = Math.max(0, currentTotalAmount - refundAmount);

    // Prepare update data
    const updateData: any = {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancelledBy: isAdmin ? session.user.email || session.user.id : session.user.id,
      cancellationMethod: isAdmin ? 'admin' : 'member',
      cancellationReason: cancellationReason || undefined,
      appliedCancellationRule: refundCalculation.appliedRule?.ruleId || undefined,
      refundAmount: refundCalculation.refundAmount,
      refundPercentage: refundCalculation.refundPercentage,
      refundStatus: refundCalculation.refundAmount > 0 ? 'pending' : 'not_applicable',
      previousRoomInfo,
      previousCarpoolInfo,
      updatedAt: new Date().toISOString(),
      // ✅ Update discounts and totalAmount to create overpayment
      discounts: JSON.stringify(currentDiscounts),
      totalAmount: newTotalAmount,
    };

    // Start batch update
    const batch = db.batch();

    // Update registration
    const regRef = db
      .collection('events')
      .doc(eventId)
      .collection('registrations')
      .doc(registrationId);

    batch.update(regRef, updateData);

    // Remove from carpool if exists
    if (registration.carpoolId) {
      const carpoolRef = db
        .collection('events')
        .doc(eventId)
        .collection('carpools')
        .doc(registration.carpoolId);

      const carpoolDoc = await carpoolRef.get();
      if (carpoolDoc.exists) {
        const carpoolData = carpoolDoc.data();
        const updatedMembers = (carpoolData?.members || []).filter(
          (member: any) => member.registrationId !== registrationId
        );

        batch.update(carpoolRef, {
          members: updatedMembers,
          currentCapacity: updatedMembers.length,
          updatedAt: new Date().toISOString(),
        });
      }

      // Remove carpoolId from registration
      batch.update(regRef, { carpoolId: FieldValue.delete() });
    }

    // Remove room assignments
    if (registration.roomAssignments) {
      batch.update(regRef, {
        roomAssignments: FieldValue.delete(),
        roomAllocations: FieldValue.delete()
      });
    }

    // Commit all updates
    await batch.commit();

    // Send LINE notification if member has LINE ID
    if (registration.lineUserId) {
      try {
        // Format event date
        const formatEventDate = (dateStr: string): string => {
          try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('th-TH', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
          } catch {
            return dateStr;
          }
        };

        await sendEventCancellationNotification(registration.lineUserId, {
          eventName: event.eventName,
          eventNameEN: event.eventNameEN,
          eventDate: formatEventDate(event.eventDate),
          registrationId,
          memberName: registration.contactName || 'สมาชิก',
          refundAmount: refundCalculation.refundAmount,
          refundPercentage: refundCalculation.refundPercentage,
          chargeAmount: refundCalculation.chargeAmount,
          cancelledBy: isAdmin ? 'admin' : 'member',
          cancellationReason: cancellationReason,
          appliedRuleName: refundCalculation.ruleName,
        });
      } catch (notificationError) {
        // Log error but don't fail the cancellation
        console.error('Failed to send LINE notification:', notificationError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'ยกเลิกการจองสำเร็จ',
      data: {
        registrationId,
        refundAmount: refundCalculation.refundAmount,
        refundPercentage: refundCalculation.refundPercentage,
        refundStatus: updateData.refundStatus,
      },
    });
  } catch (error) {
    console.error('Error cancelling registration:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการยกเลิกการจอง'
      },
      { status: 500 }
    );
  }
}
