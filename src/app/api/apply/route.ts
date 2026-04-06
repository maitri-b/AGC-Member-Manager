// API Route for Membership Application
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { addMember, getNextMemberId } from '@/lib/google-sheets';

const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'กรุณาล็อกอินด้วย LINE ก่อนส่งใบสมัคร' }, { status: 401 });
    }

    const formData = await request.formData();

    // Extract form fields
    const applicationData = {
      companyNameEN: formData.get('companyNameEN') as string || '',
      companyNameTH: formData.get('companyNameTH') as string || '',
      nickname: formData.get('nickname') as string || '',
      positionCompany: formData.get('positionCompany') as string || '',
      licenseNumber: formData.get('licenseNumber') as string || '',
      lineId: formData.get('lineId') as string || '',
      lineName: formData.get('lineName') as string || '',
      email: formData.get('email') as string || '',
      phone: formData.get('phone') as string || '',
      mobile: formData.get('mobile') as string || '',
      website: formData.get('website') as string || '',
      sponsor1: formData.get('sponsor1') as string || '',
      sponsor2: formData.get('sponsor2') as string || '',
    };

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

    // Get files
    const licenseFile = formData.get('licenseFile') as File | null;
    const businessCardFile = formData.get('businessCardFile') as File | null;

    if (!licenseFile || !businessCardFile) {
      return NextResponse.json({ error: 'กรุณาแนบเอกสารให้ครบถ้วน' }, { status: 400 });
    }

    // Validate files
    for (const file of [licenseFile, businessCardFile]) {
      if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
        return NextResponse.json({ error: 'รองรับเฉพาะไฟล์ .jpg, .png, .pdf เท่านั้น' }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: 'ขนาดไฟล์ต้องไม่เกิน 2MB' }, { status: 400 });
      }
    }

    const db = adminDb();
    const storage = adminStorage();
    const bucket = storage.bucket();

    // Check if user has already applied
    const existingApplication = await db.collection('membershipApplications')
      .where('lineUserId', '==', session.user.id)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();

    if (!existingApplication.empty) {
      return NextResponse.json({ error: 'คุณได้ส่งใบสมัครแล้ว กรุณารอการพิจารณา' }, { status: 400 });
    }

    // Check if license number already exists
    const existingLicense = await db.collection('membershipApplications')
      .where('licenseNumber', '==', applicationData.licenseNumber)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();

    if (!existingLicense.empty) {
      return NextResponse.json({ error: 'เลขใบอนุญาตนี้มีการสมัครแล้ว' }, { status: 400 });
    }

    // Generate application ID
    const timestamp = Date.now();
    const applicationId = `APP-${timestamp}`;

    // Upload files to Firebase Storage
    let licenseFileUrl = '';
    let businessCardFileUrl = '';

    try {
      // Upload license file
      const licenseBuffer = Buffer.from(await licenseFile.arrayBuffer());
      const licenseExt = licenseFile.name.split('.').pop() || 'jpg';
      const licensePath = `applications/${applicationId}/license.${licenseExt}`;
      const licenseFileRef = bucket.file(licensePath);

      await licenseFileRef.save(licenseBuffer, {
        metadata: {
          contentType: licenseFile.type,
        },
      });

      // Make the file publicly accessible
      await licenseFileRef.makePublic();
      licenseFileUrl = `https://storage.googleapis.com/${bucket.name}/${licensePath}`;

      // Upload business card file
      const businessCardBuffer = Buffer.from(await businessCardFile.arrayBuffer());
      const businessCardExt = businessCardFile.name.split('.').pop() || 'jpg';
      const businessCardPath = `applications/${applicationId}/business-card.${businessCardExt}`;
      const businessCardFileRef = bucket.file(businessCardPath);

      await businessCardFileRef.save(businessCardBuffer, {
        metadata: {
          contentType: businessCardFile.type,
        },
      });

      await businessCardFileRef.makePublic();
      businessCardFileUrl = `https://storage.googleapis.com/${bucket.name}/${businessCardPath}`;
    } catch (uploadError) {
      console.error('Error uploading files:', uploadError);
      return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์' }, { status: 500 });
    }

    // Create application document in Firestore
    const applicationDoc = {
      applicationId,
      ...applicationData,
      lineUserId: session.user.id,
      lineDisplayName: session.user.name || '',
      lineProfilePicture: session.user.image || '',
      licenseFileUrl,
      businessCardFileUrl,
      status: 'pending', // pending, approved, rejected
      lineGroupStatus: 'รอนำเข้ากลุ่ม', // Default status
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('membershipApplications').doc(applicationId).set(applicationDoc);

    console.log(`New membership application: ${applicationId} from ${applicationData.nickname} (${applicationData.companyNameEN})`);

    return NextResponse.json({
      success: true,
      applicationId,
      message: 'ส่งใบสมัครเรียบร้อยแล้ว',
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
        companyNameEN: appData.companyNameEN,
        nickname: appData.nickname,
        createdAt: appData.createdAt?.toDate?.() || appData.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching application:', error);
    return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 });
  }
}
