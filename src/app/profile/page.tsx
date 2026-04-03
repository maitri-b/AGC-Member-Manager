'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Member } from '@/types/member';
import Navbar from '@/components/Navbar';

interface UserProfile {
  id: string;
  name: string;
  image?: string;
  role: string;
  memberId?: string;
  permissions: string[];
  displayName?: string;
  pictureUrl?: string;
  email?: string;
  createdAt?: { _seconds: number };
  lastLoginAt?: { _seconds: number };
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: '',
    mobile: '',
    email: '',
    lineId: '',
    website: '',
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchProfile();
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
        setEditForm({
          phone: data.member.phone || '',
          mobile: data.member.mobile || '',
          email: data.member.email || '',
          lineId: data.member.lineId || '',
          website: data.member.website || '',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) throw new Error('Failed to update profile');

      setSuccess('บันทึกข้อมูลเรียบร้อยแล้ว');
      setIsEditing(false);
      fetchProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
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
            {user?.pictureUrl || session?.user?.image ? (
              <img
                src={user?.pictureUrl || session?.user?.image || ''}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center text-2xl text-gray-400">
                {session?.user?.name?.charAt(0) || '?'}
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-900">{user?.displayName || session?.user?.name}</h3>
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
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">ข้อมูลสมาชิก Agents Club</h2>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`px-4 py-2 rounded-md transition-colors ${
                  isEditing
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isEditing ? 'ยกเลิก' : 'แก้ไขข้อมูล'}
              </button>
            </div>

            {isEditing ? (
              <div className="space-y-6">
                {/* Contact Info */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">ข้อมูลติดต่อ</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                      <input
                        type="tel"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์มือถือ</label>
                      <input
                        type="tel"
                        value={editForm.mobile}
                        onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">LINE ID</label>
                      <input
                        type="text"
                        value={editForm.lineId}
                        onChange={(e) => setEditForm({ ...editForm, lineId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">เว็บไซต์</label>
                      <input
                        type="url"
                        value={editForm.website}
                        onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Basic Info */}
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
                        <dt className="text-sm text-gray-500">บริษัท</dt>
                        <dd className="text-gray-900">{member.companyNameEN || member.companyNameTH || '-'}</dd>
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
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">ข้อมูลติดต่อ</h3>
                    <dl className="space-y-2">
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
                        <dt className="text-sm text-gray-500">LINE ID</dt>
                        <dd className="text-gray-900">{member.lineId || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-gray-500">เว็บไซต์</dt>
                        <dd className="text-gray-900">{member.website || '-'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {/* License Info */}
                <div className="pt-4 border-t">
                  <h3 className="font-medium text-gray-900 mb-3">ใบอนุญาตนำเที่ยว</h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-500">เลขที่ใบอนุญาต</dt>
                      <dd className="text-gray-900">{member.licenseNumber || '-'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">วันหมดอายุ</dt>
                      <dd className="text-gray-900">{member.licenseExpiry || '-'}</dd>
                    </div>
                  </dl>
                </div>

                {/* Membership Info */}
                <div className="pt-4 border-t">
                  <h3 className="font-medium text-gray-900 mb-3">ข้อมูลสมาชิกภาพ</h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-500">สถานะ</dt>
                      <dd>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          member.status?.toLowerCase() === 'active' || member.status === 'ปกติ'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {member.status || '-'}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">วันหมดอายุสมาชิกภาพ</dt>
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
              </div>
            )}
          </div>
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
