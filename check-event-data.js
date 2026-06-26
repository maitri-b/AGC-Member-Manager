const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./agents-club-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkEventData() {
  try {
    console.log('Fetching events from Firestore...\n');

    const eventsSnapshot = await db.collection('events').get();

    if (eventsSnapshot.empty) {
      console.log('No events found in Firestore.');
      return;
    }

    console.log(`Found ${eventsSnapshot.size} event(s)\n`);

    eventsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log('─'.repeat(80));
      console.log(`Event ID: ${doc.id}`);
      console.log(`Event Name: ${data.eventName || 'N/A'}`);
      console.log(`Event Name (EN): ${data.eventNameEN || 'N/A'}`);
      console.log(`\nAttendee Type Pricing Configuration:`);
      console.log(`  useAttendeeTypePricing: ${data.useAttendeeTypePricing}`);
      console.log(`  attendeeTypes: ${data.attendeeTypes ? JSON.stringify(data.attendeeTypes, null, 2) : 'NOT SET'}`);
      console.log(`\nRoom Allocation Configuration:`);
      console.log(`  roomTypes: ${data.roomTypes ? JSON.stringify(data.roomTypes, null, 2) : 'NOT SET'}`);
      console.log(`\nRegistration Open: ${data.registrationOpen}`);
      console.log(`Published: ${data.isPublished}`);
      console.log('─'.repeat(80));
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error checking event data:', error);
    process.exit(1);
  }
}

checkEventData();
