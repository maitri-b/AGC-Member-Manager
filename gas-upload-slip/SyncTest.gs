/**
 * ทดสอบระบบ Event Mapping Sync
 */

/**
 * ทดสอบการบันทึก Event Mapping ใหม่
 */
function testSaveEventMapping() {
  Logger.log('=== Testing Save Event Mapping ===');

  // ทดสอบเพิ่ม event ใหม่
  const result = saveEventMapping('test-event-2026', 'TestEvent2026');

  Logger.log('Save result: ' + JSON.stringify(result));

  // ตรวจสอบว่าบันทึกสำเร็จ
  const mappings = getEventMappings();
  Logger.log('Current mappings: ' + JSON.stringify(mappings, null, 2));

  if (mappings['test-event-2026'] === 'TestEvent2026') {
    Logger.log('✅ Test PASSED: Event mapping saved successfully');
  } else {
    Logger.log('❌ Test FAILED: Event mapping not found');
  }
}

/**
 * ทดสอบการโหลด Event Mappings
 */
function testGetEventMappings() {
  Logger.log('=== Testing Get Event Mappings ===');

  const mappings = getEventMappings();
  Logger.log('Event Mappings:');
  Logger.log(JSON.stringify(mappings, null, 2));

  const count = Object.keys(mappings).length;
  Logger.log('Total events: ' + count);
}

/**
 * รีเซ็ต Event Mappings กลับไปค่าเริ่มต้น
 */
function resetEventMappings() {
  Logger.log('=== Resetting Event Mappings ===');

  const props = PropertiesService.getScriptProperties();
  const defaultMappings = {
    '10yearth-meeting-2026': '10 Yearth Meeting',
    '🎉-งานแรลลี่-10th-anniversary-agents-club-2026': 'Rally2026',
  };

  props.setProperty('EVENT_MAPPINGS', JSON.stringify(defaultMappings));
  Logger.log('✅ Reset complete');
  Logger.log('Default mappings restored:');
  Logger.log(JSON.stringify(defaultMappings, null, 2));
}

/**
 * ลบ Event Mapping ทั้งหมด (สำหรับ debug)
 */
function clearAllEventMappings() {
  Logger.log('=== Clearing All Event Mappings ===');

  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('EVENT_MAPPINGS');

  Logger.log('✅ All event mappings cleared');
  Logger.log('Next call to getEventMappings() will return default values');
}

/**
 * ทดสอบ doPost endpoint (จำลองการเรียกจาก Vercel)
 */
function testDoPostSyncEvent() {
  Logger.log('=== Testing doPost Sync Event ===');

  // จำลอง POST request
  const mockRequest = {
    postData: {
      contents: JSON.stringify({
        action: 'sync_event',
        eventId: 'annual-dinner-2026',
        sheetName: 'AnnualDinner2026'
      })
    }
  };

  const response = doPost(mockRequest);
  const responseText = response.getContent();

  Logger.log('Response: ' + responseText);

  const result = JSON.parse(responseText);
  if (result.success) {
    Logger.log('✅ doPost test PASSED');
  } else {
    Logger.log('❌ doPost test FAILED: ' + result.error);
  }

  // ตรวจสอบว่าบันทึกจริง
  const mappings = getEventMappings();
  Logger.log('Updated mappings: ' + JSON.stringify(mappings, null, 2));
}

/**
 * ทดสอบ doPost get_mappings
 */
function testDoPostGetMappings() {
  Logger.log('=== Testing doPost Get Mappings ===');

  const mockRequest = {
    postData: {
      contents: JSON.stringify({
        action: 'get_mappings'
      })
    }
  };

  const response = doPost(mockRequest);
  const responseText = response.getContent();

  Logger.log('Response: ' + responseText);

  const result = JSON.parse(responseText);
  if (result.success) {
    Logger.log('✅ Get mappings test PASSED');
    Logger.log('Mappings: ' + JSON.stringify(result.mappings, null, 2));
  } else {
    Logger.log('❌ Get mappings test FAILED: ' + result.error);
  }
}
