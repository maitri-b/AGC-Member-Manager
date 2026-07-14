'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import * as XLSX from 'xlsx';
import { formatDeadline, getTimeRemaining } from '@/lib/payment-deadlines';
import { getStatusBadgeClass } from '@/lib/payment-status';
import RegisterOnBehalfModal from './RegisterOnBehalfModal';
import PaymentDetailsModal from '@/components/admin/PaymentDetailsModal';

interface Event {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  location: string;
  description: string;
  year: number;
  registrationOpen: boolean;
  isPublished: boolean;
  maxCapacity: number;
  maxPerCompany?: number;
  // Payment mode
  paymentMode?: 'full' | 'deposit';
  depositAmount?: number;
  depositPercentage?: number;
  useDepositPercentage?: boolean;
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
  // Registration edit control
  requireAttendeeNames?: boolean;
}

interface Attendee {
  registration: {
    registrationId: string;
    registrationDate: string;
    companyName: string;
    contactName: string;
    licenseNumber: string;
    lineUserId: string;
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
    role: string;
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
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'cancelled'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedRegistrations, setExpandedRegistrations] = useState<Set<string>>(new Set());
  const [showRegisterModal, setShowRegisterModal] = useState(false);
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
    slipFile?: File | null;
    uploadingFile?: boolean;
  }>({
    registrationId: '',
    paymentType: 'deposit',
    amount: 0,
    slipUrl: '',
    paidDate: new Date().toISOString().split('T')[0],
    slipFile: null,
    uploadingFile: false,
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

  // Cancellation modal state
  const [cancellationModalOpen, setCancellationModalOpen] = useState(false);

  // Payment details modal state
  const [paymentDetailsModalOpen, setPaymentDetailsModalOpen] = useState(false);
  const [selectedRegistrationForPayment, setSelectedRegistrationForPayment] = useState<{
    registrationId: string;
    totalAmount: number;
    companyName: string;
    contactName: string;
  } | null>(null);
  const [cancellationFormData, setCancellationFormData] = useState<{
    registrationId: string;
    reason: string;
  }>({
    registrationId: '',
    reason: '',
  });
  const [cancelling, setCancelling] = useState(false);

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
      // Get all room types from event configuration
      const roomTypes = eventData.event.roomTypes || [];
      const sortedRoomTypes = [...roomTypes].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      // Prepare data for export - separate row per attendee
      const exportData: Record<string, any>[] = [];

      filteredAttendees.forEach((attendee) => {
        // Parse attendee names
        let attendeeNamesList: string[] = [];
        try {
          const names = JSON.parse(attendee.registration.attendeeNames || '[]');
          attendeeNamesList = Array.isArray(names) ? names : [];
        } catch {
          // If parse fails, try to use as plain string
          if (attendee.registration.attendeeNames) {
            attendeeNamesList = [attendee.registration.attendeeNames];
          }
        }

        // If no names, create empty slots based on attendeeCount
        const attendeeCount = attendee.registration.attendeeCount || 1;
        if (attendeeNamesList.length === 0) {
          attendeeNamesList = Array(attendeeCount).fill('');
        }

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

        // Calculate approved payment amount
        const reg = attendee.registration;
        const totalAmount = reg.totalAmount || 0;
        const paymentStatus = reg.paymentStatus || '';
        const depositPaid = reg.depositPaid || false;
        const isFullyPaid = depositPaid && (reg.remainingAmount === 0 || paymentStatus.includes('ชำระครบ'));
        const approvedAmount = (isFullyPaid || paymentStatus.includes('ชำระครบ') || paymentStatus.includes('อนุมัติ')) ? totalAmount : 0;

        // Base data (will be merged for all rows of this registration)
        const baseData: Record<string, any> = {
          'รหัสลงทะเบียน': attendee.registration.registrationId,
          'ชื่อบริษัท': attendee.registration.companyName || attendee.member?.companyNameTH || '',
          'ผู้ติดต่อ': attendee.registration.contactName || attendee.member?.fullNameTH || attendee.lineProfile?.lineDisplayName || '',
          'เบอร์โทร': attendee.registration.contactPhone || '',
          'ชื่อไลน์': attendee.lineProfile?.lineDisplayName || '',
          'จำนวนผู้เข้าร่วม': attendeeCount,
        };

        // Add room allocation columns
        sortedRoomTypes.forEach((roomType) => {
          baseData[roomType.typeName] = roomAllocationMap[roomType.typeId] || 0;
        });

        // Add other merged data
        baseData['สถานะ'] = attendee.registration.status || '';
        baseData['สถานะการชำระ'] = paymentStatus;
        baseData['ยอดรวม'] = totalAmount;
        baseData['ยอดอนุมัติแล้ว'] = approvedAmount;
        baseData['ความต้องการพิเศษ'] = attendee.registration.specialRequests || '';
        baseData['ค่าใช้จ่ายเสริม'] = totalSpecialCharges;

        // Create one row per attendee
        attendeeNamesList.forEach((name, idx) => {
          exportData.push({
            ...baseData,
            'ลำดับผู้เข้าร่วม': idx + 1,
            'ชื่อผู้เข้าร่วม': name || '',
          });
        });
      });

      // Create workbook with merged cells
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Apply merges for repeated data
      const merges: XLSX.Range[] = [];
      let currentRow = 1; // Start after header

      filteredAttendees.forEach((attendee) => {
        let attendeeNamesList: string[] = [];
        try {
          const names = JSON.parse(attendee.registration.attendeeNames || '[]');
          attendeeNamesList = Array.isArray(names) ? names : [];
        } catch {
          if (attendee.registration.attendeeNames) {
            attendeeNamesList = [attendee.registration.attendeeNames];
          }
        }

        const attendeeCount = attendee.registration.attendeeCount || 1;
        const rowCount = attendeeNamesList.length || attendeeCount;

        if (rowCount > 1) {
          // Merge columns A to M (all except attendee order and name)
          for (let col = 0; col < 14; col++) {
            merges.push({
              s: { r: currentRow, c: col },
              e: { r: currentRow + rowCount - 1, c: col },
            });
          }
        }

        currentRow += rowCount;
      });

      ws['!merges'] = merges;

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
      // Count unique companies
      const uniqueCompanies = new Set(
        filteredAttendees
          .filter(a => a.member?.companyNameTH || a.registration.companyName)
          .map(a => a.member?.companyNameTH || a.registration.companyName)
      );
      const companyCount = uniqueCompanies.size;

      // Count total attendees
      const totalPeople = filteredAttendees.reduce((sum, a) => sum + (a.registration.attendeeCount || 1), 0);

      // Format header
      const header = `รายนามชื่อบริษัทที่เข้าร่วมกิจกรรม\n${eventData.event.eventName}\n${eventData.event.eventDate}\nจำนวนลงทะเบียน ${companyCount} บริษัท / ${totalPeople} คน\n`;

      // Format attendee list
      const listText = filteredAttendees.map((attendee, index) => {
        const companyName = attendee.registration.companyName || attendee.member?.companyNameTH || 'ไม่ระบุบริษัท';
        const attendeeCount = attendee.registration.attendeeCount || 1;
        const contactName = attendee.registration.contactName || attendee.member?.fullNameTH || attendee.lineProfile?.lineDisplayName || '';
        const phone = attendee.registration.contactPhone || '';

        return `${index + 1}. ${companyName} (${attendeeCount} คน) ติดต่อ ${contactName}${phone ? ' โทร ' + phone : ''}`;
      }).join('\n');

      // Combine header and list
      const fullText = header + listText;

      // Copy to clipboard
      await navigator.clipboard.writeText(fullText);

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

    // Auto-expand the dropdown if not already expanded
    if (!expandedRegistrations.has(attendee.registration.registrationId)) {
      setExpandedRegistrations(prev => {
        const newSet = new Set(prev);
        newSet.add(attendee.registration.registrationId);
        return newSet;
      });
    }

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
    // Exit edit mode but keep dropdown expanded
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
            text: `จำนวนผู้เข้าพักในห้องไม่ตรงกับจำนวนผู้เข้าร่วม (รองรับ ${totalCapacity} คน แต่ลงทะเบียน ${editFormData.attendeeCount} คน)`
          });
          return;
        }
      }
    }

    // Admin can leave attendee names empty - no validation required

    setUpdating(true);
    setActionMessage(null);

    try {
      const updateData: any = {
        attendee_count: editFormData.attendeeCount,
        attendee_names: JSON.stringify(editFormData.attendeeNames),
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

  const handleOpenCancellationModal = (registrationId: string) => {
    setCancellationFormData({
      registrationId,
      reason: '',
    });
    setCancellationModalOpen(true);
  };

  const handleCloseCancellationModal = () => {
    setCancellationModalOpen(false);
    setCancellationFormData({
      registrationId: '',
      reason: '',
    });
  };

  const handleCancelRegistration = async () => {
    if (!cancellationFormData.reason.trim()) {
      setActionMessage({ type: 'error', text: 'กรุณาระบุสาเหตุการยกเลิก' });
      return;
    }

    setCancelling(true);
    setActionMessage(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/admin-update-registration?registrationId=${cancellationFormData.registrationId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cancellationReason: cancellationFormData.reason,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถยกเลิกได้');
      }

      setActionMessage({ type: 'success', text: 'ยกเลิกการลงทะเบียนเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      handleCloseCancellationModal();
      fetchEventData(); // Refresh data
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setCancelling(false);
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
      slipFile: null,
      uploadingFile: false,
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
      let slipUrl = paymentFormData.slipUrl;

      // If user uploaded a file, upload it first
      if (paymentFormData.slipFile) {
        setPaymentFormData({ ...paymentFormData, uploadingFile: true });

        // Convert file to base64
        const fileBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(paymentFormData.slipFile!);
        });

        // Upload via admin API
        const uploadResponse = await fetch('/api/admin/payments/upload-for-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registrationId: paymentFormData.registrationId,
            eventId: eventId,
            amount: paymentFormData.amount,
            paymentType: paymentFormData.paymentType,
            fileData: fileBase64,
            fileName: paymentFormData.slipFile.name,
            mimeType: paymentFormData.slipFile.type,
            description: `อัพโหลดโดย Admin`,
          }),
        });

        const uploadData = await uploadResponse.json();

        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || 'ไม่สามารถอัพโหลดไฟล์ได้');
        }

        slipUrl = uploadData.slipUrl;
        setPaymentFormData({ ...paymentFormData, uploadingFile: false, slipUrl });
      }

      const response = await fetch(`/api/events/${eventId}/update-payment`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId: paymentFormData.registrationId,
          paymentType: paymentFormData.paymentType,
          amount: paymentFormData.amount,
          slipUrl: slipUrl,
          paidDate: paymentFormData.paidDate,
          action: 'approve',
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
      setPaymentFormData({ ...paymentFormData, uploadingFile: false });
    }
  };

  // Payment Details Modal handlers
  const handleOpenPaymentDetailsModal = (attendee: Attendee) => {
    setSelectedRegistrationForPayment({
      registrationId: attendee.registration.registrationId,
      totalAmount: attendee.registration.totalAmount,
      companyName: attendee.registration.companyName,
      contactName: attendee.registration.contactName,
    });
    setPaymentDetailsModalOpen(true);
  };

  const handleClosePaymentDetailsModal = () => {
    setPaymentDetailsModalOpen(false);
    setSelectedRegistrationForPayment(null);
  };

  const handlePaymentDetailsUpdate = () => {
    // Refresh attendee list after approve/reject
    fetchEventData();
  };

  const handleRejectPayment = async () => {
    if (!confirm('คุณต้องการปฏิเสธสลิปนี้ใช่หรือไม่? สลิปจะถูกลบออกและสมาชิกจะต้องส่งใหม่')) {
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
          action: 'reject',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถปฏิเสธสลิปได้');
      }

      setActionMessage({ type: 'success', text: data.message || 'ปฏิเสธสลิปเรียบร้อยแล้ว' });
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
    // Check if registration is cancelled
    const status = String(attendee.registration.status || '').toLowerCase();
    const isCancelled = status === 'cancelled' || attendee.registration.status?.includes('ยกเลิก');

    // Filter by registration status
    if (filter === 'confirmed') {
      // Exclude cancelled registrations from confirmed filter
      if (isCancelled || !attendee.isConfirmed) return false;
    } else if (filter === 'pending') {
      // Exclude cancelled registrations from pending filter
      if (isCancelled || attendee.isConfirmed) return false;
    } else if (filter === 'cancelled') {
      // Only show cancelled registrations
      if (!isCancelled) return false;
    } else if (filter === 'all') {
      // 'all' filter should exclude cancelled by default
      // (if you want to show cancelled in 'all', remove this condition)
      // For now, keeping cancelled separate
    }

    // Filter by payment status
    if (paymentFilter !== 'all') {
      if (attendee.registration.paymentStatus !== paymentFilter) return false;
    }

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
  const canManageEvents = session?.user?.permissions?.includes('events:manage-assigned');
  const hasAccess = isCommitteeOrAdmin || canManageEvents;

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
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{eventData.event.eventName}</h1>
              {eventData.event.eventNameEN && (
                <p className="text-sm text-gray-500 mb-2">{eventData.event.eventNameEN}</p>
              )}
              {/* Status Badges */}
              <div className="flex flex-wrap gap-2 mt-2">
                {/* Capacity Status - Highest priority */}
                {(() => {
                  const isFull = eventData.event.maxCapacity > 0 && eventData.summary.totalAttendees >= eventData.event.maxCapacity;
                  if (isFull) {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold bg-red-100 text-red-800 border-2 border-red-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        เต็ม/ปิดรับสมัคร ({eventData.summary.totalAttendees}/{eventData.event.maxCapacity})
                      </span>
                    );
                  }
                  return null;
                })()}
                {/* Registration Status */}
                {eventData.event.registrationOpen ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    เปิดรับสมัคร
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    ปิดรับสมัคร
                  </span>
                )}
                {/* Published Status */}
                {eventData.event.isPublished ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Published (แสดงให้สมาชิกทั่วไป)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    ยังไม่ Published
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6 lg:px-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-blue-600">{eventData.summary.agentRegistrations}</p>
            <p className="text-[10px] sm:text-sm text-gray-500">บริษัทลงทะเบียน</p>
          </div>
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-indigo-600">{eventData.summary.totalAttendees || 0}</p>
            <p className="text-[10px] sm:text-sm text-gray-500">จำนวนผู้เข้าร่วม</p>
          </div>
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-purple-200">
            <p className="text-xl sm:text-3xl font-bold text-purple-600">{eventData.summary.clubMemberCount || 0}</p>
            <p className="text-[10px] sm:text-sm text-gray-500">สมาชิกชมรม</p>
          </div>
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-green-200">
            <p className="text-xl sm:text-3xl font-bold text-green-600">{eventData.summary.verifiedMemberCount}</p>
            <p className="text-[10px] sm:text-sm text-gray-500">ยืนยันตัวตนแล้ว</p>
          </div>
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-teal-600">{eventData.summary.confirmedCount}</p>
            <p className="text-[10px] sm:text-sm text-gray-500">บริษัทยืนยันแล้ว</p>
          </div>
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center">
            <p className="text-xl sm:text-3xl font-bold text-orange-600">
              {eventData.summary.agentRegistrations - eventData.summary.confirmedCount}
            </p>
            <p className="text-[10px] sm:text-sm text-gray-500">รอดำเนินการ</p>
          </div>
          {/* Payment Summary Cards */}
          {(() => {
            // Calculate payment totals from registration status
            // Note: This counts based on ACTUAL payment status in the database
            // which is updated when payment slips are approved
            let totalPending = 0;
            let totalApproved = 0;

            // Determine payment mode from event configuration
            const isFullPaymentMode = eventData.event.paymentMode === 'full';

            console.log('=== PAYMENT SUMMARY DEBUG ===');
            console.log('Event paymentMode:', eventData.event.paymentMode);
            console.log('isFullPaymentMode:', isFullPaymentMode);
            console.log('Total attendees:', eventData.attendees.length);

            eventData.attendees.forEach(attendee => {
              const reg = attendee.registration;
              const totalAmount = reg.totalAmount || 0;
              const depositAmount = reg.depositAmount || 0;
              const remainingAmount = reg.remainingAmount || 0;

              console.log('--- Registration:', reg.registrationId);
              console.log('  totalAmount:', totalAmount, 'depositAmount:', depositAmount);

              if (isFullPaymentMode) {
                // Full Payment Mode
                // Check if payment has been approved (fullPaymentPaid = true)
                // OR if slip exists but not approved yet (pending)
                const isPaid = (reg as any).fullPaymentPaid === true;
                const hasSlip = (reg as any).fullPaymentSlipUrl && (reg as any).fullPaymentSlipUrl.trim() !== '';

                console.log('  FULL MODE - fullPaymentPaid:', (reg as any).fullPaymentPaid, 'fullPaymentSlipUrl:', (reg as any).fullPaymentSlipUrl ? 'YES' : 'NO');

                if (isPaid) {
                  totalApproved += totalAmount;
                  console.log('  -> APPROVED +', totalAmount);
                } else if (hasSlip) {
                  totalPending += totalAmount;
                  console.log('  -> PENDING +', totalAmount);
                }
              } else {
                // Deposit + Remaining Mode
                console.log('  DEPOSIT MODE - depositPaid:', reg.depositPaid, 'depositSlipUrl:', reg.depositSlipUrl ? 'YES' : 'NO');

                // Deposit payment
                if (reg.depositPaid === true) {
                  totalApproved += depositAmount;
                  console.log('  -> DEPOSIT APPROVED +', depositAmount);
                } else if (reg.depositSlipUrl && reg.depositSlipUrl.trim() !== '') {
                  totalPending += depositAmount;
                  console.log('  -> DEPOSIT PENDING +', depositAmount);
                }

                // Remaining payment
                if ((reg as any).remainingPaid === true) {
                  totalApproved += remainingAmount;
                  console.log('  -> REMAINING APPROVED +', remainingAmount);
                } else if (reg.remainingSlipUrl && reg.remainingSlipUrl.trim() !== '') {
                  totalPending += remainingAmount;
                  console.log('  -> REMAINING PENDING +', remainingAmount);
                }
              }
            });

            console.log('=== TOTALS: Pending=' + totalPending + ', Approved=' + totalApproved + ' ===');

            return (
              <>
                <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-yellow-200">
                  <p className="text-lg sm:text-2xl font-bold text-yellow-600">
                    {totalPending.toLocaleString()}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-500">รอตรวจสอบ (บาท)</p>
                </div>
                <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-emerald-200">
                  <p className="text-lg sm:text-2xl font-bold text-emerald-600">
                    {totalApproved.toLocaleString()}
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-500">ยืนยันแล้ว (บาท)</p>
                </div>
              </>
            );
          })()}
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center bg-gray-50">
            <p className="text-lg sm:text-2xl font-bold text-gray-500">{eventData.summary.totalRegistrations}</p>
            <p className="text-[10px] sm:text-xs text-gray-400">รายการทั้งหมด</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col gap-4">
            {/* Search Input */}
            <div className="w-full">
              <input
                type="text"
                placeholder="ค้นหาชื่อ, บริษัท, เลขใบอนุญาต, รหัสสมาชิก..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Registration Status Filter */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">สถานะการลงทะเบียน</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ทั้งหมด ({eventData.attendees.length})
                </button>
                <button
                  onClick={() => setFilter('confirmed')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'confirmed'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ยืนยันแล้ว ({eventData.summary.confirmedCount})
                </button>
                <button
                  onClick={() => setFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'pending'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  รอดำเนินการ ({eventData.attendees.length - eventData.summary.confirmedCount})
                </button>
                <button
                  onClick={() => setFilter('cancelled')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === 'cancelled'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ยกเลิก ({eventData.attendees.filter(a => {
                    const status = String(a.registration.status || '').toLowerCase();
                    return status === 'cancelled' || a.registration.status?.includes('ยกเลิก');
                  }).length})
                </button>
              </div>
            </div>

            {/* Payment Status Filter */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">สถานะการชำระเงิน</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPaymentFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    paymentFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ทั้งหมด
                </button>
                {(() => {
                  // Get unique payment statuses from attendees
                  const paymentStatuses = Array.from(
                    new Set(
                      eventData.attendees
                        .map(a => a.registration.paymentStatus)
                        .filter(Boolean)
                    )
                  ).sort();

                  return paymentStatuses.map(status => {
                    const count = eventData.attendees.filter(a => a.registration.paymentStatus === status).length;
                    return (
                      <button
                        key={status}
                        onClick={() => setPaymentFilter(status)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          paymentFilter === status
                            ? getStatusBadgeClass(status).replace('bg-', 'bg-opacity-100 bg-').replace('text-', 'text-white border-2 border-')
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {status} ({count})
                      </button>
                    );
                  });
                })()}
              </div>
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
                title="Export Excel"
              >
                {exportLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span className="hidden sm:inline">กำลัง Export...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="hidden sm:inline">Export Excel</span>
                  </>
                )}
              </button>
              <button
                onClick={handleCopyList}
                disabled={copyLoading || filteredAttendees.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Copy รายชื่อ"
              >
                {copyLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span className="hidden sm:inline">กำลังคัดลอก...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden sm:inline">Copy รายชื่อ</span>
                  </>
                )}
              </button>
              {session?.user?.permissions?.includes('events:register-on-behalf') && (
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
                  title="ลงทะเบียนแทนสมาชิก"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="hidden sm:inline">ลงทะเบียนแทนสมาชิก</span>
                </button>
              )}
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

                const isExpanded = expandedRegistrations.has(attendee.registration.registrationId);

                return (
                <div
                  key={attendee.registration.registrationId || index}
                  className={`p-4 transition-all duration-200 ${
                    isExpanded
                      ? 'bg-gray-100 hover:bg-gray-150 border-l-4 border-gray-400 shadow-sm'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
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
                        {/* Name from LINE profile or registration - clickable if has memberId */}
                        {attendee.member?.memberId ? (
                          <Link
                            href={`/members/${attendee.member.memberId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:text-blue-800 hover:underline truncate transition-colors"
                            title="จัดการชื่อ (เปิดในแท็บใหม่)"
                          >
                            {attendee.lineProfile?.lineDisplayName ||
                             attendee.member?.fullNameTH ||
                             attendee.registration.contactName ||
                             'ไม่ระบุชื่อ'}
                          </Link>
                        ) : (
                          <h3 className="font-medium text-gray-900 truncate">
                            {attendee.lineProfile?.lineDisplayName ||
                             attendee.member?.fullNameTH ||
                             attendee.registration.contactName ||
                             'ไม่ระบุชื่อ'}
                          </h3>
                        )}

                        {/* Verified icon - has LINE profile */}
                        {attendee.lineProfile && (
                          <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}

                        {/* Role badge based on user role */}
                        {attendee.lineProfile?.role && (() => {
                          const role = attendee.lineProfile.role;
                          let badgeColor = 'bg-gray-100 text-gray-800';
                          let roleLabel = 'Guest';

                          if (role === 'admin') {
                            badgeColor = 'bg-red-100 text-red-800';
                            roleLabel = 'ผู้ดูแลระบบ';
                          } else if (role === 'committee') {
                            badgeColor = 'bg-blue-100 text-blue-800';
                            roleLabel = 'กรรมการ';
                          } else if (role === 'event-co') {
                            badgeColor = 'bg-purple-100 text-purple-800';
                            roleLabel = 'ผู้ประสานงาน';
                          } else if (role === 'event-staff') {
                            badgeColor = 'bg-indigo-100 text-indigo-800';
                            roleLabel = 'เจ้าหน้าที่';
                          } else if (role === 'member') {
                            badgeColor = 'bg-green-100 text-green-800';
                            roleLabel = 'สมาชิก';
                          }

                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${badgeColor}`}>
                              {roleLabel}
                            </span>
                          );
                        })()}

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

                        {/* Payment Status badge */}
                        {attendee.registration.paymentStatus && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(attendee.registration.paymentStatus)}`}>
                            {attendee.registration.paymentStatus}
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
                    <div className="space-y-3 mt-3 pt-3 border-t-2 border-purple-300">
                      {/* View-Only Cards - Hide when editing */}
                      {!isEditing && (
                        <>
                          {/* Contact Information Display */}
                          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <p className="text-xs font-semibold text-gray-900 mb-2">ข้อมูลผู้ติดต่อ:</p>
                            <div className="space-y-1">
                              {attendee.registration.contactName && (
                                <div className="text-xs text-gray-700">
                                  <span className="font-medium">ชื่อ:</span> {attendee.registration.contactName}
                                </div>
                              )}
                              {attendee.registration.contactPhone && (
                                <div className="text-xs text-gray-700">
                                  <span className="font-medium">โทร:</span> {attendee.registration.contactPhone}
                                </div>
                              )}
                            </div>
                          </div>

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

                        {/* Payment Information Display */}
                        {attendee.registration.totalAmount > 0 && (
                          <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-green-900">ข้อมูลการชำระเงิน:</p>
                              <button
                                onClick={() => handleOpenPaymentDetailsModal(attendee)}
                                className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition-colors"
                                title="ดูประวัติการชำระเงินทั้งหมด"
                              >
                                📋 ดูประวัติการชำระเงิน
                              </button>
                            </div>
                            <div className="space-y-2">
                              {/* Total Amount */}
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-700">ยอดรวมทั้งหมด:</span>
                                <span className="text-sm font-bold text-green-900">
                                  {attendee.registration.totalAmount.toLocaleString()} บาท
                                </span>
                              </div>

                              {/* Payment Status Badge */}
                              {attendee.registration.paymentStatus && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-700">สถานะ:</span>
                                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusBadgeClass(attendee.registration.paymentStatus)}`}>
                                    {attendee.registration.paymentStatus}
                                  </span>
                                </div>
                              )}

                              {/* Deposit Payment Info */}
                              {attendee.registration.depositAmount > 0 && (
                                <>
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-700">มัดจำ:</span>
                                    <span className="font-medium text-gray-900">
                                      {attendee.registration.depositAmount.toLocaleString()} บาท
                                      {attendee.registration.depositPaid && attendee.registration.depositPaidDate && (
                                        <span className="text-green-600 ml-2">✓ ชำระแล้ว ({attendee.registration.depositPaidDate})</span>
                                      )}
                                    </span>
                                  </div>
                                </>
                              )}

                              {/* Remaining Payment Info */}
                              {attendee.registration.remainingAmount > 0 && (
                                <>
                                  <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-700">ยอดคงเหลือ:</span>
                                    <span className="font-medium text-gray-900">
                                      {attendee.registration.remainingAmount.toLocaleString()} บาท
                                      {attendee.registration.depositPaidDate && (
                                        <span className="text-green-600 ml-2">✓ ชำระแล้ว ({attendee.registration.depositPaidDate})</span>
                                      )}
                                    </span>
                                  </div>
                                </>
                              )}

                              {/* Deadlines */}
                              {attendee.registration.depositDeadline && (
                                <div className="text-xs text-gray-600 pt-2 border-t border-green-200">
                                  <span className="font-medium">กำหนดชำระมัดจำ:</span> {formatDeadline(attendee.registration.depositDeadline)}
                                </div>
                              )}
                              {attendee.registration.remainingDeadline && (
                                <div className="text-xs text-gray-600">
                                  <span className="font-medium">กำหนดชำระยอดคงเหลือ:</span> {formatDeadline(attendee.registration.remainingDeadline)}
                                </div>
                              )}
                            </div>
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
                                {eventData?.event?.maxPerCompany && eventData.event.maxPerCompany > 0 && (
                                  <span className="text-xs text-gray-500 ml-2">
                                    (สูงสุด {eventData.event.maxPerCompany} คน)
                                  </span>
                                )}
                              </label>
                              <select
                                value={editFormData.attendeeCount}
                                onChange={(e) => handleAttendeeCountChange(Number(e.target.value))}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                required
                              >
                                <option value="0" disabled>โปรดระบุจำนวนผู้เข้าร่วม</option>
                                {Array.from(
                                  { length: eventData?.event?.maxPerCompany && eventData.event.maxPerCompany > 0 ? eventData.event.maxPerCompany : 20 },
                                  (_, i) => i + 1
                                ).map(num => (
                                  <option key={num} value={num}>{num} คน</option>
                                ))}
                              </select>
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

                        {/* Contact Information - Read-Only Display */}
                        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <p className="text-xs font-semibold text-gray-900 mb-2">ข้อมูลผู้ติดต่อ:</p>
                          <div className="space-y-1">
                            {editFormData.contactPhone && (
                              <div className="text-xs text-gray-700">
                                <span className="font-medium">โทร:</span> {editFormData.contactPhone}
                              </div>
                            )}
                            {editFormData.contactEmail && (
                              <div className="text-xs text-gray-700">
                                <span className="font-medium">อีเมล:</span> {editFormData.contactEmail}
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            * กรณีต้องการเปลี่ยนแปลงข้อมูลติดต่อ กรุณาติดต่อ Admin
                          </p>
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

                            {/* Deposit Payment Section (Deposit Mode ONLY) */}
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
                                    <div className="mt-1">
                                      <div className="flex items-center gap-2 text-green-600 mb-2">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                        ชำระแล้ว {attendee.registration.depositPaidDate && `(${formatDeadline(attendee.registration.depositPaidDate)})`}
                                      </div>
                                      {/* Show delete button if no remaining amount or remaining not yet paid */}
                                      {(!attendee.registration.remainingAmount || attendee.registration.remainingAmount === 0 || !attendee.registration.remainingSlipUrl) && (
                                        <button
                                          onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                          className="w-full px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                          title="ลบการลงทะเบียน"
                                        >
                                          🗑️ ลบการลงทะเบียน
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mt-2 flex gap-2">
                                      <button
                                        onClick={() => handleOpenPaymentModal(attendee, 'deposit')}
                                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                                      >
                                        ✓ บันทึกการชำระเงิน
                                      </button>
                                      <button
                                        onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                        className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                        title="ลบการลงทะเบียน"
                                      >
                                        🗑️ ลบ
                                      </button>
                                    </div>
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
                                      <div className="mt-1">
                                        <div className="flex items-center gap-2 text-green-600 mb-2">
                                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                          </svg>
                                          ชำระครบแล้ว
                                        </div>
                                        <button
                                          onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                          className="w-full px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                          title="ลบการลงทะเบียน"
                                        >
                                          🗑️ ลบการลงทะเบียน
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="mt-2 flex gap-2">
                                        <button
                                          onClick={() => handleOpenPaymentModal(attendee, 'remaining')}
                                          className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                        >
                                          ✓ บันทึกการชำระเงิน
                                        </button>
                                        <button
                                          onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                          className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                          title="ลบการลงทะเบียน"
                                        >
                                          🗑️ ลบ
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </>
                            )}

                            {/* Full Payment Section (when event uses Full Payment Mode) */}
                            {eventData.event.paymentMode === 'full' && (
                              <div className="border-t pt-2">
                                {attendee.registration.depositPaid ? (
                                  <div className="mt-1">
                                    <div className="flex items-center gap-2 text-green-600 mb-2">
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                      </svg>
                                      ชำระครบแล้ว {attendee.registration.depositPaidDate && `(${formatDeadline(attendee.registration.depositPaidDate)})`}
                                    </div>
                                    <button
                                      onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                      className="w-full px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                      title="ลบการลงทะเบียน"
                                    >
                                      🗑️ ลบการลงทะเบียน
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      onClick={() => handleOpenPaymentModal(attendee, 'full')}
                                      className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                    >
                                      ✓ บันทึกการชำระเงิน
                                    </button>
                                    <button
                                      onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                      className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                      title="ลบการลงทะเบียน"
                                    >
                                      🗑️ ลบ
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Delete button for free events (no payment required) */}
                    {(!attendee.registration.totalAmount || attendee.registration.totalAmount === 0) && (
                      <div className="mt-3">
                        <button
                          onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                          className="w-full px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                          title="ลบการลงทะเบียน"
                        >
                          🗑️ ลบการลงทะเบียน
                        </button>
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

              {/* Slip Upload Options */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">
                  📎 สลิปการโอนเงิน
                </label>

                {/* File Upload Option */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-blue-400 transition-colors">
                  <label className="cursor-pointer block">
                    <div className="flex flex-col items-center">
                      {paymentFormData.slipFile ? (
                        <>
                          <div className="text-green-600 mb-2">
                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-gray-700">{paymentFormData.slipFile.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {(paymentFormData.slipFile.size / 1024).toFixed(2)} KB
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setPaymentFormData({ ...paymentFormData, slipFile: null });
                            }}
                            className="mt-2 text-xs text-red-600 hover:text-red-800"
                          >
                            ลบไฟล์
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="text-gray-400 mb-2">
                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-gray-700">คลิกเพื่ออัพโหลดไฟล์</p>
                          <p className="text-xs text-gray-500 mt-1">JPG, PNG, PDF (สูงสุด 5MB)</p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 5 * 1024 * 1024) {
                            setActionMessage({ type: 'error', text: 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)' });
                            return;
                          }
                          setPaymentFormData({ ...paymentFormData, slipFile: file, slipUrl: '' });
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* OR Divider */}
                <div className="flex items-center">
                  <div className="flex-1 border-t border-gray-300"></div>
                  <span className="px-3 text-xs text-gray-500">หรือ</span>
                  <div className="flex-1 border-t border-gray-300"></div>
                </div>

                {/* URL Input Option */}
                <div>
                  <input
                    type="text"
                    value={paymentFormData.slipUrl}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, slipUrl: e.target.value, slipFile: null })}
                    placeholder="ใส่ URL สลิปที่อัพโหลดไว้แล้ว (https://...)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!!paymentFormData.slipFile}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    สำหรับสลิปที่อัพโหลดไปยัง Cloud Storage แล้ว
                  </p>
                </div>

                {paymentFormData.uploadingFile && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm text-blue-800">กำลังอัพโหลดไฟล์...</span>
                  </div>
                )}
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
                className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirmingPayment ? 'กำลังบันทึก...' : '✓ ยืนยันการชำระ'}
              </button>
              {paymentFormData.slipUrl && (
                <button
                  onClick={handleRejectPayment}
                  disabled={confirmingPayment}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {confirmingPayment ? 'กำลังบันทึก...' : '✗ ปฏิเสธสลิป'}
                </button>
              )}
              <button
                onClick={handleClosePaymentModal}
                disabled={confirmingPayment}
                className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
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

      {/* Cancellation Modal */}
      {cancellationModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">ยกเลิกการลงทะเบียน</h3>

            <div className="space-y-4">
              {/* Warning */}
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  <strong>คำเตือน:</strong> การยกเลิกการลงทะเบียนจะเปลี่ยนสถานะเป็น "ยกเลิก" และไม่สามารถกู้คืนได้
                </p>
              </div>

              {/* Cancellation Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  สาเหตุการยกเลิก <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={cancellationFormData.reason}
                  onChange={(e) => setCancellationFormData({ ...cancellationFormData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="ระบุสาเหตุการยกเลิก เช่น ลูกค้าขอยกเลิก, ไม่สะดวกเข้าร่วม, ฯลฯ"
                  rows={4}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  สาเหตุจะถูกบันทึกไว้เพื่อการอ้างอิงในอนาคต
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancelRegistration}
                disabled={cancelling || !cancellationFormData.reason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelling ? 'กำลังยกเลิก...' : 'ยืนยันการยกเลิก'}
              </button>
              <button
                onClick={handleCloseCancellationModal}
                disabled={cancelling}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ปิด
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

      {/* Payment Details Modal */}
      {paymentDetailsModalOpen && selectedRegistrationForPayment && (
        <PaymentDetailsModal
          registrationId={selectedRegistrationForPayment.registrationId}
          totalAmount={selectedRegistrationForPayment.totalAmount}
          companyName={selectedRegistrationForPayment.companyName}
          contactName={selectedRegistrationForPayment.contactName}
          onClose={handleClosePaymentDetailsModal}
          onUpdate={handlePaymentDetailsUpdate}
        />
      )}

      {/* Register On Behalf Modal */}
      <RegisterOnBehalfModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        eventId={eventId as string}
        eventName={eventData?.event?.eventName || ''}
        useAttendeeTypePricing={eventData?.event?.useAttendeeTypePricing || false}
        attendeeTypes={eventData?.event?.attendeeTypes}
        roomTypes={eventData?.event?.roomTypes}
        requireAttendeeNames={eventData?.event?.requireAttendeeNames ?? true}
        onSuccess={fetchEventData}
      />
    </div>
  );
}
