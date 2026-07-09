// Debug script to check Google Sheets data
// Run: node debug-sheets.js

const { google } = require('googleapis');
const fs = require('fs');

// Load .env.local manually
const envPath = '.env.local';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

async function debugSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;

  // Change this to your event sheet name
  const SHEET_NAME = '10 Yearth Meeting';

  try {
    // Get all data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${SHEET_NAME}'!A1:AZ1000`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      console.log('No data found in sheet');
      return;
    }

    const headers = rows[0];
    console.log('\n📋 Headers in Google Sheet:');
    console.log('Index | Header Name | Normalized');
    console.log('------|-------------|------------');
    headers.forEach((header, idx) => {
      const normalized = header.toLowerCase().trim();
      console.log(`${idx.toString().padStart(5)} | ${header.padEnd(30)} | ${normalized}`);
    });

    // Find status column
    const statusColIndex = headers.findIndex(h =>
      h.toLowerCase().trim() === 'status'
    );

    console.log('\n🔍 Status Column Analysis:');
    console.log(`Status column index: ${statusColIndex}`);
    console.log(`Status column header: "${headers[statusColIndex]}"`);

    // Get all unique status values
    const statusValues = new Set();
    const cancelledRows = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const status = row[statusColIndex] || '';
      statusValues.add(status);

      // Check if cancelled
      const statusLower = status.toLowerCase();
      if (statusLower === 'cancelled' || status.includes('ยกเลิก')) {
        const regId = row[headers.findIndex(h => h.toLowerCase().trim() === 'registration_id')];
        const company = row[headers.findIndex(h => h.toLowerCase().trim() === 'company_name')];
        cancelledRows.push({
          row: i + 1,
          registrationId: regId,
          company: company,
          status: status,
        });
      }
    }

    console.log('\n📊 Unique Status Values:');
    Array.from(statusValues).sort().forEach(status => {
      console.log(`  - "${status}"`);
    });

    console.log('\n❌ Cancelled Registrations:');
    if (cancelledRows.length === 0) {
      console.log('  No cancelled registrations found');
    } else {
      console.log(`  Found ${cancelledRows.length} cancelled registration(s):`);
      cancelledRows.forEach(r => {
        console.log(`  Row ${r.row}: ${r.registrationId} - ${r.company} (status: "${r.status}")`);
      });
    }

    // Check COLUMN_TO_EVENT_REGISTRATION_MAP
    console.log('\n🗺️  Column Mapping Check:');
    const importantColumns = ['status', 'registration_id', 'company_name', 'attendance_type'];
    importantColumns.forEach(col => {
      const found = headers.findIndex(h => h.toLowerCase().trim() === col);
      console.log(`  ${col.padEnd(20)}: ${found >= 0 ? `✅ Found at index ${found}` : '❌ NOT FOUND'}`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugSheets();
