#!/usr/bin/env node

/**
 * Migration Script: EventRegistration Slip URLs → PaymentSlips Collection
 *
 * This script migrates payment slip URLs from embedded fields in eventRegistrations
 * to a separate paymentSlips collection.
 *
 * Migration Rules:
 * 1. slipUrl (legacy) → paymentType: "full"
 * 2. depositSlipUrl → paymentType: "deposit"
 * 3. remainingSlipUrl:
 *    - if depositAmount = 0 → paymentType: "full"
 *    - if depositAmount > 0 → paymentType: "remaining"
 *
 * Usage:
 *   node scripts/migrate-payment-slips.js [--dry-run] [--event-id=EVENT_ID]
 */

const admin = require('firebase-admin');
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
Payment Slips Migration Script

Migrates payment slip URLs from eventRegistrations to paymentSlips collection.

Usage:
  node scripts/migrate-payment-slips.js [options]

Options:
  --dry-run       : Run without writing to Firestore (test mode)
  --event-id=ID   : Migrate only specific event
  --help          : Show this help message

Examples:
  # Dry run (test without writing)
  node scripts/migrate-payment-slips.js --dry-run

  # Migrate specific event
  node scripts/migrate-payment-slips.js --event-id=event-2026

  # Migrate all events
  node scripts/migrate-payment-slips.js
  `);
  process.exit(0);
}

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

// Generate slip ID
function generateSlipId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `SLIP_${timestamp}_${random}`;
}

// Get payment type label
function getPaymentTypeLabel(paymentType) {
  const labels = {
    full: 'ชำระเต็มจำนวน',
    deposit: 'ชำระมัดจำ',
    remaining: 'ชำระยอดคงเหลือ',
    additional: 'ชำระเพิ่มเติม',
  };
  return labels[paymentType] || paymentType;
}

// Main migration function
async function migratePaymentSlips() {
  console.log('🚀 Starting Payment Slips Migration');
  console.log('=====================================');
  console.log('Mode:', isDryRun ? 'DRY RUN (no writes)' : 'LIVE (writing to Firestore)');
  console.log('Event filter:', specificEventId || 'All events');
  console.log('');

  const db = initializeFirebase();

  // Get all registrations
  let query = db.collection('eventRegistrations');
  if (specificEventId) {
    query = query.where('eventId', '==', specificEventId);
  }

  const snapshot = await query.get();
  console.log(`📊 Found ${snapshot.size} registrations to process\n`);

  let totalSlipsCreated = 0;
  let registrationsProcessed = 0;
  let registrationsSkipped = 0;
  const errorRegistrations = [];

  for (const doc of snapshot.docs) {
    const registration = doc.data();
    const registrationId = registration.registrationId;

    try {
      const slipsToCreate = [];

      // 1. Migrate slipUrl (legacy field)
      if (registration.slipUrl && registration.slipUrl.trim() !== '') {
        slipsToCreate.push({
          slipId: generateSlipId(),
          registrationId: registrationId,
          eventId: registration.eventId,
          amount: registration.totalAmount || 0,
          paymentType: 'full',
          description: 'ชำระเต็มจำนวน (Legacy)',
          slipUrl: registration.slipUrl,
          uploadedAt: registration.registeredAt || new Date().toISOString(),
          uploadedBy: registration.userId || registration.lineUserId || 'system',
          status: 'approved',
          createdAt: new Date().toISOString(),
        });
      }

      // 2. Migrate depositSlipUrl
      if (registration.depositSlipUrl && registration.depositSlipUrl.trim() !== '') {
        slipsToCreate.push({
          slipId: generateSlipId(),
          registrationId: registrationId,
          eventId: registration.eventId,
          amount: registration.depositAmount || 0,
          paymentType: 'deposit',
          description: 'ชำระมัดจำ',
          slipUrl: registration.depositSlipUrl,
          uploadedAt: registration.depositPaidDate || registration.registeredAt || new Date().toISOString(),
          uploadedBy: registration.userId || registration.lineUserId || 'system',
          status: 'approved',
          createdAt: new Date().toISOString(),
        });
      }

      // 3. Migrate remainingSlipUrl (check depositAmount!)
      if (registration.remainingSlipUrl && registration.remainingSlipUrl.trim() !== '') {
        const depositAmount = registration.depositAmount || 0;
        const isFullPayment = depositAmount === 0;

        slipsToCreate.push({
          slipId: generateSlipId(),
          registrationId: registrationId,
          eventId: registration.eventId,
          amount: isFullPayment ? (registration.totalAmount || 0) : (registration.remainingAmount || 0),
          paymentType: isFullPayment ? 'full' : 'remaining',
          description: isFullPayment ? 'ชำระเต็มจำนวน' : 'ชำระยอดคงเหลือ',
          slipUrl: registration.remainingSlipUrl,
          uploadedAt: registration.remainingPaidDate || registration.registeredAt || new Date().toISOString(),
          uploadedBy: registration.userId || registration.lineUserId || 'system',
          status: 'approved',
          createdAt: new Date().toISOString(),
        });
      }

      if (slipsToCreate.length === 0) {
        registrationsSkipped++;
        continue;
      }

      // Display what we're going to create
      console.log(`📝 Registration: ${registrationId} (${registration.companyName || 'N/A'})`);
      console.log(`   Event: ${registration.eventId}`);
      console.log(`   Creating ${slipsToCreate.length} payment slip(s):`);
      slipsToCreate.forEach((slip, i) => {
        console.log(`   ${i + 1}. ${slip.paymentType.toUpperCase()} - ${slip.amount.toLocaleString()} บาท`);
        console.log(`      URL: ${slip.slipUrl.substring(0, 60)}...`);
      });

      // Write to Firestore
      if (!isDryRun) {
        const batch = db.batch();
        for (const slip of slipsToCreate) {
          const slipRef = db.collection('paymentSlips').doc(slip.slipId);
          batch.set(slipRef, slip);
        }
        await batch.commit();
        console.log(`   ✅ Successfully created ${slipsToCreate.length} payment slip(s)\n`);
      } else {
        console.log(`   🔍 [DRY RUN] Would create ${slipsToCreate.length} payment slip(s)\n`);
      }

      totalSlipsCreated += slipsToCreate.length;
      registrationsProcessed++;

    } catch (error) {
      console.error(`   ❌ Error processing ${registrationId}:`, error.message);
      errorRegistrations.push({
        registrationId,
        error: error.message,
      });
    }
  }

  // Summary
  console.log('');
  console.log('=====================================');
  console.log('📊 Migration Summary');
  console.log('=====================================');
  console.log(`Total registrations scanned: ${snapshot.size}`);
  console.log(`Registrations processed: ${registrationsProcessed}`);
  console.log(`Registrations skipped (no slips): ${registrationsSkipped}`);
  console.log(`Payment slips created: ${totalSlipsCreated}`);
  console.log(`Errors: ${errorRegistrations.length}`);

  if (errorRegistrations.length > 0) {
    console.log('\n❌ Errors:');
    errorRegistrations.forEach(err => {
      console.log(`   - ${err.registrationId}: ${err.error}`);
    });
  }

  if (isDryRun) {
    console.log('\n🔍 DRY RUN MODE - No data was written to Firestore');
    console.log('   Run without --dry-run to perform actual migration');
  } else {
    console.log('\n✅ Migration completed successfully!');
  }

  console.log('');
}

// Run migration
migratePaymentSlips()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
