// Firebase Storage Service for File Uploads
import { adminStorage } from './firebase-admin';

const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

// Upload a file to Firebase Storage
export async function uploadFileToStorage(
  filePath: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const storage = adminStorage();
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filePath);

  // Upload the file
  await file.save(fileBuffer, {
    metadata: {
      contentType: mimeType,
    },
  });

  // Make the file publicly accessible
  await file.makePublic();

  // Return the public URL
  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filePath}`;
  return publicUrl;
}

// Upload application documents (license + business card)
export async function uploadApplicationDocumentsToStorage(
  applicationId: string,
  licenseFile: { buffer: Buffer; name: string; type: string },
  businessCardFile: { buffer: Buffer; name: string; type: string }
): Promise<{
  licenseFileUrl: string;
  businessCardFileUrl: string;
}> {
  console.log(`[Firebase Storage] Starting upload for application: ${applicationId}`);
  console.log(`[Firebase Storage] License file: ${licenseFile.name}, size: ${licenseFile.buffer.length}`);
  console.log(`[Firebase Storage] Business card file: ${businessCardFile.name}, size: ${businessCardFile.buffer.length}`);

  // Upload license file
  const licenseExt = licenseFile.name.split('.').pop() || 'jpg';
  const licensePath = `applications/${applicationId}/license.${licenseExt}`;
  console.log(`[Firebase Storage] Uploading license to: ${licensePath}`);
  const licenseFileUrl = await uploadFileToStorage(
    licensePath,
    licenseFile.buffer,
    licenseFile.type
  );
  console.log(`[Firebase Storage] License uploaded: ${licenseFileUrl}`);

  // Upload business card file
  const businessCardExt = businessCardFile.name.split('.').pop() || 'jpg';
  const businessCardPath = `applications/${applicationId}/business-card.${businessCardExt}`;
  console.log(`[Firebase Storage] Uploading business card to: ${businessCardPath}`);
  const businessCardFileUrl = await uploadFileToStorage(
    businessCardPath,
    businessCardFile.buffer,
    businessCardFile.type
  );
  console.log(`[Firebase Storage] Business card uploaded: ${businessCardFileUrl}`);

  return {
    licenseFileUrl,
    businessCardFileUrl,
  };
}

// Delete a file from Firebase Storage
export async function deleteFileFromStorage(filePath: string): Promise<boolean> {
  try {
    const storage = adminStorage();
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filePath);
    await file.delete();
    return true;
  } catch (error) {
    console.error('[Firebase Storage] Error deleting file:', error);
    return false;
  }
}
