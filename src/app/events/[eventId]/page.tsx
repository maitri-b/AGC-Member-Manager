'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Toast, useToast } from '@/components/Toast';
import PaymentSlipUploadModal from '@/components/PaymentSlipUploadModal';
import CancellationModal from '@/components/member/CancellationModal';
import { useEffectiveSessionContext } from '@/lib/EffectiveSessionProvider';
// TEMP: Hidden until PDF generation is fixed on Vercel
// import ReceiptCertificateModal from '@/components/ReceiptCertificateModal';
import { calculateRegistrationFee, getPricingSummary, AttendeeType, AttendeeTypeSelection, RoomType, RoomAllocation, PriceTier, CancellationPolicy } from '@/types/event';
import { CarpoolSettings } from '@/types/carpool';
import { PartyTableSettings } from '@/types/partyTable';
import PartyTableSection from '@/components/event/PartyTableSection';
import { formatDeadline, getTimeRemaining, isDeadlinePassed } from '@/lib/payment-deadlines';
import { getStatusBadgeClass, isFullyPaid, parseAdditionalPayments } from '@/lib/payment-status';
import { isGuestEligibleForEventRegistration } from '@/lib/permissions';
import { formatEventDateRange } from '@/lib/date-utils';

interface Event {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  eventEndDate?: string;
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
  // Payment configuration (New)
  paymentTiming?: 'deferred' | 'immediate';
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
  // Carpool feature (New)
  hasCarpoolFeature?: boolean;
  carpoolSettings?: CarpoolSettings;
  // Party Table feature (New)
  hasPartyTableFeature?: boolean;
  partyTableSettings?: PartyTableSettings;
  // Cancellation policy (New)
  cancellationPolicy?: CancellationPolicy;
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
  paymentType: 'deposit' | 'remaining' | 'full' | 'additional' | 'refund';
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
  lineUserId: string;
  status: string;
  attendeeCount: number;
  registrationDate: string;
  attendeeNames: string;
  companyName?: string;
  contactName?: string;
  // Deposit payment data (New)
  totalAmount?: number;
  depositAmount?: number;
  remainingAmount?: number;
  depositPaid?: boolean;
  depositPaidDate?: string;
  remainingPaidDate?: string; // วันที่จ่ายยอดคงเหลือ
  depositSlipUrl?: string;
  remainingSlipUrl?: string;
  // Payment deadlines
  depositDeadline?: string;
  remainingDeadline?: string;
  fullPaymentDeadline?: string; // ✅ Full payment deadline (for paymentMode = 'full')
  paymentStatus?: string;
  // Payment tracking (for additional payments after amount adjustments)
  paidAmount?: number;
  additionalPayments?: string; // JSON stringified AdditionalPayment[]
  // ✅ NEW: Actual payment amounts paid (for tracking partial payments)
  fullPaymentAmountPaid?: number;
  depositAmountPaid?: number;
  remainingAmountPaid?: number;
  additionalPaymentAmountPaid?: number; // ✅ CRITICAL: Track additional payments
  // Fee breakdown (for display calculations)
  eventFee?: number;
  roomFee?: number;
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
  // Discounts (New)
  discounts?: Array<{
    discountId: string;
    description: string;
    discountType: 'fixed' | 'percentage' | 'free';
    value: number;
    calculatedAmount: number;
    addedBy: string;
    addedAt: string;
  }>;
}

export default function EventDetailPage() {
  const { data: session, status } = useEffectiveSessionContext();
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const eventId = decodeURIComponent(params.eventId as string);

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

  // Carpool state (New)
  const [memberCarpools, setMemberCarpools] = useState<any[]>([]);
  const [carpoolLoading, setCarpoolLoading] = useState(false);
  const [showCreateCarpoolModal, setShowCreateCarpoolModal] = useState(false);
  const [newCarpoolLicensePlate, setNewCarpoolLicensePlate] = useState('');
  const [selectedMembersForCarpool, setSelectedMembersForCarpool] = useState<number[]>([]);
  const [creatingCarpool, setCreatingCarpool] = useState(false);

  // Derived state: separate owned and joined carpools
  const ownedCarpools = memberCarpools.filter(cp => cp.ownerRegistrationId === userRegistration?.registrationId);
  const joinedCarpools = memberCarpools.filter(cp => cp.ownerRegistrationId !== userRegistration?.registrationId);

  // For backward compatibility - use first owned carpool as "memberCarpool"
  const memberCarpool = ownedCarpools[0] || null;

  // Fee breakdown toggle state (New)
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(false);
  // Invite members state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitingToCarpoolId, setInvitingToCarpoolId] = useState<string | null>(null);
  const [searchRegistrationId, setSearchRegistrationId] = useState('');
  const [searchedRegistration, setSearchedRegistration] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMembersToInvite, setSelectedMembersToInvite] = useState<{ name: string; originalIndex: number }[]>([]);
  const [inviting, setInviting] = useState(false);
  // Manage Carpool modal state
  const [showManageCarpoolModal, setShowManageCarpoolModal] = useState(false);
  const [allCarpools, setAllCarpools] = useState<any[]>([]);
  // Join Carpool modal state
  const [showJoinCarpoolModal, setShowJoinCarpoolModal] = useState(false);
  const [joinRegistrationId, setJoinRegistrationId] = useState('');
  const [joinSearchedCarpool, setJoinSearchedCarpool] = useState<any>(null);
  const [joinSearchLoading, setJoinSearchLoading] = useState(false);
  const [selectedMembersToJoin, setSelectedMembersToJoin] = useState<number[]>([]);
  const [joining, setJoining] = useState(false);
  // Join own carpool modal state
  const [showJoinOwnCarpoolModal, setShowJoinOwnCarpoolModal] = useState(false);
  const [selectedCarpoolToJoin, setSelectedCarpoolToJoin] = useState<string | null>(null);
  const [selectedMembersForOwnCarpool, setSelectedMembersForOwnCarpool] = useState<number[]>([]);
  // Edit license plate state
  const [editingLicensePlate, setEditingLicensePlate] = useState(false);
  const [newLicensePlate, setNewLicensePlate] = useState('');
  const [savingLicensePlate, setSavingLicensePlate] = useState(false);
  // Carpool info tooltip state
  const [showCarpoolTooltip, setShowCarpoolTooltip] = useState(false);
  // Delete last member confirmation modal
  const [showDeleteCarpoolConfirmModal, setShowDeleteCarpoolConfirmModal] = useState(false);
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<{lineUserId: string; name: string; carpoolId: string} | null>(null);

  // Guest registration form state (for Event-Co without memberId)
  const [guestCompanyName, setGuestCompanyName] = useState('');
  const [guestLicenseNumber, setGuestLicenseNumber] = useState('');
  const [guestContactName, setGuestContactName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');

  // Lightbox state for payment slip images
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState('');
  const [lightboxTitle, setLightboxTitle] = useState('');

  // Immediate payment slip state (New)
  const [paymentSlipFile, setPaymentSlipFile] = useState<File | null>(null);
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null);

  // LINE Official Account URL from settings
  const [lineOaUrl, setLineOaUrl] = useState('');

  // Payment slip upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadPaymentType, setUploadPaymentType] = useState<'deposit' | 'remaining' | 'full' | 'additional'>('full');
  const [uploadAmount, setUploadAmount] = useState(0);
  const [showUploadSuccessModal, setShowUploadSuccessModal] = useState(false);

  // Registration form visibility state
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);

  // TEMP: Hidden until PDF generation is fixed on Vercel
  // Receipt certificate modal state
  // const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Cancellation modal state
  const [showCancellationModal, setShowCancellationModal] = useState(false);

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

  useEffect(() => {
    console.log('[Carpool Debug] hasCarpoolFeature:', event?.hasCarpoolFeature, 'userRegistration:', userRegistration);
    if (event?.hasCarpoolFeature && userRegistration) {
      console.log('[Carpool Debug] Fetching member carpool...');
      fetchMemberCarpool();
    }
  }, [event?.hasCarpoolFeature, userRegistration]);

  // Fetch LINE OA URL from settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          if (data.lineOfficialAccount) {
            setLineOaUrl(data.lineOfficialAccount);
          }
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      }
    };
    fetchSettings();
  }, []);

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
      'refund': '💸 โอนเงินคืน',
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

  const fetchMemberCarpool = async () => {
    if (!event?.hasCarpoolFeature || !userRegistration) {
      return;
    }

    setCarpoolLoading(true);
    try {
      const response = await fetch(`/api/events/${eventId}/my-carpool`);
      if (response.ok) {
        const data = await response.json();
        setMemberCarpools(data.carpools || []);
      }
    } catch (err) {
      console.error('Error fetching member carpools:', err);
    } finally {
      setCarpoolLoading(false);
    }
  };

  const handleCreateCarpool = async () => {
    if (!newCarpoolLicensePlate.trim()) {
      toast.error('กรุณาระบุเลขทะเบียนรถ');
      return;
    }

    if (selectedMembersForCarpool.length === 0) {
      toast.error('กรุณาเลือกสมาชิกในรถอย่างน้อย 1 คน');
      return;
    }

    if (!userRegistration?.registrationId) {
      toast.error('ไม่พบข้อมูลการลงทะเบียน');
      return;
    }

    setCreatingCarpool(true);
    try {
      // Build members array from selected attendees
      const members = selectedMembersForCarpool.map(index => ({
        registrationId: userRegistration.registrationId,
        lineUserId: session?.user?.lineUserId || '',
        name: attendeeNames[index] || '',
        attendeeIndex: index,  // Store index as stable identifier
      }));

      const response = await fetch('/api/carpools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          ownerRegistrationId: userRegistration.registrationId,
          licensePlate: newCarpoolLicensePlate,
          members,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create carpool');
      }

      toast.success('ลงทะเบียนรถยนต์สำเร็จ!');
      setShowCreateCarpoolModal(false);
      setNewCarpoolLicensePlate('');
      setSelectedMembersForCarpool([]);

      // Refresh carpool data
      await fetchMemberCarpool();
      await fetchAllCarpools();
    } catch (err) {
      console.error('Error creating carpool:', err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลงทะเบียนรถยนต์');
    } finally {
      setCreatingCarpool(false);
    }
  };

  const handleDeleteCarpool = async (carpoolId: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบ Carpool นี้? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
      return;
    }

    try {
      const response = await fetch(`/api/carpools/${carpoolId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete carpool');
      }

      toast.success('ลบ Carpool สำเร็จ!');

      // Refresh carpool data
      await fetchMemberCarpool();
      await fetchAllCarpools();
    } catch (err) {
      console.error('Error deleting carpool:', err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบ Carpool');
    }
  };

  const handleSearchRegistration = async () => {
    if (!searchRegistrationId.trim()) {
      toast.error('กรุณาระบุรหัสลงทะเบียน');
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/registrations/${searchRegistrationId}`);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('ไม่พบรหัสลงทะเบียนนี้');
        }
        throw new Error('ไม่สามารถค้นหาข้อมูลได้');
      }

      const data = await response.json();
      setSearchedRegistration(data.registration);
      setSelectedMembersToInvite([]);
    } catch (err) {
      console.error('Error searching registration:', err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการค้นหา');
      setSearchedRegistration(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleInviteMembers = async () => {
    if (!invitingToCarpoolId) {
      toast.error('ไม่พบข้อมูล Carpool');
      return;
    }

    if (selectedMembersToInvite.length === 0) {
      toast.error('กรุณาเลือกสมาชิกที่ต้องการชวน');
      return;
    }

    // Determine which registration to use:
    // - If searchedRegistration exists, use it (Section 2: external members)
    // - Otherwise, use userRegistration (Section 1: team members)
    const sourceRegistration = searchedRegistration || userRegistration;

    if (!sourceRegistration) {
      toast.error('ไม่พบข้อมูลการจอง');
      return;
    }

    setInviting(true);
    try {
      // Build members array from selected members
      // For Section 1 (team members): use originalIndex from selection
      // For Section 2 (external members): find index in attendeeNames
      const attendeeNamesArray = sourceRegistration.attendeeNames
        ? sourceRegistration.attendeeNames.split(',').map((n: string) => n.trim())
        : [];

      const membersToAdd = selectedMembersToInvite.map(member => {
        // Use originalIndex if available (Section 1), otherwise find in array (Section 2)
        const index = member.originalIndex !== undefined
          ? member.originalIndex
          : attendeeNamesArray.indexOf(member.name);

        return {
          registrationId: sourceRegistration.registrationId,
          lineUserId: sourceRegistration.lineUserId || sourceRegistration.registrationId || '',
          name: member.name,
          attendeeIndex: index,  // Store index as stable identifier
          companyName: sourceRegistration.companyName,
        };
      });

      const response = await fetch(`/api/carpools/${invitingToCarpoolId}/add-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: membersToAdd }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to invite members');
      }

      toast.success(`ชวนสมาชิก ${selectedMembersToInvite.length} คนสำเร็จ!`);
      setShowInviteModal(false);
      setInvitingToCarpoolId(null);
      setSearchRegistrationId('');
      setSearchedRegistration(null);
      setSelectedMembersToInvite([]);

      // Refresh carpool data
      await fetchMemberCarpool();
      await fetchAllCarpools();
    } catch (err) {
      console.error('Error inviting members:', err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการชวนสมาชิก');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveTeamMember = async (lineUserId: string, name: string, carpoolId?: string) => {
    // Find which carpool this member belongs to
    const targetCarpoolId = carpoolId || memberCarpool?.carpoolId;

    if (!targetCarpoolId) {
      toast.error('ไม่พบข้อมูล Carpool');
      return;
    }

    // Find the carpool to check member count
    const targetCarpool = memberCarpools.find(cp => cp.carpoolId === targetCarpoolId);

    if (!targetCarpool) {
      toast.error('ไม่พบข้อมูล Carpool');
      return;
    }

    // Calculate how many members will remain after removing this specific member
    // Use lineUserId + name combination to identify the specific member (same as removal logic)
    const remainingMembers = targetCarpool.members.filter(
      (m: any) => !(m.lineUserId === lineUserId && m.name === name)
    );

    // Check if this is the last member
    if (remainingMembers.length === 0) {
      // Show confirmation modal for deleting entire carpool
      setPendingMemberRemoval({ lineUserId, name, carpoolId: targetCarpoolId });
      setShowDeleteCarpoolConfirmModal(true);
      return;
    }

    // Normal confirmation for removing member
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ "${name}" ออกจากทะเบียนรถคันนี้?`)) {
      return;
    }

    await executeRemoveMember(targetCarpoolId, lineUserId, name);
  };

  const executeRemoveMember = async (carpoolId: string, lineUserId: string, name: string) => {
    try {
      const response = await fetch(`/api/carpools/${carpoolId}/remove-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: [{ lineUserId, name }],
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove member');
      }

      toast.success(`ลบ ${name} ออกจากทะเบียนรถสำเร็จ`);

      // Refresh carpool data
      await fetchMemberCarpool();
      await fetchAllCarpools();
    } catch (err) {
      console.error('Error removing team member:', err);
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบสมาชิก');
    }
  };

  const handleConfirmDeleteCarpool = async () => {
    if (!pendingMemberRemoval) return;

    await executeRemoveMember(
      pendingMemberRemoval.carpoolId,
      pendingMemberRemoval.lineUserId,
      pendingMemberRemoval.name
    );

    // Close modal and clear pending state
    setShowDeleteCarpoolConfirmModal(false);
    setPendingMemberRemoval(null);
  };

  // Fetch all carpools for the event (to check member status)
  const fetchAllCarpools = async () => {
    if (!eventId) return;

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId as string)}/carpools`);
      if (response.ok) {
        const data = await response.json();
        // Filter out deleted/cancelled carpools
        const activeCarpools = (data.carpools || []).filter(
          (cp: any) => cp.status !== 'deleted' && cp.status !== 'cancelled'
        );
        setAllCarpools(activeCarpools);
      }
    } catch (err) {
      console.error('Error fetching all carpools:', err);
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

    // Validate slip upload for immediate payment timing
    const isImmediatePayment = event.paymentTiming === 'immediate';
    const totalFee = calculatedTotalFee + calculatedRoomFee;

    if (isImmediatePayment && totalFee > 0 && !paymentSlipFile) {
      toast.error('กรุณาแนบหลักฐานการชำระเงิน');
      return;
    }

    setRegistering(true);
    try {
      let response;

      if (isImmediatePayment && paymentSlipFile) {
        // Use FormData for file upload
        const formData = new FormData();
        formData.append('slipFile', paymentSlipFile);
        formData.append('attendeeCount', attendeeCount.toString());
        formData.append('attendeeNames', JSON.stringify(attendeeNames));
        formData.append('specialRequests', specialRequests);
        formData.append('attendeeTypeSelections', JSON.stringify(attendeeTypeSelections));
        formData.append('roomAllocations', JSON.stringify(roomAllocations));

        if (isStaffWithoutMember) {
          formData.append('guestInfo', JSON.stringify({
            companyName: guestCompanyName,
            licenseNumber: guestLicenseNumber,
            contactName: guestContactName,
            phone: guestPhone,
          }));
        }

        response = await fetch(`/api/events/${eventId}/register`, {
          method: 'POST',
          body: formData,
        });
      } else {
        // Use JSON for backward compatibility (deferred payment)
        response = await fetch(`/api/events/${eventId}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attendeeCount,
            attendeeNames: attendeeNames,
            specialRequests,
            attendeeTypeSelections,
            roomAllocations,
            guestInfo: isStaffWithoutMember ? {
              companyName: guestCompanyName,
              licenseNumber: guestLicenseNumber,
              contactName: guestContactName,
              phone: guestPhone,
            } : undefined,
          }),
        });
      }

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

  const isCommitteeOrAdmin = !!(session?.user?.permissions?.includes('admin:access') ||
                              session?.user?.permissions?.includes('members:list') ||
                              session?.user?.permissions?.includes('members:view'));

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

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Back Link */}
        <Link href="/events" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          กลับไปหน้ากิจกรรม
        </Link>

        {/* Event Header */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-8">
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
                    <p className="font-medium">{formatEventDateRange(event.eventDate, event.eventEndDate)}</p>
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

        {/* Two Column Layout - Desktop only, Stack on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Event Information (58%) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Description */}
            {event.description && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">รายละเอียด</h2>
                <div className="prose prose-sm max-w-none text-gray-600 whitespace-pre-wrap">
                  {event.description}
                </div>
              </div>
            )}

            {/* Cancellation Policy */}
            {(() => {
              // Hide cancellation policy section on event day or after
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const eventStartDate = new Date(event.eventDate);
              eventStartDate.setHours(0, 0, 0, 0);

              // Don't show if event has started (today or past)
              if (today >= eventStartDate) {
                return null;
              }

              return event.cancellationPolicy?.enabled && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">เงื่อนไขการยกเลิกและคืนเงิน</h2>

                  {/* No Refund Policy */}
                  {event.cancellationPolicy.noRefundPolicy?.active && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <p className="font-semibold text-red-900 text-sm">ไม่คืนเงินในทุกกรณี</p>
                          {event.cancellationPolicy.noRefundPolicy.description && (
                            <p className="text-sm text-red-700 mt-1">{event.cancellationPolicy.noRefundPolicy.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Date-based Policies */}
                  {event.cancellationPolicy.dateBasedPolicies &&
                   event.cancellationPolicy.dateBasedPolicies.filter(p => p.active).length > 0 && (
                    <div className="space-y-1">
                      {event.cancellationPolicy.dateBasedPolicies
                        .filter(p => p.active)
                        .sort((a, b) => new Date(a.cancelBeforeDate).getTime() - new Date(b.cancelBeforeDate).getTime())
                        .map((rule) => {
                          const refundText =
                            rule.refundType === 'percentage'
                              ? rule.refundValue === 0
                                ? 'ไม่คืนเงิน'
                                : `คืน ${rule.refundValue}%`
                              : rule.refundType === 'fixed'
                                ? rule.refundValue === 0
                                  ? 'ไม่คืนเงิน'
                                  : `คืน ${rule.refundValue.toLocaleString()} บาท`
                                : 'ไม่คืนเงิน';

                          const finalRuleText = rule.isFinalRule
                            ? rule.finalRuleRefundType === 'none' || (rule.finalRuleRefundValue === 0)
                              ? 'ไม่คืนเงิน'
                              : rule.finalRuleRefundType === 'percentage'
                                ? `คืน ${rule.finalRuleRefundValue}%`
                                : `คืน ${(rule.finalRuleRefundValue || 0).toLocaleString()} บาท`
                            : '';

                          return (
                            <div key={rule.ruleId}>
                              {/* Regular rule */}
                              <div className="flex justify-between text-sm text-gray-700">
                                <span className="font-medium">
                                  ยกเลิกก่อน {new Date(rule.cancelBeforeDate).toLocaleDateString('th-TH', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  })}:
                                </span>
                                <span className={refundText === 'ไม่คืนเงิน' ? 'text-red-600 font-medium' : ''}>
                                  {refundText}
                                </span>
                              </div>

                              {/* Final Rule */}
                              {rule.isFinalRule && (
                                <div className="flex justify-between text-sm text-gray-700 mt-1">
                                  <span className="font-medium">
                                    ยกเลิกตั้งแต่ {new Date(rule.cancelBeforeDate).toLocaleDateString('th-TH', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    })} เป็นต้นไป:
                                  </span>
                                  <span className={finalRuleText === 'ไม่คืนเงิน' ? 'text-red-600 font-medium' : ''}>
                                    {finalRuleText}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Document Download */}
            {event.documentUrl && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
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
          </div>

          {/* Right Column - Registration Status & Payment Info (42%) */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-24 space-y-6">
              {/* Quick Navigation Menu - Only show when user is registered */}
              {userRegistration && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    เมนูด่วน
                  </h3>
                  <div className="space-y-2">
                    {/* Attendee Names - Always show when registered */}
                    <a
                      href="#attendee-names"
                      className="flex items-center gap-3 p-3 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-all group"
                    >
                      <svg className="w-5 h-5 text-blue-600 group-hover:text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">แก้ไขรายชื่อและความต้องการพิเศษ</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </a>

                    {/* Carpool - Only show if carpool is active */}
                    {event.carpoolSettings?.carpoolActive && (
                      <a
                        href="#carpool-section"
                        className="flex items-center gap-3 p-3 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-all group"
                      >
                        <svg className="w-5 h-5 text-blue-600 group-hover:text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">การลงทะเบียนรถยนต์ และลงชื่อไปด้วยกัน</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </a>
                    )}

                    {/* Payment - Always show when registered */}
                    <a
                      href="#payment-section"
                      className="flex items-center gap-3 p-3 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-all group"
                    >
                      <svg className="w-5 h-5 text-blue-600 group-hover:text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">รายละเอียดและประวัติการชำระเงิน</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  </div>
                </div>
              )}

              {/* Registration Button - Show when not registered */}
              {!userRegistration && !isFull && event.registrationOpen && (
                <div className="bg-white rounded-lg shadow p-6">
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
              {userRegistration ? (
                <div className="bg-white rounded-lg shadow p-6 space-y-4">
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
                        <button
                          onClick={() => setShowFeeBreakdown(!showFeeBreakdown)}
                          className="w-full flex items-center justify-between text-sm font-semibold text-green-800 mb-2 hover:text-green-900 transition-colors"
                        >
                          <span>รายละเอียดค่าใช้จ่าย</span>
                          <svg
                            className={`w-5 h-5 transform transition-transform ${showFeeBreakdown ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {showFeeBreakdown && (
                        <div className="text-sm text-green-700 space-y-1">
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

                            // ✅ FIXED: Use the actual eventFee field (BEFORE discounts) instead of deriving from totalAmount
                            // totalAmount already has discounts subtracted, so using it would double-count discounts
                            const eventFee = userRegistration.eventFee || 0;

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
                              <p className="text-sm font-semibold text-purple-700 mb-1">ค่าใช้จ่ายเสริม:</p>
                              {userRegistration.specialCharges.map((charge) => (
                                <div key={charge.chargeId} className="flex justify-between text-purple-700">
                                  <span>{charge.description}</span>
                                  <span>+{charge.amount.toLocaleString()} บาท</span>
                                </div>
                              ))}
                              <div className="flex justify-between font-medium pt-1 border-t border-purple-300 text-purple-800">
                                <span>รวมค่าใช้จ่ายเสริม:</span>
                                <span>+{userRegistration.specialCharges.reduce((sum, c) => sum + c.amount, 0).toLocaleString()} บาท</span>
                              </div>
                            </div>
                          )}

                          {/* Discounts breakdown */}
                          {userRegistration.discounts && userRegistration.discounts.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-green-300">
                              <p className="text-sm font-semibold text-orange-700 mb-1">ส่วนลด:</p>
                              {userRegistration.discounts.map((discount) => (
                                <div key={discount.discountId} className="flex justify-between text-orange-700">
                                  <span>
                                    {discount.description}
                                    {discount.discountType === 'percentage' && ` (${discount.value}%)`}
                                    {discount.discountType === 'free' && ' (ฟรี)'}
                                  </span>
                                  <span>-{discount.calculatedAmount.toLocaleString()} บาท</span>
                                </div>
                              ))}
                              <div className="flex justify-between font-medium pt-1 border-t border-orange-300 text-orange-800">
                                <span>รวมส่วนลด:</span>
                                <span>-{userRegistration.discounts.reduce((sum, d) => sum + d.calculatedAmount, 0).toLocaleString()} บาท</span>
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
                        )}
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
                  <div id="attendee-names" className="bg-white border border-gray-300 rounded-lg p-4 scroll-mt-24">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-900">
                        รายชื่อผู้เข้าร่วมกิจกรรม
                      </h4>
                      {!isEditingNames && (
                        <button
                          onClick={() => {
                            setIsEditingNames(true);
                            setTempAttendeeNames([...attendeeNames]);
                            setTempSpecialRequests(specialRequests || '');
                          }}
                          className="flex items-center gap-1.5 p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title={(event.allowMemberEdit ?? true) ? "แก้ไขรายชื่อและความต้องการพิเศษ" : "แก้ไขความต้องการพิเศษ"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span className="hidden sm:inline text-sm font-medium">แก้ไข</span>
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

                    {/* Special Requests - Editable (Moved here) */}
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ความต้องการพิเศษ (ถ้ามี)
                      </label>
                      {isEditingNames ? (
                        <textarea
                          value={tempSpecialRequests}
                          onChange={(e) => setTempSpecialRequests(e.target.value)}
                          placeholder="เช่น ต้องการอาหารเจ, แพ้อาหารทะเล, ต้องการห้องชั้นล่าง, ผู้สูงอายุ/ผู้พิการ"
                          rows={3}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
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

                    {/* Room Allocation Display */}
                    {event.roomTypes && event.roomTypes.length > 0 && roomAllocations && roomAllocations.length > 0 && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ประเภทการเข้าพัก
                        </label>
                        <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
                          <div className="space-y-2">
                            {roomAllocations.map((alloc) => {
                              const roomType = event.roomTypes?.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
                              if (!roomType) return null;
                              return (
                                <div key={alloc.roomTypeId} className="flex justify-between items-start text-sm">
                                  <div className="flex-1">
                                    <span className="font-medium text-gray-900">{roomType.typeName}</span>
                                    {roomType.note && (
                                      <p className="text-xs text-gray-500 mt-0.5">{roomType.note}</p>
                                    )}
                                  </div>
                                  <span className="text-gray-700 ml-4">
                                    {alloc.roomCount} {alloc.roomCount === 1 ? 'ห้อง' : 'ห้อง'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons - Show only when editing */}
                    {isEditingNames && (
                      <div className="flex gap-3 pt-4 mt-4 border-t border-gray-200">
                        <button
                          onClick={async () => {
                            if (!event) return;

                            // Validate attendee names (conditional based on requireAttendeeNames)
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
                                  specialRequests: tempSpecialRequests,
                                }),
                              });

                              const data = await response.json();

                              if (!response.ok) {
                                throw new Error(data.error || 'ไม่สามารถอัพเดทข้อมูลได้');
                              }

                              toast.success(data.message || 'อัพเดทข้อมูลเรียบร้อยแล้ว');
                              setIsEditingNames(false);
                              setAttendeeNames([...tempAttendeeNames]);
                              setSpecialRequests(tempSpecialRequests);
                              fetchEventDetail(); // Refresh data (useEffect will auto-refresh carpool)
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
                            setIsEditingNames(false);
                            setTempAttendeeNames([...attendeeNames]);
                            setTempSpecialRequests(specialRequests || '');
                          }}
                          disabled={updating}
                          className="px-6 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ==================== CARPOOL CARD START ==================== */}
                  <div id="carpool-section" className="bg-white border border-gray-300 rounded-lg p-4 mb-6 scroll-mt-24">
                    {event.hasCarpoolFeature && (event.carpoolSettings?.carpoolActive !== false || isCommitteeOrAdmin) && (
                      <div>
                        <div className="mb-4">
                          {/* Header */}
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-base font-semibold text-gray-900">
                                🚗 การลงทะเบียนรถยนต์ และลงชื่อไปด้วยกัน (Carpool)
                              </h3>
                              <div className="relative">
                                <button
                                  type="button"
                                  onMouseEnter={() => setShowCarpoolTooltip(true)}
                                  onMouseLeave={() => setShowCarpoolTooltip(false)}
                                  onClick={() => setShowCarpoolTooltip(!showCarpoolTooltip)}
                                  className="text-blue-500 hover:text-blue-700 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                  </svg>
                                </button>
                                {showCarpoolTooltip && (
                                  <div className="absolute left-0 top-6 z-50 w-80 p-4 bg-white border-2 border-blue-300 rounded-lg shadow-xl">
                                    <div className="space-y-3 text-xs text-gray-700">
                                      <div>
                                        <p className="font-semibold text-blue-700 mb-1">🚗 การลงชื่อไปด้วยกัน (Carpool)</p>
                                        <p>ระบบลงทะเบียนรถและลงชื่อไปด้วยกันเพื่อให้เอเจ้นท์เดินทางไปงานร่วมกัน ช่วยลดค่าใช้จ่ายและสะดวกในการจัดการที่จอดรถ</p>
                                      </div>
                                      <div className="pt-2 border-t border-gray-200">
                                        <p className="font-semibold text-green-700 mb-1">📝 วิธีลงทะเบียนรถยนต์ (สำหรับเจ้าของรถ)</p>
                                        <ol className="list-decimal list-inside space-y-1 ml-2">
                                          <li>กดปุ่ม "ลงทะเบียนรถยนต์"</li>
                                          <li>กรอกเลขทะเบียนรถของคุณ</li>
                                          <li>เลือกสมาชิกในทีมที่จะนั่งรถคุณ</li>
                                          <li>กดยืนยัน - เสร็จสิ้น!</li>
                                        </ol>
                                      </div>
                                      <div className="pt-2 border-t border-gray-200">
                                        <p className="font-semibold text-purple-700 mb-1">👥 วิธีชวนเพื่อนไปด้วยกัน</p>
                                        <ol className="list-decimal list-inside space-y-1 ml-2">
                                          <li>คลิกปุ่ม "ชวนเพื่อนไปด้วยกัน"</li>
                                          <li>เพิ่มสมาชิกในทีม หรือชวนเพื่อนจากเอเจ้นท์อื่น (ต้องมีรหัสลงทะเบียน 6 หลัก)</li>
                                          <li>กดยืนยัน - สมาชิกจะเข้าร่วมทะเบียนรถของคุณ!</li>
                                        </ol>
                                      </div>
                                      <div className="pt-2 border-t border-gray-200">
                                        <p className="font-semibold text-orange-700 mb-1">🚐 วิธีเลือกรถที่ร่วม Join</p>
                                        <ol className="list-decimal list-inside space-y-1 ml-2">
                                          <li>เลือก "ไปรถคนอื่น" จากหน้าหลัก</li>
                                          <li>ใส่รหัสลงทะเบียนของเจ้าของรถ</li>
                                          <li>เลือกสมาชิกในทีมที่จะไปด้วย</li>
                                          <li>กดยืนยัน - เข้าร่วมสำเร็จ!</li>
                                        </ol>
                                      </div>
                                      <div className="pt-2 border-t border-gray-200">
                                        <p className="font-semibold text-red-700 mb-1">🗑️ วิธีลบทะเบียนรถ</p>
                                        <ol className="list-decimal list-inside space-y-1 ml-2">
                                          <li>ที่การ์ด "ทะเบียนรถของคุณ" กดปุ่ม "🗑️ ลบ" ข้างเลขทะเบียน</li>
                                          <li>ยืนยันการลบ - ทะเบียนรถจะถูกลบทั้งคัน</li>
                                        </ol>
                                      </div>
                                      <div className="pt-2 border-t border-gray-200">
                                        <p className="font-semibold text-red-700 mb-1">🚪 วิธีย้ายออก</p>
                                        <ol className="list-decimal list-inside space-y-1 ml-2">
                                          <li>เจ้าของรถ/สมาชิก กดปุ่ม "ย้ายออก" ข้างชื่อสมาชิก</li>
                                          <li>ยืนยันการย้ายออก - สมาชิกจะย้ายออกจากทะเบียนรถ</li>
                                        </ol>
                                      </div>
                                      <div className="pt-2 border-t border-gray-200 bg-yellow-50 -mx-4 -mb-4 p-3 rounded-b-lg">
                                        <p className="text-yellow-800 font-medium">💡 ข้อควรทราบ:</p>
                                        <ul className="list-disc list-inside space-y-0.5 ml-2 mt-1 text-yellow-700">
                                          <li>สมาชิก 1 คนสามารถอยู่ได้แค่ 1 รถเท่านั้น</li>
                                          <li>สามารถแก้ไขเลขทะเบียนได้โดยกดปุ่ม "✏️ แก้ไข"</li>
                                          <li>1 เอเจ้นท์สามารถลงทะเบียนได้มากกว่า 1 คัน</li>
                                          <li>หากต้องการดูขั้นตอนโดยละเอียด <a href="/carpool-guide" target="_blank" className="text-blue-600 hover:underline font-semibold">คลิกที่นี่</a></li>
                                        </ul>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Inactive Warning */}
                            {event.carpoolSettings?.carpoolActive === false && isCommitteeOrAdmin && (
                              <div className="mt-2">
                                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium border border-yellow-300">
                                  ⚠️ ระบบปิดใช้งาน - เห็นเฉพาะ Admin/Committee
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Description */}
                          {(() => {
                            // Check if all members are already in carpools (use allCarpools for accurate check)
                            const membersNotInCarpool = attendeeNames.filter((name, index) => {
                              let isInCarpool = false;

                              allCarpools.forEach(cp => {
                                const member = cp.members?.find((m: any) => {
                                  // Skip if not from same registration
                                  if (m.registrationId !== userRegistration?.registrationId) {
                                    return false;
                                  }

                                  // Use attendeeIndex for stable identification (if available)
                                  if (m.attendeeIndex !== undefined && m.attendeeIndex !== -1) {
                                    return m.attendeeIndex === index;
                                  }
                                  // Fallback to name matching (for old data)
                                  const normalizeName = (n: string) => n.replace(/\s+/g, ' ').trim();
                                  const cleanName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                                  return normalizeName(cleanName) === normalizeName(name) || normalizeName(m.name) === normalizeName(name);
                                });
                                if (member) {
                                  isInCarpool = true;
                                }
                              });

                              return !isInCarpool;
                            });

                            const allMembersInCarpools = membersNotInCarpool.length === 0;
                            const ownedCarpoolsCount = ownedCarpools.length;

                            return (
                              <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 border border-gray-300 rounded-lg">
                                <p className="text-sm font-semibold text-gray-800 mb-3">เลือกวิธีเดินทางของคุณ:</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {/* Option 1: Drive own car */}
                                  <button
                                    onClick={() => !allMembersInCarpools && setShowCreateCarpoolModal(true)}
                                    disabled={allMembersInCarpools}
                                    className={`flex items-start gap-3 p-3 border-2 rounded-lg transition-all text-left group ${
                                      allMembersInCarpools
                                        ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                                        : 'bg-white border-blue-300 hover:border-blue-500 hover:shadow-md'
                                    }`}
                                  >
                                    <div className="text-3xl mt-1">🚗</div>
                                    <div className="flex-1">
                                      <p className={`font-semibold transition-colors ${
                                        allMembersInCarpools ? 'text-gray-500' : 'text-gray-900 group-hover:text-blue-700'
                                      }`}>
                                        ขับรถไปเอง
                                      </p>
                                      <p className={`text-xs mt-1 ${allMembersInCarpools ? 'text-gray-400' : 'text-gray-600'}`}>
                                        คุณสามารถลงทะเบียนรถยนต์ได้มากกว่า 1 คัน
                                      </p>
                                      <div className={`mt-2 inline-block px-3 py-1 text-xs rounded-lg transition-colors ${
                                        allMembersInCarpools
                                          ? 'bg-gray-300 text-gray-500'
                                          : 'bg-blue-600 text-white group-hover:bg-blue-700'
                                      }`}>
                                        {allMembersInCarpools
                                          ? 'ลงทะเบียนรถยนต์'
                                          : ownedCarpoolsCount === 0
                                          ? 'ลงทะเบียนรถยนต์'
                                          : `ลงทะเบียนรถยนต์ คันที่ ${ownedCarpoolsCount + 1}`
                                        }
                                      </div>
                                    </div>
                                  </button>

                                  {/* Option 2: Join other's car */}
                                  <button
                                    onClick={() => {
                                      if (!allMembersInCarpools) {
                                        setShowJoinCarpoolModal(true);
                                        // Fetch all carpools to check if members are already in other carpools
                                        if (allCarpools.length === 0) {
                                          fetchAllCarpools();
                                        }
                                      }
                                    }}
                                    disabled={allMembersInCarpools}
                                    className={`flex items-start gap-3 p-3 border-2 rounded-lg transition-all text-left group ${
                                      allMembersInCarpools
                                        ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                                        : 'bg-white border-green-300 hover:border-green-500 hover:shadow-md'
                                    }`}
                                  >
                                    <div className="text-3xl mt-1">🚐</div>
                                    <div className="flex-1">
                                      <p className={`font-semibold transition-colors ${
                                        allMembersInCarpools ? 'text-gray-500' : 'text-gray-900 group-hover:text-green-700'
                                      }`}>
                                        ไปรถคนอื่น
                                      </p>
                                      <p className={`text-xs mt-1 ${allMembersInCarpools ? 'text-gray-400' : 'text-gray-600'}`}>
                                        ต้องมีรหัสการจอง 6 หลัก ของรถที่คุณขอ Join
                                      </p>
                                      <div className={`mt-2 inline-block px-3 py-1 text-xs rounded-lg transition-colors ${
                                        allMembersInCarpools
                                          ? 'bg-gray-300 text-gray-500'
                                          : 'bg-green-600 text-white group-hover:bg-green-700'
                                      }`}>
                                        เลือกรถที่ร่วม Join
                                      </div>
                                    </div>
                                  </button>
                                </div>

                                {/* Message when all members selected travel method */}
                                {allMembersInCarpools && (
                                  <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-xs text-green-700 text-center font-medium">
                                      ✅ สมาชิกในทีมเลือกวิธีเดินทางครบแล้ว
                                    </p>
                                  </div>
                                )}

                              </div>
                            );
                          })()}
                        </div>

                        {carpoolLoading ? (
                          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
                            กำลังโหลด...
                          </div>
                        ) : memberCarpools.length > 0 ? (
                          <div className="space-y-3">
                            {/* Owned Carpools Section */}
                            {ownedCarpools.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-blue-700 mb-2">ทะเบียนรถของคุณ ({ownedCarpools.length} คัน)</p>
                                <div className="space-y-2">
                                  {ownedCarpools.map((ownedCarpool) => (
                                    <div key={ownedCarpool.carpoolId} className="px-4 py-3 bg-blue-50 border border-blue-300 rounded-lg">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1">
                                        {editingLicensePlate ? (
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={newLicensePlate}
                                              onChange={(e) => setNewLicensePlate(e.target.value)}
                                              placeholder="เลขทะเบียนรถ"
                                              className="px-3 py-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
                                            />
                                            <button
                                              onClick={async () => {
                                                if (!newLicensePlate.trim()) {
                                                  toast.error('กรุณาระบุเลขทะเบียนรถ');
                                                  return;
                                                }

                                                setSavingLicensePlate(true);
                                                try {
                                                  const response = await fetch(`/api/carpools/${ownedCarpool.carpoolId}`, {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ licensePlate: newLicensePlate }),
                                                  });

                                                  if (!response.ok) {
                                                    throw new Error('Failed to update license plate');
                                                  }

                                                  toast.success('แก้ไขเลขทะเบียนรถสำเร็จ!');
                                                  setEditingLicensePlate(false);
                                                  await fetchMemberCarpool();
                                                } catch (err) {
                                                  console.error('Error updating license plate:', err);
                                                  toast.error('เกิดข้อผิดพลาดในการแก้ไขเลขทะเบียนรถ');
                                                } finally {
                                                  setSavingLicensePlate(false);
                                                }
                                              }}
                                              disabled={savingLicensePlate}
                                              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
                                            >
                                              {savingLicensePlate ? 'กำลังบันทึก...' : 'บันทึก'}
                                            </button>
                                            <button
                                              onClick={() => {
                                                setEditingLicensePlate(false);
                                                setNewLicensePlate(ownedCarpool.licensePlate);
                                              }}
                                              className="px-3 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                                            >
                                              ยกเลิก
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2">
                                            <p className="text-lg font-semibold text-blue-900">
                                              เลขทะเบียน: {ownedCarpool.licensePlate}
                                            </p>
                                            <button
                                              onClick={() => {
                                                setEditingLicensePlate(true);
                                                setNewLicensePlate(ownedCarpool.licensePlate);
                                              }}
                                              className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                                            >
                                              ✏️ แก้ไข
                                            </button>
                                            <button
                                              onClick={() => handleDeleteCarpool(ownedCarpool.carpoolId)}
                                              className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                            >
                                              🗑️ ลบ
                                            </button>
                                          </div>
                                        )}
                                        <p className="text-xs text-blue-700">
                                          เจ้าของ: {ownedCarpool.ownerCompanyName}
                                        </p>
                                      </div>
                                      {ownedCarpool.assignedCarNumber && event.carpoolSettings?.showCarNumbersToMembers && (
                                        <div className="text-right">
                                          <p className="text-xs text-blue-600">เลขรถ</p>
                                          <p className="text-lg font-bold text-blue-900">
                                            {ownedCarpool.assignedCarNumber}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-xs text-blue-700">
                                      จำนวนสมาชิกร่วมรถคันนี้: {ownedCarpool.members?.length || 0} คน
                                    </div>
                                    {ownedCarpool.members && ownedCarpool.members.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-blue-200">
                                        <p className="text-xs font-medium text-blue-800 mb-1">รายชื่อสมาชิกทะเบียนรถคันนี้:</p>
                                        <div className="space-y-1">
                                          {ownedCarpool.members.map((member: any, idx: number) => {
                                            const isMyTeamMember = member.registrationId === userRegistration?.registrationId;

                                            // Clean member name
                                            let displayName = member.name;
                                            try {
                                              const parsed = JSON.parse(member.name);
                                              displayName = Array.isArray(parsed) ? parsed[0] : parsed;
                                            } catch {
                                              displayName = member.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                                            }

                                            return (
                                              <div key={`${member.lineUserId}-${member.name}`} className="text-xs text-blue-700 flex items-center justify-between gap-2">
                                                <span>
                                                  • {displayName}
                                                  {!isMyTeamMember && member.companyName && (
                                                    <span className="italic font-light text-blue-500"> ({member.companyName}) - joined</span>
                                                  )}
                                                </span>
                                                <button
                                                  onClick={() => handleRemoveTeamMember(member.lineUserId, member.name)}
                                                  className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                                >
                                                  ย้ายออก
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                      {/* Action buttons */}
                                      <div className="mt-3 pt-2 border-t border-blue-200">
                                        <button
                                          onClick={() => {
                                            setInvitingToCarpoolId(ownedCarpool.carpoolId);
                                            setShowInviteModal(true);
                                            fetchAllCarpools(); // Fetch all carpools for validation
                                          }}
                                          className="w-full text-xs px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                        >
                                          👥 ชวนเพื่อนไปด้วยกัน
                                        </button>
                                      </div>
                                    </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Joined Carpools Section */}
                            {joinedCarpools.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-green-700 mb-2">Carpools ที่เข้าร่วม</p>
                                <div className="space-y-2">
                                  {joinedCarpools.map((carpool) => (
                                    <div key={carpool.carpoolId} className="px-4 py-3 bg-green-50 border border-green-300 rounded-lg">
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="flex-1">
                                            <p className="text-lg font-semibold text-green-900">
                                              เลขทะเบียน: {carpool.licensePlate}
                                            </p>
                                            <p className="text-xs text-green-700">
                                              เจ้าของ: {carpool.ownerCompanyName}
                                            </p>
                                          </div>
                                          {carpool.assignedCarNumber && event.carpoolSettings?.showCarNumbersToMembers && (
                                            <div className="text-right">
                                              <p className="text-xs text-green-600">เลขรถ</p>
                                              <p className="text-lg font-bold text-green-900">
                                                {carpool.assignedCarNumber}
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                        <div className="text-xs text-green-700">
                                          จำนวนสมาชิกร่วมรถคันนี้: {carpool.members?.length || 0} คน
                                        </div>
                                        {carpool.members && carpool.members.length > 0 && (
                                          <div className="mt-2 pt-2 border-t border-green-200">
                                            <p className="text-xs font-medium text-green-800 mb-1">รายชื่อสมาชิกทะเบียนรถคันนี้:</p>
                                            <div className="space-y-1">
                                              {carpool.members.map((member: any, idx: number) => {
                                                const isMyTeamMember = member.registrationId === userRegistration?.registrationId;

                                                // Clean member name
                                                let displayName = member.name;
                                                try {
                                                  const parsed = JSON.parse(member.name);
                                                  displayName = Array.isArray(parsed) ? parsed[0] : parsed;
                                                } catch {
                                                  displayName = member.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                                                }

                                                return (
                                                  <div key={`${member.lineUserId}-${member.name}`} className="text-xs text-green-700 flex items-center justify-between gap-2">
                                                    <span>
                                                      • {displayName}
                                                      {isMyTeamMember && (
                                                        <span className="italic font-light text-green-500"> - joined</span>
                                                      )}
                                                    </span>
                                                    {isMyTeamMember && (
                                                      <button
                                                        onClick={() => handleRemoveTeamMember(member.lineUserId, member.name, carpool.carpoolId)}
                                                        className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                                      >
                                                        ย้ายออก
                                                      </button>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-center">
                            <p className="text-sm text-gray-500 italic">
                              ยังไม่มี Carpool
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* ==================== CARPOOL CARD END ==================== */}

                  {/* ==================== PARTY TABLE CARD START ==================== */}
                  <PartyTableSection
                    eventId={Array.isArray(params.eventId) ? params.eventId[0] : params.eventId}
                    event={event}
                    userRegistration={userRegistration}
                    session={session}
                    isCommitteeOrAdmin={isCommitteeOrAdmin}
                    attendeeNames={attendeeNames}
                  />
                  {/* ==================== PARTY TABLE CARD END ==================== */}

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
                    </div>
                  )}

                  {/* Payment Breakdown (for both full and deposit mode) */}
                  {/* ✅ Show payment section if: totalAmount > 0 OR has discounts OR has base amounts */}
                  {(() => {
                    const hasDiscounts = userRegistration.discounts && userRegistration.discounts.length > 0;
                    const hasBaseAmounts = (userRegistration.eventFee && userRegistration.eventFee > 0) ||
                                          (userRegistration.roomFee && userRegistration.roomFee > 0);
                    const showPaymentSection = (userRegistration.totalAmount && userRegistration.totalAmount > 0) ||
                                               hasDiscounts ||
                                               hasBaseAmounts;

                    if (!showPaymentSection) return null;

                    const isFreeWithDiscount = userRegistration.totalAmount === 0 && hasDiscounts;

                    return (
                    <div id="payment-section" className="bg-blue-50 border border-blue-200 rounded-lg p-6 scroll-mt-24">
                      <h3 className="font-semibold text-blue-900 mb-4">รายละเอียดการชำระเงิน</h3>

                      {/* ✅ Show free with discount notice */}
                      {isFreeWithDiscount && (
                        <div className="bg-green-100 border-2 border-green-400 rounded-lg p-4 mb-4">
                          <div className="flex items-center gap-2">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <div className="text-base font-bold text-green-800">🎉 ได้รับส่วนลด 100%</div>
                              <div className="text-sm text-green-700 mt-1">คุณไม่ต้องชำระเงินสำหรับกิจกรรมนี้</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 1. Total Amount Summary */}
                      {!isFreeWithDiscount && (
                        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-4 mb-4">
                          <div className="text-sm opacity-90 mb-1">สรุปค่าใช้จ่ายทั้งหมด</div>
                          <div className="flex items-baseline justify-between">
                            <span className="text-3xl font-bold">{(userRegistration.totalAmount ?? 0).toLocaleString()} บาท</span>
                            <span className="text-sm opacity-90">({userRegistration.attendeeCount || 1} คน)</span>
                          </div>
                        </div>
                      )}

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
                          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-200 mb-3">
                            <svg className="w-4 h-4 inline mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {getPaymentStatusDescription(userRegistration.paymentStatus)}
                          </div>
                          {/* Payment Summary */}
                          {(() => {
                            const totalAmount = userRegistration.totalAmount || 0;
                            const fullPaymentAmountPaid = (userRegistration as any).fullPaymentAmountPaid || 0;
                            const depositAmountPaid = (userRegistration as any).depositAmountPaid || 0;
                            const remainingAmountPaid = (userRegistration as any).remainingAmountPaid || 0;
                            const additionalPaymentAmountPaid = (userRegistration as any).additionalPaymentAmountPaid || 0;
                            // ✅ CRITICAL FIX: Include additionalPaymentAmountPaid in total paid
                            const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;
                            const outstanding = Math.max(0, totalAmount - paidAmount);
                            // ✅ Calculate overpayment (if paidAmount > totalAmount)
                            const overpayment = paidAmount > totalAmount ? paidAmount - totalAmount : 0;

                            return (
                              <div className="text-sm space-y-1">
                                <div className="flex justify-between text-gray-700">
                                  <span>ยอดรวมทั้งหมด:</span>
                                  <span className="font-semibold">{totalAmount.toLocaleString()} บาท</span>
                                </div>
                                <div className="flex justify-between text-gray-700">
                                  <span>ยอดชำระแล้ว:</span>
                                  <span className="font-semibold">{paidAmount.toLocaleString()} บาท</span>
                                </div>
                                {/* Show overpayment OR outstanding */}
                                {overpayment > 0 ? (
                                  <div className="flex justify-between border-t pt-1 mt-1 text-blue-700 border-blue-300">
                                    <span className="font-bold">ชำระไว้เกิน:</span>
                                    <span className="font-bold">{overpayment.toLocaleString()} บาท</span>
                                  </div>
                                ) : (
                                  <>
                                    <div className={`flex justify-between border-t pt-1 mt-1 ${
                                      outstanding === 0 ? 'text-green-700 border-green-300' : 'text-red-700 border-red-300'
                                    }`}>
                                      <span className="font-bold">ยอดคงเหลือค้างชำระ:</span>
                                      <span className="font-bold">{outstanding.toLocaleString()} บาท</span>
                                    </div>
                                    {/* Show pending slip notice if there are pending slips */}
                                    {outstanding > 0 && paymentSlips.some(slip => slip.status === 'pending') && (
                                      <div className="text-xs text-green-600 mt-1 ml-1">
                                        (รอตรวจสอบสลิป)
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* TEMP: Hidden until PDF generation is fixed on Vercel */}
                      {/* Download Receipt Certificate Button */}
                      {/* {userRegistration.paymentStatus === 'ชำระครบแล้ว' && (
                        <div className="bg-white rounded-lg p-4 mb-4 border-2 border-green-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <svg className="w-6 h-6 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <div>
                                <p className="font-semibold text-gray-900">ใบรับรองแทนใบเสร็จ</p>
                                <p className="text-sm text-gray-600">ดาวน์โหลดใบรับรองแทนใบเสร็จสำหรับการชำระเงินของคุณ</p>
                              </div>
                            </div>
                            <button
                              onClick={() => setShowReceiptModal(true)}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              ดาวน์โหลด PDF
                            </button>
                          </div>
                        </div>
                      )} */}

                      {/* 2.5. Additional Payment Required Notice - Moved here */}
                      {(() => {
                        // Calculate if additional payment is required
                        const totalAmount = userRegistration.totalAmount || 0;

                        // Calculate actual total paid from tracked amounts
                        const fullPaymentAmountPaid = (userRegistration as any).fullPaymentAmountPaid || 0;
                        const depositAmountPaid = (userRegistration as any).depositAmountPaid || 0;
                        const remainingAmountPaid = (userRegistration as any).remainingAmountPaid || 0;
                        const additionalPaymentAmountPaid = (userRegistration as any).additionalPaymentAmountPaid || 0;
                        // ✅ CRITICAL FIX: Include additionalPaymentAmountPaid
                        const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;

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

                        // Check for overpayment
                        const overpayment = (userRegistration as any).overpaymentAmount || 0;

                        // Check if there's a pending additional payment
                        const hasPendingAdditional = additionalPayments.some((p: any) => p.status === 'รอตรวจสอบ');

                        // Check if this is truly an "additional" payment (not first payment)
                        // Only show additional payment notice if user has already paid something
                        const isAdditionalPayment = paidAmount > 0 || approvedAdditional > 0;

                        // ✅ Check for refund (show before overpayment)
                        const totalRefunded = (userRegistration as any).totalRefunded || 0;

                        // Show refund alert first if any
                        if (totalRefunded > 0) {
                          return (
                            <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4 mb-4">
                              <div className="flex items-start gap-3">
                                <svg className="w-6 h-6 text-purple-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                                <div className="flex-1">
                                  <h4 className="font-semibold text-purple-900 mb-2">💸 คืนเงินแล้ว</h4>
                                  <p className="text-sm text-purple-800">
                                    ระบบได้ทำการคืนเงินให้คุณแล้ว หากมีข้อสงสัยกรุณาติดต่อทีมงาน
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // Show overpayment alert
                        if (overpayment > 0) {
                          return (
                            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-4">
                              <div className="flex items-start gap-3">
                                <svg className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div className="flex-1">
                                  <h4 className="font-semibold text-blue-900 mb-2">ℹ️ ชำระเงินเกินจำนวน</h4>
                                  <p className="text-sm text-blue-800">
                                    คุณได้ชำระเงินเกินจำนวนที่กำหนด ยอดเกินสามารถนำไปใช้กับกิจกรรมครั้งต่อไป หรือติดต่อทีมงานเพื่อขอคืนเงิน
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        }

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
                                    <p className="text-sm text-orange-800">
                                      กรุณาชำระเงินเพิ่มเติมและส่งสลิปผ่านปุ่มด้านล่าง
                                    </p>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 2.6. Payment Slips Table - Show all payment slips */}
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
                                        <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap ${
                                          slip.paymentType === 'refund' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                                        }`}>
                                          <span className="hidden sm:inline">{getPaymentTypeName(slip.paymentType)}</span>
                                          <span className="sm:hidden">
                                            {slip.paymentType === 'deposit' ? 'มัดจำ' :
                                             slip.paymentType === 'remaining' ? 'คงเหลือ' :
                                             slip.paymentType === 'full' ? 'เต็ม' :
                                             slip.paymentType === 'refund' ? '💸คืน' : 'เพิ่ม'}
                                          </span>
                                        </span>
                                      </td>
                                      <td className={`px-1.5 sm:px-3 py-2 sm:py-3 text-right text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                                        slip.paymentType === 'refund' ? 'text-red-600' : 'text-gray-900'
                                      }`}>
                                        <span className="sm:hidden">{slip.paymentType === 'refund' ? '-' : ''}{slip.amount.toLocaleString()}</span>
                                        <span className="hidden sm:inline">{slip.paymentType === 'refund' ? '-' : ''}{slip.amount.toLocaleString()} บาท</span>
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

                      {/* 4a. Full Payment Mode - Show deadline (hide if fully paid or has payment slips) */}
                      {(() => {
                        const totalAmount = userRegistration.totalAmount || 0;
                        const paidAmount = userRegistration.paidAmount || 0;
                        const additionalPayments = parseAdditionalPayments(userRegistration.additionalPayments);
                        const fullyPaid = isFullyPaid(totalAmount, paidAmount, additionalPayments);

                        // Hide deadline if fully paid
                        if (fullyPaid) return null;

                        // ✅ Hide deadline if user has uploaded any payment slip (pending/approved/rejected)
                        // User has started payment process, no need to show deadline anymore
                        if (paymentSlips.length > 0) return null;

                        // ✅ Use fullPaymentDeadline for full payment mode (not remainingDeadline)
                        const deadline = userRegistration.fullPaymentDeadline;
                        const isPastDeadline = deadline && isDeadlinePassed(deadline);

                        return event?.paymentMode !== 'deposit' && deadline && (
                          <div className={`bg-white rounded-lg p-4 mb-3 border-2 ${isPastDeadline ? 'border-red-400 bg-red-50' : 'border-orange-300'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-700">กำหนดชำระเงิน</span>
                              <span className={`text-sm font-bold ${isPastDeadline ? 'text-red-600' : 'text-orange-600'}`}>
                                {formatDeadline(deadline)}
                              </span>
                            </div>
                            <div className={`text-sm font-medium ${isPastDeadline ? 'text-red-600' : 'text-orange-600'}`}>
                              {getTimeRemaining(deadline)}
                            </div>
                            {isPastDeadline && (
                              <div className="mt-3 pt-3 border-t border-red-200">
                                <p className="text-sm text-red-700">
                                  การจองนี้พ้นกำหนดชำระแล้ว โปรดติดต่อ Admin{lineOaUrl && (
                                    <>
                                      {' '}
                                      <a
                                        href={lineOaUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium underline hover:text-red-800"
                                      >
                                        ที่นี่
                                      </a>
                                    </>
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* 4b. Deposit Mode - Show breakdown (hide countdown if fully paid) */}
                      {(() => {
                        const totalAmount = userRegistration.totalAmount || 0;
                        const paidAmount = userRegistration.paidAmount || 0;
                        const additionalPayments = parseAdditionalPayments(userRegistration.additionalPayments);
                        const fullyPaid = isFullyPaid(totalAmount, paidAmount, additionalPayments);

                        return event?.paymentMode === 'deposit' && (
                          <>
                            {/* Deposit Payment */}
                            {userRegistration.depositAmount && userRegistration.depositAmount > 0 && (
                              <div className="bg-white rounded-lg p-4 mb-3">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium">งวดที่ 1: มัดจำ</span>
                                  <span className="text-lg font-bold">{userRegistration.depositAmount.toLocaleString()} บาท</span>
                                </div>

                                {/* Show deadline with warning if past deadline */}
                                {!fullyPaid && userRegistration.depositDeadline && !userRegistration.depositPaid && (() => {
                                  // ✅ Hide deadline if user has uploaded deposit slip (any status)
                                  const hasDepositSlip = paymentSlips.some(slip => slip.paymentType === 'deposit');
                                  if (hasDepositSlip) return null;

                                  const isPastDepositDeadline = isDeadlinePassed(userRegistration.depositDeadline);
                                  return (
                                    <div className={`text-sm mb-2 ${isPastDepositDeadline ? 'text-red-600' : 'text-gray-600'}`}>
                                      ครบกำหนด: {formatDeadline(userRegistration.depositDeadline)}
                                      <br />
                                      <span className={`font-medium ${isPastDepositDeadline ? 'text-red-600' : 'text-orange-600'}`}>
                                        {getTimeRemaining(userRegistration.depositDeadline)}
                                      </span>
                                      {isPastDepositDeadline && (
                                        <div className="mt-2 pt-2 border-t border-red-200">
                                          <p className="text-sm text-red-700">
                                            การจองนี้พ้นกำหนดชำระแล้ว โปรดติดต่อ Admin{lineOaUrl && (
                                              <>
                                                {' '}
                                                <a
                                                  href={lineOaUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="font-medium underline hover:text-red-800"
                                                >
                                                  ที่นี่
                                                </a>
                                              </>
                                            )}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

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

                                {/* Show deadline with warning if past deadline */}
                                {!fullyPaid && userRegistration.remainingDeadline && !userRegistration.remainingSlipUrl && (() => {
                                  // ✅ Hide deadline if user has uploaded remaining slip (any status)
                                  const hasRemainingSlip = paymentSlips.some(slip => slip.paymentType === 'remaining');
                                  if (hasRemainingSlip) return null;

                                  const isPastRemainingDeadline = isDeadlinePassed(userRegistration.remainingDeadline);
                                  return (
                                    <div className={`text-sm mb-2 ${isPastRemainingDeadline ? 'text-red-600' : 'text-gray-600'}`}>
                                      ครบกำหนด: {formatDeadline(userRegistration.remainingDeadline)}
                                      <br />
                                      <span className={`font-medium ${isPastRemainingDeadline ? 'text-red-600' : 'text-orange-600'}`}>
                                        {getTimeRemaining(userRegistration.remainingDeadline)}
                                      </span>
                                      {isPastRemainingDeadline && (
                                        <div className="mt-2 pt-2 border-t border-red-200">
                                          <p className="text-sm text-red-700">
                                            การจองนี้พ้นกำหนดชำระแล้ว โปรดติดต่อ Admin{lineOaUrl && (
                                              <>
                                                {' '}
                                                <a
                                                  href={lineOaUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="font-medium underline hover:text-red-800"
                                                >
                                                  ที่นี่
                                                </a>
                                              </>
                                            )}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

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
                        );
                      })()}
                    </div>
                    );
                  })()}

                  {/* Payment Information - Show after registration for payment reference (hide if deadline passed) */}
                  {(() => {
                    // Check if any applicable deadline has passed
                    let isPastDeadline = false;
                    if (event?.paymentMode === 'deposit') {
                      // Deposit mode: Check deposit deadline if deposit not paid, or remaining deadline if deposit paid
                      if (!userRegistration.depositPaid && userRegistration.depositDeadline) {
                        isPastDeadline = isDeadlinePassed(userRegistration.depositDeadline);
                      } else if (userRegistration.depositPaid && userRegistration.remainingDeadline && !userRegistration.remainingSlipUrl) {
                        isPastDeadline = isDeadlinePassed(userRegistration.remainingDeadline);
                      }
                    } else {
                      // Full payment mode: Check full payment deadline
                      if (userRegistration.fullPaymentDeadline) {
                        isPastDeadline = isDeadlinePassed(userRegistration.fullPaymentDeadline);
                      }
                    }

                    // Hide bank account info if deadline has passed
                    if (isPastDeadline) {
                      return null;
                    }

                    // Check if fully paid (including pending slips)
                    const totalAmount = userRegistration.totalAmount || 0;
                    const fullPaymentAmountPaid = (userRegistration as any).fullPaymentAmountPaid || 0;
                    const depositAmountPaid = (userRegistration as any).depositAmountPaid || 0;
                    const remainingAmountPaid = (userRegistration as any).remainingAmountPaid || 0;
                    const additionalPaymentAmountPaid = (userRegistration as any).additionalPaymentAmountPaid || 0;
                    const actualTotalPaid = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;
                    const paidAmount = actualTotalPaid || userRegistration.paidAmount || 0;

                    // Check if has pending slips from paymentSlips array
                    const hasPendingFullPaymentSlip = paymentSlips.some(
                      slip => slip.paymentType === 'full' && slip.status === 'pending'
                    );
                    const hasPendingDepositSlip = paymentSlips.some(
                      slip => slip.paymentType === 'deposit' && slip.status === 'pending'
                    );
                    const hasPendingRemainingSlip = paymentSlips.some(
                      slip => slip.paymentType === 'remaining' && slip.status === 'pending'
                    );
                    const hasPendingAdditionalSlip = paymentSlips.some(
                      slip => slip.paymentType === 'additional' && slip.status === 'pending'
                    );

                    // Calculate if payment is complete (including pending slips)
                    const additionalPayments = parseAdditionalPayments(userRegistration.additionalPayments);
                    const approvedAdditional = additionalPayments
                      .filter((p: any) => p.status === 'อนุมัติแล้ว')
                      .reduce((sum: number, p: any) => sum + p.amount, 0);
                    const fullyPaid = isFullyPaid(totalAmount, paidAmount, additionalPayments);

                    // Calculate pending slip amounts
                    const pendingSlipTotal = paymentSlips
                      .filter(slip => slip.status === 'pending' && slip.paymentType !== 'refund')
                      .reduce((sum, slip) => sum + slip.amount, 0);

                    // Check if pending slips + paid amount >= total amount
                    const willBeFullyPaid = (paidAmount + pendingSlipTotal) >= totalAmount;

                    // Hide account info if:
                    // 1. Already fully paid, OR
                    // 2. Has pending slip(s) that will cover the full amount
                    if (fullyPaid || willBeFullyPaid) {
                      return null;
                    }

                    // Show bank account info if has total amount and payment account details
                    return userRegistration.totalAmount && userRegistration.totalAmount > 0 && (event.paymentBankName || event.paymentAccountName || event.paymentAccountNumber || event.paymentQrCodeUrl || event.paymentTerms) && (
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
                            <div className="text-xs text-blue-800 whitespace-pre-wrap">
                              {event.paymentTerms}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  {/* 3. Payment Submission Section - Show Upload Button/Instructions */}
                  {(() => {
                    const hasPaymentAccount = !!event.paymentAccountNumber;
                    const hasTotalAmount = (userRegistration.totalAmount ?? 0) > 0;

                    // Calculate if fully paid (including additional payments)
                    const totalAmount = userRegistration.totalAmount || 0;

                    // Calculate actual total paid from tracked amounts
                    const fullPaymentAmountPaid = (userRegistration as any).fullPaymentAmountPaid || 0;
                    const depositAmountPaid = (userRegistration as any).depositAmountPaid || 0;
                    const remainingAmountPaid = (userRegistration as any).remainingAmountPaid || 0;
                    const additionalPaymentAmountPaid = (userRegistration as any).additionalPaymentAmountPaid || 0;
                    // ✅ CRITICAL FIX: Include additionalPaymentAmountPaid
                    const actualTotalPaid = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;

                    // Fallback to legacy paidAmount if no tracked amounts
                    const paidAmount = actualTotalPaid || userRegistration.paidAmount || 0;

                    const additionalPayments = parseAdditionalPayments(userRegistration.additionalPayments);

                    // Check if fully paid using utility function
                    const fullyPaid = isFullyPaid(totalAmount, paidAmount, additionalPayments);

                    // Sum approved additional payments
                    const approvedAdditional = additionalPayments
                      .filter((p: any) => p.status === 'อนุมัติแล้ว')
                      .reduce((sum: number, p: any) => sum + p.amount, 0);

                    const additionalRequired = Math.max(0, totalAmount - (paidAmount + approvedAdditional));

                    // Check if there's a pending additional payment
                    const hasPendingAdditional = additionalPayments.some((p: any) => p.status === 'รอตรวจสอบ');

                    // Calculate pending slip amounts
                    const pendingSlipTotal = paymentSlips
                      .filter(slip => slip.status === 'pending' && slip.paymentType !== 'refund')
                      .reduce((sum, slip) => sum + slip.amount, 0);

                    // Check if pending slips + paid amount >= total amount
                    const willBeFullyPaid = (paidAmount + pendingSlipTotal) >= totalAmount;

                    // Hide button if fully paid OR will be fully paid with pending slips
                    if (fullyPaid || willBeFullyPaid) {
                      return false;
                    }

                    // ✅ Check if any applicable deadline has passed
                    // IMPORTANT: Only hide button if deadline passed AND no payment made yet
                    // If user already paid some amount, always show upload button for additional payments
                    let isPastDeadline = false;

                    // Only check deadline if user has NOT made any payment yet
                    if (paidAmount === 0) {
                      if (event.paymentMode === 'deposit') {
                        // Deposit mode: Check deposit deadline if deposit not paid
                        if (!userRegistration.depositPaid && userRegistration.depositDeadline) {
                          isPastDeadline = isDeadlinePassed(userRegistration.depositDeadline);
                        } else if (userRegistration.depositPaid && userRegistration.remainingDeadline && !userRegistration.remainingSlipUrl) {
                          isPastDeadline = isDeadlinePassed(userRegistration.remainingDeadline);
                        }
                      } else {
                        // Full payment mode: Check full payment deadline
                        if (userRegistration.fullPaymentDeadline) {
                          isPastDeadline = isDeadlinePassed(userRegistration.fullPaymentDeadline);
                        }
                      }

                      // Hide button if deadline has passed AND no payment made yet
                      if (isPastDeadline) {
                        return false;
                      }
                    }
                    // If paidAmount > 0, ignore deadline and allow upload (user can pay additional amounts)

                    // Show button if has payment account and total amount > 0
                    return hasPaymentAccount && hasTotalAmount;
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

                      <button
                        onClick={() => {
                          if (!userRegistration) {
                            toast.error('กรุณาลงทะเบียนก่อนอัพโหลดสลิป');
                            return;
                          }

                          // Determine payment type and amount
                          let paymentType: 'deposit' | 'remaining' | 'full' = 'full';
                          let amount = 0;

                          if (event.paymentMode === 'deposit') {
                            if (userRegistration.depositPaid && userRegistration.remainingAmount && userRegistration.remainingAmount > 0) {
                              paymentType = 'remaining';
                              amount = userRegistration.remainingAmount;
                            } else {
                              paymentType = 'deposit';
                              amount = userRegistration.depositAmount || 0;
                            }
                          } else {
                            paymentType = 'full';
                            amount = userRegistration.totalAmount || event.registrationFee || 0;
                          }

                          console.log('[Event Detail] Opening upload modal:', {
                            paymentType,
                            amount,
                            totalAmount: userRegistration.totalAmount,
                            eventFee: event.registrationFee,
                          });

                          setUploadPaymentType(paymentType);
                          setUploadAmount(amount);
                          setUploadModalOpen(true);
                        }}
                        className="block w-full text-center bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg"
                      >
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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
                    </div>
                  ) : null}

                  {/* Cancel Registration Section - Moved to end */}
                  {(() => {
                    // Hide cancel button if event date has passed or is today
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const eventStartDate = new Date(event.eventDate);
                    eventStartDate.setHours(0, 0, 0, 0);

                    // Don't show if event has started (today or past)
                    if (today >= eventStartDate) {
                      return null;
                    }

                    // Show cancel button if policy enabled and not cancelled
                    return event.cancellationPolicy?.enabled &&
                      userRegistration.status !== 'cancelled' &&
                      userRegistration.status !== 'ยกเลิกแล้ว' && (
                      <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-3 mb-3">
                          <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900 text-sm">ต้องการยกเลิกการจอง?</p>
                            <p className="text-xs text-gray-600 mt-1">สามารถยกเลิกได้ตามเงื่อนไขการคืนเงิน</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowCancellationModal(true)}
                          className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm"
                        >
                          ยกเลิกการจอง
                        </button>
                      </div>
                    );
                  })()}
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
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                    <p className="text-gray-600 font-medium">ปิดรับสมัคร</p>
                  </div>
                </div>
              ) : isFull ? (
                <div className="bg-white rounded-lg shadow p-6">
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
                </div>
              ) : showRegistrationForm ? (
                <div className="bg-white rounded-lg shadow p-6 space-y-4">
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
                      {/* Registration Fee */}
                      <div className="flex justify-between items-center mb-3">
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
                          <p className="text-lg font-semibold text-gray-700">
                            {calculateRegistrationFee(event, attendeeCount, true).toLocaleString()} บาท
                          </p>
                        </div>
                      </div>

                      {/* Room Fee (if applicable) */}
                      {calculatedRoomFee > 0 && (
                        <div className="flex justify-between items-center mb-3 pt-3 border-t border-blue-200">
                          <div>
                            <p className="text-sm text-gray-600">ค่าห้องพัก</p>
                            <p className="text-xs text-gray-500">
                              {roomAllocations.map((alloc) => {
                                const roomType = event.roomTypes?.find((rt: RoomType) => rt.typeId === alloc.roomTypeId);
                                if (!roomType) return null;
                                return `${roomType.typeName} ${alloc.roomCount} ห้อง`;
                              }).filter(Boolean).join(', ')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-gray-700">
                              {calculatedRoomFee.toLocaleString()} บาท
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Total */}
                      <div className="flex justify-between items-center pt-3 border-t-2 border-blue-300">
                        <div>
                          <p className="text-base font-semibold text-gray-800">ยอดรวมทั้งหมด</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">
                            {(calculateRegistrationFee(event, attendeeCount, true) + calculatedRoomFee).toLocaleString()} บาท
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
                            <div className="text-xs text-blue-800 whitespace-pre-wrap">
                              {event.paymentTerms}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Payment Slip Upload Section (Immediate Payment Mode) */}
                  {event.paymentTiming === 'immediate' && (calculateRegistrationFee(event, attendeeCount, true) + calculatedRoomFee) > 0 && (
                    <div className="bg-orange-50 border border-orange-300 rounded-lg p-6">
                      <h3 className="text-base font-semibold text-orange-900 mb-2 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        หลักฐานการชำระเงิน *
                      </h3>

                      <p className="text-sm text-orange-800 mb-4">
                        กรุณาแนบหลักฐานการโอนเงินเพื่อยืนยันการลงทะเบียน
                        {event.paymentMode === 'deposit' && ' (มัดจำ)'}
                      </p>

                      {/* Amount to pay */}
                      <div className="bg-white border border-orange-200 rounded p-4 mb-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">
                            {event.paymentMode === 'deposit' ? 'ยอดมัดจำที่ต้องชำระ:' : 'ยอดที่ต้องชำระ:'}
                          </span>
                          <span className="text-xl font-bold text-orange-600">
                            {event.paymentMode === 'deposit'
                              ? (event.useDepositPercentage
                                  ? `${Math.round((calculateRegistrationFee(event, attendeeCount, true) + calculatedRoomFee) * ((event.depositPercentage || 0) / 100)).toLocaleString()} บาท`
                                  : `${(event.depositAmount || 0).toLocaleString()} บาท`)
                              : `${(calculateRegistrationFee(event, attendeeCount, true) + calculatedRoomFee).toLocaleString()} บาท`
                            }
                          </span>
                        </div>
                      </div>

                      {/* File input */}
                      <div className="space-y-3">
                        <label className="block">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setPaymentSlipFile(file);
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setSlipPreviewUrl(reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 cursor-pointer"
                          />
                        </label>

                        {slipPreviewUrl && (
                          <div className="relative">
                            <p className="text-xs text-gray-600 mb-2">ตัวอย่างหลักฐานการชำระเงิน:</p>
                            <div className="relative inline-block">
                              <img
                                src={slipPreviewUrl}
                                alt="Payment slip preview"
                                className="max-w-xs rounded border border-orange-200"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentSlipFile(null);
                                  setSlipPreviewUrl(null);
                                }}
                                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                                title="ลบไฟล์"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-orange-700 bg-orange-100 p-2 rounded">
                          <strong>หมายเหตุ:</strong> การลงทะเบียนจะสำเร็จทันที แต่จะรอการตรวจสอบหลักฐานการชำระเงินจากทีมงาน
                          {event.paymentMode === 'deposit' && ' หลังจากมัดจำได้รับการอนุมัติ คุณจะต้องชำระยอดคงเหลือ'}
                        </p>
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

      {/* Payment Slip Upload Modal */}
      {userRegistration && event && (
        <PaymentSlipUploadModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          registrationId={userRegistration.registrationId}
          eventId={event.eventId}
          paymentType={uploadPaymentType}
          amount={uploadAmount}
          paymentMode={event.paymentMode || 'full'}
          depositPaid={userRegistration.depositPaid || false}
          totalAmount={userRegistration.totalAmount || 0}
          depositAmount={userRegistration.depositAmount || 0}
          remainingAmount={userRegistration.remainingAmount || 0}
          fullPaymentAmountPaid={userRegistration.fullPaymentAmountPaid || 0}
          depositAmountPaid={userRegistration.depositAmountPaid || 0}
          remainingAmountPaid={userRegistration.remainingAmountPaid || 0}
          additionalPaymentAmountPaid={userRegistration.additionalPaymentAmountPaid || 0}
          onSuccess={() => {
            // Refresh event data after successful upload
            fetchEventDetail();
            // Show success modal
            setUploadModalOpen(false);
            setShowUploadSuccessModal(true);
          }}
        />
      )}

      {/* Upload Success Modal */}
      {showUploadSuccessModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowUploadSuccessModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Success Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-gray-900 text-center mb-3">
              ✅ ส่งหลักฐานการชำระเงินสำเร็จ
            </h3>

            {/* Message */}
            <div className="space-y-3 text-gray-700 mb-6">
              <p className="text-center">
                ระบบได้รับสลิปการโอนเงินของคุณเรียบร้อยแล้ว
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">📋 ขั้นตอนต่อไป:</p>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>ทีมงานจะตรวจสอบยอดโอนเงินของคุณ</li>
                  <li>เมื่อตรวจสอบเรียบร้อย ระบบจะอัปเดตสถานะการชำระเงินอัตโนมัติ</li>
                  <li>คุณสามารถตรวจสอบสถานะการชำระเงินได้ตลอดเวลาผ่านหน้านี้</li>
                </ol>
              </div>

              <p className="text-sm text-gray-600 text-center">
                ⏱️ <strong>เวลาการตรวจสอบ:</strong> ปกติภายใน 24-48 ชั่วโมง<br />
                (ในวันและเวลาทำการ)
              </p>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ หมายเหตุ:</strong> หากคุณชำระเงินครบถ้วนตามจำนวนที่ระบบแจ้ง
                  ไม่จำเป็นต้องอัพโหลดสลิปซ้ำอีกครั้ง รอการตรวจสอบจากทีมงานเท่านั้น
                </p>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setShowUploadSuccessModal(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              เข้าใจแล้ว
            </button>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {userRegistration && event && (
        <CancellationModal
          isOpen={showCancellationModal}
          onClose={() => setShowCancellationModal(false)}
          registration={userRegistration}
          event={event}
          onSuccess={() => {
            // Refresh event detail after successful cancellation
            fetchEventDetail();
            setShowCancellationModal(false);
          }}
        />
      )}

      {/* TEMP: Hidden until PDF generation is fixed on Vercel */}
      {/* Receipt Certificate Modal */}
      {/* {showReceiptModal && userRegistration && (
        <ReceiptCertificateModal
          isOpen={showReceiptModal}
          onClose={() => setShowReceiptModal(false)}
          eventId={event.eventId}
          initialData={{
            companyName: guestCompanyName || '',
            memberName: guestContactName || '',
            memberPosition: 'กรรมการผู้จัดการ',
          }}
        />
      )} */}

      {/* Create Carpool Modal */}
      {showCreateCarpoolModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">ลงทะเบียนรถยนต์ใหม่</h3>
              <button
                onClick={() => {
                  setShowCreateCarpoolModal(false);
                  setNewCarpoolLicensePlate('');
                  setSelectedMembersForCarpool([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Description */}
            <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-gray-700">
                กรุณาระบุทะเบียนรถยนต์ของทีมคุณเท่านั้น<br />
                หากเดินทางไปกับเอเจ้นท์รายอื่น โปรดเลือก <span className="font-semibold text-green-700">'Join รถคนอื่น'</span>
              </p>
            </div>

            <div className="space-y-4">
              {/* License Plate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลขทะเบียนรถ *
                </label>
                <input
                  type="text"
                  value={newCarpoolLicensePlate}
                  onChange={(e) => setNewCarpoolLicensePlate(e.target.value)}
                  placeholder="กท 1234"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Select Members */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลือกสมาชิกที่จะร่วมเดินทาง (จากการลงทะเบียนนี้)
                </label>
                <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {attendeeNames.map((name, index) => {
                    // Check if this member is already in a carpool
                    let isInCarpool = false;
                    let carpoolInfo = '';

                    memberCarpools.forEach(cp => {
                      const member = cp.members?.find((m: any) => {
                        // Use attendeeIndex for stable identification (if available)
                        if (m.attendeeIndex !== undefined && m.registrationId === userRegistration?.registrationId) {
                          return m.attendeeIndex === index;
                        }
                        // Fallback to name matching (for old data)
                        const cleanName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                        return cleanName === name || m.name === name;
                      });
                      if (member) {
                        isInCarpool = true;
                        if (cp.ownerRegistrationId === userRegistration?.registrationId) {
                          carpoolInfo = `อยู่ในรถของคุณแล้ว (${cp.licensePlate})`;
                        } else {
                          carpoolInfo = `ร่วมรถ ${cp.ownerCompanyName} แล้ว`;
                        }
                      }
                    });

                    return (
                      <label
                        key={index}
                        className={`flex items-center gap-2 py-2 rounded ${isInCarpool ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembersForCarpool.includes(index)}
                          disabled={isInCarpool}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMembersForCarpool([...selectedMembersForCarpool, index]);
                            } else {
                              setSelectedMembersForCarpool(selectedMembersForCarpool.filter(i => i !== index));
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-900 flex-1">
                          {name || `ผู้เข้าร่วมคนที่ ${index + 1}`}
                          {isInCarpool && (
                            <span className="text-xs text-orange-600 ml-2 italic">
                              ({carpoolInfo})
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    // Get indices of members who are NOT in any carpool
                    const availableIndices = attendeeNames
                      .map((name, index) => {
                        let isInCarpool = false;
                        memberCarpools.forEach(cp => {
                          const member = cp.members?.find((m: any) => {
                            // Use attendeeIndex for stable identification (if available)
                            if (m.attendeeIndex !== undefined && m.registrationId === userRegistration?.registrationId) {
                              return m.attendeeIndex === index;
                            }
                            // Fallback to name matching (for old data)
                            const cleanName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                            return cleanName === name || m.name === name;
                          });
                          if (member) {
                            isInCarpool = true;
                          }
                        });
                        return isInCarpool ? -1 : index;
                      })
                      .filter(i => i !== -1);

                    if (selectedMembersForCarpool.length === availableIndices.length && availableIndices.length > 0) {
                      setSelectedMembersForCarpool([]);
                    } else {
                      setSelectedMembersForCarpool(availableIndices);
                    }
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 mt-1"
                >
                  {(() => {
                    const availableCount = attendeeNames.filter((name, index) => {
                      let isInCarpool = false;
                      memberCarpools.forEach(cp => {
                        const member = cp.members?.find((m: any) => {
                          // Use attendeeIndex for stable identification (if available)
                          if (m.attendeeIndex !== undefined && m.registrationId === userRegistration?.registrationId) {
                            return m.attendeeIndex === index;
                          }
                          // Fallback to name matching (for old data)
                          const cleanName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                          return cleanName === name || m.name === name;
                        });
                        if (member) {
                          isInCarpool = true;
                        }
                      });
                      return !isInCarpool;
                    }).length;

                    return selectedMembersForCarpool.length === availableCount && availableCount > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด';
                  })()}
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateCarpoolModal(false);
                  setNewCarpoolLicensePlate('');
                  setSelectedMembersForCarpool([]);
                }}
                disabled={creatingCarpool}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCreateCarpool}
                disabled={creatingCarpool || !newCarpoolLicensePlate.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {creatingCarpool ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนรถยนต์'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Carpool Modal - Manage own team members */}
      {showManageCarpoolModal && memberCarpool && userRegistration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => {
            setShowManageCarpoolModal(false);
            setAllCarpools([]);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">จัดการสมาชิกในทีม</h3>
              <button
                onClick={() => {
                  setShowManageCarpoolModal(false);
                  setAllCarpools([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-gray-600 mb-4">
                เลือกสมาชิกจากทีมของคุณที่ต้องการเพิ่มเข้า Carpool หรือยกเลิกการ join รถคันอื่น
              </p>

              {(() => {
                // Parse attendee names
                let names: string[] = [];
                try {
                  const parsed = JSON.parse(userRegistration.attendeeNames || '[]');
                  names = Array.isArray(parsed) ? parsed : [];
                } catch {
                  names = userRegistration.attendeeNames?.split(',').map((n: string) => n.trim()).filter((n: string) => n) || [];
                }

                if (allCarpools.length === 0) {
                  fetchAllCarpools();
                }

                return (
                  <div className="space-y-3">
                    {names.map((name, index) => {
                      // Check if this member is in current carpool
                      // Use registrationId + attendeeIndex as unique identifier
                      const isInMyCarpool = memberCarpool.members?.some(
                        (m: any) => m.registrationId === userRegistration.registrationId && m.attendeeIndex === index
                      );

                      // Check if in another active carpool (exclude deleted/cancelled)
                      // Use registrationId + attendeeIndex as unique identifier
                      const otherCarpool = allCarpools.find((cp) =>
                        cp.carpoolId !== memberCarpool.carpoolId &&
                        cp.status !== 'deleted' && cp.status !== 'cancelled' &&
                        cp.members?.some((m: any) => m.registrationId === userRegistration.registrationId && m.attendeeIndex === index)
                      );

                      return (
                        <div
                          key={`${session?.user?.lineUserId}-${name}`}
                          className={`p-4 border rounded-lg ${
                            isInMyCarpool ? 'bg-blue-50 border-blue-300' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{name}</p>
                              {isInMyCarpool && (
                                <p className="text-xs text-blue-600 mt-1">✓ อยู่ในรถคันนี้แล้ว</p>
                              )}
                              {otherCarpool && (
                                <p className="text-xs text-orange-600 mt-1">
                                  ⚠️ อยู่ในรถคันอื่น ({otherCarpool.licensePlate})
                                </p>
                              )}
                            </div>

                            <div className="flex gap-2">
                              {!isInMyCarpool && !otherCarpool && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const response = await fetch(`/api/carpools/${memberCarpool.carpoolId}/add-members`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          members: [{
                                            registrationId: userRegistration.registrationId,
                                            lineUserId: session?.user?.lineUserId || '',
                                            name,
                                          }],
                                        }),
                                      });

                                      if (!response.ok) throw new Error('Failed to add member');

                                      toast.success(`เพิ่ม ${name} เข้า Carpool สำเร็จ`);
                                      await fetchMemberCarpool();
                                      await fetchAllCarpools();
                                    } catch (err) {
                                      toast.error('เกิดข้อผิดพลาดในการเพิ่มสมาชิก');
                                    }
                                  }}
                                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                >
                                  เพิ่มเข้ารถ
                                </button>
                              )}

                              {isInMyCarpool && (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`ต้องการย้ายออกจากทะเบียนรถนี้หรือไม่?`)) return;

                                    try {
                                      const response = await fetch(`/api/carpools/${memberCarpool.carpoolId}/remove-members`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          members: [{
                                            lineUserId: session?.user?.lineUserId || '',
                                            name,
                                          }],
                                        }),
                                      });

                                      if (!response.ok) throw new Error('Failed to remove member');

                                      toast.success(`ย้ายออกสำเร็จ`);
                                      await fetchMemberCarpool();
                                      await fetchAllCarpools();
                                    } catch (err) {
                                      toast.error('เกิดข้อผิดพลาดในการย้ายออก');
                                    }
                                  }}
                                  className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                >
                                  ย้ายออก
                                </button>
                              )}

                              {otherCarpool && (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`ต้องการยกเลิกการ join รถคัน ${otherCarpool.licensePlate} หรือไม่?`)) return;

                                    try {
                                      const response = await fetch(`/api/carpools/${otherCarpool.carpoolId}/remove-members`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          members: [{
                                            lineUserId: session?.user?.lineUserId || '',
                                            name,
                                          }],
                                        }),
                                      });

                                      if (!response.ok) throw new Error('Failed to leave carpool');

                                      toast.success(`ยกเลิกการ join รถคัน ${otherCarpool.licensePlate} สำเร็จ`);
                                      await fetchMemberCarpool();
                                      await fetchAllCarpools();
                                    } catch (err) {
                                      toast.error('เกิดข้อผิดพลาดในการยกเลิก');
                                    }
                                  }}
                                  className="text-xs px-3 py-1.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                                >
                                  ยกเลิก Join
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowManageCarpoolModal(false);
                  setAllCarpools([]);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Carpool Modal */}
      {showJoinCarpoolModal && userRegistration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">เข้าร่วมรถของคนอื่น</h3>
              <button
                onClick={() => {
                  setShowJoinCarpoolModal(false);
                  setJoinRegistrationId('');
                  setJoinSearchedCarpool(null);
                  setSelectedMembersToJoin([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Instructions */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>คำแนะนำ:</strong> หากต้องการเดินทางร่วมกับรถของคนอื่น กรุณาขอรหัสลงทะเบียนจากเจ้าของรถที่ต้องการเข้าร่วม
                </p>
              </div>

              {/* Search Registration ID */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รหัสลงทะเบียน
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinRegistrationId}
                    onChange={(e) => setJoinRegistrationId(e.target.value)}
                    placeholder="ใส่รหัสลงทะเบียน"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={async () => {
                      console.log('[Join Search] Button clicked');
                      console.log('[Join Search] eventId:', eventId);
                      console.log('[Join Search] joinRegistrationId:', joinRegistrationId);

                      if (!joinRegistrationId.trim()) {
                        toast.error('กรุณาระบุรหัสลงทะเบียน');
                        return;
                      }

                      setJoinSearchLoading(true);
                      setJoinSearchedCarpool(null);
                      try {
                        // Search for carpool by registration ID
                        // Note: eventId is already decoded from params, don't encode it again
                        const url = `/api/events/${eventId}/carpools/search?registrationId=${encodeURIComponent(joinRegistrationId)}`;
                        console.log('[Join Search] Fetching URL:', url);

                        const response = await fetch(url);
                        console.log('[Join Search] Response status:', response.status);

                        if (!response.ok) {
                          const errorData = await response.json();
                          console.error('[Join Search] Error response:', errorData);
                          throw new Error('Failed to search carpool');
                        }

                        const data = await response.json();
                        console.log('[Join Search] Response data:', data);
                        console.log('[Join Search] Carpool members:', data.carpool?.members);
                        console.log('[Join Search] Members length:', data.carpool?.members?.length);

                        if (!data.carpool) {
                          toast.error(`รหัสลงทะเบียน "${joinRegistrationId}" ยังไม่ได้ลงทะเบียนรถยนต์ กรุณาติดต่อเจ้าของรหัสลงทะเบียนนี้เพื่อให้ลงทะเบียนรถยนต์ก่อน`);
                        } else {
                          setJoinSearchedCarpool(data.carpool);
                          toast.success('พบทะเบียนรถแล้ว!');
                        }
                      } catch (err) {
                        console.error('[Join Search] Error searching carpool:', err);
                        toast.error('เกิดข้อผิดพลาดในการค้นหาทะเบียนรถ');
                      } finally {
                        setJoinSearchLoading(false);
                      }
                    }}
                    disabled={joinSearchLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {joinSearchLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
                  </button>
                </div>
              </div>

              {/* Search Results */}
              {joinSearchedCarpool && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">ข้อมูลรถ Carpool</h4>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm font-semibold text-green-900 mb-2">
                      🚗 {joinSearchedCarpool.licensePlate}
                    </p>
                    <p className="text-xs text-green-700">
                      เจ้าของ: {joinSearchedCarpool.ownerCompanyName || 'N/A'}
                    </p>
                    <p className="text-xs text-green-700">
                      จำนวนสมาชิก: {joinSearchedCarpool.members?.length || 0} คน
                    </p>
                  </div>

                  {/* Select Team Members to Join */}
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">เลือกสมาชิกที่ต้องการเข้าร่วม</h4>
                    {(() => {
                      // Parse attendee names
                      let names: string[] = [];
                      try {
                        const parsed = JSON.parse(userRegistration.attendeeNames || '[]');
                        names = Array.isArray(parsed) ? parsed : [];
                      } catch {
                        names = userRegistration.attendeeNames?.split(',').map((n: string) => n.trim()).filter((n: string) => n) || [];
                      }

                      // Get all carpools to check if members are already in other carpools
                      return (
                        <div className="space-y-2">
                          {names.map((name, index) => {
                            // Check if this person is already in any active carpool (exclude deleted/cancelled)
                            // Use registrationId + attendeeIndex as unique identifier (NOT lineUserId + name)
                            let isInCarpool = false;

                            // Check in memberCarpool (own carpool)
                            if (memberCarpool && memberCarpool.status !== 'deleted' && memberCarpool.status !== 'cancelled') {
                              isInCarpool = memberCarpool.members?.some((m: any) =>
                                m.registrationId === userRegistration?.registrationId && m.attendeeIndex === index
                              ) || false;
                            }

                            // If not found in memberCarpool, check in allCarpools (other carpools)
                            if (!isInCarpool) {
                              isInCarpool = allCarpools.some(cp =>
                                cp.status !== 'deleted' && cp.status !== 'cancelled' &&
                                cp.members?.some((m: any) =>
                                  m.registrationId === userRegistration?.registrationId && m.attendeeIndex === index
                                )
                              );
                            }

                            return (
                              <label
                                key={index}
                                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                                  isInCarpool
                                    ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                                    : selectedMembersToJoin.includes(index)
                                    ? 'bg-blue-50 border-blue-500'
                                    : 'bg-white border-gray-200 hover:border-blue-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedMembersToJoin.includes(index)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedMembersToJoin([...selectedMembersToJoin, index]);
                                    } else {
                                      setSelectedMembersToJoin(selectedMembersToJoin.filter(i => i !== index));
                                    }
                                  }}
                                  disabled={isInCarpool}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className={`text-sm ${isInCarpool ? 'text-gray-400' : 'text-gray-900'}`}>
                                  {name}
                                </span>
                                {isInCarpool && (
                                  <span className="ml-auto text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">
                                    joined Carpool แล้ว
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {joinSearchedCarpool && (
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setShowJoinCarpoolModal(false);
                    setJoinRegistrationId('');
                    setJoinSearchedCarpool(null);
                    setSelectedMembersToJoin([]);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={async () => {
                    if (selectedMembersToJoin.length === 0) {
                      toast.error('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
                      return;
                    }

                    setJoining(true);
                    try {
                      // Parse attendee names
                      let names: string[] = [];
                      try {
                        const parsed = JSON.parse(userRegistration.attendeeNames || '[]');
                        names = Array.isArray(parsed) ? parsed : [];
                      } catch {
                        names = userRegistration.attendeeNames?.split(',').map((n: string) => n.trim()).filter((n: string) => n) || [];
                      }

                      // Build members array
                      const membersToAdd = selectedMembersToJoin.map(index => ({
                        registrationId: userRegistration.registrationId,
                        lineUserId: session?.user?.lineUserId || '',
                        name: names[index] || '',
                        attendeeIndex: index,  // Store index as stable identifier
                      }));

                      const response = await fetch(`/api/carpools/${joinSearchedCarpool.carpoolId}/add-members`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ members: membersToAdd }),
                      });

                      if (!response.ok) {
                        throw new Error('Failed to join carpool');
                      }

                      toast.success('เข้าร่วม Carpool สำเร็จ!');
                      setShowJoinCarpoolModal(false);
                      setJoinRegistrationId('');
                      setJoinSearchedCarpool(null);
                      setSelectedMembersToJoin([]);

                      // Refresh data
                      await fetchMemberCarpool();
                      await fetchAllCarpools();
                    } catch (err) {
                      console.error('Error joining carpool:', err);
                      toast.error('เกิดข้อผิดพลาดในการเข้าร่วม Carpool');
                    } finally {
                      setJoining(false);
                    }
                  }}
                  disabled={joining || selectedMembersToJoin.length === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {joining ? 'กำลังเข้าร่วม...' : 'เข้าร่วม Carpool'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Join Own Carpool Modal */}
      {showJoinOwnCarpoolModal && userRegistration && memberCarpools.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">เข้าร่วม Carpool ของฉัน</h3>
              <button
                onClick={() => {
                  setShowJoinOwnCarpoolModal(false);
                  setSelectedCarpoolToJoin(null);
                  setSelectedMembersForOwnCarpool([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Instructions */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>คำแนะนำ:</strong> เลือก Carpool ที่คุณต้องการเข้าร่วม และเลือกสมาชิกที่ยังไม่ได้เข้าร่วม
                </p>
              </div>

              {/* Select Carpool */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">เลือก Carpool</h4>
                <div className="space-y-2">
                  {memberCarpools.map((carpool) => (
                    <label
                      key={carpool.carpoolId}
                      className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedCarpoolToJoin === carpool.carpoolId
                          ? 'bg-blue-50 border-blue-500'
                          : 'bg-white border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carpool"
                        checked={selectedCarpoolToJoin === carpool.carpoolId}
                        onChange={() => {
                          setSelectedCarpoolToJoin(carpool.carpoolId);
                          setSelectedMembersForOwnCarpool([]);
                        }}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          🚗 {carpool.licensePlate}
                        </p>
                        <p className="text-xs text-gray-600">
                          สมาชิก: {carpool.members?.length || 0} คน
                        </p>
                        {carpool.members && carpool.members.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            {carpool.members.map((m: any) => m.name).join(', ')}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Select Members to Join */}
              {selectedCarpoolToJoin && (() => {
                // Parse attendee names
                let names: string[] = [];
                try {
                  const parsed = JSON.parse(userRegistration.attendeeNames || '[]');
                  names = Array.isArray(parsed) ? parsed : [];
                } catch {
                  names = userRegistration.attendeeNames?.split(',').map((n: string) => n.trim()).filter((n: string) => n) || [];
                }

                // Get selected carpool
                const selectedCarpool = memberCarpools.find(cp => cp.carpoolId === selectedCarpoolToJoin);

                // Filter out members already in the selected carpool
                const availableMembers = names.map((name, index) => {
                  // Use attendeeIndex for stable identification
                  const isInCarpool = selectedCarpool?.members?.some((m: any) => {
                    // Use attendeeIndex for stable identification (if available)
                    if (m.attendeeIndex !== undefined && m.registrationId === userRegistration.registrationId) {
                      return m.attendeeIndex === index;
                    }
                    // Fallback to name matching (for old data)
                    const cleanName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                    return cleanName === name || m.name === name;
                  }) || false;

                  return { name, index, isInCarpool };
                }).filter(member => !member.isInCarpool);

                if (availableMembers.length === 0) {
                  return (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        สมาชิกทุกคนในรหัสลงทะเบียนของคุณอยู่ใน Carpool นี้แล้ว
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">เลือกสมาชิกที่ต้องการเข้าร่วม</h4>
                    <div className="space-y-2">
                      {availableMembers.map(({ name, index }) => (
                        <label
                          key={index}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            selectedMembersForOwnCarpool.includes(index)
                              ? 'bg-blue-50 border-blue-500'
                              : 'bg-white border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedMembersForOwnCarpool.includes(index)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMembersForOwnCarpool([...selectedMembersForOwnCarpool, index]);
                              } else {
                                setSelectedMembersForOwnCarpool(selectedMembersForOwnCarpool.filter(i => i !== index));
                              }
                            }}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-900">{name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            {selectedCarpoolToJoin && (
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setShowJoinOwnCarpoolModal(false);
                    setSelectedCarpoolToJoin(null);
                    setSelectedMembersForOwnCarpool([]);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={async () => {
                    if (selectedMembersForOwnCarpool.length === 0) {
                      toast.error('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
                      return;
                    }

                    setJoining(true);
                    try {
                      // Parse attendee names
                      let names: string[] = [];
                      try {
                        const parsed = JSON.parse(userRegistration.attendeeNames || '[]');
                        names = Array.isArray(parsed) ? parsed : [];
                      } catch {
                        names = userRegistration.attendeeNames?.split(',').map((n: string) => n.trim()).filter((n: string) => n) || [];
                      }

                      // Build members array
                      const membersToAdd = selectedMembersForOwnCarpool.map(index => ({
                        registrationId: userRegistration.registrationId,
                        lineUserId: session?.user?.lineUserId || '',
                        name: names[index] || '',
                        attendeeIndex: index,
                      }));

                      const response = await fetch(`/api/carpools/${selectedCarpoolToJoin}/add-members`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ members: membersToAdd }),
                      });

                      if (!response.ok) {
                        throw new Error('Failed to join carpool');
                      }

                      toast.success('เข้าร่วม Carpool สำเร็จ!');
                      setShowJoinOwnCarpoolModal(false);
                      setSelectedCarpoolToJoin(null);
                      setSelectedMembersForOwnCarpool([]);

                      // Refresh data
                      await fetchMemberCarpool();
                      await fetchAllCarpools();
                    } catch (err) {
                      console.error('Error joining carpool:', err);
                      toast.error('เกิดข้อผิดพลาดในการเข้าร่วม Carpool');
                    } finally {
                      setJoining(false);
                    }
                  }}
                  disabled={joining || selectedMembersForOwnCarpool.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {joining ? 'กำลังเข้าร่วม...' : 'เข้าร่วม Carpool'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Carpool Confirmation Modal */}
      {showDeleteCarpoolConfirmModal && pendingMemberRemoval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">ยืนยันการลบ Carpool</h3>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-700 mb-3">
                  <strong>"{pendingMemberRemoval.name}"</strong> เป็นสมาชิกคนสุดท้ายในรถคันนี้
                </p>
                <p className="text-sm text-gray-600">
                  Carpool จะต้องมีสมาชิกในรถอย่างน้อย 1 คน หากต้องการลบสมาชิกคนนี้ออกจากรถ
                  <strong className="text-red-600"> Carpool ทั้งคันจะถูกลบด้วย</strong>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteCarpoolConfirmModal(false);
                    setPendingMemberRemoval(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirmDeleteCarpool}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  ยืนยันลบ Carpool
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Members Modal */}
      {showInviteModal && invitingToCarpoolId && (() => {
        // Find the carpool we're inviting to
        const currentCarpool = memberCarpools.find(cp => cp.carpoolId === invitingToCarpoolId);
        const carpoolLicensePlate = currentCarpool?.licensePlate || '';

        return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-bold text-gray-900">ชวนเพื่อนไปด้วยกัน</h3>
                {carpoolLicensePlate && (
                  <p className="text-sm text-gray-600 mt-1">ทะเบียนรถยนต์: <span className="font-semibold text-blue-700">{carpoolLicensePlate}</span></p>
                )}
              </div>
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInvitingToCarpoolId(null);
                  setSearchRegistrationId('');
                  setSearchedRegistration(null);
                  setSelectedMembersToInvite([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Section 1: Team Members Not In Carpool */}
              {(() => {
                // Filter team members not in any carpool (use allCarpools to check all carpools in event)
                // Track both name and original index for fallback display
                const membersNotInCarpool = attendeeNames
                  .map((name, originalIndex) => ({ name, originalIndex }))
                  .filter(({ name, originalIndex }) => {
                    let isInCarpool = false;
                    allCarpools.forEach(cp => {
                      const member = cp.members?.find((m: any) => {
                        // Skip if not from same registration
                        if (m.registrationId !== userRegistration?.registrationId) {
                          return false;
                        }

                        // Check by attendeeIndex (stable identifier) - exclude -1 (manually added)
                        if (m.attendeeIndex !== undefined && m.attendeeIndex !== -1) {
                          return m.attendeeIndex === originalIndex;
                        }

                        // Fallback: check by name matching (normalize whitespace)
                        const normalizeName = (n: string) => n.replace(/\s+/g, ' ').trim();
                        const cleanMemberName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                        return normalizeName(cleanMemberName) === normalizeName(name) ||
                               normalizeName(m.name) === normalizeName(name);
                      });
                      if (member) isInCarpool = true;
                    });
                    return !isInCarpool;
                  });

                if (membersNotInCarpool.length === 0) return null;

                return (
                  <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                    <h4 className="font-semibold text-green-900 mb-3">
                      ยังมีสมาชิกในทีม {membersNotInCarpool.length} ท่าน ที่ยังไม่ได้ join รถไปกับใคร
                    </h4>
                    <div className="space-y-2 mb-4">
                      {membersNotInCarpool.map(({ name, originalIndex }, index) => {
                        const isSelected = selectedMembersToInvite.some(m => m.name === name && m.originalIndex === originalIndex);
                        // Display fallback if name is empty
                        const displayName = name && name.trim() ? name : `ผู้เข้าร่วมคนที่ ${originalIndex + 1}`;
                        return (
                          <label
                            key={index}
                            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                              isSelected
                                ? 'border-green-500 bg-green-100'
                                : 'border-green-200 hover:bg-green-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedMembersToInvite([...selectedMembersToInvite, { name, originalIndex }]);
                                } else {
                                  setSelectedMembersToInvite(selectedMembersToInvite.filter(m => !(m.name === name && m.originalIndex === originalIndex)));
                                }
                              }}
                              className="rounded"
                            />
                            <span className="flex-1 text-sm font-medium text-gray-900">
                              {displayName}
                              {!name || !name.trim() ? <span className="text-xs text-gray-500 ml-2">(ยังไม่ได้ระบุชื่อ)</span> : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {selectedMembersToInvite.length > 0 && (
                      <button
                        onClick={handleInviteMembers}
                        disabled={inviting}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
                      >
                        {inviting ? 'กำลังเพิ่ม...' : `เพิ่มเพื่อนไปรถคันนี้ (${selectedMembersToInvite.length} คน)`}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Section 2: Invite Friends from Other Agents */}
              <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-3">ชวนเพื่อนจากเอเจ้นท์อื่น</h4>

                <div className="mb-4 p-3 bg-white border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="text-xs text-blue-800">
                      <p className="font-semibold mb-1">วิธีชวน:</p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-1">
                        <li>ขอรหัสการลงทะเบียน 6 หลัก (เช่น ABC123)</li>
                        <li>กดค้นหา เลือกสมาชิก และกดยืนยัน</li>
                      </ol>
                    </div>
                  </div>
                </div>

              {/* Search Registration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ค้นหารหัสลงทะเบียน
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchRegistrationId}
                    onChange={(e) => setSearchRegistrationId(e.target.value)}
                    placeholder="ระบุรหัสลงทะเบียน 6 หลัก เช่น ABC123"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchRegistration();
                      }
                    }}
                  />
                  <button
                    onClick={handleSearchRegistration}
                    disabled={searchLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {searchLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
                  </button>
                </div>
              </div>

              {/* Search Results */}
              {searchedRegistration && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 mb-2">ข้อมูลการลงทะเบียน</h4>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p><strong>บริษัท:</strong> {searchedRegistration.companyName}</p>
                      <p><strong>ผู้ติดต่อ:</strong> {searchedRegistration.contactName}</p>
                      <p><strong>รหัสลงทะเบียน:</strong> {searchedRegistration.registrationId}</p>
                      <p><strong>จำนวนผู้เข้าร่วม:</strong> {searchedRegistration.attendeeCount} คน</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">เลือกสมาชิกที่ต้องการชวน</h4>
                    <div className="space-y-2">
                      {searchedRegistration.attendeeNames ? (
                        searchedRegistration.attendeeNames.split(',').map((name: string, index: number) => {
                          const trimmedName = name.trim();

                          // Clean member name - remove JSON formatting if present
                          let displayName = trimmedName;
                          try {
                            const parsed = JSON.parse(trimmedName);
                            displayName = Array.isArray(parsed) ? parsed[0] : parsed;
                          } catch {
                            displayName = trimmedName.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                          }

                          // Helper function to clean member name for comparison
                          const cleanMemberName = (name: string) => {
                            try {
                              const parsed = JSON.parse(name);
                              return Array.isArray(parsed) ? parsed[0] : parsed;
                            } catch {
                              return name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                            }
                          };

                          // Find the carpool we're inviting to
                          const targetCarpool = allCarpools.find(cp => cp.carpoolId === invitingToCarpoolId);

                          console.log('Debug validation:', {
                            displayName,
                            invitingToCarpoolId,
                            targetCarpoolFound: !!targetCarpool,
                            targetCarpoolMembers: targetCarpool?.members,
                            allCarpoolsCount: allCarpools.length,
                            searchedRegistrationId: searchedRegistration.registrationId
                          });

                          // Check if already in the carpool we're inviting to
                          const isInCurrentCarpool = targetCarpool?.members?.some((m: any) => {
                            const cleanedMemberName = cleanMemberName(m.name);
                            return cleanedMemberName === displayName && m.registrationId === searchedRegistration.registrationId;
                          });

                          // Check if already in any other active carpool (exclude deleted/cancelled)
                          // Match by registrationId + name (since members from different registrations have different lineUserIds)
                          const isInOtherCarpool = !isInCurrentCarpool && allCarpools.some(cp =>
                            cp.carpoolId !== invitingToCarpoolId &&
                            cp.status !== 'deleted' && cp.status !== 'cancelled' &&
                            cp.members?.some((m: any) => {
                              const cleanedMemberName = cleanMemberName(m.name);
                              return m.registrationId === searchedRegistration.registrationId && cleanedMemberName === displayName;
                            })
                          );
                          const isInCarpool = isInCurrentCarpool || isInOtherCarpool;

                          console.log('Validation result:', {
                            displayName,
                            isInCurrentCarpool,
                            isInOtherCarpool,
                            isInCarpool
                          });
                          const isSelected = selectedMembersToInvite.some(m => m.name === displayName && m.originalIndex === index);

                          return (
                            <label
                              key={index}
                              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                                isInCarpool
                                  ? 'bg-gray-100 border-gray-300 cursor-not-allowed'
                                  : isSelected
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isInCarpool}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedMembersToInvite([...selectedMembersToInvite, { name: displayName, originalIndex: index }]);
                                  } else {
                                    setSelectedMembersToInvite(selectedMembersToInvite.filter(m => !(m.name === displayName && m.originalIndex === index)));
                                  }
                                }}
                                className="rounded"
                              />
                              <span className={`flex-1 text-sm ${isInCarpool ? 'text-gray-400' : 'text-gray-900'}`}>
                                {displayName}
                              </span>
                              {isInCarpool && (
                                <span className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded">
                                  {isInCurrentCarpool ? 'joined รถแล้ว' : 'joined คันอื่นแล้ว'}
                                </span>
                              )}
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">ไม่มีรายชื่อผู้เข้าร่วม</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>

            {searchedRegistration && (
              <div className="flex gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowInviteModal(false);
                    setInvitingToCarpoolId(null);
                    setSearchRegistrationId('');
                    setSearchedRegistration(null);
                    setSelectedMembersToInvite([]);
                  }}
                  disabled={inviting}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleInviteMembers}
                  disabled={inviting || selectedMembersToInvite.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {inviting ? 'กำลังชวน...' : `ชวน ${selectedMembersToInvite.length} คน`}
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {/* Toast notifications */}
      <Toast toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  );
}
