/**
 * System Settings and Configuration Types
 * For Agents Club Member Manager
 */

export interface SystemSettings {
  settingsId: string;

  // Website Configuration
  baseUrl: string;                    // Base URL of the application (e.g., https://agc-member-manager.vercel.app)
  websiteName: string;                // Name of the website/organization
  websiteNameEN?: string;             // English name (optional)

  // Contact Information
  contactEmail?: string;              // Contact email for support
  contactPhone?: string;              // Contact phone number
  lineOfficialAccount?: string;       // LINE Official Account URL

  // LINE Integration
  lineChannelId?: string;             // LINE Channel ID
  lineChannelSecret?: string;         // LINE Channel Secret (stored securely)

  // Email Configuration (for future use)
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;              // Stored securely

  // General Settings
  defaultLanguage?: 'th' | 'en';      // Default language
  timezone?: string;                  // Timezone (e.g., Asia/Bangkok)

  // Feature Flags
  enableEmailNotifications?: boolean;
  enableLineNotifications?: boolean;
  enableSmsNotifications?: boolean;

  // Message Templates (for LINE notifications)
  messageTemplates?: Record<string, string>;  // Custom templates, keyed by template type

  // Metadata
  updatedAt: string;
  updatedBy: string;
  createdAt?: string;
  createdBy?: string;
}

export interface SystemSettingsInput {
  baseUrl: string;
  websiteName: string;
  websiteNameEN?: string;
  contactEmail?: string;
  contactPhone?: string;
  lineOfficialAccount?: string;
  defaultLanguage?: 'th' | 'en';
  timezone?: string;
  enableEmailNotifications?: boolean;
  enableLineNotifications?: boolean;
  enableSmsNotifications?: boolean;
  messageTemplates?: Record<string, string>;
}

// Default settings
export const DEFAULT_SETTINGS: Partial<SystemSettings> = {
  baseUrl: 'https://agc-member-manager.vercel.app',
  websiteName: 'Agents Club Member Manager',
  websiteNameEN: 'Agents Club Member Manager',
  defaultLanguage: 'th',
  timezone: 'Asia/Bangkok',
  enableLineNotifications: true,
  enableEmailNotifications: false,
  enableSmsNotifications: false,
};
