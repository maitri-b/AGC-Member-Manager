// API Route for Admin to Update Event Registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { updateEventRegistrationInFirestore, getEventRegistrationsByEventId, autoRebuildAttendanceCache } from '@/lib/event-sheets';
import { hasPermission, canManageEvent } from '@/lib/permissions';
import { Event, AttendeeType, RoomType, calculateRegistrationFee } from '@/types/event';
import { calculatePaymentSplit } from '@/lib/payment-deadlines';
import { logRegistrationUpdate, logRegistrationCancellation } from '@/lib/activity-log';
import { isFullyPaid, parseAdditionalPayments, recalculatePaymentStatus } from '@/lib/payment-status';

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

    // ✅ NEW: Validate room capacity before updating room assignments
    if (updateData.room_assignments) {
      try {
        const roomAssignments = typeof updateData.room_assignments === 'string'
          ? JSON.parse(updateData.room_assignments)
          : updateData.room_assignments;

        if (Array.isArray(roomAssignments) && roomAssignments.length > 0) {
          // Get all rooms for this event
          const db = adminDb();
          const roomsSnapshot = await db.collection('eventRooms')
            .where('eventId', '==', eventId)
            .get();

          const roomsMap: Record<string, { maxOccupancy: number; buildingName: string; roomNumber: string }> = {};
          roomsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            roomsMap[doc.id] = {
              maxOccupancy: data.maxOccupancy || 0,
              buildingName: data.buildingName || '',
              roomNumber: data.roomNumber || '',
            };
          });

          // Get all registrations to calculate current occupancy
          const allRegistrations = await getEventRegistrationsByEventId(eventId);

          // Calculate occupancy per room (excluding current registration)
          const occupancyMap: Record<string, number> = {};
          for (const reg of allRegistrations) {
            // Skip current registration being updated
            if (reg.registrationId === registrationId) continue;
            // Skip cancelled registrations
            if (reg.status === 'ยกเลิก') continue;

            try {
              if (reg.roomAssignments) {
                const assignments = JSON.parse(reg.roomAssignments);
                if (Array.isArray(assignments)) {
                  assignments.forEach((assignment: { roomId: string }) => {
                    if (assignment.roomId) {
                      occupancyMap[assignment.roomId] = (occupancyMap[assignment.roomId] || 0) + 1;
                    }
                  });
                }
              }
            } catch (e) {
              // Ignore parse errors
            }
          }

          // Count new assignments per room
          const newAssignmentsPerRoom: Record<string, number> = {};
          roomAssignments.forEach((assignment: { roomId: string }) => {
            if (assignment.roomId) {
              newAssignmentsPerRoom[assignment.roomId] = (newAssignmentsPerRoom[assignment.roomId] || 0) + 1;
            }
          });

          // Validate each room capacity
          for (const [roomId, newCount] of Object.entries(newAssignmentsPerRoom)) {
            const room = roomsMap[roomId];
            if (!room) {
              return NextResponse.json({
                error: `ไม่พบห้อง ${roomId}`
              }, { status: 404 });
            }

            const currentOccupancy = occupancyMap[roomId] || 0;
            const totalAfterUpdate = currentOccupancy + newCount;

            if (totalAfterUpdate > room.maxOccupancy) {
              return NextResponse.json({
                error: `ห้อง ${room.buildingName}-${room.roomNumber} เต็มแล้ว (${currentOccupancy}/${room.maxOccupancy} คน) ไม่สามารถเพิ่มอีก ${newCount} คนได้`
              }, { status: 409 }); // 409 Conflict
            }
          }
        }
      } catch (e) {
        console.error('Error validating room assignments:', e);
        return NextResponse.json({ error: 'รูปแบบข้อมูล room_assignments ไม่ถูกต้อง' }, { status: 400 });
      }
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    // ✅ Removed sheetName dependency - all events use Firestore now

    // Get current registration data to retrieve existing special charges
    const registrations = await getEventRegistrationsByEventId(eventId);
    const currentRegistration = registrations.find(r => r.registrationId === registrationId);

    if (!currentRegistration) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลการลงทะเบียน' }, { status: 404 });
    }

    // Recalculate eventFee based on pricing type
    let calculatedEventFee = currentRegistration.eventFee || 0;
    let calculatedRoomFee = currentRegistration.roomFee || 0;
    let shouldRecalculate = false;

    // Determine if we need to recalculate
    if (eventData?.useAttendeeTypePricing) {
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
      if (eventData?.useAttendeeTypePricing) {
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
        if (eventData?.attendeeTypes) {
          calculatedEventFee = attendeeTypeSelections.reduce((sum: number, s: { typeId: string; quantity: number }) => {
            const type = eventData?.attendeeTypes?.find((t: AttendeeType) => t.typeId === s.typeId);
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

      // ✅ FIX: Calculate room fees separately (for all pricing types)
      // Use updated room allocations if provided, otherwise use existing
      calculatedRoomFee = 0; // Reset room fee
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

      if (eventData?.roomTypes && eventData.roomTypes.length > 0 && roomAllocations.length > 0) {
        calculatedRoomFee = roomAllocations.reduce((sum: number, alloc: { roomTypeId: string; roomCount: number }) => {
          const roomType = eventData?.roomTypes?.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
          if (!roomType) return sum;
          return sum + (roomType.price * alloc.roomCount);
        }, 0);
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

    // Parse discounts
    let discountsTotal = 0;
    try {
      if (currentRegistration.discounts) {
        const discounts = JSON.parse(currentRegistration.discounts);
        discountsTotal = discounts.reduce((sum: number, d: { calculatedAmount: number }) => sum + d.calculatedAmount, 0);
      }
    } catch (e) {
      console.error('Error parsing discounts:', e);
    }

    const newTotalAmount = Math.max(0, calculatedEventFee + calculatedRoomFee + specialChargesTotal - discountsTotal);

    // Prepare update data with admin info
    const finalUpdateData: Record<string, unknown> = {
      ...updateData,
    };

    // Only update eventFee, roomFee, and totalAmount if they were recalculated
    if (shouldRecalculate) {
      finalUpdateData.event_fee = calculatedEventFee;
      finalUpdateData.room_fee = calculatedRoomFee;
      finalUpdateData.total_amount = newTotalAmount;

      // Recalculate deposit and remaining amounts if event uses deposit payment mode
      if (eventData?.paymentMode === 'deposit' && newTotalAmount > 0) {
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
          // ✅ FIX: If deposit already paid, use ACTUAL paid amount to calculate remaining
          // Get the actual amount paid (depositAmountPaid), fallback to depositAmount if not recorded
          const actualDepositPaid = (currentRegistration as any).depositAmountPaid || currentRegistration.depositAmount || 0;
          finalUpdateData.remaining_amount = newTotalAmount - actualDepositPaid;

          // Keep depositAmount unchanged (it reflects what was originally expected)
          // The difference between depositAmount and depositAmountPaid is tracked separately
        }
      }

      // ✅ RECALCULATE PAYMENT STATUS when totalAmount changes
      // Calculate actual total paid from tracked amounts
      const depositAmountPaid = (currentRegistration as any).depositAmountPaid || 0;
      const remainingAmountPaid = (currentRegistration as any).remainingAmountPaid || 0;
      const fullPaymentAmountPaid = (currentRegistration as any).fullPaymentAmountPaid || 0;

      // ✅ PRESERVE payment amount fields so they don't get lost on update
      // These fields track actual amounts paid and must be preserved
      if (depositAmountPaid > 0) {
        finalUpdateData.deposit_amount_paid = depositAmountPaid;
      }
      if (remainingAmountPaid > 0) {
        finalUpdateData.remaining_amount_paid = remainingAmountPaid;
      }
      if (fullPaymentAmountPaid > 0) {
        finalUpdateData.full_payment_amount_paid = fullPaymentAmountPaid;
      }

      // ✅ CRITICAL: Get approved payment slips total for accurate payment status calculation
      const { getPaymentSlipsByRegistration } = await import('@/lib/payment-slips');
      const slips = await getPaymentSlipsByRegistration(registrationId);
      const approvedSlipsTotal = slips
        .filter(slip => slip.status === 'approved')
        .reduce((sum, slip) => sum + (slip.amount || 0), 0);

      // ✅ Use recalculatePaymentStatus for consistency with slip approval and charges/discounts
      const paymentStatusUpdate = recalculatePaymentStatus(
        currentRegistration,
        newTotalAmount,
        eventData?.paymentMode || 'full',
        approvedSlipsTotal
      );

      finalUpdateData.payment_status = paymentStatusUpdate.payment_status;
      if (paymentStatusUpdate.status) {
        finalUpdateData.status = paymentStatusUpdate.status;
      }

      // ✅ Store overpayment amount
      if (paymentStatusUpdate.overpayment_amount !== undefined) {
        finalUpdateData.overpayment_amount = paymentStatusUpdate.overpayment_amount;
      }

      console.log('[Admin Update] Payment status recalculated:', {
        oldTotal: currentRegistration.totalAmount,
        newTotal: newTotalAmount,
        oldPaymentStatus: currentRegistration.paymentStatus,
        newPaymentStatus: finalUpdateData.payment_status,
        oldStatus: currentRegistration.status,
        newStatus: finalUpdateData.status,
        overpaymentAmount: finalUpdateData.overpayment_amount,
      });
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
      calculatedRoomFee,
      specialChargesTotal,
      newTotalAmount,
      finalUpdateData,
    });

    // Convert to Firestore format and update
    const firestoreUpdateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(finalUpdateData)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      firestoreUpdateData[camelKey] = value;
    }
    await updateEventRegistrationInFirestore(registrationId, firestoreUpdateData);

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

    // Auto-rebuild attendance cache if status changed to confirmed/attended
    if (finalUpdateData.status) {
      const newStatus = String(finalUpdateData.status).toLowerCase();
      const oldStatus = String(currentRegistration.status || '').toLowerCase();

      if (newStatus !== oldStatus &&
          (newStatus === 'confirmed' || newStatus === 'attended' ||
           String(finalUpdateData.status).includes('ยืนยัน') ||
           String(finalUpdateData.status).includes('ตรวจสอบแล้ว'))) {
        // Rebuild cache in background (don't await to avoid blocking response)
        autoRebuildAttendanceCache().catch(err =>
          console.error('[Attendance Cache] Auto-rebuild failed:', err)
        );
      }
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

    // ✅ Removed sheetName dependency - all events use Firestore now

    // ✅ Update status to 'ยกเลิก' (cancelled) instead of deleting
    // This ensures cancelled registrations are excluded from payment summaries and reports
    const updateData: Record<string, unknown> = {
      status: 'ยกเลิก', // Use Thai text to match system convention
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

    // Convert to Firestore format and update
    const firestoreCancelData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updateData)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      firestoreCancelData[camelKey] = value;
    }
    await updateEventRegistrationInFirestore(registrationId, firestoreCancelData);

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

    // Auto-rebuild attendance cache after cancellation
    // (cancellation affects attendance count)
    autoRebuildAttendanceCache().catch(err =>
      console.error('[Attendance Cache] Auto-rebuild after cancellation failed:', err)
    );

    return NextResponse.json({
      success: true,
      message: 'ยกเลิกการลงทะเบียนเรียบร้อยแล้ว',
    });
  } catch (error) {
    console.error('Error cancelling registration (admin):', error);
    return NextResponse.json({ error: 'ไม่สามารถยกเลิกได้ กรุณาลองใหม่' }, { status: 500 });
  }
}
