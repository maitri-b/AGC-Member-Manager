require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin with env variables
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

const db = admin.firestore();

async function checkRegistration(registrationId) {
  try {
    console.log(`\n🔍 Searching for registration: ${registrationId}`);

    const snapshot = await db.collection('eventRegistrations')
      .where('registrationId', '==', registrationId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log(`❌ Registration ${registrationId} NOT FOUND in Firestore`);

      // Check if it exists in other collections
      console.log('\n📋 Checking all registrations...');
      const allSnapshot = await db.collection('eventRegistrations').limit(5).get();
      console.log(`Found ${allSnapshot.size} registrations in Firestore`);

      if (allSnapshot.size > 0) {
        console.log('\nSample registration IDs:');
        allSnapshot.docs.slice(0, 5).forEach(doc => {
          console.log(`  - ${doc.data().registrationId} (Event: ${doc.data().eventId})`);
        });
      }

      return false;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    console.log(`✅ Found registration ${registrationId}`);
    console.log('📋 Details:');
    console.log(`   Event ID: ${data.eventId}`);
    console.log(`   User ID: ${data.userId}`);
    console.log(`   LINE User ID: ${data.lineUserId || 'N/A'}`);
    console.log(`   Company: ${data.companyName || 'N/A'}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Payment Status: ${data.paymentStatus || 'N/A'}`);
    console.log(`   Total Amount: ${data.totalAmount || 0}`);
    console.log(`   Deposit Amount: ${data.depositAmount || 0}`);
    console.log(`   Remaining Amount: ${data.remainingAmount || 0}`);
    console.log(`   Registered At: ${data.registeredAt}`);
    console.log(`   Updated At: ${data.updatedAt || 'N/A'}`);

    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// Run check
const registrationId = process.argv[2] || 'WYQ8M8';
checkRegistration(registrationId).then(() => process.exit(0));
