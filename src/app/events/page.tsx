'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Event {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  location: string;
  description: string;
  year: number;
  isActive: boolean;
  isPublished?: boolean;
  countsAttendance?: boolean;
  maxCapacity?: number;
  registrationFee?: number;
  registrationOpen?: boolean;
  totalRegistrations?: number;
  agentRegistrations?: number;
  confirmedCount?: number;
  totalAttendees?: number;
  userRegistered?: boolean; // NEW: Registration status flag
  pricingType?: 'fixed' | 'tiered'; // NEW: Pricing type
  useAttendeeTypePricing?: boolean; // NEW: Attendee type pricing flag
  mainImageUrl?: string; // Cover image URL
  createdAt?: string; // Event creation timestamp (for sorting)
}

interface EventAttendee {
  registration: {
    registrationId: string;
    companyName: string;
    licenseNumber: string;
    contactName: string;
    attendeeCount: number;
    attendeeNames: string;
    status: string;
    checkinSections: string;
    tableNumber: string;
  };
  member: {
    memberId: string;
    fullNameTH: string;
    companyNameTH: string;
  } | null;
}

export default function EventsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLinked, setFilterLinked] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'created' | 'eventDate'>('created'); // Sort by created (default) or event date

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    fetchEvents();
  }, []);

  // Close lightbox with ESC key
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && lightboxImage) {
        setLightboxImage(null);
      }
    };

    if (lightboxImage) {
      document.addEventListener('keydown', handleEscKey);
      return () => document.removeEventListener('keydown', handleEscKey);
    }
  }, [lightboxImage]);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatEventDate = (dateString: string): string => {
    if (!dateString) return 'ไม่ระบุวันที่';

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString;
      }
      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      return dateString;
    }
  };

  const fetchEventAttendees = async (eventId: string) => {
    setLoadingAttendees(true);
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (response.ok) {
        const data = await response.json();
        setAttendees(data.attendees || []);
        setSelectedEvent(events.find(e => e.eventId === eventId) || null);
      }
    } catch (error) {
      console.error('Error fetching attendees:', error);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const filteredAttendees = attendees.filter(a => {
    // Search filter
    const matchesSearch = !searchQuery ||
      a.registration.companyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.registration.licenseNumber?.includes(searchQuery) ||
      a.registration.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.member?.fullNameTH?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.member?.memberId?.includes(searchQuery);

    // Linked filter
    const matchesLinked =
      filterLinked === 'all' ||
      (filterLinked === 'linked' && a.member) ||
      (filterLinked === 'unlinked' && !a.member);

    return matchesSearch && matchesLinked;
  });

  const isCommittee = session?.user?.permissions?.includes('members:list') ||
                      session?.user?.permissions?.includes('admin:access');

  // Check if user can manage events (committee, admin, event-co, event-staff)
  const canManageEvents = isCommittee ||
                          session?.user?.permissions?.includes('events:manage-assigned');

  // Helper to parse Thai date format (DD/MM/YYYY) or ISO format
  const parseEventDate = (dateStr: string): number => {
    if (!dateStr) return 0;

    // Try parsing as DD/MM/YYYY (Thai format)
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // Month is 0-indexed
        const year = parseInt(parts[2]);
        // Convert Buddhist year to Gregorian if needed
        const gregorianYear = year > 2400 ? year - 543 : year;
        const date = new Date(gregorianYear, month, day);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }

    // Try parsing as ISO format or year only
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  };

  // Sort events based on selected sort option
  const sortEvents = (eventList: Event[]) => {
    return [...eventList].sort((a, b) => {
      if (sortBy === 'created') {
        // Sort by createdAt descending (newest first)
        const dateA = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
        const dateB = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
        return dateB - dateA;
      } else {
        // Sort by eventDate descending (most recent event first)
        const dateA = parseEventDate(a.eventDate);
        const dateB = parseEventDate(b.eventDate);

        // Handle invalid dates - push them to the end
        if (dateA === 0 && dateB === 0) return 0;
        if (dateA === 0) return 1;
        if (dateB === 0) return -1;

        return dateB - dateA;
      }
    });
  };

  // Separate events into active and completed, then sort each
  const activeEvents = sortEvents(events.filter(e => e.registrationOpen || e.isActive));
  const completedEvents = sortEvents(events.filter(e => !e.registrationOpen && !e.isActive));

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">กิจกรรมชมรม</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Sort Controls */}
        <div className="mb-6 flex items-center justify-end gap-2">
          <span className="text-sm text-gray-600">เรียงตาม:</span>
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              onClick={() => setSortBy('created')}
              className={`px-4 py-2 text-sm font-medium border ${
                sortBy === 'created'
                  ? 'bg-blue-600 text-white border-blue-600 z-10'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              } rounded-l-lg`}
            >
              วันที่แจ้งประกาศ
            </button>
            <button
              type="button"
              onClick={() => setSortBy('eventDate')}
              className={`px-4 py-2 text-sm font-medium border-t border-b border-r ${
                sortBy === 'eventDate'
                  ? 'bg-blue-600 text-white border-blue-600 z-10'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              } rounded-r-lg`}
            >
              วันที่จัดกิจกรรม
            </button>
          </div>
        </div>

        {/* Active Events Section */}
        {activeEvents.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-4">กิจกรรมที่เปิดรับสมัคร</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {activeEvents.map((event) => (
            <div
              key={event.eventId}
              className={`bg-white rounded-lg shadow-md p-6 cursor-pointer transition-all hover:shadow-lg ${
                selectedEvent?.eventId === event.eventId ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => isCommittee && fetchEventAttendees(event.eventId)}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Cover Image */}
                {event.mainImageUrl && (
                  <div
                    className="flex-shrink-0 cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxImage(event.mainImageUrl || null);
                    }}
                    title="คลิกเพื่อดูภาพขนาดเต็ม"
                  >
                    <img
                      src={event.mainImageUrl}
                      alt={event.eventName}
                      className="w-20 h-auto rounded-md object-cover border border-gray-200 group-hover:border-blue-400 transition-colors"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">{event.eventName}</h3>
                  <p className="text-sm text-gray-500">{event.eventNameEN}</p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {event.isActive && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      กำลังดำเนินการ
                    </span>
                  )}
                  {!event.isActive && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      สิ้นสุดแล้ว
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatEventDate(event.eventDate)}
                </div>

                {event.location && (
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {event.location}
                  </div>
                )}
              </div>

              {/* Stats for committee */}
              {isCommittee && event.agentRegistrations !== undefined && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-blue-600">{event.totalRegistrations}</p>
                      <p className="text-xs text-gray-500">ลงทะเบียนทั้งหมด</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">{event.totalAttendees || 0}</p>
                      <p className="text-xs text-gray-500">ผู้เข้าร่วม (คน)</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-600">{event.confirmedCount}</p>
                      <p className="text-xs text-gray-500">ยืนยันแล้ว</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Registration status - Match Dashboard display */}
              {!isCommittee && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {event.userRegistered ? (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium text-green-700">
                          คุณได้ลงทะเบียนเข้าร่วมกิจกรรมนี้แล้ว
                        </span>
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

              {/* Capacity progress bar and status */}
              {event.maxCapacity !== undefined && event.maxCapacity > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between text-sm mb-2">
                    {/* Show unpublished status for event managers when registrationOpen but not published */}
                    {canManageEvents && event.registrationOpen && !event.isPublished ? (
                      <span className="text-orange-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        ยังไม่ Published ให้สมาชิกทั่วไปสมัคร
                      </span>
                    ) : (event.totalAttendees || 0) >= event.maxCapacity ? (
                      <span className="text-red-600 font-semibold flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        เต็ม/ปิดรับสมัคร
                      </span>
                    ) : event.registrationOpen ? (
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        เปิดรับสมัคร
                      </span>
                    ) : (
                      <span className="text-gray-500 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        ปิดรับสมัคร
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{event.totalAttendees || 0} / {event.maxCapacity}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        canManageEvents && event.registrationOpen && !event.isPublished
                          ? 'bg-orange-500'
                          : (event.totalAttendees || 0) >= event.maxCapacity
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(((event.totalAttendees || 0) / event.maxCapacity) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/events/${event.eventId}`}
                  className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  ดูรายละเอียด
                </Link>
                {isCommittee && (
                  <button
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchEventAttendees(event.eventId);
                    }}
                  >
                    ดูรายชื่อ
                  </button>
                )}
              </div>
            </div>
              ))}
            </div>
          </>
        )}

        {/* Completed Events Section */}
        {completedEvents.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-4 mt-8">กิจกรรมที่สิ้นสุดแล้ว</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {completedEvents.map((event) => (
            <div
              key={event.eventId}
              className={`bg-white rounded-lg shadow-md p-6 cursor-pointer transition-all hover:shadow-lg ${
                selectedEvent?.eventId === event.eventId ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => isCommittee && fetchEventAttendees(event.eventId)}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Cover Image */}
                {event.mainImageUrl && (
                  <div
                    className="flex-shrink-0 cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxImage(event.mainImageUrl || null);
                    }}
                    title="คลิกเพื่อดูภาพขนาดเต็ม"
                  >
                    <img
                      src={event.mainImageUrl}
                      alt={event.eventName}
                      className="w-20 h-auto rounded-md object-cover border border-gray-200 group-hover:border-blue-400 transition-colors"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900">{event.eventName}</h3>
                  <p className="text-sm text-gray-500">{event.eventNameEN}</p>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  {event.isActive && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      กำลังดำเนินการ
                    </span>
                  )}
                  {!event.isActive && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      สิ้นสุดแล้ว
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatEventDate(event.eventDate)}
                </div>

                {event.location && (
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {event.location}
                  </div>
                )}
              </div>

              {/* Stats for committee */}
              {isCommittee && event.agentRegistrations !== undefined && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-blue-600">{event.totalRegistrations}</p>
                      <p className="text-xs text-gray-500">ลงทะเบียนทั้งหมด</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">{event.totalAttendees || 0}</p>
                      <p className="text-xs text-gray-500">ผู้เข้าร่วม (คน)</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-purple-600">{event.confirmedCount}</p>
                      <p className="text-xs text-gray-500">ยืนยันแล้ว</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Registration status - Match Dashboard display */}
              {!isCommittee && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {event.userRegistered ? (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-medium text-green-700">
                          คุณได้ลงทะเบียนเข้าร่วมกิจกรรมนี้แล้ว
                        </span>
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

              {/* Capacity progress bar and status */}
              {event.maxCapacity !== undefined && event.maxCapacity > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between text-sm mb-2">
                    {/* Show unpublished status for event managers when registrationOpen but not published */}
                    {canManageEvents && event.registrationOpen && !event.isPublished ? (
                      <span className="text-orange-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        ยังไม่ Published ให้สมาชิกทั่วไปสมัคร
                      </span>
                    ) : (event.totalAttendees || 0) >= event.maxCapacity ? (
                      <span className="text-red-600 font-semibold flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        เต็ม/ปิดรับสมัคร
                      </span>
                    ) : event.registrationOpen ? (
                      <span className="text-green-600 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        เปิดรับสมัคร
                      </span>
                    ) : (
                      <span className="text-gray-500 font-medium flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        ปิดรับสมัคร
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{event.totalAttendees || 0} / {event.maxCapacity}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        canManageEvents && event.registrationOpen && !event.isPublished
                          ? 'bg-orange-500'
                          : (event.totalAttendees || 0) >= event.maxCapacity
                          ? 'bg-red-500'
                          : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(((event.totalAttendees || 0) / event.maxCapacity) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/events/${event.eventId}`}
                  className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  ดูรายละเอียด
                </Link>
                {isCommittee && (
                  <button
                    className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchEventAttendees(event.eventId);
                    }}
                  >
                    ดูรายชื่อ
                  </button>
                )}
              </div>
            </div>
              ))}
            </div>
          </>
        )}

        {/* Attendees List (for committee) */}
        {isCommittee && selectedEvent && (
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                รายชื่อผู้เข้าร่วม - {selectedEvent.eventName}
              </h2>

              {/* Filters */}
              <div className="mt-4 flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="ค้นหาบริษัท, ใบอนุญาต, ชื่อ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <select
                  value={filterLinked}
                  onChange={(e) => setFilterLinked(e.target.value as 'all' | 'linked' | 'unlinked')}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="linked">ผูก Member ID แล้ว</option>
                  <option value="unlinked">ยังไม่ผูก Member ID</option>
                </select>
              </div>

              {/* Summary */}
              <div className="mt-4 flex gap-4 text-sm">
                <span className="text-gray-600">
                  แสดง {filteredAttendees.length} จาก {attendees.length} รายการ
                </span>
                <span className="text-green-600">
                  ผูก MemberID แล้ว: {attendees.filter(a => a.member).length}
                </span>
                <span className="text-orange-600">
                  ยังไม่ผูก: {attendees.filter(a => !a.member).length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              {loadingAttendees ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        บริษัท
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ใบอนุญาต
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MemberID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ผู้ติดต่อ
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        จำนวนผู้เข้าร่วม
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        สถานะ
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        โต๊ะ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAttendees.map((attendee, index) => (
                      <tr key={attendee.registration.registrationId || index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {attendee.registration.companyName}
                          </div>
                          {attendee.member && (
                            <div className="text-xs text-gray-500">
                              {attendee.member.companyNameTH}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {attendee.registration.licenseNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {attendee.member ? (
                            <Link
                              href={`/members/${attendee.member.memberId}`}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200"
                            >
                              {attendee.member.memberId}
                            </Link>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                              ไม่พบ
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {attendee.registration.contactName}
                          </div>
                          {attendee.member && (
                            <div className="text-xs text-gray-500">
                              {attendee.member.fullNameTH}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {attendee.registration.attendeeCount} คน
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            attendee.registration.status?.toLowerCase() === 'confirmed' ||
                            attendee.registration.status === 'ยืนยันแล้ว'
                              ? 'bg-green-100 text-green-800'
                              : attendee.registration.status?.toLowerCase() === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {attendee.registration.status || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {attendee.registration.tableNumber || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {filteredAttendees.length === 0 && !loadingAttendees && (
                <div className="text-center py-12 text-gray-500">
                  ไม่พบข้อมูลที่ตรงกับการค้นหา
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info for regular members */}
        {!isCommittee && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <svg className="w-12 h-12 text-blue-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-medium text-blue-900 mb-2">ดูประวัติการเข้าร่วมกิจกรรมของคุณ</h3>
            <p className="text-blue-700 mb-4">
              คุณสามารถดูประวัติการเข้าร่วมกิจกรรมของตัวเองได้ที่หน้าโปรไฟล์
            </p>
            <Link
              href="/profile"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              ไปที่หน้าโปรไฟล์
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </main>

      {/* Lightbox Modal for Full-Size Image */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-7xl max-h-[90vh]">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
              title="ปิด (ESC)"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={lightboxImage}
              alt="Event Cover"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
