// Debug script to check registration fee calculation
// Run: node check-registration-fee.js <registrationId>

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

async function checkRegistrationFee() {
  const registrationId = process.argv[2];
  if (!registrationId) {
    console.log('Usage: node check-registration-fee.js <registrationId>');
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const SHEET_NAME = '10 Yearth Meeting';

  try {
    // Get all data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${SHEET_NAME}'!A1:AZ1000`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      console.log('❌ No data found in sheet');
      return;
    }

    const headers = rows[0];

    // Find the registration
    const regIdCol = headers.findIndex(h => h.toLowerCase().trim() === 'registration_id');
    const regRow = rows.find(row => row[regIdCol] === registrationId);

    if (!regRow) {
      console.log(`❌ Registration ${registrationId} not found`);
      return;
    }

    console.log(`\n✅ Found registration: ${registrationId}\n`);
    console.log('=' .repeat(80));

    // Show relevant columns
    const importantCols = [
      'registration_id',
      'company_name',
      'attendee_count',
      'attendee_type_selections',
      'room_allocations',
      'event_fee',
      'total_amount',
      'deposit_amount',
      'remaining_amount',
      'status',
    ];

    importantCols.forEach(colName => {
      const colIndex = headers.findIndex(h => h.toLowerCase().trim() === colName);
      if (colIndex >= 0) {
        const value = regRow[colIndex] || '(empty)';
        console.log(`${colName.padEnd(30)}: ${value}`);
      } else {
        console.log(`${colName.padEnd(30)}: ❌ COLUMN NOT FOUND`);
      }
    });

    console.log('=' .repeat(80));

    // Calculate what the fee SHOULD be
    const attendeeTypeSelectionsCol = headers.findIndex(h => h.toLowerCase().trim() === 'attendee_type_selections');
    const roomAllocationsCol = headers.findIndex(h => h.toLowerCase().trim() === 'room_allocations');
    const totalAmountCol = headers.findIndex(h => h.toLowerCase().trim() === 'total_amount');

    const attendeeTypeSelectionsStr = regRow[attendeeTypeSelectionsCol] || '';
    const roomAllocationsStr = regRow[roomAllocationsCol] || '';
    const totalAmountFromSheet = parseFloat(regRow[totalAmountCol]) || 0;

    console.log('\n📊 Fee Calculation Check:\n');

    try {
      const attendeeTypeSelections = JSON.parse(attendeeTypeSelectionsStr || '[]');
      console.log('Attendee Type Selections:', attendeeTypeSelections);

      // Assume pricing (you may need to adjust)
      const attendeePricing = {
        'member': 1500,
        'spouse': 1200,
        'child': 800,
      };

      let calculatedEventFee = 0;
      attendeeTypeSelections.forEach(sel => {
        const price = attendeePricing[sel.typeId] || 0;
        calculatedEventFee += price * sel.quantity;
        console.log(`  ${sel.typeId}: ${price} × ${sel.quantity} = ${price * sel.quantity} บาท`);
      });

      console.log(`\nCalculated Event Fee: ${calculatedEventFee} บาท`);

      const roomAllocations = JSON.parse(roomAllocationsStr || '[]');
      console.log('\nRoom Allocations:', roomAllocations);

      // Assume room pricing (you may need to adjust)
      const roomPricing = {
        'single': 1000,
        'double': 600,
        'triple': 400,
      };

      let calculatedRoomFee = 0;
      roomAllocations.forEach(alloc => {
        const price = roomPricing[alloc.roomTypeId] || 0;
        calculatedRoomFee += price * alloc.roomCount;
        console.log(`  ${alloc.roomTypeId}: ${price} × ${alloc.roomCount} = ${price * alloc.roomCount} บาท`);
      });

      console.log(`\nCalculated Room Fee: ${calculatedRoomFee} บาท`);

      const expectedTotal = calculatedEventFee + calculatedRoomFee;
      console.log(`\nExpected Total: ${calculatedEventFee} + ${calculatedRoomFee} = ${expectedTotal} บาท`);
      console.log(`Actual Total in Sheet: ${totalAmountFromSheet} บาท`);

      if (expectedTotal === totalAmountFromSheet) {
        console.log('\n✅ Total amount is CORRECT');
      } else {
        console.log(`\n❌ Total amount is WRONG! Difference: ${totalAmountFromSheet - expectedTotal} บาท`);
      }

    } catch (error) {
      console.error('Error parsing JSON:', error.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkRegistrationFee();
