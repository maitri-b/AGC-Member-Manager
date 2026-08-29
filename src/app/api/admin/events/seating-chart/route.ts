// API Route: Upload Seating Chart for Party Table
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminStorage } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const eventId = formData.get('eventId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Image size must not exceed 10MB' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate filename with event ID and timestamp
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const filename = `seating-chart-${eventId}-${timestamp}.${fileExtension}`;
    const storagePath = `images/download/${filename}`;

    // Upload to Firebase Storage (download bucket)
    const bucket = adminStorage().bucket();
    const fileRef = bucket.file(storagePath);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          uploadedBy: session.user.id,
          uploadedByName: session.user.name || 'Unknown',
          uploadedAt: new Date().toISOString(),
          originalName: file.name,
          eventId: eventId,
          purpose: 'seating-chart',
        },
      },
    });

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: storagePath,
      filename: filename,
    });

  } catch (error) {
    console.error('Error uploading seating chart:', error);
    return NextResponse.json(
      { error: 'Failed to upload seating chart', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE endpoint to remove seating chart
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // Delete from Firebase Storage
    const bucket = adminStorage().bucket();
    const fileRef = bucket.file(path);

    await fileRef.delete();

    return NextResponse.json({
      success: true,
      message: 'Seating chart deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting seating chart:', error);
    return NextResponse.json(
      { error: 'Failed to delete seating chart', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
