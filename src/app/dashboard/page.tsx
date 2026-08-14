'use client';

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';
import { hasPermission } from '@/lib/permissions';
import { formatEventDateRange } from '@/lib/date-utils';
import { useEffectiveSessionContext } from '@/lib/EffectiveSessionProvider';

interface EventInfo {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  eventEndDate?: string;
  location: string;
  description: string;
  year: number;
  isActive: boolean;
  totalRegistrations?: number;
  agentRegistrations?: number;
  confirmedCount?: number;
  totalAttendees?: number;
  userRegistered?: boolean;
}

interface EventAttendanceRecord {
  eventId: string;
  eventName: string;
  eventDate: string;
  eventEndDate?: string;
  attendeeCount: number;
  status: string;
  checkedIn: boolean;
}

interface MemberAttendance {
  memberId: string;
  eventsAttended: EventAttendanceRecord[];
  totalEventsThisYear: number;
  eventsLast12Months: number;
  lastAttendedEvent: string;
  lastAttendedDate: string;
  noActivityWarning: boolean;
}

interface VerificationStatus {
  hasRequest: boolean;
  status: 'pending' | 'approved' | 'rejected' | null;
  memberId?: string;
  memberInfo?: {
    companyNameTH: string;
    companyNameEN: string;
    fullNameTH: string;
    nickname: string;
  };
  rejectionReason?: string;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { data: session } = useEffectiveSessionContext();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [attendance, setAttendance] = useState<MemberAttendance | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [loadingVerification, setLoadingVerification] = useState(true);

  useEffect(() => {
    if (session) {
      // Fetch all data in parallel for better performance
      const fetchAllData = async () => {
        const promises: Promise<void>[] = [];

        // Fetch events for members and above (not guests)
        if (session.user.role !== 'guest') {
          promises.push(fetchEvents());
        } else {
          setLoadingEvents(false);
        }

        // Fetch attendance for members
        if (session.user.memberId) {
          promises.push(fetchAttendance());
        } else {
          setLoadingAttendance(false);
        }

        // Fetch verification status for guests
        if (session.user.role === 'guest') {
          promises.push(fetchVerificationStatus());
        } else {
          setLoadingVerification(false);
        }

        // Wait for all promises to complete in parallel
        await Promise.all(promises);
      };

      fetchAllData();
    }
  }, [session]);

  const fetchVerificationStatus = async () => {
    try {
      const response = await fetch('/api/verification/request');
      const data = await response.json();
      console.log('Verification status response:', data);
      if (response.ok) {
        setVerificationStatus(data);
      }
    } catch (err) {
      console.error('Error fetching verification status:', err);
    } finally {
      setLoadingVerification(false);
    }
  };

  const fetchEvents = async () => {
    try {
      // Fetch only published events for dashboard
      const response = await fetch('/api/events?published=true');
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
      // Use cache for faster loading (default: true, but explicit for clarity)
      const response = await fetch('/api/events/attendance?cache=true');
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
                             hasPermission(session.user.permissions, 'members:view') ||
                             hasPermission(session.user.permissions, 'admin:access');

  // Check if user attended a specific event (confirmed status from attendance data)
  const getUserAttendanceForEvent = (eventId: string) => {
    if (!attendance) return null;
    return attendance.eventsAttended.find(e => e.eventId === eventId);
  };

  // Check if user has registered for an event (from events API)
  const hasUserRegistered = (event: EventInfo) => {
    return event.userRegistered === true;
  };

  return (
    <div className="min-h-screen bg-gray-50">
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

        {/* Loading Skeleton for Activity Box */}
        {session.user.role !== 'guest' && session.user.role !== 'event-staff' && session.user.role !== 'event-co' && session.user.memberId && loadingAttendance && (
          <div className="mb-8 bg-gradient-to-r from-gray-50 to-slate-50 border-2 border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
                <div className="bg-white/70 rounded-lg p-4 border border-gray-200">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-4/5 mt-1"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Activity Invitation for Members */}
        {session.user.role !== 'guest' && session.user.role !== 'event-staff' && session.user.role !== 'event-co' && session.user.memberId && !loadingAttendance && attendance?.noActivityWarning && (
          <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 text-lg mb-2">คิดถึงคุณนะ! มาร่วมกิจกรรมกับเราอีกครั้งสิ 💙</h3>
                <p className="text-sm text-blue-800 leading-relaxed mb-3">
                  ชมรมของเราเป็นมากกว่าแค่กลุ่ม แต่เป็น<strong className="font-semibold">ครอบครัวที่ช่วยเหลือและทำกิจกรรมร่วมกัน</strong>
                  เราสังเกตว่าคุณยังไม่ได้เข้าร่วมกิจกรรมใดๆ ใน 12 เดือนที่ผ่านมา
                </p>
                <div className="bg-white/70 rounded-lg p-4 mb-3 border border-blue-200">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-gray-700">
                      <p className="font-medium text-indigo-900 mb-1">📱 สิทธิพิเศษ: LINE Official Group (จำกัด 500 ที่นั่ง)</p>
                      <p className="text-gray-600">
                        การอยู่ในกลุ่ม LINE ของชมรมเป็นสิทธิพิเศษสำหรับสมาชิกที่มีส่วนร่วมอย่างต่อเนื่อง
                        เพียงแค่<strong className="text-blue-700"> เข้าร่วมกิจกรรมอย่างน้อย 1 ครั้งต่อปี</strong>
                        คุณก็จะรักษาสิทธิ์นี้ไว้ได้ และได้เป็นส่วนหนึ่งของชุมชนที่อบอุ่นของเรา
                      </p>
                      <p className="text-indigo-600 text-xs mt-2 italic">
                        💡 หากคุณยังไม่ได้อยู่ในกลุ่ม LINE กรุณารอคิวเพื่อเข้ากลุ่ม ทีมงานจะดำเนินการให้เมื่อมีที่ว่าง
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-blue-700">
                  <span className="font-medium">💡 เคล็ดลับ:</span> ลองดูกิจกรรมที่น่าสนใจด้านล่าง หรือติดตามประกาศกิจกรรมใหม่ๆ ที่กำลังจะมาถึง เราอยากเจอคุณอีกครั้ง!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Active Member Appreciation */}
        {session.user.role !== 'guest' && session.user.role !== 'visitor' && session.user.memberId && !loadingAttendance && attendance && !attendance.noActivityWarning && (
          <div className="mb-8 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-green-900 text-lg mb-2">ขอบคุณที่เป็นส่วนหนึ่งของครอบครัวเรา! 🎉</h3>
                <p className="text-sm text-green-800 leading-relaxed mb-3">
                  คุณได้เข้าร่วมกิจกรรมของชมรมแล้ว <strong className="font-semibold">{attendance.eventsLast12Months} ครั้ง</strong> ใน 12 เดือนที่ผ่านมา
                  ความมีส่วนร่วมของคุณช่วยให้ชมรมของเราแข็งแกร่งและอบอุ่นมากขึ้น
                </p>
                <div className="bg-white/80 rounded-lg p-4 mb-3 border border-green-200">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <div className="text-sm text-gray-700">
                      <p className="font-medium text-emerald-900 mb-1">✨ สิทธิพิเศษของคุณ</p>
                      <ul className="space-y-1 text-gray-600">
                        <li>• <strong className="text-green-700">สิทธิ์เข้ากลุ่ม LINE Official</strong> (จำกัดเพียง 500 ที่นั่ง)</li>
                        <li>• เข้าถึงข้อมูลกิจกรรมและประโยชน์ต่างๆ ของชมรม</li>
                        <li>• เป็นส่วนหนึ่งของเครือข่ายมืออาชีพที่แข็งแกร่ง</li>
                      </ul>
                      <p className="text-emerald-600 text-xs mt-2 italic">
                        💡 หากคุณยังไม่ได้อยู่ในกลุ่ม LINE กรุณารอคิวเพื่อเข้ากลุ่ม ทีมงานจะดำเนินการให้เมื่อมีที่ว่าง
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-green-700">
                  <span className="font-medium">🌟 เชิญชวน:</span> ยังมีกิจกรรมน่าสนใจอีกมากมายด้านล่าง มาเจอกันบ่อยๆ นะ!
                  ทุกครั้งที่คุณมาร่วม คุณก็เป็นส่วนสำคัญที่ทำให้ชมรมมีชีวิตชีวา
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading Skeleton for Attendance Statistics */}
        {session.user.role !== 'guest' && session.user.role !== 'visitor' && session.user.memberId && loadingAttendance && (
          <div className="mb-8">
            <div className="h-7 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
            <div className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="h-9 bg-gray-200 rounded w-16 mx-auto mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-24 mx-auto"></div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="h-9 bg-gray-200 rounded w-16 mx-auto mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-24 mx-auto"></div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg col-span-2">
                  <div className="h-6 bg-gray-200 rounded w-40 mx-auto mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Attendance Summary for Members */}
        {session.user.role !== 'guest' && session.user.role !== 'visitor' && session.user.memberId && !loadingAttendance && attendance && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">สถิติการเข้าร่วมกิจกรรม</h2>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-3xl font-bold text-blue-600">{attendance.eventsLast12Months}</p>
                  <p className="text-sm text-gray-600 mt-1">กิจกรรมใน 12 เดือน</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-3xl font-bold text-green-600">{attendance.eventsAttended.length}</p>
                  <p className="text-sm text-gray-600 mt-1">กิจกรรมทั้งหมด</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg col-span-2">
                  <p className="text-lg font-semibold text-purple-700">
                    {attendance.lastAttendedEvent || '-'}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    กิจกรรมล่าสุด {attendance.lastAttendedDate ? `(${attendance.lastAttendedDate})` : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Guest - Verification & Application Cards */}
        {session.user.role === 'guest' && (
          <div className="mb-8 space-y-6">
            {/* Verification Card - For existing members */}
            {!verificationStatus?.status && !loadingVerification && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 shadow-md">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0">
                    <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-blue-900 mb-3">สมาชิกชมรมฯ ยืนยันตัวตนเพื่อเข้าใช้งานระบบ</h3>
                    <p className="text-blue-800 leading-relaxed mb-4">
                      หากคุณเป็นสมาชิกของชมรมเอเจ้นท์คลับอยู่แล้ว สามารถยืนยันตัวตนเพื่อเชื่อมโยง LINE กับข้อมูลสมาชิกของคุณได้
                      โดยกรอกข้อมูลเลขที่ใบอนุญาต เบอร์โทรศัพท์ และชื่อบริษัท
                      หลังจากผ่านการตรวจสอบและอนุมัติ คุณจะสามารถเข้าถึงข้อมูลโปรไฟล์และใช้บริการต่างๆ ของชมรมได้อย่างเต็มรูปแบบ
                    </p>
                    <Link
                      href="/verify"
                      className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
                    >
                      ยืนยันตัวตนเลย
                      <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Application Card - For new members */}
            <div className="bg-gradient-to-r from-gray-900 to-red-900 border border-red-800 rounded-lg p-8 shadow-md">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white mb-3">เข้าร่วมชมรมเอเจ้นท์คลับ</h3>
                  <p className="text-gray-300 leading-relaxed mb-4">
                    ชมรมเอเจ้นท์คลับ เป็นชมรมสำหรับตัวแทนจำหน่ายทัวร์ที่มุ่งมั่นในการสร้างเครือข่ายแห่งการเรียนรู้และแบ่งปัน
                    เรามุ่งหวังที่จะสร้างสังคมของตัวแทนให้เติบโตร่วมกัน ผ่านกิจกรรมและการแลกเปลี่ยนประสบการณ์
                    มาร่วมเป็นส่วนหนึ่งของครอบครัวเอเจ้นท์คลับกับเรา
                  </p>
                  <Link
                    href="/apply"
                    className="inline-flex items-center px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors shadow-md hover:shadow-lg"
                  >
                    สมัครสมาชิก
                    <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

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

          {/* My Registrations */}
          <QuickActionCard
            title="ประวัติการจอง"
            description="ดูรายการกิจกรรมที่ลงทะเบียนไว้"
            href="/my-registrations"
            icon={
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            color="purple"
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

          {/* Event Management for Event-Staff */}
          {session.user.role === 'event-staff' && (
            <QuickActionCard
              title="จัดการกิจกรรม"
              description="จัดการผู้ลงทะเบียนและข้อมูลกิจกรรม"
              href="/admin/events"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
              color="orange"
            />
          )}

          {/* Event Management for Event-Co */}
          {session.user.role === 'event-co' && (
            <QuickActionCard
              title="จัดการกิจกรรม"
              description="จัดการกิจกรรมที่ได้รับมอบหมาย"
              href="/admin/events"
              icon={
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
              color="purple"
            />
          )}
        </div>

        {/* Member Status Warning */}
        {(session.user.role === 'member' || session.user.role === 'event-co' || session.user.role === 'event-staff') && session.user.memberId && (
          <MemberStatusWarning />
        )}

        {/* Guest Message - Verification Status (Pending/Rejected) */}
        {session.user.role === 'guest' && (
          <div className="mt-8">
            {loadingVerification ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400"></div>
                  <span className="text-gray-500">กำลังโหลดข้อมูล...</span>
                </div>
              </div>
            ) : verificationStatus?.status === 'pending' ? (
              /* Pending Verification Request */
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-yellow-800">รอการพิจารณาคำขอยืนยันตัวตน</h3>
                    <p className="text-sm text-yellow-700 mt-1 mb-3">
                      ทาง Agents Club ได้รับคำขอยืนยันตัวตนของคุณแล้ว และอยู่ระหว่างการพิจารณา
                      กรุณารอการอนุมัติจากผู้ดูแลระบบ
                    </p>
                    {verificationStatus.memberInfo && (
                      <div className="bg-yellow-100 rounded-lg p-3 text-sm">
                        <p className="text-yellow-800">
                          <span className="font-medium">รหัสสมาชิกที่ขอยืนยัน:</span> {verificationStatus.memberId}
                        </p>
                        <p className="text-yellow-800 mt-1">
                          <span className="font-medium">ชื่อบริษัท:</span> {verificationStatus.memberInfo.companyNameTH}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : verificationStatus?.status === 'rejected' ? (
              /* Rejected Verification Request */
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-800">คำขอยืนยันตัวตนถูกปฏิเสธ</h3>
                    <p className="text-sm text-red-700 mt-1 mb-3">
                      {verificationStatus.rejectionReason || 'คำขอยืนยันตัวตนของคุณไม่ผ่านการพิจารณา'}
                    </p>
                    <Link
                      href="/verify"
                      className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      ส่งคำขอใหม่
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Events Summary Section - Only for members and above */}
        {session.user.role !== 'guest' && (
        <div className="mt-12 mb-8">
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
            <>
              {/* Events Section - Simplified to show only latest active or encouraging message */}
              {(() => {
                const activeEvents = events.filter(e => e.isActive);
                const latestActiveEvent = activeEvents[0];

                if (latestActiveEvent) {
                  // Show latest active event only
                  const userAttendance = getUserAttendanceForEvent(latestActiveEvent.eventId);
                  const isRegistered = hasUserRegistered(latestActiveEvent);

                  return (
                    <div className="space-y-4">
                      {/* Latest Active Event */}
                      <div className="bg-white rounded-lg shadow overflow-hidden border-l-4 border-green-500">
                        <div className="p-5">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            {/* Event Info */}
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold text-gray-900">{latestActiveEvent.eventName}</h3>
                                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                  กำลังดำเนินการ
                                </span>
                              </div>
                              <p className="text-sm text-gray-500 mb-1">{latestActiveEvent.eventNameEN}</p>
                              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                                <span className="flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                  {formatEventDateRange(latestActiveEvent.eventDate || String(latestActiveEvent.year), latestActiveEvent.eventEndDate)}
                                </span>
                                {latestActiveEvent.location && latestActiveEvent.location !== 'TBD' && (
                                  <span className="flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {latestActiveEvent.location}
                                  </span>
                                )}
                              </div>
                              {latestActiveEvent.description && (
                                <p className="text-sm text-gray-500 mt-2">
                                  {latestActiveEvent.description.length > 50
                                    ? `${latestActiveEvent.description.substring(0, 50)}...`
                                    : latestActiveEvent.description}
                                </p>
                              )}
                            </div>

                            {/* Stats (for committee/admin) */}
                            {isCommitteeOrAdmin && latestActiveEvent.totalRegistrations !== undefined && (
                              <div className="text-center">
                                <p className="text-2xl font-bold text-blue-600">{latestActiveEvent.totalAttendees || 0}</p>
                                <p className="text-xs text-gray-500">ผู้เข้าร่วม<br />(คน)</p>
                              </div>
                            )}
                          </div>

                          {/* User Registration Status - Active Event */}
                          {session.user.memberId && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                              {loadingEvents ? (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                                  กำลังโหลดข้อมูล...
                                </div>
                              ) : isRegistered ? (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span className="text-sm font-medium text-green-700">
                                        คุณได้ลงทะเบียนเข้าร่วมกิจกรรมนี้แล้ว
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="inline-flex px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                                        {userAttendance ? 'เข้าร่วมแล้ว' : 'รอเข้าร่วมงาน'}
                                      </span>
                                      {userAttendance?.attendeeCount && userAttendance.attendeeCount > 0 && (
                                        <span className="text-sm text-gray-500">
                                          ผู้เข้าร่วมจากบริษัท {userAttendance.attendeeCount} คน
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-xs text-blue-600">
                                    💳 คลิก &quot;ดูรายละเอียดกิจกรรม&quot; เพื่อดูสถานะการชำระเงินและกำหนดชำระ
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

                          {/* View Details Button */}
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <Link
                              href={`/events/${latestActiveEvent.eventId}`}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              ดูรายละเอียดกิจกรรม
                            </Link>
                          </div>
                        </div>
                      </div>

                      {/* View All Link - if more than 1 active event */}
                      {activeEvents.length > 1 && (
                        <div className="text-center py-3">
                          <Link
                            href="/events"
                            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                          >
                            มีกิจกรรมอื่นๆ อีก {activeEvents.length - 1} กิจกรรม คลิกเพื่อดูทั้งหมด
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                } else {
                  // No active events - show encouraging message and optionally latest past event
                  const pastEvents = events.filter(e => !e.isActive);
                  const latestPastEvent = pastEvents[0];

                  return (
                    <div className="space-y-6">
                      {/* Encouraging Message */}
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6 text-center">
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-purple-900 mb-2">
                          รอพบกับกิจกรรมดีๆ จากชมรมเอเจ้นท์คลับ
                        </h3>
                        <p className="text-sm text-purple-700 mb-4">
                          กิจกรรมใหม่ๆ กำลังจะมาถึงเร็วๆ นี้! ติดตามข่าวสารและประกาศกิจกรรมได้ที่
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                          <div className="flex items-center gap-2 text-sm text-purple-800">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M19.5 3h-15C3.675 3 3 3.675 3 4.5v15c0 .825.675 1.5 1.5 1.5h15c.825 0 1.5-.675 1.5-1.5v-15c0-.825-.675-1.5-1.5-1.5zm-7.5 15.75c-3.45 0-6.25-2.8-6.25-6.25S8.55 6.25 12 6.25s6.25 2.8 6.25 6.25-2.8 6.25-6.25 6.25z" />
                            </svg>
                            <span className="font-medium">กลุ่ม LINE Official</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-purple-800">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M19.5 3h-15C3.675 3 3 3.675 3 4.5v15c0 .825.675 1.5 1.5 1.5h15c.825 0 1.5-.675 1.5-1.5v-15c0-.825-.675-1.5-1.5-1.5zm-7.5 15.75c-3.45 0-6.25-2.8-6.25-6.25S8.55 6.25 12 6.25s6.25 2.8 6.25 6.25-2.8 6.25-6.25 6.25z" />
                            </svg>
                            <span className="font-medium">LINE OA ของชมรม</span>
                          </div>
                        </div>
                      </div>

                      {/* Latest Past Event Preview (if exists) */}
                      {latestPastEvent && (
                        <>
                          <h3 className="text-lg font-medium text-gray-700 flex items-center gap-2">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            กิจกรรมล่าสุดที่ผ่านมา
                          </h3>
                          <div className="bg-white rounded-lg shadow overflow-hidden opacity-90">
                            <div className="p-5">
                              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                {/* Event Info */}
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-lg font-semibold text-gray-700">{latestPastEvent.eventName}</h3>
                                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                                      สิ้นสุดแล้ว
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-500 mb-1">{latestPastEvent.eventNameEN}</p>
                                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                      {formatEventDateRange(latestPastEvent.eventDate || String(latestPastEvent.year), latestPastEvent.eventEndDate)}
                                    </span>
                                    {latestPastEvent.location && latestPastEvent.location !== 'TBD' && (
                                      <span className="flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        {latestPastEvent.location}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Stats (for committee/admin) */}
                                {isCommitteeOrAdmin && latestPastEvent.totalRegistrations !== undefined && (
                                  <div className="text-center">
                                    <p className="text-2xl font-bold text-gray-500">{latestPastEvent.totalAttendees || 0}</p>
                                    <p className="text-xs text-gray-400">ผู้เข้าร่วม<br />(คน)</p>
                                  </div>
                                )}
                              </div>

                              {/* View Details Button */}
                              <div className="mt-4 pt-4 border-t border-gray-100">
                                <Link
                                  href={`/events/${latestPastEvent.eventId}`}
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  ดูรายละเอียดกิจกรรม
                                </Link>
                              </div>
                            </div>
                          </div>

                          {/* View All Past Events Link */}
                          {pastEvents.length > 1 && (
                            <div className="text-center py-3">
                              <Link
                                href="/events"
                                className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-700 font-medium text-sm transition-colors"
                              >
                                ดูกิจกรรมที่ผ่านมาทั้งหมด
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </Link>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                }
              })()}
            </>
          ) : (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500">ยังไม่มีกิจกรรมในขณะนี้</p>
            </div>
          )}
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
  color: 'blue' | 'green' | 'yellow' | 'pink' | 'purple' | 'red' | 'orange';
}) {
  const colorClasses = {
    blue: 'bg-blue-500 group-hover:bg-blue-600',
    green: 'bg-green-500 group-hover:bg-green-600',
    yellow: 'bg-yellow-500 group-hover:bg-yellow-600',
    pink: 'bg-pink-500 group-hover:bg-pink-600',
    purple: 'bg-purple-500 group-hover:bg-purple-600',
    red: 'bg-red-500 group-hover:bg-red-600',
    orange: 'bg-orange-500 group-hover:bg-orange-600',
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

// Member Status Warning Component
function MemberStatusWarning() {
  const [statusInfo, setStatusInfo] = useState<{
    isRestricted: boolean;
    status?: string;
    lineGroupStatus?: string;
    isActive?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/member/status-check')
      .then(res => res.json())
      .then(data => {
        setStatusInfo(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error checking member status:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return null;
  if (!statusInfo?.isRestricted) return null;

  return (
    <div className="mt-8 bg-orange-50 border border-orange-200 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <svg className="w-6 h-6 text-orange-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1">
          <h3 className="font-semibold text-orange-800 mb-2">🔔 แจ้งเตือน: กรุณาตรวจสอบสถานะของคุณ</h3>
          <p className="text-sm text-orange-700 mb-3">
            สถานะบางอย่างยังไม่ครบถ้วน กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบและอัปเดตข้อมูล
          </p>
          <ul className="space-y-1 text-sm text-orange-700">
            {!statusInfo.isActive && (
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                สถานะบัญชี: ไม่ Active
              </li>
            )}
            {statusInfo.status !== 'ปกติ' && (
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                สถานะสมาชิก: {statusInfo.status || 'ไม่ระบุ'}
              </li>
            )}
            {statusInfo.lineGroupStatus !== 'ปกติ' && (
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                สถานะ LINE Group: {statusInfo.lineGroupStatus || 'ไม่ระบุ'}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
