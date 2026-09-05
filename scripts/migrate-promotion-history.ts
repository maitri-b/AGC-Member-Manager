/**
 * Migration Script: Update promotion history for specific event
 *
 * This script migrates existing promotion history records for the event:
 * 'agents-club-x-สนท.-ร่วมส่งน้ำใจช่วยเหลือผู้ประสบอุทกภัย-จ.น่าน-2026'
 *
 * It ensures all records have proper subject fields and messageType set correctly.
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Initialize Firebase Admin
if (getApps().length === 0) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  initializeApp({
    credential: cert(serviceAccount as any),
  });
}

const db = getFirestore();

const TARGET_EVENT_ID = 'agents-club-x-สนท.-ร่วมส่งน้ำใจช่วยเหลือผู้ประสบอุทกภัย-จ.น่าน-2026';

async function migratePromotionHistory() {
  console.log('Starting migration for event:', TARGET_EVENT_ID);
  console.log('='.repeat(80));

  try {
    // Fetch all promotion history for the target event
    const snapshot = await db
      .collection('promotionHistory')
      .where('eventId', '==', TARGET_EVENT_ID)
      .get();

    console.log(`Found ${snapshot.size} records for event ${TARGET_EVENT_ID}\n`);

    if (snapshot.empty) {
      console.log('No records found. Nothing to migrate.');
      return;
    }

    let updatedCount = 0;
    let alreadyCorrectCount = 0;
    const batch = db.batch();
    const updateDetails: Array<{ id: string; before: any; after: any }> = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const updates: any = {};
      const before: any = {};

      // Ensure messageType is set
      if (!data.messageType) {
        before.messageType = '(ไม่มี)';
        updates.messageType = 'promote'; // Default to promote for old records
      }

      // Ensure subject is set
      if (!data.subject) {
        before.subject = '(ไม่มี)';
        if (data.messageType === 'promote' || updates.messageType === 'promote') {
          updates.subject = '📢 โปรโมทกิจกรรม';
        } else {
          updates.subject = data.eventName || 'ข้อความกำหนดเอง';
        }
      }

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        batch.update(doc.ref, updates);
        updatedCount++;
        updateDetails.push({
          id: doc.id,
          before,
          after: updates,
        });
      } else {
        alreadyCorrectCount++;
      }
    });

    // Display detailed report
    console.log('📊 Migration Report');
    console.log('-'.repeat(80));
    console.log(`Total records found:        ${snapshot.size}`);
    console.log(`Records to be updated:      ${updatedCount}`);
    console.log(`Already correct:            ${alreadyCorrectCount}`);
    console.log('-'.repeat(80));

    if (updatedCount > 0) {
      console.log('\n📝 Update Details:');
      updateDetails.forEach((detail, index) => {
        console.log(`\n${index + 1}. Record ID: ${detail.id}`);
        Object.keys(detail.before).forEach((key) => {
          console.log(`   ${key}:`);
          console.log(`     Before: ${detail.before[key]}`);
          console.log(`     After:  ${detail.after[key]}`);
        });
      });

      console.log('\n⏳ Committing changes to Firestore...');
      await batch.commit();
      console.log(`✅ Successfully updated ${updatedCount} record(s)`);
    } else {
      console.log('\n✅ All records are already up to date. No changes needed.');
    }

    console.log('\n' + '='.repeat(80));
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
}

// Run migration
migratePromotionHistory()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nFailed:', error);
    process.exit(1);
  });
