// API Route for Event Detail (Public for members)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrationsByEventId } from '@/lib/event-sheets';
import { EventRegistration, Event } from '@/types/event';
import { determinePaymentStatus } from '@/lib/payment-status';
import { sheetsCache, CacheKeys, CacheTTL } from '@/lib/cache/google-sheets-cache';
import { hasPermission } from '@/lib/permissions';
import { getPaymentSlipsByRegistration, getPaymentSummaryForRegistration } from '@/lib/payment-slips';

// Helper function to check if registration is cancelled
function isRegistrationCancelled(registration: EventRegistration): boolean {
  const status = registration.status || '';
  const statusLower = status.toLowerCase();
  return statusLower === 'cancelled' || status.includes('ยกเลิก');
}

// GET - Get event detail for member view
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = await params;

    const db = adminDb();
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    // Check if event is published
    // Admin/Committee can see unpublished events, regular users can only see published events
    const isCommitteeOrAdmin = hasPermission(session.user.permissions || [], 'members:list') ||
                               hasPermission(session.user.permissions || [], 'admin:access');

    if (!eventData?.isPublished && !isCommitteeOrAdmin) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = {
      eventId: eventDoc.id,
      eventName: eventData?.eventName || '',
      eventNameEN: eventData?.eventNameEN || '',
      eventDate: eventData?.eventDate || '',
      location: eventData?.location || '',
      description: eventData?.description || '',
      sheetName: eventData?.sheetName || '',
      year: eventData?.year || 0,
      isActive: eventData?.isActive ?? true,
      isPublished: eventData?.isPublished ?? false,
      countsAttendance: eventData?.countsAttendance ?? true,
      maxCapacity: eventData?.maxCapacity ?? 0,
      maxPerCompany: eventData?.maxPerCompany ?? 0,
      registrationFee: eventData?.registrationFee ?? 0,
      pricingType: eventData?.pricingType || 'fixed',
      baseFee: eventData?.baseFee ?? 0,
      additionalFeePerPerson: eventData?.additionalFeePerPerson ?? 0,
      priceTiers: eventData?.priceTiers || undefined,
      memberDiscount: eventData?.memberDiscount ?? 0,
      registrationOpen: eventData?.registrationOpen ?? false,
      documentName: eventData?.documentName || '',
      documentUrl: eventData?.documentUrl || '',
      mainImageUrl: eventData?.mainImageUrl || '',
      paymentBankName: eventData?.paymentBankName || '',
      paymentAccountName: eventData?.paymentAccountName || '',
      paymentAccountNumber: eventData?.paymentAccountNumber || '',
      paymentQrCodeUrl: eventData?.paymentQrCodeUrl || '',
      paymentTerms: eventData?.paymentTerms || '',
      paymentSlipSubmissionUrl: eventData?.paymentSlipSubmissionUrl || '',
      paymentSlipButtonText: eventData?.paymentSlipButtonText || '',
      paymentInstructionText: eventData?.paymentInstructionText || '',
      allowMemberEdit: eventData?.allowMemberEdit ?? true,
      requireAttendeeNames: eventData?.requireAttendeeNames ?? true,
      createdAt: eventData?.createdAt || '',
      updatedAt: eventData?.updatedAt || '',
      // Payment configuration (New)
      paymentTiming: eventData?.paymentTiming || 'deferred',
      paymentMode: eventData?.paymentMode || 'full',
      depositAmount: eventData?.depositAmount ?? 0,
      depositPercentage: eventData?.depositPercentage ?? 0,
      useDepositPercentage: eventData?.useDepositPercentage ?? false,
      depositDeadlineType: eventData?.depositDeadlineType || 'none',
      depositDeadlineFixed: eventData?.depositDeadlineFixed || '',
      depositDeadlineHours: eventData?.depositDeadlineHours ?? 0,
      remainingDeadlineType: eventData?.remainingDeadlineType || 'none',
      remainingDeadlineFixed: eventData?.remainingDeadlineFixed || '',
      remainingDeadlineHours: eventData?.remainingDeadlineHours ?? 0,
      // Attendee type pricing (New)
      useAttendeeTypePricing: eventData?.useAttendeeTypePricing ?? false,
      attendeeTypes: eventData?.attendeeTypes || [],
      // Room allocation (New)
      roomTypes: eventData?.roomTypes || [],
    };

    // Get registration summary
    let summary = {
      totalRegistrations: 0,
      totalAttendees: 0,
    };

    let userRegistration = null;

    if (eventData?.sheetName) {
      try {
        // Fetch registrations from Firestore
        // This ensures real-time data for registration changes
        const registrations = await getEventRegistrationsByEventId(eventId);

        // Filter out cancelled registrations for summary
        const activeRegistrations = registrations.filter(r => !isRegistrationCancelled(r));

        // Calculate summary (excluding cancelled)
        summary.totalRegistrations = activeRegistrations.length;
        summary.totalAttendees = activeRegistrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);

        // Check if current user has registered (by LINE user ID or member ID)
        // Search ONLY in active registrations and get the LATEST one if multiple exist
        if (session.user.id || session.user.memberId) {
          const userRegs = activeRegistrations.filter(r => {
            return (
              (session.user.id && r.lineUserId === session.user.id) ||
              (session.user.memberId && r.memberId === session.user.memberId)
            );
          });

          // If user has multiple active registrations, use the latest one by registration date
          if (userRegs.length > 0) {
            const latestReg = userRegs.sort((a, b) => {
              const dateA = a.registrationDate || '';
              const dateB = b.registrationDate || '';
              return dateB > dateA ? 1 : -1; // descending order
            })[0];

            // Parse attendee type selections, room allocations, and special charges from JSON strings
            let attendeeTypeSelections = [];
            let roomAllocations = [];
            let specialCharges = [];
            try {
              if (latestReg.attendeeTypeSelections) {
                attendeeTypeSelections = JSON.parse(latestReg.attendeeTypeSelections);
              }
            } catch (e) {
              console.error('Error parsing attendeeTypeSelections:', e);
            }
            try {
              if (latestReg.roomAllocations) {
                roomAllocations = JSON.parse(latestReg.roomAllocations);
              }
            } catch (e) {
              console.error('Error parsing roomAllocations:', e);
            }
            try {
              if (latestReg.specialCharges) {
                specialCharges = JSON.parse(latestReg.specialCharges);
              }
            } catch (e) {
              console.error('Error parsing specialCharges:', e);
            }

            // Recalculate totalAmount to ensure it includes all fees
            // This handles cases where old data might not have room fees included
            let recalculatedTotal = latestReg.totalAmount || 0;

            // If we have attendee type selections, recalculate from scratch
            if (attendeeTypeSelections.length > 0 && eventData.attendeeTypes) {
              let eventFee = 0;
              attendeeTypeSelections.forEach((sel: { typeId: string; quantity: number }) => {
                const type = eventData.attendeeTypes.find((t: { typeId: string; price: number }) => t.typeId === sel.typeId);
                if (type) {
                  eventFee += type.price * sel.quantity;
                }
              });

              // Add room fees
              let roomFee = 0;
              if (roomAllocations.length > 0 && eventData.roomTypes) {
                roomAllocations.forEach((alloc: { roomTypeId: string; roomCount: number }) => {
                  const roomType = eventData.roomTypes.find((rt: { typeId: string; price: number }) => rt.typeId === alloc.roomTypeId);
                  if (roomType) {
                    roomFee += roomType.price * alloc.roomCount;
                  }
                });
              }

              // Add special charges
              let specialChargesFee = 0;
              if (specialCharges.length > 0) {
                specialChargesFee = specialCharges.reduce((sum: number, c: { amount: number }) => sum + c.amount, 0);
              }

              recalculatedTotal = eventFee + roomFee + specialChargesFee;

              // If recalculated total is different, log it for debugging
              if (recalculatedTotal !== latestReg.totalAmount) {
                console.log(`[Fee Recalculation] Registration ${latestReg.registrationId}: ${latestReg.totalAmount} → ${recalculatedTotal} (eventFee: ${eventFee}, roomFee: ${roomFee}, specialCharges: ${specialChargesFee})`);
              }
            }

            // Get payment slips for this registration
            const paymentSlips = await getPaymentSlipsByRegistration(latestReg.registrationId);
            const paymentSummary = await getPaymentSummaryForRegistration(
              latestReg.registrationId,
              recalculatedTotal
            );

            userRegistration = {
              registrationId: latestReg.registrationId,
              status: latestReg.status,
              attendeeCount: latestReg.attendeeCount,
              attendeeNames: latestReg.attendeeNames,
              registrationDate: latestReg.registrationDate,
              // Deposit payment data (New)
              totalAmount: recalculatedTotal, // Use recalculated total
              depositAmount: latestReg.depositAmount,
              remainingAmount: latestReg.remainingAmount,
              depositPaid: latestReg.depositPaid,
              depositPaidDate: latestReg.depositPaidDate,
              remainingPaid: (latestReg as any).remainingPaid,
              remainingPaidDate: (latestReg as any).remainingPaidDate,
              // Full payment fields
              fullPaymentPaid: latestReg.fullPaymentPaid,
              fullPaymentPaidDate: (latestReg as any).fullPaymentPaidDate,
              fullPaymentSlipUrl: (latestReg as any).fullPaymentSlipUrl,
              // ✅ CRITICAL: Payment amount fields - needed for frontend display!
              fullPaymentAmountPaid: (latestReg as any).fullPaymentAmountPaid || 0,
              depositAmountPaid: (latestReg as any).depositAmountPaid || 0,
              remainingAmountPaid: (latestReg as any).remainingAmountPaid || 0,
              paidAmount: (latestReg as any).paidAmount || 0,
              // Legacy slip URLs - kept for backward compatibility during migration
              depositSlipUrl: latestReg.depositSlipUrl,
              remainingSlipUrl: latestReg.remainingSlipUrl,
              depositDeadline: latestReg.depositDeadline,
              remainingDeadline: latestReg.remainingDeadline,
              // Use actual paymentStatus from Firestore (updated by GAS webhook and approve/reject)
              // NOT determinePaymentStatus() which is legacy logic
              paymentStatus: latestReg.paymentStatus || 'รอชำระเงิน',
              // Additional payments
              additionalPayments: (latestReg as any).additionalPayments || '',
              // Attendee type selections, room allocations, and special charges (New)
              attendeeTypeSelections,
              roomAllocations,
              specialCharges,
              // Payment slips from new collection (New)
              paymentSlips,
              paymentSummary,
            };
          }
        }
      } catch (err) {
        console.error('Error fetching registrations:', err);
        // Continue without registration data
      }
    }

    // Get member name and contact info for pre-filling registration form and contact card
    let memberName = '';
    let memberPhone = '';
    let memberStatus = '';
    let lineGroupStatus = '';
    let companyName = '';
    let licenseNumber = '';
    let lineDisplayName = '';
    let lineProfilePicture = '';

    if (session.user.memberId) {
      try {
        const { getMemberById } = await import('@/lib/google-sheets');
        const member = await getMemberById(session.user.memberId);
        if (member) {
          memberName = member.fullNameTH || member.nickname || '';
          memberPhone = member.mobile || member.phone || '';
          memberStatus = member.status || '';
          lineGroupStatus = member.lineGroupStatus || '';
          companyName = member.companyNameTH || member.companyNameEN || '';
          licenseNumber = member.licenseNumber || '';
        }
      } catch (err) {
        console.error('Error fetching member info:', err);
      }
    }

    // Get LINE profile info from session
    if (session.user.id) {
      lineDisplayName = (session.user as any).lineDisplayName || session.user.name || '';
      lineProfilePicture = (session.user as any).lineProfilePicture || session.user.image || '';
    }

    return NextResponse.json({
      event,
      summary,
      userRegistration,
      memberName,
      memberPhone,
      memberStatus,
      lineGroupStatus,
      companyName,
      licenseNumber,
      lineDisplayName,
      lineProfilePicture,
    });
  } catch (error) {
    console.error('Error fetching event detail:', error);
    return NextResponse.json({ error: 'Failed to fetch event' }, { status: 500 });
  }
}
