/**
 * ระบบอัพโหลดสลิปการชำระเงิน (Firestore-enabled)
 * สำหรับ Agents Club Member Manager
 *
 * Version: 2.0 (Firestore Integration)
 * Updated: 2026-07-12
 *
 * การทำงาน:
 * 1. อัพโหลดไฟล์สลิปไปยัง Google Drive
 * 2. บันทึก URL ลง Google Sheets (backward compatibility)
 * 3. Callback ไปยัง Vercel API เพื่ออัพเดท Firestore
 */

// ========== Configuration ==========
const CONFIG = {
  SHEET_ID: '1pVx91b0tA6IHIfKTvGq6ywYYzkNe1HPkGh7rSiHlmb0',
  DRIVE_FOLDER_ID: '17PF4Za5QPcxtZFUuHi2FgQOT7yFocu1i',

  // Vercel API Configuration
  VERCEL_API_URL: 'https://agc-member-manager.vercel.app/api/webhooks/gas-slip-upload',
  VERCEL_WEBHOOK_SECRET: '0992680eb489d5003f1c9a65fcaf9fdd94da77f613acacbbee80e46415c176f6',

  // Event ID to Sheet Name mapping
  get EVENT_SHEETS() {
    return getEventMappings();
  }
};

/**
 * ดึง Event Mappings จาก Properties Service
 */
function getEventMappings() {
  try {
    const props = PropertiesService.getScriptProperties();
    const mappingsJson = props.getProperty('EVENT_MAPPINGS');

    if (mappingsJson) {
      return JSON.parse(mappingsJson);
    }

    // Default mappings (fallback)
    return {
      '10yearth-meeting-2026': '10 Yearth Meeting',
      '🎉-งานแรลลี่-10th-anniversary-agents-club-2026': 'Rally2026',
    };
  } catch (error) {
    Logger.log('Error loading event mappings: ' + error.toString());
    return {
      '10yearth-meeting-2026': '10 Yearth Meeting',
      '🎉-งานแรลลี่-10th-anniversary-agents-club-2026': 'Rally2026',
    };
  }
}

/**
 * บันทึก Event Mapping ใหม่
 */
function saveEventMapping(eventId, sheetName) {
  try {
    const props = PropertiesService.getScriptProperties();
    const mappings = getEventMappings();

    mappings[eventId] = sheetName;
    props.setProperty('EVENT_MAPPINGS', JSON.stringify(mappings));

    Logger.log('Saved event mapping: ' + eventId + ' -> ' + sheetName);
    return { success: true };
  } catch (error) {
    Logger.log('Error saving event mapping: ' + error.toString());
    return { success: false, error: error.message };
  }
}

// ========== Main Handlers ==========

/**
 * doGet - แสดงหน้า upload form
 */
function doGet(e) {
  const params = {
    registrationId: e.parameter.registrationId,
    eventId: e.parameter.eventId,
    lineUserId: e.parameter.lineUserId,
    paymentType: e.parameter.paymentType || 'full'
  };

  Logger.log('[DEBUG] Code-Firestore.gs v2.1 - Using Firestore API');
  Logger.log('doGet params: ' + JSON.stringify(params));

  if (!params.registrationId || !params.eventId) {
    return createErrorPage('ข้อมูลไม่ครบถ้วน', 'กรุณาเข้าผ่านระบบลงทะเบียนเท่านั้น');
  }

  // Get registration data from Firestore (via Vercel API)
  Logger.log('[DEBUG] Calling getRegistrationFromFirestore...');
  const registration = getRegistrationFromFirestore(params.registrationId, params.eventId);
  Logger.log('[DEBUG] Registration result: ' + (registration ? 'FOUND' : 'NOT FOUND'));

  if (!registration) {
    return createErrorPage(
      'ไม่พบข้อมูลการลงทะเบียน',
      'รหัสลงทะเบียน: ' + params.registrationId
    );
  }

  // Validate LINE User ID
  if (params.lineUserId && registration.lineUserId &&
      registration.lineUserId !== params.lineUserId) {
    return createErrorPage(
      'ไม่มีสิทธิ์เข้าถึง',
      'รหัสลงทะเบียนนี้ไม่ใช่ของคุณ'
    );
  }

  const template = HtmlService.createTemplateFromFile('UploadForm');
  template.registration = registration;
  template.registrationId = params.registrationId;
  template.eventId = params.eventId;
  template.paymentType = params.paymentType;

  // Prepare payment info for display
  template.totalAmount = Number(registration.totalAmount) || 0;
  template.depositAmount = Number(registration.depositAmount) || 0;
  template.remainingAmount = Number(registration.remainingAmount) || 0;

  // Check payment mode (deposit or full)
  template.hasDepositMode = template.depositAmount > 0;

  return template.evaluate()
    .setTitle('อัพโหลดสลิปการชำระเงิน')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * doPost - รับข้อมูลจาก Vercel เพื่อ sync event mappings
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;

    Logger.log('doPost action: ' + action);

    if (action === 'sync_event') {
      const eventId = postData.eventId;
      const sheetName = postData.sheetName;

      if (!eventId || !sheetName) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: 'Missing eventId or sheetName'
        })).setMimeType(ContentService.MimeType.JSON);
      }

      const result = saveEventMapping(eventId, sheetName);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'get_mappings') {
      const mappings = getEventMappings();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        mappings: mappings
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Unknown action: ' + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * processForm - รับข้อมูลจากฟอร์มและดำเนินการ
 */
function processForm(formObject) {
  try {
    Logger.log('Processing form: ' + JSON.stringify({
      registrationId: formObject.registrationId,
      eventId: formObject.eventId,
      paymentType: formObject.paymentType,
      amount: formObject.amount,
    }));

    const registrationId = formObject.registrationId;
    const eventId = formObject.eventId;
    const paymentType = formObject.paymentType;
    const amount = formObject.amount; // New field from form
    const fileData = formObject.fileData;
    const fileName = formObject.fileName;
    const mimeType = formObject.mimeType;

    if (!fileData) {
      return {
        success: false,
        error: 'ไม่พบข้อมูลไฟล์'
      };
    }

    // 1. Upload to Google Drive
    const blob = Utilities.newBlob(
      Utilities.base64Decode(fileData),
      mimeType,
      fileName
    );

    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const newFileName = registrationId + '_' + paymentType + '_' + new Date().getTime() + '_' + fileName;
    const file = folder.createFile(blob.setName(newFileName));

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const fileUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000';

    Logger.log('File uploaded: ' + fileUrl);

    // 2. ✨ PRIMARY: Callback to Vercel API to update Firestore
    const firestoreUpdateResult = updateFirestore(registrationId, eventId, paymentType, fileUrl, amount);

    if (!firestoreUpdateResult.success) {
      // If Firestore update failed, this is a critical error
      Logger.log('Error: Firestore update failed: ' + firestoreUpdateResult.error);
      return {
        success: false,
        error: 'ไม่สามารถบันทึกข้อมูลได้: ' + (firestoreUpdateResult.error || 'Unknown error')
      };
    }

    // 3. OPTIONAL: Update Google Sheets (backward compatibility only)
    // This is for old registrations that exist in Google Sheets
    const sheetUpdateResult = updateRegistrationSlip(registrationId, eventId, paymentType, fileUrl);

    if (!sheetUpdateResult.success) {
      Logger.log('Info: Registration not found in Google Sheet (OK for new registrations): ' + sheetUpdateResult.error);
      // This is OK - new registrations are in Firestore only
    } else {
      Logger.log('Info: Successfully updated Google Sheet (backward compatibility)');
    }

    return {
      success: true,
      message: 'อัพโหลดสลิปเรียบร้อยแล้ว',
      fileUrl: fileUrl
    };

  } catch (error) {
    Logger.log('Error in processForm: ' + error.toString());
    return {
      success: false,
      error: 'เกิดข้อผิดพลาด: ' + error.message
    };
  }
}

// ========== Helper Functions ==========

/**
 * หาข้อมูลการลงทะเบียนจาก Google Sheet
 */
function findRegistration(registrationId, eventId) {
  try {
    const sheetName = CONFIG.EVENT_SHEETS[eventId];

    if (!sheetName) {
      Logger.log('Unknown eventId: ' + eventId);
      return null;
    }

    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      Logger.log('Sheet not found: ' + sheetName);
      return null;
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const normalizedHeaders = headers.map(h => String(h).toLowerCase().trim());

    const regIdCol = normalizedHeaders.indexOf('registration_id');
    const companyCol = normalizedHeaders.indexOf('company_name');
    const totalAmountCol = normalizedHeaders.indexOf('total_amount');
    const depositAmountCol = normalizedHeaders.indexOf('deposit_amount');
    const remainingAmountCol = normalizedHeaders.indexOf('remaining_amount');
    const lineUserIdCol = normalizedHeaders.indexOf('line_userid');
    const statusCol = normalizedHeaders.indexOf('status');

    if (regIdCol === -1) {
      Logger.log('registration_id column not found');
      return null;
    }

    for (let i = 1; i < data.length; i++) {
      if (data[i][regIdCol] === registrationId) {
        return {
          rowIndex: i + 1,
          registrationId: data[i][regIdCol],
          companyName: companyCol >= 0 ? data[i][companyCol] : '',
          totalAmount: totalAmountCol >= 0 ? (data[i][totalAmountCol] || 0) : 0,
          depositAmount: depositAmountCol >= 0 ? (data[i][depositAmountCol] || 0) : 0,
          remainingAmount: remainingAmountCol >= 0 ? (data[i][remainingAmountCol] || 0) : 0,
          lineUserId: lineUserIdCol >= 0 ? data[i][lineUserIdCol] : '',
          status: statusCol >= 0 ? data[i][statusCol] : '',
        };
      }
    }

    return null;
  } catch (error) {
    Logger.log('Error in findRegistration: ' + error.toString());
    return null;
  }
}

/**
 * อัพเดทข้อมูลสลิปใน Google Sheet (backward compatibility)
 */
function updateRegistrationSlip(registrationId, eventId, paymentType, fileUrl) {
  try {
    const sheetName = CONFIG.EVENT_SHEETS[eventId];

    if (!sheetName) {
      return { success: false, error: 'ไม่พบข้อมูล Event' };
    }

    const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return { success: false, error: 'ไม่พบ Sheet: ' + sheetName };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const normalizedHeaders = headers.map(h => String(h).toLowerCase().trim());

    const regIdCol = normalizedHeaders.indexOf('registration_id');

    let slipUrlCol, paidDateCol, newStatus;

    if (paymentType === 'deposit') {
      slipUrlCol = normalizedHeaders.indexOf('deposit_slip_url');
      paidDateCol = normalizedHeaders.indexOf('deposit_paid_date');
      newStatus = 'รอตรวจสอบมัดจำ';
    } else if (paymentType === 'remaining') {
      slipUrlCol = normalizedHeaders.indexOf('remaining_slip_url');
      paidDateCol = normalizedHeaders.indexOf('remaining_paid_date');
      newStatus = 'รอตรวจสอบยอดคงเหลือ';
    } else {
      slipUrlCol = normalizedHeaders.indexOf('remaining_slip_url');
      paidDateCol = normalizedHeaders.indexOf('remaining_paid_date');
      newStatus = 'รอตรวจสอบ';
    }

    const statusCol = normalizedHeaders.indexOf('payment_status');

    for (let i = 1; i < data.length; i++) {
      if (data[i][regIdCol] === registrationId) {
        const rowNum = i + 1;

        if (slipUrlCol >= 0) {
          sheet.getRange(rowNum, slipUrlCol + 1).setValue(fileUrl);
          Logger.log('Updated slip URL at row ' + rowNum + ', col ' + (slipUrlCol + 1));
        }

        if (paidDateCol >= 0) {
          const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
          sheet.getRange(rowNum, paidDateCol + 1).setValue(today);
          Logger.log('Updated paid date at row ' + rowNum + ', col ' + (paidDateCol + 1));
        }

        if (statusCol >= 0) {
          sheet.getRange(rowNum, statusCol + 1).setValue(newStatus);
          Logger.log('Updated status to: ' + newStatus);
        }

        return { success: true };
      }
    }

    return { success: false, error: 'ไม่พบข้อมูลการลงทะเบียน' };

  } catch (error) {
    Logger.log('Error in updateRegistrationSlip: ' + error.toString());
    return { success: false, error: error.message };
  }
}

/**
 * ✨ ดึงข้อมูล Registration จาก Firestore ผ่าน Vercel API
 */
function getRegistrationFromFirestore(registrationId, eventId) {
  try {
    Logger.log('[Firestore] Getting registration from Firestore...');

    const url = CONFIG.VERCEL_API_URL.replace('/gas-slip-upload', '/gas-get-registration') +
                '?registrationId=' + encodeURIComponent(registrationId) +
                '&eventId=' + encodeURIComponent(eventId);

    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + CONFIG.VERCEL_WEBHOOK_SECRET
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log('[Firestore] Response code: ' + responseCode);

    if (responseCode === 200) {
      const result = JSON.parse(responseText);
      if (result.success && result.registration) {
        Logger.log('[Firestore] Found registration: ' + result.registration.companyName);
        return result.registration;
      } else {
        Logger.log('[Firestore] Registration not found');
        return null;
      }
    } else if (responseCode === 404) {
      Logger.log('[Firestore] Registration not found (404)');
      return null;
    } else {
      Logger.log('[Firestore] HTTP error: ' + responseCode);
      return null;
    }

  } catch (error) {
    Logger.log('[Firestore] Error calling Vercel API: ' + error.toString());
    return null;
  }
}

/**
 * ✨ อัพเดทข้อมูลใน Firestore ผ่าน Vercel API
 */
function updateFirestore(registrationId, eventId, paymentType, fileUrl, amount) {
  try {
    Logger.log('[Firestore] Sending callback to Vercel API...');

    const payload = {
      registrationId: registrationId,
      eventId: eventId,
      paymentType: paymentType,
      slipUrl: fileUrl,
      amount: amount || null, // Send amount if provided
      uploadedAt: new Date().toISOString()
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + CONFIG.VERCEL_WEBHOOK_SECRET
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(CONFIG.VERCEL_API_URL, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log('[Firestore] Response code: ' + responseCode);
    Logger.log('[Firestore] Response body: ' + responseText);

    if (responseCode === 200) {
      const result = JSON.parse(responseText);
      if (result.success) {
        Logger.log('[Firestore] Successfully updated Firestore');
        return { success: true };
      } else {
        Logger.log('[Firestore] API returned error: ' + result.error);
        return { success: false, error: result.error || 'Unknown API error' };
      }
    } else {
      Logger.log('[Firestore] HTTP error: ' + responseCode);
      return { success: false, error: 'HTTP ' + responseCode + ': ' + responseText };
    }

  } catch (error) {
    Logger.log('[Firestore] Error calling Vercel API: ' + error.toString());
    return { success: false, error: error.message };
  }
}

/**
 * สร้างหน้า Error
 */
function createErrorPage(title, message) {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Error</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .error-container {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          text-align: center;
          max-width: 400px;
        }
        h1 {
          color: #d32f2f;
          margin-bottom: 1rem;
        }
        p {
          color: #666;
          margin-bottom: 1.5rem;
        }
        .close-btn {
          background: #2196F3;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="error-container">
        <h1>❌ ${title}</h1>
        <p>${message}</p>
        <button class="close-btn" onclick="window.close()">ปิดหน้าต่าง</button>
      </div>
    </body>
    </html>
  `).setTitle('Error');
}
