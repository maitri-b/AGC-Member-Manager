'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { AttendeeType, RoomType, PriceTier } from '@/types/event';
import { formatEventDateRange } from '@/lib/date-utils';

interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrCodeUrl?: string;
  isActive: boolean;
  isDefault: boolean;
}

interface Event {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  eventEndDate?: string;
  location: string;
  description: string;
  sheetName?: string;  // DEPRECATED - optional for backward compatibility
  bankAccountId?: string;  // NEW - preferred method
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
  // Attendee type pricing (New)
  useAttendeeTypePricing?: boolean;
  attendeeTypes?: AttendeeType[];
  roomTypes?: RoomType[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

interface EventSummary {
  eventId: string;
  totalRegistrations: number;
  agentRegistrations: number;    // Unique companies (by license)
  confirmedCount: number;         // Unique confirmed companies
  totalAttendees: number;         // Total people (sum of attendeeCount)
  clubMemberCount: number;
  verifiedMemberCount: number;
}

interface EventFormData {
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  eventEndDate: string;
  location: string;
  description: string;
  sheetName: string;  // DEPRECATED - kept for backward compatibility but hidden in UI
  bankAccountId: string;  // NEW - preferred method
  year: number;
  isActive: boolean;
  isPublished: boolean;
  countsAttendance: boolean;
  maxCapacity: number;
  maxPerCompany: number;
  registrationFee: number;
  pricingType: 'fixed' | 'tiered';
  baseFee: number;
  additionalFeePerPerson: number;
  memberDiscount: number;
  registrationOpen: boolean;
  documentName: string;
  documentUrl: string;
  mainImageUrl: string;
  paymentBankName: string;
  paymentAccountName: string;
  paymentAccountNumber: string;
  paymentQrCodeUrl: string;
  paymentTerms: string;
  paymentSlipSubmissionUrl: string;
  paymentSlipButtonText: string;
  paymentInstructionText: string;
  useExternalPaymentLink: boolean;
  // Payment configuration (New)
  paymentTiming: 'deferred' | 'immediate';
  paymentMode: 'full' | 'deposit';
  // Full payment deadline (for paymentMode = 'full')
  paymentDeadlineType: 'none' | 'fixed' | 'hours';
  paymentDeadlineFixed: string;
  paymentDeadlineHours: number;
  // Deposit payment configuration (for paymentMode = 'deposit')
  depositAmount: number;
  depositPercentage: number;
  useDepositPercentage: boolean;
  depositDeadlineType: 'none' | 'fixed' | 'hours';
  depositDeadlineFixed: string;
  depositDeadlineHours: number;
  remainingDeadlineType: 'none' | 'fixed' | 'hours';
  remainingDeadlineFixed: string;
  remainingDeadlineHours: number;
  // Registration edit control
  allowMemberEdit: boolean;
  requireAttendeeNames: boolean;
  // LINE notification control
  sendLineNotification: boolean;
  // Attendee type pricing (New)
  useAttendeeTypePricing: boolean;
  attendeeTypes: AttendeeType[];
  // Room allocation (New)
  roomTypes: RoomType[];
}

const initialFormData: EventFormData = {
  eventName: '',
  eventNameEN: '',
  eventDate: '',
  eventEndDate: '',
  location: '',
  description: '',
  sheetName: '',  // DEPRECATED - empty by default
  bankAccountId: '',  // NEW - will be populated from bank account dropdown
  year: new Date().getFullYear() + 543,
  isActive: true,
  isPublished: false,
  countsAttendance: true,
  maxCapacity: 0,
  maxPerCompany: 0,
  registrationFee: 0,
  pricingType: 'fixed',
  baseFee: 0,
  additionalFeePerPerson: 0,
  memberDiscount: 0,
  registrationOpen: false,
  documentName: '',
  documentUrl: '',
  mainImageUrl: '',
  paymentBankName: '',
  paymentAccountName: '',
  paymentAccountNumber: '',
  paymentQrCodeUrl: '',
  paymentTerms: '',
  paymentSlipSubmissionUrl: '',
  paymentSlipButtonText: '',
  paymentInstructionText: '',
  useExternalPaymentLink: false,
  // Payment configuration (New)
  paymentTiming: 'deferred',
  paymentMode: 'full',
  // Full payment deadline (for paymentMode = 'full')
  paymentDeadlineType: 'none',
  paymentDeadlineFixed: '',
  paymentDeadlineHours: 0,
  // Deposit payment configuration (for paymentMode = 'deposit')
  depositAmount: 0,
  depositPercentage: 30,
  useDepositPercentage: false,
  depositDeadlineType: 'none',
  depositDeadlineFixed: '',
  depositDeadlineHours: 0,
  remainingDeadlineType: 'none',
  remainingDeadlineFixed: '',
  remainingDeadlineHours: 0,
  // Registration edit control
  allowMemberEdit: true,
  requireAttendeeNames: true,
  // LINE notification control
  sendLineNotification: true, // Default: checked (send notifications)
  // Attendee type pricing (New)
  useAttendeeTypePricing: false,
  attendeeTypes: [],
  // Room allocation (New)
  roomTypes: [
    {
      typeId: 'single',
      typeName: 'พักเดี่ยว',
      capacity: 1,
      price: 0,
      note: '',
      isActive: true,
      sortOrder: 0
    },
    {
      typeId: 'single-pair',
      typeName: 'มาเดี่ยว-รอจับคู่',
      capacity: 1,
      price: 0,
      note: 'กรุณาระบุชื่อคู่ที่ท่านต้องการพักด้วยในช่องความต้องการพิเศษ กรณีที่ให้ทีมงานจัดคู่ให้ขอสงวนสิทธิ์คิดค่าพักเดี่ยวกรณีที่ไม่สามารถจัดคู่ให้ได้',
      isActive: true,
      sortOrder: 1
    },
    {
      typeId: 'twin',
      typeName: 'พักคู่ Twin',
      capacity: 2,
      price: 0,
      note: '',
      isActive: true,
      sortOrder: 2
    },
    {
      typeId: 'double',
      typeName: 'พักคู่ Double',
      capacity: 2,
      price: 0,
      note: '',
      isActive: true,
      sortOrder: 3
    },
    {
      typeId: 'triple',
      typeName: 'พัก 3 คน',
      capacity: 3,
      price: 0,
      note: '',
      isActive: true,
      sortOrder: 4
    }
  ],
};

export default function AdminEventsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [summaries, setSummaries] = useState<Map<string, EventSummary>>(new Map());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'created' | 'eventDate'>('created'); // Sort by created (default) or event date

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [formData, setFormData] = useState<EventFormData>(initialFormData);

  // Price Tiers state (for new multi-tier pricing)
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([
    { upToCount: 2, price: 0, priceType: 'total' },
    { upToCount: 999, price: 0, priceType: 'per_person' }
  ]);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  // Dropdown menu state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Deadline update modal state
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [deadlineChangeType, setDeadlineChangeType] = useState<'full' | 'deposit' | 'remaining' | null>(null);
  const [applyToExisting, setApplyToExisting] = useState<'new_only' | 'all'>('new_only');
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState(0);
  const [originalDeadlines, setOriginalDeadlines] = useState<{
    paymentDeadlineType: string;
    paymentDeadlineFixed: string;
    paymentDeadlineHours: number;
    depositDeadlineType: string;
    depositDeadlineFixed: string;
    depositDeadlineHours: number;
    remainingDeadlineType: string;
    remainingDeadlineFixed: string;
    remainingDeadlineHours: number;
  } | null>(null);

  // Lightbox state for viewing full-size images
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (openDropdown && !target.closest('.dropdown-container')) {
        setOpenDropdown(null);
      }
    };

    if (openDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openDropdown]);

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

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    fetchEvents();
    fetchSummaries();
    fetchBankAccounts();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/admin/events');
      if (response.ok) {
        const data = await response.json();
        let allEvents = data.events || [];

        // Filter for event-staff and event-co - show only assigned events
        if (session?.user?.role === 'event-staff' || session?.user?.role === 'event-co') {
          const assignedIds = session.user.assignedEventIds || [];
          allEvents = allEvents.filter((e: Event) => assignedIds.includes(e.eventId));
        }

        setEvents(allEvents);
      } else {
        setError('ไม่สามารถโหลดข้อมูลกิจกรรมได้');
      }
    } catch (err) {
      console.error('Error fetching events:', err);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const fetchBankAccounts = async () => {
    setLoadingBankAccounts(true);
    try {
      const response = await fetch('/api/admin/bank-accounts');
      if (response.ok) {
        const data = await response.json();
        setBankAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error('Error fetching bank accounts:', err);
    } finally {
      setLoadingBankAccounts(false);
    }
  };

  const fetchSummaries = async () => {
    setLoadingSummaries(true);
    try {
      const response = await fetch('/api/admin/events/summary');
      if (response.ok) {
        const data = await response.json();
        const summaryMap = new Map<string, EventSummary>();
        (data.summaries || []).forEach((s: EventSummary) => {
          summaryMap.set(s.eventId, s);
        });
        setSummaries(summaryMap);
      }
    } catch (err) {
      console.error('Error fetching summaries:', err);
    } finally {
      setLoadingSummaries(false);
    }
  };

  const fetchPendingRegistrationsCount = async (eventId: string) => {
    try {
      const response = await fetch(`/api/admin/events/${eventId}/pending-count`);
      if (response.ok) {
        const data = await response.json();
        setPendingRegistrationsCount(data.count || 0);
      }
    } catch (err) {
      console.error('Error fetching pending registrations count:', err);
      setPendingRegistrationsCount(0);
    }
  };

  // Update deadlines for existing pending registrations
  const updateExistingDeadlines = async () => {
    if (!editingEvent || !deadlineChangeType) return;

    try {
      const response = await fetch(`/api/admin/events/${editingEvent.eventId}/update-deadlines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deadlineType: deadlineChangeType,
          paymentDeadlineType: formData.paymentDeadlineType,
          paymentDeadlineFixed: formData.paymentDeadlineFixed,
          paymentDeadlineHours: formData.paymentDeadlineHours,
          depositDeadlineType: formData.depositDeadlineType,
          depositDeadlineFixed: formData.depositDeadlineFixed,
          depositDeadlineHours: formData.depositDeadlineHours,
          remainingDeadlineType: formData.remainingDeadlineType,
          remainingDeadlineFixed: formData.remainingDeadlineFixed,
          remainingDeadlineHours: formData.remainingDeadlineHours,
        }),
      });

      if (!response.ok) {
        console.error('Failed to update existing deadlines');
      } else {
        const data = await response.json();
        console.log(`Updated ${data.updatedCount} pending registration(s)`);
      }
    } catch (err) {
      console.error('Error updating existing deadlines:', err);
    }
  };

  const handleOpenModal = (event?: Event) => {
    if (event) {
      setEditingEvent(event);
      setFormData({
        eventName: event.eventName,
        eventNameEN: event.eventNameEN,
        eventDate: event.eventDate,
        eventEndDate: event.eventEndDate ?? '',
        location: event.location,
        description: event.description,
        sheetName: event.sheetName ?? '',  // DEPRECATED - optional
        bankAccountId: event.bankAccountId ?? '',  // NEW - preferred method
        year: event.year,
        isActive: event.isActive,
        isPublished: event.isPublished ?? false,
        countsAttendance: event.countsAttendance ?? true,
        maxCapacity: event.maxCapacity ?? 0,
        maxPerCompany: event.maxPerCompany ?? 0,
        registrationFee: event.registrationFee ?? 0,
        pricingType: event.pricingType ?? 'fixed',
        baseFee: event.baseFee ?? 0,
        additionalFeePerPerson: event.additionalFeePerPerson ?? 0,
        memberDiscount: event.memberDiscount ?? 0,
        registrationOpen: event.registrationOpen ?? false,
        documentName: event.documentName ?? '',
        documentUrl: event.documentUrl ?? '',
        mainImageUrl: event.mainImageUrl ?? '',
        paymentBankName: event.paymentBankName ?? '',
        paymentAccountName: event.paymentAccountName ?? '',
        paymentAccountNumber: event.paymentAccountNumber ?? '',
        paymentQrCodeUrl: event.paymentQrCodeUrl ?? '',
        paymentTerms: event.paymentTerms ?? '',
        paymentSlipSubmissionUrl: (event as any).paymentSlipSubmissionUrl ?? '',
        paymentSlipButtonText: (event as any).paymentSlipButtonText ?? '',
        paymentInstructionText: (event as any).paymentInstructionText ?? '',
        useExternalPaymentLink: (event as any).useExternalPaymentLink ?? false,
        // Payment configuration (New)
        paymentTiming: (event as any).paymentTiming ?? 'deferred',
        paymentMode: event.paymentMode ?? 'full',
        // Full payment deadline (for paymentMode = 'full')
        paymentDeadlineType: (event as any).paymentDeadlineType ?? 'none',
        paymentDeadlineFixed: (event as any).paymentDeadlineFixed ?? '',
        paymentDeadlineHours: (event as any).paymentDeadlineHours ?? 0,
        // Deposit payment configuration (for paymentMode = 'deposit')
        depositAmount: event.depositAmount ?? 0,
        depositPercentage: event.depositPercentage ?? 30,
        useDepositPercentage: event.useDepositPercentage ?? false,
        depositDeadlineType: event.depositDeadlineType ?? 'none',
        depositDeadlineFixed: event.depositDeadlineFixed ?? '',
        depositDeadlineHours: event.depositDeadlineHours ?? 0,
        remainingDeadlineType: event.remainingDeadlineType ?? 'none',
        remainingDeadlineFixed: event.remainingDeadlineFixed ?? '',
        remainingDeadlineHours: event.remainingDeadlineHours ?? 0,
        // Registration edit control
        allowMemberEdit: (event as any).allowMemberEdit !== false,
        requireAttendeeNames: (event as any).requireAttendeeNames ?? true,
        // LINE notification control
        sendLineNotification: (event as any).sendLineNotification ?? true, // Default: true if not set
        // Attendee type pricing (New)
        useAttendeeTypePricing: (event as any).useAttendeeTypePricing ?? false,
        attendeeTypes: (event as any).attendeeTypes ?? [],
        // Room allocation (New)
        roomTypes: (event as any).roomTypes ?? [],
      });

      // Load price tiers if available, otherwise initialize defaults
      if (event.priceTiers && event.priceTiers.length > 0) {
        setPriceTiers(event.priceTiers);
      } else {
        // Initialize default tiers
        setPriceTiers([
          { upToCount: 2, price: 0, priceType: 'total' },
          { upToCount: 999, price: 0, priceType: 'per_person' }
        ]);
      }

      // ✅ Store original deadlines for comparison (Edit mode only)
      setOriginalDeadlines({
        paymentDeadlineType: (event as any).paymentDeadlineType ?? 'none',
        paymentDeadlineFixed: (event as any).paymentDeadlineFixed ?? '',
        paymentDeadlineHours: (event as any).paymentDeadlineHours ?? 0,
        depositDeadlineType: event.depositDeadlineType ?? 'none',
        depositDeadlineFixed: event.depositDeadlineFixed ?? '',
        depositDeadlineHours: event.depositDeadlineHours ?? 0,
        remainingDeadlineType: event.remainingDeadlineType ?? 'none',
        remainingDeadlineFixed: event.remainingDeadlineFixed ?? '',
        remainingDeadlineHours: event.remainingDeadlineHours ?? 0,
      });

      // ✅ Fetch pending registrations count for this event
      fetchPendingRegistrationsCount(event.eventId);
    } else {
      setEditingEvent(null);
      setFormData(initialFormData);
      setOriginalDeadlines(null); // Reset for new event
      setPendingRegistrationsCount(0);
      // Reset to default price tiers for new event
      setPriceTiers([
        { upToCount: 2, price: 0, priceType: 'total' },
        { upToCount: 999, price: 0, priceType: 'per_person' }
      ]);
    }
    setShowModal(true);
    setError(null);
    setSuccess(null);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingEvent(null);
    setFormData(initialFormData);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Check if editing event and deadline changed
    if (editingEvent && originalDeadlines && pendingRegistrationsCount > 0) {
      const hasDeadlineChange = checkDeadlineChanges();
      if (hasDeadlineChange) {
        // Show modal instead of submitting directly
        return;
      }
    }

    // Proceed with normal submission
    await submitEventData();
  };

  // Helper function to check if deadlines changed
  const checkDeadlineChanges = (): boolean => {
    if (!originalDeadlines) return false;

    // Check Full Payment deadline
    if (formData.paymentMode === 'full') {
      if (
        formData.paymentDeadlineType !== originalDeadlines.paymentDeadlineType ||
        formData.paymentDeadlineFixed !== originalDeadlines.paymentDeadlineFixed ||
        formData.paymentDeadlineHours !== originalDeadlines.paymentDeadlineHours
      ) {
        setDeadlineChangeType('full');
        setShowDeadlineModal(true);
        return true;
      }
    }

    // Check Deposit deadline
    if (formData.paymentMode === 'deposit') {
      if (
        formData.depositDeadlineType !== originalDeadlines.depositDeadlineType ||
        formData.depositDeadlineFixed !== originalDeadlines.depositDeadlineFixed ||
        formData.depositDeadlineHours !== originalDeadlines.depositDeadlineHours
      ) {
        setDeadlineChangeType('deposit');
        setShowDeadlineModal(true);
        return true;
      }

      // Check Remaining deadline
      if (
        formData.remainingDeadlineType !== originalDeadlines.remainingDeadlineType ||
        formData.remainingDeadlineFixed !== originalDeadlines.remainingDeadlineFixed ||
        formData.remainingDeadlineHours !== originalDeadlines.remainingDeadlineHours
      ) {
        setDeadlineChangeType('remaining');
        setShowDeadlineModal(true);
        return true;
      }
    }

    return false;
  };

  // Main submission function
  const submitEventData = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingEvent) {
        // Update existing event
        const response = await fetch('/api/admin/events', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: editingEvent.eventId,
            ...formData,
            priceTiers: formData.pricingType === 'tiered' ? priceTiers : undefined,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update event');
        }

        // ✅ If user wants to update existing pending registrations
        if (applyToExisting === 'all' && deadlineChangeType) {
          await updateExistingDeadlines();
        }

        setSuccess('อัพเดทกิจกรรมเรียบร้อยแล้ว');
      } else {
        // Create new event
        const response = await fetch('/api/admin/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            priceTiers: formData.pricingType === 'tiered' ? priceTiers : undefined,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create event');
        }

        setSuccess('สร้างกิจกรรมใหม่เรียบร้อยแล้ว');
      }

      handleCloseModal();
      fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingEventId) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/events?eventId=${deletingEventId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete event');
      }

      setSuccess('ลบกิจกรรมเรียบร้อยแล้ว');
      setShowDeleteConfirm(false);
      setDeletingEventId(null);
      fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (event: Event) => {
    try {
      const response = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.eventId,
          isActive: !event.isActive,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update event');
      }

      setSuccess(`${!event.isActive ? 'เปิด' : 'ปิด'}กิจกรรมเรียบร้อยแล้ว`);
      fetchEvents();
    } catch (err) {
      console.error('Error toggling event status:', err);
      setError('ไม่สามารถเปลี่ยนสถานะกิจกรรมได้');
    }
  };

  const handleToggleRegistration = async (event: Event) => {
    try {
      const response = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.eventId,
          registrationOpen: !event.registrationOpen,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update registration status');
      }

      setSuccess(`${!event.registrationOpen ? 'เปิด' : 'ปิด'}รับสมัครเรียบร้อยแล้ว`);
      setOpenDropdown(null);
      fetchEvents();
    } catch (err) {
      console.error('Error toggling registration:', err);
      setError('ไม่สามารถเปลี่ยนสถานะการรับสมัครได้');
    }
  };

  const handleTogglePublished = async (event: Event) => {
    try {
      const response = await fetch('/api/admin/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.eventId,
          isPublished: !event.isPublished,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update published status');
      }

      setSuccess(`${!event.isPublished ? 'แสดงให้สมาชิก' : 'ซ่อนจากสมาชิก'}เรียบร้อยแล้ว`);
      setOpenDropdown(null);
      fetchEvents();
    } catch (err) {
      console.error('Error toggling published status:', err);
      setError('ไม่สามารถเปลี่ยนสถานะการแสดงผลได้');
    }
  };

  const handleExportExcel = async (event: Event) => {
    try {
      const response = await fetch(`/api/events/${event.eventId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch event data');
      }

      const data = await response.json();
      const attendees = data.attendees || [];
      const roomTypes = data.event?.roomTypes || [];
      const sortedRoomTypes = [...roomTypes].sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));

      // Prepare data for Excel with full details
      const excelData = attendees.map((attendee: any) => {
        // Parse room allocations
        let roomAllocationMap: Record<string, number> = {};
        try {
          const roomAllocations = JSON.parse(attendee.registration.roomAllocations || '[]');
          if (Array.isArray(roomAllocations)) {
            roomAllocations.forEach((alloc: { roomTypeId: string; roomCount: number }) => {
              roomAllocationMap[alloc.roomTypeId] = alloc.roomCount;
            });
          }
        } catch {
          // Ignore parse errors
        }

        // Parse special charges
        let totalSpecialCharges = 0;
        try {
          const charges = JSON.parse(attendee.registration.specialCharges || '[]');
          if (Array.isArray(charges)) {
            totalSpecialCharges = charges.reduce((sum: number, charge: { amount: number }) => sum + (charge.amount || 0), 0);
          }
        } catch {
          // Ignore parse errors
        }

        // Base columns
        const row: Record<string, any> = {
          'รหัสลงทะเบียน': attendee.registration.registrationId || '',
          'ชื่อบริษัท': attendee.registration.companyName || attendee.member?.companyNameTH || '',
          'ผู้ติดต่อ': attendee.registration.contactName || attendee.member?.fullNameTH || attendee.lineProfile?.lineDisplayName || '',
          'เบอร์โทร': attendee.registration.contactPhone || '',
          'ชื่อไลน์': attendee.lineProfile?.lineDisplayName || '',
          'จำนวนผู้เข้าร่วม': attendee.registration.attendeeCount || 1,
          'รายชื่อผู้เข้าร่วม': (() => {
            try {
              const names = JSON.parse(attendee.registration.attendeeNames || '[]');
              return Array.isArray(names) ? names.join(', ') : attendee.registration.attendeeNames;
            } catch {
              return attendee.registration.attendeeNames || '';
            }
          })(),
        };

        // Add room allocation columns dynamically
        sortedRoomTypes.forEach((roomType: any) => {
          const columnName = roomType.typeName;
          row[columnName] = roomAllocationMap[roomType.typeId] || 0;
        });

        // Add remaining columns
        row['สถานะ'] = attendee.registration.status || '';
        row['ความต้องการพิเศษ'] = attendee.registration.specialRequests || '';
        row['ค่าใช้จ่ายเสริม'] = totalSpecialCharges;

        return row;
      });

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendees');

      // Save file
      const fileName = `${event.eventName}_${new Date().toLocaleDateString('th-TH')}.xlsx`;
      XLSX.writeFile(wb, fileName);

      setSuccess('Export Excel เรียบร้อยแล้ว');
      setOpenDropdown(null);
    } catch (err) {
      console.error('Error exporting Excel:', err);
      setError('ไม่สามารถ export ไฟล์ได้');
    }
  };

  const handleCopyList = async (event: Event) => {
    try {
      const response = await fetch(`/api/events/${event.eventId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch event data');
      }

      const data = await response.json();
      const attendees = data.attendees || [];

      // Calculate totals
      const companyCount = attendees.length;
      const totalPeople = attendees.reduce((sum: number, a: any) => sum + (a.registration?.attendeeCount || 1), 0);

      // Format header
      const header = `รายนามชื่อบริษัทที่เข้าร่วมกิจกรรม\n${event.eventName}\n${event.eventDate}\nจำนวนลงทะเบียน ${companyCount} บริษัท / ${totalPeople} คน\n\n`;

      // Format attendee list with spacing between lines
      const listText = attendees
        .map((a: any, index: number) => {
          const companyName = a.registration?.companyName || a.member?.companyNameTH || 'ไม่ระบุบริษัท';
          const attendeeCount = a.registration?.attendeeCount || 1;
          const contactName = a.registration?.contactName || a.member?.fullNameTH || a.lineProfile?.lineDisplayName || '';
          const phone = a.registration?.contactPhone || '';

          return `${index + 1}. ${companyName} (${attendeeCount} คน) ติดต่อ ${contactName}${phone ? ' โทร ' + phone : ''}`;
        })
        .join('\n\n');

      // Combine header and list
      const fullText = header + listText;

      await navigator.clipboard.writeText(fullText);
      setSuccess('คัดลอกรายชื่อเรียบร้อยแล้ว');
      setOpenDropdown(null);
    } catch (err) {
      console.error('Error copying list:', err);
      setError('ไม่สามารถคัดลอกรายชื่อได้');
    }
  };

  const handleFixHeaders = async (event: Event) => {
    try {
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/admin/events/${event.eventId}/fix-headers`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'ไม่สามารถแก้ไขหัวตารางได้');
        return;
      }

      const data = await response.json();
      setSuccess(data.message);
      setOpenDropdown(null);
    } catch (err) {
      console.error('Error fixing headers:', err);
      setError('ไม่สามารถแก้ไขหัวตารางได้');
    }
  };

  const isAdmin = session?.user?.permissions?.includes('admin:access');
  const isCommittee = session?.user?.permissions?.includes('members:list');
  const canManageEvents = session?.user?.permissions?.includes('events:manage-assigned');
  const hasAccess = isAdmin || canManageEvents;
  const isAdminOrCommittee = isAdmin || isCommittee;

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">ไม่มีสิทธิ์เข้าถึง</h1>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {isAdminOrCommittee && (
                <Link href="/admin" className="text-gray-500 hover:text-gray-700">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </Link>
              )}
              <h1 className="text-2xl font-bold text-gray-900">จัดการกิจกรรม</h1>
            </div>
            {session?.user?.role !== 'event-staff' && session?.user?.role !== 'event-co' && (
              <button
                onClick={() => handleOpenModal()}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                เพิ่มกิจกรรมใหม่
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}

        {/* Info Box - Only show for admins who can create events */}
        {isAdmin && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">วิธีการเพิ่มกิจกรรมใหม่:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>สร้าง Sheet ใหม่ใน Google Spreadsheet สำหรับเก็บข้อมูลลงทะเบียน</li>
                  <li>ตั้งชื่อ Sheet และใส่ columns ที่จำเป็น (ต้องมี <code className="bg-blue-100 px-1 rounded">license_number</code>)</li>
                  <li>กดปุ่ม &quot;เพิ่มกิจกรรมใหม่&quot; และกรอกข้อมูล โดยใส่ชื่อ Sheet ให้ตรงกับที่สร้างไว้</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Sort Controls */}
        {events.length > 0 && (
          <div className="mb-4 flex items-center justify-end gap-2">
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
        )}

        {/* Events Grid - Mobile Friendly */}
        {events.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            {isAdmin ? 'ยังไม่มีกิจกรรม กดปุ่ม "เพิ่มกิจกรรมใหม่" เพื่อเริ่มต้น' : 'ยังไม่มีกิจกรรมที่ได้รับมอบหมาย'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {[...events].sort((a, b) => {
              if (sortBy === 'created') {
                const dateA = new Date(a.createdAt).getTime();
                const dateB = new Date(b.createdAt).getTime();
                return dateB - dateA; // Newest first
              } else {
                // Parse Thai date format (DD/MM/YYYY) or ISO format
                const parseDate = (dateStr: string): number => {
                  if (!dateStr) return 0;
                  // Try parsing as DD/MM/YYYY (Thai format)
                  if (dateStr.includes('/')) {
                    const parts = dateStr.split('/');
                    if (parts.length === 3) {
                      const day = parseInt(parts[0]);
                      const month = parseInt(parts[1]) - 1;
                      const year = parseInt(parts[2]);
                      const gregorianYear = year > 2400 ? year - 543 : year;
                      const date = new Date(gregorianYear, month, day);
                      if (!isNaN(date.getTime())) return date.getTime();
                    }
                  }
                  const date = new Date(dateStr);
                  return isNaN(date.getTime()) ? 0 : date.getTime();
                };
                const dateA = parseDate(a.eventDate);
                const dateB = parseDate(b.eventDate);
                if (dateA === 0 && dateB === 0) return 0;
                if (dateA === 0) return 1;
                if (dateB === 0) return -1;
                return dateB - dateA; // Most recent event first
              }
            }).map((event) => (
              <div key={event.eventId} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-visible">
                {/* Card Content */}
                <div className="p-4">
                  {/* Header: Event Name & Year with Cover Image */}
                  <div className="flex items-start justify-between gap-3 mb-3">
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
                      <h3 className="text-base font-semibold text-gray-900 truncate">{event.eventName}</h3>
                      {event.eventNameEN && (
                        <p className="text-sm text-gray-500 truncate">{event.eventNameEN}</p>
                      )}
                      {/* Event Date */}
                      {event.eventDate && (
                        <div className="flex items-center gap-1 text-xs text-blue-600 font-medium mt-1">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{formatEventDateRange(event.eventDate, event.eventEndDate)}</span>
                        </div>
                      )}
                      {event.location && (
                        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          <span className="truncate">{event.location}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="text-sm font-medium text-gray-900">พ.ศ. {event.year}</div>
                      <div className="text-xs text-gray-500">ค.ศ. {event.year - 543}</div>
                    </div>
                  </div>

                  {/* Bank Account & Statistics */}
                  <div className="flex flex-wrap items-center gap-3 mb-3 pb-3 border-b border-gray-200">
                    {event.bankAccountId ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">บัญชี:</span>
                        <code className="text-xs bg-blue-50 border border-blue-200 px-2 py-1 rounded">{event.bankAccountId}</code>
                      </div>
                    ) : event.sheetName ? (
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{event.sheetName}</code>
                    ) : null}
                    <div className="flex items-center gap-2 text-sm">
                      {loadingSummaries ? (
                        <span className="text-gray-400 text-xs">กำลังโหลด...</span>
                      ) : summaries.has(event.eventId) ? (
                        <>
                          <span className="font-semibold text-blue-600" title="จำนวนบริษัท">
                            {summaries.get(event.eventId)?.agentRegistrations || 0}
                          </span>
                          <span className="text-gray-400">/</span>
                          <span className="font-semibold text-indigo-600" title="จำนวนคน">
                            {summaries.get(event.eventId)?.totalAttendees || 0}
                          </span>
                          <span className="text-gray-400">/</span>
                          <span className="font-semibold text-purple-600" title="สมาชิกชมรม">
                            {summaries.get(event.eventId)?.clubMemberCount || 0}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </div>
                  </div>

                  {/* Status Badges & Fee */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      onClick={() => handleToggleActive(event)}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                        event.isActive
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      {event.isActive ? 'Active' : 'Inactive'}
                    </button>

                    {/* Published Status */}
                    {event.isPublished && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Published
                      </span>
                    )}

                    {/* Registration Status with Capacity Check */}
                    {(() => {
                      const summary = summaries.get(event.eventId);
                      const isFull = event.maxCapacity > 0 && summary && summary.totalAttendees >= event.maxCapacity;

                      // Show full status if at capacity (regardless of registrationOpen status)
                      if (isFull) {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            เต็ม/ปิดรับสมัครแล้ว
                          </span>
                        );
                      }

                      // Show open status if registration is open and published
                      if (event.registrationOpen && event.isPublished) {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            เปิดรับสมัคร
                          </span>
                        );
                      }

                      // Show not published if registration is open but not published
                      if (event.registrationOpen && !event.isPublished) {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            ยังไม่ Published
                          </span>
                        );
                      }

                      // Show closed status if registration is closed (and not full)
                      if (!event.registrationOpen) {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            ปิดรับสมัคร
                          </span>
                        );
                      }

                      return null;
                    })()}

                    <span className="text-xs text-gray-600 px-2 py-0.5">
                      {(() => {
                        // Attendee Type Pricing
                        if (event.useAttendeeTypePricing && event.attendeeTypes && event.attendeeTypes.length > 0) {
                          const minPrice = Math.min(...event.attendeeTypes.map(t => t.price));
                          const maxPrice = Math.max(...event.attendeeTypes.map(t => t.price));
                          if (minPrice === maxPrice) {
                            return minPrice === 0 ? 'ฟรี' : `${minPrice.toLocaleString()} บาท`;
                          }
                          return `${minPrice.toLocaleString()}-${maxPrice.toLocaleString()} บาท`;
                        }

                        // New Tier Pricing
                        if (event.pricingType === 'tiered' && event.priceTiers && event.priceTiers.length > 0) {
                          const firstTier = event.priceTiers[0];
                          if (firstTier.price === 0) {
                            return 'ฟรี';
                          }
                          if (firstTier.priceType === 'total') {
                            return `${firstTier.upToCount} คนแรก ${firstTier.price.toLocaleString()} บาท`;
                          }
                          return `เริ่มต้น ${firstTier.price.toLocaleString()} บาท`;
                        }

                        // Legacy Tiered Pricing (baseFee + additionalFeePerPerson)
                        if (event.pricingType === 'tiered' && (event.baseFee || event.additionalFeePerPerson)) {
                          if (event.baseFee === 0 && event.additionalFeePerPerson === 0) {
                            return 'ฟรี';
                          }
                          return `เริ่มต้น ${(event.baseFee || 0).toLocaleString()} บาท`;
                        }

                        // Fixed Pricing
                        return event.registrationFee ? `${event.registrationFee.toLocaleString()} บาท` : 'ฟรี';
                      })()}
                      {event.maxCapacity > 0 && ` | รับ ${event.maxCapacity} คน`}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {/* Primary: Manage Attendees Button */}
                    <Link
                      href={`/admin/events/${event.eventId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      จัดการรายชื่อ
                    </Link>

                    {/* Secondary: More Options Dropdown */}
                    <div className="relative dropdown-container">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdown(openDropdown === event.eventId ? null : event.eventId);
                        }}
                        className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        title="ตัวเลือกเพิ่มเติม"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {openDropdown === event.eventId && (
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-[9999]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isAdminOrCommittee && (
                            <>
                              <button
                                onClick={() => {
                                  handleOpenModal(event);
                                  setOpenDropdown(null);
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                แก้ไข
                              </button>
                              <button
                                onClick={() => {
                                  handleFixHeaders(event);
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                title="แก้ไขหัวตาราง Google Sheet ให้ครบถ้วน"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7V5c0-2 1-3 3-3h10c2 0 3 1 3 3v2M4 7h16M10 11v6M14 11v6" />
                                </svg>
                                แก้ไขหัวตาราง
                              </button>
                              <div className="border-t border-gray-200 my-1"></div>
                            </>
                          )}
                            <button
                              onClick={() => {
                                handleExportExcel(event);
                                setOpenDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Export Excel
                            </button>
                            <button
                              onClick={() => {
                                handleCopyList(event);
                                setOpenDropdown(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy รายชื่อ
                            </button>
                            {isAdminOrCommittee && (
                              <>
                                <div className="border-t border-gray-200 my-1"></div>
                                <button
                                  onClick={() => {
                                    handleToggleRegistration(event);
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {event.registrationOpen ? 'ปิดรับสมัคร' : 'เปิดรับสมัคร'}
                                </button>
                                <button
                                  onClick={() => {
                                    handleTogglePublished(event);
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {event.isPublished ? (
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    ) : (
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    )}
                                  </svg>
                                  {event.isPublished ? 'ซ่อนจากสมาชิก (Unpublish)' : 'แสดงให้สมาชิก (Publish)'}
                                </button>
                                <button
                                  onClick={() => {
                                    handleToggleActive(event);
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {event.isActive ? 'จบกิจกรรม' : 'เปิดกิจกรรม'}
                                </button>
                                <div className="border-t border-gray-200 my-1"></div>
                                <button
                                  onClick={() => {
                                    setDeletingEventId(event.eventId);
                                    setShowDeleteConfirm(true);
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  ลบ
                                </button>
                              </>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingEvent ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมใหม่'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อกิจกรรม (ภาษาไทย) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.eventName}
                    onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อกิจกรรม (ภาษาอังกฤษ)
                  </label>
                  <input
                    type="text"
                    value={formData.eventNameEN}
                    onChange={(e) => setFormData({ ...formData, eventNameEN: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ปี พ.ศ. <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.year || ''}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={2500}
                    max={2600}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่เริ่มกิจกรรม
                  </label>
                  <input
                    type="date"
                    value={formData.eventDate}
                    onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    รูปแบบ: YYYY-MM-DD (เช่น 2025-03-15)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่สิ้นสุดกิจกรรม
                  </label>
                  <input
                    type="date"
                    value={formData.eventEndDate}
                    onChange={(e) => setFormData({ ...formData, eventEndDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ไม่ต้องระบุถ้าเป็นกิจกรรมวันเดียว
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    สถานที่จัดกิจกรรม
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    รายละเอียด
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Registration Settings */}
                <div className="md:col-span-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">ตั้งค่าการลงทะเบียน</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        จำนวนที่เปิดรับ
                      </label>
                      <input
                        type="number"
                        value={formData.maxCapacity || ''}
                        onChange={(e) => setFormData({ ...formData, maxCapacity: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        placeholder="0 = ไม่จำกัด"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min={0}
                      />
                      <p className="text-xs text-gray-500 mt-1">กรอก 0 หากไม่จำกัดจำนวน</p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ระบบคิดราคา <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="fixed"
                            checked={formData.pricingType === 'fixed' && !formData.useAttendeeTypePricing}
                            onChange={() => setFormData({
                              ...formData,
                              pricingType: 'fixed',
                              useAttendeeTypePricing: false,
                              attendeeTypes: [],
                              roomTypes: []
                            })}
                            className="w-4 h-4 text-blue-600"
                          />
                          <div>
                            <div className="text-sm font-medium">ราคาเหมา (Fixed)</div>
                            <div className="text-xs text-gray-500">ทุกคนจ่ายเท่ากัน - เหมาะสำหรับกิจกรรมทั่วไป</div>
                          </div>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="tiered"
                            checked={formData.pricingType === 'tiered' && !formData.useAttendeeTypePricing}
                            onChange={() => setFormData({
                              ...formData,
                              pricingType: 'tiered',
                              useAttendeeTypePricing: false,
                              attendeeTypes: [],
                              roomTypes: []
                            })}
                            className="w-4 h-4 text-blue-600"
                          />
                          <div>
                            <div className="text-sm font-medium">ราคาขั้นบันได (Tiered)</div>
                            <div className="text-xs text-gray-500">คนแรกและคนที่ 2+ ราคาต่างกัน - เหมาะสำหรับกิจกรรมที่มีส่วนลด</div>
                          </div>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="attendee"
                            checked={formData.useAttendeeTypePricing === true}
                            onChange={() => {
                              // Add default attendee types if none exist
                              const defaultTypes: AttendeeType[] = formData.attendeeTypes && formData.attendeeTypes.length > 0
                                ? formData.attendeeTypes
                                : [
                                    { typeId: 'adult', typeName: 'ผู้ใหญ่', price: 0, isActive: true, sortOrder: 0 }
                                  ];

                              setFormData({
                                ...formData,
                                useAttendeeTypePricing: true,
                                pricingType: 'fixed', // Set to fixed as fallback
                                attendeeTypes: defaultTypes
                              });
                            }}
                            className="w-4 h-4 text-blue-600"
                          />
                          <div>
                            <div className="text-sm font-medium">ราคาตามประเภทผู้เข้าร่วม (Attendee Type)</div>
                            <div className="text-xs text-gray-500">แยกราคาตามประเภท (ผู้ใหญ่/เด็ก) + ค่าห้องพัก - เหมาะสำหรับกิจกรรมที่มีที่พัก</div>
                          </div>
                        </label>
                      </div>
                    </div>

                    {!formData.useAttendeeTypePricing && formData.pricingType === 'tiered' ? (
                      <div className="md:col-span-2 space-y-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-medium text-gray-900 mb-3">
                            การตั้งราคาแบบ Tier
                          </h4>

                          {/* Tier 1 */}
                          <div className="space-y-3 mb-4 p-3 bg-white rounded border">
                            <h5 className="font-medium text-sm text-gray-700">
                              Tier 1: ราคารวม (สำหรับ N คนแรก)
                            </h5>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                  จำนวนคนสูงสุด
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={priceTiers[0]?.upToCount || 1}
                                  onChange={(e) => {
                                    const newTiers = [...priceTiers];
                                    newTiers[0] = { ...newTiers[0], upToCount: Number(e.target.value), priceType: 'total' };
                                    setPriceTiers(newTiers);
                                  }}
                                  className="w-full px-3 py-2 border rounded"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  เช่น: 2 = ราคานี้ใช้กับ 1-2 คน
                                </p>
                              </div>

                              <div>
                                <label className="block text-sm text-gray-600 mb-1">
                                  ราคารวม (บาท)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  value={priceTiers[0]?.price || 0}
                                  onChange={(e) => {
                                    const newTiers = [...priceTiers];
                                    newTiers[0] = { ...newTiers[0], price: Number(e.target.value), priceType: 'total' };
                                    setPriceTiers(newTiers);
                                  }}
                                  className="w-full px-3 py-2 border rounded"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  ราคารวมสำหรับกลุ่มคนนี้
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Tier 2 */}
                          <div className="space-y-3 p-3 bg-white rounded border">
                            <h5 className="font-medium text-sm text-gray-700">
                              Tier 2: ราคาต่อคน (สำหรับคนที่เกิน Tier 1)
                            </h5>

                            <div>
                              <label className="block text-sm text-gray-600 mb-1">
                                ราคาต่อคน (บาท)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={priceTiers[1]?.price || 0}
                                onChange={(e) => {
                                  const newTiers = [...priceTiers];
                                  newTiers[1] = {
                                    ...newTiers[1],
                                    price: Number(e.target.value),
                                    upToCount: 999,
                                    priceType: 'per_person'
                                  };
                                  setPriceTiers(newTiers);
                                }}
                                className="w-full px-3 py-2 border rounded"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                ราคาต่อคนสำหรับคนที่ {(priceTiers[0]?.upToCount || 1) + 1} เป็นต้นไป
                              </p>
                            </div>
                          </div>

                          {/* Pricing Preview */}
                          <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                            <p className="text-sm font-medium text-blue-900 mb-2">
                              ตัวอย่างการคำนวณ:
                            </p>
                            <ul className="text-sm text-blue-800 space-y-1">
                              <li>1 คน = {priceTiers[0]?.price.toLocaleString()} บาท</li>
                              <li>{priceTiers[0]?.upToCount} คน = {priceTiers[0]?.price.toLocaleString()} บาท</li>
                              <li>
                                {(priceTiers[0]?.upToCount || 0) + 1} คน = {
                                  (priceTiers[0]?.price + priceTiers[1]?.price).toLocaleString()
                                } บาท
                              </li>
                              <li>
                                {(priceTiers[0]?.upToCount || 0) + 2} คน = {
                                  (priceTiers[0]?.price + (priceTiers[1]?.price * 2)).toLocaleString()
                                } บาท
                              </li>
                            </ul>
                          </div>
                        </div>

                        {/* Member Discount */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            ส่วนลดสมาชิก (บาท)
                          </label>
                          <input
                            type="number"
                            value={formData.memberDiscount || ''}
                            onChange={(e) => setFormData({ ...formData, memberDiscount: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                            placeholder="0 = ไม่มีส่วนลด"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min={0}
                          />
                          <p className="text-xs text-gray-500 mt-1">ส่วนลดจากราคารวม (บาท)</p>
                        </div>
                      </div>
                    ) : !formData.useAttendeeTypePricing ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ค่าสมัคร (บาท/คน)
                        </label>
                        <input
                          type="number"
                          value={formData.registrationFee || ''}
                          onChange={(e) => setFormData({ ...formData, registrationFee: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                          placeholder="0 = ฟรี"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min={0}
                        />
                        <p className="text-xs text-gray-500 mt-1">กรอก 0 หากไม่มีค่าใช้จ่าย</p>
                      </div>
                    ) : null}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        จำนวนที่อนุญาตต่อ 1 บริษัท
                      </label>
                      <input
                        type="number"
                        value={formData.maxPerCompany || ''}
                        onChange={(e) => setFormData({ ...formData, maxPerCompany: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                        placeholder="0 = ไม่จำกัด"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min={0}
                      />
                      <p className="text-xs text-gray-500 mt-1">จำกัดจำนวนผู้เข้าร่วมต่อ 1 บริษัท (0 = ไม่จำกัด)</p>
                    </div>
                  </div>
                </div>

                {/* Attendee Type Pricing Configuration */}
                {formData.useAttendeeTypePricing && (
                  <div className="md:col-span-2 border-t pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">ตั้งค่าราคาตามประเภทผู้เข้าร่วม</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <p className="text-sm text-gray-600 mb-3">
                        กำหนดประเภทผู้เข้าร่วมและราคาสำหรับแต่ละประเภท:
                      </p>

                      {/* Dynamic attendee types list */}
                      <div className="space-y-3">
                        {formData.attendeeTypes?.map((type, index) => (
                          <div key={type.typeId} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white p-3 rounded border">
                            <button
                              type="button"
                              onClick={() => {
                                const newTypes = formData.attendeeTypes.filter(at => at.typeId !== type.typeId);
                                setFormData({ ...formData, attendeeTypes: newTypes });
                              }}
                              className="text-red-500 hover:text-red-700 self-start sm:self-center"
                              title="ลบประเภทนี้"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>

                            <input
                              type="text"
                              value={type.typeName}
                              placeholder="ชื่อประเภท"
                              onChange={(e) => {
                                const newTypes = [...formData.attendeeTypes];
                                newTypes[index].typeName = e.target.value;
                                setFormData({ ...formData, attendeeTypes: newTypes });
                              }}
                              className="w-full sm:flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm font-medium"
                            />

                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">ราคา:</span>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={type.price || ''}
                                onChange={(e) => {
                                  const newTypes = [...formData.attendeeTypes];
                                  newTypes[index].price = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                  setFormData({ ...formData, attendeeTypes: newTypes });
                                }}
                                className="w-24 px-3 py-1 border border-gray-300 rounded-md text-right"
                              />
                              <span className="text-sm text-gray-600">บาท</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Add new attendee type button */}
                      <button
                        type="button"
                        onClick={() => {
                          const newType: AttendeeType = {
                            typeId: `type_${Date.now()}`,
                            typeName: '',
                            price: 0,
                            isActive: true,
                            sortOrder: formData.attendeeTypes?.length || 0
                          };
                          setFormData({
                            ...formData,
                            attendeeTypes: [...(formData.attendeeTypes || []), newType]
                          });
                        }}
                        className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        + เพิ่มประเภทผู้เข้าร่วม
                      </button>

                      <p className="text-xs text-gray-500 mt-2">
                        เมื่อใช้ระบบนี้ ราคาจะคำนวณจากจำนวนผู้เข้าร่วมแต่ละประเภท × ราคาของประเภทนั้น
                      </p>
                      <p className="text-xs text-orange-600">
                        <strong>หมายเหตุ:</strong> เมื่อเปิดใช้งาน ราคาต่อหัวแบบปกติจะถูกแทนที่ด้วยราคาตามประเภท
                      </p>

                    </div>
                  </div>
                )}

                {/* Room Allocation - Available for all pricing types */}
                <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                  <h4 className="text-sm font-semibold text-amber-900 mb-2">
                    ตั้งค่าประเภทห้องพัก (ถ้ามี)
                  </h4>
                  <p className="text-xs text-amber-700 mb-3">
                    หากกิจกรรมมีที่พัก สามารถตั้งค่าประเภทห้องพักได้ (ใช้ได้กับทุกวิธีคิดราคา)
                  </p>

                  {/* Dynamic room types list */}
                  <div className="space-y-3">
                    {formData.roomTypes?.map((room, index) => (
                      <div key={room.typeId} className="bg-white p-3 rounded border space-y-2">
                        {/* First row: Main info */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const newRooms = formData.roomTypes.filter(rt => rt.typeId !== room.typeId);
                              setFormData({ ...formData, roomTypes: newRooms });
                            }}
                            className="text-red-500 hover:text-red-700 self-start sm:self-center"
                            title="ลบประเภทห้องนี้"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>

                          <input
                            type="text"
                            value={room.typeName}
                            placeholder="ชื่อประเภทห้อง"
                            onChange={(e) => {
                              const newRooms = [...formData.roomTypes];
                              newRooms[index].typeName = e.target.value;
                              setFormData({ ...formData, roomTypes: newRooms });
                            }}
                            className="w-full sm:w-40 px-3 py-1 border border-gray-300 rounded-md text-sm font-medium"
                          />

                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">รองรับ:</span>
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={room.capacity || ''}
                              onChange={(e) => {
                                const newRooms = [...formData.roomTypes];
                                newRooms[index].capacity = e.target.value === '' ? 1 : parseInt(e.target.value);
                                setFormData({ ...formData, roomTypes: newRooms });
                              }}
                              className="w-16 px-3 py-1 border border-gray-300 rounded-md text-center"
                            />
                            <span className="text-sm text-gray-600">คน</span>
                          </div>

                          <div className="flex items-center gap-2 sm:ml-auto">
                            <span className="text-sm text-gray-600">ราคาเพิ่ม:</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={room.price || ''}
                              onChange={(e) => {
                                const newRooms = [...formData.roomTypes];
                                newRooms[index].price = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                setFormData({ ...formData, roomTypes: newRooms });
                              }}
                              className="w-24 px-3 py-1 border border-gray-300 rounded-md text-right"
                            />
                            <span className="text-sm text-gray-600">บาท</span>
                          </div>
                        </div>

                        {/* Second row: Note field */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:pl-8">
                          <span className="text-xs text-gray-600">หมายเหตุ:</span>
                          <input
                            type="text"
                            value={room.note || ''}
                            placeholder="ระบุหมายเหตุเพิ่มเติม (ถ้ามี)"
                            onChange={(e) => {
                              const newRooms = [...formData.roomTypes];
                              newRooms[index].note = e.target.value;
                              setFormData({ ...formData, roomTypes: newRooms });
                            }}
                            className="w-full sm:flex-1 px-3 py-1 border border-gray-300 rounded-md text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add new room type button */}
                  <button
                    type="button"
                    onClick={() => {
                      const newRoom: RoomType = {
                        typeId: `room_${Date.now()}`,
                        typeName: '',
                        capacity: 2,
                        price: 0,
                        isActive: true,
                        sortOrder: formData.roomTypes?.length || 0
                      };
                      setFormData({
                        ...formData,
                        roomTypes: [...(formData.roomTypes || []), newRoom]
                      });
                    }}
                    className="w-full py-2 px-4 border-2 border-dashed border-amber-300 rounded-lg text-sm text-amber-700 hover:border-amber-500 hover:text-amber-800 transition-colors mt-3"
                  >
                    + เพิ่มประเภทห้องพัก
                  </button>

                  <p className="text-xs text-amber-600 mt-2">
                    ค่าใช้จ่ายห้องพักจะถูกบวกเพิ่มจากค่าลงทะเบียน
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    <strong>หมายเหตุ:</strong> ระบบจะตรวจสอบว่าจำนวนห้องพักที่เลือกรองรับจำนวนผู้เข้าร่วมพอดี
                  </p>
                </div>

                {/* Deposit Payment Configuration (NEW) */}
                {((formData.pricingType === 'fixed' && formData.registrationFee > 0 && !formData.useAttendeeTypePricing) ||
                  (formData.pricingType === 'tiered' && ((formData.baseFee > 0 || formData.additionalFeePerPerson > 0) || (priceTiers[0]?.price > 0 || priceTiers[1]?.price > 0)) && !formData.useAttendeeTypePricing) ||
                  (formData.useAttendeeTypePricing && formData.attendeeTypes.length > 0)) && (
                  <div className="md:col-span-2 border-t pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">
                      ตั้งค่าการชำระเงิน (Payment Configuration)
                    </h3>

                    {/* Payment Timing Radio */}
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        เวลาการชำระเงิน (Payment Timing)
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="deferred"
                            checked={formData.paymentTiming === 'deferred'}
                            onChange={() => setFormData({ ...formData, paymentTiming: 'deferred' })}
                            className="w-4 h-4 mt-0.5"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium">ชำระหลังลงทะเบียน (Deferred)</span>
                            <p className="text-xs text-gray-600 mt-0.5">สมาชิกลงทะเบียนก่อน แล้วชำระเงินภายหลัง</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="immediate"
                            checked={formData.paymentTiming === 'immediate'}
                            onChange={() => setFormData({ ...formData, paymentTiming: 'immediate', paymentMode: 'full' })}
                            className="w-4 h-4 mt-0.5"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium">ชำระพร้อมลงทะเบียน (Immediate)</span>
                            <p className="text-xs text-gray-600 mt-0.5">สมาชิกต้องแนบหลักฐานการชำระพร้อมลงทะเบียน</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Payment Mode Radio */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        รูปแบบการชำระเงิน (Payment Mode)
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            value="full"
                            checked={formData.paymentMode === 'full'}
                            onChange={() => setFormData({ ...formData, paymentMode: 'full' })}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">ชำระเต็มจำนวน (Full) - ชำระครั้งเดียว</span>
                        </label>
                        <label className={`flex items-center gap-2 ${formData.paymentTiming === 'immediate' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input
                            type="radio"
                            value="deposit"
                            checked={formData.paymentMode === 'deposit'}
                            onChange={() => setFormData({ ...formData, paymentMode: 'deposit' })}
                            disabled={formData.paymentTiming === 'immediate'}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">ชำระแบบมัดจำ (Deposit) - แบ่ง 2 งวด</span>
                        </label>
                        {formData.paymentTiming === 'immediate' && (
                          <p className="text-xs text-gray-500 ml-6 mt-1">
                            ⚠️ เมื่อเลือก &quot;ชำระพร้อมลงทะเบียน&quot; จะต้องชำระเต็มจำนวนเท่านั้น
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Conditional: Show if FULL payment mode */}
                    {formData.paymentMode === 'full' && (
                      <>
                        {/* Payment Deadline */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            กำหนดชำระเงิน (Payment Deadline)
                          </label>
                          <select
                            value={formData.paymentDeadlineType || 'none'}
                            onChange={(e) => setFormData({ ...formData, paymentDeadlineType: e.target.value as any })}
                            className="w-full px-3 py-2 border rounded-md mb-2"
                          >
                            <option value="none">ไม่กำหนด - ไม่จำกัดเวลา</option>
                            <option value="fixed">วันที่กำหนด - ระบุวันที่ชัดเจน</option>
                            <option value="hours">ชั่วโมงจากลงทะเบียน - นับถอยหลัง</option>
                          </select>

                          {formData.paymentDeadlineType === 'fixed' && (
                            <div>
                              <input
                                type="date"
                                value={formData.paymentDeadlineFixed || ''}
                                onChange={(e) => setFormData({ ...formData, paymentDeadlineFixed: e.target.value })}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full px-3 py-2 border rounded-md"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                กำหนดวันที่ชำระเงิน (ต้องไม่เป็นวันที่ในอดีต)
                              </p>
                            </div>
                          )}

                          {formData.paymentDeadlineType === 'hours' && (
                            <div>
                              <input
                                type="number"
                                value={formData.paymentDeadlineHours || ''}
                                onChange={(e) => setFormData({ ...formData, paymentDeadlineHours: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border rounded-md"
                                placeholder="เช่น 72 (3 วัน)"
                                min="1"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                จำนวนชั่วโมงนับจากเวลาที่ลงทะเบียน
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Conditional: Show if deposit mode */}
                    {formData.paymentMode === 'deposit' && (
                      <>
                        {/* Deposit Amount: Fixed vs Percentage */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="flex items-center gap-2 mb-2">
                              <input
                                type="radio"
                                checked={!formData.useDepositPercentage}
                                onChange={() => setFormData({ ...formData, useDepositPercentage: false })}
                              />
                              <span className="text-sm font-medium">จำนวนเงินมัดจำคงที่ (บาท)</span>
                            </label>
                            <input
                              type="number"
                              value={formData.depositAmount || ''}
                              onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                              disabled={formData.useDepositPercentage}
                              className="w-full px-3 py-2 border rounded-md disabled:bg-gray-100"
                              placeholder="เช่น 500"
                            />
                          </div>
                          <div>
                            <label className="flex items-center gap-2 mb-2">
                              <input
                                type="radio"
                                checked={formData.useDepositPercentage}
                                onChange={() => setFormData({ ...formData, useDepositPercentage: true })}
                              />
                              <span className="text-sm font-medium">เปอร์เซ็นต์มัดจำ (%)</span>
                            </label>
                            <input
                              type="number"
                              value={formData.depositPercentage || ''}
                              onChange={(e) => setFormData({ ...formData, depositPercentage: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                              disabled={!formData.useDepositPercentage}
                              className="w-full px-3 py-2 border rounded-md disabled:bg-gray-100"
                              placeholder="เช่น 30"
                              min="1"
                              max="100"
                            />
                          </div>
                        </div>

                        {/* Deposit Deadline */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            กำหนดชำระมัดจำ
                          </label>
                          <select
                            value={formData.depositDeadlineType || 'none'}
                            onChange={(e) => setFormData({ ...formData, depositDeadlineType: e.target.value as any })}
                            className="w-full px-3 py-2 border rounded-md mb-2"
                          >
                            <option value="none">ไม่กำหนด - ไม่จำกัดเวลา</option>
                            <option value="fixed">วันที่กำหนด - ระบุวันที่ชัดเจน</option>
                            <option value="hours">ชั่วโมงจากลงทะเบียน - นับถอยหลัง</option>
                          </select>

                          {formData.depositDeadlineType === 'fixed' && (
                            <div>
                              <input
                                type="date"
                                value={formData.depositDeadlineFixed || ''}
                                onChange={(e) => setFormData({ ...formData, depositDeadlineFixed: e.target.value })}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full px-3 py-2 border rounded-md"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                กำหนดวันที่ชำระมัดจำ (ต้องไม่เป็นวันที่ในอดีต)
                              </p>
                            </div>
                          )}

                          {formData.depositDeadlineType === 'hours' && (
                            <div>
                              <input
                                type="number"
                                value={formData.depositDeadlineHours || ''}
                                onChange={(e) => setFormData({ ...formData, depositDeadlineHours: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border rounded-md"
                                placeholder="เช่น 72 (3 วัน)"
                                min="1"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                จำนวนชั่วโมงนับจากเวลาที่ลงทะเบียน
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Remaining Deadline */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            กำหนดชำระยอดคงเหลือ
                          </label>
                          <select
                            value={formData.remainingDeadlineType || 'none'}
                            onChange={(e) => setFormData({ ...formData, remainingDeadlineType: e.target.value as any })}
                            className="w-full px-3 py-2 border rounded-md mb-2"
                          >
                            <option value="none">ไม่กำหนด - ไม่จำกัดเวลา</option>
                            <option value="fixed">วันที่กำหนด - ระบุวันที่ชัดเจน</option>
                            <option value="hours">ชั่วโมงจากชำระมัดจำ - นับถอยหลัง</option>
                          </select>

                          {formData.remainingDeadlineType === 'fixed' && (
                            <div>
                              <input
                                type="date"
                                value={formData.remainingDeadlineFixed || ''}
                                onChange={(e) => setFormData({ ...formData, remainingDeadlineFixed: e.target.value })}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full px-3 py-2 border rounded-md"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                กำหนดวันที่ชำระยอดคงเหลือ (ต้องไม่เป็นวันที่ในอดีต)
                              </p>
                            </div>
                          )}

                          {formData.remainingDeadlineType === 'hours' && (
                            <div>
                              <input
                                type="number"
                                value={formData.remainingDeadlineHours || ''}
                                onChange={(e) => setFormData({ ...formData, remainingDeadlineHours: e.target.value === '' ? 0 : parseInt(e.target.value) })}
                                className="w-full px-3 py-2 border rounded-md"
                                placeholder="เช่น 168 (7 วัน)"
                                min="1"
                              />
                              <p className="text-xs text-gray-500 mt-1">
                                จำนวนชั่วโมงนับจากเวลาที่ชำระมัดจำ
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Bank Account for Payment */}
                <div className="md:col-span-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">บัญชีธนาคารสำหรับรับชำระเงิน</h3>
                  {loadingBankAccounts ? (
                    <div className="text-sm text-gray-500">กำลังโหลดบัญชีธนาคาร...</div>
                  ) : bankAccounts.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      ยังไม่มีบัญชีธนาคาร กรุณา
                      <Link href="/admin/settings/bank-accounts" className="text-blue-600 hover:underline ml-1">
                        เพิ่มบัญชีธนาคาร
                      </Link>
                    </div>
                  ) : (
                    <>
                      <select
                        value={formData.bankAccountId}
                        onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- ไม่ระบุบัญชี --</option>
                        {bankAccounts
                          .filter(account => account.isActive)
                          .map(account => (
                            <option key={account.id} value={account.id}>
                              {account.bankName} - {account.accountName} ({account.accountNumber})
                              {account.isDefault ? ' (ค่าเริ่มต้น)' : ''}
                            </option>
                          ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        เลือกบัญชีธนาคารที่ใช้รับชำระเงินสำหรับกิจกรรมนี้
                      </p>
                    </>
                  )}
                </div>

                {/* Document Link */}
                <div className="md:col-span-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">เอกสารเพิ่มเติม</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ชื่อเอกสาร
                      </label>
                      <input
                        type="text"
                        value={formData.documentName}
                        onChange={(e) => setFormData({ ...formData, documentName: e.target.value })}
                        placeholder="เช่น รายละเอียดกิจกรรม, กำหนดการ"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Link เอกสาร
                      </label>
                      <input
                        type="url"
                        value={formData.documentUrl}
                        onChange={(e) => setFormData({ ...formData, documentUrl: e.target.value })}
                        placeholder="https://..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Link รูป Main Image (ไม่บังคับ)
                      </label>
                      <input
                        type="url"
                        value={formData.mainImageUrl}
                        onChange={(e) => setFormData({ ...formData, mainImageUrl: e.target.value })}
                        placeholder="https://... (รูปที่แสดงบน header ในรายละเอียดกิจกรรม)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Information */}
                <div className="md:col-span-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">ข้อมูลการชำระเงิน</h3>
                  {((formData.pricingType === 'fixed' && formData.registrationFee > 0 && !formData.useAttendeeTypePricing) ||
                    (formData.pricingType === 'tiered' && ((formData.baseFee > 0 || formData.additionalFeePerPerson > 0) || (priceTiers[0]?.price > 0 || priceTiers[1]?.price > 0)) && !formData.useAttendeeTypePricing) ||
                    (formData.useAttendeeTypePricing && formData.attendeeTypes.length > 0)) ? (
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          เงื่อนไขการชำระเงิน
                        </label>
                        <textarea
                          value={formData.paymentTerms}
                          onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                          placeholder="กรอกเงื่อนไขหรือหมายเหตุเกี่ยวกับการชำระเงิน เช่น กำหนดชำระ, เงื่อนไขการคืนเงิน"
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          รองรับข้อความแบบ plain text หรือ markdown
                        </p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          URL สำหรับส่งหลักฐานการชำระเงิน
                        </label>
                        <input
                          type="url"
                          value={formData.paymentSlipSubmissionUrl || ''}
                          onChange={(e) => setFormData({ ...formData, paymentSlipSubmissionUrl: e.target.value })}
                          placeholder="https://forms.gle/..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          URL ของ Google Form หรือฟอร์มอื่นๆ ที่ให้สมาชิกส่งหลักฐานการชำระเงิน (ใช้ร่วมกันทั้งมัดจำ/ยอดคงเหลือ/ชำระเต็ม)
                        </p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.useExternalPaymentLink}
                            onChange={(e) => setFormData({ ...formData, useExternalPaymentLink: e.target.checked })}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-700">
                            ใช้ External Link Mode (เปิด URL ตรงๆ ในแท็บใหม่)
                          </span>
                        </label>
                        <p className="text-xs text-gray-500 mt-1 ml-6">
                          ✅ เปิด: เหมาะสำหรับ Google Form หรือ LINE (เปิด URL ตรงๆ ไม่มี parameters)<br />
                          ❌ ปิด: ใช้ GAS Upload Slip System (เปิด popup พร้อม parameters ของการลงทะเบียน)
                        </p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ข้อความคำแนะนำการชำระเงิน
                        </label>
                        <textarea
                          value={formData.paymentInstructionText || ''}
                          onChange={(e) => setFormData({ ...formData, paymentInstructionText: e.target.value })}
                          placeholder="คำแนะนำ: คุณสามารถชำระเงินแบบเต็มจำนวนหรือแบบแบ่งงวดก็ได้ โปรดส่งหลักฐานการชำระเงินผ่านลิงก์ด้านล่าง"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          ข้อความที่แสดงให้สมาชิกเห็นก่อนปุ่มส่งหลักฐาน (ถ้าไม่กรอกจะใช้ค่า default)
                        </p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ข้อความบนปุ่มส่งหลักฐานการชำระเงิน
                        </label>
                        <input
                          type="text"
                          value={formData.paymentSlipButtonText || ''}
                          onChange={(e) => setFormData({ ...formData, paymentSlipButtonText: e.target.value })}
                          placeholder="ส่งหลักฐานการชำระเงิน"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          ข้อความที่แสดงบนปุ่ม (ถ้าไม่กรอกจะแสดง "ส่งหลักฐานการชำระเงิน")
                        </p>
                      </div>
                    </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      ตั้งค่าราคากิจกรรมก่อนเพื่อเปิดใช้งานข้อมูลการชำระเงิน
                    </div>
                  )}
                </div>

                {/* Status Checkboxes */}
                <div className="md:col-span-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">สถานะและการแสดงผล</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">กิจกรรมกำลังดำเนินการ (Active)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isPublished}
                        onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">แสดงในหน้าสมาชิก (Published)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.registrationOpen}
                        onChange={(e) => setFormData({ ...formData, registrationOpen: e.target.checked })}
                        className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                      />
                      <span className="text-sm text-gray-700">เปิดรับสมัคร (Registration Open)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.countsAttendance}
                        onChange={(e) => setFormData({ ...formData, countsAttendance: e.target.checked })}
                        className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700">เก็บคะแนนการเข้าร่วม</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowMemberEdit !== false}
                        onChange={(e) => setFormData({ ...formData, allowMemberEdit: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">อนุญาตให้สมาชิกแก้ไขข้อมูลหลังลงทะเบียน</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.requireAttendeeNames ?? true}
                        onChange={(e) => setFormData({ ...formData, requireAttendeeNames: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">จำเป็นต้องกรอกชื่อผู้เข้าร่วมกิจกรรม</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.sendLineNotification ?? true}
                        onChange={(e) => setFormData({ ...formData, sendLineNotification: e.target.checked })}
                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <span className="text-sm text-gray-700">ส่งการแจ้งเตือนผ่าน LINE ให้สมาชิกที่ลงทะเบียน</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t">
                {editingEvent && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingEventId(editingEvent.eventId);
                      setShowDeleteConfirm(true);
                      setShowModal(false);
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                  >
                    ลบกิจกรรม
                  </button>
                )}
                <div className={`flex gap-3 ${!editingEvent ? 'ml-auto' : ''}`}>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'กำลังบันทึก...' : editingEvent ? 'บันทึกการแก้ไข' : 'สร้างกิจกรรม'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">ยืนยันการลบกิจกรรม</h3>
            <p className="text-gray-600 mb-6">
              คุณต้องการลบกิจกรรมนี้หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletingEventId(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'กำลังลบ...' : 'ลบกิจกรรม'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deadline Update Confirmation Modal */}
      {showDeadlineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              ⚠️ ตรวจพบการเปลี่ยนแปลงกำหนดชำระเงิน
            </h3>

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-gray-700 mb-2">
                คุณได้เปลี่ยนแปลงกำหนดการชำระเงิน
                {deadlineChangeType === 'full' && ' (ชำระเต็มจำนวน)'}
                {deadlineChangeType === 'deposit' && ' (ชำระมัดจำ)'}
                {deadlineChangeType === 'remaining' && ' (ชำระยอดคงเหลือ)'}
              </p>
              <p className="text-sm font-medium text-blue-700">
                มีรายการที่รอชำระเงินอยู่ {pendingRegistrationsCount} รายการ
              </p>
              <p className="text-xs text-gray-600 mt-2">
                💡 <strong>หมายเหตุ:</strong> รายการที่แจ้งชำระเงินแล้ว (สถานะ &quot;รอตรวจสอบ&quot;) จะไม่ได้รับผลกระทบ เนื่องจากมีการอัพโหลดสลิปเข้ามาแล้ว
              </p>
            </div>

            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">
                คุณต้องการให้การเปลี่ยนแปลงนี้มีผลกับ:
              </p>

              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 border border-gray-300 rounded cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="applyTo"
                    value="new_only"
                    checked={applyToExisting === 'new_only'}
                    onChange={(e) => setApplyToExisting(e.target.value as 'new_only' | 'all')}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">✨ รายการใหม่เท่านั้น (แนะนำ)</span>
                    <p className="text-xs text-gray-600 mt-1">
                      รายการที่ลงทะเบียนไว้แล้วจะใช้กำหนดเวลาเดิม ไม่มีการเปลี่ยนแปลง
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border border-orange-300 bg-orange-50 rounded cursor-pointer hover:bg-orange-100 transition-colors">
                  <input
                    type="radio"
                    name="applyTo"
                    value="all"
                    checked={applyToExisting === 'all'}
                    onChange={(e) => setApplyToExisting(e.target.value as 'new_only' | 'all')}
                    className="w-4 h-4 mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-orange-900">⚠️ ทั้งรายการใหม่และรายการเก่า</span>
                    <p className="text-xs text-orange-700 mt-1">
                      อัพเดทกำหนดเวลาให้กับรายการที่ <strong>ยังไม่ได้อัพโหลดสลิป</strong> ({pendingRegistrationsCount} รายการ)
                    </p>
                    <p className="text-xs text-orange-600 mt-1 italic">
                      * รายการที่มีสถานะ &quot;รอตรวจสอบ&quot; จะไม่เปลี่ยนแปลง
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeadlineModal(false);
                  setDeadlineChangeType(null);
                  setApplyToExisting('new_only');
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  setShowDeadlineModal(false);
                  await submitEventData();
                  setDeadlineChangeType(null);
                  setApplyToExisting('new_only');
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                ยืนยันการเปลี่ยนแปลง
              </button>
            </div>
          </div>
        </div>
      )}

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
