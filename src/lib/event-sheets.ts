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

// Get all members' attendance summary for an event
export async function getEventAttendanceSummary(eventId: string): Promise<{
  event: Event | undefined;
  totalRegistrations: number;
  agentRegistrations: number;
  confirmedCount: number;
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
      attendees: [],
    };
  }

  const allRegistrations = await getEventRegistrations(event.sheetName);
  // Only count registrations with attendanceType = 'agent' (exclude empty values)
  const agentRegistrations = allRegistrations.filter(r =>
    r.attendanceType?.toLowerCase() === 'agent'
  );

  const members = await getAllMembers();

  // Map registrations to members
  const attendees = agentRegistrations.map(reg => {
    const normalizedLicense = (reg.licenseNumber || '').trim().replace(/\s+/g, '');
    const member = members.find(m => {
      const memberLicense = (m.licenseNumber || '').trim().replace(/\s+/g, '');
      return memberLicense === normalizedLicense;
    });

    return {
      registration: reg,
      member: member ? {
        memberId: member.memberId,
        fullNameTH: member.fullNameTH,
        companyNameTH: member.companyNameTH,
      } : null,
    };
  });

  const confirmedCount = agentRegistrations.filter(r => {
    const rawStatus = r.status;
    const status = typeof rawStatus === 'string' ? rawStatus : String(rawStatus || '');
    const statusLower = status.toLowerCase();
    return (
      statusLower === 'confirmed' ||
      statusLower === 'attended' ||
      status.includes('ยืนยัน') ||
      status.includes('ตรวจสอบแล้ว')
    );
  }).length;

  return {
    event,
    totalRegistrations: allRegistrations.length,
    agentRegistrations: agentRegistrations.length,
    confirmedCount,
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
