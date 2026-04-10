'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import { Member, parseThaiDate } from '@/types/member';
import Navbar from '@/components/Navbar';
import { hasPermission } from '@/lib/permissions';
import { Toast, useToast } from '@/components/Toast';

interface LineProfile {
  lineDisplayName: string;
  lineProfilePicture: string;
  lineUserId: string;
  verifiedAt: string | null;
}

interface EventAttendanceRecord {
  eventId: string;
  eventName: string;
  eventDate: string;
  registrationId: string;
  attendeeNames: string;
  attendeeCount: number;
  status: string;
  checkedIn: boolean;
}

interface MemberAttendance {
  memberId: string;
  memberName: string;
  companyName: string;
  licenseNumber: string;
  eventsAttended: EventAttendanceRecord[];
  totalEventsThisYear: number;
  eventsLast12Months: number;
  lastAttendedEvent: string;
  lastAttendedDate: string;
  noActivityWarning: boolean;
}

// Thai month names
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// Format date for display: เดือนภาษาไทย ปี ค.ศ. (e.g., "มีนาคม 2025")
function formatThaiMonthYear(dateStr: string): string {
  if (!dateStr) return '-';
  const date = parseThaiDate(dateStr);
  if (!date) return dateStr;

  const month = THAI_MONTHS[date.getMonth()];
  const year = date.getFullYear(); // Gregorian year (ค.ศ.)
  return `${month} ${year}`;
}

// Convert date string (mm/dd/yyyy or yyyy-mm-dd) to yyyy-mm-dd for date picker
function toDatePickerFormat(dateStr: string): string {
  if (!dateStr) return '';
  const date = parseThaiDate(dateStr);
  if (!date) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Convert yyyy-mm-dd (from date picker) to dd/mm/yyyy (for Google Sheet - Thai/EU format)
function toGoogleSheetFormat(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `${day}/${month}/${year}`;
}

// Editable fields for admin
const EDITABLE_FIELDS = [
  { key: 'nickname', label: 'ชื่อเล่น', type: 'text' },
  { key: 'fullNameTH', label: 'ชื่อ-สกุล (ไทย)', type: 'text' },
  { key: 'companyNameTH', label: 'ชื่อบริษัท (ไทย)', type: 'text' },
  { key: 'companyNameEN', label: 'ชื่อบริษัท (EN)', type: 'text' },
  { key: 'licenseNumber', label: 'เลขที่ใบอนุญาต', type: 'text' },
  { key: 'status', label: 'สถานะใบอนุญาต', type: 'select', options: ['ปกติ', 'ยกเลิก', 'เพิกถอน', 'หมดอายุตามกฏหมาย'] },
  { key: 'lineGroupStatus', label: 'สถานะไลน์กลุ่ม', type: 'select', options: ['ปกติ', 'ออกจากกลุ่มแล้ว', 'รอนำเข้ากลุ่ม', 'รอผลการติดต่อ'] },
  { key: 'phone', label: 'โทรศัพท์', type: 'text' },
  { key: 'mobile', label: 'มือถือ', type: 'text' },
  { key: 'email', label: 'อีเมล', type: 'email' },
  { key: 'lineName', label: 'ชื่อ LINE (ที่แจ้งมา)', type: 'text' },
  { key: 'lineId', label: 'LINE ID', type: 'text' },
  { key: 'membershipExpiry', label: 'วันหมดอายุใบอนุญาต', type: 'date' },
  { key: 'sponsor1', label: 'ผู้รับรอง 1', type: 'text' },
  { key: 'sponsor2', label: 'ผู้รับรอง 2', type: 'text' },
] as const;

export default function MemberDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const memberId = params.id as string;
  const toast = useToast();

  const [member, setMember] = useState<Member | null>(null);
  const [lineProfile, setLineProfile] = useState<LineProfile | null>(null);
  const [attendance, setAttendance] = useState<MemberAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Check if user can edit members
  const canEdit = session?.user?.permissions?.includes('admin:users') ||
                  session?.user?.permissions?.includes('members:edit') ||
                  session?.user?.role === 'admin' ||
                  session?.user?.role === 'committee';

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
    if (memberId && status === 'authenticated' && session?.user) {
      fetchMember();
    }
  }, [memberId, status, session]);

  // Open edit modal with current member data
  const openEditModal = () => {
    if (!member) return;
    const data: Record<string, string> = {};
    EDITABLE_FIELDS.forEach(field => {
      const value = ((member as unknown) as Record<string, unknown>)[field.key]?.toString() || '';
      // Convert date fields to yyyy-mm-dd for date picker
      if (field.type === 'date' && value) {
        data[field.key] = toDatePickerFormat(value);
      } else {
        data[field.key] = value;
      }
    });
    setEditData(data);
    setShowEditModal(true);
  };

  // Save edited data
  const handleSave = async () => {
    if (!member) return;
    setSaving(true);
    try {
      // Convert date fields back to mm/dd/yyyy format for Google Sheet
      const dataToSave = { ...editData };
      EDITABLE_FIELDS.forEach(field => {
        if (field.type === 'date' && dataToSave[field.key]) {
          dataToSave[field.key] = toGoogleSheetFormat(dataToSave[field.key]);
        }
      });

      const response = await fetch(`/api/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update member');
      }
      toast.success('บันทึกข้อมูลเรียบร้อยแล้ว');
      setShowEditModal(false);
      fetchMember(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

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
      setAttendance(data.attendance);
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
        {/* Back Button and Edit Button */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/members')}
            className="text-red-600 hover:text-red-800 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            กลับไปหน้ารายชื่อสมาชิก
          </button>
          {canEdit && (
            <button
              onClick={openEditModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              แก้ไขข้อมูล
            </button>
          )}
        </div>

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
                <dd className="text-gray-900">{formatThaiMonthYear(member.membershipExpiry || member.licenseExpiry || '')}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Event Attendance Section */}
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            กิจกรรมที่เข้าร่วม
          </h2>

          {attendance ? (
            <>
              {/* Summary */}
              <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">12 เดือนที่ผ่านมา:</span>
                  <span className={`font-semibold ${attendance.eventsLast12Months > 0 ? 'text-teal-600' : 'text-orange-600'}`}>
                    {attendance.eventsLast12Months} กิจกรรม
                  </span>
                  {attendance.noActivityWarning && (
                    <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                      ไม่มีกิจกรรม
                    </span>
                  )}
                </div>
                {attendance.lastAttendedEvent && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">ล่าสุด:</span>
                    <span className="text-sm font-medium text-gray-900">{attendance.lastAttendedEvent}</span>
                  </div>
                )}
              </div>

              {/* Event List */}
              {attendance.eventsAttended.length > 0 ? (
                <div className="space-y-2">
                  {attendance.eventsAttended.map((event, index) => (
                    <div
                      key={`${event.eventId}-${index}`}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-100 rounded-lg">
                          <svg className="w-4 h-4 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{event.eventName}</p>
                          <p className="text-xs text-gray-500">
                            {event.eventDate}
                            {event.attendeeCount > 1 && ` • ${event.attendeeCount} คน`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {event.checkedIn && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Check-in แล้ว
                          </span>
                        )}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          event.status?.includes('ยืนยัน') || event.status?.toLowerCase() === 'confirmed'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {event.status || 'ลงทะเบียน'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">ยังไม่มีประวัติเข้าร่วมกิจกรรม</p>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm text-center py-4">กำลังโหลดข้อมูลกิจกรรม...</p>
          )}
        </div>

      </main>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">แก้ไขข้อมูลสมาชิก</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EDITABLE_FIELDS.map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                    {field.type === 'select' ? (
                      <select
                        value={editData[field.key] || ''}
                        onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">-- เลือก --</option>
                        {field.options?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type}
                        value={editData[field.key] || ''}
                        onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <Toast toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  );
}
