/**
 * ฟังก์ชัน Debug สำหรับตรวจสอบข้อมูลใน Sheet
 */

/**
 * ทดสอบการค้นหา Registration
 * เรียกใช้ใน Apps Script Editor
 */
function testFindRegistration() {
  // ทดสอบกับ Event Rally2026
  const testRegistrationId = 'HXLT9P'; // เปลี่ยนเป็น registration ID ที่ต้องการทดสอบ
  const testEventId = '🎉-งานแรลลี่-10th-anniversary-agents-club-2026';

  Logger.log('=== Testing findRegistration ===');
  Logger.log('Registration ID: "' + testRegistrationId + '" (type: ' + typeof testRegistrationId + ')');
  Logger.log('Event ID: "' + testEventId + '"');

  // Check if event mapping exists
  const sheetName = CONFIG.EVENT_SHEETS[testEventId];
  Logger.log('Sheet Name from mapping: "' + sheetName + '"');

  if (!sheetName) {
    Logger.log('❌ Event ID not found in CONFIG.EVENT_SHEETS');
    Logger.log('Available event IDs:');
    Object.keys(CONFIG.EVENT_SHEETS).forEach(key => {
      Logger.log('  "' + key + '" => "' + CONFIG.EVENT_SHEETS[key] + '"');
    });
    return null;
  }

  // Try to find registration
  const result = findRegistration(testRegistrationId, testEventId);

  if (result) {
    Logger.log('✅ Found registration:');
    Logger.log(JSON.stringify(result, null, 2));
  } else {
    Logger.log('❌ Registration not found');

    // Debug: Check what's in the sheet
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const sheet = ss.getSheetByName(sheetName);
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const normalizedHeaders = headers.map(h => String(h).toLowerCase().trim());
      const regIdCol = normalizedHeaders.indexOf('registration_id');

      Logger.log('Debug: regIdCol = ' + regIdCol);
      Logger.log('Debug: First 5 registration IDs:');
      for (let i = 1; i < Math.min(data.length, 6); i++) {
        const cellValue = data[i][regIdCol];
        Logger.log('  Row ' + (i+1) + ': "' + cellValue + '" (type: ' + typeof cellValue + ', match: ' + (cellValue === testRegistrationId) + ')');
      }
    } catch (e) {
      Logger.log('Debug error: ' + e.toString());
    }
  }

  return result;
}

/**
 * ดูข้อมูล Headers และแถวแรกของ Sheet
 */
function inspectSheet() {
  const sheetName = 'Rally2026';

  try {
    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      Logger.log('❌ Sheet not found: ' + sheetName);
      return;
    }

    const data = sheet.getDataRange().getValues();

    Logger.log('=== Sheet Inspection: ' + sheetName + ' ===');
    Logger.log('Total rows: ' + data.length);

    // Show headers
    Logger.log('\n📋 Headers (Row 1):');
    const headers = data[0];
    headers.forEach((header, index) => {
      Logger.log('  Col ' + (index + 1) + ': "' + header + '" (lowercase: "' + String(header).toLowerCase().trim() + '")');
    });

    // Show first data row
    if (data.length > 1) {
      Logger.log('\n📄 First Data Row (Row 2):');
      data[1].forEach((value, index) => {
        Logger.log('  ' + headers[index] + ': "' + value + '"');
      });
    }

    // Find registration_id column
    const normalizedHeaders = headers.map(h => String(h).toLowerCase().trim());
    const regIdCol = normalizedHeaders.indexOf('registration_id');

    Logger.log('\n🔍 Registration ID column index: ' + regIdCol);

    if (regIdCol >= 0 && data.length > 1) {
      Logger.log('\n📝 All Registration IDs in sheet:');
      for (let i = 1; i < Math.min(data.length, 11); i++) { // Show first 10
        Logger.log('  Row ' + (i + 1) + ': "' + data[i][regIdCol] + '"');
      }
    }

  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
  }
}

/**
 * ทดสอบ URL Parameters
 */
function testDoGet() {
  Logger.log('=== Testing doGet with sample parameters ===');

  const mockEvent = {
    parameter: {
      registrationId: 'HXLT9P', // เปลี่ยนตามที่ต้องการทดสอบ
      eventId: '🎉-งานแรลลี่-10th-anniversary-agents-club-2026',
      lineUserId: 'U1234567890',
      paymentType: 'deposit'
    }
  };

  Logger.log('Parameters:');
  Logger.log(JSON.stringify(mockEvent.parameter, null, 2));

  const result = doGet(mockEvent);
  Logger.log('Result: ' + result);
}
