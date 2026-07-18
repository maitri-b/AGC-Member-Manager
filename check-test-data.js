/**
 * Quick script to check if test data exists for automated tests
 * Run: node check-test-data.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (assumes service account key is available)
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const TEST_EVENT_ID = 'กิจกรรมทดสอบการลงทะเบียน-2026';

async function checkTestData() {
  console.log('🔍 Checking test data for automated tests...\n');
  console.log(`Event ID: ${TEST_EVENT_ID}\n`);

  try {
    // Check registrations
    const snapshot = await db
      .collection('eventRegistrations')
      .where('eventId', '==', TEST_EVENT_ID)
      .limit(10)
      .get();

    console.log(`✅ Found ${snapshot.size} registration(s)\n`);

    if (snapshot.size === 0) {
      console.log('❌ ERROR: No registrations found for this event!');
      console.log('   Please create at least 1-2 test registrations first.\n');
      process.exit(1);
    }

    // Analyze registrations
    let fullModeCount = 0;
    let depositModeCount = 0;

    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const mode = data.paymentMode || 'unknown';

      if (mode === 'full') fullModeCount++;
      if (mode === 'deposit') depositModeCount++;

      console.log(`Registration ${index + 1}:`);
      console.log(`  - ID: ${data.registrationId}`);
      console.log(`  - Payment Mode: ${mode}`);
      console.log(`  - Total Amount: ${data.totalAmount || 0}`);
      if (mode === 'deposit') {
        console.log(`  - Deposit Amount: ${data.depositAmount || 0}`);
        console.log(`  - Remaining Amount: ${data.remainingAmount || 0}`);
      }
      console.log();
    });

    // Summary
    console.log('📊 Summary:');
    console.log(`  - Full Payment Mode: ${fullModeCount} registration(s)`);
    console.log(`  - Deposit Payment Mode: ${depositModeCount} registration(s)\n`);

    if (fullModeCount === 0 && depositModeCount === 0) {
      console.log('⚠️  WARNING: No registrations with recognized payment modes.');
      console.log('   Tests might fail. Please check registration data.\n');
    } else if (fullModeCount > 0) {
      console.log('✅ Test data looks good! You can run automated tests.');
      console.log('   (Testing with Full Payment Mode only)\n');
    } else {
      console.log('⚠️  WARNING: No full payment mode registrations found.');
      console.log('   Tests require at least one full payment mode registration.\n');
    }

    // Check existing test slips (should be none)
    const slipsSnapshot = await db
      .collection('paymentSlips')
      .where('eventId', '==', TEST_EVENT_ID)
      .get();

    const testSlips = slipsSnapshot.docs.filter(doc => doc.id.startsWith('TEST_SLIP_'));

    if (testSlips.length > 0) {
      console.log(`⚠️  Found ${testSlips.length} leftover test slip(s) from previous runs.`);
      console.log('   These will be cleaned up automatically during tests.\n');
    }

  } catch (error) {
    console.error('❌ Error checking test data:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

checkTestData();
