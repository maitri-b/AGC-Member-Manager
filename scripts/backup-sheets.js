#!/usr/bin/env node

/**
 * Backup Script: Export Google Sheets to CSV
 *
 * This script exports all event sheets to CSV files for backup before migration
 *
 * Usage:
 *   node scripts/backup-sheets.js
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const BACKUP_DIR = path.join(__dirname, '../backups', new Date().toISOString().split('T')[0]);

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

// Convert array to CSV
function arrayToCSV(data) {
  return data.map(row =>
    row.map(cell => {
      const str = String(cell || '');
      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',')
  ).join('\n');
}

// Export sheet to CSV
async function exportSheetToCSV(sheets, sheetName, outputPath) {
  console.log(`  📄 Exporting: ${sheetName}...`);

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:AZ`,
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      console.log(`  ⚠️  Empty sheet: ${sheetName}`);
      return;
    }

    const csv = arrayToCSV(rows);
    fs.writeFileSync(outputPath, csv, 'utf8');
    console.log(`  ✅ Saved: ${outputPath} (${rows.length} rows)`);

  } catch (error) {
    console.error(`  ❌ Error exporting ${sheetName}:`, error.message);
  }
}

// Backup Firestore collection
async function backupFirestore(db, collection, outputPath) {
  console.log(`\n💾 Backing up Firestore collection: ${collection}...`);

  try {
    const snapshot = await db.collection(collection).get();
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ Saved: ${outputPath} (${data.length} documents)`);

  } catch (error) {
    console.error(`❌ Error backing up ${collection}:`, error.message);
  }
}

// Main backup function
async function backup() {
  console.log('\n💾 Starting Backup: Google Sheets → CSV\n');

  try {
    // Create backup directory
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      console.log(`📁 Created backup directory: ${BACKUP_DIR}\n`);
    }

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

    // Backup each event sheet
    console.log('📊 Backing up Event Sheets...\n');
    for (const event of events) {
      if (!event.sheetName) {
        console.log(`⚠️  Skipping ${event.eventId}: No sheet name`);
        continue;
      }

      const filename = `${event.sheetName}.csv`;
      const outputPath = path.join(BACKUP_DIR, filename);
      await exportSheetToCSV(sheets, event.sheetName, outputPath);
    }

    // Backup Members sheet
    console.log('\n👥 Backing up Members Sheet...\n');
    const membersPath = path.join(BACKUP_DIR, 'AGC_Membership.csv');
    await exportSheetToCSV(sheets, 'AGC_Membership', membersPath);

    // Backup existing Firestore data (if any)
    console.log('\n🔥 Backing up Firestore...\n');
    await backupFirestore(db, 'events', path.join(BACKUP_DIR, 'firestore-events.json'));
    await backupFirestore(db, 'eventRegistrations', path.join(BACKUP_DIR, 'firestore-eventRegistrations.json'));

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ BACKUP COMPLETED');
    console.log('='.repeat(60));
    console.log(`Backup Location: ${BACKUP_DIR}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ BACKUP FAILED:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run backup
backup();
