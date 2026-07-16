/**
 * Migration Script: Fix Room Fee Calculation in Existing Registrations
 *
 * This script recalculates and fixes room fees for existing event registrations.
 *
 * Background:
 * - Bug: Room fees were not properly calculated/saved for registrations
 * - For attendee type pricing: room fees were added to totalFee but saved as eventFee
 * - For fixed/tiered pricing: room fees were not calculated at all
 * - Fix: Separate eventFee, roomFee, and totalAmount fields
 *
 * This migration:
 * 1. Identifies registrations with room allocations
 * 2. Recalculates room fees from room allocations
 * 3. Separates eventFee and roomFee
 * 4. Updates totalAmount = eventFee + roomFee
 *
 * Run with: node scripts/migrate-room-fees.js
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

async function migrateRoomFees() {
  console.log('🚀 Starting migration: Fix Room Fee Calculation in Event Registrations');
  console.log('============================================================================\n');

  try {
    // 1. Get all events to get room type pricing
    const eventsSnapshot = await db.collection('events').get();
    const eventsMap = new Map();

    eventsSnapshot.forEach(doc => {
      const data = doc.data();
      eventsMap.set(doc.id, {
        eventId: doc.id,
        eventName: data.eventName || '',
        roomTypes: data.roomTypes || [],
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
        // Get event data
        const event = eventsMap.get(eventId);
        if (!event) {
          console.log(`⚠️  Skipping ${registrationId}: Event ${eventId} not found`);
          skippedCount++;
          continue;
        }

        // Check if this registration has room allocations
        const roomAllocations = regData.roomAllocations || [];
        if (roomAllocations.length === 0) {
          skippedCount++;
          continue; // No room allocations, nothing to fix
        }

        // Check if already migrated (has roomFee field that's not undefined)
        if (regData.roomFee !== undefined && regData.roomFee !== null) {
          skippedCount++;
          continue; // Already has roomFee field
        }

        // Calculate room fee from room allocations
        let calculatedRoomFee = 0;
        for (const alloc of roomAllocations) {
          const roomType = event.roomTypes.find(rt => rt.typeId === alloc.roomTypeId);
          if (roomType) {
            calculatedRoomFee += roomType.price * alloc.roomCount;
          } else {
            console.log(`⚠️  Warning: Room type ${alloc.roomTypeId} not found for ${registrationId}`);
          }
        }

        // Skip if no room fee to add
        if (calculatedRoomFee === 0) {
          skippedCount++;
          continue;
        }

        // Prepare update data
        const updateData = {};
        let hasUpdates = false;

        // Current values
        const currentEventFee = regData.eventFee || 0;
        const currentTotalAmount = regData.totalAmount || 0;

        // Calculate correct eventFee (totalAmount - roomFee)
        const correctEventFee = currentTotalAmount - calculatedRoomFee;

        // Only update if the calculation makes sense (positive values)
        if (correctEventFee >= 0) {
          updateData.eventFee = correctEventFee;
          updateData.roomFee = calculatedRoomFee;
          updateData.totalAmount = correctEventFee + calculatedRoomFee; // Should equal currentTotalAmount
          hasUpdates = true;
        } else {
          // If eventFee would be negative, it means the current data is inconsistent
          // Just add the roomFee field with calculated value
          updateData.roomFee = calculatedRoomFee;
          hasUpdates = true;
          console.log(`⚠️  Warning: ${registrationId} has inconsistent fee data. Adding roomFee only.`);
        }

        if (hasUpdates) {
          updateData.updatedAt = new Date().toISOString();
          updateData.migrationNote = 'Migrated room fees on ' + new Date().toISOString();

          await doc.ref.update(updateData);
          migratedCount++;

          console.log(`✅ Migrated ${registrationId} (${event.eventName})`);
          console.log(`   Room Fee: ฿${calculatedRoomFee.toLocaleString()}`);
          if (updateData.eventFee !== undefined) {
            console.log(`   Event Fee: ฿${currentEventFee.toLocaleString()} → ฿${correctEventFee.toLocaleString()}`);
          }
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
    console.log('\n============================================================================');
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${migratedCount} registrations`);
    console.log(`   ⏭️  Skipped (no room allocations or already migrated): ${skippedCount} registrations`);
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
migrateRoomFees()
  .then(() => {
    console.log('\n👋 Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  });
