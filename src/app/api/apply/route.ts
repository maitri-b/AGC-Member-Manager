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
    const existingApplication = await db.collection('membershipApplications')
      .where('lineUserId', '==', session.user.id)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();

    if (!existingApplication.empty) {
      return NextResponse.json({ error: 'คุณได้ส่งใบสมัครแล้ว กรุณารอการพิจารณา' }, { status: 400 });
    }

    // Check if license number already exists in applications
    const existingLicense = await db.collection('membershipApplications')
      .where('licenseNumber', '==', applicationData.licenseNumber)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();

    if (!existingLicense.empty) {
      return NextResponse.json({
        error: 'มีข้อมูลเลขที่ใบอนุญาตนี้ในระบบการสมัครสมาชิกแล้ว ไม่สามารถลงทะเบียนซ้ำได้ กรุณาติดต่อทีมนายทะเบียน'
      }, { status: 400 });
    }

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

    const applications = await db.collection('membershipApplications')
      .where('lineUserId', '==', session.user.id)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (applications.empty) {
      return NextResponse.json({ hasApplication: false });
    }

    const appDoc = applications.docs[0];
    const appData = appDoc.data();

    return NextResponse.json({
      hasApplication: true,
      application: {
        id: appDoc.id,
        status: appData.status,
        documentStatus: appData.documentStatus,
        companyNameEN: appData.companyNameEN,
        nickname: appData.nickname,
        createdAt: appData.createdAt?.toDate?.() || appData.createdAt,
        licenseDocumentUrl: appData.licenseDocumentUrl, // ✅ NEW
        businessCardUrl: appData.businessCardUrl, // ✅ NEW
      },
    });
  } catch (error) {
    console.error('Error fetching application:', error);
    return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 });
  }
}
