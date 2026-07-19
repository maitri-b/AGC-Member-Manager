// API Route - Generate Receipt Certificate PDF
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { generateReceiptPDF, ReceiptData } from '@/lib/receipt-pdf';

// Dynamic imports for pdfmake to avoid TypeScript issues
let pdfMake: any;
let pdfFonts: any;

// Initialize pdfMake lazily
async function getPdfMake() {
  if (!pdfMake) {
    pdfMake = (await import('pdfmake/build/pdfmake')).default;
    pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
    pdfMake.vfs = pdfFonts.pdfMake.vfs;
  }
  return pdfMake;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId } = params;

    const db = adminDb();

    // Get event data
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const event = { eventId: eventDoc.id, ...eventDoc.data() } as any;

    // Get user's registration for this event
    const registrationsSnapshot = await db
      .collection('events')
      .doc(eventId)
      .collection('registrations')
      .where('userId', '==', session.user.id)
      .limit(1)
      .get();

    if (registrationsSnapshot.empty) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    const registration = registrationsSnapshot.docs[0].data();

    // Check payment status - must be "ชำระครบแล้ว"
    if (registration.paymentStatus !== 'ชำระครบแล้ว') {
      return NextResponse.json(
        { error: 'Receipt certificate is only available for fully paid registrations' },
        { status: 403 }
      );
    }

    // Get member data for company name and position
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

    // Get member position (default to "กรรมการผู้จัดการ" if not specified)
    const defaultMemberPosition = userData?.position || 'กรรมการผู้จัดการ';
    const defaultCompanyName = registration.companyName || userData?.companyNameTH || '';
    const defaultMemberName = registration.contactName || userData?.name || userData?.lineDisplayName || '';

    // Get custom values from query parameters (if provided)
    const { searchParams } = new URL(request.url);
    const customCompanyName = searchParams.get('companyName');
    const customMemberName = searchParams.get('memberName');
    const customMemberPosition = searchParams.get('memberPosition');

    // Prepare receipt data (use custom values if provided, otherwise use defaults)
    const receiptData: ReceiptData = {
      companyName: customCompanyName || defaultCompanyName,
      eventName: event.eventName,
      slipUploadDate: slipUploadDate,
      totalAmount: registration.totalAmount || 0,
      memberName: customMemberName || defaultMemberName,
      memberPosition: customMemberPosition || defaultMemberPosition,
      eventStartDate: event.eventDate,
      eventEndDate: event.eventEndDate,
    };

    // Generate PDF document definition
    const docDefinition = generateReceiptPDF(receiptData);

    // Initialize pdfMake
    const pdf = await getPdfMake();

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
              'Content-Disposition': `attachment; filename="receipt-${eventId}-${session.user.id}.pdf"`,
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
