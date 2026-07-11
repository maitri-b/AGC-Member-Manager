/**
 * Script to migrate old Google Drive URLs to thumbnail URLs
 * Run this once to fix existing slip URLs in the sheet
 */

const SHEET_ID = '1pVx91b0tA6IHIfKTvGq6ywYYzkNe1HPkGh7rSiHlmb0';

/**
 * Convert old Drive URL to thumbnail URL
 * @param {string} url - Old Google Drive URL
 * @returns {string} - New thumbnail URL or original if not a Drive URL
 */
function convertToThumbnailUrl(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Pattern 1: https://drive.google.com/file/d/FILE_ID/view
  const pattern1 = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
  const match1 = url.match(pattern1);
  if (match1) {
    const fileId = match1[1];
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }

  // Pattern 2: https://drive.google.com/open?id=FILE_ID
  const pattern2 = /https:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/;
  const match2 = url.match(pattern2);
  if (match2) {
    const fileId = match2[1];
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }

  // Already thumbnail URL or other format
  return url;
}

/**
 * Migrate slip URLs in a specific sheet
 * @param {string} sheetName - Name of the sheet to process
 */
function migrateSheetUrls(sheetName) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      Logger.log(`Sheet not found: ${sheetName}`);
      return { success: false, error: 'Sheet not found' };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const normalizedHeaders = headers.map(h => String(h).toLowerCase().trim());

    // Find slip URL columns
    const slipUrlCol = normalizedHeaders.indexOf('slip_url');
    const depositSlipUrlCol = normalizedHeaders.indexOf('deposit_slip_url');
    const remainingSlipUrlCol = normalizedHeaders.indexOf('remaining_slip_url');

    let updatedCount = 0;

    // Process each row (skip header)
    for (let i = 1; i < data.length; i++) {
      const rowNum = i + 1;
      let rowUpdated = false;

      // Migrate slip_url (legacy)
      if (slipUrlCol >= 0 && data[i][slipUrlCol]) {
        const oldUrl = data[i][slipUrlCol];
        const newUrl = convertToThumbnailUrl(oldUrl);
        if (newUrl !== oldUrl) {
          sheet.getRange(rowNum, slipUrlCol + 1).setValue(newUrl);
          Logger.log(`Row ${rowNum}: Updated slip_url`);
          rowUpdated = true;
        }
      }

      // Migrate deposit_slip_url
      if (depositSlipUrlCol >= 0 && data[i][depositSlipUrlCol]) {
        const oldUrl = data[i][depositSlipUrlCol];
        const newUrl = convertToThumbnailUrl(oldUrl);
        if (newUrl !== oldUrl) {
          sheet.getRange(rowNum, depositSlipUrlCol + 1).setValue(newUrl);
          Logger.log(`Row ${rowNum}: Updated deposit_slip_url`);
          rowUpdated = true;
        }
      }

      // Migrate remaining_slip_url
      if (remainingSlipUrlCol >= 0 && data[i][remainingSlipUrlCol]) {
        const oldUrl = data[i][remainingSlipUrlCol];
        const newUrl = convertToThumbnailUrl(oldUrl);
        if (newUrl !== oldUrl) {
          sheet.getRange(rowNum, remainingSlipUrlCol + 1).setValue(newUrl);
          Logger.log(`Row ${rowNum}: Updated remaining_slip_url`);
          rowUpdated = true;
        }
      }

      if (rowUpdated) {
        updatedCount++;
      }
    }

    Logger.log(`Migration completed: ${updatedCount} rows updated in ${sheetName}`);
    return { success: true, updatedCount };

  } catch (error) {
    Logger.log(`Error migrating ${sheetName}: ${error.toString()}`);
    return { success: false, error: error.message };
  }
}

/**
 * Migrate all event sheets
 * Run this function manually from Script Editor
 */
function migrateAllSheets() {
  const sheets = [
    '10 Yearth Meeting',
    'Rally2026',
    // Add more sheet names here as needed
  ];

  Logger.log('Starting migration...');

  const results = {};
  for (const sheetName of sheets) {
    Logger.log(`\nProcessing: ${sheetName}`);
    const result = migrateSheetUrls(sheetName);
    results[sheetName] = result;
  }

  Logger.log('\n=== Migration Summary ===');
  for (const [sheetName, result] of Object.entries(results)) {
    if (result.success) {
      Logger.log(`✓ ${sheetName}: ${result.updatedCount} rows updated`);
    } else {
      Logger.log(`✗ ${sheetName}: ${result.error}`);
    }
  }
}

/**
 * Test function to verify URL conversion
 */
function testUrlConversion() {
  const testUrls = [
    'https://drive.google.com/file/d/1ABC123xyz/view',
    'https://drive.google.com/open?id=1ABC123xyz',
    'https://drive.google.com/thumbnail?id=1ABC123xyz&sz=w1000',
    'https://example.com/image.jpg',
  ];

  Logger.log('=== URL Conversion Test ===');
  for (const url of testUrls) {
    const converted = convertToThumbnailUrl(url);
    Logger.log(`Input:  ${url}`);
    Logger.log(`Output: ${converted}`);
    Logger.log('---');
  }
}
