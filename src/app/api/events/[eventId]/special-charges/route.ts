// API Route for Managing Special Charges (Admin only)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrationsByEventId, updateEventRegistrationInFirestore } from '@/lib/event-sheets';
import { SpecialCharge, Discount } from '@/types/event';
import { hasPermission, canManageEvent } from '@/lib/permissions';
import { recalculatePaymentStatus } from '@/lib/payment-status';
import { getPendingSlipsInfo } from '@/lib/payment-slips';

// POST - Add special charge to a registration
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

    // Check permissions: either has full access OR can manage assigned event
    const hasFullAccess = hasPermission(session.user.permissions || [], 'admin:access') ||
                          hasPermission(session.user.permissions || [], 'members:list');
    const canManageAssigned = hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!hasFullAccess && !canManageAssigned) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
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
    const { registrationId, description, amount, ignorePendingSlips } = body;

    if (!registrationId || !description || !amount) {
      return NextResponse.json({
        error: 'Missing required fields: registrationId, description, amount'
      }, { status: 400 });
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'Event sheet not configured' }, { status: 400 });
    }

    // Get existing registrations
    let existingRegistrations;
    try {
      existingRegistrations = await getEventRegistrationsByEventId(eventId);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      return NextResponse.json({ error: 'Failed to load registration data' }, { status: 500 });
    }

    // Find the registration
    const registration = existingRegistrations.find(r => r.registrationId === registrationId);

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    // ✅ VALIDATION: Check for pending payment slips (unless explicitly ignored)
    if (!ignorePendingSlips) {
      const pendingInfo = await getPendingSlipsInfo(registrationId);
      if (pendingInfo.hasPending) {
        return NextResponse.json({
          error: 'ไม่สามารถเพิ่มค่าใช้จ่ายเสริมได้ในขณะนี้',
          details: `พบสลิปการชำระเงิน ${pendingInfo.count} รายการที่รอการอนุมัติ\n\nกรุณาอนุมัติหรือปฏิเสธสลิปที่รออนุมัติทั้งหมดก่อน จึงจะสามารถเพิ่มค่าใช้จ่ายเสริมได้\n\nเหตุผล: การอนุมัติสลิปจะส่งผลต่อยอดเงินที่ชำระแล้ว ซึ่งต้องคำนวณใหม่ก่อนปรับยอดรวมทั้งหมด`,
          hasPendingSlips: true,
          pendingSlipsCount: pendingInfo.count
        }, { status: 400 });
      }
    }

    // Parse existing special charges
    let specialCharges: SpecialCharge[] = [];
    try {
      if (registration.specialCharges) {
        specialCharges = JSON.parse(registration.specialCharges);
      }
    } catch (e) {
      console.error('Error parsing special charges:', e);
    }

    // Create new charge
    const newCharge: SpecialCharge = {
      chargeId: `SC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description,
      amount: parseFloat(amount),
      addedBy: session.user.id,
      addedAt: new Date().toISOString(),
    };

    specialCharges.push(newCharge);

    // Parse existing discounts
    let discounts: Discount[] = [];
    try {
      if (registration.discounts) {
        discounts = JSON.parse(registration.discounts);
      }
    } catch (e) {
      console.error('Error parsing discounts:', e);
    }

    // Calculate new total amount
    // ✅ FIXED: Include both eventFee AND roomFee in base calculation
    // eventFee = base event fee (from attendee types or tiered pricing)
    // roomFee = room allocation fees
    // totalAmount = eventFee + roomFee + special charges - discounts
    const eventFee = registration.eventFee || 0;
    const roomFee = (registration as any).roomFee || 0;
    const chargesTotal = specialCharges.reduce((sum, charge) => sum + charge.amount, 0);
    const discountsTotal = discounts.reduce((sum, d) => sum + d.calculatedAmount, 0);
    const newTotalAmount = Math.max(0, eventFee + roomFee + chargesTotal - discountsTotal);

    console.log('[Special Charges] Total calculation:', {
      eventFee,
      roomFee,
      chargesTotal,
      discountsTotal,
      newTotalAmount,
    });

    // Prepare update data
    const updateData: Record<string, unknown> = {
      special_charges: JSON.stringify(specialCharges),
      total_amount: newTotalAmount,
    };

    // Recalculate deposit and remaining amounts if in deposit mode
    if (registration.depositAmount && registration.depositAmount > 0) {
      // Keep the same deposit amount, adjust remaining
      const newRemainingAmount = newTotalAmount - registration.depositAmount;
      updateData.remaining_amount = newRemainingAmount;
    }

    // ✅ CRITICAL: Get approved payment slips total for accurate payment status calculation
    const { getPaymentSlipsByRegistration } = await import('@/lib/payment-slips');
    const slips = await getPaymentSlipsByRegistration(registration.registrationId);
    const approvedSlipsTotal = slips
      .filter(slip => slip.status === 'approved')
      .reduce((sum, slip) => sum + (slip.amount || 0), 0);

    // ✅ CRITICAL: Recalculate payment status when totalAmount changes
    const paymentStatusUpdate = recalculatePaymentStatus(registration, newTotalAmount, eventData.paymentMode || 'full', approvedSlipsTotal);
    updateData.payment_status = paymentStatusUpdate.payment_status;
    if (paymentStatusUpdate.status) {
      updateData.status = paymentStatusUpdate.status;
    }
    // ✅ Store overpayment amount
    if (paymentStatusUpdate.overpayment_amount !== undefined) {
      updateData.overpayment_amount = paymentStatusUpdate.overpayment_amount;
    }

    console.log('[Special Charges] Payment status recalculated:', {
      oldTotal: registration.totalAmount,
      newTotal: newTotalAmount,
      oldPaymentStatus: registration.paymentStatus,
      newPaymentStatus: updateData.payment_status,
      oldStatus: registration.status,
      newStatus: updateData.status,
      overpaymentAmount: paymentStatusUpdate.overpayment_amount,
      paidAmount: approvedSlipsTotal,
    });

    // Update admin notes
    const currentNotes = registration.adminNotes || '';
    const chargeNote = `\n[${new Date().toLocaleDateString('th-TH')}] Admin เพิ่มค่าใช้จ่ายเสริม: ${description} - ${amount.toLocaleString()} บาท (โดย ${session.user.name || session.user.email})`;
    updateData.admin_notes = currentNotes + chargeNote;

    console.log('[Special Charges] Adding charge:', {
      registrationId,
      newCharge,
      sheetName: eventData.sheetName,
      updateData,
    });

    // Update Google Sheets
    try {
      // Convert to Firestore format and update
      const firestoreUpdateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updateData)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        firestoreUpdateData[camelKey] = value;
      }
      await updateEventRegistrationInFirestore(registrationId, firestoreUpdateData);

      console.log('[Special Charges] Charge added successfully');

      return NextResponse.json({
        success: true,
        message: 'เพิ่มค่าใช้จ่ายเสริมเรียบร้อยแล้ว',
        charge: newCharge,
        newTotalAmount,
      });
    } catch (updateError) {
      console.error('[Special Charges] Update failed:', updateError);
      throw updateError;
    }
  } catch (error) {
    console.error('Error adding special charge:', error);
    return NextResponse.json({
      error: 'ไม่สามารถเพิ่มค่าใช้จ่ายเสริมได้ กรุณาลองใหม่'
    }, { status: 500 });
  }
}

// DELETE - Remove special charge from a registration
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
    const hasFullAccess = hasPermission(session.user.permissions || [], 'admin:access') ||
                          hasPermission(session.user.permissions || [], 'members:list');
    const canManageAssigned = hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!hasFullAccess && !canManageAssigned) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
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
    const chargeId = searchParams.get('chargeId');
    const ignorePendingSlips = searchParams.get('ignorePendingSlips') === 'true';

    if (!registrationId || !chargeId) {
      return NextResponse.json({
        error: 'Missing required parameters: registrationId, chargeId'
      }, { status: 400 });
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'Event sheet not configured' }, { status: 400 });
    }

    // Get existing registrations
    let existingRegistrations;
    try {
      existingRegistrations = await getEventRegistrationsByEventId(eventId);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      return NextResponse.json({ error: 'Failed to load registration data' }, { status: 500 });
    }

    // Find the registration
    const registration = existingRegistrations.find(r => r.registrationId === registrationId);

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    // ✅ VALIDATION: Check for pending payment slips (unless explicitly ignored)
    if (!ignorePendingSlips) {
      const pendingInfo = await getPendingSlipsInfo(registrationId);
      if (pendingInfo.hasPending) {
        return NextResponse.json({
          error: 'ไม่สามารถลบค่าใช้จ่ายเสริมได้ในขณะนี้',
          details: `พบสลิปการชำระเงิน ${pendingInfo.count} รายการที่รอการอนุมัติ\n\nกรุณาอนุมัติหรือปฏิเสธสลิปที่รออนุมัติทั้งหมดก่อน จึงจะสามารถลบค่าใช้จ่ายเสริมได้\n\nเหตุผล: การอนุมัติสลิปจะส่งผลต่อยอดเงินที่ชำระแล้ว ซึ่งต้องคำนวณใหม่ก่อนปรับยอดรวมทั้งหมด`,
          hasPendingSlips: true,
          pendingSlipsCount: pendingInfo.count
        }, { status: 400 });
      }
    }

    // Parse existing special charges
    let specialCharges: SpecialCharge[] = [];
    try {
      if (registration.specialCharges) {
        specialCharges = JSON.parse(registration.specialCharges);
      }
    } catch (e) {
      console.error('Error parsing special charges:', e);
    }

    // Find and remove the charge
    const chargeToRemove = specialCharges.find(c => c.chargeId === chargeId);
    if (!chargeToRemove) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 });
    }

    specialCharges = specialCharges.filter(c => c.chargeId !== chargeId);

    // Parse existing discounts
    let discounts: Discount[] = [];
    try {
      if (registration.discounts) {
        discounts = JSON.parse(registration.discounts);
      }
    } catch (e) {
      console.error('Error parsing discounts:', e);
    }

    // Calculate new total amount
    // ✅ FIXED: Include both eventFee AND roomFee in base calculation
    // eventFee = base event fee (from attendee types or tiered pricing)
    // roomFee = room allocation fees
    // totalAmount = eventFee + roomFee + special charges - discounts
    const eventFee = registration.eventFee || 0;
    const roomFee = (registration as any).roomFee || 0;
    const chargesTotal = specialCharges.reduce((sum, charge) => sum + charge.amount, 0);
    const discountsTotal = discounts.reduce((sum, d) => sum + d.calculatedAmount, 0);
    const newTotalAmount = Math.max(0, eventFee + roomFee + chargesTotal - discountsTotal);

    console.log('[Special Charges] Total calculation:', {
      eventFee,
      roomFee,
      chargesTotal,
      discountsTotal,
      newTotalAmount,
    });

    // Prepare update data
    const updateData: Record<string, unknown> = {
      special_charges: JSON.stringify(specialCharges),
      total_amount: newTotalAmount,
    };

    // Recalculate deposit and remaining amounts if in deposit mode
    if (registration.depositAmount && registration.depositAmount > 0) {
      const newRemainingAmount = newTotalAmount - registration.depositAmount;
      updateData.remaining_amount = newRemainingAmount;
    }

    // ✅ CRITICAL: Get approved payment slips total for accurate payment status calculation
    const { getPaymentSlipsByRegistration } = await import('@/lib/payment-slips');
    const slips = await getPaymentSlipsByRegistration(registration.registrationId);
    const approvedSlipsTotal = slips
      .filter(slip => slip.status === 'approved')
      .reduce((sum, slip) => sum + (slip.amount || 0), 0);

    // ✅ CRITICAL: Recalculate payment status when totalAmount changes
    const paymentStatusUpdate = recalculatePaymentStatus(registration, newTotalAmount, eventData.paymentMode || 'full', approvedSlipsTotal);
    updateData.payment_status = paymentStatusUpdate.payment_status;
    if (paymentStatusUpdate.status) {
      updateData.status = paymentStatusUpdate.status;
    }
    // ✅ Store overpayment amount
    if (paymentStatusUpdate.overpayment_amount !== undefined) {
      updateData.overpayment_amount = paymentStatusUpdate.overpayment_amount;
    }

    console.log('[Special Charges] Payment status recalculated after removal:', {
      oldTotal: registration.totalAmount,
      newTotal: newTotalAmount,
      oldPaymentStatus: registration.paymentStatus,
      newPaymentStatus: updateData.payment_status,
      oldStatus: registration.status,
      newStatus: updateData.status,
    });

    // Update admin notes
    const currentNotes = registration.adminNotes || '';
    const removalNote = `\n[${new Date().toLocaleDateString('th-TH')}] Admin ลบค่าใช้จ่ายเสริม: ${chargeToRemove.description} - ${chargeToRemove.amount.toLocaleString()} บาท (โดย ${session.user.name || session.user.email})`;
    updateData.admin_notes = currentNotes + removalNote;

    console.log('[Special Charges] Removing charge:', {
      registrationId,
      chargeId,
      sheetName: eventData.sheetName,
      updateData,
    });

    // Update Google Sheets
    try {
      // Convert to Firestore format and update
      const firestoreUpdateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updateData)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        firestoreUpdateData[camelKey] = value;
      }
      await updateEventRegistrationInFirestore(registrationId, firestoreUpdateData);

      console.log('[Special Charges] Charge removed successfully');

      return NextResponse.json({
        success: true,
        message: 'ลบค่าใช้จ่ายเสริมเรียบร้อยแล้ว',
        newTotalAmount,
      });
    } catch (updateError) {
      console.error('[Special Charges] Update failed:', updateError);
      throw updateError;
    }
  } catch (error) {
    console.error('Error removing special charge:', error);
    return NextResponse.json({
      error: 'ไม่สามารถลบค่าใช้จ่ายเสริมได้ กรุณาลองใหม่'
    }, { status: 500 });
  }
}
