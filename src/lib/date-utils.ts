/**
 * Date utility functions for Thai Buddhist calendar formatting
 */

/**
 * Format date to Thai format: dd mmm yy hh:mm
 * @param dateInput ISO string or Date object
 * @returns Formatted string like "17 ก.ค. 69 14:30"
 */
export function formatThaiDateTime(dateInput: string | Date | { _seconds: number } | undefined | null): string {
  if (!dateInput) return '-';

  let date: Date;

  // Handle Firestore timestamp format
  if (typeof dateInput === 'object' && '_seconds' in dateInput) {
    date = new Date(dateInput._seconds * 1000);
  } else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return '-';
  }

  // Check if valid date
  if (isNaN(date.getTime())) return '-';

  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];

  const day = date.getDate().toString().padStart(2, '0');
  const month = thaiMonths[date.getMonth()];
  const year = (date.getFullYear() + 543).toString().slice(-2); // Get last 2 digits of Buddhist year
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

/**
 * Format date to Thai format without time: dd mmm yy
 * @param dateInput ISO string or Date object
 * @returns Formatted string like "17 ก.ค. 69"
 */
export function formatThaiDate(dateInput: string | Date | { _seconds: number } | undefined | null): string {
  if (!dateInput) return '-';

  let date: Date;

  // Handle Firestore timestamp format
  if (typeof dateInput === 'object' && '_seconds' in dateInput) {
    date = new Date(dateInput._seconds * 1000);
  } else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return '-';
  }

  // Check if valid date
  if (isNaN(date.getTime())) return '-';

  const thaiMonths = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];

  const day = date.getDate().toString().padStart(2, '0');
  const month = thaiMonths[date.getMonth()];
  const year = (date.getFullYear() + 543).toString().slice(-2); // Get last 2 digits of Buddhist year

  return `${day} ${month} ${year}`;
}

/**
 * Format date to full Thai format with full year: dd month yyyy
 * @param dateInput ISO string or Date object
 * @returns Formatted string like "17 กรกฎาคม 2569"
 */
export function formatThaiDateFull(dateInput: string | Date | { _seconds: number } | undefined | null): string {
  if (!dateInput) return '-';

  let date: Date;

  // Handle Firestore timestamp format
  if (typeof dateInput === 'object' && '_seconds' in dateInput) {
    date = new Date(dateInput._seconds * 1000);
  } else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return '-';
  }

  // Check if valid date
  if (isNaN(date.getTime())) return '-';

  const thaiMonthsFull = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const day = date.getDate();
  const month = thaiMonthsFull[date.getMonth()];
  const year = date.getFullYear() + 543;

  return `${day} ${month} ${year}`;
}

/**
 * Format event date range (for events with start and end dates)
 * @param startDate Start date string (DD/MM/YYYY or YYYY)
 * @param endDate End date string (DD/MM/YYYY) - optional
 * @returns Formatted string like "17-19 กรกฎาคม 2569" or "17 กรกฎาคม - 2 สิงหาคม 2569"
 */
export function formatEventDateRange(startDate: string, endDate?: string): string {
  if (!startDate) return '-';

  // Parse start date
  const startParsed = parseThaiDate(startDate);
  if (!startParsed) return startDate; // Return original if can't parse

  // No end date - single day event
  if (!endDate) {
    return formatThaiDateFromParsed(startParsed);
  }

  // Parse end date
  const endParsed = parseThaiDate(endDate);
  if (!endParsed) {
    return formatThaiDateFromParsed(startParsed); // Return start date only if end date invalid
  }

  const thaiMonthsFull = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  // Same month and year - show as "17-19 กรกฎาคม 2569"
  if (startParsed.month === endParsed.month && startParsed.year === endParsed.year) {
    return `${startParsed.day}-${endParsed.day} ${thaiMonthsFull[startParsed.month]} ${startParsed.year + 543}`;
  }

  // Same year, different months - show as "30 กรกฎาคม - 2 สิงหาคม 2569"
  if (startParsed.year === endParsed.year) {
    return `${startParsed.day} ${thaiMonthsFull[startParsed.month]} - ${endParsed.day} ${thaiMonthsFull[endParsed.month]} ${startParsed.year + 543}`;
  }

  // Different years - show full dates "30 ธันวาคม 2568 - 2 มกราคม 2569"
  return `${startParsed.day} ${thaiMonthsFull[startParsed.month]} ${startParsed.year + 543} - ${endParsed.day} ${thaiMonthsFull[endParsed.month]} ${endParsed.year + 543}`;
}

/**
 * Parse Thai date string (DD/MM/YYYY, YYYY-MM-DD, or YYYY) to components
 */
function parseThaiDate(dateStr: string): { day: number; month: number; year: number } | null {
  if (!dateStr) return null;

  // Try YYYY-MM-DD format (ISO format - new preferred format)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]) - 1; // 0-indexed
    const day = parseInt(isoMatch[3]);
    return { day, month, year };
  }

  // Try DD/MM/YYYY format (พ.ศ.)
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1]);
    const month = parseInt(ddmmyyyyMatch[2]) - 1; // 0-indexed
    let year = parseInt(ddmmyyyyMatch[3]);

    // Convert Buddhist year to Gregorian if year > 2500
    if (year > 2500) {
      year = year - 543;
    }

    return { day, month, year };
  }

  // Try YYYY format (year only - assume Jan 1)
  const yearMatch = dateStr.match(/^(\d{4})$/);
  if (yearMatch) {
    let year = parseInt(yearMatch[1]);
    if (year > 2500) {
      year = year - 543;
    }
    return { day: 1, month: 0, year };
  }

  return null;
}

/**
 * Format date from parsed components
 */
function formatThaiDateFromParsed(parsed: { day: number; month: number; year: number }): string {
  const thaiMonthsFull = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  return `${parsed.day} ${thaiMonthsFull[parsed.month]} ${parsed.year + 543}`;
}
