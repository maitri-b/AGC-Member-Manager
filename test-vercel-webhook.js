require('dotenv').config({ path: '.env.local' });

/**
 * Test Vercel Webhook API
 * Usage: node test-vercel-webhook.js <VERCEL_URL>
 * Example: node test-vercel-webhook.js https://your-app.vercel.app
 */

const VERCEL_URL = process.argv[2];
const GAS_WEBHOOK_SECRET = process.env.GAS_WEBHOOK_SECRET;

if (!VERCEL_URL) {
  console.error('❌ Error: Please provide Vercel URL as argument');
  console.log('Usage: node test-vercel-webhook.js <VERCEL_URL>');
  console.log('Example: node test-vercel-webhook.js https://your-app.vercel.app');
  process.exit(1);
}

if (!GAS_WEBHOOK_SECRET) {
  console.error('❌ Error: GAS_WEBHOOK_SECRET not found in .env.local');
  process.exit(1);
}

async function testHealthCheck() {
  const url = `${VERCEL_URL}/api/webhooks/gas-slip-upload`;

  console.log('\n🔍 Testing Health Check (GET)...');
  console.log(`URL: ${url}`);

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok) {
      console.log('✅ Health check passed');
      console.log('Response:', JSON.stringify(data, null, 2));
      return true;
    } else {
      console.log('❌ Health check failed');
      console.log('Status:', response.status);
      console.log('Response:', JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testSlipUpload() {
  const url = `${VERCEL_URL}/api/webhooks/gas-slip-upload`;

  console.log('\n🔍 Testing Slip Upload (POST)...');
  console.log(`URL: ${url}`);

  const payload = {
    registrationId: 'WYQ8M8',
    eventId: '🎉-งานแรลลี่-10th-anniversary-agents-club-2026',
    paymentType: 'full',
    slipUrl: 'https://drive.google.com/thumbnail?id=TEST123&sz=w1000',
    uploadedAt: new Date().toISOString()
  };

  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('Authorization: Bearer ' + GAS_WEBHOOK_SECRET.substring(0, 20) + '...');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GAS_WEBHOOK_SECRET}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    console.log('\nResponse Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (response.ok && data.success) {
      console.log('\n✅ Slip upload test PASSED');
      console.log('Registration WYQ8M8 should now be updated in Firestore');
      return true;
    } else {
      console.log('\n❌ Slip upload test FAILED');
      if (response.status === 401) {
        console.log('⚠️  Authorization failed - check GAS_WEBHOOK_SECRET');
      } else if (response.status === 404) {
        console.log('⚠️  Registration not found in Firestore');
      }
      return false;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function run() {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║   Vercel Webhook API Test Suite              ║');
  console.log('╚═══════════════════════════════════════════════╝');

  const healthOk = await testHealthCheck();

  if (!healthOk) {
    console.log('\n❌ Health check failed - skipping upload test');
    console.log('\nPossible issues:');
    console.log('  1. Wrong Vercel URL');
    console.log('  2. API endpoint not deployed');
    console.log('  3. Vercel app is down');
    process.exit(1);
  }

  const uploadOk = await testSlipUpload();

  if (uploadOk) {
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   ✅ ALL TESTS PASSED                         ║');
    console.log('╚═══════════════════════════════════════════════╝');
    console.log('\nNext steps:');
    console.log('  1. Update GAS CONFIG.VERCEL_API_URL with:', url);
    console.log('  2. Deploy new GAS version');
    console.log('  3. Test slip upload from frontend');
  } else {
    console.log('\n❌ Tests failed - please check the errors above');
  }
}

run();
