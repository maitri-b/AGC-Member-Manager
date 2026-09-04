import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { uploadFileToStorage } from '@/lib/firebase-storage';

/**
 * POST /api/admin/events/upload-main-image
 * Upload main event image to Firebase Storage
 *
 * Required permissions: admin:access or events:manage-assigned
 *
 * Request body (multipart/form-data):
 * - eventId: string - Event ID for organizing storage path
 * - image: File - Image file to upload (JPEG, PNG, WebP)
 *
 * Response:
 * - 200: { imageUrl: string } - URL of uploaded image
 * - 401: Unauthorized
 * - 400: Invalid request (missing fields, invalid file type)
 * - 500: Server error
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please login' },
        { status: 401 }
      );
    }

    // Permission check - require admin:access or events:manage-assigned
    const userPermissions = (session.user as any).permissions || [];
    const hasEventPermission = userPermissions.includes('admin:access') ||
                               userPermissions.includes('events:manage-assigned');

    if (!hasEventPermission) {
      return NextResponse.json(
        { error: 'Forbidden - Insufficient permissions' },
        { status: 403 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const eventId = formData.get('eventId') as string;
    const imageFile = formData.get('image') as File;

    // Validation
    if (!eventId) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    if (!imageFile) {
      return NextResponse.json(
        { error: 'Image file is required' },
        { status: 400 }
      );
    }

    // Validate file type (only allow images)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (imageFile.size > maxSize) {
      return NextResponse.json(
        { error: 'File size too large. Maximum size is 5MB.' },
        { status: 400 }
      );
    }

    console.log(`[Upload Main Image] Event ID: ${eventId}`);
    console.log(`[Upload Main Image] File name: ${imageFile.name}`);
    console.log(`[Upload Main Image] File type: ${imageFile.type}`);
    console.log(`[Upload Main Image] File size: ${imageFile.size} bytes`);

    // Convert File to Buffer
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate storage path: events/{eventId}/main-image.{ext}
    const fileExtension = imageFile.name.split('.').pop() || 'jpg';
    const storagePath = `events/${eventId}/main-image.${fileExtension}`;

    // Upload to Firebase Storage
    const imageUrl = await uploadFileToStorage(
      storagePath,
      buffer,
      imageFile.type
    );

    console.log(`[Upload Main Image] Successfully uploaded to: ${imageUrl}`);

    return NextResponse.json({
      imageUrl,
      message: 'Image uploaded successfully'
    });

  } catch (error) {
    console.error('[Upload Main Image] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload image' },
      { status: 500 }
    );
  }
}
