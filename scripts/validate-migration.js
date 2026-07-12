#!/usr/bin/env node

/**
 * Validation Script: Verify migration integrity
 *
 * This script validates that all data was migrated correctly from Google Sheets to Firestore
 *
 * Usage:
 *   node scripts/validate-migration.js
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Initialize Firebase Admin
function initializeFirebase() {
  if (!admin.apps.length) {
    const serviceAccount = {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  return admin.firestore();
}

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

// Count rows in Google Sheet
async function countSheetRows(sheets, sheetName) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:A`,
    });

    const rows = response.data.values || [];
    // Subtract 1 for header row
    return Math.max(0, rows.length - 1);

  } catch (error) {
    console.error(`  ❌ Error reading ${sheetName}:`, error.message);
    return 0;
  }
}

// Count Firestore documents for event
async function countFirestoreRegistrations(db, eventId) {
  const snapshot = await db
    .collection('eventRegistrations')
    .where('eventId', '==', eventId)
    .get();

  return snapshot.size;
}

// Sample random records for detailed comparison
async function sampleRecords(db, sheets, eventId, sheetName, sampleSize = 5) {
  console.log(`  🔍 Sampling ${sampleSize} random records...`);

  try {
    // Get all sheet data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:AZ`,
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) {
      console.log(`  ⚠️  No data to sample`);
      return;
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Sample random rows
    const samples = [];
    for (let i = 0; i < Math.min(sampleSize, dataRows.length); i++) {
      const randomIndex = Math.floor(Math.random() * dataRows.length);
      samples.push(dataRows[randomIndex]);
    }

    // Check each sample in Firestore
    const regIdIndex = headers.findIndex(h => h.trim() === 'Registration_ID');
    if (regIdIndex === -1) {
      console.log(`  ⚠️  Registration_ID column not found`);
      return;
    }

    let matchCount = 0;
    for (const row of samples) {
      const registrationId = row[regIdIndex];
      if (!registrationId) continue;

      const snapshot = await db
        .collection('eventRegistrations')
        .where('registrationId', '==', registrationId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        matchCount++;
      }
    }

    console.log(`  ✅ Sample validation: ${matchCount}/${samples.length} records found in Firestore`);

  } catch (error) {
    console.error(`  ❌ Error sampling records:`, error.message);
  }
}

// Main validation function
async function validate() {
  console.log('\n🔍 Starting Validation: Migration Integrity Check\n');

  try {
    // Initialize
    const db = initializeFirebase();
    const sheets = getGoogleSheetsClient();

    // Get all events
    console.log('📚 Fetching events from Firestore...');
    const eventsSnapshot = await db.collection('events').get();
    const events = eventsSnapshot.docs.map(doc => ({
      eventId: doc.id,
      ...doc.data(),
    }));
    console.log(`✅ Found ${events.length} events\n`);

    // Validate each event
    const results = [];
    let totalSheetRows = 0;
    let totalFirestoreDocs = 0;

    for (const event of events) {
      if (!event.sheetName) {
        console.log(`⚠️  Skipping ${event.eventId}: No sheet name`);
        continue;
      }

      console.log(`\n📊 Event: ${event.eventName} (${event.eventId})`);

      // Count in Google Sheets
      const sheetCount = await countSheetRows(sheets, event.sheetName);
      console.log(`  📄 Google Sheets: ${sheetCount} rows`);

      // Count in Firestore
      const firestoreCount = await countFirestoreRegistrations(db, event.eventId);
      console.log(`  🔥 Firestore:      ${firestoreCount} documents`);

      // Check if counts match
      const match = sheetCount === firestoreCount;
      const status = match ? '✅' : '❌';
      console.log(`  ${status} Match: ${match ? 'Yes' : 'No'}`);

      // Sample records for detailed validation
      if (firestoreCount > 0) {
        await sampleRecords(db, sheets, event.eventId, event.sheetName);
      }

      totalSheetRows += sheetCount;
      totalFirestoreDocs += firestoreCount;

      results.push({
        eventId: event.eventId,
        eventName: event.eventName,
        sheetCount,
        firestoreCount,
        match,
      });
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Events:          ${events.length}`);
    console.log(`Total Sheet Rows:      ${totalSheetRows}`);
    console.log(`Total Firestore Docs:  ${totalFirestoreDocs}`);
    console.log(`Match:                 ${totalSheetRows === totalFirestoreDocs ? '✅ YES' : '❌ NO'}`);
    console.log('\nPer Event:');
    results.forEach(result => {
      const status = result.match ? '✅' : '❌';
      console.log(`  ${status} ${result.eventName}: ${result.sheetCount} → ${result.firestoreCount}`);
    });
    console.log('='.repeat(60));

    // Check if all matched
    const allMatch = results.every(r => r.match);
    if (allMatch && totalSheetRows === totalFirestoreDocs) {
      console.log('\n✅ VALIDATION PASSED - All data migrated correctly!');
      process.exit(0);
    } else {
      console.log('\n❌ VALIDATION FAILED - Data mismatch detected!');
      console.log('   Please review the results above and check for issues.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ VALIDATION FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run validation
validate();
