'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function UnauthorizedPage() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        {/* Content */}
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          ไม่มีสิทธิ์เข้าถึง
        </h1>
        <p className="text-gray-600 mb-6">
          คุณไม่มีสิทธิ์ในการเข้าถึงหน้านี้ กรุณาติดต่อผู้ดูแลระบบหากต้องการขอสิทธิ์เพิ่มเติม
        </p>

        {/* User Info */}
        {session && (
          <div className="bg-gray-100 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center gap-3">
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt={session.user.name || 'Profile'}
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div className="text-left">
                <p className="font-medium text-gray-800">{session.user.name}</p>
                <p className="text-xs text-gray-500">
                  สถานะ: {session.user.role === 'guest' ? 'ผู้เยี่ยมชม' : session.user.role}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="px-6 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            กลับหน้าหลัก
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            เข้าสู่ระบบด้วยบัญชีอื่น
          </button>
        </div>
      </div>
    </div>
  );
}
