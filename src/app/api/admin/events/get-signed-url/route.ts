import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { generateSignedUrl } from '@/lib/firebase-storage';

/**
 * POST /api/admin/events/get-signed-url
 * Generate a signed URL for an event main image
 *
 * This is needed for LINE API which requires publicly accessible HTTPS URLs
 *
 * Request body:
 * - imageUrl: string - The storage.googleapis.com URL to convert to signed URL
 *
 * Response:
 * - 200: { signedUrl: string } - Signed URL that LINE can access
 * - 401: Unauthorized
 * - 400: Invalid request
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

    // Parse request body
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Extract file path from storage URL
    // URL format: https://storage.googleapis.com/{bucket}/{path}
    let filePath: string;
    try {
      const url = new URL(imageUrl);
      const pathParts = url.pathname.split('/');
      // Remove leading slash and bucket name
      pathParts.shift(); // Remove empty string from leading /
      pathParts.shift(); // Remove bucket name
      filePath = pathParts.join('/');
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid image URL format' },
        { status: 400 }
      );
    }

    if (!filePath) {
      return NextResponse.json(
        { error: 'Could not extract file path from URL' },
        { status: 400 }
      );
    }

    console.log(`[Get Signed URL] Generating signed URL for: ${filePath}`);

    // Generate signed URL
    const signedUrl = await generateSignedUrl(filePath);

    console.log(`[Get Signed URL] Successfully generated signed URL`);

    return NextResponse.json({
      signedUrl,
      message: 'Signed URL generated successfully'
    });

  } catch (error) {
    console.error('[Get Signed URL] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate signed URL' },
      { status: 500 }
    );
  }
}
