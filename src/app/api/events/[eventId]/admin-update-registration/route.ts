// API Route for Admin to Update Event Registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { updateEventRegistration, getEventRegistrations } from '@/lib/event-sheets';
import { hasPermission, canManageEvent } from '@/lib/permissions';
import { Event, AttendeeType, RoomType, calculateRegistrationFee } from '@/types/event';
import { calculatePaymentSplit } from '@/lib/payment-deadlines';
import { logRegistrationUpdate, logRegistrationCancellation } from '@/lib/activity-log';

// PUT - Admin update registration
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    // Check permissions: either has full access OR can manage assigned event
    const hasFullAccess = hasPermission(session.user.permissions, 'members:list') ||
                          hasPermission(session.user.permissions, 'admin:access');
    const canManageAssigned = hasPermission(session.user.permissions, 'events:manage-assigned');

    if (!hasFullAccess && !canManageAssigned) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ในการแก้ไข' }, { status: 403 });
    }

    // Verify assignment for event-staff/event-co
    if (!hasFullAccess && canManageAssigned) {
      const userRole = session.user.role;
      const assignedEventIds = session.user.assignedEventIds || [];

      if (!canManageEvent(userRole, assignedEventIds, eventId)) {
        return NextResponse.json({ error: 'Not assigned to this event' }, { status: 403 });
      }
    }
    const body = await request.json();
    const { registrationId, updateData } = body;

    if (!registrationId) {
      return NextResponse.json({ error: 'กรุณาระบุ registrationId' }, { status: 400 });
    }

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

    // Get current registration data to retrieve existing special charges
    const registrations = await getEventRegistrations(eventData.sheetName);
    const currentRegistration = registrations.find(r => r.registrationId === registrationId);

    if (!currentRegistration) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลการลงทะเบียน' }, { status: 404 });
    }

    // Recalculate eventFee based on pricing type
    let calculatedEventFee = currentRegistration.eventFee || 0;
    let shouldRecalculate = false;

    // Determine if we need to recalculate
    if (eventData.useAttendeeTypePricing) {
      // Attendee Type Pricing: recalculate if attendee_type_selections is provided
      shouldRecalculate = updateData.attendee_type_selections !== undefined;
    } else {
      // Fixed or Tiered Pricing: recalculate if attendee_count changes
      shouldRecalculate = updateData.attendee_count !== undefined && updateData.attendee_count !== currentRegistration.attendeeCount;
    }

    // Also recalculate if room allocations changed (applies to all pricing types)
    if (updateData.room_allocations !== undefined) {
      shouldRecalculate = true;
    }

    if (shouldRecalculate) {
      if (eventData.useAttendeeTypePricing) {
        // Attendee Type Pricing
        let attendeeTypeSelections = [];
        try {
          attendeeTypeSelections = typeof updateData.attendee_type_selections === 'string'
            ? JSON.parse(updateData.attendee_type_selections)
            : updateData.attendee_type_selections;
        } catch (e) {
          return NextResponse.json({ error: 'รูปแบบข้อมูล attendee_type_selections ไม่ถูกต้อง' }, { status: 400 });
        }

        // Calculate event fee from attendee types
        if (eventData.attendeeTypes) {
          calculatedEventFee = attendeeTypeSelections.reduce((sum: number, s: { typeId: string; quantity: number }) => {
            const type = eventData.attendeeTypes.find((t: AttendeeType) => t.typeId === s.typeId);
            if (!type) return sum;
            return sum + (type.price * s.quantity);
          }, 0);
        }
      } else {
        // Fixed or Tiered Pricing: use calculateRegistrationFee function
        const newAttendeeCount = updateData.attendee_count;
        // Check if this is a member registration (assume true for existing registrations with licenseNumber)
        const isMember = !!currentRegistration.licenseNumber;
        calculatedEventFee = calculateRegistrationFee(eventData as Event, newAttendeeCount, isMember);
      }

      // Add room fees (for all pricing types)
      // Use updated room allocations if provided, otherwise use existing
      let roomAllocations = [];
      if (updateData.room_allocations !== undefined) {
        try {
          roomAllocations = typeof updateData.room_allocations === 'string'
            ? JSON.parse(updateData.room_allocations)
            : updateData.room_allocations;
        } catch (e) {
          return NextResponse.json({ error: 'รูปแบบข้อมูล room_allocations ไม่ถูกต้อง' }, { status: 400 });
        }
      } else if (currentRegistration.roomAllocations) {
        try {
          roomAllocations = JSON.parse(currentRegistration.roomAllocations);
        } catch (e) {
          console.error('Error parsing existing room allocations:', e);
        }
      }

      if (eventData.roomTypes && eventData.roomTypes.length > 0 && roomAllocations.length > 0) {
        const roomFee = roomAllocations.reduce((sum: number, alloc: { roomTypeId: string; roomCount: number }) => {
          const roomType = eventData.roomTypes.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
          if (!roomType) return sum;
          return sum + (roomType.price * alloc.roomCount);
        }, 0);
        calculatedEventFee += roomFee;
      }
    }

    // Calculate total amount including special charges
    let specialChargesTotal = 0;
    try {
      if (currentRegistration.specialCharges) {
        const specialCharges = JSON.parse(currentRegistration.specialCharges);
        specialChargesTotal = specialCharges.reduce((sum: number, charge: { amount: number }) => sum + charge.amount, 0);
      }
    } catch (e) {
      console.error('Error parsing special charges:', e);
    }

    const newTotalAmount = calculatedEventFee + specialChargesTotal;

    // Prepare update data with admin info
    const finalUpdateData: Record<string, unknown> = {
      ...updateData,
    };

    // Only update eventFee and totalAmount if they were recalculated
    if (shouldRecalculate) {
      finalUpdateData.event_fee = calculatedEventFee;
      finalUpdateData.total_amount = newTotalAmount;

      // Recalculate deposit and remaining amounts if event uses deposit payment mode
      if (eventData.paymentMode === 'deposit' && newTotalAmount > 0) {
        // Get updated attendee count (use updated value if provided, otherwise use current)
        const updatedAttendeeCount = updateData.attendee_count !== undefined
          ? updateData.attendee_count
          : currentRegistration.attendeeCount || 1;

        // Recalculate deposit split based on new total amount
        const split = calculatePaymentSplit(newTotalAmount, eventData as Event, updatedAttendeeCount);

        // Only update deposit amounts if deposit hasn't been paid yet
        if (!currentRegistration.depositPaid) {
          finalUpdateData.deposit_amount = split.depositAmount;
          finalUpdateData.remaining_amount = split.remainingAmount;
        } else {
          // If deposit already paid, keep the paid deposit amount and recalculate remaining
          const paidDeposit = currentRegistration.depositAmount || 0;
          finalUpdateData.remaining_amount = newTotalAmount - paidDeposit;
        }
      }
    }

    // Add admin update info
    finalUpdateData.last_update_info = JSON.stringify({
      updated: {
        by: 'admin',
        userId: session.user.id,
        userName: session.user.name,
        at: new Date().toISOString(),
      },
    });

    console.log('[Admin Update Registration] Update data:', {
      registrationId,
      calculatedEventFee,
      specialChargesTotal,
      newTotalAmount,
      finalUpdateData,
    });

    // Update in Google Sheets
    await updateEventRegistration(eventData.sheetName, registrationId, finalUpdateData);

    // Log the activity
    try {
      await logRegistrationUpdate({
        eventId,
        registrationId,
        userId: session.user.id,
        userName: session.user.name || 'Admin',
        userRole: session.user.role || 'admin',
        oldData: currentRegistration,
        newData: finalUpdateData,
        notes: 'Admin updated registration details',
      });
    } catch (logError) {
      console.error('[Activity Log] Failed to log update:', logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      message: 'อัพเดทข้อมูลเรียบร้อยแล้ว',
      calculatedEventFee,
      newTotalAmount,
    });
  } catch (error) {
    console.error('Error updating registration (admin):', error);
    return NextResponse.json({ error: 'ไม่สามารถอัพเดทข้อมูลได้ กรุณาลองใหม่' }, { status: 500 });
  }
}

// DELETE - Admin cancel/delete registration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    // Check permissions: either has full access OR can manage assigned event
    const hasFullAccess = hasPermission(session.user.permissions, 'members:list') ||
                          hasPermission(session.user.permissions, 'admin:access');
    const canManageAssigned = hasPermission(session.user.permissions, 'events:manage-assigned');

    if (!hasFullAccess && !canManageAssigned) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ในการยกเลิก' }, { status: 403 });
    }

    // Verify assignment for event-staff/event-co
    if (!hasFullAccess && canManageAssigned) {
      const userRole = session.user.role;
      const assignedEventIds = session.user.assignedEventIds || [];

      if (!canManageEvent(userRole, assignedEventIds, eventId)) {
        return NextResponse.json({ error: 'Not assigned to this event' }, { status: 403 });
      }
    }
    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');

    if (!registrationId) {
      return NextResponse.json({ error: 'กรุณาระบุ registrationId' }, { status: 400 });
    }

    // Get cancellation reason from request body
    const body = await request.json();
    const { cancellationReason } = body;

    if (!cancellationReason || !cancellationReason.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุสาเหตุการยกเลิก' }, { status: 400 });
    }

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

    // Update status to 'cancelled' instead of deleting
    const updateData: Record<string, unknown> = {
      status: 'cancelled',
      cancellation_reason: cancellationReason,
      cancelled_at: new Date().toISOString(),
      last_update_info: JSON.stringify({
        cancelled: {
          by: 'admin',
          userId: session.user.id,
          userName: session.user.name,
          at: new Date().toISOString(),
          reason: cancellationReason,
        },
      }),
    };

    await updateEventRegistration(eventData.sheetName, registrationId, updateData);

    // Log the cancellation activity
    try {
      await logRegistrationCancellation({
        eventId,
        registrationId,
        userId: session.user.id,
        userName: session.user.name || 'Admin',
        userRole: session.user.role || 'admin',
        reason: cancellationReason,
      });
    } catch (logError) {
      console.error('[Activity Log] Failed to log cancellation:', logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({
      success: true,
      message: 'ยกเลิกการลงทะเบียนเรียบร้อยแล้ว',
    });
  } catch (error) {
    console.error('Error cancelling registration (admin):', error);
    return NextResponse.json({ error: 'ไม่สามารถยกเลิกได้ กรุณาลองใหม่' }, { status: 500 });
  }
}
