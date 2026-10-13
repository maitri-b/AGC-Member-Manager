'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Member {
  lineUserId: string;
  displayName: string;
  email?: string;
  licenseNumber?: string;
  licenseStatus?: string;
  lineGroupStatus?: string;
  membershipStatus?: string;
  role?: string;
  testAccount?: boolean;
  isBanned?: boolean;
  bannedAt?: string | null;
  bannedBy?: string | null;
  bannedReason?: string | null;
}

export default function ManageUsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'banned'>('all');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    // Filter members based on search and filter status
    let filtered = members;

    // Filter by status
    if (filterStatus === 'banned') {
      filtered = filtered.filter(m => m.isBanned === true);
    } else if (filterStatus === 'active') {
      filtered = filtered.filter(m => !m.isBanned);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.displayName?.toLowerCase().includes(query) ||
        m.email?.toLowerCase().includes(query) ||
        m.licenseNumber?.toLowerCase().includes(query) ||
        m.lineUserId?.toLowerCase().includes(query)
      );
    }

    setFilteredMembers(filtered);
  }, [searchQuery, filterStatus, members]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/members');
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
        setFilteredMembers(data.members || []);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBanClick = (member: Member) => {
    setSelectedMember(member);
    setBanReason(member.bannedReason || '');
    setShowBanModal(true);
  };

  const handleBanSubmit = async () => {
    if (!selectedMember) return;

    const isBanning = !selectedMember.isBanned;

    if (isBanning && !banReason.trim()) {
      alert('กรุณาระบุเหตุผลในการแบนสมาชิก');
      return;
    }

    if (!confirm(
      isBanning
        ? `คุณต้องการแบนสมาชิก "${selectedMember.displayName}" ใช่หรือไม่?\n\nสมาชิกจะไม่สามารถ:\n- ลงทะเบียนกิจกรรม\n- มองเห็นกิจกรรม\n- รับข้อความ LINE จากระบบ`
        : `คุณต้องการยกเลิกการแบนสมาชิก "${selectedMember.displayName}" ใช่หรือไม่?`
    )) {
      return;
    }

    try {
      setProcessing(true);

      const response = await fetch('/api/admin/members/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedMember.lineUserId,
          isBanned: isBanning,
          banReason: isBanning ? banReason.trim() : null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(isBanning ? '✅ แบนสมาชิกเรียบร้อย' : '✅ ยกเลิกการแบนเรียบร้อย');
        setShowBanModal(false);
        setBanReason('');
        setSelectedMember(null);
        // Refresh member list
        fetchMembers();
      } else {
        alert(`❌ เกิดข้อผิดพลาด: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating ban status:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setProcessing(false);
    }
  };

  const getRoleBadge = (role?: string) => {
    const roleConfig: Record<string, { label: string; bgColor: string; textColor: string }> = {
      admin: { label: 'Admin', bgColor: 'bg-red-100', textColor: 'text-red-800' },
      committee: { label: 'Committee', bgColor: 'bg-purple-100', textColor: 'text-purple-800' },
      'event-co': { label: 'Event Coordinator', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
      'event-staff': { label: 'Event Staff', bgColor: 'bg-cyan-100', textColor: 'text-cyan-800' },
      staff: { label: 'Staff', bgColor: 'bg-indigo-100', textColor: 'text-indigo-800' },
      event_staff: { label: 'Event Staff', bgColor: 'bg-cyan-100', textColor: 'text-cyan-800' },
      member: { label: 'Member', bgColor: 'bg-green-100', textColor: 'text-green-800' },
      guest: { label: 'Guest', bgColor: 'bg-gray-100', textColor: 'text-gray-800' },
    };

    const config = roleConfig[role || 'guest'] || roleConfig.guest;

    return (
      <span className={`px-2 py-0.5 text-xs rounded-full font-semibold ${config.bgColor} ${config.textColor}`}>
        {config.label}
      </span>
    );
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">👥 จัดการสมาชิก</h1>
              <p className="mt-2 text-sm text-gray-600">
                จัดการสิทธิ์และสถานะของสมาชิก
              </p>
            </div>
            <Link
              href="/admin"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              ← กลับหน้าแอดมิน
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ค้นหา
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ชื่อ, อีเมล, LINE ID, เลขใบอนุญาต..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Filter Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สถานะ
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterStatus === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ทั้งหมด ({members.length})
                </button>
                <button
                  onClick={() => setFilterStatus('active')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterStatus === 'active'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ปกติ ({members.filter(m => !m.isBanned).length})
                </button>
                <button
                  onClick={() => setFilterStatus('banned')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterStatus === 'banned'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ถูกแบน ({members.filter(m => m.isBanned).length})
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Members List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สมาชิก
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    เลขใบอนุญาต
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      ไม่พบข้อมูลสมาชิก
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.lineUserId} className={`hover:bg-gray-50 ${member.isBanned ? 'bg-red-50' : ''}`}>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900">{member.displayName}</div>
                          <div className="text-sm text-gray-500">{member.email}</div>
                          {member.isBanned && member.bannedReason && (
                            <div className="text-xs text-red-600 mt-1">
                              เหตุผล: {member.bannedReason}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{member.licenseNumber || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getRoleBadge(member.role)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {member.isBanned ? (
                          <span className="px-3 py-1 text-xs rounded-full bg-red-100 text-red-800 font-semibold">
                            🚫 ถูกแบน
                          </span>
                        ) : (
                          <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800 font-semibold">
                            ✅ ปกติ
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleBanClick(member)}
                          className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                            member.isBanned
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          {member.isBanned ? 'ยกเลิกการแบน' : 'แบนสมาชิก'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-4 text-sm text-gray-600 text-center">
          แสดง {filteredMembers.length} จาก {members.length} สมาชิกทั้งหมด
        </div>
      </div>

      {/* Ban Modal */}
      {showBanModal && selectedMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {selectedMember.isBanned ? 'ยกเลิกการแบนสมาชิก' : 'แบนสมาชิก'}
            </h2>

            <div className="mb-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">{selectedMember.displayName}</div>
                <div className="text-sm text-gray-500">{selectedMember.email}</div>
                <div className="text-sm text-gray-500">License: {selectedMember.licenseNumber || '-'}</div>
              </div>
            </div>

            {!selectedMember.isBanned && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    เหตุผลในการแบน <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="ระบุเหตุผลในการแบนสมาชิก..."
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>

                <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                  <p className="text-sm text-yellow-800">
                    <strong>⚠️ คำเตือน:</strong> เมื่อแบนสมาชิกแล้ว สมาชิกจะ:
                  </p>
                  <ul className="list-disc list-inside text-sm text-yellow-800 mt-2 space-y-1">
                    <li>ไม่สามารถลงทะเบียนกิจกรรมได้</li>
                    <li>ไม่สามารถมองเห็นกิจกรรมต่างๆ</li>
                    <li>ไม่ได้รับข้อความ LINE จากระบบ</li>
                  </ul>
                </div>
              </>
            )}

            {selectedMember.isBanned && selectedMember.bannedReason && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-1">เหตุผลที่แบน:</p>
                <p className="text-sm text-gray-900">{selectedMember.bannedReason}</p>
                {selectedMember.bannedAt && (
                  <p className="text-xs text-gray-500 mt-2">
                    แบนเมื่อ: {new Date(selectedMember.bannedAt).toLocaleString('th-TH')}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setBanReason('');
                  setSelectedMember(null);
                }}
                disabled={processing}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleBanSubmit}
                disabled={processing || (!selectedMember.isBanned && !banReason.trim())}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedMember.isBanned
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {processing ? 'กำลังดำเนินการ...' : selectedMember.isBanned ? 'ยกเลิกการแบน' : 'ยืนยันการแบน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
