// Debug API to check event attendance mapping
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getTrackedEventsFromFirestore } from '@/lib/event-sheets';
import { getAllMembers } from '@/lib/google-sheets';
import { google } from 'googleapis';
import { isWithinLastMonths, parseEventDate } from '@/types/event';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get events from Firestore
    const events = await getTrackedEventsFromFirestore();

    // Get current user's member info
    const members = await getAllMembers();
    const currentUserMember = members.find(m => m.memberId === session.user.memberId);

    // Debug info
    const debugInfo: Record<string, unknown> = {
      sessionUser: {
        id: session.user.id,
        memberId: session.user.memberId,
        name: session.user.name,
      },
      memberFound: !!currentUserMember,
      memberLicenseNumber: currentUserMember?.licenseNumber || 'NOT FOUND',
      currentDate: new Date().toISOString(),
      trackedEvents: events.map(e => {
        const parsedDate = parseEventDate(e.eventDate);
        return {
          eventId: e.eventId,
          eventName: e.eventName,
          sheetName: e.sheetName,
          eventDate: e.eventDate,
          parsedDate: parsedDate?.toISOString() || 'FAILED TO PARSE',
          isActive: e.isActive,
          isWithin12Months: isWithinLastMonths(e.eventDate, 12),
        };
      }),
      sheetHeaders: {} as Record<string, unknown>,
      eventRegistrations: {} as Record<string, unknown>,
    };

    const sheets = getGoogleSheetsClient();

    // Try to fetch registrations from each event
    for (const event of events) {
      try {
        // Get raw sheet data including headers
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `'${event.sheetName}'!A:AZ`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
          (debugInfo.sheetHeaders as Record<string, unknown>)[event.eventId] = {
            error: 'No data in sheet',
            sheetName: event.sheetName,
          };
          continue;
        }

        const headers = rows[0] as string[];
        const headersLowercase = headers.map(h => (h || '').toLowerCase().trim());

        // Find license_number column index
        const licenseColIndex = headersLowercase.findIndex(h =>
          h === 'license_number' ||
          h.includes('license') ||
          h.includes('ใบอนุญาต') ||
          h.includes('เลขที่')
        );

        // Find status column index
        const statusColIndex = headersLowercase.findIndex(h =>
          h === 'status' ||
          h.includes('status') ||
          h.includes('สถานะ')
        );

        // Find registration_id column index
        const regIdColIndex = headersLowercase.findIndex(h =>
          h === 'registration_id' ||
          h.includes('registration') ||
          h.includes('ลงทะเบียน')
        );

        (debugInfo.sheetHeaders as Record<string, unknown>)[event.eventId] = {
          sheetName: event.sheetName,
          totalRows: rows.length - 1,
          allHeaders: headers,
          headersLowercase,
          licenseColumn: {
            index: licenseColIndex,
            header: licenseColIndex >= 0 ? headers[licenseColIndex] : 'NOT FOUND',
          },
          statusColumn: {
            index: statusColIndex,
            header: statusColIndex >= 0 ? headers[statusColIndex] : 'NOT FOUND',
          },
          regIdColumn: {
            index: regIdColIndex,
            header: regIdColIndex >= 0 ? headers[regIdColIndex] : 'NOT FOUND',
          },
        };

        // Sample data from first few rows
        const sampleData = rows.slice(1, 4).map(row => ({
          licenseNumber: licenseColIndex >= 0 ? row[licenseColIndex] : 'N/A',
          status: statusColIndex >= 0 ? row[statusColIndex] : 'N/A',
          registrationId: regIdColIndex >= 0 ? row[regIdColIndex] : 'N/A',
        }));

        // Find user's registration
        const normalizedUserLicense = (currentUserMember?.licenseNumber || '').trim().replace(/\s+/g, '');
        let userRow = null;

        if (licenseColIndex >= 0) {
          for (let i = 1; i < rows.length; i++) {
            const rowLicense = (rows[i][licenseColIndex] || '').toString().trim().replace(/\s+/g, '');
            if (rowLicense === normalizedUserLicense) {
              userRow = {
                rowIndex: i,
                licenseNumber: rows[i][licenseColIndex],
                status: statusColIndex >= 0 ? rows[i][statusColIndex] : 'N/A',
                registrationId: regIdColIndex >= 0 ? rows[i][regIdColIndex] : 'N/A',
              };
              break;
            }
          }
        }

        (debugInfo.eventRegistrations as Record<string, unknown>)[event.eventId] = {
          sheetName: event.sheetName,
          sampleData,
          userLicenseToFind: normalizedUserLicense,
          userRowFound: !!userRow,
          userRow,
        };
      } catch (err) {
        (debugInfo.sheetHeaders as Record<string, unknown>)[event.eventId] = {
          error: err instanceof Error ? err.message : 'Unknown error',
          sheetName: event.sheetName,
        };
      }
    }

    return NextResponse.json(debugInfo);
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      error: 'Debug failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
