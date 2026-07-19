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

// pdf-lib for generating PDF with Thai text support
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width, height } = page.getSize();

    // Use Helvetica for Thai text (will show as boxes but structure will be correct)
    // Note: For proper Thai rendering, we'd need to embed a Thai font file
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 12;
    const titleSize = 18;
    const margin = 60;
    let y = height - margin;

    // Draw border
    page.drawRectangle({
      x: margin - 10,
      y: margin - 10,
      width: width - 2 * margin + 20,
      height: height - 2 * margin + 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 2,
    });

    // Title
    const title = 'Receipt Certificate';
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
      x: width / 2 - titleWidth / 2,
      y: y,
      size: titleSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 40;

    // Subtitle in Thai (will show as Latin transliteration)
    const subtitle = 'Bairubrongaetanbaisercchrubreuengern';
    const subtitleWidth = font.widthOfTextAtSize(subtitle, fontSize);
    page.drawText(subtitle, {
      x: width / 2 - subtitleWidth / 2,
      y: y,
      size: fontSize,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 40;

    // Draw table
    const tableX = margin + 10;
    const tableWidth = width - 2 * margin - 20;
    const rowHeight = 30;
    const labelWidth = 150;

    // Helper function to draw table row
    const drawRow = (label: string, value: string, yPos: number) => {
      // Draw row border
      page.drawRectangle({
        x: tableX,
        y: yPos - rowHeight,
        width: tableWidth,
        height: rowHeight,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });

      // Draw divider line
      page.drawLine({
        start: { x: tableX + labelWidth, y: yPos },
        end: { x: tableX + labelWidth, y: yPos - rowHeight },
        color: rgb(0, 0, 0),
        thickness: 1,
      });

      // Label
      page.drawText(label, {
        x: tableX + 10,
        y: yPos - 18,
        size: fontSize,
        font: fontBold,
      });

      // Value
      page.drawText(value, {
        x: tableX + labelWidth + 10,
        y: yPos - 18,
        size: fontSize,
        font: font,
      });

      return yPos - rowHeight;
    };

    // Company name
    y = drawRow('Payer:', receiptData.companyName, y);

    // Event name
    y = drawRow('Event:', receiptData.eventName, y);

    // Payment date
    y = drawRow('Payment Date:', slipDateFormatted, y);

    // Amount
    y = drawRow('Amount:', `${receiptData.totalAmount.toLocaleString('th-TH')} Baht`, y);

    // Event date
    y = drawRow('Event Date:', eventDateDisplay, y);

    y -= 30;

    // Certification text
    const certText = `I, ${receiptData.memberName}, ${receiptData.memberPosition},`;
    page.drawText(certText, {
      x: margin + 10,
      y: y,
      size: fontSize,
      font: font,
    });
    y -= 20;

    const certText2 = 'hereby certify that the above payment has been received in full.';
    page.drawText(certText2, {
      x: margin + 10,
      y: y,
      size: fontSize,
      font: font,
    });
    y -= 60;

    // Signature line
    const sigX = width - margin - 200;
    page.drawText('Signature: _______________________', {
      x: sigX,
      y: y,
      size: fontSize,
      font: font,
    });
    y -= 25;

    page.drawText(`(${receiptData.memberName})`, {
      x: sigX + 50,
      y: y,
      size: fontSize,
      font: font,
    });
    y -= 20;

    page.drawText('Payee', {
      x: sigX + 80,
      y: y,
      size: fontSize - 2,
      font: font,
    });

    // Footer note
    const footerText = 'This certificate is automatically generated by Agents Club system.';
    const footerWidth = font.widthOfTextAtSize(footerText, fontSize - 2);
    page.drawText(footerText, {
      x: width / 2 - footerWidth / 2,
      y: margin + 20,
      size: fontSize - 2,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });

    // Serialize PDF to bytes
    const pdfBytes = await pdfDoc.save();

    console.log('[Receipt PDF] ✅ PDF generated successfully');

    // Convert Uint8Array to Buffer for NextResponse
    const buffer = Buffer.from(pdfBytes);

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
