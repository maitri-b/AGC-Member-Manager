'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Toast, useToast } from '@/components/Toast';

interface Event {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  location: string;
  description: string;
  year: number;
  isActive: boolean;
  isPublished: boolean;
  countsAttendance: boolean;
  maxCapacity: number;
  maxPerCompany: number;
  registrationFee: number;
  registrationOpen: boolean;
  documentName?: string;
  documentUrl?: string;
}

interface EventSummary {
  totalRegistrations: number;
  totalAttendees: number;
}

interface UserRegistration {
  registrationId: string;
  status: string;
  attendeeCount: number;
  registrationDate: string;
  attendeeNames: string;
}

export default function EventDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const eventId = params.eventId as string;

  console.log('[DEBUG COMPONENT] Component mounted/rendered');
  console.log('[DEBUG COMPONENT] params:', params);
  console.log('[DEBUG COMPONENT] eventId:', eventId);

  const [event, setEvent] = useState<Event | null>(null);
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [userRegistration, setUserRegistration] = useState<UserRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [attendeeCount, setAttendeeCount] = useState(1);
  const [attendeeNames, setAttendeeNames] = useState<string[]>(['']);
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    console.log('[DEBUG useEffect AUTH] status:', status);
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    console.log('[DEBUG useEffect FETCH] eventId:', eventId);
    if (eventId) {
      console.log('[DEBUG useEffect FETCH] Calling fetchEventDetail...');
      fetchEventDetail();
    } else {
      console.log('[DEBUG useEffect FETCH] eventId is undefined/null, not fetching');
    }
  }, [eventId]);

  const fetchEventDetail = async () => {
    try {
      console.log('[DEBUG] Fetching event detail for eventId:', eventId);
      const response = await fetch(`/api/events/${eventId}/detail`);
      console.log('[DEBUG] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[DEBUG] Response data:', data);
        console.log('[DEBUG] Debug info from API:', data.debug);

        setEvent(data.event);
        setSummary(data.summary);
        setUserRegistration(data.userRegistration);
        setDebugInfo(data.debug || null); // Store debug info

        // Set first attendee name from member data
        if (data.memberName && !data.userRegistration) {
          setAttendeeNames([data.memberName]);
        }
      } else if (response.status === 404) {
        router.push('/events');
      }
    } catch (err) {
      console.error('Error fetching event:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAttendeeCountChange = (count: number) => {
    setAttendeeCount(count);
    const currentNames = [...attendeeNames];

    if (count > currentNames.length) {
      // Add empty slots
      while (currentNames.length < count) {
        currentNames.push('');
      }
    } else {
      // Remove excess slots
      currentNames.length = count;
    }
    setAttendeeNames(currentNames);
  };

  const handleAttendeeNameChange = (index: number, name: string) => {
    const newNames = [...attendeeNames];
    newNames[index] = name;
    setAttendeeNames(newNames);
  };

  const handleRegister = async () => {
    if (!event || !session?.user?.memberId) {
      toast.error('กรุณาเชื่อมต่อบัญชีสมาชิกก่อนลงทะเบียน');
      return;
    }

    // Validate attendee names
    const filledNames = attendeeNames.filter(name => name.trim());
    if (filledNames.length !== attendeeCount) {
      toast.error('กรุณากรอกชื่อผู้เข้าร่วมให้ครบทุกคน');
      return;
    }

    setRegistering(true);
    try {
      const response = await fetch(`/api/events/${eventId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeCount,
          attendeeNames: filledNames,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถลงทะเบียนได้');
      }

      toast.success('ลงทะเบียนเรียบร้อยแล้ว');
      fetchEventDetail(); // Refresh data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setRegistering(false);
    }
  };

  const isCommitteeOrAdmin = session?.user?.permissions?.includes('admin:access') ||
                              session?.user?.permissions?.includes('members:list');

  const isFull = event?.maxCapacity && event.maxCapacity > 0 && summary
    ? summary.totalAttendees >= event.maxCapacity
    : false;

  const canRegister = event?.registrationOpen && !isFull && !userRegistration && session?.user?.memberId;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    // Handle DD/MM/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const [day, month, year] = parts.map(Number);
      return `${day} ${months[month - 1]} ${year > 2500 ? year : year + 543}`;
    }
    // Handle year only
    if (dateStr.length === 4) {
      return `ปี พ.ศ. ${dateStr}`;
    }
    return dateStr;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-gray-500">ไม่พบข้อมูลกิจกรรม</p>
            <Link href="/events" className="text-blue-600 hover:underline mt-4 inline-block">
              กลับไปหน้ากิจกรรม
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Toast toasts={toast.toasts} onRemove={toast.removeToast} />

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Link */}
        <Link href="/events" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          กลับไปหน้ากิจกรรม
        </Link>

        {/* Event Header */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Preview mode banner for unpublished events */}
          {isCommitteeOrAdmin && !event.isPublished && (
            <div className="bg-yellow-500 text-white px-6 py-2 text-sm font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              โหมดดูตัวอย่าง - กิจกรรมนี้ยังไม่ได้ publish (สมาชิกทั่วไปจะไม่เห็น)
            </div>
          )}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-6 py-8 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">{event.eventName}</h1>
                {event.eventNameEN && (
                  <p className="text-blue-100 text-lg">{event.eventNameEN}</p>
                )}
              </div>
              <div className="text-right">
                {event.registrationFee > 0 ? (
                  <div className="text-2xl font-bold">฿{event.registrationFee.toLocaleString()}</div>
                ) : (
                  <div className="text-2xl font-bold text-green-300">ฟรี</div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6">
            {/* Event Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-sm text-gray-500">วันที่จัดกิจกรรม</p>
                    <p className="font-medium">{formatDate(event.eventDate)}</p>
                  </div>
                </div>

                {event.location && (
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div>
                      <p className="text-sm text-gray-500">สถานที่</p>
                      <p className="font-medium">{event.location}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {event.maxCapacity > 0 && summary && (
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <div>
                      <p className="text-sm text-gray-500">จำนวนผู้ลงทะเบียน</p>
                      <p className="font-medium">
                        {summary.totalAttendees} / {event.maxCapacity} คน
                        {isFull && <span className="text-red-600 ml-2">(เต็มแล้ว)</span>}
                      </p>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                        <div
                          className={`h-2 rounded-full ${isFull ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min((summary.totalAttendees / event.maxCapacity) * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}

                {event.countsAttendance && (
                  <div className="flex items-center gap-2 text-purple-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium">เก็บคะแนนการเข้าร่วมกิจกรรม</span>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {event.description && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">รายละเอียด</h2>
                <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap">
                  {event.description}
                </div>
              </div>
            )}

            {/* Document Download */}
            {event.documentUrl && (
              <div className="mb-8">
                <a
                  href={event.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-medium text-gray-700">
                    {event.documentName || 'ดาวน์โหลดเอกสาร'}
                  </span>
                </a>
              </div>
            )}

            {/* DEBUG INFO - แสดงข้อมูล debug */}
            {debugInfo && (
              <div className="mb-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
                <h3 className="font-bold text-yellow-900 mb-3 text-lg">🔍 Debug Information (ตรวจสอบการทำงาน)</h3>
                <div className="space-y-3 text-sm">
                  <div className="bg-white p-3 rounded border border-yellow-200">
                    <p className="font-semibold text-gray-700 mb-2">ข้อมูลผู้ใช้ปัจจุบัน:</p>
                    <p className="text-gray-600">LINE User ID: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{(debugInfo.currentUser as Record<string, unknown>)?.lineUserId as string || 'ไม่มี'}</span></p>
                    <p className="text-gray-600">Member ID: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{(debugInfo.currentUser as Record<string, unknown>)?.memberId as string || 'ไม่มี'}</span></p>
                  </div>

                  <div className="bg-white p-3 rounded border border-yellow-200">
                    <p className="font-semibold text-gray-700 mb-2">สถิติการลงทะเบียน:</p>
                    <p className="text-gray-600">จำนวนการลงทะเบียนทั้งหมด: <span className="font-bold text-blue-600">{debugInfo.totalRegistrations as number}</span></p>
                    <p className="text-gray-600">มี LINE User ID: <span className="font-bold text-green-600">{debugInfo.registrationsWithLineUserId as number}</span></p>
                    <p className="text-gray-600">มี Member ID: <span className="font-bold text-green-600">{debugInfo.registrationsWithMemberId as number}</span></p>
                  </div>

                  <div className="bg-white p-3 rounded border border-yellow-200">
                    <p className="font-semibold text-gray-700 mb-2">ผลการค้นหา:</p>
                    <p className={`font-bold ${debugInfo.userRegistrationFound ? 'text-green-600' : 'text-red-600'}`}>
                      {debugInfo.userRegistrationFound ? '✅ เจอการลงทะเบียนของคุณ' : '❌ ไม่เจอการลงทะเบียนของคุณ'}
                    </p>
                  </div>

                  {Array.isArray(debugInfo.sampleRegistrations) && debugInfo.sampleRegistrations.length > 0 ? (
                    <div className="bg-white p-3 rounded border border-yellow-200">
                      <p className="font-semibold text-gray-700 mb-2">ตัวอย่างข้อมูลการลงทะเบียน (3 รายการแรก):</p>
                      {(debugInfo.sampleRegistrations as Array<Record<string, unknown>>).map((reg, i) => (
                        <div key={i} className="mb-2 p-2 bg-gray-50 rounded text-xs">
                          <p>Registration ID: {String(reg.registrationId || '')}</p>
                          <p>LINE User ID: {String(reg.lineUserId || '(ไม่มี)')}</p>
                          <p>Member ID: {String(reg.memberId || '(ไม่มี)')}</p>
                          <p>ชื่อ: {String(reg.contactName || '')}</p>
                          <p>บริษัท: {String(reg.companyName || '')}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {/* Registration Status / Form */}
            <div className="border-t pt-6">
              {userRegistration ? (
                <div className="space-y-4">
                  {/* Registration Info Card */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <svg className="w-6 h-6 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <p className="font-semibold text-green-800">คุณลงทะเบียนแล้ว</p>
                          <p className="text-sm text-green-700">
                            รหัสลงทะเบียน: {userRegistration.registrationId}
                            {userRegistration.status && ` | สถานะ: ${userRegistration.status}`}
                          </p>
                          <p className="text-sm text-green-700 mt-1">
                            จำนวนผู้เข้าร่วม: {userRegistration.attendeeCount} คน
                          </p>
                          {event?.maxPerCompany && event.maxPerCompany > 0 && (
                            <p className="text-xs text-green-600 mt-1">
                              * จำกัด {event.maxPerCompany} คนต่อ 1 บริษัท
                            </p>
                          )}
                        </div>
                      </div>

                      {!isEditing && (
                        <button
                          onClick={() => {
                            setIsEditing(true);
                            setAttendeeCount(userRegistration.attendeeCount);
                            // Parse attendee names from userRegistration
                            try {
                              const names = JSON.parse(userRegistration.attendeeNames || '[]');
                              setAttendeeNames(Array.isArray(names) ? names : [userRegistration.attendeeNames || '']);
                            } catch {
                              setAttendeeNames([userRegistration.attendeeNames || '']);
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          แก้ไขข้อมูล
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Edit Form */}
                  {isEditing && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold text-blue-900">แก้ไขข้อมูลการลงทะเบียน</h3>

                      {/* Attendee Count */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          จำนวนผู้เข้าร่วม
                          {event?.maxPerCompany && event.maxPerCompany > 0 && (
                            <span className="text-xs text-gray-500 ml-2">
                              (สูงสุด {event.maxPerCompany} คน)
                            </span>
                          )}
                        </label>
                        <select
                          value={attendeeCount}
                          onChange={(e) => handleAttendeeCountChange(Number(e.target.value))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          {Array.from(
                            { length: event?.maxPerCompany && event.maxPerCompany > 0 ? event.maxPerCompany : 10 },
                            (_, i) => i + 1
                          ).map(num => (
                            <option key={num} value={num}>{num} คน</option>
                          ))}
                        </select>
                      </div>

                      {/* Attendee Names */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ชื่อผู้เข้าร่วม
                        </label>
                        <div className="space-y-2">
                          {Array.from({ length: attendeeCount }).map((_, index) => (
                            <input
                              key={index}
                              type="text"
                              value={attendeeNames[index] || ''}
                              onChange={(e) => handleAttendeeNameChange(index, e.target.value)}
                              placeholder={index === 0 ? 'ชื่อของคุณ' : `ชื่อผู้เข้าร่วมคนที่ ${index + 1}`}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          ))}
                        </div>
                      </div>

                      {/* Total Amount */}
                      {event && event.registrationFee > 0 && (
                        <div className="bg-white border border-blue-300 rounded-lg p-3">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm text-gray-600">ค่าสมัครใหม่</p>
                              <p className="text-xs text-gray-500">
                                {attendeeCount} คน × ฿{event.registrationFee.toLocaleString()}/คน
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-blue-600">
                                ฿{(event.registrationFee * attendeeCount).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-2">
                        <button
                          onClick={async () => {
                            if (!event) return;

                            // Validate attendee names
                            const filledNames = attendeeNames.filter(name => name.trim());
                            if (filledNames.length !== attendeeCount) {
                              toast.error('กรุณากรอกชื่อผู้เข้าร่วมให้ครบทุกคน');
                              return;
                            }

                            setUpdating(true);
                            try {
                              const response = await fetch(`/api/events/${eventId}/update-registration`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  attendeeCount,
                                  attendeeNames: filledNames,
                                  requestNameChange: false,
                                }),
                              });

                              const data = await response.json();

                              if (!response.ok) {
                                throw new Error(data.error || 'ไม่สามารถอัพเดทข้อมูลได้');
                              }

                              toast.success(data.message || 'อัพเดทข้อมูลเรียบร้อยแล้ว');
                              setIsEditing(false);
                              fetchEventDetail(); // Refresh data
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
                            } finally {
                              setUpdating(false);
                            }
                          }}
                          disabled={updating}
                          className="flex-1 py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {updating ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                        </button>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            setAttendeeCount(userRegistration.attendeeCount);
                            try {
                              const names = JSON.parse(userRegistration.attendeeNames || '[]');
                              setAttendeeNames(Array.isArray(names) ? names : [userRegistration.attendeeNames || '']);
                            } catch {
                              setAttendeeNames([userRegistration.attendeeNames || '']);
                            }
                          }}
                          disabled={updating}
                          className="px-6 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : !session?.user?.memberId ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="font-semibold text-yellow-800">ยังไม่ได้เชื่อมต่อบัญชีสมาชิก</p>
                      <p className="text-sm text-yellow-700">
                        กรุณาเชื่อมต่อบัญชีสมาชิกก่อนจึงจะสามารถลงทะเบียนกิจกรรมได้
                      </p>
                      <Link href="/verify" className="text-sm text-yellow-800 font-medium hover:underline mt-2 inline-block">
                        ไปยืนยันตัวตน →
                      </Link>
                    </div>
                  </div>
                </div>
              ) : !event.registrationOpen ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-gray-600">ยังไม่เปิดรับสมัคร</p>
                </div>
              ) : isFull ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <p className="text-red-600 font-medium">รับสมัครเต็มแล้ว</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">ลงทะเบียนเข้าร่วมกิจกรรม</h3>

                  {/* Attendee Count */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      จำนวนผู้เข้าร่วม
                      {event.maxPerCompany > 0 && (
                        <span className="text-xs text-gray-500 ml-2">
                          (สูงสุด {event.maxPerCompany} คน)
                        </span>
                      )}
                    </label>
                    <select
                      value={attendeeCount}
                      onChange={(e) => handleAttendeeCountChange(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {Array.from(
                        { length: event.maxPerCompany > 0 ? event.maxPerCompany : 10 },
                        (_, i) => i + 1
                      ).map(num => (
                        <option key={num} value={num}>{num} คน</option>
                      ))}
                    </select>
                  </div>

                  {/* Attendee Names */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ชื่อผู้เข้าร่วม
                    </label>
                    <div className="space-y-2">
                      {Array.from({ length: attendeeCount }).map((_, index) => (
                        <input
                          key={index}
                          type="text"
                          value={attendeeNames[index] || ''}
                          onChange={(e) => handleAttendeeNameChange(index, e.target.value)}
                          placeholder={index === 0 ? 'ชื่อของคุณ' : `ชื่อผู้เข้าร่วมคนที่ ${index + 1}`}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Total Amount */}
                  {event.registrationFee > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-gray-600">ค่าสมัคร</p>
                          <p className="text-xs text-gray-500">
                            {attendeeCount} คน × ฿{event.registrationFee.toLocaleString()}/คน
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            ฿{(event.registrationFee * attendeeCount).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleRegister}
                    disabled={registering}
                    className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {registering ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        กำลังลงทะเบียน...
                      </span>
                    ) : (
                      'ยืนยันการลงทะเบียน'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
