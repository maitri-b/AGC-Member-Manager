// API Route for Admin - Events Management (CRUD)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { Event, EventInput, DEFAULT_EVENTS } from '@/types/event';
import { sheetsCache, CacheKeys } from '@/lib/cache/google-sheets-cache';

/**
 * Sync event mapping to Google Apps Script
 * This allows GAS to dynamically load event mappings without hardcoding
 */
async function syncEventToGAS(eventId: string, sheetName: string) {
  try {
    const gasUrl = process.env.NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL;

    if (!gasUrl) {
      console.warn('GAS_UPLOAD_SLIP_URL not configured, skipping sync');
      return { success: false, error: 'GAS URL not configured' };
    }

    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'sync_event',
        eventId,
        sheetName,
      }),
    });

    if (!response.ok) {
      throw new Error(`GAS sync failed: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Synced event to GAS: ${eventId} -> ${sheetName}`, result);
    return result;
  } catch (error) {
    console.error('Error syncing event to GAS:', error);
    // Don't fail the main operation if sync fails
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// GET - List all events
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require admin:access OR events:manage-assigned permission
    const hasAdminAccess = hasPermission(session.user.permissions || [], 'admin:access');
    const hasEventAccess = hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!hasAdminAccess && !hasEventAccess) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();
    const eventsSnapshot = await db.collection('events').orderBy('year', 'desc').get();

    // If no events in Firestore, migrate default events
    if (eventsSnapshot.empty) {
      const batch = db.batch();
      for (const event of DEFAULT_EVENTS) {
        const eventRef = db.collection('events').doc(event.eventId);
        batch.set(eventRef, {
          ...event,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: session.user.id,
        });
      }
      await batch.commit();

      return NextResponse.json({ events: DEFAULT_EVENTS, migrated: true });
    }

    const events = eventsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        eventId: doc.id,
        eventName: data.eventName || '',
        eventNameEN: data.eventNameEN || '',
        eventDate: data.eventDate || '',
        location: data.location || '',
        description: data.description || '',
        sheetName: data.sheetName || '',
        year: data.year || 0,
        isActive: data.isActive ?? true,
        isPublished: data.isPublished ?? false,
        countsAttendance: data.countsAttendance ?? true,
        maxCapacity: data.maxCapacity ?? 0,
        maxPerCompany: data.maxPerCompany ?? 0,
        registrationFee: data.registrationFee ?? 0,
        pricingType: data.pricingType || 'fixed',
        baseFee: data.baseFee ?? 0,
        additionalFeePerPerson: data.additionalFeePerPerson ?? 0,
        priceTiers: data.priceTiers || undefined,
        memberDiscount: data.memberDiscount ?? 0,
        registrationOpen: data.registrationOpen ?? false,
        documentName: data.documentName || '',
        documentUrl: data.documentUrl || '',
        mainImageUrl: data.mainImageUrl || '',
        paymentBankName: data.paymentBankName || '',
        paymentAccountName: data.paymentAccountName || '',
        paymentAccountNumber: data.paymentAccountNumber || '',
        paymentQrCodeUrl: data.paymentQrCodeUrl || '',
        paymentTerms: data.paymentTerms || '',
        paymentSlipSubmissionUrl: data.paymentSlipSubmissionUrl || '',
        paymentSlipButtonText: data.paymentSlipButtonText || '',
        paymentInstructionText: data.paymentInstructionText || '',
        // Payment configuration (New)
        paymentTiming: data.paymentTiming || 'deferred',
        paymentMode: data.paymentMode || 'full',
        // Full payment deadline (for paymentMode = 'full')
        paymentDeadlineType: data.paymentDeadlineType || 'none',
        paymentDeadlineFixed: data.paymentDeadlineFixed || '',
        paymentDeadlineHours: data.paymentDeadlineHours ?? 0,
        // Deposit payment configuration (for paymentMode = 'deposit')
        depositAmount: data.depositAmount ?? 0,
        depositPercentage: data.depositPercentage ?? 0,
        useDepositPercentage: data.useDepositPercentage ?? false,
        depositDeadlineType: data.depositDeadlineType || 'none',
        depositDeadlineFixed: data.depositDeadlineFixed || '',
        depositDeadlineHours: data.depositDeadlineHours ?? 0,
        remainingDeadlineType: data.remainingDeadlineType || 'none',
        remainingDeadlineFixed: data.remainingDeadlineFixed || '',
        remainingDeadlineHours: data.remainingDeadlineHours ?? 0,
        // Registration edit control
        allowMemberEdit: data.allowMemberEdit ?? true,
        requireAttendeeNames: data.requireAttendeeNames ?? true,
        // LINE notification control
        sendLineNotification: data.sendLineNotification ?? true,
        // Attendee type pricing
        useAttendeeTypePricing: data.useAttendeeTypePricing ?? false,
        attendeeTypes: data.attendeeTypes || [],
        // Room allocation
        roomTypes: data.roomTypes || [],
        // Convert Firestore Timestamps to ISO strings
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || '',
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || '',
        createdBy: data.createdBy || '',
        updatedBy: data.updatedBy || '',
      };
    }) as Event[];

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

// POST - Create new event
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body: EventInput = await request.json();

    // Validate required fields
    if (!body.eventName || !body.sheetName || !body.year) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = adminDb();

    // Generate eventId from name and year
    const eventId = `${body.eventName.toLowerCase().replace(/\s+/g, '-')}-${body.year - 543}`;

    // Check if event already exists
    const existingEvent = await db.collection('events').doc(eventId).get();
    if (existingEvent.exists) {
      return NextResponse.json({ error: 'Event with this ID already exists' }, { status: 409 });
    }

    const newEvent: Event = {
      eventId,
      eventName: body.eventName,
      eventNameEN: body.eventNameEN || '',
      eventDate: body.eventDate || String(body.year - 543),
      location: body.location || '',
      description: body.description || '',
      sheetName: body.sheetName,
      year: body.year,
      isActive: body.isActive ?? true,
      isPublished: body.isPublished ?? false,
      countsAttendance: body.countsAttendance ?? true,
      maxCapacity: body.maxCapacity ?? 0,
      maxPerCompany: body.maxPerCompany ?? 0,
      registrationFee: body.registrationFee ?? 0,
      pricingType: body.pricingType || 'fixed',
      baseFee: body.baseFee ?? 0,
      additionalFeePerPerson: body.additionalFeePerPerson ?? 0,
      priceTiers: body.priceTiers || undefined,
      memberDiscount: body.memberDiscount ?? 0,
      registrationOpen: body.registrationOpen ?? false,
      documentName: body.documentName || '',
      documentUrl: body.documentUrl || '',
      mainImageUrl: body.mainImageUrl || '',
      paymentBankName: body.paymentBankName || '',
      paymentAccountName: body.paymentAccountName || '',
      paymentAccountNumber: body.paymentAccountNumber || '',
      paymentQrCodeUrl: body.paymentQrCodeUrl || '',
      paymentTerms: body.paymentTerms || '',
      paymentSlipSubmissionUrl: body.paymentSlipSubmissionUrl || '',
      paymentSlipButtonText: body.paymentSlipButtonText || '',
      paymentInstructionText: body.paymentInstructionText || '',
      // Payment configuration (New)
      paymentTiming: body.paymentTiming || 'deferred',
      paymentMode: body.paymentMode || 'full',
      // Full payment deadline (for paymentMode = 'full')
      paymentDeadlineType: body.paymentDeadlineType || 'none',
      paymentDeadlineFixed: body.paymentDeadlineFixed || '',
      paymentDeadlineHours: body.paymentDeadlineHours ?? 0,
      // Deposit payment configuration (for paymentMode = 'deposit')
      depositAmount: body.depositAmount ?? 0,
      depositPercentage: body.depositPercentage ?? 0,
      useDepositPercentage: body.useDepositPercentage ?? false,
      depositDeadlineType: body.depositDeadlineType || 'none',
      depositDeadlineFixed: body.depositDeadlineFixed || '',
      depositDeadlineHours: body.depositDeadlineHours ?? 0,
      remainingDeadlineType: body.remainingDeadlineType || 'none',
      remainingDeadlineFixed: body.remainingDeadlineFixed || '',
      remainingDeadlineHours: body.remainingDeadlineHours ?? 0,
      // Registration edit control
      allowMemberEdit: body.allowMemberEdit ?? true,
      requireAttendeeNames: body.requireAttendeeNames ?? true,
      // LINE notification control
      sendLineNotification: body.sendLineNotification ?? true,
      // Attendee type pricing
      useAttendeeTypePricing: body.useAttendeeTypePricing ?? false,
      attendeeTypes: body.attendeeTypes || [],
      // Room allocation
      roomTypes: body.roomTypes || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: session.user.id,
    };

    await db.collection('events').doc(eventId).set(newEvent);

    // Invalidate cache to ensure new event appears immediately
    sheetsCache.invalidatePattern('events:');

    // Sync event mapping to GAS (non-blocking)
    if (newEvent.sheetName) {
      syncEventToGAS(eventId, newEvent.sheetName).catch(err => {
        console.error('GAS sync error (non-critical):', err);
      });
    }

    return NextResponse.json({ success: true, event: newEvent }, { status: 201 });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}

// PUT - Update event
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { eventId, ...updates } = body;

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Check permissions
    const hasAdminAccess = hasPermission(session.user.permissions || [], 'admin:access');
    const hasEventAccess = hasPermission(session.user.permissions || [], 'events:manage-assigned');

    if (!hasAdminAccess && !hasEventAccess) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // If event-staff/event-co, check if they have access to this specific event
    if (!hasAdminAccess && hasEventAccess) {
      const assignedEventIds = session.user.assignedEventIds || [];
      if (!assignedEventIds.includes(eventId)) {
        return NextResponse.json({ error: 'You are not assigned to this event' }, { status: 403 });
      }
    }

    const db = adminDb();
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const updateData = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: session.user.id,
    };

    await eventRef.update(updateData);

    // Invalidate cache to ensure updated event data appears immediately
    sheetsCache.invalidatePattern('events:');

    // Sync to GAS if sheetName was updated (non-blocking)
    if (updates.sheetName) {
      syncEventToGAS(eventId, updates.sheetName).catch(err => {
        console.error('GAS sync error (non-critical):', err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

// DELETE - Delete event
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    const db = adminDb();
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    await eventRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
