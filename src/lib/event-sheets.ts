// Google Sheets Service for Event Registration Data
import { google } from 'googleapis';
import {
  Event,
  EventRegistration,
  COLUMN_TO_EVENT_REGISTRATION_MAP,
  DEFAULT_EVENTS,
  MemberAttendance,
  EventAttendanceRecord,
  parseEventDate,
  isWithinLastMonths,
} from '@/types/event';
import { getAllMembers } from './google-sheets';
import { adminDb } from './firebase-admin';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Cache for events from Firestore
let eventsCache: Event[] | null = null;
let eventsCacheTime: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

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
        location: data.location || '',
        description: data.description || '',
        sheetName: data.sheetName || '',
        year: data.year || 0,
        isActive: data.isActive ?? true,
        isPublished: data.isPublished ?? false,
        countsAttendance: data.countsAttendance ?? true,
        maxCapacity: data.maxCapacity ?? 0,
        registrationFee: data.registrationFee ?? 0,
        registrationOpen: data.registrationOpen ?? false,
        documentName: data.documentName || '',
        documentUrl: data.documentUrl || '',
        // Convert Firestore Timestamps to ISO strings
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || '',
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt || '',
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

// Initialize Google Sheets API
function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// Convert sheet row to EventRegistration object
function rowToEventRegistration(headers: string[], row: string[]): EventRegistration {
  const registration: Partial<EventRegistration> = {};

  headers.forEach((header, index) => {
    const value = row[index] || '';
    const normalizedHeader = header.toLowerCase().trim();
    const registrationKey = COLUMN_TO_EVENT_REGISTRATION_MAP[normalizedHeader];

    if (registrationKey) {
      // Skip if value is already set (prefer first occurrence)
      if ((registration as Record<string, unknown>)[registrationKey]) {
        return;
      }

      // Handle boolean fields
      if (registrationKey === 'hasClubRep' || registrationKey === 'shirtReceived' || registrationKey === 'cardReceived') {
        (registration as Record<string, unknown>)[registrationKey] =
          value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
      }
      // Handle number fields
      else if (['attendeeCount', 'shirtCount', 'eventFee', 'shirtFee', 'totalAmount'].includes(registrationKey)) {
        (registration as Record<string, unknown>)[registrationKey] = parseFloat(value) || 0;
      }
      // Handle string fields
      else {
        (registration as Record<string, unknown>)[registrationKey] = value;
      }
    }
  });

  return registration as EventRegistration;
}

// Get all registrations from a specific event sheet
export async function getEventRegistrations(sheetName: string): Promise<EventRegistration[]> {
  const sheets = getGoogleSheetsClient();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!A:AZ`, // Wide range to capture all columns
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    const headers = (rows[0] as string[]).map(h => h.toLowerCase().trim());
    const registrations = rows.slice(1).map((row) => rowToEventRegistration(headers, row as string[]));

    return registrations.filter((r) => r.registrationId); // Filter out empty rows
  } catch (error) {
    console.error(`Error fetching registrations from ${sheetName}:`, error);
    return [];
  }
}

// Add a new registration to an event sheet
export async function addEventRegistration(
  sheetName: string,
  registrationData: Record<string, unknown>
): Promise<boolean> {
  const sheets = getGoogleSheetsClient();

  try {
    // Get headers first
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!1:1`,
    });

    const headers = headerResponse.data.values?.[0] as string[];
    if (!headers || headers.length === 0) {
      console.error('No headers found in sheet:', sheetName);
      return false;
    }

    // Map registration data to row based on headers
    const newRow = headers.map(header => {
      const normalizedHeader = header.toLowerCase().trim();
      // Try direct match first
      if (registrationData[normalizedHeader] !== undefined) {
        return String(registrationData[normalizedHeader]);
      }
      // Try with underscore replaced by space
      const withSpace = normalizedHeader.replace(/_/g, ' ');
      if (registrationData[withSpace] !== undefined) {
        return String(registrationData[withSpace]);
      }
      // Try original header name
      if (registrationData[header] !== undefined) {
        return String(registrationData[header]);
      }
      return '';
    });

    // Append to sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!A:AZ`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [newRow],
      },
    });

    return true;
  } catch (error) {
    console.error(`Error adding registration to ${sheetName}:`, error);
    throw error;
  }
}

// Update an existing registration in an event sheet
export async function updateEventRegistration(
  sheetName: string,
  registrationId: string,
  updateData: Record<string, unknown>
): Promise<boolean> {
  const sheets = getGoogleSheetsClient();

  try {
    // Get all data from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!A:AZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      console.error('No data found in sheet:', sheetName);
      return false;
    }

    const headers = rows[0] as string[];
    const dataRows = rows.slice(1);

    // Find registration_id column index
    const regIdIndex = headers.findIndex(h =>
      h.toLowerCase().trim() === 'registration_id' ||
      h.toLowerCase().trim() === 'registration id'
    );

    if (regIdIndex === -1) {
      console.error('registration_id column not found in sheet:', sheetName);
      return false;
    }

    // Find the row with matching registration ID
    const rowIndex = dataRows.findIndex(row => row[regIdIndex] === registrationId);

    if (rowIndex === -1) {
      console.error('Registration not found:', registrationId);
      return false;
    }

    // Actual row number (add 2: 1 for header, 1 for 0-indexed to 1-indexed)
    const actualRowNumber = rowIndex + 2;

    // Update specific cells
    const updates: { range: string; values: unknown[][] }[] = [];
    for (const [key, value] of Object.entries(updateData)) {
      const normalizedKey = key.toLowerCase().trim();
      const headerIndex = headers.findIndex(h => {
        const normalizedHeader = h.toLowerCase().trim();
        return normalizedHeader === normalizedKey ||
               normalizedHeader.replace(/ /g, '_') === normalizedKey ||
               normalizedHeader.replace(/_/g, ' ') === normalizedKey;
      });

      if (headerIndex !== -1) {
        const columnLetter = String.fromCharCode(65 + headerIndex); // A=65
        updates.push({
          range: `'${sheetName}'!${columnLetter}${actualRowNumber}`,
          values: [[value]],
        });
      }
    }

    if (updates.length === 0) {
      console.warn('No matching columns found for update');
      return false;
    }

    // Batch update
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        data: updates as never,
        valueInputOption: 'RAW',
      },
    });

    return true;
  } catch (error) {
    console.error(`Error updating registration in ${sheetName}:`, error);
    throw error;
  }
}

// Get registrations for an event by eventId
export async function getEventRegistrationsByEventId(eventId: string): Promise<EventRegistration[]> {
  const events = await getTrackedEventsFromFirestore();
  const event = events.find(e => e.eventId === eventId);
  if (!event) {
    console.error(`Event not found: ${eventId}`);
    return [];
  }

  return getEventRegistrations(event.sheetName);
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
    const registrations = await getEventRegistrations(event.sheetName);
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

  // Find all event registrations by license number
  const eventRecords = await getRegistrationsByLicense(member.licenseNumber);

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
    if (!event) continue;

    // Check if confirmed/attended - include Thai status values
    const status = record.registration.status || '';
    const statusLower = status.toLowerCase();
    // Use includes() for Thai text to handle potential encoding differences
    const isConfirmed =
      statusLower === 'confirmed' ||
      statusLower === 'attended' ||
      status.includes('ยืนยัน') ||
      status.includes('ตรวจสอบแล้ว');

    if (isConfirmed) {
      const attendanceRecord: EventAttendanceRecord = {
        eventId: record.eventId,
        eventName: record.eventName,
        eventDate: event.eventDate,
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
      if (isWithinLastMonths(event.eventDate, 12)) {
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

// Helper to check if a registration is confirmed/attended
function isRegistrationConfirmed(reg: EventRegistration): boolean {
  const rawStatus = reg.status;
  const status = typeof rawStatus === 'string' ? rawStatus : String(rawStatus || '');
  const statusLower = status.toLowerCase();
  return (
    statusLower === 'confirmed' ||
    statusLower === 'attended' ||
    status.includes('ยืนยัน') ||
    status.includes('ตรวจสอบแล้ว')
  );
}

// Get all members' attendance summary for an event
// This function deduplicates by license number - same company counts as 1
export async function getEventAttendanceSummary(eventId: string): Promise<{
  event: Event | undefined;
  totalRegistrations: number;        // Total rows in sheet
  agentRegistrations: number;        // Unique companies (by license number)
  confirmedCount: number;            // Unique confirmed companies
  totalAttendees: number;            // Sum of all attendeeCount (total people)
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

  const allRegistrations = await getEventRegistrations(event.sheetName);
  // Only count registrations with attendanceType = 'agent' (exclude empty values)
  const agentRegistrationsRaw = allRegistrations.filter(r =>
    r.attendanceType?.toLowerCase() === 'agent'
  );

  const members = await getAllMembers();

  // Deduplicate by license number - keep only first registration per license
  // But merge attendee counts and names from duplicate registrations
  const licenseMap = new Map<string, {
    registration: EventRegistration;
    mergedAttendeeCount: number;
    mergedAttendeeNames: string[];
    isConfirmed: boolean;
  }>();

  for (const reg of agentRegistrationsRaw) {
    const normalizedLicense = normalizeLicenseNumber(reg.licenseNumber || '');

    // Skip registrations without license number
    if (!normalizedLicense) {
      // For registrations without license, use registration ID as key
      const key = `NO_LICENSE_${reg.registrationId}`;
      if (!licenseMap.has(key)) {
        licenseMap.set(key, {
          registration: reg,
          mergedAttendeeCount: reg.attendeeCount || 0,
          mergedAttendeeNames: reg.attendeeNames ? [reg.attendeeNames] : [],
          isConfirmed: isRegistrationConfirmed(reg),
        });
      }
      continue;
    }

    if (licenseMap.has(normalizedLicense)) {
      // Merge with existing entry
      const existing = licenseMap.get(normalizedLicense)!;
      existing.mergedAttendeeCount += reg.attendeeCount || 0;
      if (reg.attendeeNames) {
        existing.mergedAttendeeNames.push(reg.attendeeNames);
      }
      // If any registration is confirmed, mark as confirmed
      if (isRegistrationConfirmed(reg)) {
        existing.isConfirmed = true;
      }
    } else {
      // First registration for this license
      licenseMap.set(normalizedLicense, {
        registration: reg,
        mergedAttendeeCount: reg.attendeeCount || 0,
        mergedAttendeeNames: reg.attendeeNames ? [reg.attendeeNames] : [],
        isConfirmed: isRegistrationConfirmed(reg),
      });
    }
  }

  // Build deduplicated attendees list
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

  for (const [, entry] of licenseMap) {
    // Create a merged registration with combined attendee info
    const mergedReg: EventRegistration = {
      ...entry.registration,
      attendeeCount: entry.mergedAttendeeCount,
      attendeeNames: entry.mergedAttendeeNames.join(', '),
    };

    // Find matching member
    const normalizedLicense = normalizeLicenseNumber(entry.registration.licenseNumber || '');
    const member = members.find(m => {
      const memberLicense = normalizeLicenseNumber(m.licenseNumber || '');
      return memberLicense && memberLicense === normalizedLicense;
    });

    attendees.push({
      registration: mergedReg,
      member: member ? {
        memberId: member.memberId,
        fullNameTH: member.fullNameTH,
        companyNameTH: member.companyNameTH,
      } : null,
    });

    if (entry.isConfirmed) {
      confirmedCount++;
    }
    totalAttendees += entry.mergedAttendeeCount;
  }

  return {
    event,
    totalRegistrations: allRegistrations.length,
    agentRegistrations: licenseMap.size,  // Unique companies count
    confirmedCount,                        // Unique confirmed companies
    totalAttendees,                        // Total people (sum of attendeeCount)
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

// Get list of tracked events (async version using Firestore)
export async function getTrackedEvents(): Promise<Event[]> {
  return getTrackedEventsFromFirestore();
}

// Get event by ID (async version using Firestore)
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

// Helper to normalize license number for matching
// Removes all non-alphanumeric characters and converts to uppercase
function normalizeLicenseNumber(license: string): string {
  if (!license) return '';
  return license.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Build and store attendance cache
 * This reads all event registrations once and maps them to members by license number
 * @param months - Number of months to look back (default: 12)
 */
export async function buildAttendanceCache(months: number = 12): Promise<{ success: boolean; memberCount: number; eventCount: number; confirmedCount: number }> {
  try {
    const db = adminDb();

    // 1. Get all members (to map license -> memberId)
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

    // Debug: show each event's date and parse result
    for (const event of events) {
      const parsedDate = parseEventDate(event.eventDate);
      const withinMonths = isWithinLastMonths(event.eventDate, months);
      console.log(`buildAttendanceCache: Event "${event.eventName}" date="${event.eventDate}" parsed=${parsedDate?.toISOString()} withinMonths=${withinMonths}`);
    }

    // 3. Build attendance count per license number
    const licenseAttendance: Record<string, number> = {};
    let totalConfirmed = 0;

    for (const event of events) {
      if (!event.sheetName) {
        console.log(`buildAttendanceCache: Skipping event ${event.eventId} - no sheetName`);
        continue;
      }

      // Skip events that don't count towards attendance
      if (!event.countsAttendance) {
        console.log(`buildAttendanceCache: Skipping event ${event.eventId} - countsAttendance is false`);
        continue;
      }

      // Check if event is within the specified months (regardless of isActive status)
      if (!isWithinLastMonths(event.eventDate, months)) {
        console.log(`buildAttendanceCache: Skipping event ${event.eventId} - not within ${months} months (date: ${event.eventDate})`);
        continue;
      }

      console.log(`buildAttendanceCache: Processing event ${event.eventId} (${event.eventName})`);

      try {
        const registrations = await getEventRegistrations(event.sheetName);
        console.log(`buildAttendanceCache: Found ${registrations.length} registrations for ${event.sheetName}`);

        let confirmedInEvent = 0;
        for (const reg of registrations) {
          if (!reg.licenseNumber) continue;

          // Check if confirmed/attended
          const status = reg.status || '';
          const statusLower = status.toLowerCase();
          const isConfirmed =
            statusLower === 'confirmed' ||
            statusLower === 'attended' ||
            status.includes('ยืนยัน') ||
            status.includes('ตรวจสอบแล้ว');

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
    console.log(`buildAttendanceCache: Unique licenses with attendance: ${Object.keys(licenseAttendance).length}`);

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
 * Get attendance status for all members (using cache)
 * If cache doesn't exist, builds it first
 */
export async function getAllMembersAttendanceStatus(): Promise<Record<string, AttendanceCacheEntry>> {
  // Try to get from cache first
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
