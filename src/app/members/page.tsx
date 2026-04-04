'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Member, parseThaiDate } from '@/types/member';
import Navbar from '@/components/Navbar';
import { Toast, useToast } from '@/components/Toast';

// Notification Modal Component
function NotificationModal({
  member,
  onClose,
  onSend,
  sending,
}: {
  member: Member;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  const message = `สวัสดีครับ คุณ${member.fullNameTH || member.nickname || ''}
บริษัท ${member.companyNameTH || member.companyNameEN || ''}

ทางทีมทะเบียนชมรม Agents Club ตรวจพบว่า
ใบอนุญาตธุรกิจนำเที่ยว เลขที่ ${member.licenseNumber || '-'}
มีสถานะ ${member.status || '-'} (หมดอายุ ${member.membershipExpiry || member.licenseExpiry || '-'})

หากคุณได้ต่ออายุใบอนุญาตแล้ว หรือมีข้อมูลที่อัพเดท
รบกวนส่งสำเนาใบอนุญาตใหม่มาทาง LINE นี้ด้วยนะครับ

เนื่องจากนโยบายของชมรม อนุญาตให้เฉพาะสมาชิกที่มีใบอนุญาตที่ยังไม่หมดอายุอยู่ในกลุ่ม
หากไม่ได้รับการติดต่อกลับ ทางทีมทะเบียนจะขอนำชื่อออกจาก LINE กลุ่มไว้ก่อนนะครับ

ถ้าทีมทะเบียนได้รับข้อมูลอัพเดทและตรวจสอบเรียบร้อยแล้ว
ทีมงานจะนำกลับเข้ากลุ่มให้ทันทีครับ

ขอบคุณครับ
ไมตรี บุญกิจรุ่งไพศาล
ทีมทะเบียนชมรม Agents Club`;

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">แจ้งเตือนสมาชิก</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-sm text-gray-700 font-mono">
            {message}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-md flex items-center gap-2 ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                คัดลอกแล้ว
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                คัดลอกข้อความ
              </>
            )}
          </button>

          {member.lineUserId && (
            <button
              onClick={onSend}
              disabled={sending}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังส่ง...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                  ส่ง LINE แจ้ง
                </>
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MembersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLineStatus, setFilterLineStatus] = useState('');
  const [filterExpiry, setFilterExpiry] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [notifyMember, setNotifyMember] = useState<Member | null>(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchAllMembers();
  }, []);

  const fetchAllMembers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/members');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch members');
      }
      const data = await response.json();
      setAllMembers(data.members);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // Calculate all unique statuses from all members (not filtered)
  const allStatuses = useMemo(() => {
    const statuses = [...new Set(allMembers.map((m) => m.status).filter(Boolean))] as string[];
    return statuses.sort();
  }, [allMembers]);

  // Calculate all unique LINE statuses
  const allLineStatuses = useMemo(() => {
    const lineStatuses = [...new Set(allMembers.map((m) => m.lineGroupStatus).filter(Boolean))] as string[];
    return lineStatuses.sort();
  }, [allMembers]);

  // Thai month names (abbreviated)
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // Format date to Thai format: "3 มี.ค. 2570"
  const formatThaiDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    const date = parseThaiDate(dateStr);
    if (!date) return dateStr;

    const day = date.getDate();
    const month = thaiMonths[date.getMonth()];
    const year = date.getFullYear() + 543; // Convert to Buddhist Era

    return `${day} ${month} ${year}`;
  };

  // Check if date is expired
  const isExpired = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = parseThaiDate(dateStr);
    if (!date) return false;
    return date < new Date();
  };

  // Helper to check license expiry - using membershipExpiry field which maps to column S (วันที่หมดอายุ)
  const getLicenseExpiryStatus = (member: Member): 'expired' | 'within45' | 'within90' | 'ok' | 'unknown' => {
    // Use membershipExpiry (column S - วันที่หมดอายุ) for license expiry filtering
    const dateStr = member.membershipExpiry;
    if (!dateStr) return 'unknown';
    const expiry = parseThaiDate(dateStr);
    if (!expiry) return 'unknown';

    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired';
    if (diffDays <= 45) return 'within45';
    if (diffDays <= 90) return 'within90';
    return 'ok';
  };

  // Filter members based on all criteria
  const filteredMembers = useMemo(() => {
    return allMembers.filter((member) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const searchMatch =
          member.memberId?.toLowerCase().includes(searchLower) ||
          member.fullNameTH?.toLowerCase().includes(searchLower) ||
          member.nickname?.toLowerCase().includes(searchLower) ||
          member.companyNameEN?.toLowerCase().includes(searchLower) ||
          member.companyNameTH?.toLowerCase().includes(searchLower) ||
          member.mobile?.includes(search) ||
          member.phone?.includes(search) ||
          member.licenseNumber?.toLowerCase().includes(searchLower);
        if (!searchMatch) return false;
      }

      // Status filter
      if (filterStatus && member.status !== filterStatus) return false;

      // LINE status filter
      if (filterLineStatus) {
        if (filterLineStatus === 'อยู่ในกลุ่ม') {
          if (!(member.lineGroupStatus === 'อยู่ในกลุ่ม' || member.lineGroupStatus?.includes('อยู่'))) return false;
        } else if (filterLineStatus === 'ออกจากกลุ่ม') {
          if (!(member.lineGroupStatus === 'ออกจากกลุ่ม' || member.lineGroupStatus?.includes('ออก'))) return false;
        } else if (member.lineGroupStatus !== filterLineStatus) {
          return false;
        }
      }

      // Expiry filter
      if (filterExpiry) {
        const expiryStatus = getLicenseExpiryStatus(member);
        if (filterExpiry === 'expired' && expiryStatus !== 'expired') return false;
        if (filterExpiry === 'within45' && expiryStatus !== 'within45' && expiryStatus !== 'expired') return false;
        if (filterExpiry === 'within90' && expiryStatus !== 'within90' && expiryStatus !== 'within45' && expiryStatus !== 'expired') return false;
      }

      return true;
    });
  }, [allMembers, search, filterStatus, filterLineStatus, filterExpiry]);

  const handleClearFilters = () => {
    setSearch('');
    setFilterStatus('');
    setFilterLineStatus('');
    setFilterExpiry('');
  };

  const handleSendProfile = async (memberId: string, memberName: string) => {
    setSendingTo(memberId);
    try {
      const response = await fetch('/api/line/send-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send message');
      }
      toast.success(`ส่งข้อมูลไปยัง ${memberName} เรียบร้อยแล้ว`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งข้อความ');
    } finally {
      setSendingTo(null);
    }
  };

  const handleSendNotification = async () => {
    if (!notifyMember) return;

    setSendingNotification(true);
    try {
      const response = await fetch('/api/line/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: notifyMember.memberId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send notification');
      }
      toast.success(`ส่งแจ้งเตือนไปยัง ${notifyMember.nickname || notifyMember.fullNameTH} เรียบร้อยแล้ว`);
      setNotifyMember(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งแจ้งเตือน');
    } finally {
      setSendingNotification(false);
    }
  };

  // Check if status is not normal
  const isStatusNotNormal = (status: string | undefined) => {
    if (!status) return false;
    const normalStatuses = ['ปกติ', 'active', 'Active'];
    return !normalStatuses.includes(status);
  };

  if (status === 'loading') {
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">รายชื่อสมาชิก</h1>
          <p className="text-gray-600 mt-1">สมาชิก Agents Club ทั้งหมด</p>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหา</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ชื่อ, บริษัท, รหัส, เบอร์โทร..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะใบอนุญาต</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                {allStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะไลน์กลุ่ม</label>
              <select
                value={filterLineStatus}
                onChange={(e) => setFilterLineStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                {allLineStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันหมดอายุใบอนุญาต</label>
              <select
                value={filterExpiry}
                onChange={(e) => setFilterExpiry(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                <option value="expired">หมดอายุแล้ว</option>
                <option value="within45">หมดอายุภายใน 45 วัน</option>
                <option value="within90">หมดอายุภายใน 3 เดือน</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleClearFilters}
                className="w-full px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                ล้างตัวกรอง
              </button>
            </div>
          </div>
        </div>

        {/* Members Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              ไม่พบข้อมูลสมาชิก
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <span className="text-sm text-gray-600">พบ {filteredMembers.length} รายการ (จากทั้งหมด {allMembers.length} รายการ)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>
                        สถานะไลน์
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '50px' }}>
                        รหัส
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '220px' }}>
                        ชื่อ
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ minWidth: '180px' }}>
                        บริษัท
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '120px' }}>
                        ใบอนุญาต
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '100px' }}>
                        ชื่อไลน์
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '100px' }}>
                        เบอร์โทร
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>
                        สถานะ
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '90px' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredMembers.map((member) => (
                      <tr key={member.memberId} className="hover:bg-gray-50">
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                            member.lineGroupStatus === 'อยู่ในกลุ่ม' || member.lineGroupStatus?.includes('อยู่')
                              ? 'bg-green-100 text-green-800'
                              : member.lineGroupStatus === 'ออกจากกลุ่ม' || member.lineGroupStatus?.includes('ออก')
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {member.lineGroupStatus === 'ออกจากกลุ่ม' || member.lineGroupStatus?.includes('ออก')
                              ? 'ออกแล้ว'
                              : member.lineGroupStatus === 'อยู่ในกลุ่ม' || member.lineGroupStatus?.includes('อยู่')
                              ? 'อยู่'
                              : (member.lineGroupStatus || '-')}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-sm font-medium text-gray-900">
                          {member.memberId}
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-sm font-medium text-gray-900 truncate" style={{ maxWidth: '210px' }}>
                            {member.nickname || '-'}
                          </div>
                          <div className="text-xs text-gray-500 truncate" style={{ maxWidth: '210px' }}>
                            {member.fullNameTH || '-'}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-sm text-gray-900 truncate" style={{ maxWidth: '200px' }}>
                            {member.companyNameEN || member.companyNameTH || '-'}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-sm text-gray-600">
                            {member.licenseNumber || '-'}
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            {isExpired(member.membershipExpiry) && (
                              <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className={isExpired(member.membershipExpiry) ? 'text-red-600 font-medium' : 'text-gray-500'}>
                              {formatThaiDate(member.membershipExpiry)}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-600 truncate" style={{ maxWidth: '100px' }}>
                          {member.lineName || '-'}
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-600">
                          {member.mobile || member.phone || '-'}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                            member.status?.toLowerCase() === 'active' || member.status === 'ปกติ'
                              ? 'bg-green-100 text-green-800'
                              : member.status?.toLowerCase() === 'inactive' || member.status === 'ไม่ปกติ'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {member.status || '-'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => router.push(`/members/${member.memberId}`)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              ดู
                            </button>

                            {/* Notification button for non-normal status */}
                            {isStatusNotNormal(member.status) && (
                              <button
                                onClick={() => setNotifyMember(member)}
                                className="text-orange-600 hover:text-orange-800 text-sm font-medium ml-1"
                                title="แจ้งเตือนสมาชิก"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                              </button>
                            )}

                            {member.lineUserId && (
                              <button
                                onClick={() => handleSendProfile(member.memberId, member.nickname || member.fullNameTH)}
                                disabled={sendingTo === member.memberId}
                                className="inline-flex items-center text-green-600 hover:text-green-800 text-sm font-medium disabled:opacity-50 ml-1"
                                title="ส่งข้อมูลสมาชิกผ่าน LINE"
                              >
                                {sendingTo === member.memberId ? (
                                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                ) : (
                                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Notification Modal */}
      {notifyMember && (
        <NotificationModal
          member={notifyMember}
          onClose={() => setNotifyMember(null)}
          onSend={handleSendNotification}
          sending={sendingNotification}
        />
      )}

      {/* Toast Notifications */}
      <Toast toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  );
}
