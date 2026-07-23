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

            {/* Message Templates Link */}
            <Link
              href="/admin/settings/message-templates"
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
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
