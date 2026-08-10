'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

export default function ImpersonationBanner() {
  const [status, setStatus] = useState<ImpersonationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkImpersonationStatus();
  }, []);

  const checkImpersonationStatus = async () => {
    try {
      const response = await fetch('/api/admin/impersonate');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Error checking impersonation status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStopImpersonation = async () => {
    if (!confirm('คุณต้องการออกจากโหมด impersonation และกลับไปเป็น admin ใช่หรือไม่?')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/impersonate', {
        method: 'DELETE',
      });

      if (response.ok) {
        // Redirect back to admin panel
        window.location.href = '/admin';
      } else {
        alert('ไม่สามารถออกจากโหมด impersonation ได้');
      }
    } catch (error) {
      console.error('Error stopping impersonation:', error);
      alert('เกิดข้อผิดพลาด');
    }
  };

  if (loading || !status?.impersonating) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <div>
              <div className="font-semibold">
                👁️ Impersonation Mode Active
              </div>
              <div className="text-sm opacity-90">
                Viewing as: <span className="font-medium">{status.targetUser?.name}</span>
                {status.originalAdmin && (
                  <span className="ml-2 text-xs opacity-75">
                    (Admin: {status.originalAdmin.name})
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleStopImpersonation}
            className="px-4 py-2 bg-white text-purple-600 rounded-lg font-medium hover:bg-purple-50 transition-colors shadow-md"
          >
            Exit Impersonation
          </button>
        </div>
      </div>
    </div>
  );
}
