/**
 * Migration Script: Add Full Payment Fields to Existing Registrations
 *
 * This script migrates existing event registrations to use dedicated full payment fields.
 *
 * For registrations with paymentMode='full' or depositAmount=0:
 * - Sets fullPaymentDeadline from remainingDeadline
 * - Sets fullPaymentPaid from depositPaid
 * - Sets fullPaymentPaidDate from depositPaidDate
 * - Sets fullPaymentSlipUrl from remainingSlipUrl or depositSlipUrl
 *
 * Run with: node scripts/migrate-full-payment-fields.js
 *
 * Prerequisites: Set these environment variables
 * - FIREBASE_ADMIN_PROJECT_ID
 * - FIREBASE_ADMIN_CLIENT_EMAIL
 * - FIREBASE_ADMIN_PRIVATE_KEY
 */

// Load .env.local file (same as Next.js does)
require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin using environment variables (same as src/lib/firebase-admin.ts)
if (!admin.apps.length) {
  if (!process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    console.error('❌ Missing Firebase Admin environment variables!');
    console.error('   Required: FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY');
    console.error('   Make sure .env.local file exists with these variables.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      // Replace escaped newlines in private key
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });

  console.log('✅ Firebase Admin initialized successfully');
  console.log(`   Project: ${process.env.FIREBASE_ADMIN_PROJECT_ID}\n`);
}

const db = admin.firestore();

async function migrateFullPaymentFields() {
  console.log('🚀 Starting migration: Add Full Payment Fields to Event Registrations');
  console.log('===========================================================================\n');

  try {
    // 1. Get all events to determine paymentMode
    const eventsSnapshot = await db.collection('events').get();
    const eventsMap = new Map();

    eventsSnapshot.forEach(doc => {
      const data = doc.data();
      eventsMap.set(doc.id, {
        eventId: doc.id,
        eventName: data.eventName || '',
        paymentMode: data.paymentMode || 'full', // Default to 'full' if not set
      });
    });

    console.log(`📊 Found ${eventsMap.size} events in database\n`);

    // 2. Get all event registrations
    const registrationsSnapshot = await db.collection('eventRegistrations').get();
    console.log(`📋 Found ${registrationsSnapshot.size} total registrations\n`);

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];

    // 3. Process each registration
    for (const doc of registrationsSnapshot.docs) {
      const regData = doc.data();
      const registrationId = regData.registrationId || doc.id;
      const eventId = regData.eventId;

      try {
        // Get event payment mode
        const event = eventsMap.get(eventId);
        const paymentMode = event?.paymentMode || 'full';
        const depositAmount = regData.depositAmount || 0;

        // Determine if this is a full payment registration
        const isFullPayment = paymentMode === 'full' || depositAmount === 0;

        if (!isFullPayment) {
          skippedCount++;
          continue; // Skip deposit mode registrations
        }

        // Check if already migrated (has fullPaymentDeadline field)
        if (regData.fullPaymentDeadline !== undefined) {
          skippedCount++;
          continue; // Already migrated
        }

        // Prepare update data
        const updateData = {};
        let hasUpdates = false;

        // Migrate fullPaymentDeadline from remainingDeadline
        if (regData.remainingDeadline) {
          updateData.fullPaymentDeadline = regData.remainingDeadline;
          hasUpdates = true;
        }

        // Migrate fullPaymentPaid from depositPaid
        if (regData.depositPaid !== undefined) {
          updateData.fullPaymentPaid = regData.depositPaid;
          hasUpdates = true;
        }

        // Migrate fullPaymentPaidDate from depositPaidDate
        if (regData.depositPaidDate) {
          updateData.fullPaymentPaidDate = regData.depositPaidDate;
          hasUpdates = true;
        }

        // Migrate fullPaymentSlipUrl from remainingSlipUrl or depositSlipUrl
        const slipUrl = regData.remainingSlipUrl || regData.depositSlipUrl;
        if (slipUrl) {
          updateData.fullPaymentSlipUrl = slipUrl;
          hasUpdates = true;
        }

        // Update paidAmount if missing
        if (regData.paidAmount === undefined && regData.depositPaid && regData.totalAmount) {
          updateData.paidAmount = regData.totalAmount;
          hasUpdates = true;
        }

        if (hasUpdates) {
          updateData.updatedAt = new Date().toISOString();
          updateData.migrationNote = 'Migrated to full payment fields on ' + new Date().toISOString();

          await doc.ref.update(updateData);
          migratedCount++;

          console.log(`✅ Migrated ${registrationId} (${event?.eventName || eventId})`);
        } else {
          skippedCount++;
        }

      } catch (error) {
        errorCount++;
        const errorMsg = `❌ Error migrating ${registrationId}: ${error.message}`;
        console.error(errorMsg);
        errors.push({ registrationId, error: error.message });
      }
    }

    // 4. Summary
    console.log('\n===========================================================================');
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${migratedCount} registrations`);
    console.log(`   ⏭️  Skipped (already migrated or deposit mode): ${skippedCount} registrations`);
    console.log(`   ❌ Errors: ${errorCount} registrations`);

    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(({ registrationId, error }) => {
        console.log(`   - ${registrationId}: ${error}`);
      });
    }

    console.log('\n✨ Migration completed!');

  } catch (error) {
    console.error('\n💥 Fatal error during migration:', error);
    throw error;
  }
}

// Run migration
migrateFullPaymentFields()
  .then(() => {
    console.log('\n👋 Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  });
