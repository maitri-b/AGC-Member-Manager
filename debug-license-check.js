/**
 * Debug script to check where a license number exists
 *
 * Usage:
 * node debug-license-check.js <license-number>
 *
 * Example:
 * node debug-license-check.js "11/12345"
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const { google } = require('googleapis');

// Initialize Firebase Admin
const serviceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = admin.firestore();

// Initialize Google Sheets API
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

async function checkLicenseNumber(licenseNumber) {
  console.log('\n='.repeat(80));
  console.log(`🔍 ตรวจสอบเลขที่ใบอนุญาต: "${licenseNumber}"`);
  console.log('='.repeat(80));

  // Check 1: Firestore - membershipApplications
  console.log('\n📁 Check 1: Firestore (membershipApplications)');
  console.log('-'.repeat(80));

  try {
    const applicationsSnapshot = await db.collection('membershipApplications')
      .where('licenseNumber', '==', licenseNumber)
      .get();

    if (applicationsSnapshot.empty) {
      console.log('✅ ไม่พบข้อมูลใน membershipApplications');
    } else {
      console.log(`❌ พบข้อมูล ${applicationsSnapshot.size} รายการใน membershipApplications:`);
      applicationsSnapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`\n   [${index + 1}] Application ID: ${doc.id}`);
        console.log(`       - Status: ${data.status}`);
        console.log(`       - Company Name: ${data.companyNameTH}`);
        console.log(`       - License Number: ${data.licenseNumber}`);
        console.log(`       - Applied At: ${data.appliedAt}`);
        console.log(`       - Applicant Email: ${data.applicantEmail}`);
      });
    }
  } catch (error) {
    console.error('❌ Error checking Firestore:', error.message);
  }

  // Check 2: Google Sheets - AGC_Membership
  console.log('\n📊 Check 2: Google Sheets (AGC_Membership)');
  console.log('-'.repeat(80));

  try {
    const sheets = getGoogleSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'AGC_Membership!A:AZ',
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('⚠️  Google Sheets ว่างเปล่า');
      return;
    }

    const headers = rows[0];
    console.log(`\n   📋 Headers (${headers.length} คอลัมน์):`);
    headers.forEach((header, index) => {
      const column = String.fromCharCode(65 + index); // A, B, C, ...
      console.log(`      ${column}: "${header}"`);
    });

    // Find license number column
    const licenseColumnIndex = headers.findIndex(h =>
      h.trim() === 'ใบอนุญาตนำเที่ยวเลขที่'
    );

    if (licenseColumnIndex === -1) {
      console.log('\n   ⚠️  ไม่พบคอลัมน์ "ใบอนุญาตนำเที่ยวเลขที่" ใน headers');
      console.log('   💡 กรุณาตรวจสอบว่า header ใน Google Sheets ตรงกับ "ใบอนุญาตนำเที่ยวเลขที่" หรือไม่');
    } else {
      const licenseColumn = String.fromCharCode(65 + licenseColumnIndex);
      console.log(`\n   ✅ พบคอลัมน์ใบอนุญาต: Column ${licenseColumn} (index ${licenseColumnIndex})`);

      // Search for matching license number
      const matches = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowLicenseNumber = row[licenseColumnIndex] || '';

        if (rowLicenseNumber.trim() === licenseNumber.trim()) {
          matches.push({
            rowNumber: i + 1, // 1-indexed
            data: row,
          });
        }
      }

      if (matches.length === 0) {
        console.log(`\n   ✅ ไม่พบเลขที่ใบอนุญาต "${licenseNumber}" ใน Google Sheets`);
      } else {
        console.log(`\n   ❌ พบข้อมูล ${matches.length} รายการ:`);
        matches.forEach((match, index) => {
          console.log(`\n   [${index + 1}] Row ${match.rowNumber}:`);
          console.log(`       - License Number: ${match.data[licenseColumnIndex]}`);

          // Show company name if exists
          const companyENIndex = headers.findIndex(h => h.trim() === 'Company Name (English)');
          if (companyENIndex !== -1 && match.data[companyENIndex]) {
            console.log(`       - Company: ${match.data[companyENIndex]}`);
          }

          // Show member status if exists
          const statusIndex = headers.findIndex(h => h.trim() === 'สถานะสมาชิก');
          if (statusIndex !== -1 && match.data[statusIndex]) {
            console.log(`       - Status: ${match.data[statusIndex]}`);
          }
        });
      }
    }
  } catch (error) {
    console.error('❌ Error checking Google Sheets:', error.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ การตรวจสอบเสร็จสมบูรณ์');
  console.log('='.repeat(80) + '\n');
}

// Main
const licenseNumber = process.argv[2];

if (!licenseNumber) {
  console.error('\n❌ กรุณาระบุเลขที่ใบอนุญาต\n');
  console.log('Usage: node debug-license-check.js <license-number>');
  console.log('Example: node debug-license-check.js "11/12345"\n');
  process.exit(1);
}

checkLicenseNumber(licenseNumber)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
