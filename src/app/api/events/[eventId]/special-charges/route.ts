// API Route for Managing Special Charges (Admin only)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrations, updateEventRegistration } from '@/lib/event-sheets';
import { SpecialCharge } from '@/types/event';

// POST - Add special charge to a registration
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    // Check admin permissions
    const isAdmin = session?.user?.permissions?.includes('admin:access') ||
                     session?.user?.permissions?.includes('members:list');

    if (!session?.user || !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { eventId } = await params;
    const body = await request.json();
    const { registrationId, description, amount } = body;

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
      existingRegistrations = await getEventRegistrations(eventData.sheetName);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      return NextResponse.json({ error: 'Failed to load registration data' }, { status: 500 });
    }

    // Find the registration
    const registration = existingRegistrations.find(r => r.registrationId === registrationId);

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
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

    // Calculate new total amount
    const chargesTotal = specialCharges.reduce((sum, charge) => sum + charge.amount, 0);
    const newTotalAmount = (registration.eventFee || 0) + chargesTotal;

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

    // Update admin notes
    const currentNotes = registration.adminNotes || '';
    const chargeNote = `\n[${new Date().toLocaleDateString('th-TH')}] Admin เพิ่มค่าใช้จ่ายพิเศษ: ${description} - ${amount.toLocaleString()} บาท (โดย ${session.user.name || session.user.email})`;
    updateData.admin_notes = currentNotes + chargeNote;

    console.log('[Special Charges] Adding charge:', {
      registrationId,
      newCharge,
      sheetName: eventData.sheetName,
      updateData,
    });

    // Update Google Sheets
    try {
      await updateEventRegistration(eventData.sheetName, registrationId, updateData);

      console.log('[Special Charges] Charge added successfully');

      return NextResponse.json({
        success: true,
        message: 'เพิ่มค่าใช้จ่ายพิเศษเรียบร้อยแล้ว',
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
      error: 'ไม่สามารถเพิ่มค่าใช้จ่ายพิเศษได้ กรุณาลองใหม่'
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

    // Check admin permissions
    const isAdmin = session?.user?.permissions?.includes('admin:access') ||
                     session?.user?.permissions?.includes('members:list');

    if (!session?.user || !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin only' }, { status: 401 });
    }

    const { eventId } = await params;
    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');
    const chargeId = searchParams.get('chargeId');

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
      existingRegistrations = await getEventRegistrations(eventData.sheetName);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      return NextResponse.json({ error: 'Failed to load registration data' }, { status: 500 });
    }

    // Find the registration
    const registration = existingRegistrations.find(r => r.registrationId === registrationId);

    if (!registration) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
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

    // Calculate new total amount
    const chargesTotal = specialCharges.reduce((sum, charge) => sum + charge.amount, 0);
    const newTotalAmount = (registration.eventFee || 0) + chargesTotal;

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

    // Update admin notes
    const currentNotes = registration.adminNotes || '';
    const removalNote = `\n[${new Date().toLocaleDateString('th-TH')}] Admin ลบค่าใช้จ่ายพิเศษ: ${chargeToRemove.description} - ${chargeToRemove.amount.toLocaleString()} บาท (โดย ${session.user.name || session.user.email})`;
    updateData.admin_notes = currentNotes + removalNote;

    console.log('[Special Charges] Removing charge:', {
      registrationId,
      chargeId,
      sheetName: eventData.sheetName,
      updateData,
    });

    // Update Google Sheets
    try {
      await updateEventRegistration(eventData.sheetName, registrationId, updateData);

      console.log('[Special Charges] Charge removed successfully');

      return NextResponse.json({
        success: true,
        message: 'ลบค่าใช้จ่ายพิเศษเรียบร้อยแล้ว',
        newTotalAmount,
      });
    } catch (updateError) {
      console.error('[Special Charges] Update failed:', updateError);
      throw updateError;
    }
  } catch (error) {
    console.error('Error removing special charge:', error);
    return NextResponse.json({
      error: 'ไม่สามารถลบค่าใช้จ่ายพิเศษได้ กรุณาลองใหม่'
    }, { status: 500 });
  }
}
