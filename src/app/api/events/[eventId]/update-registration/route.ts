// API Route for Updating Event Registration (Member self-service)
import { NextRequest, NextResponse } from 'next/server';
import { getEffectiveSession } from '@/lib/impersonation';
import { adminDb } from '@/lib/firebase-admin';
import { getEventRegistrationsByEventId, updateEventRegistrationInFirestore } from '@/lib/events';
import { EventRegistration, calculateRegistrationFee, Event } from '@/types/event';
import { sheetsCache, CacheKeys } from '@/lib/cache/google-sheets-cache';

// Helper function to check if registration is cancelled
function isRegistrationCancelled(registration: EventRegistration): boolean {
  const status = registration.status || '';
  const statusLower = status.toLowerCase();
  return statusLower === 'cancelled' || status.includes('ยกเลิก');
}

// PUT - Update registration (Member can only update their own registration)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getEffectiveSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.user.memberId) {
      return NextResponse.json({ error: 'กรุณาเชื่อมต่อบัญชีสมาชิกก่อน' }, { status: 400 });
    }

    const { eventId } = await params;
    const body = await request.json();
    const { attendeeCount, attendeeNames, specialRequests, attendeeTypeSelections, roomAllocations, requestNameChange } = body;

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    // ✅ Removed sheetName dependency - all events use Firestore now

    // Get existing registrations
    let existingRegistrations: EventRegistration[] = [];
    try {
      existingRegistrations = await getEventRegistrationsByEventId(eventId);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      return NextResponse.json({ error: 'ไม่สามารถโหลดข้อมูลได้' }, { status: 500 });
    }

    // Find user's registration (by LINE user ID or member ID)
    console.log('[Update Registration] Looking for user registration:', {
      userId: session.user.id,
      memberId: session.user.memberId,
      totalRegistrations: existingRegistrations.length,
    });

    const userReg = existingRegistrations.find(r => {
      const match = (
        (session.user.id && r.lineUserId === session.user.id) ||
        (session.user.memberId && r.memberId === session.user.memberId)
      );
      if (match) {
        console.log('[Update Registration] Found matching registration:', {
          registrationId: r.registrationId,
          lineUserId: r.lineUserId,
          memberId: r.memberId,
        });
      }
      return match;
    });

    if (!userReg) {
      console.error('[Update Registration] User registration not found. Available registrations:',
        existingRegistrations.map(r => ({
          registrationId: r.registrationId,
          lineUserId: r.lineUserId,
          memberId: r.memberId,
        }))
      );
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
      if (eventData?.maxCapacity && eventData.maxCapacity > 0) {
        // Calculate current total excluding cancelled registrations
        const activeRegistrations = existingRegistrations.filter(r => !isRegistrationCancelled(r));
        const currentTotal = activeRegistrations.reduce((sum, r) => sum + (r.attendeeCount || 1), 0);
        const difference = attendeeCount - userReg.attendeeCount;
        const newTotal = currentTotal + difference;

        if (newTotal > eventData.maxCapacity) {
          const availableSlots = eventData.maxCapacity - currentTotal + userReg.attendeeCount;
          return NextResponse.json({
            error: `ไม่สามารถเพิ่มจำนวนผู้เข้าร่วมได้ เนื่องจากที่นั่งเหลือเพียง ${availableSlots} ที่ (คุณลงทะเบียนไว้ ${userReg.attendeeCount} ที่ และพยายามเปลี่ยนเป็น ${attendeeCount} ที่)`,
          }, { status: 400 });
        }
      }

      // Validate against maxPerCompany
      if (eventData?.maxPerCompany && eventData.maxPerCompany > 0 && attendeeCount > eventData.maxPerCompany) {
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
        eventName: eventData?.eventName || '',
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

    // Update attendee count and/or names
    const updateData: Record<string, unknown> = {};

    // Check if attendee count, attendee type selections, or room allocations changed
    const attendeeCountChanged = attendeeCount !== undefined && attendeeCount !== userReg.attendeeCount;
    const attendeeTypeSelectionsChanged = attendeeTypeSelections && JSON.stringify(attendeeTypeSelections) !== (userReg.attendeeTypeSelections || '[]');
    const roomAllocationsChanged = roomAllocations && JSON.stringify(roomAllocations) !== (userReg.roomAllocations || '[]');

    if (attendeeCountChanged || attendeeTypeSelectionsChanged || roomAllocationsChanged) {
      if (attendeeCountChanged) {
        updateData.attendee_count = attendeeCount;
      }

      // Calculate total amount
      let totalFee = 0;
      if (eventData?.useAttendeeTypePricing && eventData?.attendeeTypes) {
        // Calculate fee based on attendee types
        const selections = attendeeTypeSelections || [];
        if (selections.length === 0) {
          return NextResponse.json({ error: 'กรุณาระบุจำนวนผู้เข้าร่วมตามประเภท' }, { status: 400 });
        }

        // Validate count
        const calculatedCount = selections.reduce((sum: number, s: { typeId: string; quantity: number }) => sum + s.quantity, 0);
        if (calculatedCount !== attendeeCount) {
          return NextResponse.json({ error: 'จำนวนผู้เข้าร่วมไม่ตรงกัน' }, { status: 400 });
        }

        // Calculate fee from attendee types
        totalFee = selections.reduce((sum: number, s: { typeId: string; quantity: number }) => {
          const type = eventData?.attendeeTypes?.find((t: { typeId: string; price: number }) => t.typeId === s.typeId);
          if (!type) {
            return sum;
          }
          return sum + (type.price * s.quantity);
        }, 0);

        updateData.attendee_type_selections = JSON.stringify(attendeeTypeSelections);

        // Validate and calculate room allocation fees (if room types are configured)
        if (eventData?.roomTypes && eventData.roomTypes.length > 0) {
          const allocations = roomAllocations || [];
          if (allocations.length === 0) {
            return NextResponse.json({ error: 'กรุณาเลือกประเภทห้องพัก' }, { status: 400 });
          }

          // Calculate total room capacity and validate
          let totalRoomCapacity = 0;
          let roomFee = 0;
          for (const alloc of allocations) {
            const roomType = eventData?.roomTypes?.find((rt: { typeId: string; capacity: number; price: number }) => rt.typeId === alloc.roomTypeId);
            if (!roomType) {
              return NextResponse.json({ error: `ไม่พบประเภทห้อง: ${alloc.roomTypeId}` }, { status: 400 });
            }
            totalRoomCapacity += roomType.capacity * alloc.roomCount;
            roomFee += roomType.price * alloc.roomCount;
          }

          // Exact match required
          if (totalRoomCapacity !== attendeeCount) {
            return NextResponse.json({
              error: `จำนวนผู้เข้าพักในห้องไม่ตรงกับจำนวนผู้เข้าร่วม (รองรับ ${totalRoomCapacity} คน แต่ลงทะเบียน ${attendeeCount} คน)`
            }, { status: 400 });
          }

          // Add room fees to total
          totalFee += roomFee;
          updateData.room_allocations = JSON.stringify(roomAllocations);
        }
      } else {
        // Original fee calculation (fixed or tiered pricing)
        totalFee = calculateRegistrationFee(eventData as Event, attendeeCount, true); // true = isMember
      }

      if (totalFee > 0) {
        updateData.event_fee = totalFee;
        updateData.total_amount = totalFee;
      }
    }

    // Check if attendee names changed (compare with current names)
    if (attendeeNames && Array.isArray(attendeeNames)) {
      const newNamesJson = JSON.stringify(attendeeNames);
      const currentNamesJson = JSON.stringify(currentAttendeeNames);

      if (newNamesJson !== currentNamesJson) {
        updateData.attendee_names = newNamesJson;

        // ✅ Update names in all carpools that contain members from this registration
        try {
          const carpoolsSnapshot = await db.collection('carpools')
            .where('eventId', '==', eventId)
            .where('status', 'in', ['active', null])
            .get();

          const carpoolUpdates: Promise<any>[] = [];

          carpoolsSnapshot.docs.forEach(carpoolDoc => {
            const carpoolData = carpoolDoc.data();
            const members = carpoolData.members || [];

            // Check if any members belong to this registration
            const hasRegistrationMembers = members.some((m: any) => m.registrationId === userReg.registrationId);

            if (hasRegistrationMembers) {
              // Update member names using attendeeIndex
              const updatedMembers = members.map((m: any) => {
                if (m.registrationId === userReg.registrationId && m.attendeeIndex !== undefined) {
                  // Update name from new attendeeNames array
                  return {
                    ...m,
                    name: attendeeNames[m.attendeeIndex] || m.name, // Use new name from array
                  };
                }
                return m;
              });

              // Update carpool with new member names
              carpoolUpdates.push(
                db.collection('carpools').doc(carpoolDoc.id).update({
                  members: updatedMembers,
                  updatedAt: new Date().toISOString(),
                })
              );
            }
          });

          // Wait for all carpool updates to complete
          await Promise.all(carpoolUpdates);
          console.log(`[Update Registration] Updated names in ${carpoolUpdates.length} carpool(s)`);
        } catch (carpoolError) {
          console.error('[Update Registration] Error updating carpool names:', carpoolError);
          // Don't fail the entire update if carpool update fails
        }

        // ✅ Update names in all party tables that contain members from this registration
        try {
          const tablesSnapshot = await db.collection('partyTables')
            .where('eventId', '==', eventId)
            .where('status', '==', 'active')
            .get();

          const tableUpdates: Promise<any>[] = [];

          tablesSnapshot.docs.forEach(tableDoc => {
            const tableData = tableDoc.data();
            const members = tableData.members || [];

            // Check if any members belong to this registration
            const hasRegistrationMembers = members.some((m: any) => m.registrationId === userReg.registrationId);

            if (hasRegistrationMembers) {
              // Update member names using attendeeIndex
              const updatedMembers = members.map((m: any) => {
                if (m.registrationId === userReg.registrationId && m.attendeeIndex !== undefined) {
                  // Update name from new attendeeNames array
                  return {
                    ...m,
                    name: attendeeNames[m.attendeeIndex] || m.name,
                  };
                }
                return m;
              });

              // Update party table with new member names
              tableUpdates.push(
                db.collection('partyTables').doc(tableDoc.id).update({
                  members: updatedMembers,
                  updatedAt: new Date().toISOString(),
                })
              );
            }
          });

          // Wait for all party table updates to complete
          await Promise.all(tableUpdates);
          console.log(`[Update Registration] Updated names in ${tableUpdates.length} party table(s)`);
        } catch (tableError) {
          console.error('[Update Registration] Error updating party table names:', tableError);
          // Don't fail the entire update if party table update fails
        }
      }
    }

    // Check if special requests changed
    if (specialRequests !== undefined) {
      updateData.special_requests = specialRequests;
      updateData.special_requests_updated_at = new Date().toISOString();
    }

    if (Object.keys(updateData).length > 0) {
      updateData.last_update_info = JSON.stringify({
        ...JSON.parse(userReg.lastUpdateInfo || '{}'),
        updated: { by: 'member', at: new Date().toISOString() },
      });

      console.log('[Update Registration] Attempting update with data:', {
        registrationId: userReg.registrationId,
        updateData,
      });

      try {
        // Convert update data to Firestore format (camelCase)
        const firestoreUpdateData: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updateData)) {
          // Map snake_case keys to camelCase
          const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          firestoreUpdateData[camelKey] = value;
        }

        await updateEventRegistrationInFirestore(userReg.registrationId, firestoreUpdateData);

        // ✅ Invalidate caches for this event (so next request gets fresh data)
        sheetsCache.invalidate(CacheKeys.eventAttendees(eventId));
        sheetsCache.invalidate(`event:${eventId}:registrations`);
        sheetsCache.invalidate(CacheKeys.allEvents());

        console.log('[Update Registration] Update successful');

        return NextResponse.json({
          success: true,
          message: 'อัพเดทข้อมูลเรียบร้อยแล้ว',
        });
      } catch (updateError) {
        console.error('[Update Registration] Update failed:', updateError);
        throw updateError;
      }
    }

    return NextResponse.json({ error: 'ไม่มีข้อมูลที่ต้องอัพเดท' }, { status: 400 });
  } catch (error) {
    console.error('Error updating registration:', error);
    return NextResponse.json({ error: 'ไม่สามารถอัพเดทข้อมูลได้ กรุณาลองใหม่' }, { status: 500 });
  }
}
