/**
 * ฟังก์ชันสำหรับ Authorize Permissions ทั้งหมด
 * รันฟังก์ชันนี้ครั้งเดียวเพื่อขออนุญาต permissions ทั้งหมด
 */
function authorizeAllPermissions() {
  Logger.log('=== Testing All Permissions ===');

  try {
    // Test Spreadsheet access
    Logger.log('1. Testing Spreadsheet access...');
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName('Rally2026');
    Logger.log('✅ Spreadsheet access OK');

    // Test Drive access - read
    Logger.log('2. Testing Drive folder access...');
    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    Logger.log('✅ Drive folder access OK: ' + folder.getName());

    // Test Drive access - create file
    Logger.log('3. Testing Drive file creation...');
    const testBlob = Utilities.newBlob('test', 'text/plain', 'auth-test.txt');
    const testFile = folder.createFile(testBlob);
    Logger.log('✅ Drive file creation OK: ' + testFile.getId());
    Logger.log('✅ File URL: ' + testFile.getUrl());

    // Clean up test file
    Logger.log('4. Cleaning up test file...');
    testFile.setTrashed(true);
    Logger.log('✅ Test file cleaned up');

    // Test Sheet write access
    Logger.log('5. Testing Sheet write access...');
    const data = sheet.getDataRange().getValues();
    Logger.log('✅ Sheet read OK - ' + data.length + ' rows');

    Logger.log('\n🎉 All permissions authorized successfully!');
    Logger.log('You can now deploy and use the web app.');

    return {
      success: true,
      message: 'All permissions OK'
    };

  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return {
      success: false,
      error: error.message
    };
  }
}
