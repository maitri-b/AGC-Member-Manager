#!/usr/bin/env node

/**
 * Migration Script: Google Sheets Event Registrations → Firestore
 *
 * This script migrates all event registration data from Google Sheets
 * (separate sheets per event) to Firestore (single eventRegistrations collection)
 *
 * Usage:
 *   node scripts/migrate-events-to-firestore.js [--dry-run] [--event-id=EVENT_ID]
 *
 * Options:
 *   --dry-run       : Run without writing to Firestore (test mode)
 *   --event-id=ID   : Migrate only specific event
 *   --help          : Show this help message
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const specificEventId = args.find(arg => arg.startsWith('--event-id='))?.split('=')[1];
const showHelp = args.includes('--help');

if (showHelp) {
  console.log(`
Migration Script: Google Sheets Event Registrations → Firestore

Usage:
  node scripts/migrate-events-to-firestore.js [options]

Options:
  --dry-run       : Run without writing to Firestore (test mode)
  --event-id=ID   : Migrate only specific event
  --help          : Show this help message

Examples:
  # Dry run (test without writing)
  node scripts/migrate-events-to-firestore.js --dry-run

  # Migrate specific event
  node scripts/migrate-events-to-firestore.js --event-id=2024-agm

  # Migrate all events
  node scripts/migrate-events-to-firestore.js
  `);
  process.exit(0);
}

// Configuration
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const FIRESTORE_COLLECTION = 'eventRegistrations';

// Column mapping (from event-sheets.ts) - normalized to lowercase for case-insensitive matching
const COLUMN_TO_REGISTRATION_MAP_NORMALIZED = {
  'registration_id': 'registrationId',
  'event_id': 'eventId',
  'user_id': 'userId',
  'line_user_id': 'lineUserId',
  'line_userid': 'lineUserId',
  'member_id': 'memberId',
  'memberid': 'memberId',
  'company_name': 'companyName',
  'license_number': 'licenseNumber',
  'contact_name': 'contactName',
  'contact_phone': 'phone',
  'phone': 'phone',
  'contact_email': 'email',
  'email': 'email',
  'attendee_count': 'attendeeCount',
  'attendee_names': 'attendeeNames',
  'shirt_count': 'shirtCount',
  'event_fee': 'eventFee',
  'shirt_fee': 'shirtFee',
  'total_amount': 'totalAmount',
  'deposit_amount': 'depositAmount',
  'remaining_amount': 'remainingAmount',
  'deposit_paid': 'depositPaid',
  'deposit_paid_date': 'depositPaidDate',
  'deposit_slip_url': 'depositSlipUrl',
  'deposit_deadline': 'depositDeadline',
  'remaining_slip_url': 'remainingSlipUrl',
  'remaining_paid_date': 'remainingPaidDate',
  'remaining_deadline': 'remainingDeadline',
  'payment_status': 'paymentStatus',
  'status': 'status',
  'registration_date': 'registeredAt',
  'registered_at': 'registeredAt',
  'updated_at': 'updatedAt',
  'notes': 'notes',
  'special_charges': 'specialCharges',
  'attendee_type': 'attendeeType',
};

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

// Get all events from Firestore
async function getAllEvents(db) {
  const eventsSnapshot = await db.collection('events').get();
  return eventsSnapshot.docs.map(doc => ({
    eventId: doc.id,
    ...doc.data(),
  }));
}

// Convert sheet row to registration object
function rowToRegistration(headers, row, eventId) {
  const registration = {};

  headers.forEach((header, index) => {
    const value = row[index] || '';
    // Normalize header to lowercase for case-insensitive matching
    const normalizedHeader = header.trim().toLowerCase();
    const registrationKey = COLUMN_TO_REGISTRATION_MAP_NORMALIZED[normalizedHeader];

    if (registrationKey) {
      // Convert numeric fields
      if (['attendeeCount', 'shirtCount', 'eventFee', 'shirtFee', 'totalAmount', 'depositAmount', 'remainingAmount'].includes(registrationKey)) {
        registration[registrationKey] = value ? parseFloat(value) || 0 : 0;
      }
      // Convert boolean fields
      else if (registrationKey === 'depositPaid') {
        registration[registrationKey] = value === 'TRUE' || value === 'true' || value === '1' || value === 'Yes';
      }
      // Convert date fields
      else if (['depositPaidDate', 'remainingPaidDate', 'depositDeadline', 'remainingDeadline', 'registeredAt', 'updatedAt'].includes(registrationKey)) {
        if (value && value !== '') {
          try {
            registration[registrationKey] = new Date(value).toISOString();
          } catch (e) {
            registration[registrationKey] = value;
          }
        }
      }
      // String fields
      else {
        registration[registrationKey] = value;
      }
    }
  });

  // Ensure eventId is set
  if (!registration.eventId) {
    registration.eventId = eventId;
  }

  return registration;
}

// Read registrations from a single event sheet
async function getEventRegistrations(sheets, eventId, sheetName) {
  console.log(`  📄 Reading sheet: ${sheetName}...`);

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:AZ`,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log(`  ⚠️  Empty sheet: ${sheetName}`);
      return [];
    }

    const headers = rows[0];
    const dataRows = rows.slice(1).filter(row => row && row.length > 0);
    console.log(`  📝 Data rows: ${dataRows.length}`);

    const registrations = dataRows
      .map(row => rowToRegistration(headers, row, eventId))
      .filter(reg => {
        if (!reg.registrationId) {
          console.log(`  ⚠️  Skipping row without registrationId:`, reg);
        }
        return reg.registrationId;
      });

    console.log(`  ✅ Found ${registrations.length} registrations`);
    return registrations;

  } catch (error) {
    console.error(`  ❌ Error reading sheet ${sheetName}:`, error.message);
    return [];
  }
}

// Write registrations to Firestore
async function writeToFirestore(db, registrations) {
  const batch = db.batch();
  let count = 0;

  for (const registration of registrations) {
    const docRef = db.collection(FIRESTORE_COLLECTION).doc();
    batch.set(docRef, {
      ...registration,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
      migratedFrom: 'google-sheets',
    });
    count++;

    // Commit batch every 500 documents (Firestore limit)
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`    💾 Committed ${count} registrations...`);
    }
  }

  // Commit remaining
  if (count % 500 !== 0) {
    await batch.commit();
  }

  return count;
}

// Main migration function
async function migrate() {
  console.log('\n🚀 Starting Migration: Google Sheets → Firestore\n');
  console.log(`📋 Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'LIVE MIGRATION'}\n`);

  try {
    // Initialize
    const db = initializeFirebase();
    const sheets = getGoogleSheetsClient();

    // Get all events
    console.log('📚 Fetching events from Firestore...');
    let events = await getAllEvents(db);

    // Filter by specific event if specified
    if (specificEventId) {
      events = events.filter(e => e.eventId === specificEventId);
      if (events.length === 0) {
        console.error(`❌ Event not found: ${specificEventId}`);
        process.exit(1);
      }
      console.log(`✅ Found event: ${events[0].eventName}\n`);
    } else {
      console.log(`✅ Found ${events.length} events\n`);
    }

    // Statistics
    let totalRegistrations = 0;
    let totalWritten = 0;
    const eventStats = [];

    // Migrate each event
    for (const event of events) {
      if (!event.sheetName) {
        console.log(`⚠️  Skipping ${event.eventId}: No sheet name configured`);
        continue;
      }

      console.log(`\n📊 Event: ${event.eventName} (${event.eventId})`);

      // Read from Google Sheets
      const registrations = await getEventRegistrations(sheets, event.eventId, event.sheetName);
      totalRegistrations += registrations.length;

      if (registrations.length === 0) {
        console.log(`  ℹ️  No registrations to migrate`);
        continue;
      }

      // Write to Firestore
      if (!isDryRun) {
        console.log(`  💾 Writing to Firestore...`);
        const written = await writeToFirestore(db, registrations);
        totalWritten += written;
        console.log(`  ✅ Wrote ${written} registrations`);
      } else {
        console.log(`  🔍 [DRY RUN] Would write ${registrations.length} registrations`);
      }

      eventStats.push({
        eventId: event.eventId,
        eventName: event.eventName,
        count: registrations.length,
      });
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Events:        ${events.length}`);
    console.log(`Total Registrations: ${totalRegistrations}`);
    if (!isDryRun) {
      console.log(`Total Written:       ${totalWritten}`);
    }
    console.log('\nPer Event:');
    eventStats.forEach(stat => {
      console.log(`  - ${stat.eventName}: ${stat.count} registrations`);
    });
    console.log('='.repeat(60));

    if (isDryRun) {
      console.log('\n✅ DRY RUN COMPLETED - No data was written to Firestore');
      console.log('   Run without --dry-run to execute the migration');
    } else {
      console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY');
      console.log(`   ${totalWritten} registrations migrated to Firestore`);
    }

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrate();
