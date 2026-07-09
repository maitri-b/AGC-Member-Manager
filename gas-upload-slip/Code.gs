/**
 * ระบบอัพโหลดสลิปการชำระเงิน
 * สำหรับ Agents Club Member Manager
 *
 * เชื่อมต่อกับ Vercel App เพื่อให้สมาชิกอัพโหลดสลิปการชำระเงินได้
 */

// ========== Configuration ==========
const CONFIG = {
  SHEET_ID: '1pVx91b0tA6IHIfKTvGq6ywYYzkNe1HPkGh7rSiHlmb0',
  DRIVE_FOLDER_ID: '17PF4Za5QPcxtZFUuHi2FgQOT7yFocu1i',

  // Event ID to Sheet Name mapping
  // This is now dynamically loaded from Properties Service
  get EVENT_SHEETS() {
    return getEventMappings();
  }
};

/**
 * ดึง Event Mappings จาก Properties Service
 * ถ้ายังไม่มีข้อมูล ให้ใช้ค่า default
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
    // Return default mappings on error
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

    // Add or update mapping
    mappings[eventId] = sheetName;

    // Save back to Properties
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
    paymentType: e.parameter.paymentType || 'deposit' // deposit หรือ remaining
  };

  Logger.log('doGet params: ' + JSON.stringify(params));

  // Validate required parameters
  if (!params.registrationId || !params.eventId) {
    return createErrorPage('ข้อมูลไม่ครบถ้วน', 'กรุณาเข้าผ่านระบบลงทะเบียนเท่านั้น');
  }

  // Find registration in Google Sheet
  const registration = findRegistration(params.registrationId, params.eventId);

  if (!registration) {
    return createErrorPage(
      'ไม่พบข้อมูลการลงทะเบียน',
      'รหัสลงทะเบียน: ' + params.registrationId
    );
  }

  // Verify ownership (security check)
  if (params.lineUserId && registration.lineUserId &&
      registration.lineUserId !== params.lineUserId) {
    return createErrorPage(
      'ไม่มีสิทธิ์เข้าถึง',
      'รหัสลงทะเบียนนี้ไม่ใช่ของคุณ'
    );
  }

  // Create upload form
  const template = HtmlService.createTemplateFromFile('UploadForm');
  template.registration = registration;
  template.registrationId = params.registrationId;
  template.eventId = params.eventId;
  template.paymentType = params.paymentType;

  // Convert amounts to numbers
  const depositAmt = Number(registration.depositAmount) || 0;
  const remainingAmt = Number(registration.remainingAmount) || 0;

  template.amount = params.paymentType === 'deposit' ? depositAmt : remainingAmt;

  return template.evaluate()
    .setTitle('อัพโหลดสลิปการชำระเงิน')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * doPost - รับข้อมูลจาก Vercel เพื่อ sync event mappings
 * หรือการดำเนินการอื่นๆ ที่ต้องการ POST
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;

    Logger.log('doPost action: ' + action);
    Logger.log('doPost data: ' + JSON.stringify(postData));

    // Action: Sync event mapping
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

    // Action: Get all event mappings
    if (action === 'get_mappings') {
      const mappings = getEventMappings();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        mappings: mappings
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Unknown action
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
 * เรียกจาก google.script.run ใน HTML
 */
function processForm(formObject) {
  try {
    Logger.log('Processing form: ' + JSON.stringify(formObject));

    const registrationId = formObject.registrationId;
    const eventId = formObject.eventId;
    const paymentType = formObject.paymentType;
    const fileData = formObject.fileData;
    const fileName = formObject.fileName;
    const mimeType = formObject.mimeType;

    if (!fileData) {
      return {
        success: false,
        error: 'ไม่พบข้อมูลไฟล์'
      };
    }

    // Decode base64 and upload to Drive
    const blob = Utilities.newBlob(
      Utilities.base64Decode(fileData),
      mimeType,
      fileName
    );

    const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    const newFileName = registrationId + '_' + paymentType + '_' + new Date().getTime() + '_' + fileName;
    const file = folder.createFile(blob.setName(newFileName));

    // Get shareable link (files in this folder inherit sharing settings)
    const fileUrl = file.getUrl();

    Logger.log('File uploaded: ' + fileUrl);

    // Update Google Sheet
    const updateResult = updateRegistrationSlip(registrationId, eventId, paymentType, fileUrl);

    if (updateResult.success) {
      return {
        success: true,
        message: 'อัพโหลดสลิปเรียบร้อยแล้ว',
        fileUrl: fileUrl
      };
    } else {
      // Delete uploaded file if sheet update failed
      file.setTrashed(true);
      return {
        success: false,
        error: updateResult.error || 'ไม่สามารถบันทึกข้อมูลได้'
      };
    }

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

    // Find column indexes (normalize headers to lowercase)
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

    // Find registration row
    for (let i = 1; i < data.length; i++) {
      if (data[i][regIdCol] === registrationId) {
        return {
          rowIndex: i + 1, // Sheet row number (1-indexed)
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
 * อัพเดทข้อมูลสลิปใน Google Sheet
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
    const slipUrlCol = paymentType === 'deposit'
      ? normalizedHeaders.indexOf('deposit_slip_url')
      : normalizedHeaders.indexOf('remaining_slip_url');
    const paidDateCol = paymentType === 'deposit'
      ? normalizedHeaders.indexOf('deposit_paid_date')
      : normalizedHeaders.indexOf('remaining_paid_date');
    const statusCol = normalizedHeaders.indexOf('payment_status');

    // Find row
    for (let i = 1; i < data.length; i++) {
      if (data[i][regIdCol] === registrationId) {
        const rowNum = i + 1;

        // Update slip URL
        if (slipUrlCol >= 0) {
          sheet.getRange(rowNum, slipUrlCol + 1).setValue(fileUrl);
          Logger.log('Updated slip URL at row ' + rowNum + ', col ' + (slipUrlCol + 1));
        }

        // Update paid date
        if (paidDateCol >= 0) {
          const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
          sheet.getRange(rowNum, paidDateCol + 1).setValue(today);
          Logger.log('Updated paid date at row ' + rowNum + ', col ' + (paidDateCol + 1));
        }

        // Update status
        if (statusCol >= 0) {
          const newStatus = paymentType === 'deposit'
            ? 'รอตรวจสอบมัดจำ'
            : 'รอตรวจสอบยอดคงเหลือ';
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
 * สร้างหน้า Error
 */
function createErrorPage(title, message) {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: 'Sarabun', -apple-system, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 20px;
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          padding: 40px;
          text-align: center;
          max-width: 400px;
        }
        h1 { color: #e53e3e; margin-bottom: 16px; }
        p { color: #4a5568; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>❌ ${title}</h1>
        <p>${message}</p>
      </div>
    </body>
    </html>
  `).setTitle('Error');
}
