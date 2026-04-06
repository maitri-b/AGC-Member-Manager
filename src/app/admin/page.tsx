'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { hasPermission } from '@/lib/permissions';

interface LineHistoryEntry {
  lineUserId: string;
  lineDisplayName: string;
  lineProfilePicture?: string;
  resetAt: { _seconds: number } | string;
  resetBy: string;
  resetByName?: string;
  reason?: string;
}

interface User {
  id: string;
  lineDisplayName?: string;
  lineProfilePicture?: string;
  lineUserId: string;
  role: string;
  memberId?: string;
  isActive: boolean;
  permissions: string[];
  createdAt?: { _seconds: number };
  lastLoginAt?: { _seconds: number };
  licenseNumber?: string;
  phone?: string;
  verificationStatus?: string;
  isSearchLocked?: boolean;
  searchCount?: number;
  lockedAt?: { _seconds: number };
  lockedReason?: string;
  lineHistory?: LineHistoryEntry[];
}

interface SearchLog {
  id: string;
  searchQuery: string;
  searchType: string;
  searchedAt: string;
  attemptNumber: number;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    role: '',
    memberId: '',
    isActive: true,
  });
  const [searchLogs, setSearchLogs] = useState<SearchLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showResetLineModal, setShowResetLineModal] = useState(false);
  const [resetLineReason, setResetLineReason] = useState('');
  const [resetLineLoading, setResetLineLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && !hasPermission(session?.user?.permissions || [], 'admin:access')) {
      router.push('/unauthorized');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (session && hasPermission(session.user.permissions || [], 'admin:users')) {
      fetchUsers();
    }
  }, [session]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = async (user: User) => {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      memberId: user.memberId || '',
      isActive: user.isActive,
    });
    setSearchLogs([]);

    // Fetch search logs for this user
    if (user.searchCount && user.searchCount > 0) {
      setLoadingLogs(true);
      try {
        const response = await fetch(`/api/admin/users/${user.id}/search-logs`);
        if (response.ok) {
          const data = await response.json();
          setSearchLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Error fetching search logs:', err);
      } finally {
        setLoadingLogs(false);
      }
    }
  };

  const handleUnlockSearch = async () => {
    if (!editingUser) return;

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          unlockSearch: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to unlock user');

      setSuccess('ปลดล็อคการค้นหาเรียบร้อยแล้ว');
      setEditingUser(null);
      setSearchLogs([]);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleResetLineConnection = async () => {
    if (!editingUser) return;

    setResetLineLoading(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          resetLineConnection: true,
          resetReason: resetLineReason || 'เปลี่ยน LINE Account',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset LINE connection');
      }

      setSuccess(`รีเซ็ตการเชื่อมต่อ LINE สำหรับ ${editingUser.lineDisplayName} เรียบร้อยแล้ว สมาชิกสามารถล็อกอินด้วย LINE Account ใหม่และยืนยันตัวตนใหม่ได้`);
      setShowResetLineModal(false);
      setResetLineReason('');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setResetLineLoading(false);
    }
  };

  const formatLineHistoryDate = (timestamp: { _seconds: number } | string) => {
    if (typeof timestamp === 'string') {
      return new Date(timestamp).toLocaleString('th-TH');
    }
    return new Date(timestamp._seconds * 1000).toLocaleString('th-TH');
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          role: editForm.role,
          memberId: editForm.memberId || null,
          isActive: editForm.isActive,
        }),
      });

      if (!response.ok) throw new Error('Failed to update user');

      setSuccess('บันทึกข้อมูลเรียบร้อยแล้ว');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'committee': return 'bg-blue-100 text-blue-800';
      case 'member': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (timestamp?: { _seconds: number }) => {
    if (!timestamp) return '-';
    return new Date(timestamp._seconds * 1000).toLocaleString('th-TH');
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">จัดการระบบ</h1>
          <p className="text-gray-600 mt-1">จัดการผู้ใช้งานและสิทธิ์การเข้าถึง</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="float-right">&times;</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            {success}
            <button onClick={() => setSuccess(null)} className="float-right">&times;</button>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mb-6 flex flex-wrap gap-3">
          <a
            href="/admin/applications"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            ใบสมัครสมาชิก
          </a>
          <a
            href="/admin/verification"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            คำขอยืนยันตัวตน
          </a>
          <a
            href="/admin/profile-changes"
            className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            คำขอแก้ไขข้อมูล
          </a>
          <a
            href="/admin/disputes"
            className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            คำร้องแจ้งปัญหา
          </a>
          <a
            href="/admin/events"
            className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            จัดการกิจกรรม
          </a>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">ผู้ใช้ทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900">{users.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">ผู้ดูแลระบบ</p>
            <p className="text-2xl font-bold text-red-600">{users.filter(u => u.role === 'admin').length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">กรรมการ</p>
            <p className="text-2xl font-bold text-blue-600">{users.filter(u => u.role === 'committee').length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">รอการอนุมัติ</p>
            <p className="text-2xl font-bold text-yellow-600">{users.filter(u => u.role === 'guest').length}</p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">รายชื่อผู้ใช้งาน</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ผู้ใช้
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    บทบาท
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รหัสสมาชิก
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    เลขใบอนุญาต
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    เบอร์โทร
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    เข้าใช้ล่าสุด
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {user.lineProfilePicture ? (
                          <img
                            src={user.lineProfilePicture}
                            alt={user.lineDisplayName || 'User'}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-gray-500 text-sm">
                              {user.lineDisplayName?.charAt(0) || '?'}
                            </span>
                          </div>
                        )}
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-900">{user.lineDisplayName || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">ID: {user.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {getRoleDisplayName(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.memberId || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.licenseNumber || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.phone || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {user.verificationStatus === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            รอพิจารณาคำขอ
                          </span>
                        )}
                        {user.verificationStatus === 'verified' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ยืนยันตัวตนแล้ว
                          </span>
                        )}
                        {user.verificationStatus === 'rejected' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ถูกปฏิเสธ
                          </span>
                        )}
                        {user.isSearchLocked && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                            🔒 Locked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.lastLoginAt)}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 my-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">แก้ไขข้อมูลผู้ใช้</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  {editingUser.lineProfilePicture ? (
                    <img
                      src={editingUser.lineProfilePicture}
                      alt={editingUser.lineDisplayName || 'User'}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-500">{editingUser.lineDisplayName?.charAt(0) || '?'}</span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{editingUser.lineDisplayName}</p>
                    <p className="text-sm text-gray-500">LINE ID: {editingUser.id.slice(0, 12)}...</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท</label>
                  <select
                    value={editForm.role}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="guest">ผู้เยี่ยมชม (Guest)</option>
                    <option value="member">สมาชิก (Member)</option>
                    <option value="committee">กรรมการ (Committee)</option>
                    <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">รหัสสมาชิก</label>
                  <input
                    type="text"
                    value={editForm.memberId}
                    onChange={(e) => setEditForm({ ...editForm, memberId: e.target.value })}
                    placeholder="เช่น 24001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">ใส่รหัสสมาชิกเพื่อเชื่อมต่อกับข้อมูลใน Google Sheet</p>
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.isActive}
                      onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm font-medium text-gray-700">เปิดใช้งาน (Active)</span>
                  </label>
                </div>

                {/* Reset LINE Connection Section - Only for verified members with memberId */}
                {editingUser.memberId && (editingUser.verificationStatus === 'verified' || editingUser.role === 'member' || editingUser.role === 'committee' || editingUser.role === 'admin') && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      เปลี่ยน LINE Account
                    </h4>
                    <div className="bg-purple-50 rounded-lg p-3 mb-3">
                      <p className="text-sm text-purple-800">
                        หากสมาชิกต้องการเปลี่ยน LINE Account ที่ใช้เข้าระบบ
                        กดปุ่มด้านล่างเพื่อรีเซ็ตการเชื่อมต่อ LINE
                      </p>
                      <p className="text-xs text-purple-600 mt-1">
                        รหัสสมาชิก: <span className="font-semibold">{editingUser.memberId}</span> จะยังคงอยู่
                      </p>
                    </div>

                    <button
                      onClick={() => setShowResetLineModal(true)}
                      className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      รีเซ็ตการเชื่อมต่อ LINE
                    </button>

                    {/* LINE History */}
                    {editingUser.lineHistory && editingUser.lineHistory.length > 0 && (
                      <div className="mt-4">
                        <h5 className="text-xs font-semibold text-gray-700 mb-2">ประวัติ LINE Account เดิม:</h5>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {editingUser.lineHistory.map((entry, index) => (
                            <div key={index} className="text-xs bg-white border border-gray-200 rounded px-2 py-1">
                              <div className="flex justify-between">
                                <span className="font-medium text-gray-800">{entry.lineDisplayName}</span>
                                <span className="text-gray-500">
                                  {formatLineHistoryDate(entry.resetAt)}
                                </span>
                              </div>
                              {entry.reason && (
                                <div className="text-gray-500 mt-0.5">เหตุผล: {entry.reason}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Search Lock Section */}
                {(editingUser.isSearchLocked || (editingUser.searchCount && editingUser.searchCount > 0)) && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      สถานะการค้นหา
                    </h4>

                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">จำนวนครั้งที่ค้นหา:</span>
                        <span className="text-sm font-medium">{editingUser.searchCount || 0} / 3 ครั้ง</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">สถานะ:</span>
                        {editingUser.isSearchLocked ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                            🔒 ถูกล็อค
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ปกติ
                          </span>
                        )}
                      </div>
                      {editingUser.lockedReason && (
                        <div className="mt-2 text-xs text-orange-600">
                          สาเหตุ: {editingUser.lockedReason}
                        </div>
                      )}
                    </div>

                    {editingUser.isSearchLocked && (
                      <button
                        onClick={handleUnlockSearch}
                        className="w-full px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                        ปลดล็อคการค้นหา
                      </button>
                    )}

                    {/* Search History */}
                    {searchLogs.length > 0 && (
                      <div className="mt-4">
                        <h5 className="text-xs font-semibold text-gray-700 mb-2">ประวัติการค้นหา:</h5>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {searchLogs.map((log) => (
                            <div key={log.id} className="text-xs bg-white border border-gray-200 rounded px-2 py-1">
                              <div className="flex justify-between">
                                <span className="font-medium text-gray-800">ครั้งที่ {log.attemptNumber}:</span>
                                <span className="text-gray-500">
                                  {new Date(log.searchedAt).toLocaleString('th-TH')}
                                </span>
                              </div>
                              <div className="text-gray-600">
                                ค้นหา: <span className="font-mono">{log.searchQuery}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {loadingLogs && (
                      <div className="mt-2 text-xs text-gray-500 text-center">กำลังโหลดประวัติ...</div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleSaveUser}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Reset LINE Connection Confirmation Modal */}
      {showResetLineModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200 bg-purple-50">
              <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                ยืนยันการรีเซ็ต LINE
              </h3>
            </div>
            <div className="p-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800 font-medium mb-2">การดำเนินการนี้จะ:</p>
                <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                  <li>ลบการเชื่อมต่อ LINE Account ปัจจุบัน</li>
                  <li>เก็บประวัติ LINE เดิมไว้</li>
                  <li>คงรหัสสมาชิก <span className="font-semibold">{editingUser.memberId}</span> และสิทธิ์เดิมไว้</li>
                  <li>ล้างข้อมูล LINE ใน Google Sheet</li>
                </ul>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-700 mb-2">
                  หลังจากรีเซ็ต สมาชิกต้อง:
                </p>
                <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
                  <li>ล็อกอินด้วย LINE Account ใหม่</li>
                  <li>ยืนยันตัวตนใหม่ด้วยรหัสสมาชิกเดิม ({editingUser.memberId})</li>
                </ol>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เหตุผล (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={resetLineReason}
                  onChange={(e) => setResetLineReason(e.target.value)}
                  placeholder="เช่น เปลี่ยนเบอร์โทรศัพท์"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetLineModal(false);
                  setResetLineReason('');
                }}
                disabled={resetLineLoading}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleResetLineConnection}
                disabled={resetLineLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {resetLineLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    กำลังดำเนินการ...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    ยืนยันรีเซ็ต
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
