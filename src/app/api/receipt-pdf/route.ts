// API Route - Generate Receipt Certificate PDF (POST method to avoid URL encoding issues)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { generateReceiptPDF, ReceiptData } from '@/lib/receipt-pdf';

// Ensure route is registered correctly
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Add GET endpoint for testing route availability
export async function GET() {
  return NextResponse.json({
    message: 'Receipt PDF endpoint is available. Use POST method with eventId in body.',
    method: 'POST',
    endpoint: '/api/receipt-pdf',
  });
}

// Puppeteer for HTML to PDF conversion with Thai font support
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Remove pdf-lib imports - no longer needed
// Using Puppeteer for better Thai language support

export async function POST(request: NextRequest) {
  try {
    console.log('[Receipt PDF] POST request received');
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      console.log('[Receipt PDF] Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request body
    const body = await request.json();
    const { eventId, companyName, memberName, memberPosition } = body;

    console.log('[Receipt PDF] Request for eventId:', eventId, 'userId:', session.user.id);

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
    }

    const db = adminDb();

    // Get event data
    console.log('[Receipt PDF] Fetching event document:', eventId);
    const eventDoc = await db.collection('events').doc(eventId).get();
    console.log('[Receipt PDF] Event exists:', eventDoc.exists);

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const event = { eventId: eventDoc.id, ...eventDoc.data() } as any;
    console.log('[Receipt PDF] Event data loaded:', { eventId: event.eventId, eventName: event.eventName });

    // Get user's registration for this event
    console.log('[Receipt PDF] ===== SEARCH PARAMETERS =====');
    console.log('[Receipt PDF] eventId:', eventId);
    console.log('[Receipt PDF] session.user.id:', session.user.id);
    console.log('[Receipt PDF] session.user.lineUserId:', session.user.lineUserId);
    console.log('[Receipt PDF] session.user.memberId:', session.user.memberId);
    console.log('[Receipt PDF] ===========================');

    // Get ALL registrations from eventRegistrations collection (not subcollection!)
    console.log('[Receipt PDF] Fetching registrations from eventRegistrations collection where eventId =', eventId);
    const allRegistrations = await db
      .collection('eventRegistrations')
      .where('eventId', '==', eventId)
      .get();

    console.log('[Receipt PDF] Total registrations in event:', allRegistrations.size);

    // Debug: Show all registration IDs and their userId/memberId
    if (allRegistrations.size > 0) {
      console.log('[Receipt PDF] All registration docs in event:');
      allRegistrations.docs.forEach(doc => {
        const data = doc.data();
        console.log('[Receipt PDF]   -', doc.id, {
          userId: data.userId,
          memberId: data.memberId,
          contactName: data.contactName,
          paymentStatus: data.paymentStatus,
        });
      });
    }

    // Find registration manually
    let registrationsSnapshot: any = { empty: true, docs: [] };

    for (const doc of allRegistrations.docs) {
      const data = doc.data();

      // Convert both sides to strings for comparison to handle type mismatches
      const sessionUserId = String(session.user.id || '');
      const sessionMemberId = String(session.user.memberId || '');
      const sessionLineUserId = String(session.user.lineUserId || '');

      const dataUserId = String(data.userId || '');
      const dataMemberId = String(data.memberId || '');
      const dataLineUserId = String(data.lineUserId || '');

      const userIdMatch = sessionUserId && dataUserId === sessionUserId;
      const memberIdMatch = sessionMemberId && dataMemberId === sessionMemberId;
      const lineUserIdMatch = sessionLineUserId && dataLineUserId === sessionLineUserId;

      console.log('[Receipt PDF] Comparing registration doc:', doc.id, {
        sessionUserId,
        sessionMemberId,
        dataUserId,
        dataMemberId,
        userIdMatch,
        memberIdMatch,
      });

      if (userIdMatch || memberIdMatch || lineUserIdMatch) {
        console.log('[Receipt PDF] ✅ Found registration!', {
          matchedBy: userIdMatch ? 'userId' : (memberIdMatch ? 'memberId' : 'lineUserId'),
          docId: doc.id,
        });
        registrationsSnapshot = {
          empty: false,
          docs: [doc],
        };
        break;
      }
    }

    console.log('[Receipt PDF] Manual search result:', registrationsSnapshot.empty ? 'empty' : 'found');

    if (registrationsSnapshot.empty) {
      console.log('[Receipt PDF] ❌ Registration not found');

      // Debug: Get first registration from this event to see structure
      const debugSnapshot = await db
        .collection('eventRegistrations')
        .where('eventId', '==', eventId)
        .limit(1)
        .get();

      if (!debugSnapshot.empty) {
        const sampleReg = debugSnapshot.docs[0].data();
        console.log('[Receipt PDF] Sample registration from this event:', {
          id: debugSnapshot.docs[0].id,
          userId: sampleReg.userId,
          memberId: sampleReg.memberId,
          contactName: sampleReg.contactName,
          hasAllFields: Object.keys(sampleReg),
        });
      }

      return NextResponse.json({
        error: 'Registration not found',
        message: 'ไม่พบการลงทะเบียนของคุณในกิจกรรมนี้'
      }, { status: 404 });
    }

    console.log('[Receipt PDF] ✅ Registration found');

    const registration = registrationsSnapshot.docs[0].data();

    // Check payment status - must be "ชำระครบแล้ว"
    if (registration.paymentStatus !== 'ชำระครบแล้ว') {
      return NextResponse.json(
        { error: 'Receipt certificate is only available for fully paid registrations' },
        { status: 403 }
      );
    }

    // Get member data
    const userDoc = await db.collection('users').doc(session.user.id).get();
    const userData = userDoc.data();

    // Helper function to parse Thai date format "dd/mm/yyyy" (Buddhist year) or Firestore Timestamp
    const parseDate = (dateInput: any): Date | null => {
      if (!dateInput) return null;

      // Handle Firestore Timestamp
      if (typeof dateInput === 'object' && 'toDate' in dateInput) {
        return dateInput.toDate();
      }

      // Handle string in "dd/mm/yyyy" format (Buddhist year)
      if (typeof dateInput === 'string') {
        const match = dateInput.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (match) {
          const day = parseInt(match[1]);
          const month = parseInt(match[2]) - 1; // 0-indexed
          let year = parseInt(match[3]);

          // Convert Buddhist year to Gregorian if year > 2500
          if (year > 2500) {
            year = year - 543;
          }

          return new Date(year, month, day);
        }

        // Try parsing as ISO string or other standard formats
        const parsed = new Date(dateInput);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      return null;
    };

    // Determine slip upload date (use most recent payment date)
    let slipUploadDate = registration.depositPaidDate || registration.fullPaymentPaidDate || registration.registrationDate;

    // If remaining payment was made, use that date instead
    if (registration.remainingPaidDate) {
      slipUploadDate = registration.remainingPaidDate;
    }

    // Parse the date (handles both Firestore Timestamp and Thai date string "dd/mm/yyyy")
    const parsedSlipDate = parseDate(slipUploadDate);
    const slipUploadDateISO = parsedSlipDate ? parsedSlipDate.toISOString() : new Date().toISOString();

    // Get default values
    const defaultMemberPosition = userData?.position || 'กรรมการผู้จัดการ';
    const defaultCompanyName = registration.companyName || userData?.companyNameTH || '';
    // Use contactName (full name) instead of LINE display name
    const defaultMemberName = registration.contactName || userData?.name || '';

    // Parse event dates (also in dd/mm/yyyy format)
    const parsedEventStartDate = parseDate(event.eventDate);
    const eventStartDateISO = parsedEventStartDate ? parsedEventStartDate.toISOString() : new Date().toISOString();

    const parsedEventEndDate = event.eventEndDate ? parseDate(event.eventEndDate) : null;
    const eventEndDateISO = parsedEventEndDate ? parsedEventEndDate.toISOString() : undefined;

    // Prepare receipt data (use custom values from request if provided, otherwise use defaults)
    const receiptData: ReceiptData = {
      companyName: companyName || defaultCompanyName,
      eventName: event.eventName,
      slipUploadDate: slipUploadDateISO,
      totalAmount: registration.totalAmount || 0,
      memberName: memberName || defaultMemberName,
      memberPosition: memberPosition || defaultMemberPosition,
      eventStartDate: eventStartDateISO,
      eventEndDate: eventEndDateISO,
    };

    // Generate PDF using pdf-lib (supports Thai text better than pdfmake)
    console.log('[Receipt PDF] Generating PDF with pdf-lib');
    console.log('[Receipt PDF] Date parsing results:', {
      originalSlipDate: slipUploadDate,
      parsedSlipDate: parsedSlipDate?.toISOString(),
      originalEventDate: event.eventDate,
      parsedEventDate: parsedEventStartDate?.toISOString(),
    });

    // Format dates for display
    const formatThaiDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const slipDateFormatted = formatThaiDate(receiptData.slipUploadDate);
    const eventStartFormatted = formatThaiDate(receiptData.eventStartDate);
    const eventEndFormatted = receiptData.eventEndDate ? formatThaiDate(receiptData.eventEndDate) : null;
    const eventDateDisplay = eventEndFormatted ? `${eventStartFormatted} - ${eventEndFormatted}` : eventStartFormatted;

    // Convert amount to Thai text
    const { numberToThaiText } = await import('@/lib/thai-baht-text');
    const amountText = numberToThaiText(receiptData.totalAmount);

    // Create HTML template with Google Fonts Sarabun for Thai text
    const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Sarabun', sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #000;
      padding: 20px;
    }

    .container {
      max-width: 700px;
      margin: 0 auto;
      border: 2px solid #000;
      padding: 30px;
    }

    .header {
      text-align: center;
      margin-bottom: 30px;
    }

    .header h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .header p {
      font-size: 16px;
      color: #666;
    }

    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }

    .info-table td {
      border: 1px solid #000;
      padding: 10px 15px;
      vertical-align: top;
    }

    .info-table td.label {
      width: 200px;
      font-weight: 700;
      background-color: #f5f5f5;
    }

    .info-table td.value {
      background-color: #fff;
    }

    .certification {
      margin: 30px 0;
      line-height: 2;
    }

    .certification p {
      margin-bottom: 10px;
    }

    .underline {
      text-decoration: underline;
      font-weight: 700;
    }

    .signature-section {
      margin-top: 50px;
      text-align: right;
    }

    .signature-line {
      display: inline-block;
      margin-top: 20px;
    }

    .signature-line p {
      margin: 5px 0;
    }

    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 14px;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>ใบรับรองแทนใบเสร็จรับเงิน</h1>
      <p>Receipt Certificate</p>
    </div>

    <!-- Information Table -->
    <table class="info-table">
      <tr>
        <td class="label">ชื่อผู้จ่ายเงิน</td>
        <td class="value">${receiptData.companyName}</td>
      </tr>
      <tr>
        <td class="label">รายการจ่าย</td>
        <td class="value">ค่าเข้าร่วมกิจกรรม ${receiptData.eventName}</td>
      </tr>
      <tr>
        <td class="label">วันที่จ่าย</td>
        <td class="value">${slipDateFormatted}</td>
      </tr>
      <tr>
        <td class="label">จำนวนเงิน</td>
        <td class="value">${receiptData.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท</td>
      </tr>
      <tr>
        <td class="label">จำนวนเงิน (ตัวอักษร)</td>
        <td class="value">${amountText}</td>
      </tr>
      <tr>
        <td class="label">วันที่จัดกิจกรรม</td>
        <td class="value">${eventDateDisplay}</td>
      </tr>
    </table>

    <!-- Certification Text -->
    <div class="certification">
      <p>
        ข้าพเจ้า <span class="underline">${receiptData.memberName}</span> (ผู้เบิกจ่าย)
        ตำแหน่ง <span class="underline">${receiptData.memberPosition}</span>
      </p>
      <p>
        ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้
        และข้าพเจ้าได้จ่ายไปในงานของทางชมรมเอเจ้นท์คลับ โดยแท้
      </p>
      <p>
        ตั้งแต่วันที่ <span class="underline">${eventDateDisplay}</span>
      </p>
    </div>

    <!-- Signature Section -->
    <div class="signature-section">
      <div class="signature-line">
        <p>(ลงชื่อ)...................................................</p>
        <p>(${receiptData.memberName})</p>
        <p>ผู้เบิกจ่าย</p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>หมายเหตุ: ใบรับรองนี้ออกโดยระบบอัตโนมัติของชมรมเอเจ้นท์คลับ</p>
    </div>
  </div>
</body>
</html>`;

    console.log('[Receipt PDF] Generating PDF with Puppeteer + Chromium');

    // Launch Puppeteer with Chromium for serverless environment
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm',
      },
    });

    await browser.close();

    console.log('[Receipt PDF] ✅ PDF generated successfully with Thai text support');

    // Convert Uint8Array to Buffer for NextResponse
    const buffer = Buffer.from(pdfBuffer);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-certificate.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating receipt PDF:', error);
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 });
  }
}
