// Debug API Route - Test Google Sheets Connection
import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  try {
    const SHEET_ID = process.env.GOOGLE_SHEET_ID;
    const CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

    // Check environment variables
    const envCheck = {
      GOOGLE_SHEET_ID: SHEET_ID ? `${SHEET_ID.substring(0, 10)}...` : 'MISSING',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: CLIENT_EMAIL || 'MISSING',
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: PRIVATE_KEY ? 'SET (hidden)' : 'MISSING',
    };

    if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
      return NextResponse.json({
        error: 'Missing environment variables',
        envCheck,
      }, { status: 500 });
    }

    // Try to connect to Google Sheets
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: CLIENT_EMAIL,
        private_key: PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Get spreadsheet metadata
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });

    const sheetNames = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];

    // Try to read from "Member Profile" sheet
    let memberData = null;
    let memberError = null;

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Member Profile!A1:E5', // Get first 5 rows, first 5 columns
      });
      memberData = {
        rows: response.data.values?.length || 0,
        headers: response.data.values?.[0] || [],
        sampleData: response.data.values?.slice(1, 3) || [],
      };
    } catch (err) {
      memberError = err instanceof Error ? err.message : String(err);
    }

    return NextResponse.json({
      success: true,
      envCheck,
      spreadsheetTitle: spreadsheet.data.properties?.title,
      sheetNames,
      memberProfileSheet: memberData || { error: memberError },
    });
  } catch (error) {
    console.error('Debug sheets error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
