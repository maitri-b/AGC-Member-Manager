/**
 * Application Constants
 */

// Google Apps Script Web App URL for uploading payment slips
// TODO: Update this after deploying the GAS web app
export const GAS_UPLOAD_SLIP_URL = process.env.NEXT_PUBLIC_GAS_UPLOAD_SLIP_URL ||
  'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

// Admin LINE contact
export const ADMIN_LINE_URL = 'https://lin.ee/nzAjXXq';

// App metadata
export const APP_NAME = 'Agents Club Member Manager';
export const APP_VERSION = '1.0.0';
