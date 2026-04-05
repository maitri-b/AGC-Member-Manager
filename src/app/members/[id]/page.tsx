'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Member } from '@/types/member';
import Navbar from '@/components/Navbar';
import { hasPermission } from '@/lib/permissions';

interface LineProfile {
  lineDisplayName: string;
  lineProfilePicture: string;
  lineUserId: string;
  verifiedAt: string | null;
}

export default function MemberDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const memberId = params.id as string;

  const [member, setMember] = useState<Member | null>(null);
  const [lineProfile, setLineProfile] = useState<LineProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user) {
      // Check if user has permission to view members list
      if (!hasPermission(session.user.permissions || [], 'members:list')) {
        router.push('/unauthorized');
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (memberId) {
      fetchMember();
    }
  }, [memberId]);

  const fetchMember = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/members/${memberId}`);
      if (!response.ok) {
        throw new Error('Member not found');
      }
      const data = await response.json();
      setMember(data.member);
      setLineProfile(data.lineProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error || 'ไม่พบข้อมูลสมาชิก'}
          </div>
          <button
            onClick={() => router.push('/members')}
            className="mt-4 text-red-600 hover:text-red-800"
          >
            ← กลับไปหน้ารายชื่อสมาชิก
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <button
          onClick={() => router.push('/members')}
          className="mb-6 text-red-600 hover:text-red-800 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          กลับไปหน้ารายชื่อสมาชิก
        </button>

        {/* Member Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-start gap-6">
            {lineProfile?.lineProfilePicture ? (
              <img
                src={lineProfile.lineProfilePicture}
                alt=""
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
              <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center text-3xl text-gray-400">
                {member.nickname?.charAt(0) || member.fullNameTH?.charAt(0) || '?'}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {member.nickname || '-'}
                </h1>
                {lineProfile && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    ยืนยันตัวตนแล้ว
                  </span>
                )}
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                  member.status === 'Active' || member.status === 'ปกติ'
                    ? 'bg-green-100 text-green-800'
                    : member.status === 'Inactive'
                    ? 'bg-gray-100 text-gray-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {member.status}
                </span>
              </div>
              <p className="text-lg text-gray-600 mt-1">
                {member.fullNameTH || ''}
              </p>
              <p className="text-gray-500 mt-1">
                รหัสสมาชิก: {member.memberId}
              </p>
              {lineProfile?.lineDisplayName && (
                <p className="text-green-600 mt-1 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                  {lineProfile.lineDisplayName}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Company Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              ข้อมูลบริษัท
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">บริษัท (TH)</dt>
                <dd className="text-gray-900">{member.companyNameTH || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">บริษัท (EN)</dt>
                <dd className="text-gray-900">{member.companyNameEN || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">ตำแหน่งในบริษัท</dt>
                <dd className="text-gray-900">{member.positionCompany || '-'}</dd>
              </div>
            </dl>
          </div>

          {/* Contact Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              ข้อมูลติดต่อ
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">โทรศัพท์</dt>
                <dd className="text-gray-900">
                  {member.phone ? (
                    <a href={`tel:${member.phone}`} className="text-red-600 hover:text-red-800">
                      {member.phone}
                    </a>
                  ) : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">อีเมล</dt>
                <dd className="text-gray-900">
                  {member.email ? (
                    <a href={`mailto:${member.email}`} className="text-red-600 hover:text-red-800">
                      {member.email}
                    </a>
                  ) : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">เว็บไซต์</dt>
                <dd className="text-gray-900">
                  {member.website ? (
                    <a href={member.website} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:text-red-800">
                      {member.website}
                    </a>
                  ) : '-'}
                </dd>
              </div>
            </dl>
          </div>

          {/* LINE Info from Google Sheet (member reported) */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
              ข้อมูล LINE
            </h2>

            {/* Verified LINE Profile */}
            {lineProfile ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-green-800">ยืนยันตัวตนแล้ว (ข้อมูลจากระบบ)</span>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex">
                    <dt className="w-24 text-green-700">ชื่อ LINE:</dt>
                    <dd className="text-green-900 font-medium">{lineProfile.lineDisplayName || '-'}</dd>
                  </div>
                  {lineProfile.verifiedAt && (
                    <div className="flex">
                      <dt className="w-24 text-green-700">ยืนยันเมื่อ:</dt>
                      <dd className="text-green-900">{new Date(lineProfile.verifiedAt).toLocaleDateString('th-TH')}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ) : null}

            {/* Member Reported LINE Info */}
            {(member.lineName || member.lineId) && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-600">ข้อมูลที่สมาชิกแจ้งมา</span>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex">
                    <dt className="w-24 text-gray-500">ชื่อ LINE:</dt>
                    <dd className="text-gray-700">{member.lineName || '-'}</dd>
                  </div>
                  <div className="flex">
                    <dt className="w-24 text-gray-500">LINE ID:</dt>
                    <dd className="text-gray-700">{member.lineId || '-'}</dd>
                  </div>
                </dl>
              </div>
            )}

            {!lineProfile && !member.lineName && !member.lineId && (
              <p className="text-gray-400 text-sm">ไม่มีข้อมูล LINE</p>
            )}
          </div>

          {/* Membership Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              ข้อมูลสมาชิก
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">สถานะไลน์กลุ่ม</dt>
                <dd className="text-gray-900">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    member.lineGroupStatus === 'อยู่ในกลุ่ม' || member.lineGroupStatus?.includes('อยู่')
                      ? 'bg-green-100 text-green-800'
                      : member.lineGroupStatus === 'ออกจากกลุ่ม' || member.lineGroupStatus?.includes('ออก')
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {member.lineGroupStatus || '-'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">ผู้รับรอง 1</dt>
                <dd className="text-gray-900">{member.sponsor1 || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">ผู้รับรอง 2</dt>
                <dd className="text-gray-900">{member.sponsor2 || '-'}</dd>
              </div>
            </dl>
          </div>

          {/* License Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              ข้อมูลใบอนุญาต
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">ชื่อบริษัทตามที่จดทะเบียน</dt>
                <dd className="text-gray-900">{member.companyNameTH || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">เลขที่ใบอนุญาตนำเที่ยว</dt>
                <dd className="text-gray-900">{member.licenseNumber || '-'}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">สถานะ</dt>
                <dd className="text-gray-900">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    member.status?.toLowerCase() === 'active' || member.status === 'ปกติ'
                      ? 'bg-green-100 text-green-800'
                      : member.status?.toLowerCase() === 'inactive' || member.status === 'ไม่ปกติ'
                      ? 'bg-gray-100 text-gray-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {member.status || '-'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">วันหมดอายุใบอนุญาต</dt>
                <dd className="text-gray-900">{member.membershipExpiry || member.licenseExpiry || '-'}</dd>
              </div>
            </dl>
          </div>
        </div>

      </main>
    </div>
  );
}
