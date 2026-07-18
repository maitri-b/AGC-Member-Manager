/**
 * Automated Payment Validation Tests
 *
 * Tests the payment validation system using test event:
 * eventId: "กิจกรรมทดสอบการลงทะเบียน-2026"
 *
 * Run with: npm run test:payment-validation
 */

import { adminDb } from '../src/lib/firebase-admin';
import { getPaymentSlipsByRegistration } from '../src/lib/payment-slips';

// Test configuration
const TEST_EVENT_ID = 'กิจกรรมทดสอบการลงทะเบียน-2026';
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m',
};

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const testResults: TestResult[] = [];

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(testName: string) {
  log(`\n▶ ${testName}`, 'blue');
}

function logSuccess(message: string) {
  log(`  ✅ ${message}`, 'green');
}

function logError(message: string) {
  log(`  ❌ ${message}`, 'red');
}

function logInfo(message: string) {
  log(`  ℹ️  ${message}`, 'gray');
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get test registrations for the test event
 */
async function getTestRegistrations(limit: number = 5) {
  const db = adminDb();
  const snapshot = await db
    .collection('eventRegistrations')
    .where('eventId', '==', TEST_EVENT_ID)
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Clean up test payment slips (optional - for test isolation)
 */
async function cleanupTestSlips(registrationId: string) {
  const db = adminDb();
  const slips = await getPaymentSlipsByRegistration(registrationId);

  const batch = db.batch();
  for (const slip of slips) {
    const slipRef = db.collection('paymentSlips').doc(slip.slipId);
    batch.delete(slipRef);
  }

  await batch.commit();
  logInfo(`Cleaned up ${slips.length} slip(s) for ${registrationId}`);
}

/**
 * Test 1: Fetch payment slips API
 */
async function testFetchPaymentSlipsAPI() {
  const testName = 'Test 1: Fetch Payment Slips API';
  logTest(testName);
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations(1);
    if (registrations.length === 0) {
      throw new Error('No test registrations found');
    }

    const registration = registrations[0];
    const registrationId = registration.registrationId;
    logInfo(`Using registration: ${registrationId}`);

    // Test API endpoint
    const response = await fetch(`${BASE_URL}/api/payments/slips?registrationId=${registrationId}`);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error('API response missing success field');
    }

    if (!Array.isArray(data.slips)) {
      throw new Error('API response missing slips array');
    }

    logSuccess(`API returned ${data.slips.length} slip(s)`);
    logSuccess('Fetch Payment Slips API works correctly');

    testResults.push({
      name: testName,
      passed: true,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError(errorMessage);
    testResults.push({
      name: testName,
      passed: false,
      error: errorMessage,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Test 2: Duplicate payment type validation (Full Payment Mode)
 */
async function testDuplicateFullPaymentValidation() {
  const testName = 'Test 2: Duplicate Full Payment Validation';
  logTest(testName);
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations(10);
    const fullModeReg = registrations.find(r => r.paymentMode === 'full');

    if (!fullModeReg) {
      throw new Error('No full payment mode registration found');
    }

    const registrationId = fullModeReg.registrationId;
    logInfo(`Using registration: ${registrationId}`);

    // Clean up first
    await cleanupTestSlips(registrationId);

    // Step 1: Upload first full payment slip
    logInfo('Step 1: Uploading first full payment slip...');
    const mockFile = Buffer.from('test-slip-image').toString('base64');

    const uploadResponse1 = await fetch(`${BASE_URL}/api/payments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        eventId: TEST_EVENT_ID,
        paymentType: 'full',
        amount: fullModeReg.totalAmount || 100,
        fileData: mockFile,
        fileName: 'test-slip-1.jpg',
        mimeType: 'image/jpeg',
      }),
    });

    if (!uploadResponse1.ok) {
      throw new Error(`First upload failed: ${uploadResponse1.status}`);
    }

    logSuccess('First full payment slip uploaded');
    await delay(1000);

    // Step 2: Try to upload duplicate full payment slip
    logInfo('Step 2: Attempting to upload duplicate full payment slip...');
    const uploadResponse2 = await fetch(`${BASE_URL}/api/payments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        eventId: TEST_EVENT_ID,
        paymentType: 'full',
        amount: fullModeReg.totalAmount || 100,
        fileData: mockFile,
        fileName: 'test-slip-2.jpg',
        mimeType: 'image/jpeg',
      }),
    });

    if (uploadResponse2.ok) {
      throw new Error('Duplicate upload should have been blocked but succeeded');
    }

    const errorData = await uploadResponse2.json();
    logSuccess(`Duplicate upload correctly blocked: ${errorData.error}`);

    // Verify error message
    if (!errorData.error.includes('ไม่สามารถอัพโหลดสลิปประเภท')) {
      throw new Error('Error message not in expected format');
    }

    logSuccess('Duplicate Full Payment Validation works correctly');

    // Cleanup
    await cleanupTestSlips(registrationId);

    testResults.push({
      name: testName,
      passed: true,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError(errorMessage);
    testResults.push({
      name: testName,
      passed: false,
      error: errorMessage,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Test 3: Duplicate payment type validation (Deposit Mode)
 */
async function testDuplicateDepositValidation() {
  const testName = 'Test 3: Duplicate Deposit Validation';
  logTest(testName);
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations(10);
    const depositModeReg = registrations.find(r => r.paymentMode === 'deposit');

    if (!depositModeReg) {
      throw new Error('No deposit payment mode registration found');
    }

    const registrationId = depositModeReg.registrationId;
    logInfo(`Using registration: ${registrationId}`);

    // Clean up first
    await cleanupTestSlips(registrationId);

    // Step 1: Upload deposit slip
    logInfo('Step 1: Uploading deposit slip...');
    const mockFile = Buffer.from('test-slip-image').toString('base64');

    const uploadResponse1 = await fetch(`${BASE_URL}/api/payments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        eventId: TEST_EVENT_ID,
        paymentType: 'deposit',
        amount: depositModeReg.depositAmount || 50,
        fileData: mockFile,
        fileName: 'test-deposit-1.jpg',
        mimeType: 'image/jpeg',
      }),
    });

    if (!uploadResponse1.ok) {
      throw new Error(`Deposit upload failed: ${uploadResponse1.status}`);
    }

    logSuccess('Deposit slip uploaded');
    await delay(1000);

    // Step 2: Try to upload duplicate deposit slip
    logInfo('Step 2: Attempting to upload duplicate deposit slip...');
    const uploadResponse2 = await fetch(`${BASE_URL}/api/payments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        eventId: TEST_EVENT_ID,
        paymentType: 'deposit',
        amount: depositModeReg.depositAmount || 50,
        fileData: mockFile,
        fileName: 'test-deposit-2.jpg',
        mimeType: 'image/jpeg',
      }),
    });

    if (uploadResponse2.ok) {
      throw new Error('Duplicate deposit should have been blocked but succeeded');
    }

    logSuccess('Duplicate deposit correctly blocked');

    // Cleanup
    await cleanupTestSlips(registrationId);

    testResults.push({
      name: testName,
      passed: true,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError(errorMessage);
    testResults.push({
      name: testName,
      passed: false,
      error: errorMessage,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Test 4: Additional payment type allows multiple uploads
 */
async function testAdditionalPaymentMultipleUploads() {
  const testName = 'Test 4: Additional Payment Multiple Uploads';
  logTest(testName);
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations(1);
    if (registrations.length === 0) {
      throw new Error('No test registrations found');
    }

    const registration = registrations[0];
    const registrationId = registration.registrationId;
    logInfo(`Using registration: ${registrationId}`);

    // Clean up first
    await cleanupTestSlips(registrationId);

    const mockFile = Buffer.from('test-slip-image').toString('base64');

    // Upload 3 additional payment slips
    for (let i = 1; i <= 3; i++) {
      logInfo(`Step ${i}: Uploading additional payment slip #${i}...`);

      const uploadResponse = await fetch(`${BASE_URL}/api/payments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId,
          eventId: TEST_EVENT_ID,
          paymentType: 'additional',
          amount: 10 * i,
          description: `Additional payment #${i}`,
          fileData: mockFile,
          fileName: `test-additional-${i}.jpg`,
          mimeType: 'image/jpeg',
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error(`Additional payment #${i} upload failed: ${uploadResponse.status}`);
      }

      logSuccess(`Additional payment slip #${i} uploaded`);
      await delay(500);
    }

    // Verify all slips exist
    const slips = await getPaymentSlipsByRegistration(registrationId);
    const additionalSlips = slips.filter(s => s.paymentType === 'additional');

    if (additionalSlips.length !== 3) {
      throw new Error(`Expected 3 additional slips, found ${additionalSlips.length}`);
    }

    logSuccess('All 3 additional payment slips created successfully');
    logSuccess('Additional Payment Multiple Uploads works correctly');

    // Cleanup
    await cleanupTestSlips(registrationId);

    testResults.push({
      name: testName,
      passed: true,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError(errorMessage);
    testResults.push({
      name: testName,
      passed: false,
      error: errorMessage,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Test 5: Active slips counting (approved + pending, excluding rejected)
 */
async function testActiveSlipsCounting() {
  const testName = 'Test 5: Active Slips Counting';
  logTest(testName);
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations(1);
    if (registrations.length === 0) {
      throw new Error('No test registrations found');
    }

    const registration = registrations[0];
    const registrationId = registration.registrationId;
    logInfo(`Using registration: ${registrationId}`);

    // Clean up first
    await cleanupTestSlips(registrationId);

    const db = adminDb();
    const mockFile = Buffer.from('test-slip-image').toString('base64');

    // Create test slips with different statuses
    logInfo('Creating test slips with different statuses...');

    // 1. Approved slip
    const slip1Response = await fetch(`${BASE_URL}/api/payments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        eventId: TEST_EVENT_ID,
        paymentType: 'additional',
        amount: 10,
        description: 'Approved slip',
        fileData: mockFile,
        fileName: 'approved-slip.jpg',
        mimeType: 'image/jpeg',
      }),
    });

    const slip1Data = await slip1Response.json();
    await db.collection('paymentSlips').doc(slip1Data.slip.slipId).update({ status: 'approved' });
    logSuccess('Created approved slip');

    // 2. Pending slip
    const slip2Response = await fetch(`${BASE_URL}/api/payments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        eventId: TEST_EVENT_ID,
        paymentType: 'additional',
        amount: 20,
        description: 'Pending slip',
        fileData: mockFile,
        fileName: 'pending-slip.jpg',
        mimeType: 'image/jpeg',
      }),
    });

    const slip2Data = await slip2Response.json();
    logSuccess('Created pending slip');

    // 3. Rejected slip
    const slip3Response = await fetch(`${BASE_URL}/api/payments/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId,
        eventId: TEST_EVENT_ID,
        paymentType: 'additional',
        amount: 30,
        description: 'Rejected slip',
        fileData: mockFile,
        fileName: 'rejected-slip.jpg',
        mimeType: 'image/jpeg',
      }),
    });

    const slip3Data = await slip3Response.json();
    await db.collection('paymentSlips').doc(slip3Data.slip.slipId).update({ status: 'rejected' });
    logSuccess('Created rejected slip');

    // Fetch and verify counting
    const allSlips = await getPaymentSlipsByRegistration(registrationId);
    const activeSlips = allSlips.filter(slip =>
      (slip.status === 'approved' || slip.status === 'pending') &&
      slip.paymentType !== 'refund'
    );

    logInfo(`Total slips: ${allSlips.length}`);
    logInfo(`Active slips (approved + pending): ${activeSlips.length}`);

    if (activeSlips.length !== 2) {
      throw new Error(`Expected 2 active slips, found ${activeSlips.length}`);
    }

    logSuccess('Active slips correctly counted (approved + pending only)');
    logSuccess('Rejected slips correctly excluded from active count');

    // Cleanup
    await cleanupTestSlips(registrationId);

    testResults.push({
      name: testName,
      passed: true,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logError(errorMessage);
    testResults.push({
      name: testName,
      passed: false,
      error: errorMessage,
      duration: Date.now() - startTime,
    });
  }
}

/**
 * Print test summary
 */
function printTestSummary() {
  log('\n' + '='.repeat(60), 'blue');
  log('TEST SUMMARY', 'blue');
  log('='.repeat(60), 'blue');

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const total = testResults.length;

  log(`\nTotal Tests: ${total}`, 'blue');
  log(`Passed: ${passed}`, 'green');
  if (failed > 0) {
    log(`Failed: ${failed}`, 'red');
  }

  log('\nDetailed Results:', 'blue');
  testResults.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    const color = result.passed ? 'green' : 'red';
    const duration = (result.duration / 1000).toFixed(2);

    log(`${index + 1}. ${icon} ${result.name} (${duration}s)`, color);
    if (result.error) {
      log(`   Error: ${result.error}`, 'red');
    }
  });

  const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);
  log(`\nTotal Duration: ${(totalDuration / 1000).toFixed(2)}s`, 'gray');
  log('='.repeat(60) + '\n', 'blue');

  if (failed > 0) {
    process.exit(1);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n' + '='.repeat(60), 'blue');
  log('PAYMENT VALIDATION AUTOMATED TESTS', 'blue');
  log('='.repeat(60), 'blue');
  log(`Event ID: ${TEST_EVENT_ID}`, 'gray');
  log(`Base URL: ${BASE_URL}`, 'gray');
  log('='.repeat(60) + '\n', 'blue');

  try {
    // Run all tests sequentially
    await testFetchPaymentSlipsAPI();
    await testDuplicateFullPaymentValidation();
    await testDuplicateDepositValidation();
    await testAdditionalPaymentMultipleUploads();
    await testActiveSlipsCounting();

    // Print summary
    printTestSummary();
  } catch (error) {
    logError(`Fatal error during test execution: ${error}`);
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(error => {
    logError(`Unhandled error: ${error}`);
    process.exit(1);
  });
}

export { runTests };
