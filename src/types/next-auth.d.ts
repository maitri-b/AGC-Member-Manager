// Extend NextAuth types for LINE login and custom user data
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      lineUserId: string;
      role: UserRole;
      memberId?: string;
      permissions: string[];
      assignedEventIds?: string[];
    };
    accessToken?: string;
    error?: string; // Error state for token refresh failures
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    lineUserId: string;
    role: UserRole;
    memberId?: string;
    permissions: string[];
    assignedEventIds?: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    lineUserId: string;
    role: UserRole;
    memberId?: string;
    permissions: string[];
    assignedEventIds?: string[];
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    lineDisplayName?: string;
    lineProfilePicture?: string | null;
    error?: string;
  }
}

export type UserRole = 'admin' | 'committee' | 'event-co' | 'event-staff' | 'member' | 'guest' | 'visitor';

export interface Permission {
  name: string;
  description: string;
}

export const PERMISSIONS = {
  // Member permissions
  'members:list': 'View all members list',
  'member:read': 'View member profiles',
  'member:write': 'Edit member profiles',
  'member:delete': 'Delete member profiles',
  'member:create': 'Create new members',

  // Report permissions
  'report:view': 'View reports',
  'report:export': 'Export reports',

  // Event permissions
  'events:manage-assigned': 'Manage assigned events',
  'events:register-on-behalf': 'Register for events on behalf of members/guests',

  // Admin permissions
  'admin:access': 'Access admin panel',
  'admin:users': 'Manage users',
  'admin:roles': 'Manage roles',
  'admin:settings': 'Manage system settings',
} as const;

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: Object.keys(PERMISSIONS),
  committee: [
    'members:list',
    'member:read',
    'member:write',
    'member:create',
    'report:view',
    'report:export',
    'events:register-on-behalf', // Can register on behalf of members/guests
    'admin:access', // Access admin panel
    'admin:users',  // Manage users (except roles)
    // Note: 'admin:roles' is NOT included - committee cannot change user roles
  ],
  'event-co': [
    'members:list', // View all members list and member profiles
    'events:manage-assigned', // Can manage assigned events
    'events:register-on-behalf', // Can register on behalf of members/guests
  ],
  'event-staff': [
    'members:list', // View all members list and member profiles
    'events:manage-assigned', // Can manage assigned events only
  ],
  member: [
    // Members can only view their own profile via /profile page
  ],
  guest: [],
  visitor: [], // Visitors have no permissions - can only view public content
};
