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

  // Saved Message Templates (for custom messages)
  savedMessageTemplates?: Array<{
    id: string;
    name: string;
    content: string;
    createdAt: string;
  }>;

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
  savedMessageTemplates?: Array<{
    id: string;
    name: string;
    content: string;
    createdAt: string;
  }>;
}

/**
 * Notification Settings
 * Configure where system notifications should be sent
 */
export interface NotificationTarget {
  type: 'admin_users' | 'committee_users' | 'event_co_users' | 'event_staff_users' | 'line_group' | 'specific_user';
  targetId?: string;  // Group ID or User ID (not needed for role-based targets)
  targetName?: string; // Display name for the target
  enabled: boolean;
}

export interface NotificationSettings {
  // Membership Application Notifications
  membershipApplication?: {
    enabled: boolean;
    targets: NotificationTarget[];
  };

  // Event Registration Notifications (future)
  eventRegistration?: {
    enabled: boolean;
    targets: NotificationTarget[];
  };

  // Payment Notifications (future)
  paymentReceived?: {
    enabled: boolean;
    targets: NotificationTarget[];
  };

  // Metadata
  updatedAt?: string;
  updatedBy?: string;
}

// Default notification settings
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  membershipApplication: {
    enabled: true,
    targets: [
      {
        type: 'admin_users',
        enabled: true,
        targetName: 'ผู้ดูแลระบบทั้งหมด (Admin Users)',
      }
    ],
  },
};

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
