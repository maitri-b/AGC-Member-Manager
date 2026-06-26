'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';

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
  depositAmount?: number;
  depositPercentage?: number;
  useDepositPercentage?: boolean;
  depositDeadlineType?: 'none' | 'fixed' | 'hours';
  depositDeadlineFixed?: string;
  depositDeadlineHours?: number;
  remainingDeadlineType?: 'none' | 'fixed' | 'hours';
  remainingDeadlineFixed?: string;
  remainingDeadlineHours?: number;
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
  // Deposit payment configuration (New)
  paymentMode: 'full' | 'deposit';
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
}

const initialFormData: EventFormData = {
  eventName: '',
  eventNameEN: '',
  eventDate: '',
  location: '',
  description: '',
  sheetName: '',
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
  // Deposit payment configuration (New)
  paymentMode: 'full',
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
};

export default function AdminEventsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [summaries, setSummaries] = useState<Map<string, EventSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [formData, setFormData] = useState<EventFormData>(initialFormData);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  // Dropdown menu state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    fetchEvents();
    fetchSummaries();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/admin/events');
      if (response.ok) {
        const data = await response.json();
        setEvents(data.events || []);
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

  const handleOpenModal = (event?: Event) => {
    if (event) {
      setEditingEvent(event);
      setFormData({
        eventName: event.eventName,
        eventNameEN: event.eventNameEN,
        eventDate: event.eventDate,
        location: event.location,
        description: event.description,
        sheetName: event.sheetName,
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
        // Deposit payment configuration (New)
        paymentMode: event.paymentMode ?? 'full',
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
      });
    } else {
      setEditingEvent(null);
      setFormData(initialFormData);
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
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update event');
        }

        setSuccess('อัพเดทกิจกรรมเรียบร้อยแล้ว');
      } else {
        // Create new event
        const response = await fetch('/api/admin/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
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

  const handleExportExcel = async (event: Event) => {
    try {
      const response = await fetch(`/api/events/${event.eventId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch event data');
      }

      const data = await response.json();
      const attendees = data.attendees || [];

      // Prepare data for Excel
      const excelData = attendees.map((a: any) => ({
        'รหัสลงทะเบียน': a.registration?.registrationId || '',
        'ชื่อบริษัท': a.registration?.companyName || '',
        'เลขใบอนุญาต': a.registration?.licenseNumber || '',
        'ผู้ติดต่อ': a.registration?.contactName || '',
        'เบอร์โทร': a.registration?.contactPhone || '',
        'จำนวนผู้เข้าร่วม': a.registration?.attendeeCount || 0,
        'รายชื่อผู้เข้าร่วม': a.registration?.attendeeNames || '',
        'สถานะ': a.registration?.status || '',
        'MemberID': a.member?.memberId || 'ไม่พบ',
      }));

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'รายชื่อผู้เข้าร่วม');

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

      // Create text list
      const textList = attendees
        .map((a: any, index: number) => {
          const companyName = a.registration?.companyName || 'ไม่ระบุ';
          const contactName = a.registration?.contactName || 'ไม่ระบุ';
          const phone = a.registration?.contactPhone || 'ไม่ระบุ';
          const attendeeNames = a.registration?.attendeeNames || '';
          return `${index + 1}. ${companyName}\n   ผู้ติดต่อ: ${contactName}\n   เบอร์โทร: ${phone}\n   รายชื่อผู้เข้าร่วม: ${attendeeNames}`;
        })
        .join('\n\n');

      const fullText = `รายชื่อผู้ลงทะเบียน: ${event.eventName}\n\n${textList}`;

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

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAdmin) {
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
              <Link href="/admin" className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">จัดการกิจกรรม</h1>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              เพิ่มกิจกรรมใหม่
            </button>
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

        {/* Info Box */}
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

        {/* Events Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  กิจกรรม
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ปี
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sheet Name
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  บริษัท / คน / สมาชิก
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  สถานะ
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    ยังไม่มีกิจกรรม กดปุ่ม &quot;เพิ่มกิจกรรมใหม่&quot; เพื่อเริ่มต้น
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.eventId} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{event.eventName}</div>
                        {event.eventNameEN && (
                          <div className="text-sm text-gray-500">{event.eventNameEN}</div>
                        )}
                        {event.location && (
                          <div className="text-xs text-gray-400 mt-1">
                            <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            </svg>
                            {event.location}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">พ.ศ. {event.year}</div>
                      <div className="text-xs text-gray-500">ค.ศ. {event.year - 543}</div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{event.sheetName}</code>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {loadingSummaries ? (
                        <span className="text-gray-400 text-sm">กำลังโหลด...</span>
                      ) : summaries.has(event.eventId) ? (
                        <div className="text-sm">
                          <span className="font-semibold text-blue-600" title="จำนวนบริษัท (unique license)">
                            {summaries.get(event.eventId)?.agentRegistrations || 0}
                          </span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="font-semibold text-indigo-600" title="จำนวนคน (รวม attendeeCount)">
                            {summaries.get(event.eventId)?.totalAttendees || 0}
                          </span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="font-semibold text-purple-600" title="สมาชิกชมรม">
                            {summaries.get(event.eventId)?.clubMemberCount || 0}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
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
                        {event.isPublished && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Published
                          </span>
                        )}
                        {event.registrationOpen && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            เปิดรับสมัคร
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {event.registrationFee ? `฿${event.registrationFee.toLocaleString()}` : 'ฟรี'}
                        {event.maxCapacity > 0 && ` | รับ ${event.maxCapacity} คน`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="relative inline-block">
                        <button
                          onClick={() => setOpenDropdown(openDropdown === event.eventId ? null : event.eventId)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>

                        {openDropdown === event.eventId && (
                          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                            <Link
                              href={`/admin/events/${event.eventId}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              onClick={() => setOpenDropdown(null)}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              ดูรายชื่อ
                            </Link>
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
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
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
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min={2500}
                    max={2600}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่จัดกิจกรรม
                  </label>
                  <input
                    type="text"
                    value={formData.eventDate}
                    onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                    placeholder="เช่น 15/03/2568 หรือ 2025"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อ Sheet ใน Google Sheets <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.sheetName}
                    onChange={(e) => setFormData({ ...formData, sheetName: e.target.value })}
                    placeholder="เช่น AGM 2026 Registration"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ต้องตรงกับชื่อ Sheet ที่สร้างไว้ใน Google Spreadsheet
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
                        value={formData.maxCapacity}
                        onChange={(e) => setFormData({ ...formData, maxCapacity: parseInt(e.target.value) || 0 })}
                        placeholder="0 = ไม่จำกัด"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min={0}
                      />
                      <p className="text-xs text-gray-500 mt-1">กรอก 0 หากไม่จำกัดจำนวน</p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        ประเภทการคิดราคา
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="fixed"
                            checked={formData.pricingType === 'fixed'}
                            onChange={(e) => setFormData({ ...formData, pricingType: 'fixed' })}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-sm">ราคาเหมา (Fixed) - ทุกคนจ่ายเท่ากัน</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="tiered"
                            checked={formData.pricingType === 'tiered'}
                            onChange={(e) => setFormData({ ...formData, pricingType: 'tiered' })}
                            className="w-4 h-4 text-blue-600"
                          />
                          <span className="text-sm">ราคาขั้นบันได (Tiered) - คนแรกและคนที่ 2+ ราคาต่างกัน</span>
                        </label>
                      </div>
                    </div>

                    {formData.pricingType === 'tiered' ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            ราคาคนแรก (บาท)
                          </label>
                          <input
                            type="number"
                            value={formData.baseFee}
                            onChange={(e) => setFormData({ ...formData, baseFee: parseInt(e.target.value) || 0 })}
                            placeholder="0 = ฟรี"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min={0}
                          />
                          <p className="text-xs text-gray-500 mt-1">ราคาสำหรับคนแรก</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            ราคาคนที่ 2+ (บาท/คน)
                          </label>
                          <input
                            type="number"
                            value={formData.additionalFeePerPerson}
                            onChange={(e) => setFormData({ ...formData, additionalFeePerPerson: parseInt(e.target.value) || 0 })}
                            placeholder="0 = ฟรี"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min={0}
                          />
                          <p className="text-xs text-gray-500 mt-1">ราคาสำหรับคนที่ 2 เป็นต้นไป</p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            ส่วนลดสมาชิก (บาท)
                          </label>
                          <input
                            type="number"
                            value={formData.memberDiscount}
                            onChange={(e) => setFormData({ ...formData, memberDiscount: parseInt(e.target.value) || 0 })}
                            placeholder="0 = ไม่มีส่วนลด"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            min={0}
                          />
                          <p className="text-xs text-gray-500 mt-1">ส่วนลดจากราคารวม (บาท)</p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ค่าสมัคร (บาท/คน)
                        </label>
                        <input
                          type="number"
                          value={formData.registrationFee}
                          onChange={(e) => setFormData({ ...formData, registrationFee: parseInt(e.target.value) || 0 })}
                          placeholder="0 = ฟรี"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min={0}
                        />
                        <p className="text-xs text-gray-500 mt-1">กรอก 0 หากไม่มีค่าใช้จ่าย</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        จำนวนที่อนุญาตต่อ 1 บริษัท
                      </label>
                      <input
                        type="number"
                        value={formData.maxPerCompany}
                        onChange={(e) => setFormData({ ...formData, maxPerCompany: parseInt(e.target.value) || 0 })}
                        placeholder="0 = ไม่จำกัด"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min={0}
                      />
                      <p className="text-xs text-gray-500 mt-1">จำกัดจำนวนผู้เข้าร่วมต่อ 1 บริษัท (0 = ไม่จำกัด)</p>
                    </div>
                  </div>
                </div>

                {/* Deposit Payment Configuration (NEW) */}
                {((formData.pricingType === 'fixed' && formData.registrationFee > 0) ||
                  (formData.pricingType === 'tiered' && (formData.baseFee > 0 || formData.additionalFeePerPerson > 0))) && (
                  <div className="md:col-span-2 border-t pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">
                      ตั้งค่าการชำระเงิน (Deposit System)
                    </h3>

                    {/* Payment Mode Radio */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        รูปแบบการชำระเงิน
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
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            value="deposit"
                            checked={formData.paymentMode === 'deposit'}
                            onChange={() => setFormData({ ...formData, paymentMode: 'deposit' })}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">ชำระแบบมัดจำ (Deposit) - แบ่ง 2 งวด</span>
                        </label>
                      </div>
                    </div>

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
                              onChange={(e) => setFormData({ ...formData, depositAmount: parseInt(e.target.value) || 0 })}
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
                              onChange={(e) => setFormData({ ...formData, depositPercentage: parseInt(e.target.value) || 0 })}
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
                            <input
                              type="date"
                              value={formData.depositDeadlineFixed || ''}
                              onChange={(e) => setFormData({ ...formData, depositDeadlineFixed: e.target.value })}
                              className="w-full px-3 py-2 border rounded-md"
                            />
                          )}

                          {formData.depositDeadlineType === 'hours' && (
                            <div>
                              <input
                                type="number"
                                value={formData.depositDeadlineHours || ''}
                                onChange={(e) => setFormData({ ...formData, depositDeadlineHours: parseInt(e.target.value) || 0 })}
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
                            <input
                              type="date"
                              value={formData.remainingDeadlineFixed || ''}
                              onChange={(e) => setFormData({ ...formData, remainingDeadlineFixed: e.target.value })}
                              className="w-full px-3 py-2 border rounded-md"
                            />
                          )}

                          {formData.remainingDeadlineType === 'hours' && (
                            <div>
                              <input
                                type="number"
                                value={formData.remainingDeadlineHours || ''}
                                onChange={(e) => setFormData({ ...formData, remainingDeadlineHours: parseInt(e.target.value) || 0 })}
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
                {((formData.pricingType === 'fixed' && formData.registrationFee > 0) ||
                  (formData.pricingType === 'tiered' && (formData.baseFee > 0 || formData.additionalFeePerPerson > 0))) && (
                  <div className="md:col-span-2 border-t pt-4 mt-2">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">ข้อมูลการชำระเงิน</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ธนาคาร
                        </label>
                        <input
                          type="text"
                          value={formData.paymentBankName}
                          onChange={(e) => setFormData({ ...formData, paymentBankName: e.target.value })}
                          placeholder="เช่น ธนาคารกสิกรไทย"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ชื่อบัญชี
                        </label>
                        <input
                          type="text"
                          value={formData.paymentAccountName}
                          onChange={(e) => setFormData({ ...formData, paymentAccountName: e.target.value })}
                          placeholder="ชื่อบัญชีธนาคาร"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          เลขที่บัญชี
                        </label>
                        <input
                          type="text"
                          value={formData.paymentAccountNumber}
                          onChange={(e) => setFormData({ ...formData, paymentAccountNumber: e.target.value })}
                          placeholder="เลขบัญชีธนาคาร"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Link รูป QR Code
                        </label>
                        <input
                          type="url"
                          value={formData.paymentQrCodeUrl}
                          onChange={(e) => setFormData({ ...formData, paymentQrCodeUrl: e.target.value })}
                          placeholder="https://..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

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
                    </div>
                  </div>
                )}

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
    </div>
  );
}
