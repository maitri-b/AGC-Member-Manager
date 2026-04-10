'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Member } from '@/types/member';
import Navbar from '@/components/Navbar';
import { Toast, useToast } from '@/components/Toast';

interface UserProfile {
  id: string;
  name: string;
  image?: string;
  role: string;
  memberId?: string;
  permissions: string[];
  lineDisplayName?: string;
  lineProfilePicture?: string;
  email?: string;
  createdAt?: { _seconds: number };
  lastLoginAt?: { _seconds: number };
}

interface ChangeRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  changes: Record<string, { oldValue: string; newValue: string }>;
  reason: string;
  createdAt: string;
  processedAt?: string;
  processedByName?: string;
  adminNote?: string;
}

interface EventAttendanceRecord {
  eventId: string;
  eventName: string;
  eventDate: string;
  attendeeCount: number;
  status: string;
  checkedIn: boolean;
}

interface MemberAttendance {
  memberId: string;
  eventsAttended: EventAttendanceRecord[];
  totalEventsThisYear: number;
  lastAttendedEvent: string;
  lastAttendedDate: string;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Contact info edit (direct edit)
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    phone: '',
    mobile: '',
    email: '',
    website: '',
  });

  // Profile change request (requires approval)
  const [isRequestingChange, setIsRequestingChange] = useState(false);
  const [changeForm, setChangeForm] = useState({
    fullNameTH: '',
    nickname: '',
    companyNameTH: '',
    companyNameEN: '',
    positionCompany: '',
    licenseNumber: '',
    lineId: '',
  });
  const [changeReason, setChangeReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Change request history
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Event attendance
  const [attendance, setAttendance] = useState<MemberAttendance | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchProfile();
    fetchChangeRequests();
    fetchAttendance();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/profile');
      if (!response.ok) throw new Error('Failed to fetch profile');
      const data = await response.json();
      setUser(data.user);
      setMember(data.member);
      if (data.member) {
        setContactForm({
          phone: data.member.phone || '',
          mobile: data.member.mobile || '',
          email: data.member.email || '',
          website: data.member.website || '',
        });
        setChangeForm({
          fullNameTH: data.member.fullNameTH || '',
          nickname: data.member.nickname || '',
          companyNameTH: data.member.companyNameTH || '',
          companyNameEN: data.member.companyNameEN || '',
          positionCompany: data.member.positionCompany || '',
          licenseNumber: data.member.licenseNumber || '',
          lineId: data.member.lineId || '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchChangeRequests = async () => {
    setLoadingRequests(true);
    try {
      const response = await fetch('/api/profile/change-request');
      if (response.ok) {
        const data = await response.json();
        setChangeRequests(data.requests || []);
      }
    } catch (err) {
      console.error('Error fetching change requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchAttendance = async () => {
    setLoadingAttendance(true);
    try {
      const response = await fetch('/api/events/attendance');
      if (response.ok) {
        const data = await response.json();
        setAttendance(data.attendance);
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleSaveContact = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });

      if (!response.ok) throw new Error('Failed to update profile');

      setSuccess('บันทึกข้อมูลติดต่อเรียบร้อยแล้ว');
      setIsEditingContact(false);
      fetchProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitChangeRequest = async () => {
    setSubmittingRequest(true);
    setError(null);
    setSuccess(null);

    // Check if any field has changed
    const changes: Record<string, string> = {};
    if (changeForm.fullNameTH !== (member?.fullNameTH || '')) changes.fullNameTH = changeForm.fullNameTH;
    if (changeForm.nickname !== (member?.nickname || '')) changes.nickname = changeForm.nickname;
    if (changeForm.companyNameTH !== (member?.companyNameTH || '')) changes.companyNameTH = changeForm.companyNameTH;
    if (changeForm.companyNameEN !== (member?.companyNameEN || '')) changes.companyNameEN = changeForm.companyNameEN;
    if (changeForm.positionCompany !== (member?.positionCompany || '')) changes.positionCompany = changeForm.positionCompany;
    if (changeForm.licenseNumber !== (member?.licenseNumber || '')) changes.licenseNumber = changeForm.licenseNumber;
    if (changeForm.lineId !== (member?.lineId || '')) changes.lineId = changeForm.lineId;

    if (Object.keys(changes).length === 0) {
      setError('ไม่มีข้อมูลที่เปลี่ยนแปลง');
      setSubmittingRequest(false);
      return;
    }

    try {
      const response = await fetch('/api/profile/change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, reason: changeReason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit change request');
      }

      toast.success('ส่งคำขอเรียบร้อยแล้ว รอทีมนายทะเบียนตรวจสอบและอนุมัติ');
      setIsRequestingChange(false);
      setChangeReason('');
      fetchChangeRequests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return 'ผู้ดูแลระบบ';
      case 'committee': return 'กรรมการ';
      case 'member': return 'สมาชิก';
      default: return 'ผู้เยี่ยมชม';
    }
  };

  const formatDate = (timestamp?: { _seconds: number }) => {
    if (!timestamp) return '-';
    return new Date(timestamp._seconds * 1000).toLocaleString('th-TH');
  };

  const formatDateString = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('th-TH');
  };

  // Thai month names
  const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  // Format date from Google Sheet (DD/MM/YYYY) to Thai format
  const formatThaiDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';

    try {
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          // Google Sheet uses DD/MM/YYYY (Thai/EU format)
          const [day, month, year] = parts.map(Number);
          // Convert Buddhist year to Gregorian if needed
          const gregorianYear = year > 2500 ? year - 543 : year;

          return `${day} ${THAI_MONTHS[month - 1]} ${gregorianYear}`;
        }
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      fullNameTH: 'ชื่อเต็ม',
      nickname: 'ชื่อเล่น',
      companyNameTH: 'ชื่อบริษัท (TH)',
      companyNameEN: 'ชื่อบริษัท (EN)',
      positionCompany: 'ตำแหน่งในบริษัท',
      licenseNumber: 'เลขที่ใบอนุญาต',
      lineId: 'LINE ID',
    };
    return labels[field] || field;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">รอการอนุมัติ</span>;
      case 'approved':
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">อนุมัติแล้ว</span>;
      case 'rejected':
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">ไม่อนุมัติ</span>;
      default:
        return null;
    }
  };

  const hasPendingRequest = changeRequests.some(r => r.status === 'pending');

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Toast toasts={toast.toasts} onRemove={toast.removeToast} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">โปรไฟล์ของฉัน</h1>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}

        {/* User Account Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ข้อมูลบัญชี</h2>
          <div className="flex items-start gap-6">
            {user?.lineProfilePicture || session?.user?.image ? (
              <img
                src={user?.lineProfilePicture || session?.user?.image || ''}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center text-2xl text-gray-400">
                {session?.user?.name?.charAt(0) || '?'}
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">{user?.lineDisplayName || session?.user?.name}</h3>
              <p className="text-gray-500">LINE Account</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                  user?.role === 'admin' ? 'bg-red-100 text-red-800' :
                  user?.role === 'committee' ? 'bg-blue-100 text-blue-800' :
                  user?.role === 'member' ? 'bg-green-100 text-green-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {getRoleDisplayName(user?.role || 'guest')}
                </span>
                {user?.memberId && (
                  <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
                    รหัสสมาชิก: {user.memberId}
                  </span>
                )}
              </div>
              <div className="mt-4 text-sm text-gray-500 space-y-1">
                <p>เข้าร่วมเมื่อ: {formatDate(user?.createdAt)}</p>
                <p>เข้าใช้ล่าสุด: {formatDate(user?.lastLoginAt)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Member Info (if linked) */}
        {member ? (
          <>
            {/* Contact Info - Direct Edit */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">ข้อมูลติดต่อ</h2>
                <button
                  onClick={() => setIsEditingContact(!isEditingContact)}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    isEditingContact
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isEditingContact ? 'ยกเลิก' : 'แก้ไข'}
                </button>
              </div>

              {isEditingContact ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                      <input
                        type="tel"
                        value={contactForm.phone}
                        onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์มือถือ</label>
                      <input
                        type="tel"
                        value={contactForm.mobile}
                        onChange={(e) => setContactForm({ ...contactForm, mobile: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                      <input
                        type="email"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">เว็บไซต์</label>
                      <input
                        type="url"
                        value={contactForm.website}
                        onChange={(e) => setContactForm({ ...contactForm, website: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveContact}
                      disabled={saving}
                      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-gray-500">เบอร์โทรศัพท์</dt>
                    <dd className="text-gray-900">{member.phone || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">เบอร์มือถือ</dt>
                    <dd className="text-gray-900">{member.mobile || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">อีเมล</dt>
                    <dd className="text-gray-900">{member.email || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">เว็บไซต์</dt>
                    <dd className="text-gray-900">{member.website || '-'}</dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Personal Info & License - Requires Approval */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">ข้อมูลส่วนตัวและใบอนุญาต</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    การแก้ไขข้อมูลส่วนนี้ต้องได้รับการอนุมัติจากทีมนายทะเบียน
                  </p>
                </div>
                {!isRequestingChange && !hasPendingRequest && (
                  <button
                    onClick={() => setIsRequestingChange(true)}
                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                  >
                    ขอแก้ไขข้อมูล
                  </button>
                )}
              </div>

              {hasPendingRequest && !isRequestingChange && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-yellow-800 font-medium">คุณมีคำขอแก้ไขที่รอการอนุมัติอยู่</span>
                  </div>
                </div>
              )}

              {isRequestingChange ? (
                <div className="space-y-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-orange-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="text-sm text-orange-800">
                        <p className="font-medium">หมายเหตุ:</p>
                        <p>คุณสามารถแก้ไขข้อมูลได้ เมื่อกดส่งคำขอ ระบบจะส่งไปให้ทีมนายทะเบียนตรวจสอบและอนุมัติให้</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อเต็ม (ภาษาไทย)</label>
                      <input
                        type="text"
                        value={changeForm.fullNameTH}
                        onChange={(e) => setChangeForm({ ...changeForm, fullNameTH: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อเล่น</label>
                      <input
                        type="text"
                        value={changeForm.nickname}
                        onChange={(e) => setChangeForm({ ...changeForm, nickname: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบริษัท (ภาษาไทย)</label>
                      <input
                        type="text"
                        value={changeForm.companyNameTH}
                        onChange={(e) => setChangeForm({ ...changeForm, companyNameTH: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อบริษัท (ภาษาอังกฤษ)</label>
                      <input
                        type="text"
                        value={changeForm.companyNameEN}
                        onChange={(e) => setChangeForm({ ...changeForm, companyNameEN: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ตำแหน่งในบริษัท</label>
                      <input
                        type="text"
                        value={changeForm.positionCompany}
                        onChange={(e) => setChangeForm({ ...changeForm, positionCompany: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่ใบอนุญาตนำเที่ยว</label>
                      <input
                        type="text"
                        value={changeForm.licenseNumber}
                        onChange={(e) => setChangeForm({ ...changeForm, licenseNumber: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">LINE ID</label>
                      <input
                        type="text"
                        value={changeForm.lineId}
                        onChange={(e) => setChangeForm({ ...changeForm, lineId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                        placeholder="@example หรือ example"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผลในการขอแก้ไข</label>
                    <textarea
                      value={changeReason}
                      onChange={(e) => setChangeReason(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="กรุณาระบุเหตุผลในการขอแก้ไขข้อมูล"
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setIsRequestingChange(false);
                        setChangeReason('');
                        // Reset form to original values
                        if (member) {
                          setChangeForm({
                            fullNameTH: member.fullNameTH || '',
                            nickname: member.nickname || '',
                            companyNameTH: member.companyNameTH || '',
                            companyNameEN: member.companyNameEN || '',
                            positionCompany: member.positionCompany || '',
                            licenseNumber: member.licenseNumber || '',
                            lineId: member.lineId || '',
                          });
                        }
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={handleSubmitChangeRequest}
                      disabled={submittingRequest}
                      className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50"
                    >
                      {submittingRequest ? 'กำลังส่งคำขอ...' : 'ส่งคำขอแก้ไข'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h3 className="font-medium text-gray-900 mb-3">ข้อมูลส่วนตัว</h3>
                      <dl className="space-y-2">
                        <div>
                          <dt className="text-sm text-gray-500">ชื่อเล่น</dt>
                          <dd className="text-gray-900">{member.nickname || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-gray-500">ชื่อเต็ม</dt>
                          <dd className="text-gray-900">{member.fullNameTH || '-'}</dd>
                        </div>
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
                          <dt className="text-sm text-gray-500">LINE ID</dt>
                          <dd className="text-gray-900">{member.lineId || '-'}</dd>
                        </div>
                      </dl>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900 mb-3">ใบอนุญาตนำเที่ยว</h3>
                      <dl className="space-y-2">
                        <div>
                          <dt className="text-sm text-gray-500">เลขที่ใบอนุญาต</dt>
                          <dd className="text-gray-900">{member.licenseNumber || '-'}</dd>
                        </div>
                        {/* NOTE: License expiry date hidden temporarily while updating Google Sheet data */}
                        {/* <div>
                          <dt className="text-sm text-gray-500">วันหมดอายุใบอนุญาต</dt>
                          <dd className="text-gray-900">{formatThaiDate(member.membershipExpiry)}</dd>
                        </div> */}
                      </dl>
                    </div>
                  </div>

                  {/* Sponsor Info */}
                  <div className="pt-4 border-t">
                    <h3 className="font-medium text-gray-900 mb-3">ผู้รับรองสมาชิก</h3>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>
              )}
            </div>

            {/* Event Attendance Summary */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">กิจกรรมที่เข้าร่วม</h2>

              {loadingAttendance ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : attendance && attendance.eventsAttended.length > 0 ? (
                <div>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <p className="text-3xl font-bold text-blue-600">{attendance.totalEventsThisYear}</p>
                      <p className="text-sm text-blue-700">กิจกรรมปีนี้</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <p className="text-3xl font-bold text-green-600">{attendance.eventsAttended.length}</p>
                      <p className="text-sm text-green-700">กิจกรรมทั้งหมด</p>
                    </div>
                    {attendance.lastAttendedEvent && (
                      <div className="bg-purple-50 rounded-lg p-4 text-center col-span-2 md:col-span-1">
                        <p className="text-sm font-medium text-purple-600 truncate">{attendance.lastAttendedEvent}</p>
                        <p className="text-xs text-purple-700">กิจกรรมล่าสุด</p>
                      </div>
                    )}
                  </div>

                  {/* Attendance Requirement Status */}
                  <div className={`rounded-lg p-4 mb-6 ${
                    attendance.totalEventsThisYear >= 1
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      {attendance.totalEventsThisYear >= 1 ? (
                        <>
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="font-medium text-green-800">ผ่านเกณฑ์การเข้าร่วมกิจกรรมประจำปี</p>
                            <p className="text-sm text-green-700">สมาชิกต้องเข้าร่วมกิจกรรมอย่างน้อย 1 ครั้งต่อปี</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div>
                            <p className="font-medium text-red-800">ยังไม่ผ่านเกณฑ์การเข้าร่วมกิจกรรมประจำปี</p>
                            <p className="text-sm text-red-700">กรุณาเข้าร่วมกิจกรรมอย่างน้อย 1 ครั้งในปีนี้</p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Events List */}
                  <h3 className="font-medium text-gray-900 mb-3">รายการกิจกรรม</h3>
                  <div className="space-y-3">
                    {attendance.eventsAttended.map((event, index) => (
                      <div key={index} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">{event.eventName}</h4>
                            <p className="text-sm text-gray-500">{event.eventDate}</p>
                          </div>
                          <div className="text-right">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              event.checkedIn
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {event.checkedIn ? 'เข้าร่วมแล้ว' : 'ลงทะเบียนแล้ว'}
                            </span>
                            <p className="text-sm text-gray-500 mt-1">{event.attendeeCount} คน</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500">ยังไม่มีประวัติการเข้าร่วมกิจกรรม</p>
                  <p className="text-sm text-gray-400 mt-1">กิจกรรมที่คุณเข้าร่วมจะแสดงที่นี่</p>
                </div>
              )}
            </div>

            {/* Change Request History */}
            {changeRequests.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">ประวัติคำขอแก้ไขข้อมูล</h2>
                <div className="space-y-4">
                  {changeRequests.map((request) => (
                    <div key={request.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {getStatusBadge(request.status)}
                          <span className="text-sm text-gray-500">
                            {formatDateString(request.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {Object.entries(request.changes).map(([field, values]) => (
                          <div key={field} className="text-sm">
                            <span className="text-gray-600">{getFieldLabel(field)}:</span>
                            <span className="ml-2 text-red-600 line-through">{values.oldValue || '(ว่าง)'}</span>
                            <span className="mx-2">→</span>
                            <span className="text-green-600">{values.newValue || '(ว่าง)'}</span>
                          </div>
                        ))}
                      </div>
                      {request.reason && (
                        <p className="text-sm text-gray-500 mt-2">
                          <span className="font-medium">เหตุผล:</span> {request.reason}
                        </p>
                      )}
                      {request.status !== 'pending' && request.processedAt && (
                        <div className="mt-2 pt-2 border-t text-sm text-gray-500">
                          <p>
                            {request.status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}โดย: {request.processedByName || 'Admin'}
                          </p>
                          <p>เมื่อ: {formatDateString(request.processedAt)}</p>
                          {request.adminNote && (
                            <p className="mt-1">
                              <span className="font-medium">หมายเหตุจาก Admin:</span> {request.adminNote}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <h3 className="font-medium text-yellow-800">ยังไม่ได้เชื่อมต่อข้อมูลสมาชิก</h3>
                <p className="text-yellow-700 mt-1">
                  บัญชี LINE ของคุณยังไม่ได้เชื่อมต่อกับข้อมูลสมาชิกใน Google Sheet
                  กรุณาติดต่อผู้ดูแลระบบเพื่อเชื่อมต่อข้อมูล
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
