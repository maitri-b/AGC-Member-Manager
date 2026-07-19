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
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts') as any;

    pdfMake = pdfMakeModule.default;

    // The vfs_fonts module exports the font files directly
    // We need to use the whole module as vfs (excluding 'default' key)
    const vfs: any = {};
    for (const key in pdfFontsModule) {
      if (key !== 'default') {
        vfs[key] = pdfFontsModule[key];
      }
    }

    pdfMake.vfs = vfs;
    console.log('[Receipt PDF] Loaded vfs with fonts:', Object.keys(vfs));
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
