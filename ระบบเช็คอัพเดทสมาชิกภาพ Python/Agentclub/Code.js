/**
 * Agents Club Member Management System
 * Backend Functions - Google Apps Script
 * Version: 1.1 - Added cleanDataForWeb per CONSTITUTION.md Law 1
 */

// ==================== CONFIG ====================
const SPREADSHEET_ID = '1pVx91b0tA6IHIfKTvGq6ywYYzkNe1HPkGh7rSiHlmb0';
const SHEET_MEMBERS = 'AGC_Membership';
const SHEET_USERS = 'Users';
const SHEET_CRM = 'CRM_ContactHistory';
const TOKEN_EXPIRY_HOURS = 24;

// ==================== UTILITY FUNCTIONS ====================
/**
 * Clean data for web return (Law 1: Date Serialization Rule)
 * - แปลง Date objects → ISO string
 * - แปลง undefined → null
 * - แปลง NaN/Infinity → 0
 * - ข้าม functions
 */
function cleanDataForWeb(data) {
  if (data === null || data === undefined) {
    return null;
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (typeof data === 'number') {
    if (isNaN(data) || !isFinite(data)) {
      return 0;
    }
    return data;
  }

  if (typeof data === 'string' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => cleanDataForWeb(item));
  }

  if (typeof data === 'object') {
    const cleaned = {};
    for (const key in data) {
      if (data.hasOwnProperty(key) && typeof data[key] !== 'function') {
        cleaned[key] = cleanDataForWeb(data[key]);
      }
    }
    return cleaned;
  }

  return data;
}

/**
 * Convert value to string safely
 */
function safeString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Format Thai date
    return formatThaiDate(value);
  }
  return String(value);
}

/**
 * Format date to Thai format
 */
function formatThaiDate(date) {
  if (!date || !(date instanceof Date)) return '';
  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543; // Convert to Buddhist year
  return `${day} ${month} ${year}`;
}

// ==================== WEB APP ====================
/**
 * doGet - Single Page Application Entry Point
 * Always returns Index.html which contains both Login and Dashboard sections
 * Section visibility is controlled by JavaScript based on session state
 */
function doGet(e) {
  Logger.log('=== doGet START (SPA Mode) ===');

  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Agents Club - Member Management')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==================== AUTHENTICATION ====================
function login(email, password) {
  Logger.log('=== login START ===');
  Logger.log('Email: ' + email);

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_USERS);

    if (!sheet) {
      Logger.log('❌ Sheet "Users" not found');
      return { success: false, message: 'ไม่พบ Sheet Users ในระบบ' };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    Logger.log('Headers: ' + JSON.stringify(headers));

    const emailIdx = headers.indexOf('Email');
    const passwordIdx = headers.indexOf('Password');
    const userIdIdx = headers.indexOf('UserID');
    const nameIdx = headers.indexOf('Name');
    const isActiveIdx = headers.indexOf('IsActive');

    Logger.log('Column indexes - Email:' + emailIdx + ', Password:' + passwordIdx + ', UserID:' + userIdIdx);

    if (emailIdx === -1 || passwordIdx === -1) {
      Logger.log('❌ Required columns not found');
      return { success: false, message: 'โครงสร้าง Sheet Users ไม่ถูกต้อง' };
    }

    for (let i = 1; i < data.length; i++) {
      const rowEmail = safeString(data[i][emailIdx]).trim();
      const rowPassword = safeString(data[i][passwordIdx]).trim();

      if (rowEmail === email.trim() && rowPassword === password) {
        const isActive = data[i][isActiveIdx];
        Logger.log('Found user at row ' + (i+1) + ', IsActive: ' + isActive);

        if (isActive === true || isActive === 'TRUE' || isActive === 1) {
          const userId = data[i][userIdIdx];
          const userName = data[i][nameIdx];
          const token = generateToken(userId);

          // Update last login
          const lastLoginDateIdx = headers.indexOf('LastLoginDate');
          if (lastLoginDateIdx !== -1) {
            sheet.getRange(i + 1, lastLoginDateIdx + 1).setValue(new Date());
          }

          Logger.log('✅ Login successful for: ' + userName);
          return cleanDataForWeb({
            success: true,
            token: token,
            userId: userId,
            userName: userName,
            message: 'เข้าสู่ระบบสำเร็จ'
          });
        } else {
          Logger.log('❌ Account inactive');
          return { success: false, message: 'บัญชีถูกระงับการใช้งาน' };
        }
      }
    }

    Logger.log('❌ Invalid credentials');
    return { success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + error.toString() };
  }
}

function generateToken(userId) {
  const timestamp = new Date().getTime();
  const randomStr = Math.random().toString(36).substring(2, 15);
  const token = Utilities.base64Encode(userId + '|' + timestamp + '|' + randomStr);

  const cache = CacheService.getScriptCache();
  cache.put('token_' + token, JSON.stringify({
    userId: userId,
    createdAt: timestamp,
    expiresAt: timestamp + (TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)
  }), TOKEN_EXPIRY_HOURS * 60 * 60);

  Logger.log('✅ Token generated for userId: ' + userId);
  return token;
}

function verifyToken(token) {
  try {
    if (!token) return false;

    const cache = CacheService.getScriptCache();
    const tokenData = cache.get('token_' + token);

    if (!tokenData) {
      Logger.log('❌ Token not found in cache');
      return false;
    }

    const data = JSON.parse(tokenData);
    const now = new Date().getTime();
    const isValid = now < data.expiresAt;

    Logger.log('Token verification: ' + (isValid ? '✅ Valid' : '❌ Expired'));
    return isValid;
  } catch (error) {
    Logger.log('❌ Token verification error: ' + error.toString());
    return false;
  }
}

function getUserFromToken(token) {
  try {
    const cache = CacheService.getScriptCache();
    const tokenData = cache.get('token_' + token);
    if (!tokenData) return null;

    const data = JSON.parse(tokenData);
    return data.userId;
  } catch (error) {
    return null;
  }
}

function logout(token) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('token_' + token);
    Logger.log('✅ Logout successful');
    return { success: true };
  } catch (error) {
    return { success: false, message: error.toString() };
  }
}

// ==================== MEMBER CRUD ====================
function getMembers(token, filters) {
  Logger.log('=== getMembers START ===');

  // Ensure filters is an object
  filters = filters || {};

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_MEMBERS);

    if (!sheet) {
      Logger.log('❌ Sheet not found: ' + SHEET_MEMBERS);
      return { success: false, message: 'ไม่พบ Sheet ' + SHEET_MEMBERS };
    }

    const data = sheet.getDataRange().getValues();
    Logger.log('Total rows: ' + data.length);

    const colMap = {
      memberId: 0, companyEn: 1, name: 2, nickname: 3, lineId: 4,
      lineName: 5, phone: 6, mobile: 7, licenseNo: 8, companyReg: 9,
      status: 10, expDate1: 11, expDate2: 12, lineGroup: 13,
      companyQ: 16, statusR: 17, expDateS: 18, expDateT: 19, lineGroupU: 20,
      joinDate: 21, joinRecordedBy: 22, leaveDate: 23, leaveRecordedBy: 24,
      lineUserID: 25  // Z - LINE_UserID
    };

    let members = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[colMap.memberId] && !row[colMap.name]) continue;

      // Convert all values to safe strings, handle Date objects
      // Get lineGroupU from column U (index 20) and normalize the display
      let lineGroupU = safeString(row[colMap.lineGroupU]);
      if (lineGroupU.includes('ยกเลิกข้อมูล') || lineGroupU.includes('ลงทะเบียนใหม่แล้ว')) {
        lineGroupU = 'ยกเลิกแล้ว';
      }

      // Get company name - use companyQ unless it's "ไม่พบข้อมูล", then fallback to companyEn
      const companyQ = safeString(row[colMap.companyQ]);
      const companyEn = safeString(row[colMap.companyEn]);
      const companyReg = safeString(row[colMap.companyReg]);
      let displayCompany = companyQ;
      if (!companyQ || companyQ === 'ไม่พบข้อมูล') {
        displayCompany = companyEn || companyReg;
      }

      const member = {
        rowIndex: i + 1,
        memberId: safeString(row[colMap.memberId]),
        companyEn: companyEn,
        name: safeString(row[colMap.name]),
        nickname: safeString(row[colMap.nickname]),
        lineId: safeString(row[colMap.lineId]),
        lineName: safeString(row[colMap.lineName]),
        phone: safeString(row[colMap.phone]),
        mobile: safeString(row[colMap.mobile]),
        licenseNo: safeString(row[colMap.licenseNo]),
        companyReg: displayCompany,
        status: safeString(row[colMap.statusR]) || safeString(row[colMap.status]),
        expDate: safeString(row[colMap.expDateT]) || safeString(row[colMap.expDateS]) || safeString(row[colMap.expDate1]),
        lineGroupStatus: lineGroupU,  // Use column U (index 20) only
        companyQ: safeString(row[colMap.companyQ]),
        statusR: safeString(row[colMap.statusR]),
        expDateT: safeString(row[colMap.expDateT]),
        lineGroupU: lineGroupU,  // Store the normalized value
        joinDate: safeString(row[colMap.joinDate]),         // V - วันที่เข้ากลุ่ม
        joinRecordedBy: safeString(row[colMap.joinRecordedBy]),  // W - ผู้บันทึกเข้า
        leaveDate: safeString(row[colMap.leaveDate]),       // X - วันที่ออกจากกลุ่ม
        leaveRecordedBy: safeString(row[colMap.leaveRecordedBy]),  // Y - ผู้บันทึกออก
        lineUserID: safeString(row[colMap.lineUserID])      // Z - LINE_UserID
      };

      members.push(member);
    }

    Logger.log('Members found: ' + members.length);

    // Apply filters
    if (filters) {
      Logger.log('Filters received: ' + JSON.stringify(filters));

      // Default: exclude members with "ออกจากกลุ่มแล้ว" status unless showLeftMembers is true
      // Use exact match to avoid excluding "รอนำชื่อออกจากกลุ่ม"
      if (!filters.showLeftMembers) {
        Logger.log('Applying default filter: excluding left members');
        members = members.filter(m => {
          const lineStatus = m.lineGroupU || m.lineGroupStatus || '';
          return lineStatus !== 'ออกจากกลุ่มแล้ว';
        });
        Logger.log('After excluding left members: ' + members.length);
      }

      if (filters.search && filters.search.trim() !== '') {
        const searchLower = filters.search.toLowerCase().trim();
        Logger.log('Applying search filter: ' + searchLower);
        members = members.filter(m =>
          (m.name && m.name.toLowerCase().includes(searchLower)) ||
          (m.companyReg && m.companyReg.toLowerCase().includes(searchLower)) ||
          (m.companyEn && m.companyEn.toLowerCase().includes(searchLower)) ||
          (m.licenseNo && m.licenseNo.toLowerCase().includes(searchLower)) ||
          (m.nickname && m.nickname.toLowerCase().includes(searchLower))
        );
        Logger.log('After search filter: ' + members.length);
      }

      if (filters.statusNotNormal === true) {
        Logger.log('Applying status filter: NOT normal');
        members = members.filter(m => {
          const status = m.statusR || m.status || '';
          return status !== '' && status !== 'ปกติ';
        });
        Logger.log('After status filter: ' + members.length);
      }

      if (filters.expiryMonths && filters.expiryMonths !== '' && filters.expiryMonths !== '0') {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today

        if (filters.expiryMonths === 'expired') {
          // Filter: Already expired
          Logger.log('Applying expiry filter: EXPIRED');

          members = members.filter(m => {
            if (!m.expDate || m.expDate === '' || m.expDate === '-') return false;

            const expDate = parseThaiDate(m.expDate);
            if (!expDate) {
              Logger.log('Could not parse date: ' + m.expDate);
              return false;
            }

            // Include if expiration date is before today
            return expDate < now;
          });
        } else if (filters.expiryMonths === '45') {
          // Filter: Within 45 days
          Logger.log('Applying expiry filter: within 45 days');

          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 45);
          futureDate.setHours(23, 59, 59, 999); // End of the future date

          Logger.log('Date range: ' + now.toISOString() + ' to ' + futureDate.toISOString());

          members = members.filter(m => {
            if (!m.expDate || m.expDate === '' || m.expDate === '-') return false;

            const expDate = parseThaiDate(m.expDate);
            if (!expDate) {
              Logger.log('Could not parse date: ' + m.expDate);
              return false;
            }

            // Include if expiration date is between now and futureDate (within 45 days)
            const isInRange = expDate >= now && expDate <= futureDate;
            return isInRange;
          });
        } else {
          // Filter: Within X months
          const months = parseInt(filters.expiryMonths);
          Logger.log('Applying expiry filter: within ' + months + ' months');

          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + months);
          futureDate.setHours(23, 59, 59, 999); // End of the future date

          Logger.log('Date range: ' + now.toISOString() + ' to ' + futureDate.toISOString());

          members = members.filter(m => {
            if (!m.expDate || m.expDate === '' || m.expDate === '-') return false;

            const expDate = parseThaiDate(m.expDate);
            if (!expDate) {
              Logger.log('Could not parse date: ' + m.expDate);
              return false;
            }

            // Include if expiration date is between now and futureDate (within X months)
            const isInRange = expDate >= now && expDate <= futureDate;
            return isInRange;
          });
        }
        Logger.log('After expiry filter: ' + members.length);
      }

      // Filter by LINE group status - use exact match
      if (filters.lineStatus && filters.lineStatus.trim() !== '') {
        Logger.log('Applying LINE status filter: ' + filters.lineStatus);
        members = members.filter(m => {
          const lineStatus = m.lineGroupU || m.lineGroupStatus || '';
          // Use exact match for LINE status
          return lineStatus === filters.lineStatus;
        });
        Logger.log('After LINE status filter: ' + members.length);
      }

      // Filter by verification status (LINE_UserID)
      if (filters.verification && filters.verification.trim() !== '') {
        Logger.log('Applying verification filter: ' + filters.verification);
        members = members.filter(m => {
          const lineUserID = m.lineUserID || '';
          if (filters.verification === 'verified') {
            // Has LINE_UserID = verified
            return lineUserID !== '';
          } else if (filters.verification === 'not_verified') {
            // No LINE_UserID = not verified
            return lineUserID === '';
          }
          return true;
        });
        Logger.log('After verification filter: ' + members.length);
      }

      Logger.log('Final count after all filters: ' + members.length);
    }

    // Clean data before return (Law 1)
    return cleanDataForWeb({ success: true, data: members });
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

function parseThaiDate(dateStr) {
  if (!dateStr) return null;

  // If already a Date object, return as is
  if (dateStr instanceof Date) return dateStr;

  const str = String(dateStr).trim();

  // Try Thai month format first: "1 มกราคม 2568"
  const thaiMonths = {
    'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3,
    'พฤษภาคม': 4, 'มิถุนายน': 5, 'กรกฎาคม': 6, 'สิงหาคม': 7,
    'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11
  };

  const thaiMatch = str.match(/(\d+)\s+(\S+)\s+(\d+)/);
  if (thaiMatch) {
    const day = parseInt(thaiMatch[1]);
    const month = thaiMonths[thaiMatch[2]];
    let year = parseInt(thaiMatch[3]);
    if (year > 2500) year -= 543; // Convert Buddhist year to CE

    if (month !== undefined) {
      return new Date(year, month, day);
    }
  }

  // Try ISO format: "2025-01-15" or "2025-01-15T00:00:00.000Z"
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // Try DD/MM/YYYY format: "15/01/2025"
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    let year = parseInt(slashMatch[3]);
    if (year > 2500) year -= 543;
    return new Date(year, parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
  }

  // Try standard JavaScript date string parsing as fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function getMember(token, rowIndex) {
  Logger.log('=== getMember START === rowIndex: ' + rowIndex);

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_MEMBERS);
    const row = sheet.getRange(rowIndex, 1, 1, 25).getValues()[0];  // Extended to column Y (25)

    // Get lineGroupU from column U (index 20) and normalize the display
    let lineGroupU = safeString(row[20]);
    if (lineGroupU.includes('ยกเลิกข้อมูล') || lineGroupU.includes('ลงทะเบียนใหม่แล้ว')) {
      lineGroupU = 'ยกเลิกแล้ว';
    }

    const memberData = {
      rowIndex: rowIndex,
      memberId: safeString(row[0]),
      companyEn: safeString(row[1]),
      name: safeString(row[2]),
      nickname: safeString(row[3]),
      lineId: safeString(row[4]),
      lineName: safeString(row[5]),
      phone: safeString(row[6]),
      mobile: safeString(row[7]),
      licenseNo: safeString(row[8]),
      companyReg: safeString(row[9]),
      status: safeString(row[10]),
      expDate1: safeString(row[11]),
      expDate2: safeString(row[12]),
      lineGroup: safeString(row[13]),
      companyQ: safeString(row[16]),
      statusR: safeString(row[17]),
      expDateS: safeString(row[18]),
      expDateT: safeString(row[19]),
      lineGroupU: lineGroupU,  // Use normalized value from column U
      joinDate: safeString(row[21]),    // V - วันที่เข้ากลุ่ม
      joinRecordedBy: safeString(row[22]),  // W - ผู้บันทึกเข้า
      leaveDate: safeString(row[23]),   // X - วันที่ออกจากกลุ่ม
      leaveRecordedBy: safeString(row[24])  // Y - ผู้บันทึกออก
    };

    Logger.log('✅ Member found: ' + memberData.name);
    return cleanDataForWeb({ success: true, data: memberData });
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

function updateMember(token, rowIndex, memberData) {
  Logger.log('=== updateMember START === rowIndex: ' + rowIndex);

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_MEMBERS);

    // Get current lineGroupU status before update
    const currentLineGroupU = safeString(sheet.getRange(rowIndex, 21).getValue());
    const newLineGroupU = memberData.lineGroupU;

    if (memberData.companyEn !== undefined) sheet.getRange(rowIndex, 2).setValue(memberData.companyEn);
    if (memberData.name !== undefined) sheet.getRange(rowIndex, 3).setValue(memberData.name);
    if (memberData.nickname !== undefined) sheet.getRange(rowIndex, 4).setValue(memberData.nickname);
    if (memberData.lineId !== undefined) sheet.getRange(rowIndex, 5).setValue(memberData.lineId);
    if (memberData.lineName !== undefined) sheet.getRange(rowIndex, 6).setValue(memberData.lineName);
    if (memberData.phone !== undefined) sheet.getRange(rowIndex, 7).setValue(memberData.phone);
    if (memberData.mobile !== undefined) sheet.getRange(rowIndex, 8).setValue(memberData.mobile);
    if (memberData.licenseNo !== undefined) sheet.getRange(rowIndex, 9).setValue(memberData.licenseNo);
    if (memberData.companyReg !== undefined) sheet.getRange(rowIndex, 10).setValue(memberData.companyReg);
    if (memberData.lineGroup !== undefined) sheet.getRange(rowIndex, 14).setValue(memberData.lineGroup);
    if (memberData.lineGroupU !== undefined) sheet.getRange(rowIndex, 21).setValue(memberData.lineGroupU);

    // Check if lineGroupU status changed and record join/leave date
    if (newLineGroupU !== undefined && newLineGroupU !== currentLineGroupU) {
      // Get user nickname from token
      const userNickname = getUserNicknameFromToken(token, ss);
      const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');

      // Status changed to "อยู่ในกลุ่ม" or "ปกติ" - record join date (V=22, W=23)
      if (newLineGroupU === 'อยู่ในกลุ่ม' || newLineGroupU === 'ปกติ') {
        sheet.getRange(rowIndex, 22).setValue(today);  // V - วันที่เข้ากลุ่ม
        sheet.getRange(rowIndex, 23).setValue(userNickname);  // W - ผู้บันทึกเข้า
        Logger.log('📅 Recorded join date: ' + today + ' by ' + userNickname);
      }

      // Status changed to "ออกจากกลุ่มแล้ว" - record leave date (X=24, Y=25)
      if (newLineGroupU === 'ออกจากกลุ่มแล้ว') {
        sheet.getRange(rowIndex, 24).setValue(today);  // X - วันที่ออกจากกลุ่ม
        sheet.getRange(rowIndex, 25).setValue(userNickname);  // Y - ผู้บันทึกออก
        Logger.log('📅 Recorded leave date: ' + today + ' by ' + userNickname);
      }
    }

    Logger.log('✅ Member updated');
    return { success: true, message: 'อัพเดทข้อมูลสำเร็จ' };
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

// Helper function to get user nickname from token
function getUserNicknameFromToken(token, ss) {
  try {
    const userId = getUserFromToken(token);
    const usersSheet = ss.getSheetByName(SHEET_USERS);
    const usersData = usersSheet.getDataRange().getValues();
    const usersHeaders = usersData[0];
    const userIdIdx = usersHeaders.indexOf('UserID');
    const nicknameIdx = usersHeaders.indexOf('Nickname');

    for (let i = 1; i < usersData.length; i++) {
      if (safeString(usersData[i][userIdIdx]) === safeString(userId)) {
        return safeString(usersData[i][nicknameIdx]);
      }
    }
    return 'Unknown';
  } catch (e) {
    Logger.log('Error getting user nickname: ' + e.toString());
    return 'Unknown';
  }
}

function deleteMember(token, rowIndex) {
  Logger.log('=== deleteMember START === rowIndex: ' + rowIndex);

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_MEMBERS);
    sheet.deleteRow(rowIndex);

    Logger.log('✅ Member deleted');
    return { success: true, message: 'ลบข้อมูลสำเร็จ' };
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

function addMember(token, memberData) {
  Logger.log('=== addMember START ===');

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_MEMBERS);

    // Generate new MemberID - find max existing ID and add 1
    const data = sheet.getDataRange().getValues();
    let maxId = 0;
    for (let i = 1; i < data.length; i++) {
      const id = parseInt(data[i][0]) || 0;
      if (id > maxId) maxId = id;
    }
    const newMemberId = maxId + 1;

    sheet.appendRow([
      newMemberId, memberData.companyEn || '', memberData.name || '',
      memberData.nickname || '', memberData.lineId || '', memberData.lineName || '',
      memberData.phone || '', memberData.mobile || '', memberData.licenseNo || '',
      memberData.companyReg || '', memberData.status || '', memberData.expDate1 || '',
      memberData.expDate2 || '', memberData.lineGroup || ''
    ]);

    Logger.log('✅ Member added: ' + memberData.name + ' with MemberID: ' + newMemberId);
    return { success: true, message: 'เพิ่มสมาชิกสำเร็จ (MemberID: ' + newMemberId + ')' };
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

// ==================== NOTIFICATION MESSAGE ====================
function generateNotificationMessage(token, rowIndex) {
  Logger.log('=== generateNotificationMessage START === rowIndex: ' + rowIndex);

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const memberResult = getMember(token, rowIndex);
    if (!memberResult.success) return memberResult;

    const m = memberResult.data;
    const name = m.name || '';
    const company = m.companyQ || m.companyReg || '';
    const licenseNo = m.licenseNo || '';
    const status = m.statusR || m.status || '';
    const expDate = m.expDateT || m.expDateS || m.expDate1 || '';

    // Get current user's name for signature
    const userId = getUserFromToken(token);
    const userName = getUserNameById(userId) || 'นายทะเบียน';

    // Build expiry info line
    let expiredInfo = '';
    if (expDate) {
      expiredInfo = ` (หมดอายุ ${expDate})`;
    }

    const message = `สวัสดีครับ คุณ${name}
${company}

ทางทีมทะเบียนชมรม Agents Club ตรวจพบว่า
ใบอนุญาตธุรกิจนำเที่ยว เลขที่ ${licenseNo}
มีสถานะ ${status}${expiredInfo}

หากคุณได้ต่ออายุใบอนุญาตแล้ว หรือมีข้อมูลที่อัพเดท
รบกวนส่งสำเนาใบอนุญาตใหม่มาทาง LINE นี้ด้วยนะครับ

เนื่องจากนโยบายของชมรม อนุญาตให้เฉพาะสมาชิกที่มีใบอนุญาตที่ยังไม่หมดอายุอยู่ในกลุ่ม
หากไม่ได้รับการติดต่อกลับ ทางทีมทะเบียนจะขอนำชื่อออกจาก LINE กลุ่มไว้ก่อนนะครับ

ถ้าทีมทะเบียนได้รับข้อมูลอัพเดทและตรวจสอบเรียบร้อยแล้ว
ทีมงานจะนำกลับเข้ากลุ่มให้ทันทีครับ

ขอบคุณครับ
${userName}
ทีมทะเบียนชมรม Agents Club`;

    Logger.log('✅ Notification message generated by: ' + userName);
    return { success: true, message: message };
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

// ==================== STATISTICS ====================
function getDashboardStats(token) {
  Logger.log('=== getDashboardStats START ===');

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const membersResult = getMembers(token, {});
    if (!membersResult.success) return membersResult;

    const members = membersResult.data;
    const total = members.length;
    const normal = members.filter(m => m.statusR === 'ปกติ' || (!m.statusR && m.status === 'ปกติ')).length;
    const abnormal = members.filter(m => m.statusR && m.statusR !== 'ปกติ').length;

    const now = new Date();
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);

    const expiringSoon = members.filter(m => {
      if (!m.expDate) return false;
      const expDate = parseThaiDate(m.expDate);
      return expDate && expDate > now && expDate <= threeMonths;
    }).length;

    Logger.log('✅ Stats - Total:' + total + ', Normal:' + normal + ', Abnormal:' + abnormal);
    return cleanDataForWeb({
      success: true,
      data: { total, normal, abnormal, expiringSoon }
    });
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

// ==================== GET USER NAME BY ID ====================
/**
 * Get user's full name (Column B - Name) by userId
 * Used for notification message signature
 */
function getUserNameById(userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_USERS);

    if (!sheet) return null;

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const userIdIdx = headers.indexOf('UserID');
    const nameIdx = headers.indexOf('Name');

    for (let i = 1; i < data.length; i++) {
      if (safeString(data[i][userIdIdx]) === safeString(userId)) {
        return safeString(data[i][nameIdx]);
      }
    }

    return null;
  } catch (error) {
    Logger.log('❌ getUserNameById Error: ' + error.toString());
    return null;
  }
}

// ==================== GET USERS FOR DROPDOWN ====================
/**
 * Get all active users for dropdown selection
 * Returns: nickname (Column C) for display
 */
function getUsers(token) {
  Logger.log('=== getUsers START ===');

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_USERS);

    if (!sheet) {
      return { success: false, message: 'ไม่พบ Sheet Users' };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    // Column indexes
    const userIdIdx = headers.indexOf('UserID');
    const nicknameIdx = headers.indexOf('Nickname');
    const isActiveIdx = headers.indexOf('IsActive');

    const users = [];
    for (let i = 1; i < data.length; i++) {
      const isActive = data[i][isActiveIdx];
      if (isActive === true || isActive === 'TRUE' || isActive === 1) {
        users.push({
          userId: safeString(data[i][userIdIdx]),
          nickname: safeString(data[i][nicknameIdx])
        });
      }
    }

    Logger.log('✅ Found ' + users.length + ' active users');
    return cleanDataForWeb({ success: true, data: users });
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

// ==================== MEMBER REGISTRATION (PUBLIC) ====================
/**
 * Submit member registration - PUBLIC function (no token required)
 * Used by registration form on login page
 */
function submitMemberRegistration(registrationData) {
  Logger.log('=== submitMemberRegistration START ===');
  Logger.log('Registration data: ' + JSON.stringify(registrationData));

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_MEMBERS);

    if (!sheet) {
      Logger.log('❌ Sheet not found: ' + SHEET_MEMBERS);
      return { success: false, message: 'ไม่พบ Sheet ' + SHEET_MEMBERS };
    }

    // Generate new MemberID - find max existing ID and add 1
    const data = sheet.getDataRange().getValues();
    let maxId = 0;
    for (let i = 1; i < data.length; i++) {
      const id = parseInt(data[i][0]) || 0;
      if (id > maxId) maxId = id;
    }
    const newMemberId = maxId + 1;

    // Prepare row data according to column structure:
    // A: MemberID, B: Company(En), C: Name, D: Nickname, E: LineID, F: LineName
    // G: Phone, H: Mobile, I: LicenseNo, J: Website, K: Email
    // L: ExpDate (leave blank), M: Position, N: Sponsor1, O: Sponsor2
    // U: LineGroupStatus
    const rowData = [
      newMemberId,                        // A - MemberID
      registrationData.companyEn || '',   // B - Company (English)
      registrationData.fullName || '',    // C - Name
      registrationData.nickname || '',    // D - Nickname
      registrationData.lineId || '',      // E - LINE ID
      registrationData.lineName || '',    // F - LINE Name
      registrationData.phone || '',       // G - Phone
      registrationData.mobile || '',      // H - Mobile
      registrationData.licenseNo || '',   // I - License No
      registrationData.website || '',     // J - Website
      registrationData.email || '',       // K - Email
      '',                                 // L - ExpDate (leave blank)
      registrationData.position || '',    // M - Position (ตำแหน่งในบริษัท)
      registrationData.sponsor1 || '',    // N - Sponsor1 (ผู้รับรองท่านที่ 1)
      registrationData.sponsor2 || ''     // O - Sponsor2 (ผู้รับรองท่านที่ 2)
    ];

    // Append row to sheet
    sheet.appendRow(rowData);

    // Get the new row index
    const newRowIndex = sheet.getLastRow();

    // Set Status in column R (index 18) - รอตรวจสอบ for new registrations
    sheet.getRange(newRowIndex, 18).setValue('รอตรวจสอบ');

    // Set LineGroupStatus in column U (index 21)
    sheet.getRange(newRowIndex, 21).setValue(registrationData.lineGroupStatus || 'รอนำเข้ากลุ่ม');

    Logger.log('✅ Member registration successful: ' + registrationData.fullName + ' (MemberID: ' + newMemberId + ')');
    return cleanDataForWeb({
      success: true,
      message: 'ส่งใบสมัครสำเร็จ (รหัสสมาชิก: ' + newMemberId + ')',
      memberId: newMemberId
    });
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return { success: false, message: 'เกิดข้อผิดพลาด: ' + error.toString() };
  }
}

// ==================== TEST FUNCTIONS ====================
/**
 * Test function for debugging (Law 20: Debug Info Visibility Rule)
 * Run from Apps Script Editor to test backend functions
 */
function TEST_getMembers() {
  Logger.log('=== TEST_getMembers START ===');

  // Generate a test token
  const testToken = generateToken('TEST_USER');
  Logger.log('Test token: ' + testToken);

  // Try to get members
  const result = getMembers(testToken, {});
  Logger.log('Result success: ' + result.success);
  Logger.log('Members count: ' + (result.data ? result.data.length : 0));

  if (result.data && result.data.length > 0) {
    Logger.log('First member: ' + JSON.stringify(result.data[0]));
  }

  Logger.log('=== TEST_getMembers END ===');
}

function TEST_login() {
  Logger.log('=== TEST_login START ===');

  // Test with dummy credentials
  const result = login('test@test.com', 'test123');
  Logger.log('Result: ' + JSON.stringify(result));

  Logger.log('=== TEST_login END ===');
}

// ==================== CRM FUNCTIONS ====================
/**
 * Get or create CRM sheet
 * Auto-creates CRM_ContactHistory sheet if not exists
 */
function getOrCreateCRMSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_CRM);

  if (!sheet) {
    Logger.log('📋 [CRM] Creating new CRM sheet: ' + SHEET_CRM);
    sheet = ss.insertSheet(SHEET_CRM);

    // Set headers
    const headers = [
      'ID',           // A - Auto ID
      'MemberID',     // B - MemberID (primary key from member sheet)
      'LicenseNo',    // C - License number for reference
      'ContactDate',  // D - Date of contact
      'ContactReason', // E - Reason for contact
      'ContactResult', // F - contacted / not_contacted
      'SubResult',    // G - Sub result if contacted
      'Notes',        // H - Additional notes
      'RecordedBy',   // I - User who recorded
      'RecordedAt',   // J - Timestamp
      'StatusUpdated', // K - Whether member status was updated
      'ContactPerson' // L - Person responsible for contact
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    // Format header row
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#343a40')
      .setFontColor('#ffffff')
      .setFontWeight('bold');

    // Freeze header row
    sheet.setFrozenRows(1);

    // Set column widths
    sheet.setColumnWidth(1, 50);  // ID
    sheet.setColumnWidth(2, 100); // MemberID
    sheet.setColumnWidth(3, 120); // LicenseNo
    sheet.setColumnWidth(4, 100); // ContactDate
    sheet.setColumnWidth(5, 250); // ContactReason
    sheet.setColumnWidth(6, 120); // ContactResult
    sheet.setColumnWidth(7, 200); // SubResult
    sheet.setColumnWidth(8, 300); // Notes
    sheet.setColumnWidth(9, 120); // RecordedBy
    sheet.setColumnWidth(10, 150); // RecordedAt
    sheet.setColumnWidth(11, 100); // StatusUpdated
    sheet.setColumnWidth(12, 120); // ContactPerson

    Logger.log('✅ [CRM] CRM sheet created with headers');
  }

  return sheet;
}

/**
 * Save contact record to CRM sheet
 */
function saveContactRecord(token, contactData) {
  Logger.log('=== saveContactRecord START ===');
  Logger.log('Contact data: ' + JSON.stringify(contactData));

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    // Get CRM sheet (auto-create if not exists)
    const crmSheet = getOrCreateCRMSheet();

    // Get member info for reference
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const memberSheet = ss.getSheetByName(SHEET_MEMBERS);
    const memberRow = memberSheet.getRange(contactData.rowIndex, 1, 1, 21).getValues()[0];
    const memberId = safeString(memberRow[0]); // Column A - MemberID
    const licenseNo = safeString(memberRow[8]); // Column I

    // Get user info from token - use Nickname for RecordedBy
    const userId = getUserFromToken(token);
    Logger.log('📋 [CRM] userId from token: ' + userId + ' (type: ' + typeof userId + ')');

    const usersSheet = ss.getSheetByName(SHEET_USERS);
    const usersData = usersSheet.getDataRange().getValues();
    const usersHeaders = usersData[0];
    const userIdIdx = usersHeaders.indexOf('UserID');
    const nicknameIdx = usersHeaders.indexOf('Nickname');
    Logger.log('📋 [CRM] UserID index: ' + userIdIdx + ', Nickname index: ' + nicknameIdx);

    let userNickname = 'Unknown';
    for (let i = 1; i < usersData.length; i++) {
      const rowUserId = safeString(usersData[i][userIdIdx]);
      if (rowUserId === safeString(userId)) {
        userNickname = safeString(usersData[i][nicknameIdx]);
        Logger.log('📋 [CRM] Found user: ' + userNickname + ' at row ' + (i+1));
        break;
      }
    }
    Logger.log('📋 [CRM] Final userNickname: ' + userNickname);

    // Generate new ID
    const lastRow = crmSheet.getLastRow();
    const newId = lastRow; // Use row number as ID

    // Determine if status should be updated
    let statusUpdated = false;
    let newStatus = '';

    // Get current LINE group status
    const currentLineStatus = safeString(memberSheet.getRange(contactData.rowIndex, 21).getValue());
    Logger.log('📋 [CRM] Current LINE status: ' + currentLineStatus);

    // If no contactResult provided (pending contact) AND current status is "ปกติ"
    // → change to "รอผลการติดต่อ" regardless of previous contact history
    if (!contactData.contactResult || contactData.contactResult === '') {
      if (currentLineStatus === 'ปกติ' || currentLineStatus === '' || currentLineStatus === 'อยู่ในกลุ่ม') {
        newStatus = 'รอผลการติดต่อ';
        statusUpdated = true;
        memberSheet.getRange(contactData.rowIndex, 21).setValue(newStatus); // Column U
        Logger.log('📋 [CRM] Pending contact - Status updated to: ' + newStatus);
      }
    }

    // Only process result logic if contactResult is provided
    if (contactData.contactResult && contactData.contactResult !== '') {
      // Check for negative results - set status to "รอการนำชื่อออกจากกลุ่ม"
      const negativeResults = ['สมาชิกไม่ต่ออายุ', 'สมาชิกเลิกกิจการ'];
      if (contactData.contactResult === 'not_contacted' ||
          (contactData.subResult && negativeResults.includes(contactData.subResult))) {
        newStatus = 'รอนำชื่อออกจากกลุ่ม';
        statusUpdated = true;
        memberSheet.getRange(contactData.rowIndex, 21).setValue(newStatus); // Column U
        Logger.log('📋 [CRM] Negative result - Status updated to: ' + newStatus);
      }

      // Check for positive result - "อัพเดทข้อมูลเรียบร้อย"
      if (contactData.subResult === 'อัพเดทข้อมูลเรียบร้อย') {
        newStatus = 'ปกติ';  // Use 'ปกติ' to match Data Validation in Google Sheet
        statusUpdated = true;
        memberSheet.getRange(contactData.rowIndex, 21).setValue(newStatus); // Column U
        Logger.log('📋 [CRM] Positive result - Status updated to: ' + newStatus);
      }
    }

    // Determine contact result display text
    let contactResultText = '';
    if (contactData.contactResult === 'contacted') {
      contactResultText = 'ติดต่อแล้ว';
    } else if (contactData.contactResult === 'not_contacted') {
      contactResultText = 'ติดต่อไม่ได้เกิน 3 วัน';
    }
    // Empty contactResult means pending - leave it blank

    // Prepare row data (use MemberID instead of rowIndex)
    const now = new Date();
    const rowData = [
      newId,
      memberId,
      licenseNo,
      contactData.contactDate,
      contactData.contactReason,
      contactResultText,
      contactData.subResult || '',
      contactData.notes || '',
      userNickname,
      now,
      statusUpdated ? 'Yes' : 'No',
      contactData.contactPerson || ''
    ];

    // Append to sheet
    crmSheet.appendRow(rowData);

    Logger.log('✅ [CRM] Contact record saved');
    return cleanDataForWeb({
      success: true,
      message: 'บันทึกการติดต่อสำเร็จ',
      statusUpdated: statusUpdated,
      newStatus: newStatus
    });
  } catch (error) {
    Logger.log('❌ [CRM] Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

/**
 * Get all contacts with member info for Contact Management page
 */
function getAllContacts(token, filters) {
  Logger.log('=== getAllContacts START ===');
  Logger.log('Filters: ' + JSON.stringify(filters));

  filters = filters || {};

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const crmSheet = ss.getSheetByName(SHEET_CRM);
    const memberSheet = ss.getSheetByName(SHEET_MEMBERS);

    if (!crmSheet) {
      Logger.log('📋 [CRM] No CRM sheet found');
      return cleanDataForWeb({ success: true, data: [] });
    }

    // Build member lookup map
    const memberData = memberSheet.getDataRange().getValues();
    const memberMap = {};
    for (let i = 1; i < memberData.length; i++) {
      const row = memberData[i];
      const memberId = safeString(row[0]); // Column A - MemberID
      if (memberId) {
        memberMap[memberId] = {
          rowIndex: i + 1,
          companyQ: safeString(row[16]) || safeString(row[1]), // Q or B
          nickname: safeString(row[3]), // D
          lineId: safeString(row[4]), // E
          licenseNo: safeString(row[8]), // I - License Number
          lineGroupU: safeString(row[20]) // U
        };
      }
    }

    const crmData = crmSheet.getDataRange().getValues();
    const contacts = [];

    for (let i = 1; i < crmData.length; i++) {
      const row = crmData[i];
      const memberId = safeString(row[1]); // Column B - MemberID
      const memberInfo = memberMap[memberId] || {};

      // Get contact result status
      const contactResult = safeString(row[5]); // Column F
      let resultStatus = 'pending';
      if (contactResult === 'ติดต่อแล้ว') resultStatus = 'contacted';
      else if (contactResult && contactResult !== '-') resultStatus = 'not_contacted';

      const contact = {
        id: row[0], // Column A - ID
        memberId: memberId,
        rowIndex: memberInfo.rowIndex || 0,
        companyQ: memberInfo.companyQ || '-',
        licenseNo: memberInfo.licenseNo || '-',
        nickname: memberInfo.nickname || '-',
        lineId: memberInfo.lineId || '-',
        lineGroupU: memberInfo.lineGroupU || '-',
        contactDate: safeString(row[3]), // Column D
        contactReason: safeString(row[4]), // Column E
        contactResult: contactResult || '-',
        resultStatus: resultStatus,
        subResult: safeString(row[6]), // Column G
        notes: safeString(row[7]), // Column H
        recordedBy: safeString(row[8]), // Column I
        recordedAt: safeString(row[9]), // Column J
        contactPerson: safeString(row[11]) // Column L
      };

      // Apply filters
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchSearch =
          contact.companyQ.toLowerCase().includes(searchLower) ||
          contact.nickname.toLowerCase().includes(searchLower) ||
          contact.lineId.toLowerCase().includes(searchLower) ||
          contact.memberId.toLowerCase().includes(searchLower);
        if (!matchSearch) continue;
      }

      if (filters.resultStatus && filters.resultStatus !== contact.resultStatus) {
        continue;
      }

      if (filters.contactReason && filters.contactReason !== contact.contactReason) {
        continue;
      }

      contacts.push(contact);
    }

    // Sort by date descending (newest first)
    contacts.sort(function(a, b) {
      return new Date(b.contactDate) - new Date(a.contactDate);
    });

    Logger.log('✅ [CRM] Found ' + contacts.length + ' contacts');
    return cleanDataForWeb({ success: true, data: contacts });
  } catch (error) {
    Logger.log('❌ [CRM] Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

/**
 * Get contact history for a member by MemberID (primary key)
 */
function getContactHistoryByMemberId(token, memberId) {
  Logger.log('=== getContactHistoryByMemberId START === memberId: ' + memberId);

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const crmSheet = ss.getSheetByName(SHEET_CRM);

    if (!crmSheet) {
      Logger.log('📋 [CRM] No CRM sheet found - no history');
      return cleanDataForWeb({ success: true, data: [] });
    }

    const data = crmSheet.getDataRange().getValues();
    const history = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (safeString(row[1]) === safeString(memberId)) { // Column B - MemberID
        history.push({
          id: row[0],
          memberId: safeString(row[1]),
          contactDate: safeString(row[3]),
          contactReason: safeString(row[4]),
          contactResult: safeString(row[5]),
          subResult: safeString(row[6]),
          notes: safeString(row[7]),
          recordedBy: safeString(row[8]),
          recordedAt: safeString(row[9]),
          contactPerson: safeString(row[11]) // Column L - ContactPerson
        });
      }
    }

    // Sort by date descending (newest first)
    history.sort(function(a, b) {
      return new Date(b.contactDate) - new Date(a.contactDate);
    });

    Logger.log('✅ [CRM] Found ' + history.length + ' history records for MemberID: ' + memberId);
    return cleanDataForWeb({ success: true, data: history });
  } catch (error) {
    Logger.log('❌ [CRM] Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

/**
 * Get contact history for a member by rowIndex (for frontend compatibility)
 * Converts rowIndex to MemberID and calls getContactHistoryByMemberId
 */
function getContactHistory(token, rowIndex) {
  Logger.log('=== getContactHistory START === rowIndex: ' + rowIndex);

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    // Get MemberID from rowIndex
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const memberSheet = ss.getSheetByName(SHEET_MEMBERS);
    const memberRow = memberSheet.getRange(rowIndex, 1, 1, 1).getValues()[0];
    const memberId = safeString(memberRow[0]); // Column A - MemberID

    Logger.log('📋 [CRM] Converting rowIndex ' + rowIndex + ' to MemberID: ' + memberId);

    // Call the MemberID version
    return getContactHistoryByMemberId(token, memberId);
  } catch (error) {
    Logger.log('❌ [CRM] Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

/**
 * Update contact result for an existing record
 * Used when initial contact was saved without result
 */
function updateContactResult(token, updateData) {
  Logger.log('=== updateContactResult START ===');
  Logger.log('Update data: ' + JSON.stringify(updateData));

  if (!verifyToken(token)) {
    return { success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' };
  }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const crmSheet = ss.getSheetByName(SHEET_CRM);
    const memberSheet = ss.getSheetByName(SHEET_MEMBERS);

    if (!crmSheet) {
      return { success: false, message: 'ไม่พบ CRM Sheet' };
    }

    // Find the record by ID
    const data = crmSheet.getDataRange().getValues();
    let recordRow = -1;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == updateData.recordId) {
        recordRow = i + 1; // Convert to 1-based row number
        break;
      }
    }

    if (recordRow === -1) {
      return { success: false, message: 'ไม่พบรายการที่ต้องการอัพเดท' };
    }

    // Determine contact result text
    const contactResultText = updateData.contactResult === 'contacted'
      ? 'ติดต่อแล้ว'
      : 'ติดต่อไม่ได้เกิน 3 วัน';

    // Update the record
    crmSheet.getRange(recordRow, 6).setValue(contactResultText); // Column F - ContactResult
    crmSheet.getRange(recordRow, 7).setValue(updateData.subResult || ''); // Column G - SubResult

    // Append notes if provided
    if (updateData.notes) {
      const existingNotes = safeString(data[recordRow - 1][7]); // Column H (0-indexed = 7)
      const newNotes = existingNotes ? existingNotes + '\n[อัพเดท] ' + updateData.notes : updateData.notes;
      crmSheet.getRange(recordRow, 8).setValue(newNotes); // Column H - Notes
    }

    // Update status based on result
    let statusUpdated = false;
    let newStatus = '';

    const negativeResults = ['สมาชิกไม่ต่ออายุ', 'สมาชิกเลิกกิจการ'];
    if (updateData.contactResult === 'not_contacted' ||
        (updateData.subResult && negativeResults.includes(updateData.subResult))) {
      newStatus = 'รอนำชื่อออกจากกลุ่ม';
      statusUpdated = true;
      memberSheet.getRange(updateData.rowIndex, 21).setValue(newStatus); // Column U
      Logger.log('📋 [CRM] Negative result - Status updated to: ' + newStatus);
    }

    if (updateData.subResult === 'อัพเดทข้อมูลเรียบร้อย') {
      newStatus = 'ปกติ';  // Use 'ปกติ' to match Data Validation in Google Sheet
      statusUpdated = true;
      memberSheet.getRange(updateData.rowIndex, 21).setValue(newStatus); // Column U
      Logger.log('📋 [CRM] Positive result - Status updated to: ' + newStatus);
    }

    // Update StatusUpdated column
    if (statusUpdated) {
      crmSheet.getRange(recordRow, 11).setValue('Yes'); // Column K - StatusUpdated
    }

    // Update ContactPerson if provided
    if (updateData.contactPerson) {
      crmSheet.getRange(recordRow, 12).setValue(updateData.contactPerson); // Column L - ContactPerson
    }

    Logger.log('✅ [CRM] Contact result updated');
    return cleanDataForWeb({
      success: true,
      message: 'บันทึกผลการติดต่อสำเร็จ',
      statusUpdated: statusUpdated,
      newStatus: newStatus
    });
  } catch (error) {
    Logger.log('❌ [CRM] Error: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}
