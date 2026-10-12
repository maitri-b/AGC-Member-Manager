'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NotificationSettings, NotificationTarget, DEFAULT_NOTIFICATION_SETTINGS } from '@/types/settings';
import { toast } from 'react-hot-toast';
import { hasPermission } from '@/lib/permissions';

export default function NotificationSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);

  // LINE Groups state
  const [lineGroups, setLineGroups] = useState<any[]>([]);
  const [lineGroupsLoading, setLineGroupsLoading] = useState(false);

  // Admin users state
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    } else if (status === 'authenticated') {
      // Check if user is admin
      const isAdmin = session?.user?.role === 'admin' && hasPermission(session?.user?.permissions || [], 'admin:access');
      if (!isAdmin) {
        toast.error('ไม่มีสิทธิ์เข้าถึงหน้านี้');
        router.push('/dashboard');
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (session?.user?.role === 'admin' && hasPermission(session?.user?.permissions || [], 'admin:access')) {
      fetchSettings();
      fetchLineGroups();
      fetchAdminUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.role]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/notification-settings');
      if (!response.ok) throw new Error('Failed to fetch settings');

      const data = await response.json();
      setSettings(data.settings || DEFAULT_NOTIFICATION_SETTINGS);
    } catch (error) {
      console.error('Error fetching notification settings:', error);
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
      // Filter only active groups
      const activeGroups = (data.groups || []).filter((g: any) => g.active !== false);
      setLineGroups(activeGroups);
    } catch (error) {
      console.error('Error fetching LINE groups:', error);
      toast.error('ไม่สามารถโหลดข้อมูล LINE Groups ได้');
    } finally {
      setLineGroupsLoading(false);
    }
  };

  const fetchAdminUsers = async () => {
    try {
      setAdminUsersLoading(true);
      const response = await fetch('/api/admin/users?role=admin');
      if (!response.ok) throw new Error('Failed to fetch admin users');
      const data = await response.json();
      setAdminUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching admin users:', error);
      // Don't show error toast, this is not critical
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      const response = await fetch('/api/admin/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (!response.ok) throw new Error('Failed to save settings');

      const data = await response.json();
      setSettings(data.settings);
      toast.success('บันทึกการตั้งค่าเรียบร้อยแล้ว');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('ไม่สามารถบันทึกการตั้งค่าได้');
    } finally {
      setSaving(false);
    }
  };

  const toggleTarget = (notificationType: keyof NotificationSettings, targetIndex: number) => {
    setSettings(prev => {
      const notificationConfig = prev[notificationType];
      if (!notificationConfig || typeof notificationConfig !== 'object' || !('targets' in notificationConfig)) {
        return prev;
      }

      const newTargets = [...notificationConfig.targets];
      newTargets[targetIndex] = {
        ...newTargets[targetIndex],
        enabled: !newTargets[targetIndex].enabled,
      };

      return {
        ...prev,
        [notificationType]: {
          ...notificationConfig,
          targets: newTargets,
        },
      };
    });
  };

  const addTarget = (notificationType: keyof NotificationSettings, targetType: 'line_group' | 'specific_user', targetId: string, targetName: string) => {
    setSettings(prev => {
      const notificationConfig = prev[notificationType];
      if (!notificationConfig || typeof notificationConfig !== 'object' || !('targets' in notificationConfig)) {
        return prev;
      }

      // Check if target already exists
      const exists = notificationConfig.targets.some(t => t.targetId === targetId);
      if (exists) {
        toast.error('เป้าหมายนี้ถูกเพิ่มไว้แล้ว');
        return prev;
      }

      const newTarget: NotificationTarget = {
        type: targetType,
        targetId,
        targetName,
        enabled: true,
      };

      return {
        ...prev,
        [notificationType]: {
          ...notificationConfig,
          targets: [...notificationConfig.targets, newTarget],
        },
      };
    });
  };

  const removeTarget = (notificationType: keyof NotificationSettings, targetIndex: number) => {
    setSettings(prev => {
      const notificationConfig = prev[notificationType];
      if (!notificationConfig || typeof notificationConfig !== 'object' || !('targets' in notificationConfig)) {
        return prev;
      }

      const newTargets = notificationConfig.targets.filter((_, index) => index !== targetIndex);

      return {
        ...prev,
        [notificationType]: {
          ...notificationConfig,
          targets: newTargets,
        },
      };
    });
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/admin/settings" className="text-blue-600 hover:text-blue-700 flex items-center gap-2 mb-4">
            <span>←</span> กลับไปหน้าการตั้งค่า
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">การตั้งค่าการแจ้งเตือน</h1>
          <p className="mt-2 text-gray-600">
            กำหนดว่าระบบจะส่งการแจ้งเตือนไปที่ไหนบ้างสำหรับแต่ละประเภท
          </p>
        </div>

        {/* Membership Application Notifications */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">การสมัครสมาชิก</h2>
              <p className="text-sm text-gray-500 mt-1">
                ส่งการแจ้งเตือนเมื่อมีผู้สมัครสมาชิกใหม่
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.membershipApplication?.enabled ?? true}
                onChange={(e) => setSettings({
                  ...settings,
                  membershipApplication: {
                    ...settings.membershipApplication!,
                    enabled: e.target.checked,
                  }
                })}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">เปิดใช้งาน</span>
            </label>
          </div>

          {settings.membershipApplication?.enabled && (
            <div className="space-y-4">
              <div className="border-t pt-4">
                <h3 className="font-medium text-gray-900 mb-3">เป้าหมายการแจ้งเตือน</h3>

                {/* List of targets */}
                <div className="space-y-2 mb-4">
                  {settings.membershipApplication.targets.map((target, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={target.enabled}
                          onChange={() => toggleTarget('membershipApplication', index)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <div>
                          <div className="font-medium text-gray-900">{target.targetName}</div>
                          <div className="text-xs text-gray-500">
                            {target.type === 'admin_users' && 'ส่งให้ผู้ดูแลระบบทั้งหมด'}
                            {target.type === 'line_group' && `LINE Group ID: ${target.targetId}`}
                            {target.type === 'specific_user' && `User ID: ${target.targetId}`}
                          </div>
                        </div>
                      </div>
                      {target.type !== 'admin_users' && (
                        <button
                          onClick={() => removeTarget('membershipApplication', index)}
                          className="text-red-600 hover:text-red-700 text-sm font-medium"
                        >
                          ลบ
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add LINE Group */}
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">เพิ่ม LINE Group</h4>
                  {lineGroupsLoading ? (
                    <p className="text-sm text-gray-500">กำลังโหลด...</p>
                  ) : lineGroups.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">ไม่มี LINE Groups ที่ใช้งานได้</p>
                  ) : (
                    <div className="space-y-2">
                      {lineGroups.map((group) => {
                        const alreadyAdded = settings.membershipApplication?.targets.some(
                          t => t.targetId === group.id
                        );
                        return (
                          <button
                            key={group.id}
                            onClick={() => !alreadyAdded && addTarget('membershipApplication', 'line_group', group.id, group.groupName || group.id)}
                            disabled={alreadyAdded}
                            className={`w-full text-left p-2 rounded border ${
                              alreadyAdded
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                                : 'bg-white hover:bg-blue-50 border-gray-300 hover:border-blue-400'
                            }`}
                          >
                            <div className="font-medium text-sm">
                              {group.groupName || group.id}
                              {alreadyAdded && ' (เพิ่มแล้ว)'}
                            </div>
                            <div className="text-xs text-gray-500 font-mono">{group.id}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Add Specific User */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">เพิ่มผู้ใช้เฉพาะ</h4>
                  {adminUsersLoading ? (
                    <p className="text-sm text-gray-500">กำลังโหลด...</p>
                  ) : adminUsers.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">ไม่พบข้อมูลผู้ดูแลระบบ</p>
                  ) : (
                    <div className="space-y-2">
                      {adminUsers.map((user) => {
                        const alreadyAdded = settings.membershipApplication?.targets.some(
                          t => t.targetId === user.lineUserId
                        );
                        return (
                          <button
                            key={user.lineUserId}
                            onClick={() => !alreadyAdded && addTarget('membershipApplication', 'specific_user', user.lineUserId, user.lineDisplayName || user.name || user.lineUserId)}
                            disabled={alreadyAdded}
                            className={`w-full text-left p-2 rounded border ${
                              alreadyAdded
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                                : 'bg-white hover:bg-blue-50 border-gray-300 hover:border-blue-400'
                            }`}
                          >
                            <div className="font-medium text-sm">
                              {user.lineDisplayName || user.name || user.email}
                              {alreadyAdded && ' (เพิ่มแล้ว)'}
                            </div>
                            <div className="text-xs text-gray-500 font-mono">
                              LINE ID: {user.lineUserId}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Future notification types can be added here */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            💡 ประเภทการแจ้งเตือนอื่นๆ เช่น การลงทะเบียนกิจกรรม, การชำระเงิน จะถูกเพิ่มในอนาคต
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Link
            href="/admin/settings"
            className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ยกเลิก
          </Link>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
        </div>
      </div>
    </div>
  );
}
