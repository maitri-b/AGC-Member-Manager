// API Route for Membership Application
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';

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

    // Create application document in Firestore
    // Note: Documents (license + business card) will be sent via LINE separately
    const applicationDoc = {
      applicationId,
      ...applicationData,
      lineUserId: session.user.id,
      lineDisplayName: session.user.name || '',
      lineProfilePicture: session.user.image || '',
      documentStatus: 'pending', // pending = waiting for documents via LINE
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
        documentStatus: appData.documentStatus,
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
