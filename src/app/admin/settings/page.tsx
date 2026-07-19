'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SystemSettings } from '@/types/settings';
import { toast } from 'react-hot-toast';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
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
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.role === 'admin' && !settings) {
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

  if (session?.user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">ไม่มีสิทธิ์เข้าถึง</h1>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
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

          {/* Message Templates Link */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">การตั้งค่าขั้นสูง</h2>
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
