require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    })
  });
}

const db = admin.firestore();

async function checkRegistration() {
  try {
    const eventId = '🎉-งานแรลลี่-10th-anniversary-agents-club-2026';
    const registrationId = 'QGT99S';

    console.log('Searching for registration:', registrationId);
    console.log('Event ID:', eventId);

    const snapshot = await db.collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .where('registrationId', '==', registrationId)
      .get();

    if (snapshot.empty) {
      console.log('❌ Registration NOT FOUND in Firestore');

      // Try searching without eventId filter
      console.log('\nSearching by registrationId only...');
      const snapshot2 = await db.collection('eventRegistrations')
        .where('registrationId', '==', registrationId)
        .get();

      if (snapshot2.empty) {
        console.log('❌ Registration NOT FOUND anywhere in Firestore');
      } else {
        console.log('✅ Found in different event:');
        snapshot2.forEach(doc => {
          const data = doc.data();
          console.log('  Event ID:', data.eventId);
          console.log('  Registration ID:', data.registrationId);
          console.log('  Company:', data.companyName);
        });
      }
    } else {
      console.log('✅ Registration FOUND in Firestore');
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log('\nRegistration Data:');
        console.log('  Doc ID:', doc.id);
        console.log('  Registration ID:', data.registrationId);
        console.log('  Event ID:', data.eventId);
        console.log('  Company:', data.companyName);
        console.log('  Status:', data.status);
        console.log('  Attendance Type:', data.attendanceType);
        console.log('  Registered At:', data.registeredAt);
      });
    }

    // Check total count in this event
    console.log('\n--- Total registrations in this event ---');
    const allRegs = await db.collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .get();

    console.log('Total registrations:', allRegs.size);
    console.log('\nAll registration IDs:');
    allRegs.forEach(doc => {
      const data = doc.data();
      console.log('  -', data.registrationId, '|', data.companyName, '| attendanceType:', data.attendanceType);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkRegistration();
