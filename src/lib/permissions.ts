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
    'event-co': 2.7,
    'event-staff': 2.5,
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

/**
 * Check if user can manage a specific event
 * Admins and committee can manage all events
 * Event-staff and event-co can only manage assigned events
 */
export function canManageEvent(
  userRole: UserRole,
  assignedEventIds: string[] | undefined,
  eventId: string
): boolean {
  // Admins and committee have full access
  if (userRole === 'admin' || userRole === 'committee') {
    return true;
  }
  // Event-staff and event-co can only manage assigned events
  if (userRole === 'event-staff' || userRole === 'event-co') {
    return assignedEventIds?.includes(eventId) || false;
  }
  return false;
}

/**
 * Check if member has full status (all 3 criteria met)
 * Required for members and event-co to maintain full permissions
 */
export function isFullMember(
  userIsActive: boolean | undefined,
  memberStatus: string | undefined,
  lineGroupStatus: string | undefined
): boolean {
  return (
    userIsActive === true &&
    memberStatus === 'ปกติ' &&
    lineGroupStatus === 'ปกติ'
  );
}

/**
 * Get effective permissions based on role and member status
 * Members and event-co with incomplete status get downgraded to guest permissions
 */
export function getEffectivePermissions(
  role: UserRole,
  isActive: boolean | undefined,
  memberStatus: string | undefined,
  lineGroupStatus: string | undefined
): string[] {
  // Check if member status restriction applies
  if (role === 'member' || role === 'event-co') {
    if (!isFullMember(isActive, memberStatus, lineGroupStatus)) {
      // Downgrade to guest permissions
      return ROLE_PERMISSIONS.guest;
    }
  }
  // Return normal permissions for the role
  return ROLE_PERMISSIONS[role] || [];
}
