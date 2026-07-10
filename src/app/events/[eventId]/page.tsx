'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Toast, useToast } from '@/components/Toast';
import { calculateRegistrationFee, getPricingSummary, AttendeeType, AttendeeTypeSelection, RoomType, RoomAllocation, PriceTier } from '@/types/event';
import { formatDeadline, getTimeRemaining } from '@/lib/payment-deadlines';
import { getStatusBadgeClass } from '@/lib/payment-status';
import { isGuestEligibleForEventRegistration } from '@/lib/permissions';
import { GAS_UPLOAD_SLIP_URL } from '@/lib/constants';

interface Event {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  location: string;
  description: string;
  sheetName: string;
  year: number;
  isActive: boolean;
  isPublished: boolean;
  countsAttendance: boolean;
  maxCapacity: number;
  maxPerCompany: number;
  registrationFee: number;
  pricingType?: 'fixed' | 'tiered';
  baseFee?: number;
  additionalFeePerPerson?: number;
  priceTiers?: PriceTier[];
  memberDiscount?: number;
  registrationOpen: boolean;
  documentName?: string;
  documentUrl?: string;
  mainImageUrl?: string;
  paymentBankName?: string;
  paymentAccountName?: string;
  paymentAccountNumber?: string;
  paymentQrCodeUrl?: string;
  paymentTerms?: string;
  paymentSlipSubmissionUrl?: string;
  // Deposit payment configuration (New)
  paymentMode?: 'full' | 'deposit';
  depositAmount?: number;
  depositPercentage?: number;
  useDepositPercentage?: boolean;
  depositDeadlineType?: 'none' | 'fixed' | 'hours';
  depositDeadlineFixed?: string;
  depositDeadlineHours?: number;
  remainingDeadlineType?: 'none' | 'fixed' | 'hours';
  remainingDeadlineFixed?: string;
  remainingDeadlineHours?: number;
  // Registration edit control
  allowMemberEdit?: boolean;
  requireAttendeeNames?: boolean;
  // Attendee type pricing (New)
  useAttendeeTypePricing?: boolean;
  attendeeTypes?: AttendeeType[];
  // Room allocation (New)
  roomTypes?: RoomType[];
  createdAt: string;
  updatedAt: string;
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
  // Deposit payment data (New)
  totalAmount?: number;
  depositAmount?: number;
  remainingAmount?: number;
  depositPaid?: boolean;
  depositPaidDate?: string;
  remainingPaidDate?: string; // วันที่จ่ายยอดคงเหลือ
  depositSlipUrl?: string;
  remainingSlipUrl?: string;
  depositDeadline?: string;
  remainingDeadline?: string;
  paymentStatus?: string;
  // Attendee type selections, room allocations, and special charges (New)
  attendeeTypeSelections?: AttendeeTypeSelection[];
  roomAllocations?: RoomAllocation[];
  specialCharges?: Array<{
    chargeId: string;
    description: string;
    amount: number;
    addedBy: string;
    addedAt: string;
  }>;
}

export default function EventDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [userRegistration, setUserRegistration] = useState<UserRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [attendeeCount, setAttendeeCount] = useState(1);
  const [attendeeNames, setAttendeeNames] = useState<string[]>(['']);
  const [specialRequests, setSpecialRequests] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  // Attendee names edit state (New)
  const [isEditingNames, setIsEditingNames] = useState(false);
  const [tempAttendeeNames, setTempAttendeeNames] = useState<string[]>([]);
  // Member contact info state (New)
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberStatus, setMemberStatus] = useState('');
  const [lineGroupStatus, setLineGroupStatus] = useState('');
  // Attendee type pricing state (New)
  const [attendeeTypeSelections, setAttendeeTypeSelections] = useState<AttendeeTypeSelection[]>([]);
  const [calculatedTotalFee, setCalculatedTotalFee] = useState(0);

  // Room allocation state (New)
  const [roomAllocations, setRoomAllocations] = useState<RoomAllocation[]>([]);
  const [roomValidationError, setRoomValidationError] = useState<string | null>(null);
  const [calculatedRoomFee, setCalculatedRoomFee] = useState(0);

  // Guest registration form state (for Event-Co without memberId)
  const [guestCompanyName, setGuestCompanyName] = useState('');
  const [guestLicenseNumber, setGuestLicenseNumber] = useState('');
  const [guestContactName, setGuestContactName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`คัดลอก${label}เรียบร้อยแล้ว`);
    } catch (err) {
      toast.error('ไม่สามารถคัดลอกได้');
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (eventId) {
      fetchEventDetail();
    }
  }, [eventId]);

  const fetchEventDetail = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/detail`);

      if (response.ok) {
        const data = await response.json();

        setEvent(data.event);
        setSummary(data.summary);
        setUserRegistration(data.userRegistration);

        // Store member contact info and status
        if (data.memberName) {
          setMemberName(data.memberName);
        }
        if (data.memberPhone) {
          setMemberPhone(data.memberPhone);
        }
        if (data.memberStatus) {
          setMemberStatus(data.memberStatus);
        }
        if (data.lineGroupStatus) {
          setLineGroupStatus(data.lineGroupStatus);
        }

        // Load existing registration data if user has already registered
        if (data.userRegistration) {
          // Load attendee type selections
          if (data.userRegistration.attendeeTypeSelections) {
            setAttendeeTypeSelections(data.userRegistration.attendeeTypeSelections);

            // Calculate total fee from attendee type selections
            if (data.event.useAttendeeTypePricing && data.event.attendeeTypes) {
              const totalFee = data.userRegistration.attendeeTypeSelections.reduce((sum: number, s: AttendeeTypeSelection) => {
                const type = data.event.attendeeTypes.find((t: AttendeeType) => t.typeId === s.typeId);
                return sum + (type?.price || 0) * s.quantity;
              }, 0);
              setCalculatedTotalFee(totalFee);
            }
          }

          // Load room allocations
          if (data.userRegistration.roomAllocations) {
            setRoomAllocations(data.userRegistration.roomAllocations);

            // Calculate room fee
            if (data.event.roomTypes) {
              const roomFee = data.userRegistration.roomAllocations.reduce((sum: number, alloc: RoomAllocation) => {
                const roomType = data.event.roomTypes.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
                return sum + (roomType?.price || 0) * alloc.roomCount;
              }, 0);
              setCalculatedRoomFee(roomFee);
            }
          }

          // Load existing attendee names
          if (data.userRegistration.attendeeNames) {
            try {
              const names = JSON.parse(data.userRegistration.attendeeNames);
              if (Array.isArray(names)) {
                setAttendeeNames(names);
              } else {
                setAttendeeNames([data.userRegistration.attendeeNames]);
              }
            } catch {
              // If not JSON, treat as single name string
              setAttendeeNames([data.userRegistration.attendeeNames]);
            }
          }

          // Load attendee count
          if (data.userRegistration.attendeeCount) {
            setAttendeeCount(data.userRegistration.attendeeCount);
          }
        } else {
          // No pre-fill for new registrations - let members enter names manually
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
    // Prevent double submission
    if (registering || loading) {
      return;
    }

    if (!event) {
      toast.error('ไม่พบข้อมูลกิจกรรม');
      return;
    }

    // Double-check if user already registered (prevent race condition)
    if (userRegistration) {
      toast.error('คุณลงทะเบียนกิจกรรมนี้แล้ว');
      return;
    }

    // Check if user is staff without memberId - require guest form
    const isStaffWithoutMember = !session?.user?.memberId && ['admin', 'committee', 'event-co', 'event-staff'].includes(session?.user?.role || '');

    if (isStaffWithoutMember) {
      // Validate guest information form
      if (!guestCompanyName.trim()) {
        toast.error('กรุณากรอกชื่อบริษัท');
        return;
      }
      if (!guestContactName.trim()) {
        toast.error('กรุณากรอกชื่อผู้ติดต่อ');
        return;
      }
      if (!guestPhone.trim()) {
        toast.error('กรุณากรอกเบอร์โทรศัพท์');
        return;
      }
    } else if (!session?.user?.memberId) {
      // Regular user without memberId
      toast.error('กรุณาเชื่อมต่อบัญชีสมาชิกก่อนลงทะเบียน');
      return;
    }

    // Validate attendee names (conditional based on requireAttendeeNames)
    // Only validate if requireAttendeeNames is explicitly true
    if (event.requireAttendeeNames === true) {
      const filledNames = attendeeNames.filter(name => name.trim());
      if (filledNames.length !== attendeeCount) {
        toast.error('กรุณากรอกชื่อผู้เข้าร่วมให้ครบทุกคน');
        return;
      }
    }

    // Validate room allocation (required for all pricing types when room types are configured)
    if (event.roomTypes && event.roomTypes.length > 0) {
      if (roomAllocations.length === 0) {
        toast.error('กรุณาเลือกประเภทห้องพัก');
        return;
      }

      // Calculate total capacity
      let totalCapacity = 0;
      for (const alloc of roomAllocations) {
        const rt = event.roomTypes?.find((r: RoomType) => r.typeId === alloc.roomTypeId);
        if (rt) {
          totalCapacity += rt.capacity * alloc.roomCount;
        }
      }

      if (totalCapacity !== attendeeCount) {
        toast.error(`จำนวนผู้เข้าพักในห้องไม่ตรงกับจำนวนผู้เข้าร่วม (รองรับ ${totalCapacity} คน แต่ลงทะเบียน ${attendeeCount} คน)`);
        return;
      }
    }

    setRegistering(true);
    try {
      const response = await fetch(`/api/events/${eventId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeCount,
          attendeeNames: attendeeNames,
          specialRequests,
          attendeeTypeSelections, // Add attendee type selections
          roomAllocations, // Add room allocations
          // Guest information for staff without memberId
          guestInfo: isStaffWithoutMember ? {
            companyName: guestCompanyName,
            licenseNumber: guestLicenseNumber,
            contactName: guestContactName,
            phone: guestPhone,
          } : undefined,
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

  // Check if user can register
  // 1. Event must be open for registration
  // 2. Event must not be full
  // 3. User must not have already registered
  // 4. User must have memberId OR be an eligible guest (guest with valid status)
  const isEligibleGuest = isGuestEligibleForEventRegistration(
    session?.user?.role || 'guest',
    session?.user?.memberId,
    memberStatus,
    lineGroupStatus
  );
  const canRegister = event?.registrationOpen && !isFull && !userRegistration && (session?.user?.memberId || isEligibleGuest);

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
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50">
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
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-2">{event.eventName}</h1>
                {event.eventNameEN && (
                  <p className="text-blue-100 text-lg mb-3">{event.eventNameEN}</p>
                )}
                {/* Status Badges */}
                {isCommitteeOrAdmin && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {/* Registration Status */}
                    {event.registrationOpen ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-500 text-white">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        เปิดรับสมัคร
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-gray-500 text-white">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        ปิดรับสมัคร
                      </span>
                    )}
                    {/* Published Status */}
                    {event.isPublished ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-blue-400 text-white">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Published (แสดงให้สมาชิกทั่วไป)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-orange-500 text-white">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                        ยังไม่ Published
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">
                  {getPricingSummary(event)}
                </div>
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

            {/* Full Capacity Alert Card */}
            {isFull && (
              <div className="mb-8 bg-red-50 border-2 border-red-300 rounded-lg p-6 shadow-md">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-red-700 mb-2">ปิดรับลงทะเบียน</h3>
                    <p className="text-red-600 text-base">ขณะนี้มีผู้ให้ความสนใจจองกิจกรรมนี้เต็มจำนวนแล้ว</p>
                  </div>
                </div>
              </div>
            )}

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
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                  Download เอกสาร
                </h3>
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

            {/* Payment Information - Moved outside registration card */}
            {(event.paymentBankName || event.paymentAccountName || event.paymentAccountNumber || event.paymentQrCodeUrl || event.paymentTerms) && (
              <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-blue-900 mb-4">บัญชีสำหรับชำระเงิน</h3>

                <div className="space-y-4">
                  {(event.paymentBankName || event.paymentAccountName || event.paymentAccountNumber) && (
                    <div className="space-y-1 text-sm text-blue-800">
                      {event.paymentBankName && (
                        <p>
                          <span className="font-medium">ธนาคาร:</span> {event.paymentBankName}
                        </p>
                      )}
                      {event.paymentAccountName && (
                        <p>
                          <span className="font-medium">ชื่อบัญชี:</span> {event.paymentAccountName}
                        </p>
                      )}
                      {event.paymentAccountNumber && (
                        <p className="flex items-center gap-2">
                          <span>
                            <span className="font-medium">เลขที่บัญชี:</span> {event.paymentAccountNumber}
                          </span>
                          <button
                            onClick={() => copyToClipboard(event.paymentAccountNumber!, 'เลขที่บัญชี')}
                            className="p-1 text-blue-700 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors"
                            title="คัดลอกเลขที่บัญชี"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </p>
                      )}
                    </div>
                  )}

                  {event.paymentQrCodeUrl && (
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900 mb-2">สแกน QR Code เพื่อชำระเงิน</h4>
                      <img
                        src={event.paymentQrCodeUrl}
                        alt="QR Code สำหรับชำระเงิน"
                        className="max-w-xs rounded-lg border-2 border-blue-300"
                      />
                    </div>
                  )}

                  {event.paymentTerms && (
                    <div>
                      <h4 className="text-sm font-semibold text-blue-900 mb-2">เงื่อนไขการชำระเงิน</h4>
                      <div className="prose prose-sm max-w-none text-blue-800 whitespace-pre-wrap">
                        {event.paymentTerms}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Registration Status / Form */}
            <div className="border-t pt-6">
              {userRegistration ? (
                <div className="space-y-4">
                  {/* Registration Info Card */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <svg className="w-6 h-6 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-semibold text-green-800">คุณลงทะเบียนแล้ว</p>
                      </div>
                    </div>

                    {/* All details in single column without icon */}
                    <div className="space-y-3">
                      {/* Prominent Registration ID */}
                      <div className="bg-white border-2 border-green-400 rounded-lg p-3">
                        <p className="text-xs text-gray-600 mb-1">รหัสลงทะเบียน</p>
                        <div className="flex items-center justify-between">
                          <p className="text-xl font-bold text-green-900 tracking-wider">
                            {userRegistration.registrationId}
                          </p>
                          <button
                            onClick={() => copyToClipboard(userRegistration.registrationId, 'รหัสลงทะเบียน')}
                            className="p-2 text-green-700 hover:text-green-800 hover:bg-green-100 rounded-lg transition-colors"
                            title="คัดลอกรหัสลงทะเบียน"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="text-sm text-green-700 space-y-1">
                        {userRegistration.status && (
                          <p>สถานะ: <span className="font-medium">{userRegistration.status}</span></p>
                        )}
                        <p>จำนวนผู้เข้าร่วม: <span className="font-medium">{userRegistration.attendeeCount} คน</span></p>
                      </div>

                      {/* Fee Breakdown */}
                      <div className="mt-3 pt-3 border-t border-green-200">
                        <p className="text-xs font-semibold text-green-800 mb-2">รายละเอียดค่าใช้จ่าย:</p>
                        <div className="text-xs text-green-700 space-y-1">
                          {event.useAttendeeTypePricing ? (
                            // Attendee Type Pricing Breakdown
                            <>
                              {userRegistration.attendeeTypeSelections && userRegistration.attendeeTypeSelections.map((selection: AttendeeTypeSelection) => {
                                const type = event.attendeeTypes?.find((t: AttendeeType) => t.typeId === selection.typeId);
                                if (!type) return null;
                                const subtotal = type.price * selection.quantity;
                                return (
                                  <div key={selection.typeId} className="flex justify-between">
                                    <span>{type.typeName} {type.price.toLocaleString()} บาท × {selection.quantity} คน</span>
                                    <span>{subtotal.toLocaleString()} บาท</span>
                                  </div>
                                );
                              })}
                            </>
                          ) : event.pricingType === 'tiered' ? (
                            // Tiered Pricing Breakdown
                            <>
                              {event.priceTiers && event.priceTiers.length > 0 ? (
                                // New multi-tier pricing display
                                <>
                                  {(() => {
                                    const tier1 = event.priceTiers[0];
                                    const tier2 = event.priceTiers[1];
                                    const count = userRegistration.attendeeCount;

                                    if (tier1.priceType === 'total' && count <= tier1.upToCount) {
                                      // Within tier 1 range - show total price
                                      return (
                                        <div className="flex justify-between">
                                          <span>{tier1.upToCount} คนแรก (รวม)</span>
                                          <span>{tier1.price.toLocaleString()} บาท</span>
                                        </div>
                                      );
                                    } else if (tier1.priceType === 'total') {
                                      // Show tier 1 total + tier 2 per person
                                      return (
                                        <>
                                          <div className="flex justify-between">
                                            <span>{tier1.upToCount} คนแรก (รวม)</span>
                                            <span>{tier1.price.toLocaleString()} บาท</span>
                                          </div>
                                          {count > tier1.upToCount && tier2 && (
                                            <div className="flex justify-between">
                                              <span>คนที่เหลือ {tier2.price.toLocaleString()} บาท × {count - tier1.upToCount} คน</span>
                                              <span>{(tier2.price * (count - tier1.upToCount)).toLocaleString()} บาท</span>
                                            </div>
                                          )}
                                        </>
                                      );
                                    }
                                    return null;
                                  })()}
                                  {event.memberDiscount && event.memberDiscount > 0 && (
                                    <div className="flex justify-between text-green-700">
                                      <span>ส่วนลดสมาชิก</span>
                                      <span>-{event.memberDiscount.toLocaleString()} บาท</span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                // Legacy tiered pricing (baseFee + additionalFeePerPerson)
                                <>
                                  <div className="flex justify-between">
                                    <span>ท่านแรก {event.baseFee?.toLocaleString()} บาท × 1 ท่าน</span>
                                    <span>{event.baseFee?.toLocaleString()} บาท</span>
                                  </div>
                                  {userRegistration.attendeeCount > 1 && (
                                    <div className="flex justify-between">
                                      <span>ท่านที่เหลือ {event.additionalFeePerPerson?.toLocaleString()} บาท × {userRegistration.attendeeCount - 1} ท่าน</span>
                                      <span>{((event.additionalFeePerPerson || 0) * (userRegistration.attendeeCount - 1)).toLocaleString()} บาท</span>
                                    </div>
                                  )}
                                  {event.memberDiscount && event.memberDiscount > 0 && (
                                    <div className="flex justify-between text-green-700">
                                      <span>ส่วนลดสมาชิก</span>
                                      <span>-{event.memberDiscount.toLocaleString()} บาท</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </>
                          ) : (
                            // Fixed Pricing Breakdown
                            <div className="flex justify-between">
                              <span>ท่านละ {event.registrationFee?.toLocaleString()} บาท × {userRegistration.attendeeCount} ท่าน</span>
                              <span>{((event.registrationFee || 0) * userRegistration.attendeeCount).toLocaleString()} บาท</span>
                            </div>
                          )}

                          {/* Event Fee Subtotal */}
                          {(() => {
                            // Calculate event fee (total - special charges - room fees)
                            let eventFee = userRegistration.totalAmount || 0;
                            if (userRegistration.specialCharges && userRegistration.specialCharges.length > 0) {
                              eventFee -= userRegistration.specialCharges.reduce((sum, c) => sum + c.amount, 0);
                            }
                            if (userRegistration.roomAllocations && event.roomTypes) {
                              const roomFee = userRegistration.roomAllocations.reduce((sum: number, alloc: RoomAllocation) => {
                                const roomType = event.roomTypes?.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
                                return sum + (roomType?.price || 0) * alloc.roomCount;
                              }, 0);
                              eventFee -= roomFee;
                            }
                            return (
                              <div className="flex justify-between font-medium pt-1 border-t border-green-300">
                                <span>รวมค่าลงทะเบียน:</span>
                                <span>{eventFee.toLocaleString()} บาท</span>
                              </div>
                            );
                          })()}

                          {/* Room allocations breakdown */}
                          {userRegistration.roomAllocations && userRegistration.roomAllocations.length > 0 && event.roomTypes && (
                            <>
                              <div className="mt-2 pt-2 border-t border-green-300">
                                {userRegistration.roomAllocations.map((alloc: RoomAllocation) => {
                                  const roomType = event.roomTypes?.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
                                  if (!roomType) return null;
                                  const subtotal = roomType.price * alloc.roomCount;
                                  return (
                                    <div key={alloc.roomTypeId} className="flex justify-between">
                                      <span>{roomType.typeName} {roomType.price.toLocaleString()} บาท × {alloc.roomCount} ห้อง</span>
                                      <span>{subtotal.toLocaleString()} บาท</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Subtotal for rooms */}
                              {(() => {
                                const roomTotal = userRegistration.roomAllocations.reduce((sum: number, alloc: RoomAllocation) => {
                                  const roomType = event.roomTypes?.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
                                  return sum + (roomType?.price || 0) * alloc.roomCount;
                                }, 0);
                                return (
                                  <div className="flex justify-between font-medium pt-1 border-t border-green-300">
                                    <span>รวมค่าห้องพัก:</span>
                                    <span>{roomTotal.toLocaleString()} บาท</span>
                                  </div>
                                );
                              })()}
                            </>
                          )}

                          {/* Special charges breakdown */}
                          {userRegistration.specialCharges && userRegistration.specialCharges.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-green-300">
                              <p className="text-xs font-semibold text-purple-700 mb-1">ค่าใช้จ่ายพิเศษ:</p>
                              {userRegistration.specialCharges.map((charge) => (
                                <div key={charge.chargeId} className="flex justify-between text-purple-700">
                                  <span>{charge.description}</span>
                                  <span>+{charge.amount.toLocaleString()} บาท</span>
                                </div>
                              ))}
                              <div className="flex justify-between font-medium pt-1 border-t border-purple-300 text-purple-800">
                                <span>รวมค่าใช้จ่ายพิเศษ:</span>
                                <span>+{userRegistration.specialCharges.reduce((sum, c) => sum + c.amount, 0).toLocaleString()} บาท</span>
                              </div>
                            </div>
                          )}

                          {/* Grand total */}
                          {userRegistration.totalAmount && (
                            <div className="flex justify-between font-bold text-sm pt-2 border-t-2 border-green-400 text-green-900">
                              <span>ยอดรวมทั้งหมด:</span>
                              <span>{userRegistration.totalAmount.toLocaleString()} บาท</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {event?.maxPerCompany && event.maxPerCompany > 0 && (
                        <p className="text-xs text-green-600 mt-2">
                          * จำกัด {event.maxPerCompany} คนต่อ 1 บริษัท
                        </p>
                      )}

                      {/* Admin Contact Message */}
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-sm text-gray-700 mb-2">
                          หากต้องการเปลี่ยนแปลงการลงทะเบียนโปรดติดต่อ Admin ที่{' '}
                          <a href="https://lin.ee/nzAjXXq" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                            https://lin.ee/nzAjXXq
                          </a>
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-gray-700">
                            โดยแจ้งรหัสลงทะเบียน 6 หลัก รหัสของคุณคือ
                          </span>
                          <span className="font-mono font-bold text-lg text-blue-600">
                            {userRegistration.registrationId}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(userRegistration.registrationId);
                              toast.success('คัดลอกรหัสลงทะเบียนแล้ว');
                            }}
                            className="p-1 hover:bg-yellow-100 rounded transition-colors"
                            title="คัดลอกรหัส"
                          >
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Information Card */}
                  {memberName && memberPhone && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-blue-900">
                          ข้อมูลผู้ติดต่อ
                        </h4>
                        <Link
                          href="/profile"
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                        >
                          แก้ไขข้อมูลติดต่อ
                        </Link>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-20">ชื่อ:</span>
                          <span className="text-gray-900">{memberName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-20">เบอร์โทร:</span>
                          <span className="text-gray-900">{memberPhone}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Attendee Names Section */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900">
                        รายชื่อผู้เข้าร่วมกิจกรรม
                      </h4>
                      {(event.allowMemberEdit ?? true) && !isEditingNames && (
                        <button
                          onClick={() => {
                            setIsEditingNames(true);
                            setTempAttendeeNames([...attendeeNames]);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="แก้ไขรายชื่อ"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {Array.from({ length: attendeeCount }).map((_, index) => {
                        const isDisabled = !(event.allowMemberEdit ?? true) || !isEditingNames;
                        const isRequired = event.requireAttendeeNames === true;
                        const displayValue = isEditingNames ? tempAttendeeNames[index] : attendeeNames[index];

                        return (
                          <div key={index}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              ผู้เข้าร่วมกิจกรรมท่านที่ {index + 1} {!isRequired && '(ถ้ามี)'}
                            </label>
                            <input
                              type="text"
                              value={displayValue || ''}
                              onChange={(e) => {
                                if (isEditingNames) {
                                  const newNames = [...tempAttendeeNames];
                                  newNames[index] = e.target.value;
                                  setTempAttendeeNames(newNames);
                                }
                              }}
                              disabled={isDisabled}
                              placeholder="ระบุชื่อผู้เข้าร่วม"
                              required={isRequired}
                              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                isDisabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Edit Action Buttons */}
                    {isEditingNames && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={async () => {
                            // Validate if required
                            if (event.requireAttendeeNames === true) {
                              const filledNames = tempAttendeeNames.filter(name => name.trim());
                              if (filledNames.length !== attendeeCount) {
                                toast.error('กรุณากรอกชื่อผู้เข้าร่วมให้ครบทุกคน');
                                return;
                              }
                            }

                            setUpdating(true);
                            try {
                              const response = await fetch(`/api/events/${eventId}/update-registration`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  attendeeCount,
                                  attendeeNames: tempAttendeeNames,
                                  specialRequests,
                                  attendeeTypeSelections,
                                  roomAllocations,
                                  requestNameChange: false,
                                }),
                              });

                              const data = await response.json();

                              if (!response.ok) {
                                throw new Error(data.error || 'ไม่สามารถบันทึกได้');
                              }

                              toast.success('บันทึกรายชื่อเรียบร้อยแล้ว');
                              setAttendeeNames(tempAttendeeNames);
                              setIsEditingNames(false);
                              fetchEventDetail();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
                            } finally {
                              setUpdating(false);
                            }
                          }}
                          disabled={updating}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {updating ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingNames(false);
                            setTempAttendeeNames([]);
                          }}
                          disabled={updating}
                          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Edit Form */}
                  {isEditing && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                      <h3 className="font-semibold text-blue-900">
                        {(event.allowMemberEdit ?? true) ? 'แก้ไขข้อมูลการลงทะเบียน' : 'ข้อมูลการลงทะเบียน'}
                      </h3>

                      {/* Attendee Type Selection - Read-only display */}
                      {event.useAttendeeTypePricing && event.attendeeTypes && event.attendeeTypes.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-blue-900 mb-3">
                            จำนวนผู้เข้าร่วมตามประเภท
                          </h4>

                          <div className="space-y-3">
                            {event.attendeeTypes
                              .filter((t: AttendeeType) => t.isActive)
                              .sort((a, b) => a.sortOrder - b.sortOrder)
                              .map(type => {
                                const selection = attendeeTypeSelections.find(s => s.typeId === type.typeId);
                                const quantity = selection?.quantity || 0;

                                if (quantity === 0) return null;

                                return (
                                  <div key={type.typeId} className="flex items-center justify-between bg-white p-3 rounded">
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-medium text-gray-700">
                                        {type.typeName}:
                                      </span>
                                      <span className="text-sm text-gray-600">
                                        {quantity} คน × {type.price.toLocaleString()} บาท
                                      </span>
                                    </div>
                                    <span className="text-sm font-semibold text-blue-600">
                                      = {(type.price * quantity).toLocaleString()} บาท
                                    </span>
                                  </div>
                                );
                              })}
                          </div>

                          {/* Summary */}
                          <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">
                              รวมทั้งหมด: {attendeeCount} คน
                            </span>
                            <span className="text-base font-bold text-blue-900">
                              ค่าลงทะเบียน: {calculatedTotalFee.toLocaleString()} บาท
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            * กรณีต้องการเปลี่ยนแปลงจำนวนและประเภทผู้เข้าร่วม กรุณาติดต่อ Admin
                          </p>
                        </div>
                      )}

                      {/* Room Allocation - Read-only display */}
                      {event.roomTypes && event.roomTypes.length > 0 && roomAllocations.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-amber-900 mb-3">
                            ประเภทห้องพัก
                          </h4>

                          <div className="space-y-3">
                            {event.roomTypes
                              .filter((rt: RoomType) => rt.isActive)
                              .sort((a, b) => a.sortOrder - b.sortOrder)
                              .map(roomType => {
                                const currentAlloc = roomAllocations.find(ra => ra.roomTypeId === roomType.typeId);
                                const roomCount = currentAlloc?.roomCount || 0;

                                if (roomCount === 0) return null;

                                return (
                                  <div key={roomType.typeId} className="flex items-center justify-between bg-white p-3 rounded">
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-medium text-gray-700">
                                        {roomType.typeName}:
                                      </span>
                                      <span className="text-sm text-gray-600">
                                        {roomCount} ห้อง ({roomType.capacity} คน/ห้อง)
                                        {roomType.price > 0 && ` × ${roomType.price.toLocaleString()} บาท`}
                                      </span>
                                    </div>
                                    <span className="text-sm font-semibold text-amber-700">
                                      = รองรับ {roomType.capacity * roomCount} คน
                                      {roomType.price > 0 && ` (+${(roomType.price * roomCount).toLocaleString()} บาท)`}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>

                          {/* Summary */}
                          <div className="mt-3 pt-3 border-t border-amber-200">
                            <div className="space-y-1">
                              <p className="text-sm text-green-600 font-medium">
                                ✓ รองรับ {roomAllocations.reduce((sum, ra) => {
                                  const rt = event.roomTypes?.find((r: RoomType) => r.typeId === ra.roomTypeId);
                                  return sum + (rt?.capacity || 0) * ra.roomCount;
                                }, 0)} คน (ลงทะเบียน {attendeeCount} คน)
                              </p>
                              {calculatedRoomFee > 0 && (
                                <p className="text-sm text-amber-700 font-semibold">
                                  ค่าห้องพักเพิ่มเติม: {calculatedRoomFee.toLocaleString()} บาท
                                </p>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-gray-500 mt-2">
                            * กรณีต้องการเปลี่ยนแปลงประเภทห้องพัก กรุณาติดต่อ Admin
                          </p>
                        </div>
                      )}

                      {/* Special Requests - Read-only display */}
                      {specialRequests && specialRequests.trim() !== '' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ความต้องการพิเศษ
                          </label>
                          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 whitespace-pre-wrap">
                            {specialRequests}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            * กรณีต้องการเปลี่ยนแปลงความต้องการพิเศษ กรุณาติดต่อ Admin
                          </p>
                        </div>
                      )}

                      {/* Total Amount Summary */}
                      {userRegistration.totalAmount && userRegistration.totalAmount > 0 && (
                        <div className="bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-300 rounded-lg p-4">
                          <div className="flex justify-between items-center">
                            <span className="text-base font-semibold text-gray-800">ยอดรวมทั้งหมด:</span>
                            <span className="text-2xl font-bold text-blue-600">
                              {userRegistration.totalAmount.toLocaleString()} บาท
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-2">
                        {(event.allowMemberEdit ?? true) ? (
                          <>
                            <button
                              onClick={async () => {
                                if (!event) return;

                                // Validate attendee names (conditional based on requireAttendeeNames)
                                // Only validate if requireAttendeeNames is explicitly true
                                if (event.requireAttendeeNames === true) {
                                  const filledNames = attendeeNames.filter(name => name.trim());
                                  if (filledNames.length !== attendeeCount) {
                                    toast.error('กรุณากรอกชื่อผู้เข้าร่วมให้ครบทุกคน');
                                    return;
                                  }
                                }

                                // Validate room allocation (required for all pricing types when room types are configured)
                                if (event.roomTypes && event.roomTypes.length > 0) {
                                  if (roomAllocations.length === 0) {
                                    toast.error('กรุณาเลือกประเภทห้องพัก');
                                    return;
                                  }

                                  // Calculate total capacity
                                  let totalCapacity = 0;
                                  for (const alloc of roomAllocations) {
                                    const rt = event.roomTypes?.find((r: RoomType) => r.typeId === alloc.roomTypeId);
                                    if (rt) {
                                      totalCapacity += rt.capacity * alloc.roomCount;
                                    }
                                  }

                                  if (totalCapacity !== attendeeCount) {
                                    toast.error(`จำนวนผู้เข้าพักในห้องไม่ตรงกับจำนวนผู้เข้าร่วม (รองรับ ${totalCapacity} คน แต่ลงทะเบียน ${attendeeCount} คน)`);
                                    return;
                                  }
                                }

                                setUpdating(true);
                                try {
                                  const response = await fetch(`/api/events/${eventId}/update-registration`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      attendeeCount,
                                      attendeeNames: attendeeNames,
                                      specialRequests,
                                      attendeeTypeSelections, // Add attendee type selections
                                      roomAllocations, // Add room allocations
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
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setIsEditing(false);
                            }}
                            className="w-full py-2 px-4 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                          >
                            ปิด
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Payment Breakdown (for both full and deposit mode) */}
                  {userRegistration.totalAmount && userRegistration.totalAmount > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                      <h3 className="font-semibold text-blue-900 mb-4">รายละเอียดการชำระเงิน</h3>

                      {/* Deposit Mode - Show breakdown */}
                      {event?.paymentMode === 'deposit' && (
                        <>
                          {/* Deposit Payment */}
                          <div className="bg-white rounded-lg p-4 mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">งวดที่ 1: มัดจำ</span>
                              <span className="text-lg font-bold">{userRegistration.depositAmount?.toLocaleString() || 0} บาท</span>
                            </div>

                            {userRegistration.depositDeadline && !userRegistration.depositPaid && (
                              <div className="text-sm text-gray-600 mb-2">
                                ครบกำหนด: {formatDeadline(userRegistration.depositDeadline)}
                                <br />
                                <span className="text-orange-600 font-medium">
                                  {getTimeRemaining(userRegistration.depositDeadline)}
                                </span>
                              </div>
                            )}

                            {userRegistration.depositPaid && (
                              <span className="text-sm text-green-600 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                ชำระแล้ว {userRegistration.depositPaidDate && `(${formatDeadline(userRegistration.depositPaidDate)})`}
                              </span>
                            )}
                          </div>

                          {/* Remaining Payment */}
                          {userRegistration.remainingAmount && userRegistration.remainingAmount > 0 && (
                            <div className="bg-white rounded-lg p-4 mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">งวดที่ 2: ยอดคงเหลือ</span>
                                <span className="text-lg font-bold text-orange-600">
                                  {userRegistration.remainingAmount.toLocaleString()} บาท
                                </span>
                              </div>

                              {userRegistration.remainingDeadline && !userRegistration.remainingSlipUrl && (
                                <div className="text-sm text-gray-600 mb-2">
                                  ครบกำหนด: {formatDeadline(userRegistration.remainingDeadline)}
                                  <br />
                                  <span className="text-orange-600 font-medium">
                                    {getTimeRemaining(userRegistration.remainingDeadline)}
                                  </span>
                                </div>
                              )}

                              {userRegistration.remainingSlipUrl && (
                                <span className="text-sm text-green-600 flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  ชำระครบแล้ว
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Total Amount Summary Card */}
                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-4 mb-4">
                        <div className="text-sm opacity-90 mb-1">สรุปค่าใช้จ่ายทั้งหมด</div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-3xl font-bold">{userRegistration.totalAmount.toLocaleString()} บาท</span>
                          <span className="text-sm opacity-90">({userRegistration.attendeeCount || 1} คน)</span>
                        </div>
                      </div>

                      {/* Single Payment Submission Button - Works for both full and deposit mode */}
                      {/* Only show if event has payment and user hasn't paid yet */}
                      {(() => {
                        // Debug: Log visibility conditions
                        const hasPaymentAccount = !!event.paymentAccountNumber;
                        const hasTotalAmount = userRegistration.totalAmount > 0;
                        const notPaidDeposit = !userRegistration.depositPaid;
                        const hasRemainingUnpaid = userRegistration.remainingAmount && userRegistration.remainingAmount > 0 && !userRegistration.remainingSlipUrl;
                        const shouldShow = hasPaymentAccount && hasTotalAmount && (notPaidDeposit || hasRemainingUnpaid);

                        console.log('🔍 Payment Button Visibility Check:', {
                          hasPaymentAccount,
                          hasTotalAmount,
                          totalAmount: userRegistration.totalAmount,
                          notPaidDeposit,
                          depositPaid: userRegistration.depositPaid,
                          hasRemainingUnpaid,
                          remainingAmount: userRegistration.remainingAmount,
                          remainingSlipUrl: userRegistration.remainingSlipUrl,
                          shouldShow,
                        });

                        return shouldShow;
                      })() ? (
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-4">
                          {/* Show instruction text only when there's a payment slip URL */}
                          {event.paymentSlipSubmissionUrl && (
                            <>
                              {(event as any).paymentInstructionText && (
                                <p className="text-sm text-gray-700 mb-3">
                                  {(event as any).paymentInstructionText}
                                </p>
                              )}
                              {!(event as any).paymentInstructionText && (
                                <p className="text-sm text-gray-700 mb-3">
                                  <strong>คำแนะนำ:</strong> คุณสามารถชำระเงินแบบเต็มจำนวนหรือแบบแบ่งงวดก็ได้ โปรดส่งหลักฐานการชำระเงินผ่านลิงก์ด้านล่าง
                                </p>
                              )}
                            </>
                          )}

                          {event.paymentSlipSubmissionUrl ? (
                            <button
                              onClick={() => {
                                if (!userRegistration) {
                                  toast.error('กรุณาลงทะเบียนก่อนอัพโหลดสลิป');
                                  return;
                                }

                                if (!event.paymentSlipSubmissionUrl) {
                                  toast.error('ไม่พบ URL สำหรับอัพโหลดสลิป');
                                  return;
                                }

                                // Check if using external link mode (Google Form / LINE / etc.)
                                const useExternal = (event as any).useExternalPaymentLink === true;

                                if (useExternal) {
                                  // External Link Mode: Open URL directly in new tab without parameters
                                  window.open(event.paymentSlipSubmissionUrl, '_blank');
                                } else {
                                  // GAS Mode: Add parameters and open in popup
                                  // Determine payment type based on event mode and deposit status
                                  let paymentType: 'deposit' | 'remaining' | 'full' = 'full';

                                  if (event.paymentMode === 'deposit') {
                                    // Deposit mode: Check if deposit already paid
                                    if (userRegistration.depositPaid && userRegistration.remainingAmount && userRegistration.remainingAmount > 0) {
                                      paymentType = 'remaining';
                                    } else {
                                      paymentType = 'deposit';
                                    }
                                  } else {
                                    // Full payment mode (or undefined = default to full)
                                    paymentType = 'full';
                                  }

                                  console.log('💳 Payment Type Determination:', {
                                    eventPaymentMode: event.paymentMode,
                                    depositPaid: userRegistration.depositPaid,
                                    remainingAmount: userRegistration.remainingAmount,
                                    determinedPaymentType: paymentType,
                                  });

                                  // Build dynamic URL with parameters
                                  const url = new URL(event.paymentSlipSubmissionUrl);
                                  url.searchParams.append('registrationId', userRegistration.registrationId);
                                  url.searchParams.append('eventId', event.eventId);
                                  url.searchParams.append('lineUserId', session?.user?.id || '');
                                  url.searchParams.append('paymentType', paymentType);

                                  // Open in popup window
                                  const popup = window.open(
                                    url.toString(),
                                    'uploadSlip',
                                    'width=600,height=700,scrollbars=yes,resizable=yes'
                                  );

                                  if (!popup) {
                                    toast.error('กรุณาอนุญาตให้เปิดหน้าต่างใหม่ (Popup)');
                                    return;
                                  }

                                  // Auto-refresh when popup closes
                                  const checkClosed = setInterval(() => {
                                    if (popup.closed) {
                                      clearInterval(checkClosed);
                                      console.log('Upload window closed, refreshing data...');
                                      fetchEventDetail();
                                    }
                                  }, 500);
                                }
                              }}
                              className="block w-full text-center bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
                            >
                              <span className="flex items-center justify-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {(event as any).paymentSlipButtonText || 'ส่งหลักฐานการชำระเงิน'}
                              </span>
                            </button>
                          ) : (
                            <div className="text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                              <p>โปรดชำระเงินและส่งหลักฐานการชำระตามช่องทางที่ระบุไว้ในข้อมูลการชำระเงินด้านบน</p>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Payment Status Badge */}
                      {userRegistration.paymentStatus && (
                        <div className="mt-4 pt-4 border-t border-blue-200">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">สถานะการชำระเงิน:</span>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadgeClass(userRegistration.paymentStatus)}`}>
                              {userRegistration.paymentStatus}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Payment Slip Display */}
                      {(userRegistration.depositSlipUrl || userRegistration.remainingSlipUrl) && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3">หลักฐานการชำระเงิน</h4>
                          <div className="space-y-3">
                            {/* Deposit Slip */}
                            {userRegistration.depositSlipUrl && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <span className="text-sm font-semibold text-blue-900">
                                        {event.paymentMode === 'deposit' ? 'สลิปมัดจำ' : 'สลิปชำระเงิน'}
                                      </span>
                                    </div>
                                    {userRegistration.depositPaidDate && (
                                      <p className="text-xs text-blue-700">
                                        วันที่ส่ง: {new Date(userRegistration.depositPaidDate).toLocaleDateString('th-TH', {
                                          year: 'numeric',
                                          month: 'long',
                                          day: 'numeric'
                                        })}
                                      </p>
                                    )}
                                    {event.paymentMode === 'deposit' && userRegistration.depositAmount && (
                                      <p className="text-xs text-blue-700 mt-1">
                                        จำนวนเงิน: {userRegistration.depositAmount.toLocaleString()} บาท
                                      </p>
                                    )}
                                  </div>
                                  <a
                                    href={userRegistration.depositSlipUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    ดูสลิป
                                  </a>
                                </div>
                              </div>
                            )}

                            {/* Remaining Slip */}
                            {userRegistration.remainingSlipUrl && (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      <span className="text-sm font-semibold text-green-900">สลิปยอดคงเหลือ</span>
                                    </div>
                                    {userRegistration.remainingPaidDate && (
                                      <p className="text-xs text-green-700">
                                        วันที่ส่ง: {new Date(userRegistration.remainingPaidDate).toLocaleDateString('th-TH', {
                                          year: 'numeric',
                                          month: 'long',
                                          day: 'numeric'
                                        })}
                                      </p>
                                    )}
                                    {userRegistration.remainingAmount && (
                                      <p className="text-xs text-green-700 mt-1">
                                        จำนวนเงิน: {userRegistration.remainingAmount.toLocaleString()} บาท
                                      </p>
                                    )}
                                  </div>
                                  <a
                                    href={userRegistration.remainingSlipUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    ดูสลิป
                                  </a>
                                </div>
                              </div>
                            )}

                            {/* Deadline Information */}
                            {event.paymentMode === 'deposit' && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                  <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <div className="text-xs text-yellow-800 space-y-1">
                                    {!userRegistration.depositPaid && userRegistration.depositDeadline && (
                                      <p>
                                        <span className="font-semibold">กำหนดชำระมัดจำ:</span>{' '}
                                        {formatDeadline(userRegistration.depositDeadline)}
                                        {(() => {
                                          const remaining = getTimeRemaining(userRegistration.depositDeadline);
                                          return remaining ? ` (${remaining})` : '';
                                        })()}
                                      </p>
                                    )}
                                    {userRegistration.depositPaid && !userRegistration.remainingSlipUrl && userRegistration.remainingDeadline && (
                                      <p>
                                        <span className="font-semibold">กำหนดชำระยอดคงเหลือ:</span>{' '}
                                        {formatDeadline(userRegistration.remainingDeadline)}
                                        {(() => {
                                          const remaining = getTimeRemaining(userRegistration.remainingDeadline);
                                          return remaining ? ` (${remaining})` : '';
                                        })()}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : !session?.user?.memberId && !['admin', 'committee', 'event-co', 'event-staff'].includes(session?.user?.role || '') ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="space-y-3">
                      <div>
                        <p className="font-semibold text-yellow-800 mb-1">กิจกรรมสำหรับสมาชิกเอเจ้นท์คลับเท่านั้น</p>
                        <p className="text-sm text-yellow-700">
                          สนใจสมัครสมาชิก{' '}
                          <Link href="/apply" className="text-yellow-800 font-medium hover:underline">
                            คลิกที่นี่
                          </Link>
                        </p>
                      </div>
                      <div className="pt-2 border-t border-yellow-200">
                        <p className="text-sm text-yellow-700 mb-1">
                          หากคุณเป็นสมาชิกเอเจ้นท์คลับอยู่แล้ว
                        </p>
                        <p className="text-sm text-yellow-700">
                          กรุณา Login ด้วย LINE ที่ลงทะเบียนเข้าร่วมกลุ่ม
                        </p>
                        <p className="text-sm text-yellow-700 mt-1">
                          หากคุณยังไม่ได้ทำการยืนยันตัวตน กรุณาติดต่อทีมนายทะเบียน
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : !event.registrationOpen ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-gray-600 font-medium">ปิดรับสมัคร</p>
                </div>
              ) : isFull ? (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 text-center">
                  <div className="flex items-center justify-center mb-3">
                    <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-red-700 mb-2">ปิดรับลงทะเบียน</h3>
                  <p className="text-red-600">ขณะนี้มีผู้ให้ความสนใจจองกิจกรรมนี้เต็มจำนวนแล้ว</p>
                  {event.maxCapacity && summary && (
                    <p className="text-sm text-red-500 mt-3">
                      จำนวนผู้ลงทะเบียน: {summary.totalAttendees} / {event.maxCapacity} คน
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">ลงทะเบียนเข้าร่วมกิจกรรม</h3>

                  {/* Guest Information Form for Event-Co without memberId */}
                  {!session?.user?.memberId && ['admin', 'committee', 'event-co', 'event-staff'].includes(session?.user?.role || '') && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-purple-900 mb-3">
                        ข้อมูลผู้ลงทะเบียน
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            ชื่อบริษัท *
                          </label>
                          <input
                            type="text"
                            value={guestCompanyName}
                            onChange={(e) => setGuestCompanyName(e.target.value)}
                            placeholder="กรอกชื่อบริษัท"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            เลขที่ใบอนุญาต (ถ้ามี)
                          </label>
                          <input
                            type="text"
                            value={guestLicenseNumber}
                            onChange={(e) => setGuestLicenseNumber(e.target.value)}
                            placeholder="เลขที่ใบอนุญาต ทท./นท."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            ชื่อผู้ติดต่อ *
                          </label>
                          <input
                            type="text"
                            value={guestContactName}
                            onChange={(e) => setGuestContactName(e.target.value)}
                            placeholder="ชื่อ-นามสกุล ผู้ติดต่อ"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            เบอร์โทรศัพท์ *
                          </label>
                          <input
                            type="tel"
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                            placeholder="08X-XXX-XXXX"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-purple-600 mt-3">
                        * กรุณากรอกข้อมูลให้ครบถ้วน ข้อมูลนี้จะใช้ในการติดต่อกลับและออกใบเสร็จ
                      </p>
                    </div>
                  )}

                  {/* Attendee Type Selection (if enabled) */}
                  {event.useAttendeeTypePricing && event.attendeeTypes && event.attendeeTypes.length > 0 ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3">
                        เลือกจำนวนผู้เข้าร่วมตามประเภท *
                      </h4>

                      <div className="space-y-3">
                        {event.attendeeTypes
                          .filter((t: AttendeeType) => t.isActive)
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map(type => {
                            const selection = attendeeTypeSelections.find(s => s.typeId === type.typeId);
                            const quantity = selection?.quantity || 0;

                            return (
                              <div key={type.typeId} className="flex items-center gap-3 bg-white p-3 rounded">
                                <span className="text-sm font-medium text-gray-700 w-40">
                                  {type.typeName}:
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={quantity === 0 ? '' : quantity}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const qty = value === '' ? 0 : parseInt(value);
                                    const newSelections = attendeeTypeSelections.filter(s => s.typeId !== type.typeId);
                                    if (qty > 0) {
                                      newSelections.push({ typeId: type.typeId, quantity: qty });
                                    }
                                    setAttendeeTypeSelections(newSelections);

                                    // Auto-calculate total count and fee
                                    const totalCount = newSelections.reduce((sum, s) => sum + s.quantity, 0);
                                    setAttendeeCount(totalCount);

                                    const totalFee = newSelections.reduce((sum, s) => {
                                      const t = event.attendeeTypes?.find((at: AttendeeType) => at.typeId === s.typeId);
                                      return sum + (t?.price || 0) * s.quantity;
                                    }, 0);
                                    setCalculatedTotalFee(totalFee);

                                    // Auto-adjust attendee names array
                                    handleAttendeeCountChange(totalCount);
                                  }}
                                  onBlur={(e) => {
                                    if (e.target.value === '') {
                                      // Clean up empty values when field loses focus
                                      const newSelections = attendeeTypeSelections.filter(s => s.typeId !== type.typeId);
                                      setAttendeeTypeSelections(newSelections);
                                    }
                                  }}
                                  placeholder="0"
                                  className="w-20 px-3 py-2 border border-gray-300 rounded-md text-center"
                                />
                                <span className="text-sm text-gray-600">
                                  คน × {type.price.toLocaleString()} บาท
                                </span>
                                {quantity > 0 && (
                                  <span className="text-sm font-semibold text-blue-600 ml-auto">
                                    = {(type.price * quantity).toLocaleString()} บาท
                                  </span>
                                )}
                              </div>
                            );
                          })}
                      </div>

                      {/* Summary */}
                      <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">
                          รวมทั้งหมด: {attendeeCount} คน
                        </span>
                        <span className="text-base font-bold text-blue-900">
                          ค่าลงทะเบียน: {calculatedTotalFee.toLocaleString()} บาท
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Attendee Count (original) */
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
                  )}

                  {/* Contact Information Card */}
                  {memberName && memberPhone && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-blue-900">
                          ข้อมูลผู้ติดต่อ
                        </h4>
                        <Link
                          href="/profile"
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                        >
                          แก้ไขข้อมูลติดต่อ
                        </Link>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-20">ชื่อ:</span>
                          <span className="text-gray-900">{memberName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-20">เบอร์โทร:</span>
                          <span className="text-gray-900">{memberPhone}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Attendee Names */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      รายชื่อผู้สมัครร่วมกิจกรรม
                    </label>

                    <div className="space-y-2">
                      {Array.from({ length: attendeeCount }).map((_, index) => {
                        const isRequired = event.requireAttendeeNames === true;

                        return (
                          <div key={index}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              ผู้เข้าร่วมกิจกรรมท่านที่ {index + 1} {!isRequired && '(ถ้ามี)'}
                            </label>
                            <input
                              type="text"
                              value={attendeeNames[index] || ''}
                              onChange={(e) => handleAttendeeNameChange(index, e.target.value)}
                              placeholder={index === 0 ? 'ชื่อของคุณ' : `ชื่อผู้เข้าร่วมคนที่ ${index + 1}`}
                              required={isRequired}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Room Allocation in Edit Mode (available for all pricing types when room types are configured) */}
                  {event.roomTypes && event.roomTypes.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-amber-900 mb-3">
                        เลือกประเภทห้องพัก *
                      </h4>

                      <div className="space-y-3">
                        {event.roomTypes
                          .filter((rt: RoomType) => rt.isActive)
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map(roomType => {
                            const currentAlloc = roomAllocations.find(ra => ra.roomTypeId === roomType.typeId);
                            const roomCount = currentAlloc?.roomCount || 0;

                            return (
                              <div key={roomType.typeId} className="bg-white p-3 rounded">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-gray-700 w-36">
                                    {roomType.typeName}:
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="20"
                                    value={roomCount === 0 ? '' : roomCount}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      const count = value === '' ? 0 : parseInt(value);
                                      const newAllocations = roomAllocations.filter(ra => ra.roomTypeId !== roomType.typeId);
                                      if (count > 0) {
                                        newAllocations.push({ roomTypeId: roomType.typeId, roomCount: count });
                                      }
                                      setRoomAllocations(newAllocations);

                                      // Calculate total capacity
                                      let totalCapacity = 0;
                                      for (const alloc of newAllocations) {
                                        const rt = event.roomTypes?.find((r: RoomType) => r.typeId === alloc.roomTypeId);
                                        if (rt) {
                                          totalCapacity += rt.capacity * alloc.roomCount;
                                        }
                                      }

                                      // Validate
                                      if (totalCapacity !== attendeeCount) {
                                        setRoomValidationError(
                                          `จำนวนผู้เข้าพักในห้องไม่ตรงกับจำนวนผู้เข้าร่วม (รองรับ ${totalCapacity} คน แต่ลงทะเบียน ${attendeeCount} คน)`
                                        );
                                      } else {
                                        setRoomValidationError(null);
                                      }

                                      // Calculate room fee
                                      let roomFee = 0;
                                      for (const alloc of newAllocations) {
                                        const rt = event.roomTypes?.find((r: RoomType) => r.typeId === alloc.roomTypeId);
                                        if (rt) {
                                          roomFee += rt.price * alloc.roomCount;
                                        }
                                      }
                                      setCalculatedRoomFee(roomFee);
                                    }}
                                    onBlur={(e) => {
                                      if (e.target.value === '') {
                                        // Clean up empty values when field loses focus
                                        const newAllocations = roomAllocations.filter(ra => ra.roomTypeId !== roomType.typeId);
                                        setRoomAllocations(newAllocations);
                                      }
                                    }}
                                    placeholder="0"
                                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-center"
                                  />
                                  <span className="text-sm text-gray-600">
                                    ห้อง ({roomType.capacity} คน/ห้อง)
                                  </span>
                                  {roomType.price > 0 && (
                                    <span className="text-sm text-gray-600">
                                      × {roomType.price.toLocaleString()} บาท
                                    </span>
                                  )}
                                  {roomCount > 0 && (
                                    <span className="text-sm font-semibold text-amber-700 ml-auto">
                                      = รองรับ {roomType.capacity * roomCount} คน
                                      {roomType.price > 0 && ` (+${(roomType.price * roomCount).toLocaleString()} บาท)`}
                                    </span>
                                  )}
                                </div>
                                {/* Show note directly below input if exists and room count > 0 */}
                                {roomType.note && roomCount > 0 && (
                                  <p className="text-xs text-amber-700 mt-2 ml-36 pl-3">
                                    {roomType.note}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                      </div>

                      {/* Validation Summary */}
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        {roomValidationError ? (
                          <p className="text-sm text-red-600 font-medium">⚠️ {roomValidationError}</p>
                        ) : roomAllocations.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-sm text-green-600 font-medium">
                              ✓ รองรับ {roomAllocations.reduce((sum, ra) => {
                                const rt = event.roomTypes?.find((r: RoomType) => r.typeId === ra.roomTypeId);
                                return sum + (rt?.capacity || 0) * ra.roomCount;
                              }, 0)} คน (ลงทะเบียน {attendeeCount} คน)
                            </p>
                            {calculatedRoomFee > 0 && (
                              <p className="text-sm text-amber-700 font-semibold">
                                ค่าห้องพักเพิ่มเติม: {calculatedRoomFee.toLocaleString()} บาท
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-gray-500 mt-2">
                        กรุณาเลือกจำนวนห้องให้ครบพอดีตามจำนวนคนที่ลงทะเบียน
                      </p>
                    </div>
                  )}

                  {/* Special Requests */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ความต้องการพิเศษ (ถ้ามี)
                    </label>
                    <textarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      placeholder="เช่น ต้องการอาหารเจ, แพ้อาหารทะเล, ต้องการห้องชั้นล่าง, ผู้สูงอายุ/ผู้พิการ"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      ระบุความต้องการพิเศษ เช่น อาหาร การเข้าพัก หรือความช่วยเหลือพิเศษ
                    </p>
                  </div>

                  {/* Total Amount */}
                  {calculateRegistrationFee(event, attendeeCount, true) > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-gray-600">ค่าสมัคร</p>
                          <p className="text-xs text-gray-500">
                            {event.pricingType === 'tiered' ? (
                              <>
                                {event.priceTiers && event.priceTiers.length > 0 ? (
                                  // New multi-tier pricing
                                  <>
                                    {(() => {
                                      const tier1 = event.priceTiers[0];
                                      const tier2 = event.priceTiers[1];

                                      if (tier1.priceType === 'total' && attendeeCount <= tier1.upToCount) {
                                        return `${tier1.upToCount} คนแรก ${tier1.price.toLocaleString()} บาท (รวม)`;
                                      } else if (tier1.priceType === 'total') {
                                        return `${tier1.price.toLocaleString()} บาท (${tier1.upToCount} คนแรก) + ${tier2?.price.toLocaleString()} บาท × ${attendeeCount - tier1.upToCount} คน`;
                                      }
                                      return null;
                                    })()}
                                    {(event.memberDiscount ?? 0) > 0 && (
                                      <span> - ส่วนลด {event.memberDiscount!.toLocaleString()} บาท</span>
                                    )}
                                  </>
                                ) : (
                                  // Legacy tiered pricing
                                  <>
                                    {attendeeCount === 1
                                      ? `${event.baseFee?.toLocaleString()} บาท/คน`
                                      : `${event.baseFee?.toLocaleString()} บาท (คนแรก) + ${event.additionalFeePerPerson?.toLocaleString()} บาท × ${attendeeCount - 1} คน`}
                                    {(event.memberDiscount ?? 0) > 0 && (
                                      <span> - ส่วนลด {event.memberDiscount!.toLocaleString()} บาท</span>
                                    )}
                                  </>
                                )}
                              </>
                            ) : (
                              `${attendeeCount} คน × ${event.registrationFee.toLocaleString()} บาท/คน`
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            {calculateRegistrationFee(event, attendeeCount, true).toLocaleString()} บาท
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleRegister}
                    disabled={registering || loading}
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
                    ) : loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        กำลังโหลดข้อมูล...
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
