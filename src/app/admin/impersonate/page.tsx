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
}

export default function ImpersonatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'test' | 'real'>('all');
  const [impersonating, setImpersonating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    // Filter members based on search and filter type
    let filtered = members;

    // Filter by type
    if (filterType === 'test') {
      filtered = filtered.filter(m => m.testAccount === true);
    } else if (filterType === 'real') {
      filtered = filtered.filter(m => !m.testAccount);
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
  }, [searchQuery, filterType, members]);

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

  const handleImpersonate = async (targetUserId: string, userName: string) => {
    if (!confirm(`คุณต้องการดูระบบในมุมมองของ "${userName}" ใช่หรือไม่?`)) {
      return;
    }

    try {
      setImpersonating(true);
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ กำลังดูระบบในมุมมองของ ${userName}\n\nคุณจะถูก redirect ไปหน้าหลัก`);
        // Redirect to dashboard
        window.location.href = '/dashboard';
      } else {
        alert(`❌ ไม่สามารถ impersonate ได้: ${data.error}`);
      }
    } catch (error) {
      console.error('Error impersonating:', error);
      alert('เกิดข้อผิดพลาด');
    } finally {
      setImpersonating(false);
    }
  };

  const getRoleBadge = (role?: string) => {
    const roleConfig: Record<string, { label: string; bgColor: string; textColor: string }> = {
      admin: { label: 'Admin', bgColor: 'bg-red-100', textColor: 'text-red-800' },
      committee: { label: 'Committee', bgColor: 'bg-purple-100', textColor: 'text-purple-800' },
      'event-co': { label: 'Event Coordinator', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
      'event-staff': { label: 'Event Staff', bgColor: 'bg-cyan-100', textColor: 'text-cyan-800' },
      staff: { label: 'Staff', bgColor: 'bg-indigo-100', textColor: 'text-indigo-800' },
      event_staff: { label: 'Event Staff', bgColor: 'bg-cyan-100', textColor: 'text-cyan-800' }, // Legacy support
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

  const getStatusBadge = (member: Member) => {
    const badges = [];

    // Test Account Badge
    if (member.testAccount) {
      badges.push(
        <span key="test" className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800 font-semibold">
          TEST
        </span>
      );
    }

    // Role Badge (always show)
    badges.push(
      <span key="role">
        {getRoleBadge(member.role)}
      </span>
    );

    // License Status Badges
    if (member.licenseStatus === 'expired') {
      badges.push(
        <span key="expired" className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-800">
          Expired
        </span>
      );
    }

    if (member.licenseStatus === 'suspended') {
      badges.push(
        <span key="suspended" className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800">
          Suspended
        </span>
      );
    }

    // LINE Group Status
    if (member.lineGroupStatus === 'left') {
      badges.push(
        <span key="left" className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800">
          Left Group
        </span>
      );
    }

    return badges;
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
              <h1 className="text-3xl font-bold text-gray-900">👁️ User Impersonation</h1>
              <p className="mt-2 text-sm text-gray-600">
                View the system as another user for testing and debugging
              </p>
            </div>
            <Link
              href="/admin"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              ← Back to Admin
            </Link>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <strong>⚠️ ข้อควรระวัง:</strong> การ impersonate จะมีการบันทึก audit log ทุกครั้ง
                และคุณจะเห็นระบบจากมุมมองของผู้ใช้คนนั้นทั้งหมด (permissions, data visibility)
              </p>
            </div>
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

            {/* Filter Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ประเภทบัญชี
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilterType('all')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterType === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All ({members.length})
                </button>
                <button
                  onClick={() => setFilterType('test')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterType === 'test'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Test ({members.filter(m => m.testAccount).length})
                </button>
                <button
                  onClick={() => setFilterType('real')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterType === 'real'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Real ({members.filter(m => !m.testAccount).length})
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
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    License
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                      ไม่พบข้อมูลผู้ใช้
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((member) => (
                    <tr key={member.lineUserId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-gray-900">{member.displayName}</div>
                          <div className="text-sm text-gray-500">{member.email}</div>
                          <div className="text-xs text-gray-400 font-mono">{member.lineUserId}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{member.licenseNumber || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {getStatusBadge(member)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleImpersonate(member.lineUserId, member.displayName)}
                          disabled={impersonating || member.lineUserId === session?.user?.id}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                          {member.lineUserId === session?.user?.id ? 'You' : 'View as User'}
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
          แสดง {filteredMembers.length} จาก {members.length} ผู้ใช้ทั้งหมด
        </div>
      </div>
    </div>
  );
}
