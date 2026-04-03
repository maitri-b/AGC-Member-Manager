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
    };
    accessToken?: string;
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
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    lineUserId: string;
    role: UserRole;
    memberId?: string;
    permissions: string[];
    accessToken?: string;
  }
}

export type UserRole = 'admin' | 'committee' | 'member' | 'guest';

export interface Permission {
  name: string;
  description: string;
}

export const PERMISSIONS = {
  // Member permissions
  'member:read': 'View member profiles',
  'member:write': 'Edit member profiles',
  'member:delete': 'Delete member profiles',
  'member:create': 'Create new members',

  // Report permissions
  'report:view': 'View reports',
  'report:export': 'Export reports',

  // Admin permissions
  'admin:access': 'Access admin panel',
  'admin:users': 'Manage users',
  'admin:roles': 'Manage roles',
  'admin:settings': 'Manage system settings',
} as const;

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: Object.keys(PERMISSIONS),
  committee: [
    'member:read',
    'member:write',
    'member:create',
    'report:view',
    'report:export',
  ],
  member: [
    'member:read', // Can only read their own profile
  ],
  guest: [],
};
