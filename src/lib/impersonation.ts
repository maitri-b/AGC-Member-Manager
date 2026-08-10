/**
 * Impersonation Helper Functions
 *
 * Provides utilities to handle user impersonation in API routes and server components.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from './auth-options';
import { cookies } from 'next/headers';
import { adminDb } from './firebase-admin';
import type { Session } from 'next-auth';

export interface ImpersonatedSession extends Session {
  isImpersonating: boolean;
  originalAdmin?: {
    id: string;
    email?: string | null;
    name?: string | null;
  };
}

/**
 * Get the effective user session, accounting for impersonation.
 *
 * If an admin is impersonating another user, this returns a session
 * representing the impersonated user, while preserving admin info.
 *
 * @returns Session object with impersonation metadata
 */
export async function getEffectiveSession(): Promise<ImpersonatedSession | null> {
  // Get the actual logged-in session
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  // Check if currently impersonating
  const cookieStore = await cookies();
  const impersonatingUserId = cookieStore.get('impersonating')?.value;
  const originalAdminId = cookieStore.get('originalAdminId')?.value;

  if (!impersonatingUserId) {
    // Not impersonating, return normal session
    return {
      ...session,
      isImpersonating: false,
    };
  }

  // Fetch the impersonated user's data
  try {
    const db = adminDb();
    const targetUserDoc = await db.collection('users').doc(impersonatingUserId).get();

    if (!targetUserDoc.exists) {
      console.error('[Impersonation] Target user not found, returning original session');
      return {
        ...session,
        isImpersonating: false,
      };
    }

    const targetUserData = targetUserDoc.data();

    // Create a session representing the impersonated user
    const impersonatedSession: ImpersonatedSession = {
      ...session,
      user: {
        ...session.user,
        id: impersonatingUserId,
        lineUserId: impersonatingUserId,
        name: targetUserData?.displayName || 'Unknown User',
        email: targetUserData?.email || null,
        image: targetUserData?.pictureUrl || null,
        role: targetUserData?.role || 'member',
        permissions: targetUserData?.permissions || [],
        memberId: targetUserData?.memberId || null,
        assignedEventIds: targetUserData?.assignedEventIds || [],
      },
      isImpersonating: true,
      originalAdmin: {
        id: originalAdminId || session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    };

    return impersonatedSession;
  } catch (error) {
    console.error('[Impersonation] Error fetching target user:', error);
    return {
      ...session,
      isImpersonating: false,
    };
  }
}

/**
 * Check if the current request is in impersonation mode
 */
export async function isImpersonating(): Promise<boolean> {
  const cookieStore = await cookies();
  return !!cookieStore.get('impersonating')?.value;
}

/**
 * Get the impersonated user ID (if impersonating)
 */
export async function getImpersonatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('impersonating')?.value || null;
}

/**
 * Get the original admin ID (if impersonating)
 */
export async function getOriginalAdminId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('originalAdminId')?.value || null;
}
