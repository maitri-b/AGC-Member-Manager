const { google } = require('googleapis');
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

async function checkSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: 'Rally2026!A:Z',
  });

  const rows = response.data.values || [];
  console.log('Rally2026 sheet:');
  console.log('Total rows:', rows.length);
  console.log('Headers:', rows[0]);
  console.log('');
  console.log('First 3 data rows:');
  rows.slice(1, 4).forEach((row, i) => {
    console.log(`Row ${i + 1}:`, row.slice(0, 5));
  });
}

checkSheet().catch(console.error);
