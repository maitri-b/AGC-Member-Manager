'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const settingsNav = [
  {
    id: 'general',
    name: 'ตั้งค่าทั่วไป',
    icon: '⚙️',
    href: '/admin/settings',
  },
  {
    id: 'bank-accounts',
    name: 'บัญชีธนาคาร',
    icon: '🏦',
    href: '/admin/settings/bank-accounts',
  },
  {
    id: 'message-templates',
    name: 'ข้อความอัตโนมัติ',
    icon: '💬',
    href: '/admin/settings/message-templates',
  },
  {
    id: 'contact',
    name: 'ข้อมูลติดต่อ',
    icon: '📞',
    href: '/admin/settings/contact',
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">การตั้งค่าระบบ</h1>
              <p className="text-sm text-gray-600 mt-1">จัดการการตั้งค่าและคอนฟิกระบบ</p>
            </div>
            <Link
              href="/admin"
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ← กลับหน้าแอดมิน
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content with Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <div className="w-64 flex-shrink-0">
            <nav className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  หมวดหมู่
                </h2>
              </div>
              <div className="p-2">
                {settingsNav.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xl">{item.icon}</span>
                      <span className="text-sm">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
