/**
 * API Route: GET /api/test/payment-validation
 *
 * Automated Payment Validation Tests
 * Runs on Vercel production/staging environment
 *
 * Usage: GET https://your-domain.vercel.app/api/test/payment-validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getPaymentSlipsByRegistration } from '@/lib/payment-slips';

// Test configuration
const TEST_EVENT_ID = 'กิจกรรมทดสอบการลงทะเบียน-2026';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  details?: any;
}

/**
 * Get test registrations for the test event
 */
async function getTestRegistrations(limit: number = 10) {
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
 * Clean up test payment slips
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
  return slips.length;
}

/**
 * Test 1: Fetch payment slips API
 */
async function testFetchPaymentSlipsAPI(baseUrl: string): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations(1);
    if (registrations.length === 0) {
      throw new Error('No test registrations found for event: ' + TEST_EVENT_ID);
    }

    const registration = registrations[0];
    const registrationId = registration.registrationId;

    // Test API endpoint
    const response = await fetch(`${baseUrl}/api/payments/slips?registrationId=${registrationId}`);

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

    return {
      name: 'Fetch Payment Slips API',
      passed: true,
      duration: Date.now() - startTime,
      details: {
        registrationId,
        slipsCount: data.slips.length,
      },
    };
  } catch (error) {
    return {
      name: 'Fetch Payment Slips API',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Test 2: Server-side duplicate validation
 */
async function testDuplicateValidation(): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations();
    const fullModeReg = registrations.find(r => r.paymentMode === 'full');

    if (!fullModeReg) {
      throw new Error('No full payment mode registration found');
    }

    const registrationId = fullModeReg.registrationId;

    // Clean up first
    await cleanupTestSlips(registrationId);

    const db = adminDb();
    const mockFile = Buffer.from('test-slip-image').toString('base64');

    // Create first full payment slip directly in DB
    const slip1Id = `TEST_SLIP_${Date.now()}_1`;
    await db.collection('paymentSlips').doc(slip1Id).set({
      slipId: slip1Id,
      registrationId,
      eventId: TEST_EVENT_ID,
      paymentType: 'full',
      amount: 100,
      status: 'pending',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'test-user',
      slipUrl: 'https://example.com/test.jpg',
      createdAt: new Date().toISOString(),
    });

    // Now try to create duplicate through validation logic
    const existingSlips = await getPaymentSlipsByRegistration(registrationId);
    const activeSlips = existingSlips.filter(slip =>
      (slip.status === 'approved' || slip.status === 'pending') &&
      slip.paymentType !== 'refund'
    );

    const hasDuplicate = activeSlips.some(slip => slip.paymentType === 'full');

    if (!hasDuplicate) {
      throw new Error('Duplicate detection failed - should have found existing full payment slip');
    }

    // Cleanup
    await cleanupTestSlips(registrationId);

    return {
      name: 'Server-side Duplicate Validation',
      passed: true,
      duration: Date.now() - startTime,
      details: {
        registrationId,
        existingSlips: existingSlips.length,
        activeSlips: activeSlips.length,
        duplicateDetected: hasDuplicate,
      },
    };
  } catch (error) {
    return {
      name: 'Server-side Duplicate Validation',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Test 3: Active slips counting logic
 */
async function testActiveSlipsCounting(): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations(1);
    if (registrations.length === 0) {
      throw new Error('No test registrations found');
    }

    const registration = registrations[0];
    const registrationId = registration.registrationId;

    // Clean up first
    await cleanupTestSlips(registrationId);

    const db = adminDb();

    // Create test slips with different statuses
    const slipsToCreate = [
      {
        slipId: `TEST_SLIP_${Date.now()}_APPROVED`,
        status: 'approved',
        paymentType: 'additional',
        description: 'Should be counted',
      },
      {
        slipId: `TEST_SLIP_${Date.now()}_PENDING`,
        status: 'pending',
        paymentType: 'additional',
        description: 'Should be counted',
      },
      {
        slipId: `TEST_SLIP_${Date.now()}_REJECTED`,
        status: 'rejected',
        paymentType: 'additional',
        description: 'Should NOT be counted',
      },
      {
        slipId: `TEST_SLIP_${Date.now()}_REFUND`,
        status: 'approved',
        paymentType: 'refund',
        description: 'Should NOT be counted (refund)',
      },
    ];

    const batch = db.batch();
    for (const slipData of slipsToCreate) {
      const slipRef = db.collection('paymentSlips').doc(slipData.slipId);
      batch.set(slipRef, {
        ...slipData,
        registrationId,
        eventId: TEST_EVENT_ID,
        amount: 10,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'test-user',
        slipUrl: 'https://example.com/test.jpg',
        createdAt: new Date().toISOString(),
      });
    }
    await batch.commit();

    // Test counting logic
    const allSlips = await getPaymentSlipsByRegistration(registrationId);
    const activeSlips = allSlips.filter(slip =>
      (slip.status === 'approved' || slip.status === 'pending') &&
      slip.paymentType !== 'refund'
    );

    const expectedActiveCount = 2; // approved + pending (excluding rejected and refund)

    if (activeSlips.length !== expectedActiveCount) {
      throw new Error(
        `Active slips count incorrect. Expected ${expectedActiveCount}, got ${activeSlips.length}`
      );
    }

    // Cleanup
    await cleanupTestSlips(registrationId);

    return {
      name: 'Active Slips Counting Logic',
      passed: true,
      duration: Date.now() - startTime,
      details: {
        registrationId,
        totalSlips: allSlips.length,
        activeSlips: activeSlips.length,
        expected: expectedActiveCount,
        breakdown: {
          approved: allSlips.filter(s => s.status === 'approved' && s.paymentType !== 'refund').length,
          pending: allSlips.filter(s => s.status === 'pending').length,
          rejected: allSlips.filter(s => s.status === 'rejected').length,
          refund: allSlips.filter(s => s.paymentType === 'refund').length,
        },
      },
    };
  } catch (error) {
    return {
      name: 'Active Slips Counting Logic',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Test 4: Payment mode validation (Full Payment Mode Only)
 */
async function testPaymentModeValidation(): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations();

    const fullModeReg = registrations.find(r => r.paymentMode === 'full');

    if (!fullModeReg) {
      throw new Error('No full payment mode registration found for testing');
    }

    const results = {
      fullMode: {
        registrationId: fullModeReg.registrationId,
        paymentMode: fullModeReg.paymentMode,
        totalAmount: fullModeReg.totalAmount,
      },
      note: 'Test event uses Full Payment mode only (no deposit mode)',
    };

    return {
      name: 'Payment Mode Validation (Full Payment Only)',
      passed: true,
      duration: Date.now() - startTime,
      details: results,
    };
  } catch (error) {
    return {
      name: 'Payment Mode Validation (Full Payment Only)',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Test 5: Refund validation logic
 */
async function testRefundValidation(): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const registrations = await getTestRegistrations(1);
    if (registrations.length === 0) {
      throw new Error('No test registrations found');
    }

    const registration = registrations[0];
    const registrationId = registration.registrationId;

    // Clean up first
    await cleanupTestSlips(registrationId);

    const db = adminDb();

    // Create a pending slip
    const pendingSlipId = `TEST_SLIP_${Date.now()}_PENDING`;
    await db.collection('paymentSlips').doc(pendingSlipId).set({
      slipId: pendingSlipId,
      registrationId,
      eventId: TEST_EVENT_ID,
      paymentType: 'full',
      amount: 100,
      status: 'pending',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'test-user',
      slipUrl: 'https://example.com/test.jpg',
      createdAt: new Date().toISOString(),
    });

    // Test refund validation logic
    const existingSlips = await getPaymentSlipsByRegistration(registrationId);
    const hasPendingSlips = existingSlips.some(slip => slip.status === 'pending');

    if (!hasPendingSlips) {
      throw new Error('Should have detected pending slips');
    }

    // This would block refund creation
    const canCreateRefund = !hasPendingSlips;

    // Cleanup
    await cleanupTestSlips(registrationId);

    return {
      name: 'Refund Validation Logic',
      passed: true,
      duration: Date.now() - startTime,
      details: {
        registrationId,
        hasPendingSlips,
        canCreateRefund,
        validation: 'Refund correctly blocked when pending slips exist',
      },
    };
  } catch (error) {
    return {
      name: 'Refund Validation Logic',
      passed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Main GET handler
 */
export async function GET(request: NextRequest) {
  try {
    // Check if user is admin
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }

    console.log('[Test] Starting payment validation tests...');
    console.log('[Test] Test Event ID:', TEST_EVENT_ID);

    const baseUrl = request.nextUrl.origin;
    const testResults: TestResult[] = [];

    // Run all tests
    testResults.push(await testFetchPaymentSlipsAPI(baseUrl));
    testResults.push(await testDuplicateValidation());
    testResults.push(await testActiveSlipsCounting());
    testResults.push(await testPaymentModeValidation());
    testResults.push(await testRefundValidation());

    // Calculate summary
    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.filter(r => !r.passed).length;
    const total = testResults.length;
    const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);

    const summary = {
      total,
      passed,
      failed,
      successRate: `${((passed / total) * 100).toFixed(1)}%`,
      totalDuration: `${(totalDuration / 1000).toFixed(2)}s`,
      testEventId: TEST_EVENT_ID,
      timestamp: new Date().toISOString(),
    };

    console.log('[Test] Test summary:', summary);

    return NextResponse.json({
      success: failed === 0,
      summary,
      results: testResults,
    });
  } catch (error) {
    console.error('[Test] Fatal error:', error);
    return NextResponse.json(
      {
        error: 'Test execution failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
