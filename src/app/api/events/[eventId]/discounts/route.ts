// API Route for Managing Discounts (Admin only)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrationsByEventId, updateEventRegistrationInFirestore } from '@/lib/event-sheets';
import { Discount } from '@/types/event';
import { hasPermission, canManageEvent } from '@/lib/permissions';
import { recalculatePaymentStatus } from '@/lib/payment-status';
import { getPendingSlipsInfo } from '@/lib/payment-slips';

// POST - Add discount to a registration
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
    const { registrationId, description, discountType, value, ignorePendingSlips } = body;

    if (!registrationId || !description || !discountType || value === undefined) {
      return NextResponse.json({
        error: 'Missing required fields: registrationId, description, discountType, value'
      }, { status: 400 });
    }

    // Validate discountType
    if (!['fixed', 'percentage', 'free'].includes(discountType)) {
      return NextResponse.json({
        error: 'Invalid discountType. Must be: fixed, percentage, or free'
      }, { status: 400 });
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    // ✅ Removed sheetName dependency - all events use Firestore now

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
          error: 'ไม่สามารถเพิ่มส่วนลดได้ในขณะนี้',
          details: `พบสลิปการชำระเงิน ${pendingInfo.count} รายการที่รอการอนุมัติ\n\nกรุณาอนุมัติหรือปฏิเสธสลิปที่รออนุมัติทั้งหมดก่อน จึงจะสามารถเพิ่มส่วนลดได้\n\nเหตุผล: การอนุมัติสลิปจะส่งผลต่อยอดเงินที่ชำระแล้ว ซึ่งต้องคำนวณใหม่ก่อนปรับยอดรวมทั้งหมด`,
          hasPendingSlips: true,
          pendingSlipsCount: pendingInfo.count
        }, { status: 400 });
      }
    }

    // Parse existing discounts
    let discounts: Discount[] = [];
    try {
      if (registration.discounts) {
        discounts = JSON.parse(registration.discounts);
      }
    } catch (e) {
      console.error('Error parsing discounts:', e);
    }

    // Calculate total before discount
    // totalBeforeDiscount = eventFee + roomFee + specialCharges
    const eventFee = registration.eventFee || 0;
    const roomFee = (registration as any).roomFee || 0;

    let specialChargesTotal = 0;
    try {
      if (registration.specialCharges) {
        const specialCharges = JSON.parse(registration.specialCharges);
        specialChargesTotal = specialCharges.reduce((sum: number, charge: { amount: number }) => sum + charge.amount, 0);
      }
    } catch (e) {
      console.error('Error parsing special charges:', e);
    }

    const totalBeforeDiscount = eventFee + roomFee + specialChargesTotal;

    // Calculate discount amount
    let calculatedAmount = 0;
    if (discountType === 'free') {
      // Free = 100% discount
      calculatedAmount = totalBeforeDiscount;
    } else if (discountType === 'percentage') {
      // Percentage discount
      const percentage = parseFloat(value);
      if (percentage < 0 || percentage > 100) {
        return NextResponse.json({
          error: 'Invalid percentage value. Must be between 0 and 100'
        }, { status: 400 });
      }
      calculatedAmount = Math.round((totalBeforeDiscount * percentage) / 100);
    } else {
      // Fixed amount discount
      calculatedAmount = parseFloat(value);
      if (calculatedAmount < 0) {
        return NextResponse.json({
          error: 'Discount amount cannot be negative'
        }, { status: 400 });
      }
    }

    // Create new discount
    const newDiscount: Discount = {
      discountId: `DISC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description,
      discountType,
      value: parseFloat(value),
      calculatedAmount,
      addedBy: session.user.id,
      addedAt: new Date().toISOString(),
    };

    discounts.push(newDiscount);

    // Calculate new total amount
    // totalAmount = eventFee + roomFee + specialCharges - discounts
    const discountsTotal = discounts.reduce((sum, discount) => sum + discount.calculatedAmount, 0);
    const newTotalAmount = Math.max(0, totalBeforeDiscount - discountsTotal);

    console.log('[Discounts] Total calculation:', {
      eventFee,
      roomFee,
      specialChargesTotal,
      totalBeforeDiscount,
      discountsTotal,
      newTotalAmount,
    });

    // Prepare update data
    const updateData: Record<string, unknown> = {
      discounts: JSON.stringify(discounts),
      total_amount: newTotalAmount,
    };

    // Recalculate deposit and remaining amounts if in deposit mode
    if (registration.depositAmount && registration.depositAmount > 0) {
      // Keep the same deposit amount, adjust remaining
      const newRemainingAmount = Math.max(0, newTotalAmount - registration.depositAmount);
      updateData.remaining_amount = newRemainingAmount;
    }

    // ✅ CRITICAL: Get approved payment slips total for accurate payment status calculation
    const { getPaymentSlipsByRegistration } = await import('@/lib/payment-slips');
    const slips = await getPaymentSlipsByRegistration(registration.registrationId);
    const approvedSlipsTotal = slips
      .filter(slip => slip.status === 'approved')
      .reduce((sum, slip) => sum + (slip.amount || 0), 0);

    // ✅ CRITICAL: Recalculate payment status when totalAmount changes
    const paymentStatusUpdate = recalculatePaymentStatus(registration, newTotalAmount, eventData?.paymentMode || 'full', approvedSlipsTotal);
    updateData.payment_status = paymentStatusUpdate.payment_status;
    if (paymentStatusUpdate.status) {
      updateData.status = paymentStatusUpdate.status;
    }
    // ✅ Store overpayment amount
    if (paymentStatusUpdate.overpayment_amount !== undefined) {
      updateData.overpayment_amount = paymentStatusUpdate.overpayment_amount;
    }

    console.log('[Discounts] Payment status recalculated:', {
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
    const discountNote = `\n[${new Date().toLocaleDateString('th-TH')}] Admin ให้ส่วนลด: ${description} - ${calculatedAmount.toLocaleString()} บาท (${discountType === 'free' ? 'ฟรี' : discountType === 'percentage' ? `${value}%` : 'ระบุจำนวน'}) (โดย ${session.user.name || session.user.email})`;
    updateData.admin_notes = currentNotes + discountNote;

    console.log('[Discounts] Adding discount:', {
      registrationId,
      newDiscount,
      updateData,
    });

    // Update Firestore
    try {
      // Convert to Firestore format and update
      const firestoreUpdateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updateData)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        firestoreUpdateData[camelKey] = value;
      }
      await updateEventRegistrationInFirestore(registrationId, firestoreUpdateData);

      console.log('[Discounts] Discount added successfully');

      return NextResponse.json({
        success: true,
        message: 'เพิ่มส่วนลดเรียบร้อยแล้ว',
        discount: newDiscount,
        newTotalAmount,
      });
    } catch (updateError) {
      console.error('[Discounts] Update failed:', updateError);
      throw updateError;
    }
  } catch (error) {
    console.error('Error adding discount:', error);
    return NextResponse.json({
      error: 'ไม่สามารถเพิ่มส่วนลดได้ กรุณาลองใหม่'
    }, { status: 500 });
  }
}

// DELETE - Remove discount from a registration
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
    const discountId = searchParams.get('discountId');
    const ignorePendingSlips = searchParams.get('ignorePendingSlips') === 'true';

    if (!registrationId || !discountId) {
      return NextResponse.json({
        error: 'Missing required parameters: registrationId, discountId'
      }, { status: 400 });
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    // ✅ Removed sheetName dependency - all events use Firestore now

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
          error: 'ไม่สามารถลบส่วนลดได้ในขณะนี้',
          details: `พบสลิปการชำระเงิน ${pendingInfo.count} รายการที่รอการอนุมัติ\n\nกรุณาอนุมัติหรือปฏิเสธสลิปที่รออนุมัติทั้งหมดก่อน จึงจะสามารถลบส่วนลดได้\n\nเหตุผล: การอนุมัติสลิปจะส่งผลต่อยอดเงินที่ชำระแล้ว ซึ่งต้องคำนวณใหม่ก่อนปรับยอดรวมทั้งหมด`,
          hasPendingSlips: true,
          pendingSlipsCount: pendingInfo.count
        }, { status: 400 });
      }
    }

    // Parse existing discounts
    let discounts: Discount[] = [];
    try {
      if (registration.discounts) {
        discounts = JSON.parse(registration.discounts);
      }
    } catch (e) {
      console.error('Error parsing discounts:', e);
    }

    // Find and remove the discount
    const discountToRemove = discounts.find(d => d.discountId === discountId);
    if (!discountToRemove) {
      return NextResponse.json({ error: 'Discount not found' }, { status: 404 });
    }

    discounts = discounts.filter(d => d.discountId !== discountId);

    // Calculate total before discount
    // totalBeforeDiscount = eventFee + roomFee + specialCharges
    const eventFee = registration.eventFee || 0;
    const roomFee = (registration as any).roomFee || 0;

    let specialChargesTotal = 0;
    try {
      if (registration.specialCharges) {
        const specialCharges = JSON.parse(registration.specialCharges);
        specialChargesTotal = specialCharges.reduce((sum: number, charge: { amount: number }) => sum + charge.amount, 0);
      }
    } catch (e) {
      console.error('Error parsing special charges:', e);
    }

    const totalBeforeDiscount = eventFee + roomFee + specialChargesTotal;

    // Calculate new total amount
    // totalAmount = eventFee + roomFee + specialCharges - discounts
    const discountsTotal = discounts.reduce((sum, discount) => sum + discount.calculatedAmount, 0);
    const newTotalAmount = Math.max(0, totalBeforeDiscount - discountsTotal);

    console.log('[Discounts] Total calculation after removal:', {
      eventFee,
      roomFee,
      specialChargesTotal,
      totalBeforeDiscount,
      discountsTotal,
      newTotalAmount,
    });

    // Prepare update data
    const updateData: Record<string, unknown> = {
      discounts: JSON.stringify(discounts),
      total_amount: newTotalAmount,
    };

    // Recalculate deposit and remaining amounts if in deposit mode
    if (registration.depositAmount && registration.depositAmount > 0) {
      const newRemainingAmount = Math.max(0, newTotalAmount - registration.depositAmount);
      updateData.remaining_amount = newRemainingAmount;
    }

    // ✅ CRITICAL: Get approved payment slips total for accurate payment status calculation
    const { getPaymentSlipsByRegistration } = await import('@/lib/payment-slips');
    const slips = await getPaymentSlipsByRegistration(registration.registrationId);
    const approvedSlipsTotal = slips
      .filter(slip => slip.status === 'approved')
      .reduce((sum, slip) => sum + (slip.amount || 0), 0);

    // ✅ CRITICAL: Recalculate payment status when totalAmount changes
    const paymentStatusUpdate = recalculatePaymentStatus(registration, newTotalAmount, eventData?.paymentMode || 'full', approvedSlipsTotal);
    updateData.payment_status = paymentStatusUpdate.payment_status;
    if (paymentStatusUpdate.status) {
      updateData.status = paymentStatusUpdate.status;
    }
    // ✅ Store overpayment amount
    if (paymentStatusUpdate.overpayment_amount !== undefined) {
      updateData.overpayment_amount = paymentStatusUpdate.overpayment_amount;
    }

    console.log('[Discounts] Payment status recalculated after removal:', {
      oldTotal: registration.totalAmount,
      newTotal: newTotalAmount,
      oldPaymentStatus: registration.paymentStatus,
      newPaymentStatus: updateData.payment_status,
      oldStatus: registration.status,
      newStatus: updateData.status,
    });

    // Update admin notes
    const currentNotes = registration.adminNotes || '';
    const removalNote = `\n[${new Date().toLocaleDateString('th-TH')}] Admin ลบส่วนลด: ${discountToRemove.description} - ${discountToRemove.calculatedAmount.toLocaleString()} บาท (โดย ${session.user.name || session.user.email})`;
    updateData.admin_notes = currentNotes + removalNote;

    console.log('[Discounts] Removing discount:', {
      registrationId,
      discountId,
      updateData,
    });

    // Update Firestore
    try {
      // Convert to Firestore format and update
      const firestoreUpdateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updateData)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        firestoreUpdateData[camelKey] = value;
      }
      await updateEventRegistrationInFirestore(registrationId, firestoreUpdateData);

      console.log('[Discounts] Discount removed successfully');

      return NextResponse.json({
        success: true,
        message: 'ลบส่วนลดเรียบร้อยแล้ว',
        newTotalAmount,
      });
    } catch (updateError) {
      console.error('[Discounts] Update failed:', updateError);
      throw updateError;
    }
  } catch (error) {
    console.error('Error removing discount:', error);
    return NextResponse.json({
      error: 'ไม่สามารถลบส่วนลดได้ กรุณาลองใหม่'
    }, { status: 500 });
  }
}
