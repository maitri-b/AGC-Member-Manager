// Google Drive Service for File Storage
import { google } from 'googleapis';
import { Readable } from 'stream';

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// Initialize Google Drive API
function getGoogleDriveClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  return google.drive({ version: 'v3', auth });
}

// Create a subfolder inside the main folder
export async function createSubfolder(folderName: string, parentFolderId?: string): Promise<string> {
  const drive = getGoogleDriveClient();

  const response = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId || FOLDER_ID || ''],
    },
    fields: 'id',
  });

  return response.data.id || '';
}

// Upload a file to Google Drive
export async function uploadFile(
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
  folderId?: string
): Promise<{ fileId: string; webViewLink: string; webContentLink: string }> {
  const drive = getGoogleDriveClient();

  console.log(`Uploading file: ${fileName}, size: ${fileBuffer.length}, mimeType: ${mimeType}, folderId: ${folderId || FOLDER_ID}`);

  // Create the file
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId || FOLDER_ID || ''],
    },
    media: {
      mimeType,
      body: Readable.from(fileBuffer),
    },
    fields: 'id, webViewLink, webContentLink',
  });

  console.log(`File uploaded successfully: ${response.data.id}`);

  const fileId = response.data.id || '';

  // Make the file publicly accessible (anyone with the link can view)
  // This may fail if sharing is restricted, but we'll continue anyway
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (permError) {
    console.warn('Could not set public permission, file will be accessible only to shared users:', permError);
  }

  // Return direct link format that works for shared files
  return {
    fileId,
    webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
    webContentLink: `https://drive.google.com/uc?id=${fileId}&export=download`,
  };
}

// Upload application documents (license + business card)
export async function uploadApplicationDocuments(
  applicationId: string,
  licenseFile: { buffer: Buffer; name: string; type: string },
  businessCardFile: { buffer: Buffer; name: string; type: string }
): Promise<{
  folderId: string;
  licenseFileUrl: string;
  businessCardFileUrl: string;
}> {
  console.log(`Starting upload for application: ${applicationId}`);
  console.log(`License file: ${licenseFile.name}, size: ${licenseFile.buffer.length}`);
  console.log(`Business card file: ${businessCardFile.name}, size: ${businessCardFile.buffer.length}`);

  // Create a subfolder for this application
  const folderId = await createSubfolder(`Application-${applicationId}`);
  console.log(`Created subfolder: ${folderId}`);

  // Upload license file
  const licenseExt = licenseFile.name.split('.').pop() || 'jpg';
  console.log(`Uploading license file with ext: ${licenseExt}`);
  const licenseResult = await uploadFile(
    `license.${licenseExt}`,
    licenseFile.buffer,
    licenseFile.type,
    folderId
  );
  console.log(`License uploaded: ${licenseResult.fileId}`);

  // Upload business card file
  const businessCardExt = businessCardFile.name.split('.').pop() || 'jpg';
  console.log(`Uploading business card file with ext: ${businessCardExt}`);
  const businessCardResult = await uploadFile(
    `business-card.${businessCardExt}`,
    businessCardFile.buffer,
    businessCardFile.type,
    folderId
  );
  console.log(`Business card uploaded: ${businessCardResult.fileId}`);

  return {
    folderId,
    licenseFileUrl: licenseResult.webViewLink,
    businessCardFileUrl: businessCardResult.webViewLink,
  };
}

// Delete a file from Google Drive
export async function deleteFile(fileId: string): Promise<boolean> {
  try {
    const drive = getGoogleDriveClient();
    await drive.files.delete({ fileId });
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

// Delete a folder and all its contents
export async function deleteFolder(folderId: string): Promise<boolean> {
  try {
    const drive = getGoogleDriveClient();
    await drive.files.delete({ fileId: folderId });
    return true;
  } catch (error) {
    console.error('Error deleting folder:', error);
    return false;
  }
}

// Get file info
export async function getFileInfo(fileId: string): Promise<{
  name: string;
  mimeType: string;
  webViewLink: string;
} | null> {
  try {
    const drive = getGoogleDriveClient();
    const response = await drive.files.get({
      fileId,
      fields: 'name, mimeType, webViewLink',
    });

    return {
      name: response.data.name || '',
      mimeType: response.data.mimeType || '',
      webViewLink: response.data.webViewLink || '',
    };
  } catch (error) {
    console.error('Error getting file info:', error);
    return null;
  }
}
