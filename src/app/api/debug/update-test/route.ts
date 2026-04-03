// Debug API Route - Test Google Sheets Update
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Member Profile';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId') || '23081';

    // Get Google Sheets client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get headers and find the row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:AF1`,
    });

    const headers = response.data.values?.[0] || [];

    // Find LINE_UserID column index
    const lineUserIdColIndex = headers.findIndex((h: string) => h === 'LINE_UserID');
    const lineUserIdColLetter = lineUserIdColIndex >= 0 ? String.fromCharCode(65 + lineUserIdColIndex) : 'NOT_FOUND';

    // Get all data to find the member row
    const allDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:AF`,
    });

    const rows = allDataResponse.data.values || [];
    const memberRowIndex = rows.findIndex((row, index) => index > 0 && row[0] === memberId);

    let memberRowData = null;
    if (memberRowIndex > 0) {
      memberRowData = {
        rowNumber: memberRowIndex + 1,
        memberId: rows[memberRowIndex][0],
        currentLineUserId: rows[memberRowIndex][lineUserIdColIndex] || 'EMPTY',
      };
    }

    return NextResponse.json({
      headers: headers,
      headerCount: headers.length,
      lineUserIdColumn: {
        index: lineUserIdColIndex,
        letter: lineUserIdColLetter,
        headerName: headers[lineUserIdColIndex] || 'NOT_FOUND',
      },
      memberSearch: {
        searchedMemberId: memberId,
        foundAtRow: memberRowIndex > 0 ? memberRowIndex + 1 : 'NOT_FOUND',
        memberData: memberRowData,
      },
      currentUser: {
        id: session.user.id,
        memberId: session.user.memberId,
      },
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
