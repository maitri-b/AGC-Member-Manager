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
  // Full payment deadline (for paymentMode = 'full')
  paymentDeadlineType?: 'none' | 'fixed' | 'hours';
  paymentDeadlineFixed?: string;
  paymentDeadlineHours?: number;
  // Deposit payment configuration (for paymentMode = 'deposit')
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

interface PaymentSlip {
  slipId: string;
  registrationId: string;
  eventId: string;
  amount: number;
  paymentType: 'deposit' | 'remaining' | 'full' | 'additional';
  description: string;
  slipUrl: string;
  uploadedAt?: string;
  createdAt?: string; // Alternative timestamp field
  uploadedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
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
  // Payment tracking (for additional payments after amount adjustments)
  paidAmount?: number;
  additionalPayments?: string; // JSON stringified AdditionalPayment[]
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
  const [paymentSlips, setPaymentSlips] = useState<PaymentSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [attendeeNames, setAttendeeNames] = useState<string[]>(['']);
  const [specialRequests, setSpecialRequests] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  // Attendee names edit state (New)
  const [isEditingNames, setIsEditingNames] = useState(false);
  const [tempAttendeeNames, setTempAttendeeNames] = useState<string[]>([]);
  // Special requests edit state (New)
  const [isEditingSpecialRequests, setIsEditingSpecialRequests] = useState(false);
  const [tempSpecialRequests, setTempSpecialRequests] = useState('');
  const [specialRequestsLastUpdated, setSpecialRequestsLastUpdated] = useState<string | null>(null);
  // Member contact info state (New)
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberStatus, setMemberStatus] = useState('');
  const [lineGroupStatus, setLineGroupStatus] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [lineDisplayName, setLineDisplayName] = useState('');
  const [lineProfilePicture, setLineProfilePicture] = useState('');
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

  // Lightbox state for payment slip images
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState('');
  const [lightboxTitle, setLightboxTitle] = useState('');

  // Registration form visibility state
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);

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

  const fetchPaymentSlips = async (registrationId: string) => {
    try {
      console.log('[Payment Slips] Fetching slips for registrationId:', registrationId);
      const response = await fetch(`/api/payments/slips?registrationId=${registrationId}`);
      console.log('[Payment Slips] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[Payment Slips] Received data:', data);
        console.log('[Payment Slips] Number of slips:', data.slips?.length || 0);
        setPaymentSlips(data.slips || []);
      } else {
        console.error('[Payment Slips] Failed to fetch:', response.statusText);
      }
    } catch (error) {
      console.error('[Payment Slips] Error fetching payment slips:', error);
    }
  };

  // Helper function to get payment status description
  const getPaymentStatusDescription = (status: string): string => {
    const descriptions: Record<string, string> = {
      'รอชำระเงิน': 'โปรดชำระเงินตามยอดที่ระบุ และอัปโหลดสลิปเพื่อยืนยันการชำระ',
      'รอตรวจสอบ': 'ระบบได้รับสลิปของคุณแล้ว ทีมงานกำลังตรวจสอบและจะอนุมัติภายใน 1-2 วันทำการ',
      'รอตรวจสอบมัดจำ': 'ระบบได้รับสลิปมัดจำของคุณแล้ว ทีมงานกำลังตรวจสอบและจะอนุมัติภายใน 1-2 วันทำการ',
      'รอตรวจสอบยอดคงเหลือ': 'ระบบได้รับสลิปยอดคงเหลือของคุณแล้ว ทีมงานกำลังตรวจสอบและจะอนุมัติภายใน 1-2 วันทำการ',
      'รอตรวจสอบเงินเพิ่มเติม': 'ระบบได้รับสลิปการชำระเพิ่มเติมของคุณแล้ว ทีมงานกำลังตรวจสอบและจะอนุมัติภายใน 1-2 วันทำการ',
      'ชำระครบแล้ว': 'คุณได้ชำระเงินครบถ้วนแล้ว โปรดแสดงหลักฐานการลงทะเบียนหรือแจ้งรหัสการลงทะเบียนเมื่อเข้าร่วมกิจกรรม',
      'ชำระเต็มจำนวนแล้ว': 'คุณได้ชำระเงินครบถ้วนแล้ว โปรดแสดงหลักฐานการลงทะเบียนหรือแจ้งรหัสการลงทะเบียนเมื่อเข้าร่วมกิจกรรม',
      'ชำระมัดจำแล้ว': 'คุณได้ชำระมัดจำเรียบร้อยแล้ว โปรดชำระยอดคงเหลือภายในวันและเวลาที่กำหนด',
      'ชำระยอดคงเหลือแล้ว': 'คุณได้ชำระเงินครบถ้วนแล้ว โปรดแสดงหลักฐานการลงทะเบียนหรือแจ้งรหัสการลงทะเบียนเมื่อเข้าร่วมกิจกรรม',
      'รอชำระยอดคงเหลือ': 'คุณได้ชำระมัดจำแล้ว โปรดชำระยอดคงเหลือภายในวันและเวลาที่กำหนด',
      'รอชำระมัดจำ': 'โปรดชำระเงินมัดจำตามยอดที่ระบุ และอัปโหลดสลิปเพื่อยืนยันการชำระ',
      'พ้นกำหนด': 'การชำระเงินเกินกำหนด โปรดติดต่อเจ้าหน้าที่เพื่อขอความช่วยเหลือ',
      'ปฏิเสธสลิป': 'สลิปของคุณถูกปฏิเสธ โปรดตรวจสอบเหตุผลและอัปโหลดสลิปใหม่',
      'ลงทะเบียนแล้ว': 'คุณได้ลงทะเบียนเรียบร้อยแล้ว (กิจกรรมไม่มีค่าใช้จ่าย)',
    };
    return descriptions[status] || 'กรุณาติดต่อเจ้าหน้าที่หากมีข้อสงสัย';
  };

  // Helper function to get Thai payment type name
  const getPaymentTypeName = (type: string): string => {
    const names: Record<string, string> = {
      'full': 'ชำระเต็มจำนวน',
      'deposit': 'มัดจำ',
      'remaining': 'ยอดคงเหลือ',
      'additional': 'ชำระเพิ่มเติม',
    };
    return names[type] || type;
  };

  // Helper function to get slip status badge class
  const getSlipStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper function to get slip status text
  const getSlipStatusText = (status: string): string => {
    const texts: Record<string, string> = {
      'approved': 'อนุมัติแล้ว',
      'pending': 'รอตรวจสอบ',
      'rejected': 'ปฏิเสธ',
    };
    return texts[status] || status;
  };

  const fetchEventDetail = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/detail`);

      if (response.ok) {
        const data = await response.json();

        setEvent(data.event);
        setSummary(data.summary);
        setUserRegistration(data.userRegistration);

        // Fetch payment slips if user has registered
        if (data.userRegistration?.registrationId) {
          fetchPaymentSlips(data.userRegistration.registrationId);
        }

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
        if (data.companyName) {
          setCompanyName(data.companyName);
        }
        if (data.licenseNumber) {
          setLicenseNumber(data.licenseNumber);
        }
        if (data.lineDisplayName) {
          setLineDisplayName(data.lineDisplayName);
        }
        if (data.lineProfilePicture) {
          setLineProfilePicture(data.lineProfilePicture);
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

          // Load special requests
          if (data.userRegistration.specialRequests) {
            setSpecialRequests(data.userRegistration.specialRequests);
          }

          // Load special requests last updated timestamp
          if (data.userRegistration.specialRequestsUpdatedAt) {
            setSpecialRequestsLastUpdated(data.userRegistration.specialRequestsUpdatedAt);
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

    // Validate attendee count
    if (attendeeCount === 0) {
      toast.error('กรุณาระบุจำนวนผู้เข้าร่วม');
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

            {/* Registration Button - Show when not registered */}
            {!userRegistration && !isFull && event.registrationOpen && (
              <div className="mb-8">
                {session?.user?.role === 'visitor' ? (
                  // Visitor cannot register - show membership message
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-6 text-center">
                    <div className="mb-4">
                      <svg className="w-16 h-16 mx-auto text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-3">กิจกรรมสำหรับสมาชิก Agents Club เท่านั้น</h3>
                    <p className="text-gray-700 mb-4">
                      ขออภัย กิจกรรมนี้เปิดให้เฉพาะสมาชิกชมรมเอเจ้นท์คลับเท่านั้น
                    </p>
                    <p className="text-gray-600 mb-6">
                      หากคุณสนใจสมัครเป็นสมาชิก สามารถกรอกใบสมัครได้ที่ลิงก์ด้านล่าง
                    </p>
                    <Link
                      href="/apply"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      สมัครสมาชิกชมรมเอเจ้นท์คลับ
                    </Link>
                  </div>
                ) : (
                  // Non-visitor can register normally
                  <button
                    onClick={() => setShowRegistrationForm(!showRegistrationForm)}
                    className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-lg rounded-lg transition-all shadow-lg hover:shadow-xl"
                  >
                    {showRegistrationForm ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        ซ่อนแบบฟอร์มลงทะเบียน
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        ลงทะเบียนเข้าร่วมกิจกรรมนี้
                      </span>
                    )}
                  </button>
                )}
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
                        {userRegistration.paymentStatus && (
                          <p>สถานะ: <span className="font-medium">{userRegistration.paymentStatus}</span></p>
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
                                  {(event.memberDiscount ?? 0) > 0 && (
                                    <div className="flex justify-between text-green-700">
                                      <span>ส่วนลดสมาชิก</span>
                                      <span>-{event.memberDiscount!.toLocaleString()} บาท</span>
                                    </div>
                                  )}
                                </>
                              ) : event.baseFee !== undefined && event.baseFee > 0 ? (
                                // Legacy tiered pricing (baseFee + additionalFeePerPerson) - Only show if baseFee > 0
                                <>
                                  <div className="flex justify-between">
                                    <span>ท่านแรก {event.baseFee.toLocaleString()} บาท × 1 ท่าน</span>
                                    <span>{event.baseFee.toLocaleString()} บาท</span>
                                  </div>
                                  {userRegistration.attendeeCount > 1 && event.additionalFeePerPerson && event.additionalFeePerPerson > 0 && (
                                    <div className="flex justify-between">
                                      <span>ท่านที่เหลือ {event.additionalFeePerPerson.toLocaleString()} บาท × {userRegistration.attendeeCount - 1} ท่าน</span>
                                      <span>{(event.additionalFeePerPerson * (userRegistration.attendeeCount - 1)).toLocaleString()} บาท</span>
                                    </div>
                                  )}
                                  {(event.memberDiscount ?? 0) > 0 && (
                                    <div className="flex justify-between text-green-700">
                                      <span>ส่วนลดสมาชิก</span>
                                      <span>-{event.memberDiscount!.toLocaleString()} บาท</span>
                                    </div>
                                  )}
                                </>
                              ) : null}
                            </>
                          ) : event.registrationFee && event.registrationFee > 0 ? (
                            // Fixed Pricing Breakdown - Only show if registrationFee exists and > 0
                            <div className="flex justify-between">
                              <span>ท่านละ {event.registrationFee.toLocaleString()} บาท × {userRegistration.attendeeCount} ท่าน</span>
                              <span>{(event.registrationFee * userRegistration.attendeeCount).toLocaleString()} บาท</span>
                            </div>
                          ) : null}

                          {/* Event Fee Subtotal - Only show if event has room allocations or special charges */}
                          {(() => {
                            // Only show event fee subtotal if there are room fees or special charges
                            const hasRoomFees = userRegistration.roomAllocations && userRegistration.roomAllocations.length > 0;
                            const hasSpecialCharges = userRegistration.specialCharges && userRegistration.specialCharges.length > 0;

                            if (!hasRoomFees && !hasSpecialCharges) {
                              return null; // Don't show subtotal if there are no additional fees
                            }

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

                            if (eventFee === 0) {
                              return null; // Don't show if event fee is 0
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

                              {/* Subtotal for rooms - Only show if total > 0 */}
                              {(() => {
                                const roomTotal = userRegistration.roomAllocations.reduce((sum: number, alloc: RoomAllocation) => {
                                  const roomType = event.roomTypes?.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
                                  return sum + (roomType?.price || 0) * alloc.roomCount;
                                }, 0);

                                if (roomTotal === 0) {
                                  return null; // Don't show if room total is 0
                                }

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
                          {userRegistration.totalAmount !== undefined && userRegistration.totalAmount > 0 && (
                            <div className="flex justify-between font-bold text-sm pt-2 border-t-2 border-green-400 text-green-900">
                              <span>ยอดรวมทั้งหมด:</span>
                              <span>{userRegistration.totalAmount.toLocaleString()} บาท</span>
                            </div>
                          )}
                        </div>
                      </div>

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
                          ข้อมูลบริษัทและข้อมูลติดต่อของคุณ
                        </h4>
                        <Link
                          href="/profile"
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                        >
                          แก้ไขข้อมูลติดต่อ
                        </Link>
                      </div>
                      <div className="space-y-2 text-sm">
                        {companyName && (
                          <div className="flex items-start gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">ชื่อบริษัท:</span>
                            <span className="text-gray-900">{companyName}</span>
                          </div>
                        )}
                        {licenseNumber && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">เลขที่ใบอนุญาต:</span>
                            <span className="text-gray-900">{licenseNumber}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-32 flex-shrink-0">ชื่อผู้ติดต่อ:</span>
                          <span className="text-gray-900">{memberName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-32 flex-shrink-0">เบอร์โทร:</span>
                          <span className="text-gray-900">{memberPhone}</span>
                        </div>
                        {lineDisplayName && (
                          <div className="flex items-start gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">LINE Display Name:</span>
                            <div className="flex items-center gap-2">
                              {lineProfilePicture && (
                                <img
                                  src={lineProfilePicture}
                                  alt="LINE Profile"
                                  className="w-6 h-6 rounded-full"
                                />
                              )}
                              <span className="text-gray-900">{lineDisplayName}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Attendee Count Section - Moved here */}
                  {!isEditing && userRegistration && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span className="text-sm font-semibold text-green-900">จำนวนผู้เดินทาง:</span>
                        </div>
                        <span className="text-lg font-bold text-green-700">{userRegistration.attendeeCount} คน</span>
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

                      {/* Special Requests - Editable */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-700">
                            ความต้องการพิเศษ
                          </label>
                          {!isEditingSpecialRequests && (
                            <button
                              onClick={() => {
                                setIsEditingSpecialRequests(true);
                                setTempSpecialRequests(specialRequests || '');
                              }}
                              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              แก้ไข
                            </button>
                          )}
                        </div>

                        {isEditingSpecialRequests ? (
                          <div className="space-y-3">
                            <textarea
                              value={tempSpecialRequests}
                              onChange={(e) => setTempSpecialRequests(e.target.value)}
                              placeholder="เช่น ต้องการอาหารเจ, แพ้อาหารทะเล, ต้องการห้องชั้นล่าง, ผู้สูงอายุ/ผู้พิการ"
                              rows={4}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    const response = await fetch(`/api/events/${eventId}/registrations/${userRegistration?.registrationId}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        attendeeCount,
                                        attendeeNames,
                                        specialRequests: tempSpecialRequests,
                                        attendeeTypeSelections,
                                        roomAllocations,
                                        requestNameChange: false,
                                      }),
                                    });

                                    if (response.ok) {
                                      setSpecialRequests(tempSpecialRequests);
                                      setSpecialRequestsLastUpdated(new Date().toISOString());
                                      setIsEditingSpecialRequests(false);
                                      toast.success('บันทึกความต้องการพิเศษแล้ว');
                                      fetchEventDetail(); // Refresh data
                                    } else {
                                      const error = await response.json();
                                      toast.error(error.error || 'ไม่สามารถบันทึกได้');
                                    }
                                  } catch (error) {
                                    console.error('Error updating special requests:', error);
                                    toast.error('เกิดข้อผิดพลาดในการบันทึก');
                                  }
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                              >
                                บันทึก
                              </button>
                              <button
                                onClick={() => {
                                  setIsEditingSpecialRequests(false);
                                  setTempSpecialRequests('');
                                }}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 whitespace-pre-wrap min-h-[60px]">
                              {specialRequests || <span className="text-gray-400 italic">ไม่มีความต้องการพิเศษ</span>}
                            </div>
                            {specialRequestsLastUpdated && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                อัปเดตล่าสุด: {new Date(specialRequestsLastUpdated).toLocaleString('th-TH', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            )}
                          </>
                        )}
                      </div>

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

                      {/* 1. Total Amount Summary - Show First */}
                      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-4 mb-4">
                        <div className="text-sm opacity-90 mb-1">สรุปค่าใช้จ่ายทั้งหมด</div>
                        <div className="flex items-baseline justify-between">
                          <span className="text-3xl font-bold">{userRegistration.totalAmount.toLocaleString()} บาท</span>
                          <span className="text-sm opacity-90">({userRegistration.attendeeCount || 1} คน)</span>
                        </div>
                      </div>

                      {/* 2. Payment Status - Large and Clear */}
                      {userRegistration.paymentStatus && (
                        <div className="bg-white rounded-lg p-4 mb-4 border-2 border-gray-200">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-base font-semibold text-gray-700">สถานะการชำระเงิน</span>
                            <span className={`px-4 py-2 rounded-lg text-base font-bold ${getStatusBadgeClass(userRegistration.paymentStatus)}`}>
                              {userRegistration.paymentStatus}
                            </span>
                          </div>
                          {/* Payment Status Description */}
                          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <svg className="w-4 h-4 inline mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {getPaymentStatusDescription(userRegistration.paymentStatus)}
                          </div>
                        </div>
                      )}

                      {/* 2.5. Payment Slips Table - Show all payment slips */}
                      {paymentSlips.length > 0 && (
                        <div className="bg-white rounded-lg p-3 sm:p-4 mb-4 border border-gray-200">
                          <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="hidden sm:inline">ประวัติการชำระเงิน</span>
                            <span className="sm:hidden">ประวัติชำระเงิน</span>
                          </h4>

                          {/* Payment Slips Table - Mobile Optimized */}
                          <div className="overflow-x-auto -mx-3 sm:mx-0">
                            <table className="w-full text-xs sm:text-sm">
                              <thead className="bg-gray-50 border-y border-gray-200">
                                <tr>
                                  <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-semibold text-gray-700">วันที่</th>
                                  <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-semibold text-gray-700">ประเภท</th>
                                  <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-right text-[10px] sm:text-xs font-semibold text-gray-700">ยอดเงิน</th>
                                  <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold text-gray-700">สถานะ</th>
                                  <th className="px-1.5 sm:px-3 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold text-gray-700">
                                    <span className="hidden sm:inline">ดูสลิป</span>
                                    <span className="sm:hidden">สลิป</span>
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {paymentSlips.map((slip) => {
                                  const date = new Date(slip.uploadedAt || slip.createdAt || new Date());
                                  const day = date.getDate().toString().padStart(2, '0');
                                  const month = (date.getMonth() + 1).toString().padStart(2, '0');
                                  const year = date.getFullYear().toString().slice(-2);

                                  return (
                                    <tr key={slip.slipId} className="hover:bg-gray-50">
                                      <td className="px-1.5 sm:px-3 py-2 sm:py-3 text-[10px] sm:text-xs text-gray-700 whitespace-nowrap">
                                        {`${day}/${month}/${year}`}
                                      </td>
                                      <td className="px-1.5 sm:px-3 py-2 sm:py-3">
                                        <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
                                          <span className="hidden sm:inline">{getPaymentTypeName(slip.paymentType)}</span>
                                          <span className="sm:hidden">
                                            {slip.paymentType === 'deposit' ? 'มัดจำ' :
                                             slip.paymentType === 'remaining' ? 'คงเหลือ' :
                                             slip.paymentType === 'full' ? 'เต็ม' : 'เพิ่ม'}
                                          </span>
                                        </span>
                                      </td>
                                      <td className="px-1.5 sm:px-3 py-2 sm:py-3 text-right text-[10px] sm:text-xs font-semibold text-gray-900 whitespace-nowrap">
                                        <span className="hidden sm:inline">{slip.amount.toLocaleString()} บาท</span>
                                        <span className="sm:hidden">{(slip.amount / 1000).toFixed(1)}k</span>
                                      </td>
                                      <td className="px-1.5 sm:px-3 py-2 sm:py-3 text-center">
                                        <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${getSlipStatusBadgeClass(slip.status)}`}>
                                          <span className="hidden sm:inline">{getSlipStatusText(slip.status)}</span>
                                          <span className="sm:hidden">
                                            {slip.status === 'pending' ? '⏳' :
                                             slip.status === 'approved' ? '✓' : '✗'}
                                          </span>
                                        </span>
                                      </td>
                                      <td className="px-1.5 sm:px-3 py-2 sm:py-3 text-center">
                                        <button
                                          onClick={() => {
                                            setLightboxImage(slip.slipUrl);
                                            setLightboxTitle(`สลิป${getPaymentTypeName(slip.paymentType)}`);
                                            setLightboxOpen(true);
                                          }}
                                          className="text-blue-600 hover:text-blue-800 hover:underline text-[10px] sm:text-xs font-medium"
                                        >
                                          <span className="hidden sm:inline">ดูสลิป</span>
                                          <span className="sm:hidden">
                                            <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                          </span>
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 2.6. Additional Payment Required Notice */}
                      {(() => {
                        // Calculate if additional payment is required
                        const totalAmount = userRegistration.totalAmount || 0;
                        const paidAmount = userRegistration.paidAmount || 0;
                        const additionalPayments = userRegistration.additionalPayments
                          ? (() => {
                              try {
                                const parsed = JSON.parse(userRegistration.additionalPayments);
                                return Array.isArray(parsed) ? parsed : [];
                              } catch {
                                return [];
                              }
                            })()
                          : [];

                        // Sum approved additional payments
                        const approvedAdditional = additionalPayments
                          .filter((p: any) => p.status === 'อนุมัติแล้ว')
                          .reduce((sum: number, p: any) => sum + p.amount, 0);

                        const additionalRequired = Math.max(0, totalAmount - (paidAmount + approvedAdditional));

                        // Check if there's a pending additional payment
                        const hasPendingAdditional = additionalPayments.some((p: any) => p.status === 'รอตรวจสอบ');

                        // Check if this is truly an "additional" payment (not first payment)
                        // Only show additional payment notice if user has already paid something
                        const isAdditionalPayment = paidAmount > 0 || approvedAdditional > 0;

                        // Only show this section for actual additional payments, not initial payments
                        if (!isAdditionalPayment || (additionalRequired === 0 && !hasPendingAdditional)) return null;

                        return (
                          <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4 mb-4">
                            <div className="flex items-start gap-3">
                              <svg className="w-6 h-6 text-orange-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <div className="flex-1">
                                {hasPendingAdditional ? (
                                  <>
                                    <h4 className="font-semibold text-orange-900 mb-1">🔍 กำลังตรวจสอบสลิปเงินเพิ่มเติม</h4>
                                    <p className="text-sm text-orange-800">
                                      ระบบได้รับสลิปการชำระเงินเพิ่มเติมของคุณแล้ว กรุณารอการตรวจสอบจากทีมงาน
                                    </p>
                                  </>
                                ) : additionalRequired > 0 ? (
                                  <>
                                    <h4 className="font-semibold text-orange-900 mb-2">⚠️ ต้องชำระเงินเพิ่มเติม</h4>
                                    <div className="space-y-1 text-sm text-orange-800">
                                      <div className="flex justify-between">
                                        <span>ยอดทั้งหมด:</span>
                                        <span className="font-semibold">{totalAmount.toLocaleString()} บาท</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>ชำระแล้ว:</span>
                                        <span className="font-semibold">{(paidAmount + approvedAdditional).toLocaleString()} บาท</span>
                                      </div>
                                      <div className="flex justify-between border-t border-orange-300 pt-1 mt-1">
                                        <span className="font-bold">ต้องชำระเพิ่ม:</span>
                                        <span className="font-bold text-lg text-orange-600">{additionalRequired.toLocaleString()} บาท</span>
                                      </div>
                                    </div>
                                    <p className="text-xs text-orange-700 mt-2">
                                      กรุณาชำระเงินเพิ่มเติมและส่งสลิปผ่านปุ่มด้านล่าง
                                    </p>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 3. Payment Submission Section - Show Upload Button/Instructions */}
                      {(() => {
                        const hasPaymentAccount = !!event.paymentAccountNumber;
                        const hasTotalAmount = userRegistration.totalAmount > 0;

                        // Calculate if fully paid (including additional payments)
                        const totalAmount = userRegistration.totalAmount || 0;
                        const paidAmount = userRegistration.paidAmount || 0;
                        const additionalPayments = userRegistration.additionalPayments
                          ? (() => {
                              try {
                                const parsed = JSON.parse(userRegistration.additionalPayments);
                                return Array.isArray(parsed) ? parsed : [];
                              } catch {
                                return [];
                              }
                            })()
                          : [];

                        // Sum approved additional payments
                        const approvedAdditional = additionalPayments
                          .filter((p: any) => p.status === 'อนุมัติแล้ว')
                          .reduce((sum: number, p: any) => sum + p.amount, 0);

                        const additionalRequired = Math.max(0, totalAmount - (paidAmount + approvedAdditional));

                        // Check if there's a pending additional payment
                        const hasPendingAdditional = additionalPayments.some((p: any) => p.status === 'รอตรวจสอบ');

                        // Hide button if fully paid (no additional payment required and no pending additional payment)
                        if (additionalRequired === 0 && !hasPendingAdditional && paidAmount > 0) {
                          return false;
                        }

                        // Full Payment Mode: Hide button if slip is uploaded (unless additional payment is required)
                        if (event.paymentMode !== 'deposit') {
                          const hasFullPaymentSlip = !!(userRegistration.remainingSlipUrl || (userRegistration as any).slipUrl);
                          // Show button if additional payment is required, even if initial slip was uploaded
                          if (hasFullPaymentSlip && additionalRequired === 0 && !hasPendingAdditional) return false;
                          return hasPaymentAccount && hasTotalAmount;
                        }

                        // Deposit Mode: Show button if deposit not paid OR remaining not paid OR additional payment required
                        const notPaidDeposit = !userRegistration.depositPaid && !userRegistration.depositSlipUrl;
                        const hasRemainingUnpaid = userRegistration.depositPaid && userRegistration.remainingAmount && userRegistration.remainingAmount > 0 && !userRegistration.remainingSlipUrl;
                        const needsAdditional = additionalRequired > 0 && !hasPendingAdditional;
                        const shouldShow = hasPaymentAccount && hasTotalAmount && (notPaidDeposit || hasRemainingUnpaid || needsAdditional);

                        return shouldShow;
                      })() ? (
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-4 mb-4">
                          {event.paymentSlipSubmissionUrl && (
                            <>
                              {(event as any).paymentInstructionText && (
                                <p className="text-sm text-gray-700 mb-3">
                                  {(event as any).paymentInstructionText}
                                </p>
                              )}
                              {!(event as any).paymentInstructionText && (
                                <p className="text-sm text-gray-700 mb-3">
                                  <strong>📋 คำแนะนำ:</strong> กรุณาชำระเงินและส่งหลักฐานการชำระเงินผ่านปุ่มด้านล่าง
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

                                const useExternal = (event as any).useExternalPaymentLink === true;

                                if (useExternal) {
                                  window.open(event.paymentSlipSubmissionUrl, '_blank');
                                } else {
                                  let paymentType: 'deposit' | 'remaining' | 'full' = 'full';

                                  if (event.paymentMode === 'deposit') {
                                    if (userRegistration.depositPaid && userRegistration.remainingAmount && userRegistration.remainingAmount > 0) {
                                      paymentType = 'remaining';
                                    } else {
                                      paymentType = 'deposit';
                                    }
                                  } else {
                                    paymentType = 'full';
                                  }

                                  const url = new URL(event.paymentSlipSubmissionUrl);
                                  url.searchParams.append('registrationId', userRegistration.registrationId);
                                  url.searchParams.append('eventId', event.eventId);
                                  url.searchParams.append('lineUserId', session?.user?.id || '');
                                  url.searchParams.append('paymentType', paymentType);

                                  // Open in popup window
                                  const popupWidth = Math.min(600, window.innerWidth - 40);
                                  const popupHeight = Math.min(800, window.innerHeight - 40);
                                  const left = (window.innerWidth - popupWidth) / 2;
                                  const top = (window.innerHeight - popupHeight) / 2;

                                  const popup = window.open(
                                    url.toString(),
                                    'slipUpload',
                                    `width=${popupWidth},height=${popupHeight},left=${left},top=${top},scrollbars=yes,resizable=yes`
                                  );

                                  if (!popup) {
                                    toast.error('กรุณาอนุญาตให้เปิด popup window');
                                  } else {
                                    // Refresh data when popup closes
                                    const checkClosed = setInterval(() => {
                                      if (popup.closed) {
                                        clearInterval(checkClosed);
                                        setTimeout(() => {
                                          fetchEventDetail();
                                        }, 1000);
                                      }
                                    }, 500);
                                  }
                                }
                              }}
                              className="block w-full text-center bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
                            >
                              <span className="flex items-center justify-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                {(() => {
                                  // Custom button text if defined
                                  if ((event as any).paymentSlipButtonText) {
                                    return (event as any).paymentSlipButtonText;
                                  }

                                  // Deposit mode - check if deposit is paid
                                  if (event.paymentMode === 'deposit' && userRegistration.depositPaid) {
                                    return 'ส่งสลิปชำระยอดที่เหลือ';
                                  }

                                  // Default text
                                  return 'ส่งหลักฐานการชำระเงิน';
                                })()}
                              </span>
                            </button>
                          ) : (
                            <div className="text-sm text-gray-600 bg-white rounded p-3 border border-gray-200">
                              <p>โปรดชำระเงินและส่งหลักฐานการชำระตามช่องทางที่ระบุไว้ในข้อมูลการชำระเงินด้านบน</p>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* 4a. Full Payment Mode - Show deadline */}
                      {event?.paymentMode !== 'deposit' && userRegistration.remainingDeadline && !userRegistration.remainingSlipUrl && (
                        <div className="bg-white rounded-lg p-4 mb-3 border-2 border-orange-300">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-gray-700">กำหนดชำระเงิน</span>
                            <span className="text-sm text-orange-600 font-bold">
                              {formatDeadline(userRegistration.remainingDeadline)}
                            </span>
                          </div>
                          <div className="text-sm text-orange-600 font-medium">
                            {getTimeRemaining(userRegistration.remainingDeadline)}
                          </div>
                        </div>
                      )}

                      {/* 4b. Deposit Mode - Show breakdown */}
                      {event?.paymentMode === 'deposit' && (
                        <>
                          {/* Deposit Payment */}
                          {userRegistration.depositAmount && userRegistration.depositAmount > 0 && (
                            <div className="bg-white rounded-lg p-4 mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">งวดที่ 1: มัดจำ</span>
                                <span className="text-lg font-bold">{userRegistration.depositAmount.toLocaleString()} บาท</span>
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
                          )}

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
                    </div>
                  )}

                  {/* Payment Information - Show after registration for payment reference */}
                  {userRegistration.totalAmount && userRegistration.totalAmount > 0 && (event.paymentBankName || event.paymentAccountName || event.paymentAccountNumber || event.paymentQrCodeUrl || event.paymentTerms) && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
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
              ) : showRegistrationForm ? (
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

                  {/* Contact Information Card - Moved before Attendee Count/Type */}
                  {memberName && memberPhone && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-blue-900">
                          ข้อมูลบริษัทและข้อมูลติดต่อของคุณ
                        </h4>
                        <Link
                          href="/profile"
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                        >
                          แก้ไขข้อมูลติดต่อ
                        </Link>
                      </div>
                      <div className="space-y-2 text-sm">
                        {companyName && (
                          <div className="flex items-start gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">ชื่อบริษัท:</span>
                            <span className="text-gray-900">{companyName}</span>
                          </div>
                        )}
                        {licenseNumber && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">เลขที่ใบอนุญาต:</span>
                            <span className="text-gray-900">{licenseNumber}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-32 flex-shrink-0">ชื่อผู้ติดต่อ:</span>
                          <span className="text-gray-900">{memberName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-32 flex-shrink-0">เบอร์โทร:</span>
                          <span className="text-gray-900">{memberPhone}</span>
                        </div>
                        {lineDisplayName && (
                          <div className="flex items-start gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">LINE Display Name:</span>
                            <div className="flex items-center gap-2">
                              {lineProfilePicture && (
                                <img
                                  src={lineProfilePicture}
                                  alt="LINE Profile"
                                  className="w-6 h-6 rounded-full"
                                />
                              )}
                              <span className="text-gray-900">{lineDisplayName}</span>
                            </div>
                          </div>
                        )}
                      </div>
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
                        required
                      >
                        <option value="0" disabled>โปรดระบุจำนวนผู้เข้าร่วม</option>
                        {Array.from(
                          { length: event.maxPerCompany > 0 ? event.maxPerCompany : 10 },
                          (_, i) => i + 1
                        ).map(num => (
                          <option key={num} value={num}>{num} คน</option>
                        ))}
                      </select>
                      {event.maxPerCompany > 0 ? (
                        <p className="text-xs text-gray-500 mt-1">
                          * จำกัด {event.maxPerCompany} คนต่อ 1 บริษัท
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          * ไม่จำกัดจำนวนต่อบริษัท
                        </p>
                      )}
                    </div>
                  )}

                  {/* Remove duplicate Contact Information Card that was here */}
                  {false && memberName && memberPhone && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-blue-900">
                          ข้อมูลบริษัทและข้อมูลติดต่อของคุณ
                        </h4>
                        <Link
                          href="/profile"
                          className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
                        >
                          แก้ไขข้อมูลติดต่อ
                        </Link>
                      </div>
                      <div className="space-y-2 text-sm">
                        {companyName && (
                          <div className="flex items-start gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">ชื่อบริษัท:</span>
                            <span className="text-gray-900">{companyName}</span>
                          </div>
                        )}
                        {licenseNumber && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">เลขที่ใบอนุญาต:</span>
                            <span className="text-gray-900">{licenseNumber}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-32 flex-shrink-0">ชื่อผู้ติดต่อ:</span>
                          <span className="text-gray-900">{memberName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 font-medium w-32 flex-shrink-0">เบอร์โทร:</span>
                          <span className="text-gray-900">{memberPhone}</span>
                        </div>
                        {lineDisplayName && (
                          <div className="flex items-start gap-2">
                            <span className="text-gray-600 font-medium w-32 flex-shrink-0">LINE Display Name:</span>
                            <div className="flex items-center gap-2">
                              {lineProfilePicture && (
                                <img
                                  src={lineProfilePicture}
                                  alt="LINE Profile"
                                  className="w-6 h-6 rounded-full"
                                />
                              )}
                              <span className="text-gray-900">{lineDisplayName}</span>
                            </div>
                          </div>
                        )}
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
                              placeholder={`ชื่อผู้เข้าร่วมคนที่ ${index + 1}`}
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
                                ) : event.baseFee !== undefined && event.baseFee > 0 ? (
                                  // Legacy tiered pricing - Only show if baseFee > 0
                                  <>
                                    {attendeeCount === 1
                                      ? `${event.baseFee.toLocaleString()} บาท/คน`
                                      : `${event.baseFee.toLocaleString()} บาท (คนแรก)${event.additionalFeePerPerson && event.additionalFeePerPerson > 0 ? ` + ${event.additionalFeePerPerson.toLocaleString()} บาท × ${attendeeCount - 1} คน` : ''}`}
                                    {(event.memberDiscount ?? 0) > 0 && (
                                      <span> - ส่วนลด {event.memberDiscount!.toLocaleString()} บาท</span>
                                    )}
                                  </>
                                ) : null}
                              </>
                            ) : event.registrationFee && event.registrationFee > 0 ? (
                              `${attendeeCount} คน × ${event.registrationFee.toLocaleString()} บาท/คน`
                            ) : null}
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

                  {/* Payment Information - Moved inside registration form */}
                  {(event.paymentBankName || event.paymentAccountName || event.paymentAccountNumber || event.paymentQrCodeUrl || event.paymentTerms) && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
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
              ) : null}
            </div>
          </div>
        </div>
      </main>

      {/* Lightbox Modal for Payment Slip Images */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex flex-col">
            {/* Close Button */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 z-10 bg-white hover:bg-gray-100 text-black rounded-full p-2 transition-all shadow-lg"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Title */}
            {lightboxTitle && (
              <div className="text-center mb-4">
                <h3 className="text-xl font-semibold text-white">{lightboxTitle}</h3>
              </div>
            )}

            {/* Image Container */}
            <div
              className="flex-1 flex items-center justify-center overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightboxImage}
                alt={lightboxTitle || 'Payment slip'}
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>

            {/* Hint Text */}
            <div className="text-center mt-4">
              <p className="text-sm text-white text-opacity-70">คลิกที่พื้นหลังเพื่อปิด</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
