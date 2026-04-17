// Google Sheets Service for Agents Club Member Data
import { google } from 'googleapis';
import { Member, COLUMN_TO_MEMBER_MAP, MemberStatus } from '@/types/member';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'AGC_Membership';

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

// Convert sheet row to Member object
function rowToMember(headers: string[], row: string[]): Member {
  const member: Partial<Member> = {};

  headers.forEach((header, index) => {
    const value = row[index] || '';
    // Normalize header by trimming whitespace
    const normalizedHeader = header.trim();
    const memberKey = COLUMN_TO_MEMBER_MAP[normalizedHeader];

    if (memberKey) {
      (member as Record<string, unknown>)[memberKey] = value;
    }
  });

  return member as Member;
}

// Convert Member object to sheet row
function memberToRow(headers: string[], member: Partial<Member>): string[] {
  return headers.map((header) => {
    const memberKey = COLUMN_TO_MEMBER_MAP[header];
    if (memberKey && member[memberKey] !== undefined) {
      return String(member[memberKey]);
    }
    return '';
  });
}

// Get all members from the sheet
export async function getAllMembers(): Promise<Member[]> {
  const sheets = getGoogleSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`, // Wide range to capture all columns
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  const headers = rows[0] as string[];

  // DEBUG: Log headers to see what we're getting from Google Sheets
  console.log('[getAllMembers] Raw headers from Google Sheets:', headers);
  console.log('[getAllMembers] Looking for "วันหมดอายุ" in headers...');
  const expiryIndex = headers.findIndex(h => h.trim() === 'วันหมดอายุ');
  console.log('[getAllMembers] "วันหมดอายุ" found at index:', expiryIndex, '(Column', String.fromCharCode(65 + expiryIndex) + ')');

  const members = rows.slice(1).map((row) => rowToMember(headers, row as string[]));

  return members.filter((m) => m.memberId); // Filter out empty rows
}

// Get a single member by ID
export async function getMemberById(memberId: string): Promise<Member | null> {
  const members = await getAllMembers();
  return members.find((m) => m.memberId === memberId) || null;
}

// Get member by LINE User ID
export async function getMemberByLineUserId(lineUserId: string): Promise<Member | null> {
  const members = await getAllMembers();
  return members.find((m) => m.lineUserId === lineUserId) || null;
}

// Get members by status
export async function getMembersByStatus(status: MemberStatus): Promise<Member[]> {
  const members = await getAllMembers();
  return members.filter((m) => m.status === status);
}

// Get active members
export async function getActiveMembers(): Promise<Member[]> {
  const members = await getAllMembers();
  return members.filter((m) => m.status?.toLowerCase() === 'active' || m.status === 'ปกติ');
}

// Get members with expiring licenses (within N days)
export async function getMembersWithExpiringLicenses(days: number = 30): Promise<Member[]> {
  const members = await getAllMembers();
  const today = new Date();

  return members.filter((m) => {
    if (!m.licenseExpiry) return false;

    const expiry = parseDate(m.licenseExpiry);
    if (!expiry) return false;

    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays > 0 && diffDays <= days;
  });
}

// Get members with LINE group status
export async function getMembersByLineGroupStatus(status: string): Promise<Member[]> {
  const members = await getAllMembers();
  return members.filter((m) => m.lineGroupStatus === status);
}

// Update a member (requires finding row index first)
export async function updateMember(memberId: string, updates: Partial<Member>): Promise<boolean> {
  const sheets = getGoogleSheetsClient();

  // Get all data to find the row
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.log('updateMember: No data in sheet');
    return false;
  }

  const headers = rows[0] as string[];

  // Find the MemberID column index
  const memberIdColumnIndex = headers.findIndex(h => h === 'MemberID');
  if (memberIdColumnIndex === -1) {
    console.log('updateMember: MemberID column not found in headers:', headers);
    return false;
  }

  // Find the row index by MemberID value
  const rowIndex = rows.findIndex((row, index) => {
    if (index === 0) return false; // Skip header row
    const rowMemberId = row[memberIdColumnIndex];
    return rowMemberId === memberId;
  });

  if (rowIndex === -1) {
    console.log(`updateMember: Member ${memberId} not found in sheet`);
    return false;
  }

  console.log(`updateMember: Found member ${memberId} at row ${rowIndex + 1}`);

  // Get current row data and merge with updates
  const currentMember = rowToMember(headers, rows[rowIndex] as string[]);
  const updatedMember = { ...currentMember, ...updates, lastUpdated: new Date().toISOString() };
  const updatedRow = memberToRow(headers, updatedMember);

  // Update the row in the sheet
  // Use RAW to preserve phone numbers with leading zeros (e.g., 02-xxx-xxxx)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A${rowIndex + 1}:AZ${rowIndex + 1}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [updatedRow],
    },
  });

  return true;
}

// Link LINE User ID to member
export async function linkLineUserToMember(
  memberId: string,
  lineUserId: string,
  lineDisplayName: string,
  updatedBy: string
): Promise<boolean> {
  return updateMember(memberId, {
    lineUserId,
    lineDisplayName,
    lastUpdated: new Date().toISOString(),
    updatedBy,
  });
}

// Get the next member ID for a given year (DEPRECATED - use getNextRunningMemberId instead)
export async function getNextMemberId(year: number): Promise<string> {
  const members = await getAllMembers();
  const yearPrefix = year.toString().slice(-2);

  // Find all members from this year
  const yearMembers = members.filter((m) => m.memberId?.startsWith(yearPrefix));

  // Get the highest running number
  let maxRunning = 0;
  yearMembers.forEach((m) => {
    const running = parseInt(m.memberId.slice(2), 10);
    if (running > maxRunning) {
      maxRunning = running;
    }
  });

  // Generate next ID
  const nextRunning = (maxRunning + 1).toString().padStart(3, '0');
  return `${yearPrefix}${nextRunning}`;
}

// Get the next member ID as a simple running number
// Returns the highest existing member ID + 1
export async function getNextRunningMemberId(): Promise<string> {
  const members = await getAllMembers();

  // Find the highest member ID (treating all IDs as numbers)
  let maxId = 0;
  members.forEach((m) => {
    if (m.memberId) {
      const numericId = parseInt(m.memberId, 10);
      if (!isNaN(numericId) && numericId > maxId) {
        maxId = numericId;
      }
    }
  });

  // Return next ID (no padding, just the number)
  return String(maxId + 1);
}

// Add a new member
export async function addMember(member: Partial<Member>): Promise<string | null> {
  const sheets = getGoogleSheetsClient();

  // Get headers
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A1:AZ1`,
  });

  const headers = response.data.values?.[0] as string[];
  if (!headers) {
    return null;
  }

  // Generate member ID if not provided
  if (!member.memberId) {
    member.memberId = await getNextMemberId(new Date().getFullYear());
  }

  // Add timestamps
  member.lastUpdated = new Date().toISOString();

  // Convert to row
  const newRow = memberToRow(headers, member);

  // Append to sheet
  // Use RAW to preserve phone numbers with leading zeros (e.g., 02-xxx-xxxx)
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A:AZ`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [newRow],
    },
  });

  return member.memberId;
}

// Get unique statuses
export async function getStatuses(): Promise<string[]> {
  const members = await getAllMembers();
  const statuses = new Set(members.map((m) => m.status).filter(Boolean));
  return Array.from(statuses).sort();
}

// Get unique positions in club
export async function getClubPositions(): Promise<string[]> {
  const members = await getAllMembers();
  const positions = new Set(members.map((m) => m.positionClub).filter(Boolean));
  return Array.from(positions).sort();
}

// Search members
export async function searchMembers(query: string): Promise<Member[]> {
  const members = await getAllMembers();
  const lowerQuery = query.toLowerCase();

  return members.filter((m) => {
    return (
      m.fullNameTH?.toLowerCase().includes(lowerQuery) ||
      m.nickname?.toLowerCase().includes(lowerQuery) ||
      m.companyNameEN?.toLowerCase().includes(lowerQuery) ||
      m.companyNameTH?.toLowerCase().includes(lowerQuery) ||
      m.memberId?.includes(query) ||
      m.lineId?.toLowerCase().includes(lowerQuery) ||
      m.lineName?.toLowerCase().includes(lowerQuery) ||
      m.email?.toLowerCase().includes(lowerQuery) ||
      m.mobile?.includes(query) ||
      m.phone?.includes(query)
    );
  });
}

// Get member statistics
export async function getMemberStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  expiringLicenses: number;
  linkedToLine: number;
}> {
  const members = await getAllMembers();
  const today = new Date();

  const active = members.filter(
    (m) => m.status?.toLowerCase() === 'active' || m.status === 'ปกติ'
  ).length;

  const inactive = members.filter(
    (m) => m.status?.toLowerCase() === 'inactive' || m.status === 'ไม่ปกติ'
  ).length;

  const expiringLicenses = members.filter((m) => {
    if (!m.licenseExpiry) return false;
    const expiry = parseDate(m.licenseExpiry);
    if (!expiry) return false;
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 30;
  }).length;

  const linkedToLine = members.filter((m) => m.lineUserId).length;

  return {
    total: members.length,
    active,
    inactive,
    expiringLicenses,
    linkedToLine,
  };
}

// Helper to parse date (supports US format MM/DD/YYYY)
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try MM/DD/YYYY format (US format from Google Sheet)
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);

    // Convert Buddhist year to Gregorian if needed
    if (year > 2500) {
      year -= 543;
    }

    return new Date(year, month, day);
  }

  // Try ISO format
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  return null;
}
