// API Route: Upload Image for LINE Messages (using Imgur API)
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID || ''; // Get from Imgur API

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Check if user is admin
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (max 10MB for LINE, Imgur allows up to 10MB for free tier)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Image size must not exceed 10MB' }, { status: 400 });
    }

    // Convert file to base64 for Imgur API
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');

    // Upload to Imgur
    const imgurFormData = new FormData();
    imgurFormData.append('image', base64Image);
    imgurFormData.append('type', 'base64');
    imgurFormData.append('name', file.name);
    imgurFormData.append('title', `LINE Image ${new Date().toISOString()}`);

    const imgurResponse = await fetch('https://api.imgur.com/3/image', {
      method: 'POST',
      headers: {
        'Authorization': `Client-ID ${IMGUR_CLIENT_ID}`,
      },
      body: imgurFormData,
    });

    if (!imgurResponse.ok) {
      const errorData = await imgurResponse.json();
      console.error('Imgur API Error:', errorData);
      return NextResponse.json(
        { error: 'Failed to upload image to Imgur', details: errorData },
        { status: 500 }
      );
    }

    const imgurData = await imgurResponse.json();
    const imageUrl = imgurData.data.link; // Get direct image URL

    return NextResponse.json({
      success: true,
      url: imageUrl,
      deleteHash: imgurData.data.deletehash, // Can be used to delete later
    });

  } catch (error) {
    console.error('Error uploading image:', error);
    return NextResponse.json(
      { error: 'Failed to upload image', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
