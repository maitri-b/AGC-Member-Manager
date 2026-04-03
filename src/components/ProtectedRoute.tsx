'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import { UserRole } from '@/types/next-auth.d';
import { hasPermission, hasMinimumRole } from '@/lib/permissions';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string;
  requiredRole?: UserRole;
  fallbackUrl?: string;
}

export default function ProtectedRoute({
  children,
  requiredPermission,
  requiredRole,
  fallbackUrl = '/login',
}: ProtectedRouteProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    // Not authenticated
    if (!session) {
      router.push(fallbackUrl);
      return;
    }

    // Check permission
    if (requiredPermission && !hasPermission(session.user.permissions, requiredPermission)) {
      router.push('/unauthorized');
      return;
    }

    // Check role
    if (requiredRole && !hasMinimumRole(session.user.role, requiredRole)) {
      router.push('/unauthorized');
      return;
    }
  }, [session, status, router, requiredPermission, requiredRole, fallbackUrl]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (requiredPermission && !hasPermission(session.user.permissions, requiredPermission)) {
    return null;
  }

  if (requiredRole && !hasMinimumRole(session.user.role, requiredRole)) {
    return null;
  }

  return <>{children}</>;
}
