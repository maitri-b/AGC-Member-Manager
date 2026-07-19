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
let pdfFonts: any;

async function initPdfMake() {
  if (!pdfMake) {
    pdfMake = (await import('pdfmake/build/pdfmake')).default;
    pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
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
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const event = { eventId: eventDoc.id, ...eventDoc.data() } as any;

    // Get user's registration for this event
    console.log('[Receipt PDF] Searching registration with:', {
      eventId,
      userId: session.user.id,
      memberId: session.user.memberId,
      lineUserId: session.user.lineUserId,
    });

    // Try userId first (most common)
    let registrationsSnapshot = await db
      .collection('events')
      .doc(eventId)
      .collection('registrations')
      .where('userId', '==', session.user.id)
      .limit(1)
      .get();

    console.log('[Receipt PDF] Query (userId) result:', registrationsSnapshot.empty ? 'empty' : 'found');

    // If not found and user has memberId, try that
    if (registrationsSnapshot.empty && session.user.memberId) {
      console.log('[Receipt PDF] Trying memberId query...');
      registrationsSnapshot = await db
        .collection('events')
        .doc(eventId)
        .collection('registrations')
        .where('memberId', '==', session.user.memberId)
        .limit(1)
        .get();

      console.log('[Receipt PDF] Query (memberId) result:', registrationsSnapshot.empty ? 'empty' : 'found');
    }

    if (registrationsSnapshot.empty) {
      console.log('[Receipt PDF] ❌ Registration not found');
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

    // Determine slip upload date (use most recent payment date)
    let slipUploadDate = registration.depositPaidDate || registration.fullPaymentPaidDate || registration.registrationDate;

    // If remaining payment was made, use that date instead
    if (registration.remainingPaidDate) {
      slipUploadDate = registration.remainingPaidDate;
    }

    // Format slip upload date to ISO string if it's a Firestore timestamp
    if (slipUploadDate && typeof slipUploadDate === 'object' && 'toDate' in slipUploadDate) {
      slipUploadDate = slipUploadDate.toDate().toISOString();
    }

    // Get default values
    const defaultMemberPosition = userData?.position || 'กรรมการผู้จัดการ';
    const defaultCompanyName = registration.companyName || userData?.companyNameTH || '';
    // Use contactName (full name) instead of LINE display name
    const defaultMemberName = registration.contactName || userData?.name || '';

    // Prepare receipt data (use custom values from request if provided, otherwise use defaults)
    const receiptData: ReceiptData = {
      companyName: companyName || defaultCompanyName,
      eventName: event.eventName,
      slipUploadDate: slipUploadDate,
      totalAmount: registration.totalAmount || 0,
      memberName: memberName || defaultMemberName,
      memberPosition: memberPosition || defaultMemberPosition,
      eventStartDate: event.eventDate,
      eventEndDate: event.eventEndDate,
    };

    // Generate PDF document definition
    const docDefinition = generateReceiptPDF(receiptData);

    console.log('[Receipt PDF] Creating PDF with pdfMake');

    // Initialize pdfMake
    const pdf = await initPdfMake();

    // Create PDF
    const pdfDocGenerator = pdf.createPdf(docDefinition);

    // Generate PDF buffer
    return new Promise<NextResponse>((resolve, reject) => {
      pdfDocGenerator.getBuffer((buffer: Buffer) => {
        try {
          // Return PDF as downloadable file
          const response = new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="receipt-certificate.pdf"`,
            },
          });
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('Error generating receipt PDF:', error);
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 });
  }
}
