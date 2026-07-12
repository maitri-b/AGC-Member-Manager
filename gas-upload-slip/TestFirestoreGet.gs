/**
 * Test Script - ทดสอบการดึงข้อมูลจาก Firestore
 * ให้รันฟังก์ชัน testGetRegistration() ใน GAS Editor
 */

function testGetRegistration() {
  const registrationId = 'RFR65M';
  const eventId = '🎉-งานแรลลี่-10th-anniversary-agents-club-2026';

  Logger.log('=== Testing getRegistrationFromFirestore ===');
  Logger.log('Registration ID: ' + registrationId);
  Logger.log('Event ID: ' + eventId);

  const registration = getRegistrationFromFirestore(registrationId, eventId);

  if (registration) {
    Logger.log('✅ SUCCESS - Found registration:');
    Logger.log('  Company: ' + registration.companyName);
    Logger.log('  Total Amount: ' + registration.totalAmount);
    Logger.log('  Remaining Amount: ' + registration.remainingAmount);
    Logger.log('  Status: ' + registration.status);
    Logger.log('  LINE User ID: ' + registration.lineUserId);
  } else {
    Logger.log('❌ FAILED - Registration not found');
    Logger.log('Check the logs above for error details');
  }

  Logger.log('=== Test Complete ===');
}

function testGetRegistrationUrl() {
  const registrationId = 'RFR65M';
  const eventId = '🎉-งานแรลลี่-10th-anniversary-agents-club-2026';

  const url = CONFIG.VERCEL_API_URL.replace('/gas-slip-upload', '/gas-get-registration') +
              '?registrationId=' + encodeURIComponent(registrationId) +
              '&eventId=' + encodeURIComponent(eventId);

  Logger.log('Testing URL:');
  Logger.log(url);

  Logger.log('\nTesting with Authorization header:');
  Logger.log('Bearer ' + CONFIG.VERCEL_WEBHOOK_SECRET.substring(0, 20) + '...');
}
