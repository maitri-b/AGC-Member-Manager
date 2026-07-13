/**
 * Sync approved application from Firestore to Google Sheets
 *
 * Usage:
 * node sync-application-to-sheet.js <application-id>
 *
 * Example:
 * node sync-application-to-sheet.js APP-1783056773824
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
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'AGC_Membership';

// Member column mapping (from types/member.ts)
const SHEET_COLUMN_MAP = {
  memberId: 'Member ID',
  fullNameEN: 'Full Name (English)',
  fullNameTH: 'ชื่อ-นามสกุล',
  companyNameEN: 'Company Name (English)',
  companyNameTH: 'ชื่อบริษัท (ภาษาไทย)',
  nickname: 'ขื่อเล่น',
  lineId: 'ไอดี ไลน์',
  lineName: 'ชื่อไลน์',
  phone: 'เบอร์โทร',
  mobile: 'เบอร์มือถือ',
  licenseNumber: 'ใบอนุญาตนำเที่ยวเลขที่',
  website: 'เว็บไซต์',
  email: 'อีเมล',
  licenseExpiry: 'วันหมดอายุใบอนุญาต',
  positionCompany: 'ตำแหน่งในบริษัท',
  sponsor1: 'ผู้รับรองสมาชิก ท่านที่ 1',
  sponsor2: 'ผู้รับรองสมาชิก ท่านที่ 2',
  status: 'สถานะสมาชิก',
  membershipType: 'ประเภทสมาชิก',
  joinDate: 'วันที่สมัคร',
  approvedDate: 'วันที่อนุมัติ',
  lineGroupStatus: 'สถานะ Line',
  notes: 'หมายเหตุ',
  createdAt: 'CreatedAt',
  updatedAt: 'UpdatedAt',
  createdBy: 'CreatedBy',
  updatedBy: 'UpdatedBy',
  lineDisplayName: 'lineDisplayName',
};

async function syncApplicationToSheet(applicationId) {
  console.log('\n='.repeat(80));
  console.log(`📋 Sync Application to Google Sheets`);
  console.log('='.repeat(80));
  console.log(`Application ID: ${applicationId}\n`);

  try {
    // 1. Get application from Firestore
    console.log('📁 Step 1: Fetching application from Firestore...');
    const appDoc = await db.collection('membershipApplications').doc(applicationId).get();

    if (!appDoc.exists) {
      console.error(`❌ Application not found: ${applicationId}`);
      process.exit(1);
    }

    const appData = appDoc.data();
    console.log(`✅ Found application:`);
    console.log(`   - Company: ${appData.companyNameTH}`);
    console.log(`   - Status: ${appData.status}`);
    console.log(`   - License: ${appData.licenseNumber}`);
    console.log(`   - Line Group Status: ${appData.lineGroupStatus || 'N/A'}`);

    // Check if approved
    if (appData.status !== 'approved') {
      console.log(`\n⚠️  Warning: Application status is "${appData.status}", not "approved"`);
      console.log('   Only approved applications should be synced to Google Sheets.');

      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question('\n   Continue anyway? (y/N): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'y') {
        console.log('\n❌ Sync cancelled by user.');
        process.exit(0);
      }
    }

    // 2. Get Google Sheets headers
    console.log('\n📊 Step 2: Reading Google Sheets headers...');
    const sheets = getGoogleSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!1:1`,
    });

    const headers = response.data.values?.[0] || [];
    console.log(`✅ Found ${headers.length} columns`);

    // 3. Map application data to sheet row
    console.log('\n🔄 Step 3: Mapping data to sheet format...');

    const memberData = {
      memberId: appData.memberId || '',
      fullNameEN: appData.companyNameEN || '',
      fullNameTH: appData.companyNameTH || '',
      companyNameEN: appData.companyNameEN || '',
      companyNameTH: appData.companyNameTH || '',
      nickname: appData.nickname || '',
      lineId: appData.lineId || '',
      lineName: appData.lineName || '',
      phone: appData.phone || '',
      mobile: appData.mobile || '',
      licenseNumber: appData.licenseNumber || '',
      website: appData.website || '',
      email: appData.email || '',
      licenseExpiry: appData.licenseExpiry || '',
      positionCompany: appData.positionCompany || '',
      sponsor1: appData.sponsor1 || '',
      sponsor2: appData.sponsor2 || '',
      status: 'ปกติ', // Default to active member
      membershipType: 'สามัญ', // Default membership type
      joinDate: appData.appliedAt ? new Date(appData.appliedAt).toLocaleDateString('th-TH') : '',
      approvedDate: appData.approvedAt ? new Date(appData.approvedAt).toLocaleDateString('th-TH') : '',
      lineGroupStatus: appData.lineGroupStatus || 'รอนำเข้ากลุ่ม',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'sync-script',
      updatedBy: 'sync-script',
      lineDisplayName: appData.lineDisplayName || appData.lineName || '',
    };

    // Build row data
    const rowData = headers.map((header) => {
      const normalizedHeader = header.trim();
      const memberKey = Object.keys(SHEET_COLUMN_MAP).find(
        key => SHEET_COLUMN_MAP[key] === normalizedHeader
      );

      if (memberKey && memberData[memberKey]) {
        return String(memberData[memberKey]);
      }
      return '';
    });

    console.log('✅ Mapped data:');
    console.log(`   - Member ID: ${memberData.memberId}`);
    console.log(`   - License: ${memberData.licenseNumber}`);
    console.log(`   - Status: ${memberData.status}`);
    console.log(`   - Line Group: ${memberData.lineGroupStatus}`);

    // 4. Check if already exists in sheet
    console.log('\n🔍 Step 4: Checking for duplicates in sheet...');
    const allDataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:AZ`,
    });

    const allRows = allDataResponse.data.values || [];
    const licenseColumnIndex = headers.findIndex(h => h.trim() === 'ใบอนุญาตนำเที่ยวเลขที่');

    if (licenseColumnIndex === -1) {
      console.error('❌ Cannot find license number column in sheet');
      process.exit(1);
    }

    let existingRowIndex = -1;
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][licenseColumnIndex]?.trim() === appData.licenseNumber.trim()) {
        existingRowIndex = i;
        break;
      }
    }

    // 5. Append or update
    if (existingRowIndex !== -1) {
      console.log(`⚠️  License number already exists at row ${existingRowIndex + 1}`);

      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question('\n   Update existing row? (y/N): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() !== 'y') {
        console.log('\n❌ Sync cancelled by user.');
        process.exit(0);
      }

      console.log('\n📝 Step 5: Updating existing row...');
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A${existingRowIndex + 1}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData],
        },
      });

      console.log(`✅ Updated row ${existingRowIndex + 1} successfully!`);
    } else {
      console.log('\n📝 Step 5: Appending new row...');
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:A`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [rowData],
        },
      });

      console.log('✅ Appended new row successfully!');
    }

    // 6. Update application status in Firestore
    console.log('\n💾 Step 6: Updating Firestore...');
    await db.collection('membershipApplications').doc(applicationId).update({
      syncedToSheets: true,
      syncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log('✅ Updated Firestore record');

    console.log('\n' + '='.repeat(80));
    console.log('✅ Sync completed successfully!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Main
const applicationId = process.argv[2];

if (!applicationId) {
  console.error('\n❌ กรุณาระบุ Application ID\n');
  console.log('Usage: node sync-application-to-sheet.js <application-id>');
  console.log('Example: node sync-application-to-sheet.js APP-1783056773824\n');
  process.exit(1);
}

syncApplicationToSheet(applicationId)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
