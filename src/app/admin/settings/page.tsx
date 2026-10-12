'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SystemSettings } from '@/types/settings';
import { toast } from 'react-hot-toast';
import { hasPermission } from '@/lib/permissions';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cacheMonths, setCacheMonths] = useState(12);
  const [formData, setFormData] = useState({
    baseUrl: '',
    websiteName: '',
    websiteNameEN: '',
    contactEmail: '',
    contactPhone: '',
    lineOfficialAccount: '',
    defaultLanguage: 'th' as 'th' | 'en',
    timezone: 'Asia/Bangkok',
    enableEmailNotifications: false,
    enableLineNotifications: true,
    enableSmsNotifications: false,
  });

  // LINE Groups state
  const [lineGroups, setLineGroups] = useState<any[]>([]);
  const [lineGroupsLoading, setLineGroupsLoading] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [savingGroupName, setSavingGroupName] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated') {
      // Check if user is admin with proper permissions
      const isAdmin = session?.user?.role === 'admin' && hasPermission(session?.user?.permissions || [], 'admin:access');
      if (!isAdmin) {
        toast.error('ไม่มีสิทธิ์เข้าถึงหน้านี้');
        router.push('/dashboard');
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (session?.user?.role === 'admin' && hasPermission(session?.user?.permissions || [], 'admin:access') && !settings) {
      fetchSettings();
      fetchLineGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.role]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');

      const data = await response.json();
      setSettings(data);
      setFormData({
        baseUrl: data.baseUrl || '',
        websiteName: data.websiteName || '',
        websiteNameEN: data.websiteNameEN || '',
        contactEmail: data.contactEmail || '',
        contactPhone: data.contactPhone || '',
        lineOfficialAccount: data.lineOfficialAccount || '',
        defaultLanguage: data.defaultLanguage || 'th',
        timezone: data.timezone || 'Asia/Bangkok',
        enableEmailNotifications: data.enableEmailNotifications ?? false,
        enableLineNotifications: data.enableLineNotifications ?? true,
        enableSmsNotifications: data.enableSmsNotifications ?? false,
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchLineGroups = async () => {
    try {
      setLineGroupsLoading(true);
      const response = await fetch('/api/line/groups');
      if (!response.ok) throw new Error('Failed to fetch LINE groups');
      const data = await response.json();
      setLineGroups(data.groups || []);
    } catch (error) {
      console.error('Error fetching LINE groups:', error);
      toast.error('ไม่สามารถโหลดข้อมูล LINE Groups ได้');
    } finally {
      setLineGroupsLoading(false);
    }
  };

  const handleEditGroupName = (groupId: string, currentName: string) => {
    setEditingGroupId(groupId);
    setEditingGroupName(currentName || '');
  };

  const handleSaveGroupName = async (groupId: string) => {
    try {
      setSavingGroupName(true);
      const response = await fetch(`/api/line/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupName: editingGroupName }),
      });

      if (!response.ok) throw new Error('Failed to update group name');

      toast.success('บันทึกชื่อกลุ่มสำเร็จ');
      setEditingGroupId(null);
      fetchLineGroups();
    } catch (error) {
      console.error('Error updating group name:', error);
      toast.error('ไม่สามารถบันทึกชื่อกลุ่มได้');
    } finally {
      setSavingGroupName(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('คัดลอก Group ID แล้ว');
  };

  const handleRebuildCache = async () => {
    setCacheLoading(true);
    setCacheMessage(null);
    try {
      const response = await fetch('/api/admin/attendance-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ months: cacheMonths }),
      });
      const data = await response.json();

      if (response.ok) {
        setCacheMessage({
          type: 'success',
          text: `สำเร็จ: ${data.memberCount} สมาชิก, ${data.eventCount} กิจกรรม`,
        });
        toast.success(`Rebuild Cache สำเร็จ: ${data.memberCount} สมาชิก, ${data.eventCount} กิจกรรม`);
        // Clear message after 5 seconds
        setTimeout(() => setCacheMessage(null), 5000);
      } else {
        setCacheMessage({
          type: 'error',
          text: data.error || 'ไม่สามารถสร้าง Cache ได้',
        });
        toast.error(data.error || 'ไม่สามารถสร้าง Cache ได้');
      }
    } catch (err) {
      setCacheMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setCacheLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.baseUrl || !formData.websiteName) {
      toast.error('กรุณากรอก Base URL และชื่อเว็บไซต์');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save settings');
      }

      const data = await response.json();
      setSettings(data.settings);
      toast.success('บันทึกการตั้งค่าเรียบร้อย');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(error instanceof Error ? error.message : 'ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSaving(false);
    }
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

  // Check if user has both admin role and admin:access permission
  const isAdmin = session?.user?.role === 'admin' && hasPermission(session?.user?.permissions || [], 'admin:access');

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4">
            <svg className="w-20 h-20 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-600 mb-2">ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
          <p className="text-gray-600 mb-6">หน้านี้เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น</p>
          <Link href="/dashboard" className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">ตั้งค่าระบบ</h1>
              <p className="text-sm text-gray-500 mt-1">System Settings & Configuration</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Quick Links to Other Settings Pages */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Link
            href="/admin/settings/notifications"
            className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow border-l-4 border-blue-500"
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">การตั้งค่าการแจ้งเตือน</h3>
                <p className="text-sm text-gray-500">กำหนดว่าระบบจะส่งการแจ้งเตือนไปที่ไหนบ้าง</p>
              </div>
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Website Configuration */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">ข้อมูลเว็บไซต์</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Base URL * <span className="text-gray-500 font-normal">(URL หลักของระบบ)</span>
                </label>
                <input
                  type="url"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://agc-member-manager.vercel.app"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  URL นี้จะถูกใช้ในการสร้างลิงก์ต่างๆ เช่น ลิงก์ในข้อความ LINE, อีเมล, ฯลฯ
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ชื่อเว็บไซต์ (ไทย) *
                </label>
                <input
                  type="text"
                  value={formData.websiteName}
                  onChange={(e) => setFormData({ ...formData, websiteName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="ระบบจัดการสมาชิก Agents Club"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ชื่อเว็บไซต์ (English)
                </label>
                <input
                  type="text"
                  value={formData.websiteNameEN}
                  onChange={(e) => setFormData({ ...formData, websiteNameEN: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Agents Club Member Manager"
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">ข้อมูลติดต่อ</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  อีเมลติดต่อ
                </label>
                <input
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="support@agentsclub.co"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เบอร์โทรติดต่อ
                </label>
                <input
                  type="tel"
                  value={formData.contactPhone}
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="02-xxx-xxxx"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  LINE Official Account URL
                </label>
                <input
                  type="url"
                  value={formData.lineOfficialAccount}
                  onChange={(e) => setFormData({ ...formData, lineOfficialAccount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://lin.ee/xxxxxxx"
                />
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">การแจ้งเตือน</h2>

            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={formData.enableLineNotifications}
                  onChange={(e) => setFormData({ ...formData, enableLineNotifications: e.target.checked })}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">เปิดใช้งานการแจ้งเตือนผ่าน LINE</div>
                  <div className="text-xs text-gray-500">ส่งข้อความแจ้งเตือนต่างๆ ผ่านระบบ LINE</div>
                </div>
              </label>

              <label className="flex items-center gap-3 opacity-50">
                <input
                  type="checkbox"
                  checked={formData.enableEmailNotifications}
                  onChange={(e) => setFormData({ ...formData, enableEmailNotifications: e.target.checked })}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">เปิดใช้งานการแจ้งเตือนผ่านอีเมล</div>
                  <div className="text-xs text-gray-500">(ยังไม่พร้อมใช้งาน)</div>
                </div>
              </label>

              <label className="flex items-center gap-3 opacity-50">
                <input
                  type="checkbox"
                  checked={formData.enableSmsNotifications}
                  onChange={(e) => setFormData({ ...formData, enableSmsNotifications: e.target.checked })}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled
                />
                <div>
                  <div className="text-sm font-medium text-gray-900">เปิดใช้งานการแจ้งเตือนผ่าน SMS</div>
                  <div className="text-xs text-gray-500">(ยังไม่พร้อมใช้งาน)</div>
                </div>
              </label>
            </div>
          </div>

          {/* System Tools */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">เครื่องมือระบบ</h2>

            {/* Attendance Cache */}
            <div className="border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">Attendance Cache</h3>
                  <p className="text-sm text-gray-500">อัพเดทไอคอนกิจกรรมสมาชิก - สร้าง cache ข้อมูลการเข้าร่วมกิจกรรมของสมาชิก</p>
                </div>
                <button
                  onClick={handleRebuildCache}
                  disabled={cacheLoading}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-4"
                >
                  {cacheLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      กำลังสร้าง...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Rebuild Cache
                    </>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">ย้อนหลัง</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={cacheMonths}
                  onChange={(e) => setCacheMonths(Math.max(1, Math.min(60, parseInt(e.target.value) || 12)))}
                  className="w-20 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">เดือน</span>
              </div>
              {cacheMessage && (
                <div className={`mt-3 text-sm p-3 rounded-lg ${cacheMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {cacheMessage.text}
                </div>
              )}
            </div>

            {/* View As Mode (Impersonation) Link */}
            <Link
              href="/admin/impersonate"
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group mb-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">View As Mode</h3>
                  <p className="text-sm text-gray-500">ทดสอบระบบในมุมมองของผู้ใช้คนอื่น (Impersonation)</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {/* Message Templates Link */}
            <Link
              href="/admin/settings/message-templates"
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group mb-4"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">จัดการ Message Templates</h3>
                  <p className="text-sm text-gray-500">ปรับแต่งข้อความแจ้งเตือนที่ส่งผ่าน LINE</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {/* Bank Accounts Link */}
            <Link
              href="/admin/settings/bank-accounts"
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">จัดการบัญชีธนาคาร</h3>
                  <p className="text-sm text-gray-500">ตั้งค่าบัญชีธนาคารสำหรับรับชำระเงิน</p>
                </div>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* LINE Groups Management */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">LINE Groups</h2>
                <p className="text-sm text-gray-500 mt-1">จัดการ LINE Groups ที่ใช้ส่งการแจ้งเตือน</p>
              </div>
              <button
                onClick={fetchLineGroups}
                disabled={lineGroupsLoading}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${lineGroupsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {lineGroupsLoading && lineGroups.length === 0 ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300 border-t-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">กำลังโหลด...</p>
              </div>
            ) : lineGroups.length === 0 ? (
              <div className="text-center py-8 border border-gray-200 rounded-lg">
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="text-sm font-medium text-gray-900 mb-1">ยังไม่มี LINE Groups</h3>
                <p className="text-sm text-gray-500">เชิญ Official Account เข้ากลุ่มแล้วส่งข้อความเพื่อบันทึก Group ID</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lineGroups.map((group) => (
                  <div
                    key={group.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Group Name */}
                        {editingGroupId === group.id ? (
                          <div className="mb-2">
                            <input
                              type="text"
                              value={editingGroupName}
                              onChange={(e) => setEditingGroupName(e.target.value)}
                              placeholder="ชื่อกลุ่ม (เช่น กลุ่มหลัก, กลุ่มคณะกรรมการ)"
                              className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <div className="mb-2">
                            {group.groupName ? (
                              <h3 className="font-semibold text-gray-900">{group.groupName}</h3>
                            ) : (
                              <h3 className="font-medium text-gray-500 italic">ไม่มีชื่อกลุ่ม</h3>
                            )}
                          </div>
                        )}

                        {/* Group ID */}
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">
                            {group.groupId}
                          </code>
                          <button
                            onClick={() => copyToClipboard(group.groupId)}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Copy Group ID"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>

                        {/* Metadata */}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {group.joinedAt && (
                            <span>เข้าร่วม: {new Date(group.joinedAt).toLocaleDateString('th-TH')}</span>
                          )}
                          {group.lastActivity && (
                            <span>กิจกรรมล่าสุด: {new Date(group.lastActivity).toLocaleDateString('th-TH')}</span>
                          )}
                          {group.leftAt ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full">ออกจากกลุ่ม</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full">Active</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {editingGroupId === group.id ? (
                          <>
                            <button
                              onClick={() => handleSaveGroupName(group.id)}
                              disabled={savingGroupName}
                              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                              {savingGroupName ? 'กำลังบันทึก...' : 'บันทึก'}
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={savingGroupName}
                              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                              ยกเลิก
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleEditGroupName(group.id, group.groupName)}
                            className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            แก้ไขชื่อ
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Help Text */}
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>💡 วิธีเพิ่ม LINE Group:</strong> เชิญ LINE Official Account เข้ากลุ่ม แล้วส่งข้อความอะไรก็ได้ในกลุ่ม ระบบจะบันทึก Group ID อัตโนมัติ
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">
              {settings?.updatedAt && (
                <p>อัปเดตล่าสุด: {new Date(settings.updatedAt).toLocaleString('th-TH')}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>บันทึกการตั้งค่า</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
