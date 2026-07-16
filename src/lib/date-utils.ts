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
