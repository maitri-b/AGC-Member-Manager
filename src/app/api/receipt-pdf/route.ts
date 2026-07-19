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

// Dynamic imports for pdfmake
let pdfMake: any;

async function initPdfMake() {
  if (!pdfMake) {
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts') as any;

    pdfMake = pdfMakeModule.default;

    // Build vfs from font files
    const vfs: any = {};
    for (const key in pdfFontsModule) {
      if (key !== 'default') {
        vfs[key] = pdfFontsModule[key];
      }
    }

    pdfMake.vfs = vfs;
  }
  return pdfMake;
}

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

    // Generate HTML receipt (pdfmake hangs with Thai text)
    console.log('[Receipt PDF] Generating HTML receipt for client-side PDF conversion');
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

    // Return HTML that client can convert to PDF using browser's print-to-PDF
    const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ใบรับรองแทนใบเสร็จรับเงิน</title>
  <style>
    @page { size: A4; margin: 2cm; }
    body { font-family: 'Sarabun', 'TH Sarabun New', sans-serif; font-size: 16px; line-height: 1.6; }
    .header { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 30px; }
    .field { margin-bottom: 15px; }
    .field strong { display: inline-block; min-width: 150px; }
    .signature { margin-top: 60px; text-align: right; }
    .note { margin-top: 40px; text-align: center; font-style: italic; color: #666; }
  </style>
  <script>
    window.onload = function() {
      window.print();
    };
  </script>
</head>
<body>
  <div class="header">ใบรับรองแทนใบเสร็จรับเงิน</div>

  <div class="field"><strong>ชื่อผู้จ่ายเงิน:</strong> ${receiptData.companyName}</div>
  <div class="field"><strong>รายการจ่าย:</strong> ค่าเข้าร่วมกิจกรรม ${receiptData.eventName}</div>
  <div class="field"><strong>วันที่จ่าย:</strong> ${slipDateFormatted}</div>
  <div class="field"><strong>จำนวนเงิน:</strong> ${receiptData.totalAmount.toLocaleString('th-TH')} บาท</div>
  <div class="field"><strong>วันที่จัดงาน:</strong> ${eventStartFormatted}${eventEndFormatted ? ' - ' + eventEndFormatted : ''}</div>

  <div style="margin-top: 40px;">
    <p>ข้าพเจ้า ${receiptData.memberName} ตำแหน่ง ${receiptData.memberPosition}</p>
    <p>ขอรับรองว่า รายจ่ายข้างต้นนี้ไม่อาจเรียกเก็บใบเสร็จรับเงินจากผู้รับได้ และข้าพเจ้าได้จ่ายไปในงานของทางชมรมเอเจ้นท์คลับ โดยแท้</p>
  </div>

  <div class="signature">
    <div>(ลงชื่อ)...................................................</div>
    <div>(${receiptData.memberName})</div>
    <div>ผู้เบิกจ่าย</div>
  </div>

  <div class="note">หมายเหตุ: ใบรับรองนี้ออกโดยระบบอัตโนมัติของชมรมเอเจ้นท์คลับ</div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error generating receipt PDF:', error);
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 });
  }
}
