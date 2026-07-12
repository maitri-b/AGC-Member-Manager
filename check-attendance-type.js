// Simple script to check attendanceType field in Firestore
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs } = require('firebase/firestore');

require('dotenv').config({ path: '.env.local' });

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkAttendanceTypes() {
  try {
    const eventId = '🎉-งานแรลลี่-10th-anniversary-agents-club-2026';

    console.log('Checking registrations for event:', eventId);
    console.log('---\n');

    const q = query(
      collection(db, 'eventRegistrations'),
      where('eventId', '==', eventId)
    );

    const snapshot = await getDocs(q);

    console.log('Total registrations:', snapshot.size);
    console.log('\nAttendance Type breakdown:');

    const typeCount = {};
    const missingType = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const type = data.attendanceType || 'MISSING';

      typeCount[type] = (typeCount[type] || 0) + 1;

      if (!data.attendanceType) {
        missingType.push({
          regId: data.registrationId,
          company: data.companyName,
        });
      }
    });

    console.log(JSON.stringify(typeCount, null, 2));

    if (missingType.length > 0) {
      console.log('\n❌ Registrations WITHOUT attendanceType:');
      missingType.forEach(r => {
        console.log(`  - ${r.regId} | ${r.company}`);
      });
    }

    // Check specific registration
    console.log('\n--- Checking QGT99S specifically ---');
    const qgt99s = snapshot.docs.find(doc => doc.data().registrationId === 'QGT99S');
    if (qgt99s) {
      const data = qgt99s.data();
      console.log('✅ Found QGT99S');
      console.log('  Company:', data.companyName);
      console.log('  attendanceType:', data.attendanceType || 'MISSING');
      console.log('  status:', data.status);
    } else {
      console.log('❌ QGT99S NOT FOUND');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAttendanceTypes();
