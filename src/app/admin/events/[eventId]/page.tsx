'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import * as XLSX from 'xlsx';
import { formatDeadline, getTimeRemaining } from '@/lib/payment-deadlines';
import { getStatusBadgeClass } from '@/lib/payment-status';
import { calculateRegistrationFee } from '@/types/event';
import { formatThaiDateTime } from '@/lib/date-utils';
import RegisterOnBehalfModal from './RegisterOnBehalfModal';
import PaymentDetailsModal from '@/components/admin/PaymentDetailsModal';
import PromoteEventModal from '@/components/admin/PromoteEventModal';

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
    // Payment fields
    eventFee?: number; // Base event fee (from attendee types or tiered pricing)
    roomFee?: number; // Room allocation fee
    totalAmount: number;
    paidAmount?: number; // Total amount paid so far
    additionalPayments?: string; // JSON stringified AdditionalPayment[]
    // Deposit payment fields
    depositAmount: number;
    remainingAmount: number;
    depositPaid: boolean;
    depositPaidDate: string;
    remainingPaid?: boolean;
    remainingPaidDate?: string;
    depositSlipUrl: string;
    remainingSlipUrl: string;
    depositDeadline: string;
    remainingDeadline: string;
    paymentStatus: string;
    // Full payment fields
    fullPaymentPaid?: boolean;
    fullPaymentPaidDate?: string;
    fullPaymentSlipUrl?: string;
    fullPaymentDeadline?: string;
    // Attendee type pricing and room allocation
    attendeeTypeSelections?: string; // JSON stringified
    roomAllocations?: string; // JSON stringified
    // Special charges
    specialCharges?: string; // JSON stringified
    // Special requests
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

// Helper function to check if there are additional charges after payment
function hasAdditionalCharges(attendee: Attendee, eventPaymentMode: 'full' | 'deposit'): boolean {
  const reg = attendee.registration;
  const totalAmount = reg.totalAmount || 0;
  const paidAmount = reg.paidAmount || 0;
  const depositAmount = reg.depositAmount || 0;
  const remainingAmount = reg.remainingAmount || 0;

  if (eventPaymentMode === 'full') {
    // ✅ Full payment mode: check if totalAmount > paidAmount and payment has been made
    // Use fullPaymentPaid or paidAmount to determine if payment started
    const hasStartedPayment = reg.fullPaymentPaid === true || paidAmount > 0;
    return hasStartedPayment && totalAmount > paidAmount;
  } else {
    // Deposit mode: check if totalAmount > (depositAmount + remainingAmount) when payments are made
    const depositPaidAmount = (reg.depositPaid ? depositAmount : 0);
    const remainingPaidAmount = (reg.remainingPaid ? remainingAmount : 0);
    const totalPaid = depositPaidAmount + remainingPaidAmount;
    return reg.depositPaid === true && totalAmount > totalPaid;
  }
}

// Helper function to calculate unpaid additional amount
function getAdditionalAmount(attendee: Attendee, eventPaymentMode: 'full' | 'deposit'): number {
  const reg = attendee.registration;
  const totalAmount = reg.totalAmount || 0;

  // ✅ FIX: Calculate paidAmount from actual payment fields (don't use paidAmount field as it's not reliable)
  const fullPaymentAmountPaid = (reg as any).fullPaymentAmountPaid || 0;
  const depositAmountPaid = (reg as any).depositAmountPaid || 0;
  const remainingAmountPaid = (reg as any).remainingAmountPaid || 0;

  // Calculate total paid from actual payment fields only
  const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid;

  // Calculate additional required (remaining balance) regardless of payment mode
  return Math.max(0, totalAmount - paidAmount);
}

// ✅ Payment History Inline Component
function PaymentHistoryInline({ registrationId, onUpdate }: { registrationId: string; onUpdate: () => void }) {
  const [paymentSlips, setPaymentSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    fetchPaymentSlips();
  }, [registrationId]);

  const fetchPaymentSlips = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/payments?registrationId=${registrationId}`);
      if (!response.ok) throw new Error('Failed to fetch payment slips');
      const data = await response.json();
      setPaymentSlips(data.slips || []);
    } catch (error) {
      console.error('Error fetching payment slips:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (slipId: string) => {
    if (!confirm('คุณต้องการอนุมัติสลิปนี้ใช่หรือไม่?')) {
      return;
    }

    try {
      const response = await fetch(`/api/payments/${slipId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve payment');
      }
      alert('อนุมัติสลิปเรียบร้อยแล้ว');
      await fetchPaymentSlips();
      onUpdate();
    } catch (error) {
      console.error('Error approving payment:', error);
      alert(error instanceof Error ? error.message : 'ไม่สามารถอนุมัติสลิปได้');
    }
  };

  const handleReject = async (slipId: string) => {
    const rejectionReason = prompt('กรุณาระบุเหตุผลในการปฏิเสธ:');
    if (!rejectionReason) return;

    try {
      const response = await fetch(`/api/payments/${slipId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject payment');
      }
      alert('ปฏิเสธสลิปเรียบร้อยแล้ว');
      await fetchPaymentSlips();
      onUpdate();
    } catch (error) {
      console.error('Error rejecting payment:', error);
      alert(error instanceof Error ? error.message : 'ไม่สามารถปฏิเสธสลิปได้');
    }
  };

  const getPaymentTypeName = (type: string) => {
    const names: Record<string, string> = {
      full: 'ชำระเต็มจำนวน',
      deposit: 'ชำระมัดจำ',
      remaining: 'ชำระยอดคงเหลือ',
      additional: 'ชำระเพิ่มเติม',
    };
    return names[type] || type;
  };

  const getSlipStatusBadgeClass = (status: string) => {
    if (status === 'approved') return 'bg-green-100 text-green-800';
    if (status === 'rejected') return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  const getSlipStatusText = (status: string) => {
    if (status === 'approved') return 'อนุมัติแล้ว';
    if (status === 'rejected') return 'ปฏิเสธ';
    return 'รอตรวจสอบ';
  };

  if (loading) {
    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg text-center text-xs text-gray-500">
        กำลังโหลดประวัติการชำระเงิน...
      </div>
    );
  }

  if (paymentSlips.length === 0) {
    return null; // Don't show anything if no payment slips
  }

  return (
    <>
      <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
        <h4 className="text-xs font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          ประวัติการชำระเงิน
        </h4>

        {/* Mobile & Desktop Responsive Table */}
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-y border-gray-200">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] sm:text-xs font-semibold text-gray-700">วันที่</th>
                <th className="px-2 py-1.5 text-left text-[10px] sm:text-xs font-semibold text-gray-700">ประเภท</th>
                <th className="px-2 py-1.5 text-right text-[10px] sm:text-xs font-semibold text-gray-700">ยอดเงิน</th>
                <th className="px-2 py-1.5 text-center text-[10px] sm:text-xs font-semibold text-gray-700">สถานะ</th>
                <th className="px-2 py-1.5 text-center text-[10px] sm:text-xs font-semibold text-gray-700">จัดการ</th>
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
                    <td className="px-2 py-2 text-[10px] sm:text-xs text-gray-700 whitespace-nowrap">
                      {`${day}/${month}/${year}`}
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
                        <span className="hidden sm:inline">{getPaymentTypeName(slip.paymentType)}</span>
                        <span className="sm:hidden">
                          {slip.paymentType === 'deposit' ? 'มัดจำ' :
                           slip.paymentType === 'remaining' ? 'คงเหลือ' :
                           slip.paymentType === 'full' ? 'เต็ม' : 'เพิ่ม'}
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right text-[10px] sm:text-xs font-semibold text-gray-900 whitespace-nowrap">
                      ฿{slip.amount.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium ${getSlipStatusBadgeClass(slip.status)}`}>
                        <span className="hidden sm:inline">{getSlipStatusText(slip.status)}</span>
                        <span className="sm:hidden">
                          {slip.status === 'pending' ? '⏳' :
                           slip.status === 'approved' ? '✓' : '✗'}
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setLightboxImage(slip.slipUrl);
                            setLightboxOpen(true);
                          }}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          title="ดูสลิป"
                        >
                          👁️ ดู
                        </button>
                        {slip.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(slip.slipId)}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                              title="อนุมัติ"
                            >
                              ✓ อนุมัติ
                            </button>
                            <button
                              onClick={() => handleReject(slip.slipId)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                              title="ลบ"
                            >
                              ✗ ลบ
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lightbox for viewing slip image */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl"
            >
              ✕
            </button>
            <img
              src={lightboxImage}
              alt="Payment Slip"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  );
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = decodeURIComponent(params.eventId as string);
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
  const [showPromoteModal, setShowPromoteModal] = useState(false);
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

  // Payment warning modal state (for cancellations with approved payments)
  const [paymentWarningModal, setPaymentWarningModal] = useState<{
    isOpen: boolean;
    totalPaid: number;
    registrationId: string;
  } | null>(null);

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

        // Calculate approved payment amount based on payment mode
        const reg = attendee.registration;
        const totalAmount = reg.totalAmount || 0;
        const depositAmount = reg.depositAmount || 0;
        const remainingAmount = reg.remainingAmount || 0;

        // Determine if this event uses Full Payment mode
        const isFullPaymentMode = eventData.event.paymentMode === 'full';

        let approvedAmount = 0;
        if (isFullPaymentMode) {
          // Full Payment Mode - check fullPaymentPaid
          if ((reg as any).fullPaymentPaid === true) {
            approvedAmount = totalAmount;
          }
        } else {
          // Deposit Mode - sum approved deposit and remaining
          if (reg.depositPaid === true) {
            approvedAmount += depositAmount;
          }
          if ((reg as any).remainingPaid === true) {
            approvedAmount += remainingAmount;
          }
        }

        const paymentStatus = reg.paymentStatus || '';

        // Base data (will be merged for all rows of this registration)
        const baseData: Record<string, any> = {
          'รหัสลงทะเบียน': attendee.registration.registrationId,
          'ชื่อบริษัท': attendee.registration.companyName || attendee.member?.companyNameTH || '',
          'ผู้ติดต่อ': attendee.registration.contactName || attendee.member?.fullNameTH || attendee.lineProfile?.lineDisplayName || '',
          'เบอร์โทร': attendee.registration.contactPhone || '',
          'ชื่อไลน์': attendee.lineProfile?.lineDisplayName || '',
          'จำนวนผู้เข้าร่วม': attendeeCount,
        };

        // Add room allocation columns - show only numbers for easier calculation
        sortedRoomTypes.forEach((roomType) => {
          const count = roomAllocationMap[roomType.typeId] || 0;
          baseData[`ห้องพัก: ${roomType.typeName}`] = count || 0;
        });

        // Calculate total room fee
        let totalRoomFee = 0;
        sortedRoomTypes.forEach((roomType) => {
          const count = roomAllocationMap[roomType.typeId] || 0;
          totalRoomFee += count * (roomType.price || 0);
        });

        // Add other merged data
        baseData['ค่าห้องพักรวม'] = totalRoomFee;
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

      // Calculate summary totals
      const summaryTotals: Record<string, any> = {
        'รหัสลงทะเบียน': 'สรุปรวม',
        'ชื่อบริษัท': '',
        'ผู้ติดต่อ': '',
        'เบอร์โทร': '',
        'ชื่อไลน์': '',
        'จำนวนผู้เข้าร่วม': 0,
      };

      // Calculate room totals
      const roomTotals: Record<string, number> = {};
      sortedRoomTypes.forEach((roomType) => {
        roomTotals[roomType.typeId] = 0;
      });

      // Sum up totals from filteredAttendees (not from exportData to avoid counting duplicates)
      let totalAttendees = 0;
      let totalAmount = 0;
      let totalApprovedAmount = 0;

      filteredAttendees.forEach((attendee) => {
        const reg = attendee.registration;
        totalAttendees += reg.attendeeCount || 0;
        totalAmount += reg.totalAmount || 0;

        // Calculate approved amount using same logic as above
        const isFullPaymentMode = eventData.event.paymentMode === 'full';
        let approvedAmount = 0;
        if (isFullPaymentMode) {
          if ((reg as any).fullPaymentPaid === true) {
            approvedAmount = reg.totalAmount || 0;
          }
        } else {
          if (reg.depositPaid === true) {
            approvedAmount += reg.depositAmount || 0;
          }
          if ((reg as any).remainingPaid === true) {
            approvedAmount += reg.remainingAmount || 0;
          }
        }
        totalApprovedAmount += approvedAmount;

        // Sum room allocations
        try {
          const roomAllocations = JSON.parse(reg.roomAllocations || '[]');
          if (Array.isArray(roomAllocations)) {
            roomAllocations.forEach((alloc: { roomTypeId: string; roomCount: number }) => {
              if (roomTotals[alloc.roomTypeId] !== undefined) {
                roomTotals[alloc.roomTypeId] += alloc.roomCount || 0;
              }
            });
          }
        } catch {
          // Ignore parse errors
        }
      });

      summaryTotals['จำนวนผู้เข้าร่วม'] = totalAttendees;

      // Add room totals to summary
      sortedRoomTypes.forEach((roomType) => {
        summaryTotals[`ห้องพัก: ${roomType.typeName}`] = roomTotals[roomType.typeId] || 0;
      });

      // Add other summary fields
      summaryTotals['ค่าห้องพักรวม'] = '';
      summaryTotals['สถานะ'] = '';
      summaryTotals['สถานะการชำระ'] = '';
      summaryTotals['ยอดรวม'] = totalAmount;
      summaryTotals['ยอดอนุมัติแล้ว'] = totalApprovedAmount;
      summaryTotals['ความต้องการพิเศษ'] = '';
      summaryTotals['ค่าใช้จ่ายเสริม'] = '';
      summaryTotals['ลำดับผู้เข้าร่วม'] = '';
      summaryTotals['ชื่อผู้เข้าร่วม'] = '';

      // Add summary row to export data
      exportData.push(summaryTotals);

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
          // Calculate total columns (excluding last 2: attendee order and name)
          // Base columns: 6 + room types + 6 other fields
          const baseColumns = 6; // รหัส, บริษัท, ผู้ติดต่อ, เบอร์, ไลน์, จำนวน
          const roomColumns = sortedRoomTypes.length;
          const otherColumns = 6; // ค่าห้อง, สถานะ, สถานะชำระ, ยอดรวม, อนุมัติ, ความต้องการ, ค่าเสริม
          const totalMergeColumns = baseColumns + roomColumns + otherColumns;

          // Merge all columns except last 2 (attendee order and name)
          for (let col = 0; col < totalMergeColumns; col++) {
            merges.push({
              s: { r: currentRow, c: col },
              e: { r: currentRow + rowCount - 1, c: col },
            });
          }
        }

        currentRow += rowCount;
      });

      ws['!merges'] = merges;

      // Set column widths
      const colWidths = [
        { wch: 18 }, // รหัสลงทะเบียน
        { wch: 35 }, // ชื่อบริษัท
        { wch: 25 }, // ผู้ติดต่อ
        { wch: 15 }, // เบอร์โทร
        { wch: 20 }, // ชื่อไลน์
        { wch: 12 }, // จำนวนผู้เข้าร่วม
      ];

      // Add room type columns widths
      sortedRoomTypes.forEach(() => {
        colWidths.push({ wch: 18 }); // ห้องพัก: [ชื่อประเภท]
      });

      // Add remaining columns widths
      colWidths.push(
        { wch: 15 }, // ค่าห้องพักรวม
        { wch: 15 }, // สถานะ
        { wch: 20 }, // สถานะการชำระ
        { wch: 12 }, // ยอดรวม
        { wch: 15 }, // ยอดอนุมัติแล้ว
        { wch: 40 }, // ความต้องการพิเศษ
        { wch: 15 }, // ค่าใช้จ่ายเสริม
        { wch: 12 }, // ลำดับผู้เข้าร่วม
        { wch: 30 }  // ชื่อผู้เข้าร่วม
      );

      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendees');

      // Generate filename with Thai date format
      const filename = `${eventData.event.eventName}_${formatThaiDateTime(new Date())}.xlsx`;

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

    // ✅ CRITICAL FIX: If attendeeTypeSelections is empty but event uses attendee type pricing,
    // initialize with default selection (all attendees as first active type)
    if ((!attendeeTypeSelections || attendeeTypeSelections.length === 0) && eventData?.event?.useAttendeeTypePricing) {
      const activeTypes = eventData.event.attendeeTypes?.filter((t: any) => t.isActive) || [];
      if (activeTypes.length > 0 && attendee.registration.attendeeCount > 0) {
        // Set all attendees to the first active type
        const firstType = activeTypes[0];
        attendeeTypeSelections = [{
          typeId: firstType.typeId,
          quantity: attendee.registration.attendeeCount
        }];
        console.log('[Edit Registration] Auto-initialized attendeeTypeSelections:', attendeeTypeSelections);
      }
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

    // ✅ CRITICAL VALIDATION: Check for pending payment slips
    // Before allowing registration edit, ensure there are no unapproved/unrejected payment slips
    // This prevents confusion about what total amount should be when there are pending slips
    try {
      const checkResponse = await fetch(`/api/payments/check-pending?registrationId=${editingRegistration}`);
      const checkData = await checkResponse.json();

      if (checkResponse.ok && checkData.hasPending) {
        setActionMessage({
          type: 'error',
          text: 'ไม่สามารถแก้ไขข้อมูลได้ เนื่องจากมีสลิปการชำระเงินที่รอตรวจสอบ กรุณาอนุมัติหรือปฏิเสธสลิปก่อน'
        });
        return;
      }
    } catch (err) {
      console.error('Error checking pending payment slips:', err);
      setActionMessage({
        type: 'error',
        text: 'เกิดข้อผิดพลาดในการตรวจสอบสลิปการชำระเงิน'
      });
      return;
    }

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

  // Check if registration has approved payments
  const hasApprovedPayments = (registration: any): { hasPayment: boolean; totalPaid: number } => {
    // ✅ FIX: paidAmount might not exist in API response, calculate from actual payment fields
    const fullPaymentAmountPaid = registration.fullPaymentAmountPaid || 0;
    const depositAmountPaid = registration.depositAmountPaid || 0;
    const remainingAmountPaid = registration.remainingAmountPaid || 0;

    // Calculate total paid from actual payment fields only (don't use paidAmount as it's not reliable)
    const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid;
    const hasPayment = paidAmount > 0;

    return { hasPayment, totalPaid: paidAmount };
  };

  const handleOpenCancellationModal = (registrationId: string) => {
    // Find registration
    const attendee = eventData?.attendees.find(a => a.registration.registrationId === registrationId);
    if (!attendee) return;

    // Check for approved payments
    const { hasPayment, totalPaid } = hasApprovedPayments(attendee.registration);

    // ✅ DEBUG: Log payment data
    console.log('[Delete Modal Debug]', {
      registrationId,
      paidAmount: attendee.registration.paidAmount,
      totalAmount: attendee.registration.totalAmount,
      fullPaymentAmountPaid: (attendee.registration as any).fullPaymentAmountPaid,
      hasPayment,
      totalPaid,
    });

    if (hasPayment) {
      // Show payment warning modal first
      setPaymentWarningModal({
        isOpen: true,
        totalPaid,
        registrationId,
      });
    } else {
      // Proceed to standard cancellation modal
      setCancellationFormData({
        registrationId,
        reason: '',
      });
      setCancellationModalOpen(true);
    }
  };

  const handleConfirmCancellationWithPayment = () => {
    // Close payment warning modal
    const registrationId = paymentWarningModal?.registrationId;
    setPaymentWarningModal(null);

    if (registrationId) {
      // Open standard cancellation modal
      setCancellationFormData({
        registrationId,
        reason: '',
      });
      setCancellationModalOpen(true);
    }
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
      setActionMessage({ type: 'error', text: 'กรุณาระบุสาเหตุการลบ' });
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

      setActionMessage({ type: 'success', text: 'ลบการลงทะเบียนเรียบร้อยแล้ว' });
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

  const handleOpenPaymentModal = (attendee: Attendee, paymentType?: 'deposit' | 'remaining' | 'full') => {
    // ✅ FIX: Auto-detect paymentType from event configuration if not specified
    let finalPaymentType: 'deposit' | 'remaining' | 'full' = paymentType || 'deposit';

    // If event is in Full Payment Mode, default to 'full' instead of 'deposit'
    if (!paymentType && eventData?.event?.paymentMode === 'full') {
      finalPaymentType = 'full';
    }

    // Auto-fill amount based on payment type
    let defaultAmount = 0;
    if (finalPaymentType === 'deposit') {
      defaultAmount = attendee.registration.depositAmount || 0;
    } else if (finalPaymentType === 'remaining') {
      defaultAmount = attendee.registration.remainingAmount || 0;
    } else if (finalPaymentType === 'full') {
      defaultAmount = attendee.registration.totalAmount || 0;
    }

    setPaymentFormData({
      registrationId: attendee.registration.registrationId,
      paymentType: finalPaymentType,
      amount: defaultAmount,
      slipUrl: finalPaymentType === 'deposit' ? attendee.registration.depositSlipUrl : attendee.registration.remainingSlipUrl,
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

        // Debug logging
        console.log('[Client] Uploading payment slip with eventId:', eventId, 'Type:', typeof eventId);
        console.log('[Client] RegistrationId:', paymentFormData.registrationId);

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

        // Check response before parsing JSON
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('[Client] Upload failed, response:', errorText);
          throw new Error(`อัพโหลดไฟล์ล้มเหลว: ${uploadResponse.status} ${uploadResponse.statusText}`);
        }

        const uploadData = await uploadResponse.json();

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

  const handleCopyQuickReport = () => {
    if (!eventData) return;

    // Calculate payment totals
    let totalAmount = 0;
    let totalPending = 0;
    let totalApproved = 0;

    const isFullPaymentMode = eventData.event.paymentMode === 'full';

    eventData.attendees.forEach(attendee => {
      const reg = attendee.registration;
      const amount = reg.totalAmount || 0;
      const depositAmount = reg.depositAmount || 0;
      const remainingAmount = reg.remainingAmount || 0;

      totalAmount += amount;

      if (isFullPaymentMode) {
        const isPaid = (reg as any).fullPaymentPaid === true;
        const hasSlip = (reg as any).fullPaymentSlipUrl && (reg as any).fullPaymentSlipUrl.trim() !== '';

        if (isPaid) {
          totalApproved += amount;
        } else if (hasSlip) {
          totalPending += amount;
        }
      } else {
        // Deposit payment
        if (reg.depositPaid === true) {
          totalApproved += depositAmount;
        } else if (reg.depositSlipUrl && reg.depositSlipUrl.trim() !== '') {
          totalPending += depositAmount;
        }

        // Remaining payment
        if ((reg as any).remainingPaid === true) {
          totalApproved += remainingAmount;
        } else if (reg.remainingSlipUrl && reg.remainingSlipUrl.trim() !== '') {
          totalPending += remainingAmount;
        }
      }
    });

    const report = `อัพเดทยอดสมาชิกลงทะเบียน
กิจกรรม ${eventData.event.eventName}
จำนวนเอเจ้นท์ที่ลงทะเบียน ${eventData.summary.agentRegistrations} เอเจ้นท์
จำนวนผู้เข้าร่วม ${eventData.summary.totalAttendees} คน

ยอดเงินที่เรียกเก็บรวม ${totalAmount.toLocaleString()} บาท
ยอดเงินที่รอตรวจสอบ ${totalPending.toLocaleString()} บาท
ยอดเงินที่ตรวจสอบแล้ว ${totalApproved.toLocaleString()} บาท`;

    // Copy to clipboard
    navigator.clipboard.writeText(report).then(() => {
      setActionMessage({ type: 'success', text: 'คัดลอกรายงานสำเร็จ!' });
      setTimeout(() => setActionMessage(null), 2000);
    }).catch(() => {
      setActionMessage({ type: 'error', text: 'ไม่สามารถคัดลอกได้' });
      setTimeout(() => setActionMessage(null), 2000);
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

      setActionMessage({ type: 'success', text: data.message || 'เพิ่มค่าใช้จ่ายเสริมเรียบร้อยแล้ว' });
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
    if (!confirm('ยืนยันการลบค่าใช้จ่ายเสริมนี้?')) return;

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

      setActionMessage({ type: 'success', text: data.message || 'ลบค่าใช้จ่ายเสริมเรียบร้อยแล้ว' });
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
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Copy Quick Report Button */}
              <button
                onClick={handleCopyQuickReport}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                title="คัดลอกรายงานด่วน"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="hidden sm:inline">Copy รายงาน</span>
              </button>

              {/* Send LINE Message Button */}
              <button
                onClick={() => setShowPromoteModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                title="ส่งข้อความ LINE ถึงสมาชิก"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="hidden sm:inline">ส่งข้อความ LINE</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6 lg:px-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-2 sm:gap-4 mb-4 sm:mb-6">
          {/* Registration Status - Paired */}
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-orange-200">
            <p className="text-xl sm:text-3xl font-bold text-orange-600">
              {eventData.summary.agentRegistrations - eventData.summary.confirmedCount}/{eventData.summary.agentRegistrations}
            </p>
            <p className="text-[10px] sm:text-sm text-gray-500">รอดำเนินการ/บริษัทลงทะเบียน</p>
          </div>

          {/* Confirmed Companies - Paired */}
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-teal-200">
            <p className="text-xl sm:text-3xl font-bold text-teal-600">
              {eventData.summary.confirmedCount}/{eventData.summary.agentRegistrations}
            </p>
            <p className="text-[10px] sm:text-sm text-gray-500">บริษัทยืนยันแล้ว/บริษัทลงทะเบียน</p>
          </div>

          {/* Total Attendees */}
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-indigo-200">
            <p className="text-xl sm:text-3xl font-bold text-indigo-600">{eventData.summary.totalAttendees || 0}</p>
            <p className="text-[10px] sm:text-sm text-gray-500">จำนวนผู้เข้าร่วม</p>
          </div>

          {/* Club Members - Paired */}
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-green-200">
            <p className="text-xl sm:text-3xl font-bold text-green-600">
              {eventData.summary.verifiedMemberCount}/{eventData.summary.clubMemberCount || 0}
            </p>
            <p className="text-[10px] sm:text-sm text-gray-500">ยืนยันตัวตนแล้ว/สมาชิกชมรม</p>
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

            eventData.attendees.forEach(attendee => {
              const reg = attendee.registration;
              const totalAmount = reg.totalAmount || 0;
              const depositAmount = reg.depositAmount || 0;
              const remainingAmount = reg.remainingAmount || 0;

              if (isFullPaymentMode) {
                // Full Payment Mode
                // Check if payment has been approved (fullPaymentPaid = true)
                // OR if slip exists but not approved yet (pending)
                const isPaid = (reg as any).fullPaymentPaid === true;
                const hasSlip = (reg as any).fullPaymentSlipUrl && (reg as any).fullPaymentSlipUrl.trim() !== '';

                if (isPaid) {
                  totalApproved += totalAmount;
                } else if (hasSlip) {
                  totalPending += totalAmount;
                }
              } else {
                // Deposit + Remaining Mode
                // Deposit payment
                if (reg.depositPaid === true) {
                  totalApproved += depositAmount;
                } else if (reg.depositSlipUrl && reg.depositSlipUrl.trim() !== '') {
                  totalPending += depositAmount;
                }

                // Remaining payment
                if ((reg as any).remainingPaid === true) {
                  totalApproved += remainingAmount;
                } else if (reg.remainingSlipUrl && reg.remainingSlipUrl.trim() !== '') {
                  totalPending += remainingAmount;
                }
              }
            });

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
              {filteredAttendees
                .sort((a, b) => {
                  // Sort by registration date (oldest first)
                  const dateA = new Date(a.registration.registrationDate || 0).getTime();
                  const dateB = new Date(b.registration.registrationDate || 0).getTime();
                  return dateA - dateB;
                })
                .map((attendee, index) => {
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
                          <span className="text-blue-600 font-medium">📅 ลงทะเบียน: {formatThaiDateTime(attendee.registration.registrationDate)}</span>
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

                        {/* Real-time Total Calculation */}
                        {(() => {
                          let calculatedEventFee = 0;
                          let calculatedRoomFee = 0;

                          // ✅ Get or auto-initialize attendeeTypeSelections for calculation
                          let effectiveAttendeeTypeSelections = editFormData.attendeeTypeSelections;
                          if (eventData?.event?.useAttendeeTypePricing && (!effectiveAttendeeTypeSelections || effectiveAttendeeTypeSelections.length === 0)) {
                            // Auto-initialize with first active type if needed
                            const activeTypes = eventData.event.attendeeTypes?.filter((t: any) => t.isActive) || [];
                            if (activeTypes.length > 0 && editFormData.attendeeCount > 0) {
                              const firstType = activeTypes[0];
                              effectiveAttendeeTypeSelections = [{
                                typeId: firstType.typeId,
                                quantity: editFormData.attendeeCount
                              }];
                              console.log('[Real-time Calc] Auto-initialized attendeeTypeSelections:', effectiveAttendeeTypeSelections);
                            }
                          }

                          // Calculate event fee based on pricing type
                          if (eventData?.event?.useAttendeeTypePricing) {
                            // Attendee type pricing
                            if (effectiveAttendeeTypeSelections && effectiveAttendeeTypeSelections.length > 0 && eventData.event.attendeeTypes && eventData.event.attendeeTypes.length > 0) {
                              const attendeeTypes = eventData.event.attendeeTypes;
                              calculatedEventFee = effectiveAttendeeTypeSelections.reduce((sum, sel) => {
                                const type = attendeeTypes.find((t: any) => t.typeId === sel.typeId);
                                return sum + (type ? type.price * sel.quantity : 0);
                              }, 0);
                            } else {
                              // Fallback: If no attendee type selections, try to use stored eventFee
                              calculatedEventFee = (attendee?.registration as any)?.eventFee || 0;
                            }
                          } else {
                            // Fixed or Tiered Pricing
                            if (eventData?.event && editFormData.attendeeCount > 0) {
                              try {
                                calculatedEventFee = calculateRegistrationFee(eventData.event as any, editFormData.attendeeCount, true) || 0;
                              } catch (e) {
                                console.error('Error calculating event fee:', e);
                                // Fallback to stored eventFee
                                calculatedEventFee = (attendee?.registration as any)?.eventFee || 0;
                              }
                            } else {
                              // Fallback: Use stored eventFee if calculation not possible
                              calculatedEventFee = (attendee?.registration as any)?.eventFee || 0;
                            }
                          }

                          // Calculate room fee
                          if (editFormData.roomAllocations && editFormData.roomAllocations.length > 0 && eventData?.event?.roomTypes && eventData.event.roomTypes.length > 0) {
                            const roomTypes = eventData.event.roomTypes;
                            calculatedRoomFee = editFormData.roomAllocations.reduce((sum, alloc) => {
                              const roomType = roomTypes.find((rt: any) => rt.typeId === alloc.roomTypeId);
                              return sum + (roomType ? roomType.price * alloc.roomCount : 0);
                            }, 0);
                          } else {
                            // Fallback: Use stored roomFee if no calculations possible
                            calculatedRoomFee = (attendee?.registration as any)?.roomFee || 0;
                          }

                          // Get special charges
                          let specialChargesTotal = 0;
                          try {
                            if (attendee?.registration?.specialCharges) {
                              const specialCharges = typeof attendee.registration.specialCharges === 'string'
                                ? JSON.parse(attendee.registration.specialCharges)
                                : attendee.registration.specialCharges;
                              if (Array.isArray(specialCharges)) {
                                specialChargesTotal = specialCharges.reduce((sum: number, c: any) => sum + (c?.amount || 0), 0);
                              }
                            }
                          } catch (e) {
                            console.error('Error parsing special charges:', e);
                            specialChargesTotal = 0;
                          }

                          const calculatedTotal = (calculatedEventFee || 0) + (calculatedRoomFee || 0) + (specialChargesTotal || 0);

                          // Debug logging for calculation values
                          console.log('[Real-time Calculation Debug]', {
                            registrationId: attendee?.registration?.registrationId,
                            attendeeCount: editFormData.attendeeCount,
                            calculatedEventFee,
                            calculatedRoomFee,
                            specialChargesTotal,
                            calculatedTotal,
                            useAttendeeTypePricing: eventData?.event?.useAttendeeTypePricing,
                            attendeeTypeSelections: editFormData.attendeeTypeSelections,
                            attendeeTypes: eventData?.event?.attendeeTypes,
                            roomAllocations: editFormData.roomAllocations,
                            roomTypes: eventData?.event?.roomTypes,
                            storedEventFee: (attendee?.registration as any)?.eventFee,
                            storedRoomFee: (attendee?.registration as any)?.roomFee,
                            storedTotalAmount: attendee?.registration?.totalAmount
                          });

                          // Show calculation even if total is 0 (could be free event or pending calculation)
                          // Only hide if NaN or negative
                          if (isNaN(calculatedTotal) || calculatedTotal < 0) {
                            console.warn('[Real-time Calculation] Invalid total:', calculatedTotal);
                            return null;
                          }

                          return (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                              <h4 className="text-xs font-semibold text-green-900 mb-2">💰 ยอดรวมที่คำนวณได้</h4>
                              <div className="space-y-1 text-xs text-gray-700">
                                {/* ALWAYS show event fee line */}
                                <div className="flex justify-between">
                                  <span>ค่าเข้าร่วมกิจกรรม:</span>
                                  <span className="font-semibold">฿{calculatedEventFee.toLocaleString()}</span>
                                </div>
                                {/* ALWAYS show room fee line */}
                                <div className="flex justify-between">
                                  <span>ค่าห้องพัก:</span>
                                  <span className="font-semibold">฿{calculatedRoomFee.toLocaleString()}</span>
                                </div>
                                {/* Only show special charges if > 0 */}
                                {specialChargesTotal > 0 && (
                                  <div className="flex justify-between">
                                    <span>ค่าใช้จ่ายเสริม:</span>
                                    <span className="font-semibold">฿{specialChargesTotal.toLocaleString()}</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-green-300 pt-1 mt-1">
                                  <span className="font-bold text-green-900">ยอดรวมทั้งหมด:</span>
                                  <span className="font-bold text-lg text-green-700">฿{calculatedTotal.toLocaleString()}</span>
                                </div>
                              </div>
                              <p className="text-xs text-green-700 mt-2 italic">
                                * ยอดนี้จะถูกบันทึกเมื่อกดปุ่ม "บันทึก"
                              </p>
                            </div>
                          );
                        })()}

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
                              <span className="text-sm font-semibold text-purple-900">ค่าใช้จ่ายเสริม</span>
                              <button
                                onClick={() => handleOpenSpecialChargeModal(attendee)}
                                className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                              >
                                + เพิ่มค่าใช้จ่ายเสริม
                              </button>
                            </div>

                            {specialCharges.length > 0 ? (
                              <div className="space-y-2">
                                {specialCharges.map((charge: any) => (
                                  <div key={charge.chargeId} className="flex items-start justify-between bg-white border border-purple-200 rounded p-2">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-800">{charge.description}</p>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        เพิ่มเมื่อ: {formatThaiDateTime(charge.addedAt)}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                      <span className="text-sm font-bold text-purple-700">
                                        +฿{charge.amount.toLocaleString()}
                                      </span>
                                      <button
                                        onClick={() => handleDeleteSpecialCharge(attendee.registration.registrationId, charge.chargeId)}
                                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                                        title="ลบค่าใช้จ่ายเสริม"
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
                                    <span className="font-medium text-gray-600">รวมค่าใช้จ่ายเสริม:</span>
                                    <span className="font-bold text-purple-700">
                                      +฿{specialCharges.reduce((sum: number, c: any) => sum + c.amount, 0).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 italic">ไม่มีค่าใช้จ่ายเสริม</p>
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
                            {/* Payment Breakdown - Show for all modes */}
                            {(() => {
                              const totalAmount = attendee.registration.totalAmount || 0;
                              // ✅ FIX: Calculate paidAmount from actual payment fields only (don't use paidAmount as it's not reliable)
                              const fullPaymentAmountPaid = (attendee.registration as any).fullPaymentAmountPaid || 0;
                              const depositAmountPaid = (attendee.registration as any).depositAmountPaid || 0;
                              const remainingAmountPaid = (attendee.registration as any).remainingAmountPaid || 0;
                              const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid;
                              const additionalRequired = Math.max(0, totalAmount - paidAmount);

                              // DEBUG: Log payment calculation
                              console.log('Payment Debug [BUILD a0fc466]:', {
                                registrationId: attendee.registration.registrationId,
                                totalAmount,
                                fullPaymentAmountPaid,
                                depositAmountPaid,
                                remainingAmountPaid,
                                paidAmount,
                                additionalRequired,
                                timestamp: new Date().toISOString(),
                                raw: attendee.registration
                              });

                              return (
                                <>
                                  {/* ALWAYS show total amount */}
                                  <div className="flex items-center justify-between">
                                    <span className="text-gray-600">ยอดรวมทั้งหมด:</span>
                                    <span className="font-semibold">฿{totalAmount.toLocaleString()}</span>
                                  </div>

                                  {/* Show paid amount if > 0 */}
                                  {paidAmount > 0 && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-600">ยอดชำระแล้ว:</span>
                                      <span className="font-semibold text-blue-600">฿{paidAmount.toLocaleString()}</span>
                                    </div>
                                  )}

                                  {/* Show outstanding if > 0 */}
                                  {additionalRequired > 0 && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-orange-700 font-medium">คงเหลือยอดค้างชำระ:</span>
                                      <span className="font-semibold text-orange-600">฿{additionalRequired.toLocaleString()}</span>
                                    </div>
                                  )}
                                </>
                              );
                            })()}

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
                                          ❌ ลบการลงทะเบียน
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="mt-2 flex gap-2">
                                      <button
                                        onClick={() => handleOpenPaymentModal(attendee, 'deposit')}
                                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                                      >
                                        📤 อัพโหลดสลิป
                                      </button>
                                      <button
                                        onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                        className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                        title="ลบการลงทะเบียน"
                                      >
                                        ❌ ยกเลิก
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
                                        {/* Show additional payment button if there are extra charges */}
                                        {hasAdditionalCharges(attendee, eventData.event.paymentMode || 'deposit') ? (
                                          <div className="space-y-2">
                                            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs space-y-1">
                                              <div className="flex items-center justify-between">
                                                <span className="text-gray-700">ยอดรวมทั้งหมด:</span>
                                                <span className="font-semibold text-gray-900">฿{attendee.registration.totalAmount.toLocaleString()}</span>
                                              </div>
                                              {(() => {
                                                // ✅ Calculate paidAmount from actual payment fields only (don't use paidAmount as it's not reliable)
                                                const fullPaymentAmountPaid = (attendee.registration as any).fullPaymentAmountPaid || 0;
                                                const depositAmountPaid = (attendee.registration as any).depositAmountPaid || 0;
                                                const remainingAmountPaid = (attendee.registration as any).remainingAmountPaid || 0;
                                                const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid;
                                                const additionalRequired = getAdditionalAmount(attendee, eventData.event.paymentMode || 'deposit');
                                                return (
                                                  <>
                                                    <div className="flex items-center justify-between border-t border-blue-200 pt-1">
                                                      <span className="text-gray-700">ยอดชำระแล้ว:</span>
                                                      <span className="font-semibold text-blue-600">฿{paidAmount.toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between border-t border-blue-200 pt-1">
                                                      <span className="text-orange-700 font-medium">ยอดชำระเพิ่ม:</span>
                                                      <span className="font-semibold text-orange-600">฿{additionalRequired.toLocaleString()}</span>
                                                    </div>
                                                  </>
                                                );
                                              })()}
                                            </div>
                                            <div className="flex gap-2">
                                              <button
                                                onClick={() => {
                                                  // Create a modified attendee object with updated remainingAmount
                                                  const modifiedAttendee = {
                                                    ...attendee,
                                                    registration: {
                                                      ...attendee.registration,
                                                      remainingAmount: getAdditionalAmount(attendee, eventData.event.paymentMode || 'deposit')
                                                    }
                                                  };
                                                  handleOpenPaymentModal(modifiedAttendee, 'remaining');
                                                }}
                                                className="flex-1 px-3 py-1.5 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 transition-colors"
                                              >
                                                📤 อัพโหลดสลิป
                                              </button>
                                              <button
                                                onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                                className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                                title="ลบการลงทะเบียน"
                                              >
                                                ❌ ยกเลิก
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                            className="w-full px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                            title="ลบการลงทะเบียน"
                                          >
                                            ❌ ลบการลงทะเบียน
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="mt-2 flex gap-2">
                                        <button
                                          onClick={() => handleOpenPaymentModal(attendee, 'remaining')}
                                          className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                        >
                                          📤 อัพโหลดสลิป
                                        </button>
                                        <button
                                          onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                          className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                          title="ลบการลงทะเบียน"
                                        >
                                          ❌ ยกเลิก
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
                                {(() => {
                                  // ✅ Calculate paidAmount from actual payment fields only (don't use paidAmount as it's not reliable)
                                  const totalAmount = attendee.registration.totalAmount || 0;
                                  const fullPaymentAmountPaid = (attendee.registration as any).fullPaymentAmountPaid || 0;
                                  const depositAmountPaid = (attendee.registration as any).depositAmountPaid || 0;
                                  const remainingAmountPaid = (attendee.registration as any).remainingAmountPaid || 0;
                                  const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid;
                                  const additionalRequired = Math.max(0, totalAmount - paidAmount);
                                  const isFullyPaid = paidAmount >= totalAmount && paidAmount > 0;
                                  const hasPayment = attendee.registration.depositPaid;

                                  return (
                                    <>
                                      {hasPayment ? (
                                        <div className="mt-1 space-y-2">
                                          {/* Show payment breakdown */}
                                          <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs space-y-1">
                                            <div className="flex items-center justify-between">
                                              <span className="text-gray-700">ยอดรวมทั้งหมด:</span>
                                              <span className="font-semibold text-gray-900">฿{totalAmount.toLocaleString()}</span>
                                            </div>
                                            <div className="flex items-center justify-between border-t border-blue-200 pt-1">
                                              <span className="text-gray-700">ยอดชำระแล้ว:</span>
                                              <span className="font-semibold text-blue-600">฿{paidAmount.toLocaleString()}</span>
                                            </div>
                                            {additionalRequired > 0 && (
                                              <div className="flex items-center justify-between border-t border-blue-200 pt-1">
                                                <span className="text-orange-700 font-medium">ยอดชำระเพิ่ม:</span>
                                                <span className="font-semibold text-orange-600">฿{additionalRequired.toLocaleString()}</span>
                                              </div>
                                            )}
                                          </div>

                                          {isFullyPaid ? (
                                            <>
                                              <div className="flex items-center gap-2 text-green-600">
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
                                                ❌ ลบการลงทะเบียน
                                              </button>
                                            </>
                                          ) : (
                                            <>
                                              <div className="flex items-center gap-2 text-orange-600">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                ต้องชำระเงินเพิ่มเติม ฿{additionalRequired.toLocaleString()}
                                              </div>
                                              <div className="flex gap-2">
                                                <button
                                                  onClick={() => {
                                                    const modifiedAttendee = {
                                                      ...attendee,
                                                      registration: {
                                                        ...attendee.registration,
                                                        remainingAmount: additionalRequired
                                                      }
                                                    };
                                                    handleOpenPaymentModal(modifiedAttendee, 'remaining');
                                                  }}
                                                  className="flex-1 px-3 py-1.5 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 transition-colors"
                                                >
                                                  📤 อัพโหลดสลิปเพิ่ม
                                                </button>
                                                <button
                                                  onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                                  title="ลบการลงทะเบียน"
                                                >
                                                  ❌ ยกเลิก
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="mt-2 flex gap-2">
                                          <button
                                            onClick={() => handleOpenPaymentModal(attendee, 'full')}
                                            className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                          >
                                            📤 อัพโหลดสลิป
                                          </button>
                                          <button
                                            onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                            title="ลบการลงทะเบียน"
                                          >
                                            ❌ ยกเลิก
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>

                          {/* ✅ Payment History - Inline Table */}
                          <PaymentHistoryInline
                            registrationId={attendee.registration.registrationId}
                            onUpdate={() => fetchEventData()}
                          />
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
                          ❌ ลบการลงทะเบียน
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
              อัพโหลดสลิปการชำระเงิน
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
              เพิ่มค่าใช้จ่ายเสริม
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
                  ระบุรายละเอียดของค่าใช้จ่ายเสริม
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
                  <strong>หมายเหตุ:</strong> ค่าใช้จ่ายเสริมจะถูกเพิ่มเข้าไปในยอดรวมทั้งหมด และจะแสดงเฉพาะกับสมาชิกท่านนี้เท่านั้น
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
            <h3 className="text-xl font-semibold text-gray-900 mb-4">ลบการลงทะเบียน</h3>

            <div className="space-y-4">
              {/* Warning */}
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  <strong>คำเตือน:</strong> การลบการลงทะเบียนจะเปลี่ยนสถานะเป็น "ยกเลิก" และไม่สามารถกู้คืนได้
                </p>
              </div>

              {/* Cancellation Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  สาเหตุการลบ <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={cancellationFormData.reason}
                  onChange={(e) => setCancellationFormData({ ...cancellationFormData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="ระบุสาเหตุการลบ เช่น ลูกค้าขอยกเลิก, ไม่สะดวกเข้าร่วม, ฯลฯ"
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
                {cancelling ? 'กำลังลบ...' : 'ยืนยันการลบ'}
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

      {/* Payment Warning Modal (for cancellations with approved payments) */}
      {paymentWarningModal?.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">⚠️ คำเตือน: มียอดชำระเงินแล้ว</h2>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-yellow-900 mb-2">
                  รหัสลงทะเบียน: {paymentWarningModal.registrationId}
                </p>
                <p className="text-sm text-yellow-800 mb-2">
                  การลงทะเบียนนี้มียอดชำระเงินที่ได้รับการอนุมัติแล้ว:
                </p>
                <p className="text-2xl font-bold text-yellow-900">
                  ฿{paymentWarningModal.totalPaid.toLocaleString()}
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  <strong>หากยืนยันลบ:</strong>
                </p>
                <ul className="list-disc list-inside text-sm text-red-700 mt-2 space-y-1">
                  <li>ระบบจะไม่คำนวณยอดเงิน ฿{paymentWarningModal.totalPaid.toLocaleString()} นี้ในยอดรับรวม</li>
                  <li>การลงทะเบียนจะถูกยกเลิกและไม่สามารถกู้คืนได้</li>
                  <li>คุณอาจต้องติดต่อสมาชิกเพื่อคืนเงิน</li>
                </ul>
              </div>

              <p className="text-sm text-gray-600">
                คุณแน่ใจหรือไม่ว่าต้องการลบการลงทะเบียนนี้?
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPaymentWarningModal(null)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmCancellationWithPayment}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                ยืนยันลบการลงทะเบียน
              </button>
            </div>
          </div>
        </div>
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

      {/* Promote Event Modal */}
      <PromoteEventModal
        isOpen={showPromoteModal}
        onClose={() => setShowPromoteModal(false)}
        eventId={eventId as string}
        eventName={eventData?.event?.eventName || ''}
        eventDescription={eventData?.event?.description || ''}
        registeredMembers={
          eventData?.attendees
            .filter(a => a.registration.lineUserId && a.registration.status !== 'cancelled')
            .map(a => ({
              lineUserId: a.registration.lineUserId,
              contactName: a.registration.contactName,
              companyName: a.registration.companyName,
              lineDisplayName: a.lineProfile?.lineDisplayName,
            })) || []
        }
      />
    </div>
  );
}
