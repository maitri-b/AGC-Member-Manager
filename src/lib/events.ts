// Firestore Service for Event Registration Data
import {
  Event,
  EventRegistration,
  DEFAULT_EVENTS,
  MemberAttendance,
  EventAttendanceRecord,
  parseEventDate,
  isWithinLastMonths,
} from '@/types/event';
import { getAllMembers } from './google-sheets';
import { adminDb } from './firebase-admin';

// Cache for events from Firestore
let eventsCache: Event[] | null = null;
let eventsCacheTime: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

// Helper to safely parse boolean from any value
const parseBoolean = (value: unknown, defaultValue: boolean): boolean => {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return defaultValue;
};

// Get events from Firestore (with fallback to default)
export async function getTrackedEventsFromFirestore(): Promise<Event[]> {
  // Return cached if valid
  if (eventsCache && Date.now() - eventsCacheTime < CACHE_TTL) {
    return eventsCache;
  }

  try {
    const db = adminDb();
    const eventsSnapshot = await db.collection('events').orderBy('year', 'desc').get();

    if (eventsSnapshot.empty) {
      // Return default events if Firestore is empty
      eventsCache = DEFAULT_EVENTS;
      eventsCacheTime = Date.now();
      return DEFAULT_EVENTS;
    }

    const events = eventsSnapshot.docs.map(doc => {
      const data = doc.data();

      return {
        eventId: doc.id,
        eventName: data.eventName || '',
        eventNameEN: data.eventNameEN || '',
        eventDate: data.eventDate || '',
        eventEndDate: data.eventEndDate || '',
        location: data.location || '',
        description: data.description || '',
        year: data.year || 0,
        isActive: parseBoolean(data.isActive, true),
        isPublished: parseBoolean(data.isPublished, false),
        countsAttendance: parseBoolean(data.countsAttendance, true),
        maxCapacity: data.maxCapacity ?? 0,
        maxPerCompany: data.maxPerCompany ?? 0,
        registrationFee: data.registrationFee ?? 0,
        pricingType: data.pricingType || 'fixed',
        baseFee: data.baseFee ?? 0,
        additionalFeePerPerson: data.additionalFeePerPerson ?? 0,
        priceTiers: data.priceTiers || undefined,
        memberDiscount: data.memberDiscount ?? 0,
        registrationOpen: parseBoolean(data.registrationOpen, false),
        documentName: data.documentName || '',
        documentUrl: data.documentUrl || '',
        mainImageUrl: data.mainImageUrl || '',
        paymentBankName: data.paymentBankName || '',
        paymentAccountName: data.paymentAccountName || '',
        paymentAccountNumber: data.paymentAccountNumber || '',
        paymentQrCodeUrl: data.paymentQrCodeUrl || '',
        paymentTerms: data.paymentTerms || '',
        paymentSlipSubmissionUrl: data.paymentSlipSubmissionUrl || '',
        // Deposit payment configuration
        paymentMode: data.paymentMode || 'full',
        depositAmount: data.depositAmount ?? 0,
        depositPercentage: data.depositPercentage ?? 0,
        useDepositPercentage: parseBoolean(data.useDepositPercentage, false),
        depositDeadlineType: data.depositDeadlineType || 'none',
        depositDeadlineFixed: data.depositDeadlineFixed || '',
        depositDeadlineHours: data.depositDeadlineHours ?? 0,
        remainingDeadlineType: data.remainingDeadlineType || 'none',
        remainingDeadlineFixed: data.remainingDeadlineFixed || '',
        remainingDeadlineHours: data.remainingDeadlineHours ?? 0,
        // Registration edit control
        allowMemberEdit: parseBoolean(data.allowMemberEdit, true),
        // Attendee type pricing
        useAttendeeTypePricing: parseBoolean(data.useAttendeeTypePricing, false),
        attendeeTypes: data.attendeeTypes || [],
        // Room allocation
        roomTypes: data.roomTypes || [],
        // Carpool feature
        hasCarpoolFeature: parseBoolean(data.hasCarpoolFeature, false),
        carpoolSettings: data.carpoolSettings || undefined,
        // Cancellation policy
        cancellationPolicy: data.cancellationPolicy || undefined,
        // Convert Firestore Timestamps to ISO strings
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || '',
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || '',
        createdBy: data.createdBy || '',
        updatedBy: data.updatedBy || '',
      };
    }) as Event[];

    eventsCache = events;
    eventsCacheTime = Date.now();
    return events;
  } catch (error) {
    console.error('Error fetching events from Firestore:', error);
    // Fallback to default events on error
    return DEFAULT_EVENTS;
  }
}

// Clear events cache (call after CRUD operations)
export function clearEventsCache() {
  eventsCache = null;
  eventsCacheTime = 0;
}

// Get all registrations from Firestore by eventId
async function getEventRegistrationsFromFirestore(eventId: string): Promise<EventRegistration[]> {
  try {
    const db = adminDb();
    const snapshot = await db
      .collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .get();

    if (snapshot.empty) {
      console.log(`[getEventRegistrationsFromFirestore] No registrations found for event ${eventId}`);
      return [];
    }

    const registrations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        registrationId: data.registrationId || '',
        registrationDate: data.registeredAt || '',
        eventId: data.eventId || '',
        userId: data.userId || '',
        lineUserId: data.lineUserId || '',
        memberId: data.memberId || '',
        companyName: data.companyName || '',
        licenseNumber: data.licenseNumber || '',
        contactName: data.contactName || '',
        contactPhone: data.phone || '',
        contactEmail: data.email || '',
        hasClubRep: data.hasClubRep || false,
        lineRepName: data.lineRepName || '',
        attendeeCount: data.attendeeCount || 0,
        attendeeNames: data.attendeeNames || '',
        shirtCount: data.shirtCount || 0,
        shirtSizes: data.shirtSizes || '',
        shirtReceived: data.shirtReceived || false,
        eventFee: data.eventFee || 0,
        roomFee: data.roomFee || 0,
        shirtFee: data.shirtFee || 0,
        totalAmount: data.totalAmount || 0,
        slipUrl: data.remainingSlipUrl || data.depositSlipUrl || '',
        depositAmount: data.depositAmount || 0,
        remainingAmount: data.remainingAmount || 0,
        depositPaid: data.depositPaid || false,
        depositPaidDate: data.depositPaidDate || '',
        remainingPaidDate: data.remainingPaidDate || '',
        depositSlipUrl: data.depositSlipUrl || '',
        remainingSlipUrl: data.remainingSlipUrl || '',
        // Full payment fields
        fullPaymentSlipUrl: data.fullPaymentSlipUrl || '',
        fullPaymentPaid: data.fullPaymentPaid || false,
        fullPaymentPaidDate: data.fullPaymentPaidDate || '',
        fullPaymentAmountPaid: data.fullPaymentAmountPaid || 0,
        fullPaymentDeadline: data.fullPaymentDeadline || '',
        remainingPaid: data.remainingPaid || false,
        remainingAmountPaid: data.remainingAmountPaid || 0,
        depositAmountPaid: data.depositAmountPaid || 0,
        additionalPaymentAmountPaid: data.additionalPaymentAmountPaid || 0,
        paidAmount: data.paidAmount || 0,
        depositDeadline: data.depositDeadline || '',
        remainingDeadline: data.remainingDeadline || '',
        paymentStatus: data.paymentStatus || 'pending',
        status: data.status || 'pending',
        verifiedBy: data.verifiedBy || '',
        verifiedDate: data.verifiedDate || '',
        attendanceType: data.attendanceType || '',
        clientToken: data.clientToken || '',
        codeParent: data.codeParent || '',
        tableCode: data.tableCode || '',
        specialRequests: data.specialRequests || '',
        cardReceived: data.cardReceived || false,
        adminNotes: data.adminNotes || '',
        lastUpdateInfo: data.lastUpdateInfo || '',
        tableNumber: data.tableNumber || '',
        codeSplit: data.codeSplit || '',
        checkinSections: data.checkinSections || '',
        attendeeTypeSelections: data.attendeeTypeSelections || '',
        roomAllocations: data.roomAllocations || '',
        roomAssignments: data.roomAssignments || '',
        specialCharges: data.specialCharges || '',
        discounts: data.discounts || '',
        notes: data.notes || '',
      } as EventRegistration;
    });

    console.log(`[getEventRegistrationsFromFirestore] Found ${registrations.length} registrations for event ${eventId}`);
    return registrations;
  } catch (error) {
    console.error(`[getEventRegistrationsFromFirestore] Error fetching registrations for event ${eventId}:`, error);
    return [];
  }
}

// Add a new registration to Firestore
export async function addEventRegistrationToFirestore(
  eventId: string,
  registrationData: Record<string, unknown>
): Promise<string> {
  try {
    const db = adminDb();

    // Add to Firestore with auto-generated document ID
    const docRef = await db.collection('eventRegistrations').add({
      ...registrationData,
      eventId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log(`[addEventRegistrationToFirestore] Added registration ${registrationData.registrationId} to Firestore with doc ID ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error(`[addEventRegistrationToFirestore] Error adding registration:`, error);
    throw error;
  }
}

// Update an existing registration in Firestore
export async function updateEventRegistrationInFirestore(
  registrationId: string,
  updateData: Record<string, unknown>
): Promise<boolean> {
  try {
    const db = adminDb();

    // Find the document by registrationId
    const snapshot = await db
      .collection('eventRegistrations')
      .where('registrationId', '==', registrationId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.error(`[updateEventRegistrationInFirestore] Registration not found: ${registrationId}`);
      return false;
    }

    const doc = snapshot.docs[0];
    await doc.ref.update({
      ...updateData,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[updateEventRegistrationInFirestore] Updated registration ${registrationId}`);
    return true;
  } catch (error) {
    console.error(`[updateEventRegistrationInFirestore] Error updating registration:`, error);
    throw error;
  }
}

// Get registrations for an event by eventId (reads from Firestore)
export async function getEventRegistrationsByEventId(eventId: string): Promise<EventRegistration[]> {
  return getEventRegistrationsFromFirestore(eventId);
}

// Get single registration by registrationId
export async function getEventRegistrationByRegistrationId(registrationId: string): Promise<EventRegistration | null> {
  try {
    const db = adminDb();
    const snapshot = await db
      .collection('eventRegistrations')
      .where('registrationId', '==', registrationId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return doc.data() as EventRegistration;
  } catch (error) {
    console.error(`Error fetching registration ${registrationId}:`, error);
    return null;
  }
}

// Get only "agent" type registrations (club members)
export async function getAgentRegistrations(eventId: string): Promise<EventRegistration[]> {
  const registrations = await getEventRegistrationsByEventId(eventId);
  return registrations.filter(r =>
    r.attendanceType?.toLowerCase() === 'agent' ||
    !r.attendanceType // Include if no type specified (legacy data)
  );
}

// Get registration by license number for a specific event
export async function getRegistrationByLicense(eventId: string, licenseNumber: string): Promise<EventRegistration | null> {
  const registrations = await getEventRegistrationsByEventId(eventId);
  const normalizedLicense = licenseNumber.trim().replace(/\s+/g, '');

  return registrations.find(r => {
    const regLicense = (r.licenseNumber || '').trim().replace(/\s+/g, '');
    return regLicense === normalizedLicense;
  }) || null;
}

// Get all registrations for a specific license number across all events
export async function getRegistrationsByLicense(licenseNumber: string): Promise<{ eventId: string; eventName: string; registration: EventRegistration }[]> {
  const results: { eventId: string; eventName: string; registration: EventRegistration }[] = [];
  const normalizedLicense = licenseNumber.trim().replace(/\s+/g, '');

  const events = await getTrackedEventsFromFirestore();

  for (const event of events) {
    const registrations = await getEventRegistrationsByEventId(event.eventId);
    const matchingReg = registrations.find(r => {
      const regLicense = (r.licenseNumber || '').trim().replace(/\s+/g, '');
      return regLicense === normalizedLicense;
    });

    if (matchingReg) {
      results.push({
        eventId: event.eventId,
        eventName: event.eventName,
        registration: matchingReg,
      });
    }
  }

  return results;
}

// Build member attendance summary
export async function getMemberAttendanceSummary(memberId: string): Promise<MemberAttendance | null> {
  // Get member info
  const members = await getAllMembers();
  const member = members.find(m => m.memberId === memberId);

  if (!member) {
    return null;
  }

  console.log(`getMemberAttendanceSummary: Fetching attendance for member ${memberId} (license: ${member.licenseNumber})`);

  // Find all event registrations by license number
  const eventRecords = await getRegistrationsByLicense(member.licenseNumber);
  console.log(`getMemberAttendanceSummary: Found ${eventRecords.length} event records for license ${member.licenseNumber}`);

  const currentYear = new Date().getFullYear();
  const eventsAttended: EventAttendanceRecord[] = [];
  let eventsThisYear = 0;
  let eventsLast12Months = 0;
  let lastEventName = '';
  let lastEventDate = '';
  let lastEventParsedDate: Date | null = null;

  const events = await getTrackedEventsFromFirestore();

  for (const record of eventRecords) {
    const event = events.find(e => e.eventId === record.eventId);
    if (!event) {
      console.log(`getMemberAttendanceSummary: Event ${record.eventId} not found in tracked events`);
      continue;
    }

    // Check if confirmed/attended - include Thai status values
    const status = record.registration.status || '';
    const statusLower = status.toLowerCase();
    const isConfirmed =
      statusLower === 'confirmed' ||
      statusLower === 'attended' ||
      status.includes('ยืนยัน') ||
      status.includes('ตรวจสอบแล้ว') ||
      status.includes('ยืนยันแล้ว');

    console.log(`getMemberAttendanceSummary: Event "${event.eventName}" (${event.eventDate}) - status: ${status}, isConfirmed: ${isConfirmed}`);

    if (isConfirmed) {
      const attendanceRecord: EventAttendanceRecord = {
        eventId: record.eventId,
        eventName: record.eventName,
        eventDate: event.eventDate,
        eventEndDate: event.eventEndDate || '',
        registrationId: record.registration.registrationId,
        attendeeNames: record.registration.attendeeNames,
        attendeeCount: record.registration.attendeeCount,
        status: record.registration.status,
        checkedIn: !!record.registration.checkinSections,
      };

      eventsAttended.push(attendanceRecord);

      // Check if this event is in current year (legacy - for backward compatibility)
      const eventYear = event.year ? event.year - 543 : currentYear;
      if (eventYear === currentYear) {
        eventsThisYear++;
      }

      // Check if this event is within last 12 months (new logic)
      const withinLast12 = isWithinLastMonths(event.eventDate, 12);
      console.log(`getMemberAttendanceSummary: Event "${event.eventName}" within 12 months: ${withinLast12}`);
      if (withinLast12) {
        eventsLast12Months++;
      }

      // Track last event (find the most recent one by date)
      const eventParsedDate = parseEventDate(event.eventDate);
      if (eventParsedDate && (!lastEventParsedDate || eventParsedDate > lastEventParsedDate)) {
        lastEventName = record.eventName;
        lastEventDate = event.eventDate;
        lastEventParsedDate = eventParsedDate;
      }
    }
  }

  console.log(`getMemberAttendanceSummary: Total confirmed events: ${eventsAttended.length}, within 12 months: ${eventsLast12Months}`);

  // Sort eventsAttended by date (most recent first)
  eventsAttended.sort((a, b) => {
    const dateA = parseEventDate(a.eventDate);
    const dateB = parseEventDate(b.eventDate);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateB.getTime() - dateA.getTime();
  });

  return {
    memberId: member.memberId,
    memberName: member.fullNameTH || member.nickname || '',
    companyName: member.companyNameTH || member.companyNameEN || '',
    licenseNumber: member.licenseNumber,
    eventsAttended,
    totalEventsThisYear: eventsThisYear,
    eventsLast12Months,
    lastAttendedEvent: lastEventName,
    lastAttendedDate: lastEventDate,
    noActivityWarning: eventsLast12Months === 0,
  };
}

// Helper to check if a registration is cancelled
function isRegistrationCancelled(reg: EventRegistration): boolean {
  const rawStatus = reg.status;
  const status = typeof rawStatus === 'string' ? rawStatus : String(rawStatus || '');
  const statusLower = status.toLowerCase();
  return statusLower === 'cancelled' || status.includes('ยกเลิก');
}

// Helper to check if a registration is confirmed/attended
function isRegistrationConfirmed(reg: EventRegistration): boolean {
  const rawStatus = reg.status;
  const status = typeof rawStatus === 'string' ? rawStatus : String(rawStatus || '');
  const statusLower = status.toLowerCase();
  return (
    statusLower === 'confirmed' ||
    statusLower === 'attended' ||
    status.includes('ยืนยัน') ||
    status.includes('ตรวจสอบแล้ว') ||
    status.includes('ยืนยันแล้ว')
  );
}

// Helper to normalize license number for matching
function normalizeLicenseNumber(license: string): string {
  if (!license) return '';
  return license.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

// Get all members' attendance summary for an event
export async function getEventAttendanceSummary(eventId: string): Promise<{
  event: Event | undefined;
  totalRegistrations: number;
  agentRegistrations: number;
  confirmedCount: number;
  totalAttendees: number;
  attendees: {
    registration: EventRegistration;
    member: {
      memberId: string;
      fullNameTH: string;
      companyNameTH: string;
    } | null;
  }[];
}> {
  const events = await getTrackedEventsFromFirestore();
  const event = events.find(e => e.eventId === eventId);
  if (!event) {
    return {
      event: undefined,
      totalRegistrations: 0,
      agentRegistrations: 0,
      confirmedCount: 0,
      totalAttendees: 0,
      attendees: [],
    };
  }

  const allRegistrations = await getEventRegistrationsByEventId(eventId);

  // Split registrations into active and cancelled
  const agentRegistrationsActive = allRegistrations.filter(r =>
    (r.attendanceType?.toLowerCase() === 'agent' || !r.attendanceType) && !isRegistrationCancelled(r)
  );

  const agentRegistrationsCancelled = allRegistrations.filter(r =>
    isRegistrationCancelled(r)
  );

  const members = await getAllMembers();

  // Deduplicate ACTIVE registrations by license number or memberId
  const licenseMap = new Map<string, EventRegistration>();

  for (const reg of agentRegistrationsActive) {
    const normalizedLicense = normalizeLicenseNumber(reg.licenseNumber || '');
    const memberId = reg.memberId || '';

    let key = '';
    if (normalizedLicense) {
      key = `LICENSE_${normalizedLicense}`;
    } else if (memberId) {
      key = `MEMBER_${memberId}`;
    } else {
      key = `USER_${reg.lineUserId || reg.registrationId}`;
    }

    const existing = licenseMap.get(key);
    if (!existing) {
      licenseMap.set(key, reg);
    } else {
      const existingDate = existing.registrationDate || '';
      const currentDate = reg.registrationDate || '';
      if (currentDate > existingDate) {
        licenseMap.set(key, reg);
      }
    }
  }

  // Build attendees list from active registrations
  const attendees: {
    registration: EventRegistration;
    member: {
      memberId: string;
      fullNameTH: string;
      companyNameTH: string;
    } | null;
  }[] = [];

  let confirmedCount = 0;
  let totalAttendees = 0;

  for (const [, reg] of licenseMap) {
    const normalizedLicense = normalizeLicenseNumber(reg.licenseNumber || '');
    const member = members.find(m => {
      const memberLicense = normalizeLicenseNumber(m.licenseNumber || '');
      return memberLicense && memberLicense === normalizedLicense;
    });

    attendees.push({
      registration: reg,
      member: member ? {
        memberId: member.memberId,
        fullNameTH: member.fullNameTH,
        companyNameTH: member.companyNameTH,
      } : null,
    });

    if (isRegistrationConfirmed(reg)) {
      confirmedCount++;
    }
    totalAttendees += reg.attendeeCount || 0;
  }

  // Add cancelled registrations to the attendees list
  for (const reg of agentRegistrationsCancelled) {
    const normalizedLicense = normalizeLicenseNumber(reg.licenseNumber || '');
    const member = members.find(m => {
      const memberLicense = normalizeLicenseNumber(m.licenseNumber || '');
      return memberLicense && memberLicense === normalizedLicense;
    });

    attendees.push({
      registration: reg,
      member: member ? {
        memberId: member.memberId,
        fullNameTH: member.fullNameTH,
        companyNameTH: member.companyNameTH,
      } : null,
    });
  }

  const activeRegistrationsCount = allRegistrations.filter(r => !isRegistrationCancelled(r)).length;

  return {
    event,
    totalRegistrations: activeRegistrationsCount,
    agentRegistrations: licenseMap.size,
    confirmedCount,
    totalAttendees,
    attendees,
  };
}

// Get yearly attendance report for all members
export async function getYearlyAttendanceReport(year: number): Promise<{
  year: number;
  yearBE: number;
  totalMembers: number;
  membersWithAttendance: number;
  membersMeetingRequirement: number;
  membersNotMeetingRequirement: number;
  attendanceData: MemberAttendance[];
}> {
  const members = await getAllMembers();
  const activeMembers = members.filter(m =>
    m.status?.toLowerCase() === 'active' || m.status === 'ปกติ'
  );

  const attendanceData: MemberAttendance[] = [];

  for (const member of activeMembers) {
    const attendance = await getMemberAttendanceSummary(member.memberId);
    if (attendance) {
      attendanceData.push(attendance);
    }
  }

  const membersWithAttendance = attendanceData.filter(a => a.eventsLast12Months > 0).length;
  const membersMeetingRequirement = attendanceData.filter(a => a.eventsLast12Months >= 1).length;

  return {
    year,
    yearBE: year + 543,
    totalMembers: activeMembers.length,
    membersWithAttendance,
    membersMeetingRequirement,
    membersNotMeetingRequirement: activeMembers.length - membersMeetingRequirement,
    attendanceData,
  };
}

// Get list of tracked events
export async function getTrackedEvents(): Promise<Event[]> {
  return getTrackedEventsFromFirestore();
}

// Get event by ID
export async function getEventById(eventId: string): Promise<Event | undefined> {
  const events = await getTrackedEventsFromFirestore();
  return events.find(e => e.eventId === eventId);
}

// ============================================================================
// ATTENDANCE CACHE SYSTEM
// Pre-compute attendance data to avoid N*M queries (members * events)
// ============================================================================

interface AttendanceCacheEntry {
  memberId: string;
  licenseNumber: string;
  hasRecentActivity: boolean;
  eventsLast12Months: number;
  lastUpdated: string;
}

interface AttendanceCacheDoc {
  attendance: Record<string, AttendanceCacheEntry>;
  builtAt: string;
  eventCount: number;
  memberCount: number;
}

const ATTENDANCE_CACHE_COLLECTION = 'cache';
const ATTENDANCE_CACHE_DOC_ID = 'memberAttendance';

/**
 * Get cached attendance data from Firestore
 * Returns null if cache doesn't exist or is stale
 */
export async function getAttendanceCache(): Promise<Record<string, AttendanceCacheEntry> | null> {
  try {
    const db = adminDb();
    const cacheDoc = await db.collection(ATTENDANCE_CACHE_COLLECTION).doc(ATTENDANCE_CACHE_DOC_ID).get();

    if (!cacheDoc.exists) {
      return null;
    }

    const data = cacheDoc.data() as AttendanceCacheDoc;

    // Check if cache is older than 24 hours
    const builtAt = new Date(data.builtAt);
    const now = new Date();
    const hoursSinceBuilt = (now.getTime() - builtAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceBuilt > 24) {
      console.log('Attendance cache is stale (>24 hours old)');
      return null;
    }

    return data.attendance;
  } catch (error) {
    console.error('Error reading attendance cache:', error);
    return null;
  }
}

/**
 * Build and store attendance cache
 * @param months - Number of months to look back (default: 12)
 */
export async function buildAttendanceCache(months: number = 12): Promise<{ success: boolean; memberCount: number; eventCount: number; confirmedCount: number }> {
  try {
    const db = adminDb();

    // 1. Get all members
    const members = await getAllMembers();
    const licenseToMemberMap: Record<string, { memberId: string; licenseNumber: string }> = {};

    for (const member of members) {
      if (member.licenseNumber) {
        const normalizedLicense = normalizeLicenseNumber(member.licenseNumber);
        if (normalizedLicense) {
          licenseToMemberMap[normalizedLicense] = {
            memberId: member.memberId,
            licenseNumber: member.licenseNumber,
          };
        }
      }
    }

    console.log(`buildAttendanceCache: ${members.length} members, ${Object.keys(licenseToMemberMap).length} with license, looking back ${months} months`);

    // 2. Get all events
    const events = await getTrackedEventsFromFirestore();
    console.log(`buildAttendanceCache: Found ${events.length} events`);

    // 3. Build attendance count per license number
    const licenseAttendance: Record<string, number> = {};
    let totalConfirmed = 0;

    for (const event of events) {
      if (!event.countsAttendance) {
        console.log(`buildAttendanceCache: Skipping event ${event.eventId} - countsAttendance is false`);
        continue;
      }

      if (!isWithinLastMonths(event.eventDate, months)) {
        console.log(`buildAttendanceCache: Skipping event ${event.eventId} - not within ${months} months`);
        continue;
      }

      console.log(`buildAttendanceCache: Processing event ${event.eventId} (${event.eventName})`);

      try {
        const registrations = await getEventRegistrationsByEventId(event.eventId);
        console.log(`buildAttendanceCache: Found ${registrations.length} registrations for ${event.eventId}`);

        let confirmedInEvent = 0;
        for (const reg of registrations) {
          if (!reg.licenseNumber) {
            continue;
          }

          const status = reg.status || '';
          const statusLower = status.toLowerCase();
          const isConfirmed =
            statusLower === 'confirmed' ||
            statusLower === 'attended' ||
            status.includes('ยืนยัน') ||
            status.includes('ตรวจสอบแล้ว') ||
            status.includes('ยืนยันแล้ว');

          if (isConfirmed) {
            const normalizedLicense = normalizeLicenseNumber(reg.licenseNumber);
            if (normalizedLicense) {
              licenseAttendance[normalizedLicense] = (licenseAttendance[normalizedLicense] || 0) + 1;
              confirmedInEvent++;
              totalConfirmed++;
            }
          }
        }
        console.log(`buildAttendanceCache: ${confirmedInEvent} confirmed registrations in ${event.eventName}`);
      } catch (err) {
        console.error(`Error processing event ${event.eventId}:`, err);
      }
    }

    console.log(`buildAttendanceCache: Total confirmed registrations: ${totalConfirmed}`);

    // 4. Build cache entries for all members
    const attendanceCache: Record<string, AttendanceCacheEntry> = {};
    const now = new Date().toISOString();
    let membersWithActivity = 0;

    for (const member of members) {
      const normalizedLicense = normalizeLicenseNumber(member.licenseNumber || '');
      const eventsLast12Months = normalizedLicense ? (licenseAttendance[normalizedLicense] || 0) : 0;

      if (eventsLast12Months > 0) {
        membersWithActivity++;
      }

      attendanceCache[member.memberId] = {
        memberId: member.memberId,
        licenseNumber: member.licenseNumber || '',
        hasRecentActivity: eventsLast12Months > 0,
        eventsLast12Months,
        lastUpdated: now,
      };
    }

    console.log(`buildAttendanceCache: ${membersWithActivity} members with recent activity`);

    // 5. Save to Firestore
    const cacheDoc: AttendanceCacheDoc = {
      attendance: attendanceCache,
      builtAt: now,
      eventCount: events.filter(e => isWithinLastMonths(e.eventDate, months)).length,
      memberCount: members.length,
    };

    await db.collection(ATTENDANCE_CACHE_COLLECTION).doc(ATTENDANCE_CACHE_DOC_ID).set(cacheDoc);

    console.log(`Attendance cache built: ${members.length} members, ${cacheDoc.eventCount} recent events, ${membersWithActivity} with activity`);

    return {
      success: true,
      memberCount: members.length,
      eventCount: cacheDoc.eventCount,
      confirmedCount: totalConfirmed,
    };
  } catch (error) {
    console.error('Error building attendance cache:', error);
    return { success: false, memberCount: 0, eventCount: 0, confirmedCount: 0 };
  }
}

/**
 * Invalidate attendance cache
 */
export async function invalidateAttendanceCache(): Promise<void> {
  try {
    const db = adminDb();
    await db.collection(ATTENDANCE_CACHE_COLLECTION).doc(ATTENDANCE_CACHE_DOC_ID).delete();
    console.log('Attendance cache invalidated');
  } catch (error) {
    console.error('Error invalidating attendance cache:', error);
  }
}

/**
 * Auto-rebuild attendance cache if needed
 */
export async function autoRebuildAttendanceCache(): Promise<void> {
  try {
    console.log('Auto-rebuilding attendance cache...');
    await buildAttendanceCache();
  } catch (error) {
    console.error('Error auto-rebuilding attendance cache:', error);
  }
}

/**
 * Get attendance status for all members (using cache)
 */
export async function getAllMembersAttendanceStatus(): Promise<Record<string, AttendanceCacheEntry>> {
  let cache = await getAttendanceCache();

  if (!cache) {
    console.log('Attendance cache miss - building cache...');
    const result = await buildAttendanceCache();
    if (result.success) {
      cache = await getAttendanceCache();
    }
  }

  return cache || {};
}
