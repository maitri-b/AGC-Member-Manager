'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { hasPermission } from '@/lib/permissions';

interface EventInfo {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  location: string;
  description: string;
  year: number;
  isActive: boolean;
  totalRegistrations?: number;
  agentRegistrations?: number;
  confirmedCount?: number;
}

interface EventAttendanceRecord {
  eventId: string;
  eventName: string;
  eventDate: string;
  attendeeCount: number;
  status: string;
  checkedIn: boolean;
}

interface MemberAttendance {
  memberId: string;
  eventsAttended: EventAttendanceRecord[];
  totalEventsThisYear: number;
  lastAttendedEvent: string;
  lastAttendedDate: string;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { data: session } = useSession();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [attendance, setAttendance] = useState<MemberAttendance | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);

  useEffect(() => {
    if (session) {
      fetchEvents();
      if (session.user.memberId) {
        fetchAttendance();
      } else {
        setLoadingAttendance(false);
      }
    }
  }, [session]);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const fetchAttendance = async () => {
    try {
      const response = await fetch('/api/events/attendance');
      if (response.ok) {
        const data = await response.json();
        setAttendance(data.attendance);
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  if (!session) return null;

  const canViewMembers = hasPermission(session.user.permissions, 'member:read');
  const canAccessAdmin = hasPermission(session.user.permissions, 'admin:access');
  const canViewReports = hasPermission(session.user.permissions, 'report:view');
  const isCommitteeOrAdmin = hasPermission(session.user.permissions, 'members:list') ||
                             hasPermission(session.user.permissions, 'admin:access');

  // Check if user attended a specific event
  const getUserAttendanceForEvent = (eventId: string) => {
    if (!attendance) return null;
    return attendance.eventsAttended.find(e => e.eventId === eventId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d5a87] rounded-2xl p-6 sm:p-8 mb-8 text-white">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                สวัสดี, {session.user.name}!
              </h1>
              <p className="text-blue-100">
                ยินดีต้อนรับสู่ระบบจัดการสมาชิก Agents Club
              </p>
            </div>
            {session.user.image && (
              <img
                src={session.user.image}
                alt={session.user.name || 'Profile'}
                className="w-16 h-16 rounded-full border-4 border-white/20"
              />
            )}
          </div>
        </div>

        {/* Events Summary Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">กิจกรรมของชมรม</h2>
            {isCommitteeOrAdmin && (
              <Link
                href="/admin/events"
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                จัดการกิจกรรม
              </Link>
            )}
          </div>

          {loadingEvents ? (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            </div>
          ) : events.length > 0 ? (
            <div className="space-y-4">
              {events.map((event) => {
                const userAttendance = getUserAttendanceForEvent(event.eventId);
                return (
                  <div key={event.eventId} className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="p-5">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        {/* Event Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{event.eventName}</h3>
                            {event.isActive && (
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                กำลังดำเนินการ
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mb-1">{event.eventNameEN}</p>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              ปี พ.ศ. {event.year}
                            </span>
                            {event.location && event.location !== 'TBD' && (
                              <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                {event.location}
                              </span>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-sm text-gray-500 mt-2">{event.description}</p>
                          )}
                        </div>

                        {/* Stats (for committee/admin) */}
                        {isCommitteeOrAdmin && event.totalRegistrations !== undefined && (
                          <div className="flex gap-4 md:gap-6">
                            <div className="text-center">
                              <p className="text-2xl font-bold text-blue-600">{event.agentRegistrations || 0}</p>
                              <p className="text-xs text-gray-500">ลงทะเบียน</p>
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-bold text-green-600">{event.confirmedCount || 0}</p>
                              <p className="text-xs text-gray-500">ยืนยันแล้ว</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* User Attendance Status */}
                      {session.user.memberId && (
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          {loadingAttendance ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                              กำลังโหลดข้อมูล...
                            </div>
                          ) : userAttendance ? (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium text-green-700">
                                  คุณได้ลงทะเบียนเข้าร่วมกิจกรรมนี้แล้ว
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                                  userAttendance.checkedIn
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {userAttendance.checkedIn ? 'เข้าร่วมแล้ว' : 'ลงทะเบียนแล้ว'}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {userAttendance.attendeeCount} คน
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>คุณยังไม่ได้ลงทะเบียนเข้าร่วมกิจกรรมนี้</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500">ยังไม่มีกิจกรรมในขณะนี้</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <h2 className="text-xl font-semibold text-gray-800 mb-4">เมนูลัด</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* My Profile */}
          <QuickActionCard
            title="โปรไฟล์ของฉัน"
            description="ดูและแก้ไขข้อมูลส่วนตัว"
            href="/profile"
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
            color="blue"
          />

          {/* Members List */}
          {canViewMembers && (
            <QuickActionCard
              title="รายชื่อสมาชิก"
              description="ดูรายชื่อสมาชิกทั้งหมด"
              href="/members"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
              color="green"
            />
          )}

          {/* Reports */}
          {canViewReports && (
            <QuickActionCard
              title="รายงาน"
              description="ดูสรุปและรายงานต่างๆ"
              href="/reports"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
              color="purple"
            />
          )}

          {/* Admin Panel */}
          {canAccessAdmin && (
            <QuickActionCard
              title="จัดการระบบ"
              description="ตั้งค่าระบบและจัดการผู้ใช้"
              href="/admin"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
              color="red"
            />
          )}
        </div>

        {/* Guest Message - Prompt to verify */}
        {session.user.role === 'guest' && (
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-800">ยืนยันตัวตนสมาชิก</h3>
                <p className="text-sm text-blue-700 mt-1 mb-3">
                  เชื่อมบัญชี LINE ของคุณกับข้อมูลสมาชิก Agents Club เพื่อเข้าถึงข้อมูลและบริการต่างๆ
                </p>
                <Link
                  href="/verify"
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ยืนยันตัวตนเลย
                </Link>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Quick Action Card Component
function QuickActionCard({
  title,
  description,
  href,
  icon,
  color,
}: {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'yellow' | 'pink' | 'purple' | 'red';
}) {
  const colorClasses = {
    blue: 'bg-blue-500 group-hover:bg-blue-600',
    green: 'bg-green-500 group-hover:bg-green-600',
    yellow: 'bg-yellow-500 group-hover:bg-yellow-600',
    pink: 'bg-pink-500 group-hover:bg-pink-600',
    purple: 'bg-purple-500 group-hover:bg-purple-600',
    red: 'bg-red-500 group-hover:bg-red-600',
  };

  return (
    <Link
      href={href}
      className="group bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-lg text-white transition-colors ${colorClasses[color]}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-gray-800 group-hover:text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
      </div>
    </Link>
  );
}
