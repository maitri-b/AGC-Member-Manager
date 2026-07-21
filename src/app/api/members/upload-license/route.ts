// API Route for uploading member license documents
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { hasPermission } from '@/lib/permissions';
import { uploadFileToStorage } from '@/lib/firebase-storage';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permissions
    const canEdit = hasPermission(session.user.permissions || [], 'admin:users') ||
                    hasPermission(session.user.permissions || [], 'members:edit') ||
                    hasPermission(session.user.permissions || [], 'member:write');

    if (!canEdit) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const memberId = formData.get('memberId') as string;

    if (!file || !memberId) {
      return NextResponse.json({
        error: 'Missing required fields: file and memberId'
      }, { status: 400 });
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({
        error: 'Invalid file type. Only JPG, PNG, and PDF are allowed.'
      }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({
        error: 'File size exceeds 5MB limit'
      }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate file path
    const fileExt = file.name.split('.').pop() || 'jpg';
    const filePath = `members/${memberId}/license.${fileExt}`;

    // Upload to Firebase Storage
    console.log(`[Upload License] Uploading file for member: ${memberId}`);
    const fileUrl = await uploadFileToStorage(filePath, buffer, file.type);
    console.log(`[Upload License] File uploaded successfully: ${fileUrl}`);

    return NextResponse.json({
      success: true,
      url: fileUrl
    });

  } catch (error) {
    console.error('[Upload License] Error:', error);
    return NextResponse.json({
      error: 'Failed to upload file'
    }, { status: 500 });
  }
}
