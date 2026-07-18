// API Route for Profile Change Requests
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb, adminStorage } from '@/lib/firebase-admin';
import { getMemberById } from '@/lib/google-sheets';

// Get user's change requests
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestsSnapshot = await adminDb()
      .collection('profileChangeRequests')
      .where('userId', '==', session.user.id)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const requests = requestsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt,
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Error fetching change requests:', error);
    return NextResponse.json({ error: 'Failed to fetch change requests' }, { status: 500 });
  }
}

// Create a new change request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!session.user.memberId) {
      return NextResponse.json({ error: 'No member ID linked to this account' }, { status: 400 });
    }

    const body = await request.json();
    const { changes, reason, licenseDocumentData, licenseDocumentName, licenseDocumentType } = body;

    // ✅ NEW: Allow request with either field changes or license document upload
    if ((!changes || Object.keys(changes).length === 0) && !licenseDocumentData) {
      return NextResponse.json({ error: 'No changes or document upload provided' }, { status: 400 });
    }

    // Get current member data for comparison
    const currentMember = await getMemberById(session.user.memberId);
    if (!currentMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Check for pending requests
    const pendingRequests = await adminDb()
      .collection('profileChangeRequests')
      .where('userId', '==', session.user.id)
      .where('status', '==', 'pending')
      .get();

    if (!pendingRequests.empty) {
      return NextResponse.json({
        error: 'You already have a pending change request. Please wait for it to be processed.'
      }, { status: 400 });
    }

    // Build change details with old and new values
    const changeDetails: Record<string, { oldValue: string; newValue: string }> = {};
    const allowedFields = ['fullNameTH', 'nickname', 'companyNameTH', 'companyNameEN', 'positionCompany', 'licenseNumber', 'lineId'];

    if (changes) {
      for (const field of Object.keys(changes)) {
        if (allowedFields.includes(field) && changes[field] !== currentMember[field as keyof typeof currentMember]) {
          changeDetails[field] = {
            oldValue: String(currentMember[field as keyof typeof currentMember] || ''),
            newValue: String(changes[field] || ''),
          };
        }
      }
    }

    // ✅ NEW: Upload license document if provided
    let newLicenseDocumentUrl = null;
    if (licenseDocumentData && licenseDocumentName) {
      const storage = adminStorage();
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

      if (!bucketName) {
        console.error('[Change Request] FIREBASE_STORAGE_BUCKET is not configured');
        return NextResponse.json(
          { error: 'Storage configuration error. Please contact administrator.' },
          { status: 500 }
        );
      }

      console.log('[Change Request] Uploading new license document to storage bucket:', bucketName);
      const bucket = storage.bucket(bucketName);

      try {
        const timestamp = Date.now();
        const fileExtension = licenseDocumentName.split('.').pop();
        const storagePath = `profile-change-requests/${session.user.memberId}/${timestamp}-license.${fileExtension}`;
        const file = bucket.file(storagePath);

        const fileBuffer = Buffer.from(licenseDocumentData, 'base64');
        await file.save(fileBuffer, {
          metadata: {
            contentType: licenseDocumentType || 'application/octet-stream',
            metadata: {
              uploadedBy: session.user.id,
              memberId: session.user.memberId,
              documentType: 'license',
            },
          },
        });

        newLicenseDocumentUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        console.log('[Change Request] License document uploaded:', newLicenseDocumentUrl);
      } catch (uploadError) {
        console.error('[Change Request] File upload error:', uploadError);
        return NextResponse.json(
          { error: 'ไม่สามารถอัพโหลดไฟล์ได้ กรุณาลองใหม่อีกครั้ง' },
          { status: 500 }
        );
      }
    }

    // ✅ NEW: Require at least one change (field change or document upload)
    if (Object.keys(changeDetails).length === 0 && !newLicenseDocumentUrl) {
      return NextResponse.json({ error: 'No valid changes or document upload detected' }, { status: 400 });
    }

    // Create the change request
    const changeRequest: Record<string, unknown> = {
      userId: session.user.id,
      memberId: session.user.memberId,
      lineDisplayName: session.user.name || '',
      lineImage: session.user.image || '',
      changes: changeDetails,
      reason: reason || '',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // ✅ NEW: Include license document URL if uploaded
    if (newLicenseDocumentUrl) {
      changeRequest.newLicenseDocumentUrl = newLicenseDocumentUrl;
    }

    const docRef = await adminDb().collection('profileChangeRequests').add(changeRequest);

    return NextResponse.json({
      success: true,
      requestId: docRef.id,
      message: 'Change request submitted successfully'
    });
  } catch (error) {
    console.error('Error creating change request:', error);
    return NextResponse.json({ error: 'Failed to create change request' }, { status: 500 });
  }
}
