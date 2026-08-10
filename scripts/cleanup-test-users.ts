/**
 * Cleanup Test Users Script
 *
 * Removes all test accounts from the database.
 *
 * Usage:
 *   npm run cleanup-test-users
 *
 * ⚠️ ONLY run in development/staging environment!
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (if not already initialized)
if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : require('../firebase-service-account.json');

  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function cleanupTestUsers() {
  console.log('🧹 Starting test user cleanup...\n');

  // Safety check
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ ERROR: Cannot cleanup in PRODUCTION environment!');
    process.exit(1);
  }

  try {
    // Find all test accounts
    const snapshot = await db.collection('members')
      .where('testAccount', '==', true)
      .get();

    if (snapshot.empty) {
      console.log('✅ No test accounts found. Nothing to clean up.');
      return;
    }

    console.log(`📋 Found ${snapshot.size} test account(s) to delete:\n`);

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      console.log(`   - ${data.displayName} (${doc.id})`);
      batch.delete(doc.ref);
    });

    await batch.commit();

    console.log(`\n✅ Successfully deleted ${snapshot.size} test account(s)!`);

  } catch (error) {
    console.error('❌ Error cleaning up test users:', error);
    process.exit(1);
  }
}

cleanupTestUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
