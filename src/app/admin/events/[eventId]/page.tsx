'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import * as XLSX from 'xlsx';
import { formatDeadline, getTimeRemaining } from '@/lib/payment-deadlines';
import { getStatusBadgeClass } from '@/lib/payment-status';

interface Event {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  location: string;
  description: string;
  year: number;
  // Attendee type pricing
  useAttendeeTypePricing?: boolean;
  attendeeTypes?: Array<{
    typeId: string;
    typeName: string;
    price: number;
    isActive: boolean;
    sortOrder: number;
  }>;
  // Room allocation
  roomTypes?: Array<{
    typeId: string;
    typeName: string;
    capacity: number;
    price: number;
    isActive: boolean;
    sortOrder: number;
  }>;
}

interface Attendee {
  registration: {
    registrationId: string;
    registrationDate: string;
    companyName: string;
    contactName: string;
    licenseNumber: string;
    attendeeCount: number;
    attendeeNames: string;
    status: string;
    checkinSections: string;
    tableNumber: string;
    contactPhone: string;
    contactEmail: string;
    // Deposit payment fields (New)
    totalAmount: number;
    depositAmount: number;
    remainingAmount: number;
    depositPaid: boolean;
    depositPaidDate: string;
    depositSlipUrl: string;
    remainingSlipUrl: string;
    depositDeadline: string;
    remainingDeadline: string;
    paymentStatus: string;
    // Attendee type pricing and room allocation (New)
    attendeeTypeSelections?: string; // JSON stringified
    roomAllocations?: string; // JSON stringified
    // Special charges (New)
    specialCharges?: string; // JSON stringified
    // Special requests (New)
    specialRequests?: string;
  };
  member: {
    memberId: string;
    fullNameTH: string;
    companyNameTH: string;
  } | null;
  lineProfile: {
    lineDisplayName: string;
    lineProfilePicture: string;
  } | null;
  isConfirmed: boolean;
}

interface EventData {
  event: Event;
  summary: {
    totalRegistrations: number;
    agentRegistrations: number;    // Unique companies (by license)
    confirmedCount: number;         // Unique confirmed companies
    totalAttendees: number;         // Total people (sum of attendeeCount)
    clubMemberCount: number;
    verifiedMemberCount: number;
  };
  attendees: Attendee[];
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const { data: session, status } = useSession();
  const router = useRouter();
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedRegistrations, setExpandedRegistrations] = useState<Set<string>>(new Set());
  const [editingRegistration, setEditingRegistration] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    attendeeCount: number;
    attendeeNames: string[];
    status: string;
    contactPhone?: string;
    contactEmail?: string;
    specialRequests?: string;
    attendeeTypeSelections?: Array<{ typeId: string; quantity: number }>;
    roomAllocations?: Array<{ roomTypeId: string; roomCount: number }>;
  }>({ attendeeCount: 1, attendeeNames: [''], status: 'pending' });
  const [updating, setUpdating] = useState(false);

  // Payment confirmation state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState<{
    registrationId: string;
    paymentType: 'deposit' | 'remaining' | 'full';
    amount: number;
    slipUrl: string;
    paidDate: string;
  }>({
    registrationId: '',
    paymentType: 'deposit',
    amount: 0,
    slipUrl: '',
    paidDate: new Date().toISOString().split('T')[0],
  });
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  // Special charges state
  const [specialChargesModalOpen, setSpecialChargesModalOpen] = useState(false);
  const [specialChargeFormData, setSpecialChargeFormData] = useState<{
    registrationId: string;
    description: string;
    amount: number;
  }>({
    registrationId: '',
    description: '',
    amount: 0,
  });
  const [addingCharge, setAddingCharge] = useState(false);

  // Toggle expand/collapse for registration details
  const toggleExpandRegistration = (registrationId: string) => {
    setExpandedRegistrations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(registrationId)) {
        newSet.delete(registrationId);
      } else {
        newSet.add(registrationId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    if (eventId) {
      fetchEventData();
    }
  }, [eventId]);

  const fetchEventData = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (!response.ok) {
        if (response.status === 403) {
          setError('ไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
        } else if (response.status === 404) {
          setError('ไม่พบกิจกรรมนี้');
        } else {
          setError('ไม่สามารถโหลดข้อมูลได้');
        }
        return;
      }
      const data = await response.json();
      setEventData(data);
    } catch (err) {
      console.error('Error fetching event:', err);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!eventData) return;

    setExportLoading(true);
    setActionMessage(null);

    try {
      // Prepare data for export
      const exportData = filteredAttendees.map((attendee, index) => ({
        'ลำดับ': index + 1,
        'รหัสลงทะเบียน (6 หลัก)': attendee.registration.registrationId,
        'วันเวลาลงทะเบียน': attendee.registration.registrationDate || '',
        'ชื่อบริษัท': attendee.registration.companyName || attendee.member?.companyNameTH || '',
        'เลขใบอนุญาต': attendee.registration.licenseNumber || '',
        'ชื่อผู้ติดต่อ': attendee.registration.contactName || attendee.member?.fullNameTH || attendee.lineProfile?.lineDisplayName || '',
        'จำนวนผู้เข้าร่วม': attendee.registration.attendeeCount || 1,
        'รายชื่อผู้เข้าร่วม': (() => {
          try {
            const names = JSON.parse(attendee.registration.attendeeNames || '[]');
            return Array.isArray(names) ? names.join(', ') : attendee.registration.attendeeNames;
          } catch {
            return attendee.registration.attendeeNames || '';
          }
        })(),
        'รหัสสมาชิก': attendee.member?.memberId || '',
        'สถานะ': attendee.registration.status || '',
        'Check-in': attendee.registration.checkinSections || '',
        'โต๊ะ': attendee.registration.tableNumber || '',
      }));

      // Create workbook
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendees');

      // Generate filename
      const filename = `${eventData.event.eventName}_${new Date().toLocaleDateString('th-TH')}.xlsx`;

      // Download file
      XLSX.writeFile(wb, filename);

      setActionMessage({ type: 'success', text: 'ดาวน์โหลดไฟล์สำเร็จ' });
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      console.error('Error exporting Excel:', err);
      setActionMessage({ type: 'error', text: 'ไม่สามารถ Export ได้' });
    } finally {
      setExportLoading(false);
    }
  };

  const handleCopyList = async () => {
    if (!eventData) return;

    setCopyLoading(true);
    setActionMessage(null);

    try {
      // Format attendee list for copying
      const listText = filteredAttendees.map((attendee, index) => {
        const companyName = attendee.registration.companyName || attendee.member?.companyNameTH || '';
        const contactName = attendee.registration.contactName || attendee.member?.fullNameTH || attendee.lineProfile?.lineDisplayName || '';

        // Parse attendee names
        let attendeeNames = '';
        try {
          const names = JSON.parse(attendee.registration.attendeeNames || '[]');
          attendeeNames = Array.isArray(names) ? names.join(', ') : attendee.registration.attendeeNames;
        } catch {
          attendeeNames = attendee.registration.attendeeNames || contactName;
        }

        const phone = ''; // Phone data would need to be fetched from member data if available

        return `${index + 1}. ${companyName} | ${attendeeNames}${phone ? ' | ' + phone : ''}`;
      }).join('\n');

      // Copy to clipboard
      await navigator.clipboard.writeText(listText);

      setActionMessage({ type: 'success', text: 'คัดลอกรายชื่อแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      console.error('Error copying list:', err);
      setActionMessage({ type: 'error', text: 'ไม่สามารถคัดลอกได้' });
    } finally {
      setCopyLoading(false);
    }
  };

  const handleEditRegistration = (attendee: Attendee) => {
    setEditingRegistration(attendee.registration.registrationId);

    // Parse attendee names
    let names: string[] = [''];
    try {
      const parsed = JSON.parse(attendee.registration.attendeeNames || '[]');
      names = Array.isArray(parsed) ? parsed : [attendee.registration.attendeeNames || ''];
    } catch {
      names = [attendee.registration.attendeeNames || ''];
    }

    // Parse attendee type selections
    let attendeeTypeSelections: Array<{ typeId: string; quantity: number }> = [];
    try {
      if (attendee.registration.attendeeTypeSelections) {
        attendeeTypeSelections = JSON.parse(attendee.registration.attendeeTypeSelections);
      }
    } catch (e) {
      console.error('Error parsing attendeeTypeSelections:', e);
    }

    // Parse room allocations
    let roomAllocations: Array<{ roomTypeId: string; roomCount: number }> = [];
    try {
      if (attendee.registration.roomAllocations) {
        roomAllocations = JSON.parse(attendee.registration.roomAllocations);
      }
    } catch (e) {
      console.error('Error parsing roomAllocations:', e);
    }

    setEditFormData({
      attendeeCount: attendee.registration.attendeeCount || 1,
      attendeeNames: names,
      status: attendee.registration.status || 'pending',
      contactPhone: attendee.registration.contactPhone || '',
      contactEmail: attendee.registration.contactEmail || '',
      specialRequests: attendee.registration.specialRequests || '',
      attendeeTypeSelections,
      roomAllocations,
    });
  };

  const handleCancelEdit = () => {
    setEditingRegistration(null);
    setEditFormData({ attendeeCount: 1, attendeeNames: [''], status: 'pending' });
  };

  const handleSaveEdit = async () => {
    if (!editingRegistration || !eventData) return;

    // Validate attendee type selections (if enabled)
    if (eventData.event.useAttendeeTypePricing && eventData.event.attendeeTypes && eventData.event.attendeeTypes.length > 0) {
      if (!editFormData.attendeeTypeSelections || editFormData.attendeeTypeSelections.length === 0) {
        setActionMessage({ type: 'error', text: 'กรุณาเลือกประเภทผู้เข้าร่วม' });
        return;
      }

      // Note: attendeeCount is already auto-calculated from attendeeTypeSelections
      // No need to validate separately - they will always match
    }

    // Validate room allocations (if room types are configured)
    if (eventData.event.roomTypes && eventData.event.roomTypes.length > 0) {
      if (editFormData.roomAllocations && editFormData.roomAllocations.length > 0) {
        // Calculate total capacity from room allocations
        let totalCapacity = 0;
        for (const alloc of editFormData.roomAllocations) {
          const roomType = eventData.event.roomTypes.find(rt => rt.typeId === alloc.roomTypeId);
          if (roomType) {
            totalCapacity += roomType.capacity * alloc.roomCount;
          }
        }

        // Must match exactly with attendee count
        if (totalCapacity !== editFormData.attendeeCount) {
          setActionMessage({
            type: 'error',
            text: `จำนวนที่นั่งในห้องไม่ตรงกับจำนวนผู้เข้าร่วม (รองรับ ${totalCapacity} คน แต่ลงทะเบียน ${editFormData.attendeeCount} คน)`
          });
          return;
        }
      }
    }

    // Validate attendee names
    const filledNames = editFormData.attendeeNames.filter(name => name.trim());
    if (filledNames.length !== editFormData.attendeeCount) {
      setActionMessage({ type: 'error', text: 'กรุณากรอกชื่อผู้เข้าร่วมให้ครบทุกคน' });
      return;
    }

    setUpdating(true);
    setActionMessage(null);

    try {
      const updateData: any = {
        attendee_count: editFormData.attendeeCount,
        attendee_names: JSON.stringify(filledNames),
        status: editFormData.status,
      };

      // Include contact info
      if (editFormData.contactPhone !== undefined) {
        updateData.contact_phone = editFormData.contactPhone;
      }
      if (editFormData.contactEmail !== undefined) {
        updateData.contact_email = editFormData.contactEmail;
      }

      // Include special requests
      if (editFormData.specialRequests !== undefined) {
        updateData.special_requests = editFormData.specialRequests;
      }

      // Include attendee type selections if present
      if (editFormData.attendeeTypeSelections && editFormData.attendeeTypeSelections.length > 0) {
        updateData.attendee_type_selections = JSON.stringify(editFormData.attendeeTypeSelections);
      }

      // Include room allocations if present
      if (editFormData.roomAllocations && editFormData.roomAllocations.length > 0) {
        updateData.room_allocations = JSON.stringify(editFormData.roomAllocations);
      }

      const response = await fetch(`/api/events/${eventId}/admin-update-registration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId: editingRegistration,
          updateData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถอัพเดทได้');
      }

      setActionMessage({ type: 'success', text: 'อัพเดทข้อมูลเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      handleCancelEdit();
      fetchEventData(); // Refresh data
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleAttendeeCountChange = (count: number) => {
    const currentNames = [...editFormData.attendeeNames];
    if (count > currentNames.length) {
      // Add empty slots
      while (currentNames.length < count) {
        currentNames.push('');
      }
    } else {
      // Trim to new count
      currentNames.length = count;
    }
    setEditFormData({ ...editFormData, attendeeCount: count, attendeeNames: currentNames });
  };

  const handleAttendeeNameChange = (index: number, value: string) => {
    const newNames = [...editFormData.attendeeNames];
    newNames[index] = value;
    setEditFormData({ ...editFormData, attendeeNames: newNames });
  };

  const handleCancelRegistration = async (registrationId: string) => {
    if (!confirm('ยืนยันการยกเลิกการลงทะเบียนนี้?')) return;

    setActionMessage(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/admin-update-registration?registrationId=${registrationId}`,
        { method: 'DELETE' }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถยกเลิกได้');
      }

      setActionMessage({ type: 'success', text: 'ยกเลิกการลงทะเบียนเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      fetchEventData(); // Refresh data
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    }
  };

  const handleOpenPaymentModal = (attendee: Attendee, paymentType: 'deposit' | 'remaining' | 'full' = 'deposit') => {
    // Auto-fill amount based on payment type
    let defaultAmount = 0;
    if (paymentType === 'deposit') {
      defaultAmount = attendee.registration.depositAmount || 0;
    } else if (paymentType === 'remaining') {
      defaultAmount = attendee.registration.remainingAmount || 0;
    } else if (paymentType === 'full') {
      defaultAmount = attendee.registration.totalAmount || 0;
    }

    setPaymentFormData({
      registrationId: attendee.registration.registrationId,
      paymentType,
      amount: defaultAmount,
      slipUrl: paymentType === 'deposit' ? attendee.registration.depositSlipUrl : attendee.registration.remainingSlipUrl,
      paidDate: new Date().toISOString().split('T')[0],
    });
    setPaymentModalOpen(true);
  };

  const handleClosePaymentModal = () => {
    setPaymentModalOpen(false);
    setPaymentFormData({
      registrationId: '',
      paymentType: 'deposit',
      amount: 0,
      slipUrl: '',
      paidDate: new Date().toISOString().split('T')[0],
    });
  };

  const handleConfirmPayment = async () => {
    if (!paymentFormData.paidDate) {
      setActionMessage({ type: 'error', text: 'กรุณาระบุวันที่ชำระเงิน' });
      return;
    }

    if (paymentFormData.amount <= 0) {
      setActionMessage({ type: 'error', text: 'กรุณาระบุจำนวนเงินที่ชำระ' });
      return;
    }

    setConfirmingPayment(true);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/update-payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId: paymentFormData.registrationId,
          paymentType: paymentFormData.paymentType,
          amount: paymentFormData.amount,
          slipUrl: paymentFormData.slipUrl,
          paidDate: paymentFormData.paidDate,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถบันทึกการชำระเงินได้');
      }

      setActionMessage({ type: 'success', text: data.message || 'บันทึกการชำระเงินเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      handleClosePaymentModal();
      fetchEventData(); // Refresh data
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setConfirmingPayment(false);
    }
  };

  const handleOpenSpecialChargeModal = (attendee: Attendee) => {
    setSpecialChargeFormData({
      registrationId: attendee.registration.registrationId,
      description: '',
      amount: 0,
    });
    setSpecialChargesModalOpen(true);
  };

  const handleCloseSpecialChargeModal = () => {
    setSpecialChargesModalOpen(false);
    setSpecialChargeFormData({
      registrationId: '',
      description: '',
      amount: 0,
    });
  };

  const handleAddSpecialCharge = async () => {
    if (!specialChargeFormData.description || specialChargeFormData.amount <= 0) {
      setActionMessage({ type: 'error', text: 'กรุณากรอกรายละเอียดและจำนวนเงิน' });
      return;
    }

    setAddingCharge(true);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/special-charges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(specialChargeFormData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถเพิ่มค่าใช้จ่ายได้');
      }

      setActionMessage({ type: 'success', text: data.message || 'เพิ่มค่าใช้จ่ายพิเศษเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      handleCloseSpecialChargeModal();
      fetchEventData(); // Refresh data
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setAddingCharge(false);
    }
  };

  const handleDeleteSpecialCharge = async (registrationId: string, chargeId: string) => {
    if (!confirm('ยืนยันการลบค่าใช้จ่ายพิเศษนี้?')) return;

    setActionMessage(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/special-charges?registrationId=${registrationId}&chargeId=${chargeId}`,
        { method: 'DELETE' }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถลบค่าใช้จ่ายได้');
      }

      setActionMessage({ type: 'success', text: data.message || 'ลบค่าใช้จ่ายพิเศษเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      fetchEventData(); // Refresh data
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    }
  };

  const filteredAttendees = eventData?.attendees.filter(attendee => {
    // Filter by status
    if (filter === 'confirmed' && !attendee.isConfirmed) return false;
    if (filter === 'pending' && attendee.isConfirmed) return false;

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchCompany = attendee.registration.companyName?.toLowerCase().includes(term) ||
                          attendee.member?.companyNameTH?.toLowerCase().includes(term);
      const matchName = attendee.registration.contactName?.toLowerCase().includes(term) ||
                       attendee.member?.fullNameTH?.toLowerCase().includes(term) ||
                       attendee.lineProfile?.lineDisplayName?.toLowerCase().includes(term);
      const matchLicense = attendee.registration.licenseNumber?.toLowerCase().includes(term);
      const matchMemberId = attendee.member?.memberId?.toLowerCase().includes(term);
      const matchRegistrationId = attendee.registration.registrationId?.toLowerCase().includes(term);

      return matchCompany || matchName || matchLicense || matchMemberId || matchRegistrationId;
    }

    return true;
  }) || [];

  const isCommitteeOrAdmin = session?.user?.permissions?.includes('members:list') ||
                             session?.user?.permissions?.includes('admin:access');

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isCommitteeOrAdmin) {
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">{error}</h1>
          <Link href="/admin/events" className="text-blue-600 hover:underline">
            กลับหน้าจัดการกิจกรรม
          </Link>
        </div>
      </div>
    );
  }

  if (!eventData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/admin/events" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{eventData.event.eventName}</h1>
              {eventData.event.eventNameEN && (
                <p className="text-sm text-gray-500">{eventData.event.eventNameEN}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{eventData.summary.agentRegistrations}</p>
            <p className="text-sm text-gray-500">บริษัทลงทะเบียน</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-indigo-600">{eventData.summary.totalAttendees || 0}</p>
            <p className="text-sm text-gray-500">จำนวนผู้เข้าร่วม</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center border-2 border-purple-200">
            <p className="text-3xl font-bold text-purple-600">{eventData.summary.clubMemberCount || 0}</p>
            <p className="text-sm text-gray-500">สมาชิกชมรม</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center border-2 border-green-200">
            <p className="text-3xl font-bold text-green-600">{eventData.summary.verifiedMemberCount}</p>
            <p className="text-sm text-gray-500">ยืนยันตัวตนแล้ว</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-teal-600">{eventData.summary.confirmedCount}</p>
            <p className="text-sm text-gray-500">บริษัทยืนยันแล้ว</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-orange-600">
              {eventData.summary.agentRegistrations - eventData.summary.confirmedCount}
            </p>
            <p className="text-sm text-gray-500">รอดำเนินการ</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center bg-gray-50">
            <p className="text-2xl font-bold text-gray-500">{eventData.summary.totalRegistrations}</p>
            <p className="text-xs text-gray-400">รายการทั้งหมด</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="ค้นหาชื่อ, บริษัท, เลขใบอนุญาต, รหัสสมาชิก..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ทั้งหมด ({eventData.attendees.length})
              </button>
              <button
                onClick={() => setFilter('confirmed')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === 'confirmed'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ยืนยันแล้ว ({eventData.summary.confirmedCount})
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === 'pending'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                รอดำเนินการ ({eventData.attendees.length - eventData.summary.confirmedCount})
              </button>
            </div>
          </div>
        </div>

        {/* Attendees List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              รายชื่อผู้เข้าร่วม ({filteredAttendees.length} รายการ)
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportExcel}
                disabled={exportLoading || filteredAttendees.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    กำลัง Export...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export Excel
                  </>
                )}
              </button>
              <button
                onClick={handleCopyList}
                disabled={copyLoading || filteredAttendees.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {copyLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    กำลังคัดลอก...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy รายชื่อ
                  </>
                )}
              </button>
            </div>
          </div>

          {filteredAttendees.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {searchTerm || filter !== 'all' ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีผู้ลงทะเบียน'}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredAttendees.map((attendee, index) => {
                const isEditing = editingRegistration === attendee.registration.registrationId;

                return (
                <div key={attendee.registration.registrationId || index} className="p-4 hover:bg-gray-50">
                  {/* Header Section with LINE Profile - Horizontal Layout */}
                  <div className="flex items-start gap-4 mb-3">
                    {/* LINE Profile Picture */}
                    <div className="flex-shrink-0">
                      {attendee.lineProfile?.lineProfilePicture ? (
                        <Image
                          src={attendee.lineProfile.lineProfilePicture}
                          alt={attendee.lineProfile.lineDisplayName || 'Profile'}
                          width={56}
                          height={56}
                          className="rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Basic Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {/* Name from LINE profile or registration */}
                        <h3 className="font-medium text-gray-900 truncate">
                          {attendee.lineProfile?.lineDisplayName ||
                           attendee.member?.fullNameTH ||
                           attendee.registration.contactName ||
                           'ไม่ระบุชื่อ'}
                        </h3>

                        {/* Club Member badge */}
                        {attendee.member?.memberId && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            สมาชิก AC
                          </span>
                        )}

                        {/* Member ID badge */}
                        {attendee.member?.memberId && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {attendee.member.memberId}
                          </span>
                        )}

                        {/* Status badge */}
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          attendee.isConfirmed
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {attendee.isConfirmed ? 'ยืนยันเข้าร่วม' : 'รอดำเนินการ'}
                        </span>

                        {/* Has LINE badge - verified member */}
                        {attendee.lineProfile && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                            </svg>
                            ยืนยันแล้ว
                          </span>
                        )}
                      </div>

                      {/* Company info */}
                      <p className="text-sm text-gray-600 truncate">
                        {attendee.member?.companyNameTH || attendee.registration.companyName || '-'}
                      </p>

                      {/* License & additional info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                        {attendee.registration.registrationId && (
                          <span className="text-indigo-600 font-semibold">🎫 รหัส: {attendee.registration.registrationId}</span>
                        )}
                        {attendee.registration.registrationDate && (
                          <span className="text-blue-600 font-medium">📅 ลงทะเบียน: {attendee.registration.registrationDate}</span>
                        )}
                        {attendee.registration.licenseNumber && (
                          <span>ใบอนุญาต: {attendee.registration.licenseNumber}</span>
                        )}
                        {attendee.registration.attendeeCount > 0 && (
                          <span>จำนวน: {attendee.registration.attendeeCount} คน</span>
                        )}
                        {attendee.registration.tableNumber && (
                          <span>โต๊ะ: {attendee.registration.tableNumber}</span>
                        )}
                      </div>

                      {/* Attendee names if multiple */}
                      {attendee.registration.attendeeNames && attendee.registration.attendeeCount > 1 && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          ผู้ร่วม: {attendee.registration.attendeeNames}
                        </p>
                      )}
                    </div>

                    {/* Expand/Collapse & Edit/Cancel Buttons */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => toggleExpandRegistration(attendee.registration.registrationId)}
                        className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title={expandedRegistrations.has(attendee.registration.registrationId) ? "ซ่อนรายละเอียด" : "แสดงรายละเอียด"}
                      >
                        <svg
                          className={`w-5 h-5 transition-transform duration-200 ${expandedRegistrations.has(attendee.registration.registrationId) ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => isEditing ? setEditingRegistration(null) : handleEditRegistration(attendee)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title={isEditing ? "ยกเลิกการแก้ไข" : "แก้ไขข้อมูล"}
                      >
                        {isEditing ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Full-Width Cards Section - Below Header (Expandable) */}
                  {expandedRegistrations.has(attendee.registration.registrationId) && (
                    <div className="space-y-3 mt-3 pt-3 border-t border-gray-200">
                      {/* View-Only Cards - Hide when editing */}
                      {!isEditing && (
                        <>
                          {/* Attendee Type Selections Display */}
                        {(() => {
                          try {
                            if (attendee.registration.attendeeTypeSelections) {
                              const selections = JSON.parse(attendee.registration.attendeeTypeSelections);
                              if (selections && selections.length > 0) {
                                return (
                                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                    <p className="text-xs font-semibold text-blue-900 mb-2">ประเภทผู้เข้าร่วม:</p>
                                    <div className="space-y-1">
                                      {selections.map((sel: any, idx: number) => {
                                        const type = eventData?.event?.attendeeTypes?.find((t: any) => t.typeId === sel.typeId);
                                        return type ? (
                                          <div key={idx} className="text-xs text-gray-700">
                                            • {type.typeName}: {sel.quantity} คน
                                          </div>
                                        ) : null;
                                      })}
                                    </div>
                                  </div>
                                );
                              }
                            }
                          } catch (e) {
                            console.error('Error parsing attendee types:', e);
                          }
                          return null;
                        })()}

                        {/* Room Allocations Display */}
                        {(() => {
                          try {
                            if (attendee.registration.roomAllocations) {
                              const allocations = JSON.parse(attendee.registration.roomAllocations);
                              if (allocations && allocations.length > 0) {
                                return (
                                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                                    <p className="text-xs font-semibold text-amber-900 mb-2">การจัดห้องพัก:</p>
                                    <div className="space-y-1">
                                      {allocations.map((alloc: any, idx: number) => {
                                        const roomType = eventData?.event?.roomTypes?.find((rt: any) => rt.typeId === alloc.roomTypeId);
                                        return roomType ? (
                                          <div key={idx} className="text-xs text-gray-700">
                                            • {roomType.typeName}: {alloc.roomCount} ห้อง (รองรับ {roomType.capacity * alloc.roomCount} คน)
                                          </div>
                                        ) : null;
                                      })}
                                    </div>
                                  </div>
                                );
                              }
                            }
                          } catch (e) {
                            console.error('Error parsing room allocations:', e);
                          }
                          return null;
                        })()}

                        {/* Special Requests Display */}
                        {attendee.registration.specialRequests && attendee.registration.specialRequests.trim() !== '' && (
                          <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                            <p className="text-xs font-semibold text-yellow-900 mb-2">ความต้องการพิเศษ:</p>
                            <p className="text-xs text-gray-700 whitespace-pre-line">{attendee.registration.specialRequests}</p>
                          </div>
                        )}
                      </>
                    )}

                    {/* Edit Form - Positioned BEFORE Special Charges */}
                    {isEditing && (
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          {/* Show attendee count input only if NOT using attendee type pricing */}
                          {!eventData?.event?.useAttendeeTypePricing ? (
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                จำนวนผู้เข้าร่วม
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={editFormData.attendeeCount}
                                onChange={(e) => handleAttendeeCountChange(parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                จำนวนผู้เข้าร่วมทั้งหมด
                              </label>
                              <div className="w-full px-3 py-1.5 text-sm bg-gray-100 border border-gray-300 rounded font-semibold text-blue-700">
                                {editFormData.attendeeCount} คน
                              </div>
                              <p className="text-xs text-gray-500 mt-1">คำนวณจากประเภทผู้เข้าร่วม</p>
                            </div>
                          )}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              สถานะ
                            </label>
                            <select
                              value={editFormData.status}
                              onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="pending">รอดำเนินการ</option>
                              <option value="confirmed">ยืนยันแล้ว</option>
                              <option value="cancelled">ยกเลิก</option>
                            </select>
                          </div>
                        </div>

                        {/* Attendee Names */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            ชื่อผู้เข้าร่วม
                          </label>
                          <div className="space-y-2">
                            {Array.from({ length: editFormData.attendeeCount }).map((_, index) => (
                              <input
                                key={index}
                                type="text"
                                value={editFormData.attendeeNames[index] || ''}
                                onChange={(e) => handleAttendeeNameChange(index, e.target.value)}
                                placeholder={index === 0 ? 'ชื่อผู้ติดต่อ' : `ชื่อผู้เข้าร่วมคนที่ ${index + 1}`}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ))}
                          </div>
                        </div>

                        {/* Attendee Type Selections (Editable) */}
                        {eventData?.event?.useAttendeeTypePricing && eventData?.event?.attendeeTypes && eventData.event.attendeeTypes.length > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <label className="block text-xs font-semibold text-blue-900 mb-2">
                              ประเภทผู้เข้าร่วม
                            </label>
                            <div className="space-y-2">
                              {eventData.event.attendeeTypes
                                .filter((t: any) => t.isActive)
                                .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                                .map((type: any) => {
                                  const selection = editFormData.attendeeTypeSelections?.find(s => s.typeId === type.typeId);
                                  const quantity = selection?.quantity || 0;
                                  const subtotal = type.price * quantity;
                                  return (
                                    <div key={type.typeId} className="flex items-center gap-2 bg-white p-2 rounded">
                                      <span className="text-xs font-medium text-gray-700 flex-1">
                                        {type.typeName} <span className="text-gray-500">({type.price.toLocaleString()} บาท/คน)</span>
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="50"
                                        value={quantity === 0 ? '' : quantity}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const qty = value === '' ? 0 : parseInt(value);
                                          const newSelections = (editFormData.attendeeTypeSelections || []).filter(s => s.typeId !== type.typeId);
                                          if (qty > 0) {
                                            newSelections.push({ typeId: type.typeId, quantity: qty });
                                          }

                                          // Auto-calculate total attendee count
                                          const totalCount = newSelections.reduce((sum, s) => sum + s.quantity, 0);

                                          // Auto-adjust attendee names array
                                          handleAttendeeCountChange(totalCount);

                                          setEditFormData({ ...editFormData, attendeeTypeSelections: newSelections, attendeeCount: totalCount });
                                        }}
                                        onBlur={(e) => {
                                          if (e.target.value === '') {
                                            const newSelections = (editFormData.attendeeTypeSelections || []).filter(s => s.typeId !== type.typeId);
                                            const totalCount = newSelections.reduce((sum, s) => sum + s.quantity, 0);
                                            handleAttendeeCountChange(totalCount);
                                            setEditFormData({ ...editFormData, attendeeTypeSelections: newSelections, attendeeCount: totalCount });
                                          }
                                        }}
                                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded text-center"
                                        placeholder="0"
                                      />
                                      <span className="text-xs text-gray-600 w-12 text-right">คน</span>
                                      {quantity > 0 && (
                                        <span className="text-xs font-semibold text-blue-600 w-24 text-right">
                                          = {subtotal.toLocaleString()} ฿
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              หมายเหตุ: การแก้ไขจำนวนที่นี่จะคำนวณค่าใช้จ่ายใหม่โดยอัตโนมัติ
                            </p>
                          </div>
                        )}

                        {/* Room Allocations (Editable) */}
                        {eventData?.event?.roomTypes && eventData.event.roomTypes.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <label className="block text-xs font-semibold text-amber-900 mb-2">
                              การจัดห้องพัก
                            </label>
                            <div className="space-y-2">
                              {eventData.event.roomTypes
                                .filter((rt: any) => rt.isActive)
                                .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                                .map((roomType: any) => {
                                  const allocation = editFormData.roomAllocations?.find(ra => ra.roomTypeId === roomType.typeId);
                                  const roomCount = allocation?.roomCount || 0;
                                  const subtotal = roomType.price * roomCount;
                                  return (
                                    <div key={roomType.typeId} className="flex items-center gap-2 bg-white p-2 rounded">
                                      <span className="text-xs font-medium text-gray-700 flex-1">
                                        {roomType.typeName} <span className="text-gray-500">({roomType.price.toLocaleString()} บาท/ห้อง, {roomType.capacity} คน/ห้อง)</span>
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        max="20"
                                        value={roomCount === 0 ? '' : roomCount}
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const count = value === '' ? 0 : parseInt(value);
                                          const newAllocations = (editFormData.roomAllocations || []).filter(ra => ra.roomTypeId !== roomType.typeId);
                                          if (count > 0) {
                                            newAllocations.push({ roomTypeId: roomType.typeId, roomCount: count });
                                          }
                                          setEditFormData({ ...editFormData, roomAllocations: newAllocations });
                                        }}
                                        onBlur={(e) => {
                                          if (e.target.value === '') {
                                            const newAllocations = (editFormData.roomAllocations || []).filter(ra => ra.roomTypeId !== roomType.typeId);
                                            setEditFormData({ ...editFormData, roomAllocations: newAllocations });
                                          }
                                        }}
                                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded text-center"
                                        placeholder="0"
                                      />
                                      <span className="text-xs text-gray-600 w-12 text-right">ห้อง</span>
                                      {roomCount > 0 && (
                                        <span className="text-xs font-semibold text-amber-600 w-24 text-right">
                                          = {subtotal.toLocaleString()} ฿
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              หมายเหตุ: การแก้ไขจำนวนที่นี่จะคำนวณค่าใช้จ่ายใหม่โดยอัตโนมัติ
                            </p>
                          </div>
                        )}

                        {/* Contact Information */}
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <label className="block text-xs font-semibold text-gray-700 mb-2">
                            ข้อมูลติดต่อ
                          </label>
                          <div className="space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">เบอร์โทรศัพท์</label>
                              <input
                                type="text"
                                value={editFormData.contactPhone || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, contactPhone: e.target.value })}
                                placeholder="เบอร์โทรศัพท์"
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">อีเมล</label>
                              <input
                                type="email"
                                value={editFormData.contactEmail || ''}
                                onChange={(e) => setEditFormData({ ...editFormData, contactEmail: e.target.value })}
                                placeholder="อีเมล"
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Special Requests */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            ความต้องการพิเศษ
                          </label>
                          <textarea
                            value={editFormData.specialRequests || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, specialRequests: e.target.value })}
                            placeholder="เช่น ต้องการอาหารเจ, แพ้อาหารทะเล, ต้องการห้องชั้นล่าง"
                            rows={3}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={updating}
                            className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                          >
                            {updating ? 'กำลังบันทึก...' : 'บันทึก'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={updating}
                            className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Special Charges Section - Always visible, reordered BEFORE Payment Status */}
                    {attendee.registration.totalAmount > 0 && (() => {
                      try {
                        const specialCharges = attendee.registration.specialCharges
                          ? JSON.parse(attendee.registration.specialCharges)
                          : [];

                        return (
                          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-semibold text-purple-900">ค่าใช้จ่ายพิเศษ</span>
                              <button
                                onClick={() => handleOpenSpecialChargeModal(attendee)}
                                className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                              >
                                + เพิ่มค่าใช้จ่ายพิเศษ
                              </button>
                            </div>

                            {specialCharges.length > 0 ? (
                              <div className="space-y-2">
                                {specialCharges.map((charge: any) => (
                                  <div key={charge.chargeId} className="flex items-start justify-between bg-white border border-purple-200 rounded p-2">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-800">{charge.description}</p>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        เพิ่มเมื่อ: {new Date(charge.addedAt).toLocaleDateString('th-TH', {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                      <span className="text-sm font-bold text-purple-700">
                                        +฿{charge.amount.toLocaleString()}
                                      </span>
                                      <button
                                        onClick={() => handleDeleteSpecialCharge(attendee.registration.registrationId, charge.chargeId)}
                                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                                        title="ลบค่าใช้จ่ายพิเศษ"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <div className="pt-2 border-t border-purple-200">
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="font-medium text-gray-600">รวมค่าใช้จ่ายพิเศษ:</span>
                                    <span className="font-bold text-purple-700">
                                      +฿{specialCharges.reduce((sum: number, c: any) => sum + c.amount, 0).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 italic">ไม่มีค่าใช้จ่ายพิเศษ</p>
                            )}
                          </div>
                        );
                      } catch (e) {
                        console.error('Error parsing special charges:', e);
                        return null;
                      }
                    })()}

                    {/* Payment Status & Actions - Moved AFTER Special Charges */}
                    {attendee.registration.totalAmount > 0 && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-gray-700">สถานะการชำระเงิน</h4>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(attendee.registration.paymentStatus)}`}>
                              {attendee.registration.paymentStatus}
                            </span>
                          </div>

                          <div className="space-y-2 text-xs">
                            {/* Total Amount */}
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">ยอดรวมทั้งหมด:</span>
                              <span className="font-semibold">฿{attendee.registration.totalAmount.toLocaleString()}</span>
                            </div>

                            {/* Deposit Payment Section */}
                            {attendee.registration.depositAmount > 0 && (
                              <>
                                <div className="border-t pt-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-gray-600 font-medium">มัดจำ:</span>
                                    <span className="font-semibold">฿{attendee.registration.depositAmount.toLocaleString()}</span>
                                  </div>
                                  {attendee.registration.depositDeadline && (
                                    <div className="text-gray-500 text-xs">
                                      กำหนด: {formatDeadline(attendee.registration.depositDeadline)}
                                      <br />
                                      <span className="text-orange-600">{getTimeRemaining(attendee.registration.depositDeadline)}</span>
                                    </div>
                                  )}
                                  {attendee.registration.depositPaid ? (
                                    <div className="mt-1 flex items-center gap-2 text-green-600">
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                      </svg>
                                      ชำระแล้ว {attendee.registration.depositPaidDate && `(${formatDeadline(attendee.registration.depositPaidDate)})`}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleOpenPaymentModal(attendee, 'deposit')}
                                      className="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                                    >
                                      ✓ บันทึกการชำระเงิน
                                    </button>
                                  )}
                                </div>

                                {/* Remaining Payment Section (show if deposit paid) */}
                                {attendee.registration.depositPaid && attendee.registration.remainingAmount > 0 && (
                                  <div className="border-t pt-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-gray-600 font-medium">ยอดคงเหลือ:</span>
                                      <span className="font-semibold text-orange-600">฿{attendee.registration.remainingAmount.toLocaleString()}</span>
                                    </div>
                                    {attendee.registration.remainingDeadline && (
                                      <div className="text-gray-500 text-xs">
                                        กำหนด: {formatDeadline(attendee.registration.remainingDeadline)}
                                        <br />
                                        <span className="text-orange-600">{getTimeRemaining(attendee.registration.remainingDeadline)}</span>
                                      </div>
                                    )}
                                    {attendee.registration.remainingSlipUrl ? (
                                      <div className="mt-1 flex items-center gap-2 text-green-600">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                        ชำระครบแล้ว
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleOpenPaymentModal(attendee, 'remaining')}
                                        className="mt-2 w-full px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                      >
                                        ✓ บันทึกการชำระเงิน
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Payment Confirmation Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              บันทึกการชำระเงิน
            </h2>

            <div className="space-y-4">
              {/* Payment Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ประเภทการชำระเงิน *
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer p-2 border rounded hover:bg-gray-50">
                    <input
                      type="radio"
                      value="deposit"
                      checked={paymentFormData.paymentType === 'deposit'}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentType: e.target.value as 'deposit' | 'remaining' | 'full' })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm">ชำระมัดจำ (งวดที่ 1)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-2 border rounded hover:bg-gray-50">
                    <input
                      type="radio"
                      value="remaining"
                      checked={paymentFormData.paymentType === 'remaining'}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentType: e.target.value as 'deposit' | 'remaining' | 'full' })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm">ชำระยอดที่เหลือ (งวดที่ 2)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-2 border rounded hover:bg-gray-50">
                    <input
                      type="radio"
                      value="full"
                      checked={paymentFormData.paymentType === 'full'}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentType: e.target.value as 'deposit' | 'remaining' | 'full' })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm font-semibold text-green-700">ชำระเต็มจำนวน (ทั้งหมด)</span>
                  </label>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จำนวนเงินที่ชำระ (บาท) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentFormData.amount === 0 ? '' : paymentFormData.amount}
                  onChange={(e) => {
                    const value = e.target.value;
                    const amount = value === '' ? 0 : parseFloat(value);
                    setPaymentFormData({ ...paymentFormData, amount });
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') {
                      setPaymentFormData({ ...paymentFormData, amount: 0 });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  ระบุยอดเงินที่ลูกค้าชำระจริง
                </p>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  วันที่ชำระเงิน *
                </label>
                <input
                  type="date"
                  value={paymentFormData.paidDate}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, paidDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  ระบุวันที่ลูกค้าชำระเงินจริง (ใช้สำหรับคำนวณกำหนดชำระส่วนถัดไป)
                </p>
              </div>

              {/* Slip URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL สลิปการโอนเงิน (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={paymentFormData.slipUrl}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, slipUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  อัพโหลดสลิปไปยัง Cloud Storage แล้วใส่ URL ที่นี่
                </p>
              </div>

              {/* Note */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-800">
                  <strong>หมายเหตุ:</strong> การกดยืนยันจะบันทึกการชำระเงินลงในระบบและอัพเดทสถานะอัตโนมัติ
                  {paymentFormData.paymentType === 'deposit' && ' และคำนวณกำหนดชำระยอดคงเหลือ'}
                  {paymentFormData.paymentType === 'full' && ' (ทั้งมัดจำและยอดคงเหลือ)'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleConfirmPayment}
                disabled={confirmingPayment || !paymentFormData.paidDate || paymentFormData.amount <= 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmingPayment ? 'กำลังบันทึก...' : 'ยืนยันการชำระ'}
              </button>
              <button
                onClick={handleClosePaymentModal}
                disabled={confirmingPayment}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Special Charges Modal */}
      {specialChargesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              เพิ่มค่าใช้จ่ายพิเศษ
            </h2>

            <div className="space-y-4">
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายการค่าใช้จ่าย *
                </label>
                <input
                  type="text"
                  value={specialChargeFormData.description}
                  onChange={(e) => setSpecialChargeFormData({ ...specialChargeFormData, description: e.target.value })}
                  placeholder="เช่น ค่าตั๋วเครื่องบินเพิ่มเติม, อัพเกรดห้องพัก"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  ระบุรายละเอียดของค่าใช้จ่ายพิเศษ
                </p>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  จำนวนเงิน (บาท) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={specialChargeFormData.amount === 0 ? '' : specialChargeFormData.amount}
                  onChange={(e) => {
                    const value = e.target.value;
                    const amount = value === '' ? 0 : parseFloat(value);
                    setSpecialChargeFormData({ ...specialChargeFormData, amount });
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') {
                      setSpecialChargeFormData({ ...specialChargeFormData, amount: 0 });
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="0.00"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  ระบุยอดเงินที่จะเพิ่มเข้าไปในบิล
                </p>
              </div>

              {/* Note */}
              <div className="bg-purple-50 border border-purple-200 rounded p-3">
                <p className="text-sm text-purple-800">
                  <strong>หมายเหตุ:</strong> ค่าใช้จ่ายพิเศษจะถูกเพิ่มเข้าไปในยอดรวมทั้งหมด และจะแสดงเฉพาะกับสมาชิกท่านนี้เท่านั้น
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddSpecialCharge}
                disabled={addingCharge || !specialChargeFormData.description || specialChargeFormData.amount <= 0}
                className="flex-1 px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingCharge ? 'กำลังเพิ่ม...' : 'เพิ่มค่าใช้จ่าย'}
              </button>
              <button
                onClick={handleCloseSpecialChargeModal}
                disabled={addingCharge}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {actionMessage && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in-up">
          <div className={`flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg ${
            actionMessage.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}>
            {actionMessage.type === 'success' ? (
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="font-medium">{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="ml-2 hover:bg-white/20 rounded p-1 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
