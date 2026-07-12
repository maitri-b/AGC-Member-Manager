const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
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
      return false;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    console.log(`✅ Found registration ${registrationId}`);
    console.log('📋 Details:');
    console.log(`   Event ID: ${data.eventId}`);
    console.log(`   User ID: ${data.userId}`);
    console.log(`   Company: ${data.companyName || 'N/A'}`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Payment Status: ${data.paymentStatus || 'N/A'}`);
    console.log(`   Total Amount: ${data.totalAmount || 0}`);
    console.log(`   Deposit Amount: ${data.depositAmount || 0}`);
    console.log(`   Remaining Amount: ${data.remainingAmount || 0}`);
    console.log(`   Registered At: ${data.registeredAt}`);

    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

// Run check
const registrationId = process.argv[2] || 'WYQ8M8';
checkRegistration(registrationId).then(() => process.exit(0));
