'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Member } from '@/types/member';
import Navbar from '@/components/Navbar';

export default function MemberDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const memberId = params.id as string;

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

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
            <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center text-3xl text-gray-400">
              {member.nickname?.charAt(0) || member.fullNameTH?.charAt(0) || '?'}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {member.nickname || '-'}
                </h1>
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                  member.status === 'Active'
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
              <div>
                <dt className="text-sm text-gray-500">ตำแหน่งในสมาคม</dt>
                <dd className="text-gray-900">{member.positionClub || '-'}</dd>
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
                <dt className="text-sm text-gray-500">LINE ID</dt>
                <dd className="text-gray-900">{member.lineId || '-'}</dd>
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
                <dt className="text-sm text-gray-500">วันหมดอายุสมาชิก</dt>
                <dd className="text-gray-900">{member.membershipExpiry || '-'}</dd>
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
                <dd className="text-gray-900">{member.licenseExpiry || '-'}</dd>
              </div>
            </dl>
          </div>
        </div>

      </main>
    </div>
  );
}
