/**
 * Hook to get effective session (accounting for impersonation)
 *
 * When admin is impersonating another user, this hook returns the target user's session
 * instead of the admin's session.
 */

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import type { Session } from 'next-auth';

interface ImpersonationStatus {
  impersonating: boolean;
  targetUser?: {
    id: string;
    name: string;
    email: string;
  };
  originalAdmin?: {
    id: string;
    name: string;
  };
}

interface EffectiveSession extends Session {
  isImpersonating?: boolean;
  originalAdmin?: {
    id: string;
    name: string;
  };
}

export function useEffectiveSession() {
  const { data: originalSession, status } = useSession();
  const [effectiveSession, setEffectiveSession] = useState<EffectiveSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkImpersonation() {
      if (status === 'loading' || !originalSession) {
        setLoading(status === 'loading');
        return;
      }

      try {
        // Check if currently impersonating
        const response = await fetch('/api/admin/impersonate');
        const impersonationStatus: ImpersonationStatus = await response.json();

        if (impersonationStatus.impersonating && impersonationStatus.targetUser) {
          // Fetch target user's full data
          const userResponse = await fetch(`/api/admin/members/${impersonationStatus.targetUser.id}`);

          if (userResponse.ok) {
            const userData = await userResponse.json();

            // Create effective session with target user's data
            setEffectiveSession({
              ...originalSession,
              user: {
                ...originalSession.user,
                id: userData.member.lineUserId,
                lineUserId: userData.member.lineUserId,
                name: userData.member.displayName,
                email: userData.member.email || '',
                image: userData.member.pictureUrl || '',
                role: userData.member.role || 'member',
                permissions: userData.member.permissions || [],
                memberId: userData.member.memberId || null,
                assignedEventIds: userData.member.assignedEventIds || [],
              },
              isImpersonating: true,
              originalAdmin: impersonationStatus.originalAdmin,
            });
          } else {
            // Fallback to original session if fetch fails
            setEffectiveSession(originalSession);
          }
        } else {
          // Not impersonating, use original session
          setEffectiveSession(originalSession);
        }
      } catch (error) {
        console.error('Error checking impersonation:', error);
        // Fallback to original session on error
        setEffectiveSession(originalSession);
      } finally {
        setLoading(false);
      }
    }

    checkImpersonation();
  }, [originalSession, status]);

  return {
    data: effectiveSession,
    status: loading ? 'loading' : status,
    isImpersonating: effectiveSession?.isImpersonating || false,
    originalAdmin: effectiveSession?.originalAdmin,
  };
}
