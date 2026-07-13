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
    visitor: 0, // Lowest level - cannot register for events
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
 * Required for members to maintain full permissions
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
 * Members with incomplete status get downgraded to guest permissions
 * Event-co, event-staff, admin, and committee bypass this check
 */
export function getEffectivePermissions(
  role: UserRole,
  isActive: boolean | undefined,
  memberStatus: string | undefined,
  lineGroupStatus: string | undefined
): string[] {
  // Check if member status restriction applies (only for 'member' role)
  if (role === 'member') {
    if (!isFullMember(isActive, memberStatus, lineGroupStatus)) {
      // Downgrade to guest permissions
      return ROLE_PERMISSIONS.guest;
    }
  }
  // Return normal permissions for the role
  // Event-co, event-staff, admin, and committee get their full permissions regardless of member status
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a guest user is eligible to register for events
 * A guest can register if they have:
 * 1. A valid memberId
 * 2. Member status is 'ปกติ' (normal/active)
 * 3. LINE group status is 'รอนำเข้ากลุ่ม' (waiting to be added to group)
 */
export function isGuestEligibleForEventRegistration(
  role: UserRole,
  memberId: string | undefined,
  memberStatus: string | undefined,
  lineGroupStatus: string | undefined
): boolean {
  // Only applies to guest role
  if (role !== 'guest') {
    return false;
  }

  // Must have a memberId
  if (!memberId) {
    return false;
  }

  // Check if member status is valid
  const hasValidMemberStatus = memberStatus === 'ปกติ';

  // Check if LINE group status is 'รอนำเข้ากลุ่ม'
  const isWaitingForLineGroup = lineGroupStatus === 'รอนำเข้ากลุ่ม';

  return hasValidMemberStatus && isWaitingForLineGroup;
}
