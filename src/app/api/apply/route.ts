// API Route for Membership Application
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { getAllMembers } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'กรุณาล็อกอินด้วย LINE ก่อนส่งใบสมัคร' }, { status: 401 });
    }

    const body = await request.json();

    // Extract form fields
    const applicationData = {
      companyNameEN: body.companyNameEN || '',
      companyNameTH: body.companyNameTH || '',
      nickname: body.nickname || '',
      positionCompany: body.positionCompany || '',
      licenseNumber: body.licenseNumber || '',
      lineId: body.lineId || '',
      lineName: body.lineName || '',
      email: body.email || '',
      phone: body.phone || '',
      mobile: body.mobile || '',
      website: body.website || '',
      sponsor1: body.sponsor1 || '',
      sponsor2: body.sponsor2 || '',
    };

    // ✅ NEW: Extract file upload data
    const {
      licenseDocumentData,
      licenseDocumentName,
      licenseDocumentType,
      businessCardData,
      businessCardName,
      businessCardType,
    } = body;

    // Validate required fields
    const requiredFields = [
      'companyNameEN',
      'companyNameTH',
      'nickname',
      'positionCompany',
      'licenseNumber',
      'lineId',
      'lineName',
      'email',
      'mobile',
      'sponsor1',
      'sponsor2',
    ];

    for (const field of requiredFields) {
      if (!applicationData[field as keyof typeof applicationData]) {
        return NextResponse.json({ error: `กรุณากรอกข้อมูล ${field}` }, { status: 400 });
      }
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicationData.email)) {
      return NextResponse.json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' }, { status: 400 });
    }

    // ✅ NEW: Validate file uploads
    if (!licenseDocumentData || !licenseDocumentName) {
      return NextResponse.json({ error: 'กรุณาอัพโหลดใบอนุญาตธุรกิจนำเที่ยว' }, { status: 400 });
    }

    if (!businessCardData || !businessCardName) {
      return NextResponse.json({ error: 'กรุณาอัพโหลดนามบัตร' }, { status: 400 });
    }

    const db = adminDb();

    // Check if user has already applied
    console.log('[Apply API] === DUPLICATE CHECK START ===');
    console.log('[Apply API] Session user ID:', session.user.id);
    console.log('[Apply API] Session user object:', JSON.stringify(session.user, null, 2));

    const existingApplication = await db.collection('membershipApplications')
      .where('lineUserId', '==', session.user.id)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();

    console.log('[Apply API] Duplicate check query completed');
    console.log('[Apply API] Query empty?', existingApplication.empty);
    console.log('[Apply API] Number of docs found:', existingApplication.size);

    if (!existingApplication.empty) {
      const existingDocs = existingApplication.docs.map(doc => ({
        id: doc.id,
        lineUserId: doc.data().lineUserId,
        status: doc.data().status,
        nickname: doc.data().nickname,
        createdAt: doc.data().createdAt,
      }));
      console.log('[Apply API] ❌ Found existing application(s):', JSON.stringify(existingDocs, null, 2));
      return NextResponse.json({ error: 'คุณได้ส่งใบสมัครแล้ว กรุณารอการพิจารณา' }, { status: 400 });
    }

    console.log('[Apply API] ✅ No duplicate found, proceeding with application');

    // Check if license number already exists in applications
    console.log('[Apply API] === LICENSE NUMBER CHECK START ===');
    console.log('[Apply API] License number to check:', applicationData.licenseNumber);

    const existingLicense = await db.collection('membershipApplications')
      .where('licenseNumber', '==', applicationData.licenseNumber)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();

    console.log('[Apply API] License check query completed');
    console.log('[Apply API] Query empty?', existingLicense.empty);
    console.log('[Apply API] Number of docs found:', existingLicense.size);

    if (!existingLicense.empty) {
      const existingLicenseDocs = existingLicense.docs.map(doc => ({
        id: doc.id,
        licenseNumber: doc.data().licenseNumber,
        nickname: doc.data().nickname,
        status: doc.data().status,
      }));
      console.log('[Apply API] ❌ Found existing license:', JSON.stringify(existingLicenseDocs, null, 2));
      return NextResponse.json({
        error: 'มีข้อมูลเลขที่ใบอนุญาตนี้ในระบบการสมัครสมาชิกแล้ว ไม่สามารถลงทะเบียนซ้ำได้ กรุณาติดต่อทีมนายทะเบียน'
      }, { status: 400 });
    }

    console.log('[Apply API] ✅ License number check passed');

    // Check if license number already exists in member database
    try {
      const allMembers = await getAllMembers();
      const existingMember = allMembers.find(member => member.licenseNumber === applicationData.licenseNumber);

      if (existingMember) {
        return NextResponse.json({
          error: 'มีข้อมูลเลขที่ใบอนุญาตนี้ในฐานข้อมูลสมาชิกแล้ว ไม่สามารถลงทะเบียนซ้ำได้ กรุณาติดต่อทีมนายทะเบียน'
        }, { status: 400 });
      }
    } catch (sheetsError) {
      console.error('Error checking member database:', sheetsError);
      // Continue even if sheets check fails
    }

    // Generate application ID
    const timestamp = Date.now();
    const applicationId = `APP-${timestamp}`;

    // ✅ NEW: Upload files to Cloud Storage
    const storage = adminStorage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

    if (!bucketName) {
      console.error('[Apply] FIREBASE_STORAGE_BUCKET is not configured');
      return NextResponse.json(
        { error: 'Storage configuration error. Please contact administrator.' },
        { status: 500 }
      );
    }

    console.log('[Apply] Uploading documents to storage bucket:', bucketName);
    const bucket = storage.bucket(bucketName);

    let licenseDocumentUrl = '';
    let businessCardUrl = '';

    try {
      // Upload license document
      const licenseExtension = licenseDocumentName.split('.').pop();
      const licensePath = `apply-applications/${applicationId}/license.${licenseExtension}`;
      const licenseFile = bucket.file(licensePath);

      const licenseBuffer = Buffer.from(licenseDocumentData, 'base64');
      await licenseFile.save(licenseBuffer, {
        metadata: {
          contentType: licenseDocumentType || 'application/octet-stream',
          metadata: {
            uploadedBy: session.user.id,
            applicationId,
            documentType: 'license',
          },
        },
      });

      licenseDocumentUrl = `https://storage.googleapis.com/${bucket.name}/${licensePath}`;
      console.log('[Apply] License document uploaded:', licenseDocumentUrl);

      // Upload business card
      const businessCardExtension = businessCardName.split('.').pop();
      const businessCardPath = `apply-applications/${applicationId}/business-card.${businessCardExtension}`;
      const businessCardFile = bucket.file(businessCardPath);

      const businessCardBuffer = Buffer.from(businessCardData, 'base64');
      await businessCardFile.save(businessCardBuffer, {
        metadata: {
          contentType: businessCardType || 'application/octet-stream',
          metadata: {
            uploadedBy: session.user.id,
            applicationId,
            documentType: 'businessCard',
          },
        },
      });

      businessCardUrl = `https://storage.googleapis.com/${bucket.name}/${businessCardPath}`;
      console.log('[Apply] Business card uploaded:', businessCardUrl);
    } catch (uploadError) {
      console.error('[Apply] File upload error:', uploadError);
      return NextResponse.json(
        { error: 'ไม่สามารถอัพโหลดไฟล์ได้ กรุณาลองใหม่อีกครั้ง' },
        { status: 500 }
      );
    }

    // Create application document in Firestore
    // ✅ NEW: Include document URLs
    const applicationDoc = {
      applicationId,
      ...applicationData,
      lineUserId: session.user.id,
      lineDisplayName: session.user.name || '',
      lineProfilePicture: session.user.image || '',
      licenseDocumentUrl, // ✅ NEW: License document URL
      businessCardUrl, // ✅ NEW: Business card URL
      documentStatus: 'uploaded', // ✅ CHANGED: Documents are now uploaded directly
      status: 'pending', // pending, approved, rejected
      lineGroupStatus: 'รอนำเข้ากลุ่ม', // Default status
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('membershipApplications').doc(applicationId).set(applicationDoc);

    console.log(`New membership application: ${applicationId} from ${applicationData.nickname} (${applicationData.companyNameEN})`);
    console.log(`Documents uploaded: license=${licenseDocumentUrl}, businessCard=${businessCardUrl}`);

    return NextResponse.json({
      success: true,
      applicationId,
      message: 'ส่งใบสมัครเรียบร้อยแล้ว',
      licenseDocumentUrl,
      businessCardUrl,
    });
  } catch (error) {
    console.error('Error processing application:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการส่งใบสมัคร' }, { status: 500 });
  }
}

// GET - Check application status
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = adminDb();

    console.log('[Apply API GET] Checking for existing application, userId:', session.user.id);

    // ✅ FIXED: Fetch with where only, then sort in JavaScript (per AGENTS.md rules)
    const applicationsSnapshot = await db.collection('membershipApplications')
      .where('lineUserId', '==', session.user.id)
      .limit(10) // Get more to sort
      .get();

    console.log('[Apply API GET] Found', applicationsSnapshot.size, 'application(s)');

    if (applicationsSnapshot.empty) {
      console.log('[Apply API GET] No applications found');
      return NextResponse.json({ hasApplication: false });
    }

    // Map to array with date conversion
    let applications = applicationsSnapshot.docs.map(doc => ({
      id: doc.id,
      data: doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
    }));

    // Sort by createdAt descending in JavaScript
    applications.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt || 0).getTime();
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt || 0).getTime();
      return dateB - dateA; // descending
    });

    // Get the most recent application
    const latestApp = applications[0];
    const appData = latestApp.data;

    console.log('[Apply API GET] Latest application:', latestApp.id, 'status:', appData.status);

    return NextResponse.json({
      hasApplication: true,
      application: {
        id: latestApp.id,
        status: appData.status,
        documentStatus: appData.documentStatus,
        companyNameEN: appData.companyNameEN,
        nickname: appData.nickname,
        createdAt: latestApp.createdAt,
        licenseDocumentUrl: appData.licenseDocumentUrl,
        businessCardUrl: appData.businessCardUrl,
      },
    });
  } catch (error) {
    console.error('Error fetching application:', error);
    return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 });
  }
}
