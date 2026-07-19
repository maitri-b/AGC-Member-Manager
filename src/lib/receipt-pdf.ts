/**
 * Generate receipt certificate PDF using pdfmake
 * Based on government template format
 */

import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { numberToThaiText } from './thai-baht-text';
import { formatEventDateRange } from './date-utils';

export interface ReceiptData {
  companyName: string;
  eventName: string;
  slipUploadDate: string;
  totalAmount: number;
  memberName: string;
  memberPosition: string;
  eventStartDate: string;
  eventEndDate?: string;
}

export function generateReceiptPDF(data: ReceiptData): TDocumentDefinitions {
  const {
    companyName,
    eventName,
    slipUploadDate,
    totalAmount,
    memberName,
    memberPosition,
    eventStartDate,
    eventEndDate,
  } = data;

  // Format dates
  const uploadDate = new Date(slipUploadDate);
  const uploadDateThai = `${uploadDate.getDate()}/${uploadDate.getMonth() + 1}/${uploadDate.getFullYear() + 543}`;

  // Format event date range
  const eventDateRange = formatEventDateRange(eventStartDate, eventEndDate);

  // Convert amount to Thai text
  const amountText = numberToThaiText(totalAmount);

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [60, 60, 60, 60],
    defaultStyle: {
      fontSize: 14,
    },
    content: [
      // Header
      {
        text: 'ใบรับรองแทนใบเสร็จรับเงิน',
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 20],
      },

      // Company name
      {
        text: [
          { text: 'ชื่อผู้จ่ายเงิน: ', bold: true },
          companyName,
        ],
        margin: [0, 0, 0, 10],
      },

      // Description
      {
        text: [
          { text: 'รายการจ่าย: ', bold: true },
          `ค่าเข้าร่วมกิจกรรม ${eventName}`,
        ],
        margin: [0, 0, 0, 10],
      },

      // Date
      {
        text: [
          { text: 'วันที่จ่าย: ', bold: true },
          uploadDateThai,
        ],
        margin: [0, 0, 0, 10],
      },

      // Amount (number)
      {
        text: [
          { text: 'จำนวนเงิน: ', bold: true },
          `${totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`,
        ],
        margin: [0, 0, 0, 10],
      },

      // Amount (text)
      {
        text: [
          { text: 'จำนวนเงิน (ตัวอักษร): ', bold: true },
          amountText,
        ],
        margin: [0, 0, 0, 30],
      },

      // Certification text
      {
        text: [
          { text: 'ข้าพเจ้า ', fontSize: 16 },
          { text: memberName, decoration: 'underline', fontSize: 16 },
          { text: ' (ผู้เบิกจ่าย) ตำแหน่ง ', fontSize: 16 },
          { text: memberPosition, decoration: 'underline', fontSize: 16 },
        ],
        margin: [0, 0, 0, 10],
        lineHeight: 1.5,
      },

      {
        text: 'ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของทางชมรมเอเจ้นท์คลับ โดยแท้',
        margin: [0, 0, 0, 10],
        lineHeight: 1.5,
      },

      {
        text: [
          { text: 'ตั้งแต่วันที่ ', fontSize: 16 },
          { text: eventDateRange, decoration: 'underline', fontSize: 16 },
        ],
        margin: [0, 0, 0, 40],
        lineHeight: 1.5,
      },

      // Signature
      {
        text: '(ลงชื่อ)...................................................',
        alignment: 'right',
        margin: [0, 0, 60, 5],
      },
      {
        text: `(${memberName})`,
        alignment: 'right',
        margin: [0, 0, 60, 5],
      },
      {
        text: 'ผู้เบิกจ่าย',
        alignment: 'right',
        margin: [0, 0, 60, 20],
      },

      // Footer note
      {
        text: 'หมายเหตุ: ใบรับรองนี้ออกโดยระบบอัตโนมัติของชมรมเอเจ้นท์คลับ',
        fontSize: 14,
        italics: true,
        color: '#666666',
        alignment: 'center',
        margin: [0, 30, 0, 0],
      },
    ],
    styles: {
      header: {
        fontSize: 20,
        bold: true,
      },
    },
  };

  return docDefinition;
}
