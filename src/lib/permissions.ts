// Permission checking utilities
import { UserRole, ROLE_PERMISSIONS } from '@/types/next-auth.d';

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  return userPermissions.includes(requiredPermission);
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(
  userPermissions: string[],
  requiredPermissions: string[]
): boolean {
  return requiredPermissions.some((permission) =>
    userPermissions.includes(permission)
  );
}

/**
 * Check if a user has all of the specified permissions
 */
export function hasAllPermissions(
  userPermissions: string[],
  requiredPermissions: string[]
): boolean {
  return requiredPermissions.every((permission) =>
    userPermissions.includes(permission)
  );
}

/**
 * Get permissions for a role
 */
export function getPermissionsForRole(role: UserRole): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if user role has access level
 */
export function hasMinimumRole(
  userRole: UserRole,
  minimumRole: UserRole
): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    admin: 4,
    committee: 3,
    member: 2,
    guest: 1,
  };
  return roleHierarchy[userRole] >= roleHierarchy[minimumRole];
}

/**
 * Middleware helper to check if user can access member data
 */
export function canAccessMemberData(
  userRole: UserRole,
  userMemberId: string | undefined,
  targetMemberId: string
): boolean {
  // Admins and committee can access all
  if (userRole === 'admin' || userRole === 'committee') {
    return true;
  }
  // Members can only access their own data
  if (userRole === 'member') {
    return userMemberId === targetMemberId;
  }
  return false;
}
