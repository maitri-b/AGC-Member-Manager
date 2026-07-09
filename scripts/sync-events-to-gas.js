/**
 * Manual sync all events from Firestore to Google Apps Script
 * Run this script to sync existing events to GAS Properties Service
 *
 * Usage:
 *   node scripts/sync-events-to-gas.js
 */

const GAS_URL = 'https://script.google.com/macros/s/AKfycbx5ML4iBZF_6zeFQ94EEhlP2oZr8w8Fq6hSr_3rjHyrPVeQN2Dxvtb1gUAOU3JFstDZBQ/exec';

async function syncAllEvents() {
  try {
    console.log('🔄 Starting sync process...');
    console.log('📍 GAS URL:', GAS_URL);

    // Note: This script calls the Vercel API which requires authentication
    // You should run this via your local dev server or production server
    const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    console.log(`\n⚠️  This script requires authentication.`);
    console.log(`📝 Please use one of these methods instead:\n`);

    console.log('Method 1: Via Browser Console (when logged in as admin)');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`
fetch('/api/admin/sync-events-to-gas', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Sync complete!');
    console.log('Summary:', data.summary);
    console.log('Current mappings:', data.currentMappings);
  })
  .catch(err => console.error('❌ Error:', err));
`);

    console.log('\nMethod 2: Via curl (with session cookie)');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`
curl -X POST "${apiUrl}/api/admin/sync-events-to-gas" \\
  -H "Content-Type: application/json" \\
  -H "Cookie: YOUR_SESSION_COOKIE"
`);

    console.log('\nMethod 3: Check current GAS mappings (GET)');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`
fetch('/api/admin/sync-events-to-gas')
  .then(res => res.json())
  .then(data => {
    console.log('Current GAS mappings:');
    console.log(data.mappings);
    console.log('Total events:', data.count);
  });
`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

syncAllEvents();
