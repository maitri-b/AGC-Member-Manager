/**
 * Convert number to Thai Baht text
 * Example: 1500 -> "หนึ่งพันห้าร้อยบาทถ้วน"
 */

const THAI_NUMBERS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_DIGITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

export function numberToThaiText(num: number): string {
  if (num === 0) return 'ศูนย์บาทถ้วน';
  if (num < 0) return 'ลบ' + numberToThaiText(-num);

  // Split into integer and decimal parts
  const parts = num.toFixed(2).split('.');
  const integerPart = parseInt(parts[0]);
  const decimalPart = parseInt(parts[1]);

  let result = '';

  // Convert integer part
  if (integerPart > 0) {
    result = convertIntegerToText(integerPart);
  }

  // Add "บาท"
  if (integerPart === 0) {
    // If no integer part, don't add anything yet
  } else {
    result += 'บาท';
  }

  // Convert decimal part (satang)
  if (decimalPart > 0) {
    if (integerPart === 0) {
      result = convertIntegerToText(decimalPart) + 'สตางค์';
    } else {
      result += convertIntegerToText(decimalPart) + 'สตางค์';
    }
  } else {
    if (integerPart > 0) {
      result += 'ถ้วน';
    }
  }

  return result;
}

function convertIntegerToText(num: number): string {
  if (num === 0) return '';
  if (num > 1000000) {
    // Handle millions
    const millions = Math.floor(num / 1000000);
    const remainder = num % 1000000;
    return convertIntegerToText(millions) + 'ล้าน' + convertIntegerToText(remainder);
  }

  const numStr = num.toString();
  const length = numStr.length;
  let result = '';

  for (let i = 0; i < length; i++) {
    const digit = parseInt(numStr[i]);
    const position = length - i - 1;

    if (digit === 0) continue;

    // Special cases
    if (position === 1 && digit === 2) {
      // "ยี่" for 20-29
      result += 'ยี่สิบ';
      continue;
    }

    if (position === 1 && digit === 1) {
      // Just "สิบ" for 10-19
      result += 'สิบ';
      continue;
    }

    if (position === 0 && digit === 1 && length > 1) {
      // "เอ็ด" instead of "หนึ่ง" for units place when not alone
      result += 'เอ็ด';
      continue;
    }

    // Normal case
    result += THAI_NUMBERS[digit];
    if (position > 0 && position < THAI_DIGITS.length) {
      result += THAI_DIGITS[position];
    }
  }

  return result;
}
