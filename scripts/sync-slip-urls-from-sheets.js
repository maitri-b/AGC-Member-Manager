/**
 * Script to Sync slip_url from Google Sheets to Firestore
 *
 * This script reads the slip_url column from Google Sheets for a specific event
 * and updates the corresponding slipUrl field in Firestore eventRegistrations.
 *
 * This is needed for legacy events (like 10yearth-meeting-2025) that were completed
 * before the payment slip migration system was built.
 *
 * Usage:
 *   node scripts/sync-slip-urls-from-sheets.js <eventId>
 *
 * Example:
 *   node scripts/sync-slip-urls-from-sheets.js 10yearth-meeting-2025
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

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

/**
 * Get event by ID from Firestore
 */
async function getEventById(eventId) {
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) {
    return null;
  }
  return { eventId: eventDoc.id, ...eventDoc.data() };
}

/**
 * Read registrations from Google Sheets for a specific event
 */
async function getRegistrationsFromSheets(sheetName) {
  const sheets = getGoogleSheetsClient();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!A:AZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const dataRows = rows.slice(1);

    // Find column indices
    const registrationIdIndex = headers.findIndex(h => h === 'registration_id');
    const slipUrlIndex = headers.findIndex(h => h === 'slip_url');

    if (registrationIdIndex === -1) {
      throw new Error(`registration_id column not found in sheet ${sheetName}`);
    }

    if (slipUrlIndex === -1) {
      console.warn(`slip_url column not found in sheet ${sheetName} - will skip`);
      return [];
    }

    console.log(`Found columns: registration_id at index ${registrationIdIndex}, slip_url at index ${slipUrlIndex}`);

    // Extract registrations with slip URLs
    const registrations = [];
    for (const row of dataRows) {
      const registrationId = row[registrationIdIndex];
      const slipUrl = row[slipUrlIndex];

      if (registrationId && slipUrl && slipUrl.trim() !== '') {
        registrations.push({
          registrationId: registrationId.trim(),
          slipUrl: slipUrl.trim(),
        });
      }
    }

    return registrations;
  } catch (error) {
    console.error(`Error reading from sheet ${sheetName}:`, error);
    throw error;
  }
}

/**
 * Update Firestore eventRegistrations with slip URLs
 */
async function syncSlipUrlsToFirestore(eventId, registrationsWithSlips) {
  let successCount = 0;
  let notFoundCount = 0;
  let alreadySetCount = 0;

  console.log(`\n📝 Syncing ${registrationsWithSlips.length} slip URLs to Firestore...`);

  for (const { registrationId, slipUrl } of registrationsWithSlips) {
    try {
      // Find registration in Firestore
      const snapshot = await db
        .collection('eventRegistrations')
        .where('registrationId', '==', registrationId)
        .where('eventId', '==', eventId)
        .limit(1)
        .get();

      if (snapshot.empty) {
        console.warn(`⚠️  Registration not found in Firestore: ${registrationId}`);
        notFoundCount++;
        continue;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      // Check if slipUrl is already set
      if (data.slipUrl && data.slipUrl.trim() !== '') {
        console.log(`ℹ️  Registration ${registrationId} already has slipUrl - skipping`);
        alreadySetCount++;
        continue;
      }

      // Update slipUrl field
      await doc.ref.update({
        slipUrl: slipUrl,
        updatedAt: new Date().toISOString(),
      });

      console.log(`✅ Updated ${registrationId} with slip URL`);
      successCount++;
    } catch (error) {
      console.error(`❌ Error updating ${registrationId}:`, error.message);
    }
  }

  return { successCount, notFoundCount, alreadySetCount };
}

/**
 * Main sync function
 */
async function syncSlipUrls(eventId) {
  console.log(`\n🔄 Starting slip URL sync for event: ${eventId}\n`);

  // 1. Get event details
  const event = await getEventById(eventId);
  if (!event) {
    console.error(`❌ Event not found: ${eventId}`);
    process.exit(1);
  }

  if (!event.sheetName) {
    console.error(`❌ Event has no sheetName configured: ${eventId}`);
    process.exit(1);
  }

  console.log(`📋 Event: ${event.eventName}`);
  console.log(`📊 Sheet: ${event.sheetName}`);

  // 2. Read slip URLs from Google Sheets
  console.log(`\n📖 Reading slip URLs from Google Sheets...`);
  const registrationsWithSlips = await getRegistrationsFromSheets(event.sheetName);

  console.log(`\n📊 Found ${registrationsWithSlips.length} registrations with slip URLs in Google Sheets`);

  if (registrationsWithSlips.length === 0) {
    console.log(`\n⚠️  No slip URLs found in Google Sheets - nothing to sync`);
    return;
  }

  // Show sample
  console.log(`\nSample (first 3):`);
  registrationsWithSlips.slice(0, 3).forEach(({ registrationId, slipUrl }) => {
    console.log(`  - ${registrationId}: ${slipUrl.substring(0, 60)}...`);
  });

  // 3. Sync to Firestore
  const { successCount, notFoundCount, alreadySetCount } = await syncSlipUrlsToFirestore(eventId, registrationsWithSlips);

  // 4. Summary
  console.log(`\n✅ Sync Complete!`);
  console.log(`   Updated:        ${successCount}`);
  console.log(`   Already set:    ${alreadySetCount}`);
  console.log(`   Not found:      ${notFoundCount}`);
  console.log(`   Total in sheet: ${registrationsWithSlips.length}`);
}

// Run script
const eventId = process.argv[2];

if (!eventId) {
  console.error('Usage: node scripts/sync-slip-urls-from-sheets.js <eventId>');
  console.error('Example: node scripts/sync-slip-urls-from-sheets.js 10yearth-meeting-2025');
  process.exit(1);
}

syncSlipUrls(eventId)
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
