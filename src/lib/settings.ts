/**
 * System Settings Management Functions
 * Handles CRUD operations for system configuration
 */

import { adminDb } from './firebase-admin';
import { SystemSettings, SystemSettingsInput, DEFAULT_SETTINGS } from '@/types/settings';

const SETTINGS_COLLECTION = 'systemSettings';
const SETTINGS_DOC_ID = 'main'; // Single document for system-wide settings

/**
 * Get system settings
 * Returns default settings if not found
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const settingsRef = adminDb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID);
    const doc = await settingsRef.get();

    if (doc.exists) {
      const data = doc.data();
      return {
        settingsId: doc.id,
        ...data,
      } as SystemSettings;
    }

    // Return default settings if not found
    return {
      settingsId: SETTINGS_DOC_ID,
      ...DEFAULT_SETTINGS,
      baseUrl: DEFAULT_SETTINGS.baseUrl || 'https://agc-member-manager.vercel.app',
      websiteName: DEFAULT_SETTINGS.websiteName || 'Agents Club',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    } as SystemSettings;
  } catch (error) {
    console.error('Error fetching system settings:', error);
    // Return default settings on error
    return {
      settingsId: SETTINGS_DOC_ID,
      ...DEFAULT_SETTINGS,
      baseUrl: DEFAULT_SETTINGS.baseUrl || 'https://agc-member-manager.vercel.app',
      websiteName: DEFAULT_SETTINGS.websiteName || 'Agents Club',
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    } as SystemSettings;
  }
}

/**
 * Update system settings
 * Admin only
 */
export async function updateSystemSettings(
  input: SystemSettingsInput,
  updatedBy: string
): Promise<SystemSettings> {
  try {
    const settingsRef = adminDb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID);
    const now = new Date().toISOString();

    // Check if settings exist
    const existing = await settingsRef.get();
    const isNew = !existing.exists;

    const settingsData: Partial<SystemSettings> = {
      ...input,
      updatedAt: now,
      updatedBy,
    };

    if (isNew) {
      settingsData.createdAt = now;
      settingsData.createdBy = updatedBy;
    }

    await settingsRef.set(settingsData, { merge: true });

    const updated = await settingsRef.get();
    return {
      settingsId: updated.id,
      ...updated.data(),
    } as SystemSettings;
  } catch (error) {
    console.error('Error updating system settings:', error);
    throw new Error('Failed to update system settings');
  }
}

/**
 * Get base URL for the application
 * Convenience function to get just the base URL
 */
export async function getBaseUrl(): Promise<string> {
  try {
    const settings = await getSystemSettings();
    return settings.baseUrl || 'https://agc-member-manager.vercel.app';
  } catch (error) {
    console.error('Error getting base URL:', error);
    return 'https://agc-member-manager.vercel.app';
  }
}

/**
 * Initialize default settings
 * Creates default settings if they don't exist
 */
export async function initializeDefaultSettings(): Promise<void> {
  try {
    const settingsRef = adminDb().collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC_ID);
    const doc = await settingsRef.get();

    if (!doc.exists) {
      const now = new Date().toISOString();
      await settingsRef.set({
        ...DEFAULT_SETTINGS,
        createdAt: now,
        createdBy: 'system',
        updatedAt: now,
        updatedBy: 'system',
      });
      console.log('Default settings initialized');
    }
  } catch (error) {
    console.error('Error initializing default settings:', error);
  }
}
