'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import LineLoginButton from '@/components/LineLoginButton';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/dashboard');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent"></div>
      </div>
    );
  }

  if (session) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      {/* Login Card */}
      <div className="w-full max-w-md">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          {/* Agents Club Logo */}
          <div className="mx-auto w-24 h-24 bg-gradient-to-br from-[#1e3a5f] to-[#2d5a87] rounded-full flex items-center justify-center mb-6 shadow-lg">
            <span className="text-white font-bold text-2xl">AC</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Agents Club
          </h1>
          <p className="text-gray-600 text-lg">
            ระบบจัดการสมาชิกสมาคมตัวแทนท่องเที่ยว
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              เข้าสู่ระบบ
            </h2>
            <p className="text-gray-500 text-sm">
              กรุณาเข้าสู่ระบบด้วยบัญชี LINE ของคุณ
            </p>
          </div>

          {/* LINE Login Button */}
          <LineLoginButton callbackUrl="/dashboard" />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-400">
                เฉพาะสมาชิก Agents Club เท่านั้น
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-700 mb-1">ข้อมูลสำคัญ</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>ใช้ LINE Account ที่ลงทะเบียนกับ Agents Club</li>
                  <li>ผู้ดูแลระบบจะตรวจสอบสิทธิ์การเข้าถึง</li>
                  <li>หากมีปัญหาติดต่อผู้ดูแลระบบ</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>Agents Club</p>
          <p className="text-xs mt-1">Helping & Sharing</p>
        </div>
      </div>
    </div>
  );
}
