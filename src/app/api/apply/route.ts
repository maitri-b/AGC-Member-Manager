// API Route for Membership Application
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { getAllMembers } from '@/lib/google-sheets';
import { sendMembershipApplicationNotification } from '@/lib/notification-helper';

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
      applyOnBehalfOf, // Admin can apply on behalf of another user
    } = body;

    // Determine which user's LINE data to use
    // If admin is applying on behalf of someone, use that user's LINE data
    const targetUser = applyOnBehalfOf || {
      lineUserId: session.user.id,
      lineDisplayName: session.user.name || '',
      lineProfilePicture: session.user.image || '',
    };

    console.log('[Apply API] Target user:', targetUser);
    if (applyOnBehalfOf) {
      console.log('[Apply API] Admin', session.user.name, 'is applying on behalf of', targetUser.lineDisplayName);
    }

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

    // ✅ Check if user is Admin/Committee/Event Team - exempt from duplicate check
    const userRole = session.user.role || 'member';
    const exemptRoles = ['admin', 'committee', 'event_team'];
    const isExempt = exemptRoles.includes(userRole);

    console.log('[Apply API] User role:', userRole, '| Exempt from duplicate check:', isExempt);

    // Check if target user has already applied (skip for exempt roles when applying for themselves)
    const checkDuplicateFor = applyOnBehalfOf ? targetUser.lineUserId : session.user.id;
    const skipDuplicateCheck = !applyOnBehalfOf && isExempt;

    if (!skipDuplicateCheck) {
      console.log('[Apply API] === DUPLICATE CHECK START ===');
      console.log('[Apply API] Checking duplicate for user ID:', checkDuplicateFor);

      const existingApplication = await db.collection('membershipApplications')
        .where('lineUserId', '==', checkDuplicateFor)
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
    } else {
      console.log('[Apply API] ✅ User is', userRole, '- skipping duplicate check');
    }

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
      console.log('[Apply API] === MEMBER DATABASE CHECK START ===');
      const allMembers = await getAllMembers();
      console.log('[Apply API] Fetched', allMembers.length, 'members from Google Sheets');

      const existingMember = allMembers.find(member => member.licenseNumber === applicationData.licenseNumber);

      if (existingMember) {
        console.log('[Apply API] ❌ Found existing member with same license:', existingMember.memberId, existingMember.fullNameTH);
        return NextResponse.json({
          error: 'มีข้อมูลเลขที่ใบอนุญาตนี้ในฐานข้อมูลสมาชิกแล้ว ไม่สามารถลงทะเบียนซ้ำได้ กรุณาติดต่อทีมนายทะเบียน'
        }, { status: 400 });
      }

      console.log('[Apply API] ✅ No existing member with this license number');
    } catch (sheetsError) {
      console.error('[Apply API] ⚠️ Error checking member database (continuing anyway):', sheetsError);
      // Continue even if sheets check fails - this is not critical for application submission
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
      console.log('[Apply] === FILE UPLOAD START ===');

      // Upload license document
      console.log('[Apply] Uploading license document...');
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
      console.log('[Apply] ✅ License document uploaded:', licenseDocumentUrl);

      // Upload business card
      console.log('[Apply] Uploading business card...');
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
      console.log('[Apply] ✅ Business card uploaded:', businessCardUrl);
    } catch (uploadError) {
      console.error('[Apply] ❌ File upload error:', uploadError);
      const errorMessage = uploadError instanceof Error ? uploadError.message : 'Unknown error';
      console.error('[Apply] Error details:', errorMessage);
      return NextResponse.json(
        { error: 'ไม่สามารถอัพโหลดไฟล์ได้ กรุณาลองใหม่อีกครั้ง' },
        { status: 500 }
      );
    }

    // Create application document in Firestore
    // ✅ NEW: Include document URLs and target user data
    const applicationDoc = {
      applicationId,
      ...applicationData,
      lineUserId: targetUser.lineUserId,
      lineDisplayName: targetUser.lineDisplayName,
      lineProfilePicture: targetUser.lineProfilePicture || '',
      licenseDocumentUrl, // ✅ NEW: License document URL
      businessCardUrl, // ✅ NEW: Business card URL
      documentStatus: 'uploaded', // ✅ CHANGED: Documents are now uploaded directly
      status: 'pending', // pending, approved, rejected
      lineGroupStatus: 'รอนำเข้ากลุ่ม', // Default status
      createdAt: new Date(),
      updatedAt: new Date(),
      // ✅ Track if this was submitted by admin on behalf of another user
      submittedBy: applyOnBehalfOf ? {
        adminId: session.user.id,
        adminName: session.user.name || '',
        submittedAt: new Date(),
      } : null,
    };

    // Save to Firestore
    console.log('[Apply] === SAVING TO FIRESTORE ===');
    await db.collection('membershipApplications').doc(applicationId).set(applicationDoc);
    console.log('[Apply] ✅ Application saved to Firestore:', applicationId);

    console.log(`[Apply] New membership application: ${applicationId} from ${applicationData.nickname} (${applicationData.companyNameEN})`);
    console.log(`[Apply] Documents: license=${licenseDocumentUrl}, businessCard=${businessCardUrl}`);

    // Send LINE notification based on notification settings
    console.log('[Apply] === SENDING NOTIFICATION ===');
    try {
      await sendMembershipApplicationNotification(applicationData);
      console.log('[Apply] ✅ Notification sent successfully');
    } catch (notificationError) {
      // Log but don't fail the request if notification fails
      console.error('[Apply] ⚠️ Notification failed (non-critical):', notificationError);
    }

    console.log('[Apply] === APPLICATION COMPLETE ===');
    return NextResponse.json({
      success: true,
      applicationId,
      message: 'ส่งใบสมัครเรียบร้อยแล้ว',
      licenseDocumentUrl,
      businessCardUrl,
    });
  } catch (error) {
    console.error('[Apply] ❌ FATAL ERROR:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[Apply] Error message:', errorMessage);
    console.error('[Apply] Error stack:', errorStack);
    return NextResponse.json({
      error: 'เกิดข้อผิดพลาดในการส่งใบสมัคร กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ'
    }, { status: 500 });
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

    // ✅ Check if user is Admin/Committee/Event Team - always allow them to see the form
    const userRole = session.user.role || 'member';
    const exemptRoles = ['admin', 'committee', 'event_team'];
    const isExempt = exemptRoles.includes(userRole);

    console.log('[Apply API GET] Checking for existing application, userId:', session.user.id, '| Role:', userRole);

    // If user is exempt, always return no application (so they can fill the form)
    if (isExempt) {
      console.log('[Apply API GET] User is', userRole, '- allowing form access');
      return NextResponse.json({ hasApplication: false });
    }

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
