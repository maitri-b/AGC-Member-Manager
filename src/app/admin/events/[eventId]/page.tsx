'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useEffectiveSessionContext } from '@/lib/EffectiveSessionProvider';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import * as XLSX from 'xlsx-js-style';
import { formatDeadline, getTimeRemaining } from '@/lib/payment-deadlines';
import { getStatusBadgeClass } from '@/lib/payment-status';
import { calculateRegistrationFee } from '@/types/event';
import { formatThaiDateTime, formatEventDateRange } from '@/lib/date-utils';
import RegisterOnBehalfModal from './RegisterOnBehalfModal';
import PaymentDetailsModal from '@/components/admin/PaymentDetailsModal';
import MessageTemplateModal from '@/components/admin/MessageTemplateModal';
import RoomManagementModal from '@/components/admin/RoomManagementModal';
import CarpoolManagementModal from '@/components/admin/CarpoolManagementModal';
import PartyTableManagementModal from '@/components/admin/PartyTableManagementModal';
import CarNumberAssignmentModal from '@/components/admin/CarNumberAssignmentModal';
import AdminCancellationModal from '@/components/admin/AdminCancellationModal';
import CarpoolDetailModal from '@/components/admin/CarpoolDetailModal';
import EventSummaryQRModal from '@/components/admin/EventSummaryQRModal';
import { Event as EventType, EventRegistration, CancellationPolicy } from '@/types/event';
import { parseAttendeeNames } from '@/lib/message-templates';

interface Event {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  eventEndDate?: string;
  location: string;
  description: string;
  year: number;
  isActive: boolean;
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
  // Carpool feature
  hasCarpoolFeature?: boolean;
  carpoolSettings?: {
    totalCarNumbers: number;
    maxSeatsPerCar?: number;
    showCarNumbersToMembers?: boolean;
  };
  // Party Table feature
  hasPartyTableFeature?: boolean;
  partyTableSettings?: {
    totalTables: number;
    defaultSeatsPerTable: number;
    maxSeatsPerTable?: number;
    showTableNumbersToMembers: boolean;
    tableActive: boolean;
  };
  // Cancellation policy
  cancellationPolicy?: CancellationPolicy;
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
    // Discounts
    discounts?: string; // JSON stringified
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
  hasRegisteredCarpool?: boolean;
  hasJoinedCarpool?: boolean;
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

// Helper function to check if registration is cancelled
function isCancelledRegistration(attendee: Attendee): boolean {
  const status = attendee.registration.status?.toLowerCase() || '';
  return status === 'cancelled' || attendee.registration.status?.includes('ยกเลิก') || false;
}

// Helper function to check if there are additional charges after payment
function hasAdditionalCharges(attendee: Attendee, eventPaymentMode: 'full' | 'deposit'): boolean {
  const reg = attendee.registration;
  const totalAmount = reg.totalAmount || 0;

  // ✅ FIX: Calculate paidAmount from actual payment fields (don't use reg.paidAmount as it's not reliable)
  const fullPaymentAmountPaid = (reg as any).fullPaymentAmountPaid || 0;
  const depositAmountPaid = (reg as any).depositAmountPaid || 0;
  const remainingAmountPaid = (reg as any).remainingAmountPaid || 0;
  const additionalPaymentAmountPaid = (reg as any).additionalPaymentAmountPaid || 0;
  const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;

  if (eventPaymentMode === 'full') {
    // ✅ Full payment mode: check if totalAmount > paidAmount and payment has been made
    const hasStartedPayment = reg.fullPaymentPaid === true || paidAmount > 0;
    return hasStartedPayment && totalAmount > paidAmount;
  } else {
    // Deposit mode: check if totalAmount > actual paid amounts when payments are made
    return reg.depositPaid === true && totalAmount > paidAmount;
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
  const additionalPaymentAmountPaid = (reg as any).additionalPaymentAmountPaid || 0;

  // Calculate total paid from actual payment fields only
  // ✅ CRITICAL FIX: Include additionalPaymentAmountPaid
  const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;

  // Calculate additional required (remaining balance) regardless of payment mode
  return Math.max(0, totalAmount - paidAmount);
}

// ✅ Payment History Inline Component
function PaymentHistoryInline({ registrationId, onUpdate }: { registrationId: string; onUpdate: () => void }) {
  const [paymentSlips, setPaymentSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxImage, setLightboxImage] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // ✅ NEW: Edit slip modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingSlip, setEditingSlip] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    amount: 0,
    uploadedAt: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Helper function to extract name from adminNotes or lineUserId for legacy data
  const extractReviewerName = (slip: any): string | null => {
    // 1. Try to parse from adminNotes (e.g., "อัพโหลดและอนุมัติโดย Admin: ไมตรี-ไมค์ (เต็มจำนวน: 3,999 บาท)")
    if (slip.adminNotes) {
      const match = slip.adminNotes.match(/Admin:\s*([^\(]+)/);
      if (match) {
        return match[1].trim();
      }
    }

    // 2. Fallback to lineUserId mapping
    const userMap: Record<string, string> = {
      'U1f4b2bc103c14c0b853c2cee2c045986': 'ไมตรี-ไมค์',
      'Ubd3593034ce774f031ffdfb07a56d100': "P'Nee",
    };
    return userMap[slip.reviewedBy || slip.uploadedBy] || null;
  };

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

  const handleHardDelete = async (slipId: string, slipStatus: string) => {
    const confirmMessage = slipStatus === 'approved'
      ? 'คุณต้องการลบสลิปที่อนุมัติแล้วใช่หรือไม่? สถานะการชำระเงินจะถูกอัพเดทใหม่'
      : 'คุณต้องการลบสลิปนี้ใช่หรือไม่?';

    if (!confirm(confirmMessage)) return;

    const reason = prompt('กรุณาระบุเหตุผลในการลบสลิป:');
    if (!reason) return;

    try {
      const response = await fetch(`/api/payments/${slipId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete payment slip');
      }
      alert('ลบสลิปเรียบร้อยแล้ว');
      await fetchPaymentSlips();
      onUpdate();
    } catch (error) {
      console.error('Error deleting payment slip:', error);
      alert(error instanceof Error ? error.message : 'ไม่สามารถลบสลิปได้');
    }
  };

  // ✅ NEW: Open edit modal
  const handleOpenEditModal = (slip: any) => {
    setEditingSlip(slip);
    setEditFormData({
      amount: slip.amount,
      uploadedAt: slip.uploadedAt ? new Date(slip.uploadedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setEditModalOpen(true);
  };

  // ✅ NEW: Close edit modal
  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditingSlip(null);
    setEditFormData({ amount: 0, uploadedAt: '' });
  };

  // ✅ NEW: Save edited slip
  const handleSaveEdit = async (approveImmediately: boolean = false) => {
    if (!editingSlip) return;

    if (editFormData.amount <= 0) {
      alert('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }

    setSavingEdit(true);
    try {
      // Update slip
      const updateResponse = await fetch(`/api/payments/${editingSlip.slipId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: editFormData.amount,
          uploadedAt: new Date(editFormData.uploadedAt).toISOString(),
        }),
      });

      if (!updateResponse.ok) {
        const data = await updateResponse.json();
        throw new Error(data.error || 'Failed to update slip');
      }

      // If approveImmediately, also approve the slip
      if (approveImmediately) {
        const approveResponse = await fetch(`/api/payments/${editingSlip.slipId}/approve`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminNotes: `แก้ไขและอนุมัติโดย Admin (จำนวนเงิน: ${editFormData.amount.toLocaleString()} บาท)`,
          }),
        });

        if (!approveResponse.ok) {
          throw new Error('Failed to approve slip after update');
        }
      }

      alert(
        approveImmediately
          ? 'บันทึกและอนุมัติสลิปเรียบร้อยแล้ว'
          : 'บันทึกข้อมูลสลิปเรียบร้อยแล้ว'
      );

      // Refresh data
      await fetchPaymentSlips();
      onUpdate();

      // Always close modal after save
      handleCloseEditModal();
    } catch (error) {
      console.error('Error saving edit:', error);
      alert(error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลได้');
    } finally {
      setSavingEdit(false);
    }
  };

  const getPaymentTypeName = (type: string) => {
    const names: Record<string, string> = {
      full: 'ชำระเต็มจำนวน',
      deposit: 'ชำระมัดจำ',
      remaining: 'ชำระยอดคงเหลือ',
      additional: 'ชำระเพิ่มเติม',
      refund: '💸 โอนเงินคืน (Refund)',
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
                <th className="px-2 py-1.5 text-left text-[10px] sm:text-xs font-semibold text-gray-700 hidden sm:table-cell">ผู้ดำเนินการ</th>
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
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap ${
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
                    <td className={`px-2 py-2 text-right text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                      slip.paymentType === 'refund' ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {slip.paymentType === 'refund' ? '-' : ''}{slip.amount.toLocaleString()} บาท
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
                    <td className="px-2 py-2 text-left text-[10px] sm:text-xs text-gray-700 hidden sm:table-cell">
                      {slip.status === 'approved' ? (
                        <div className="space-y-0.5">
                          <div className="text-green-700 font-medium">
                            ✓ {slip.reviewedByName || extractReviewerName(slip) || 'Admin'}
                          </div>
                          {slip.reviewedAt && (
                            <div className="text-[9px] text-gray-500">
                              {new Date(slip.reviewedAt).toLocaleDateString('th-TH', {
                                year: '2-digit',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          )}
                        </div>
                      ) : slip.status === 'rejected' ? (
                        <div className="space-y-0.5">
                          <div className="text-red-700 font-medium">
                            ✗ {slip.reviewedByName || extractReviewerName(slip) || 'Admin'}
                          </div>
                          {slip.reviewedAt && (
                            <div className="text-[9px] text-gray-500">
                              {new Date(slip.reviewedAt).toLocaleDateString('th-TH', {
                                year: '2-digit',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          )}
                        </div>
                      ) : slip.uploadedByName ? (
                        <div className="space-y-0.5">
                          <div className="text-blue-700 font-medium">
                            📤 {slip.uploadedByName}
                          </div>
                          <div className="text-[9px] text-gray-500">
                            (อัพโหลด)
                          </div>
                        </div>
                      ) : slip.uploadedBy ? (
                        <div className="space-y-0.5">
                          <div className="text-blue-700 font-medium">
                            📤 {extractReviewerName(slip) || 'User'}
                          </div>
                          <div className="text-[9px] text-gray-500">
                            (อัพโหลด)
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
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
                              onClick={() => handleOpenEditModal(slip)}
                              className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-colors"
                              title="แก้ไข"
                            >
                              ✏️ แก้ไข
                            </button>
                            <button
                              onClick={() => handleApprove(slip.slipId)}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                              title="อนุมัติ"
                            >
                              ✓ อนุมัติ
                            </button>
                            <button
                              onClick={() => handleReject(slip.slipId)}
                              className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                              title="ปฏิเสธ"
                            >
                              ✗ ปฏิเสธ
                            </button>
                          </>
                        )}
                        {/* Admin can delete any slip regardless of status */}
                        <button
                          onClick={() => handleHardDelete(slip.slipId, slip.status)}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                          title="ลบสลิปถาวร (Admin เท่านั้น)"
                        >
                          🗑️ ลบ
                        </button>
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
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70] p-4"
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

      {/* ✅ NEW: Edit Slip Modal */}
      {editModalOpen && editingSlip && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            {/* Header */}
            <div className="bg-purple-50 border-b border-purple-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <h2 className="text-lg font-semibold text-purple-900">แก้ไขข้อมูลสลิป</h2>
              </div>
              <button
                onClick={handleCloseEditModal}
                className="text-gray-400 hover:text-gray-600"
                disabled={savingEdit}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Slip Info */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ประเภท:</span>
                  <span className="font-semibold text-gray-900">{getPaymentTypeName(editingSlip.paymentType)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">สถานะ:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSlipStatusBadgeClass(editingSlip.status)}`}>
                    {getSlipStatusText(editingSlip.status)}
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  จำนวนเงิน (บาท) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={editFormData.amount}
                  onChange={(e) => setEditFormData({ ...editFormData, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="0"
                  min="0"
                  step="0.01"
                  disabled={savingEdit}
                />
              </div>

              {/* Date Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  วันที่อัพโหลด <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={editFormData.uploadedAt}
                  onChange={(e) => setEditFormData({ ...editFormData, uploadedAt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  disabled={savingEdit}
                />
              </div>

              {/* Preview Slip Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">สลิปการชำระเงิน</label>
                <img
                  src={editingSlip.slipUrl}
                  alt="Payment Slip"
                  className="w-full h-48 object-contain bg-gray-100 rounded-lg cursor-pointer"
                  onClick={() => {
                    setLightboxImage(editingSlip.slipUrl);
                    setLightboxOpen(true);
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex gap-3">
              <button
                onClick={() => handleSaveEdit(false)}
                disabled={savingEdit}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEdit ? 'กำลังบันทึก...' : '💾 บันทึก'}
              </button>
              <button
                onClick={() => handleSaveEdit(true)}
                disabled={savingEdit}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEdit ? 'กำลังดำเนินการ...' : '✓ บันทึกพร้อมอนุมัติ'}
              </button>
              <button
                onClick={handleCloseEditModal}
                disabled={savingEdit}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function EventDetailPage() {
  const params = useParams();
  const eventId = decodeURIComponent(params.eventId as string);
  const { data: session, status } = useSession(); // Real admin session
  const { data: effectiveSession, status: effectiveStatus } = useEffectiveSessionContext(); // Effective session (for permission checks)
  const router = useRouter();
  const [eventData, setEventData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending' | 'cancelled'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | string>('all');
  const [roomTypeFilter, setRoomTypeFilter] = useState<'all' | string>('all');
  const [managementFilter, setManagementFilter] = useState<'all' | 'no-room' | 'no-carpool' | 'no-table'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [allCarpools, setAllCarpools] = useState<any[]>([]);
  const [allPartyTables, setAllPartyTables] = useState<any[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [recalculateLoading, setRecalculateLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [expandedRegistrations, setExpandedRegistrations] = useState<Set<string>>(new Set());
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showRoomManagementModal, setShowRoomManagementModal] = useState(false);
  const [showCarpoolManagementModal, setShowCarpoolManagementModal] = useState(false);
  const [showPartyTableManagementModal, setShowPartyTableManagementModal] = useState(false);
  const [showEventSummaryQRModal, setShowEventSummaryQRModal] = useState(false);
  const [showCarNumberAssignmentModal, setShowCarNumberAssignmentModal] = useState(false);
  // Carpool detail modal state
  const [showCarpoolDetailModal, setShowCarpoolDetailModal] = useState(false);
  const [selectedCarpoolRegistration, setSelectedCarpoolRegistration] = useState<{
    registrationId: string;
    contactName: string;
  } | null>(null);
  const [editingRegistration, setEditingRegistration] = useState<string | null>(null);
  const [originalAttendeeCount, setOriginalAttendeeCount] = useState<number>(1); // Track original count for validation
  const [editFormData, setEditFormData] = useState<{
    attendeeCount: number;
    attendeeNames: string[];
    status: string;
    contactPhone?: string;
    contactEmail?: string;
    specialRequests?: string;
    attendeeTypeSelections?: Array<{ typeId: string; quantity: number }>;
    roomAllocations?: Array<{ roomTypeId: string; roomCount: number }>;
    roomAssignments?: Array<{ roomId: string; attendeeIndex: number }>;
  }>({ attendeeCount: 1, attendeeNames: [''], status: 'รอดำเนินการ' });
  const [updating, setUpdating] = useState(false);

  // Toast notification for copy registration ID
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [copiedRegistrationId, setCopiedRegistrationId] = useState('');

  // Room management state - Lifted to parent level to prevent N+1 queries
  const [availableRooms, setAvailableRooms] = useState<Array<{
    roomId: string;
    buildingName: string;
    roomNumber: string;
    roomTypeCategory?: string;
    maxOccupancy: number;
    currentOccupancy: number;
    isLocked?: boolean;
  }>>([]);
  const [roomsLastFetched, setRoomsLastFetched] = useState<Date | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [allRooms, setAllRooms] = useState<Array<{
    roomId: string;
    buildingName: string;
    roomNumber: string;
    roomTypeCategory?: string;
    maxOccupancy: number;
    isLocked?: boolean;
  }>>([]);

  // Payment confirmation state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState<{
    registrationId: string;
    paymentType: 'deposit' | 'remaining' | 'full' | 'refund' | 'additional';
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

  // Post-upload approval confirmation modal state
  const [approvalConfirmModalOpen, setApprovalConfirmModalOpen] = useState(false);
  const [uploadedSlipData, setUploadedSlipData] = useState<{
    slipId: string;
    slipUrl: string;
    registrationId: string;
    eventId: string;
    amount: number;
    paymentType: string;
  } | null>(null);
  const [processingApprovalChoice, setProcessingApprovalChoice] = useState(false);

  // Payment slips validation state (for Admin modal)
  const [adminPaymentSlips, setAdminPaymentSlips] = useState<any[]>([]);
  const [loadingAdminSlips, setLoadingAdminSlips] = useState(false);

  // ✅ CRITICAL FIX: Auto-select correct payment type based on available options (Admin modal)
  useEffect(() => {
    if (adminPaymentSlips.length > 0 && paymentModalOpen) {
      const available = getAdminAvailablePaymentTypes();
      const currentType = paymentFormData.paymentType;

      // Check if current payment type is still available
      let isCurrentTypeAvailable = false;
      switch (currentType) {
        case 'deposit':
          isCurrentTypeAvailable = available.canUploadDeposit;
          break;
        case 'remaining':
          isCurrentTypeAvailable = available.canUploadRemaining;
          break;
        case 'full':
          isCurrentTypeAvailable = available.canUploadFull;
          break;
        case 'additional':
          isCurrentTypeAvailable = available.canUploadAdditional;
          break;
        case 'refund':
          isCurrentTypeAvailable = available.canUploadRefund || false;
          break;
      }

      // If current type is not available, auto-select the first available option
      if (!isCurrentTypeAvailable) {
        let newType: 'deposit' | 'remaining' | 'full' | 'additional' | 'refund' | null = null;

        // Priority: additional > full > remaining > deposit > refund
        if (available.canUploadAdditional) {
          newType = 'additional';
        } else if (available.canUploadFull) {
          newType = 'full';
        } else if (available.canUploadRemaining) {
          newType = 'remaining';
        } else if (available.canUploadDeposit) {
          newType = 'deposit';
        } else if (available.canUploadRefund) {
          newType = 'refund';
        }

        if (newType) {
          console.log('[Admin Modal] Auto-selecting payment type:', newType, 'from', currentType);
          setPaymentFormData(prev => ({
            ...prev,
            paymentType: newType!,
            amount: getAdminSuggestedAmount(newType!)
          }));
        }
      }
    }
  }, [adminPaymentSlips, paymentModalOpen, paymentFormData.paymentType]);

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

  // Discounts state
  const [discountsModalOpen, setDiscountsModalOpen] = useState(false);
  const [discountFormData, setDiscountFormData] = useState<{
    registrationId: string;
    description: string;
    discountType: 'fixed' | 'percentage' | 'free';
    value: number;
  }>({
    registrationId: '',
    description: '',
    discountType: 'fixed',
    value: 0,
  });
  const [addingDiscount, setAddingDiscount] = useState(false);

  // Admin Cancellation modal state (NEW - using new cancellation system)
  const [showAdminCancellationModal, setShowAdminCancellationModal] = useState(false);
  const [selectedRegistrationForCancellation, setSelectedRegistrationForCancellation] = useState<(EventRegistration & { companyName?: string; contactName?: string }) | null>(null);
  const [selectedEventForCancellation, setSelectedEventForCancellation] = useState<EventType | null>(null);

  // Old cancellation modal state (DEPRECATED - keeping for backward compatibility)
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
  const [paymentDetailsRefreshKey, setPaymentDetailsRefreshKey] = useState(0);

  // Edit deadline modal state
  const [editDeadlineModalOpen, setEditDeadlineModalOpen] = useState(false);
  const [editDeadlineFormData, setEditDeadlineFormData] = useState<{
    registrationId: string;
    deadlineType: 'full' | 'deposit' | 'remaining';
    currentDeadline: string;
    updateMethod: 'hours' | 'fixed';
    hoursToAdd: number;
    fixedDate: string;
  }>({
    registrationId: '',
    deadlineType: 'full',
    currentDeadline: '',
    updateMethod: 'hours',
    hoursToAdd: 24,
    fixedDate: new Date().toISOString().split('T')[0],
  });
  const [updatingDeadline, setUpdatingDeadline] = useState(false);

  // Message template modal state
  const [messageTemplateModalOpen, setMessageTemplateModalOpen] = useState(false);
  const [selectedRegistrationsForMessage, setSelectedRegistrationsForMessage] = useState<Set<string>>(new Set());
  const [carpoolsDataForMessages, setCarpoolsDataForMessages] = useState<Record<string, any>>({});
  const [partyTablesDataForMessages, setPartyTablesDataForMessages] = useState<Record<string, any>>({});
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

  // Toggle registration selection for message sending
  const toggleRegistrationSelection = (registrationId: string) => {
    setSelectedRegistrationsForMessage(prev => {
      const newSet = new Set(prev);
      if (newSet.has(registrationId)) {
        newSet.delete(registrationId);
      } else {
        newSet.add(registrationId);
      }
      return newSet;
    });
  };

  // Select/deselect all registrations with LINE profiles
  const toggleSelectAll = () => {
    if (!eventData) return;

    const registrationsWithLine = filteredAttendees
      .filter(a => a.registration.lineUserId && a.registration.lineUserId.trim() !== '')
      .map(a => a.registration.registrationId);

    if (selectedRegistrationsForMessage.size === registrationsWithLine.length) {
      // Deselect all
      setSelectedRegistrationsForMessage(new Set());
    } else {
      // Select all
      setSelectedRegistrationsForMessage(new Set(registrationsWithLine));
    }
  };

  // Open message template modal with selected registrations
  const handleOpenMessageModal = async () => {
    if (selectedRegistrationsForMessage.size === 0) {
      setActionMessage({ type: 'error', text: 'กรุณาเลือกผู้รับอย่างน้อย 1 คน' });
      return;
    }

    // Fetch carpools data for selected registrations
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/carpools`);
      if (response.ok) {
        const data = await response.json();
        const carpools = data.carpools || [];

        // Build a map of registrationId to array of carpool data (support multiple cars per registration)
        const carpoolsMap: Record<string, any[]> = {};
        const skippedRegistrations: string[] = []; // Track registrations with unassigned cars

        carpools.forEach((carpool: any) => {
          // Skip deleted/cancelled carpools
          if (carpool.status === 'deleted' || carpool.status === 'cancelled') {
            return;
          }

          if (carpool.assignedCarNumber) {
            // Car has assigned number - include in carpoolsMap
            const memberNames: Array<{name: string; registrationId: string; companyName?: string}> = [];

            // Add all members from the carpool
            if (carpool.members && Array.isArray(carpool.members)) {
              carpool.members.forEach((member: any) => {
                memberNames.push({
                  name: member.name || 'ไม่ระบุชื่อ',
                  registrationId: member.registrationId,
                  companyName: member.companyName || '',
                });
              });
            }

            const carpoolData = {
              licensePlate: carpool.licensePlate,
              assignedCarNumber: carpool.assignedCarNumber,
              members: memberNames,
              ownerRegistrationId: carpool.ownerRegistrationId, // Include owner info
            };

            // Add carpool data to OWNER's registration
            if (!carpoolsMap[carpool.ownerRegistrationId]) {
              carpoolsMap[carpool.ownerRegistrationId] = [];
            }
            carpoolsMap[carpool.ownerRegistrationId].push(carpoolData);

            // ALSO add carpool data to ALL MEMBERS who joined this car
            // This ensures that people who joined carpools can also receive car assignment messages
            if (carpool.members && Array.isArray(carpool.members)) {
              carpool.members.forEach((member: any) => {
                // Skip if this member is the owner (already added above)
                if (member.registrationId === carpool.ownerRegistrationId) {
                  return;
                }

                // Add this carpool to the member's registration
                if (!carpoolsMap[member.registrationId]) {
                  carpoolsMap[member.registrationId] = [];
                }

                // Check if this carpool is already in the member's list (avoid duplicates)
                const alreadyAdded = carpoolsMap[member.registrationId].some(
                  (cp: any) => cp.assignedCarNumber === carpool.assignedCarNumber &&
                               cp.licensePlate === carpool.licensePlate
                );

                if (!alreadyAdded) {
                  carpoolsMap[member.registrationId].push(carpoolData);
                }
              });
            }
          } else {
            // Car doesn't have assigned number - track for warning
            // Track both owner and members
            if (!skippedRegistrations.includes(carpool.ownerRegistrationId)) {
              skippedRegistrations.push(carpool.ownerRegistrationId);
            }

            // Also track members who joined this unassigned car
            if (carpool.members && Array.isArray(carpool.members)) {
              carpool.members.forEach((member: any) => {
                if (member.registrationId !== carpool.ownerRegistrationId &&
                    !skippedRegistrations.includes(member.registrationId)) {
                  skippedRegistrations.push(member.registrationId);
                }
              });
            }
          }
        });

        setCarpoolsDataForMessages(carpoolsMap);

        // Show warning if some registrations have unassigned cars
        if (skippedRegistrations.length > 0) {
          const skippedNames = skippedRegistrations
            .map(regId => {
              const attendee = filteredAttendees.find(a => a.registration.registrationId === regId);
              return attendee?.registration.contactName || regId;
            })
            .join(', ');

          setActionMessage({
            type: 'warning',
            text: `⚠️ มีรถที่ยังไม่ได้จัดเลขรถ (${skippedRegistrations.length} คน): ${skippedNames}\n\nระบบจะข้ามและส่งเฉพาะรถที่มีเลขรถแล้วเท่านั้น`
          });

          // Auto-clear warning after 8 seconds
          setTimeout(() => setActionMessage(null), 8000);
        }
      }
    } catch (error) {
      console.error('Error fetching carpools:', error);
      // Continue opening modal even if carpool fetch fails
    }

    // Fetch party tables data for selected registrations
    try {
      const partyTablesMap: Record<string, any[]> = {};

      // Fetch party tables for each selected registration
      for (const regId of Array.from(selectedRegistrationsForMessage)) {
        try {
          const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/my-party-tables?registrationId=${regId}`);
          if (response.ok) {
            const data = await response.json();
            const tables = data.tables || [];

            // Only add if there are tables with assigned numbers
            const tablesWithNumbers = tables.filter((table: any) => table.assignedTableNumber);

            if (tablesWithNumbers.length > 0) {
              partyTablesMap[regId] = tablesWithNumbers.map((table: any) => ({
                tableNumber: table.assignedTableNumber,
                members: table.members || []
              }));
            }
          }
        } catch (err) {
          console.error(`Error fetching party tables for ${regId}:`, err);
          // Continue with other registrations even if one fails
        }
      }

      setPartyTablesDataForMessages(partyTablesMap);
    } catch (error) {
      console.error('Error fetching party tables:', error);
      // Continue opening modal even if party table fetch fails
    }

    setMessageTemplateModalOpen(true);
  };

  useEffect(() => {
    if (status === 'unauthenticated' || effectiveStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [status, effectiveStatus, router]);

  useEffect(() => {
    if (eventId) {
      fetchEventData();
      fetchAllRooms(); // Load rooms once on mount
    }
  }, [eventId]);

  // Fetch carpools and party tables on mount if features are enabled
  useEffect(() => {
    if (eventId && eventData) {
      if (eventData.event?.hasCarpoolFeature) {
        fetchCarpools();
      }
      if (eventData.event?.hasPartyTableFeature) {
        fetchPartyTables();
      }
    }
  }, [eventId, eventData?.event?.hasCarpoolFeature, eventData?.event?.hasPartyTableFeature]);

  const fetchCarpools = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/carpools`);
      if (response.ok) {
        const data = await response.json();
        setAllCarpools(data.carpools || []);
      }
    } catch (err) {
      console.error('Error fetching carpools:', err);
    }
  };

  const fetchPartyTables = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/party-tables`);
      if (response.ok) {
        const data = await response.json();
        setAllPartyTables(data.tables || []);
      }
    } catch (err) {
      console.error('Error fetching party tables:', err);
    }
  };

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

      // Debug: Check if roomAssignments are being fetched
      console.log('[Fetch Event Data] Sample attendee:', data.attendees?.[0]?.registration);
      console.log('[Fetch Event Data] Has roomAssignments?:', !!data.attendees?.[0]?.registration?.roomAssignments);
      // Debug: Check if hasCarpoolFeature is being fetched
      console.log('[Fetch Event Data] hasCarpoolFeature:', data.event?.hasCarpoolFeature);
      console.log('[Fetch Event Data] carpoolSettings:', data.event?.carpoolSettings);
      // Debug: Check if hasPartyTableFeature is being fetched
      console.log('[Fetch Event Data] hasPartyTableFeature:', data.event?.hasPartyTableFeature);
      console.log('[Fetch Event Data] partyTableSettings:', data.event?.partyTableSettings);
      console.log('[Fetch Event Data] Full event object:', data.event);

      setEventData(data);
    } catch (err) {
      console.error('Error fetching event:', err);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // ✅ NEW: Fetch all rooms once and store in parent state (prevents N+1 queries)
  const fetchAllRooms = async () => {
    if (!eventId) return;

    try {
      setRoomsLoading(true);
      console.log('[Rooms] Fetching rooms and event data...');

      // Fetch both rooms and event data to get updated room assignments
      await Promise.all([
        (async () => {
          const roomsResponse = await fetch(`/api/events/${eventId}/rooms`);
          if (!roomsResponse.ok) throw new Error('Failed to fetch rooms');
          const roomsData = await roomsResponse.json();
          const rooms = roomsData.rooms || [];
          setAllRooms(rooms);
          console.log(`[Rooms] Loaded ${rooms.length} rooms`);
        })(),
        fetchEventData() // Also refresh attendee data with updated room assignments
      ]);

      setRoomsLastFetched(new Date());
      console.log(`[Rooms] Loaded rooms and event data at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error('[Rooms] Error fetching data:', error);
    } finally {
      setRoomsLoading(false);
    }
  };

  // ✅ OPTIMIZED: Use allRooms state instead of fetching again
  const fetchAvailableRooms = async () => {
    if (!eventId || !eventData) return;

    try {
      // Use cached rooms data if available
      const rooms = allRooms.length > 0 ? allRooms : await (async () => {
        const roomsResponse = await fetch(`/api/events/${eventId}/rooms`);
        if (!roomsResponse.ok) throw new Error('Failed to fetch rooms');
        const roomsData = await roomsResponse.json();
        return roomsData.rooms || [];
      })();

      // Calculate current occupancy for each room using existing eventData
      const occupancyMap: Record<string, number> = {};
      const registrations = eventData.attendees || [];

      registrations.forEach((attendee: any) => {
        try {
          if (attendee.registration.roomAssignments) {
            const assignments = JSON.parse(attendee.registration.roomAssignments);
            if (Array.isArray(assignments)) {
              assignments.forEach((assignment: any) => {
                if (assignment.roomId) {
                  occupancyMap[assignment.roomId] = (occupancyMap[assignment.roomId] || 0) + 1;
                }
              });
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      });

      // Build available rooms list with current occupancy
      const roomsWithOccupancy = rooms.map((room: any) => ({
        roomId: room.roomId,
        buildingName: room.buildingName,
        roomNumber: room.roomNumber,
        roomTypeCategory: room.roomTypeCategory,
        maxOccupancy: room.maxOccupancy,
        currentOccupancy: occupancyMap[room.roomId] || 0,
        isLocked: room.isLocked || false,
      }));

      setAvailableRooms(roomsWithOccupancy);
    } catch (error) {
      console.error('Error fetching available rooms:', error);
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
        let attendeeNamesList = parseAttendeeNames(attendee.registration.attendeeNames);

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

      // Apply merges for repeated data and styling
      const merges: XLSX.Range[] = [];
      let currentRow = 1; // Start after header
      let registrationIndex = 0;

      // Calculate total columns
      const baseColumns = 6; // รหัส, บริษัท, ผู้ติดต่อ, เบอร์, ไลน์, จำนวน
      const roomColumns = sortedRoomTypes.length;
      const otherColumns = 7; // ค่าห้อง, สถานะ, สถานะชำระ, ยอดรวม, อนุมัติ, ความต้องการ, ค่าเสริม
      const totalMergeColumns = baseColumns + roomColumns + otherColumns;
      const totalColumns = totalMergeColumns + 2; // +2 for ลำดับ and ชื่อ

      filteredAttendees.forEach((attendee) => {
        let attendeeNamesList = parseAttendeeNames(attendee.registration.attendeeNames);

        const attendeeCount = attendee.registration.attendeeCount || 1;
        const rowCount = attendeeNamesList.length || attendeeCount;

        // Apply merges for multi-row registrations
        if (rowCount > 1) {
          // Merge all columns except last 2 (attendee order and name)
          for (let col = 0; col < totalMergeColumns; col++) {
            merges.push({
              s: { r: currentRow, c: col },
              e: { r: currentRow + rowCount - 1, c: col },
            });
          }
        }

        // Apply styling for each row in this registration
        const isEvenRegistration = registrationIndex % 2 === 0;
        const bgColor = isEvenRegistration ? 'F8F9FA' : 'FFFFFF'; // Light gray for even, white for odd

        for (let i = 0; i < rowCount; i++) {
          const row = currentRow + i;

          // Apply background color and borders to all cells in this row
          for (let col = 0; col < totalColumns; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

            ws[cellAddress].s = {
              fill: { fgColor: { rgb: bgColor } },
              border: {
                top: { style: 'thin', color: { rgb: 'D1D5DB' } },
                bottom: i === rowCount - 1 ? { style: 'medium', color: { rgb: '9CA3AF' } } : { style: 'thin', color: { rgb: 'E5E7EB' } },
                left: { style: 'thin', color: { rgb: 'D1D5DB' } },
                right: { style: 'thin', color: { rgb: 'D1D5DB' } },
              },
              alignment: {
                vertical: 'center',
                horizontal: col >= baseColumns && col < totalMergeColumns ? 'right' : 'left', // Align numbers to right
                wrapText: true,
              },
            };
          }
        }

        currentRow += rowCount;
        registrationIndex++;
      });

      ws['!merges'] = merges;

      // Style header row
      const headerRow = 0;
      for (let col = 0; col < totalColumns; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
        if (!ws[cellAddress]) continue;

        ws[cellAddress].s = {
          fill: { fgColor: { rgb: '3B82F6' } }, // Blue background
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          border: {
            top: { style: 'medium', color: { rgb: '1E40AF' } },
            bottom: { style: 'medium', color: { rgb: '1E40AF' } },
            left: { style: 'thin', color: { rgb: '2563EB' } },
            right: { style: 'thin', color: { rgb: '2563EB' } },
          },
          alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
        };
      }

      // Style summary row (last row)
      const summaryRow = currentRow;
      for (let col = 0; col < totalColumns; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: summaryRow, c: col });
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: '' };

        ws[cellAddress].s = {
          fill: { fgColor: { rgb: 'FEF3C7' } }, // Yellow background
          font: { bold: true, sz: 11 },
          border: {
            top: { style: 'medium', color: { rgb: 'D97706' } },
            bottom: { style: 'medium', color: { rgb: 'D97706' } },
            left: { style: 'thin', color: { rgb: 'F59E0B' } },
            right: { style: 'thin', color: { rgb: 'F59E0B' } },
          },
          alignment: {
            vertical: 'center',
            horizontal: col >= baseColumns && col < totalMergeColumns ? 'right' : 'left',
            wrapText: true,
          },
        };
      }

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

      // === Carpool Worksheet ===
      try {
        const carpoolResponse = await fetch(`/api/events/${encodeURIComponent(eventId)}/carpools`);
        if (carpoolResponse.ok) {
          const carpoolData = await carpoolResponse.json();
          const allCarpools = carpoolData.carpools || [];

          // Filter out deleted/cancelled carpools
          const activeCarpools = allCarpools.filter((cp: any) =>
            cp.status !== 'deleted' && cp.status !== 'cancelled'
          );

          // Separate assigned and unassigned carpools
          const assignedCarpools = activeCarpools
            .filter((cp: any) => cp.assignedCarNumber)
            .sort((a: any, b: any) => (a.assignedCarNumber || 0) - (b.assignedCarNumber || 0));

          const unassignedCarpools = activeCarpools.filter((cp: any) => !cp.assignedCarNumber);

          // Combine: assigned first, then unassigned
          const sortedCarpools = [...assignedCarpools, ...unassignedCarpools];

          // Prepare carpool export data
          const carpoolExportData: Record<string, any>[] = [];

          sortedCarpools.forEach((carpool: any) => {
            // Get member names
            const memberNames = carpool.members && Array.isArray(carpool.members)
              ? carpool.members.map((m: any) => m.name || 'ไม่ระบุชื่อ').join(', ')
              : '';

            const memberCount = carpool.members ? carpool.members.length : 0;

            carpoolExportData.push({
              'เลขรถ': carpool.assignedCarNumber || '', // Empty for unassigned
              'ทะเบียนรถ': carpool.licensePlate || '',
              'จำนวนสมาชิก': memberCount,
              'รายชื่อสมาชิก': memberNames,
              'รหัสเจ้าของรถ': carpool.ownerRegistrationId || '',
              'สถานะ': carpool.assignedCarNumber ? 'จัดเลขแล้ว' : 'ยังไม่จัดเลข',
            });
          });

          // Create carpool worksheet
          if (carpoolExportData.length > 0) {
            const carpoolWs = XLSX.utils.json_to_sheet(carpoolExportData);

            // Set column widths for carpool worksheet
            carpoolWs['!cols'] = [
              { wch: 10 }, // เลขรถ
              { wch: 15 }, // ทะเบียนรถ
              { wch: 15 }, // จำนวนสมาชิก
              { wch: 60 }, // รายชื่อสมาชิก
              { wch: 20 }, // รหัสเจ้าของรถ
              { wch: 15 }, // สถานะ
            ];

            // Style header row for carpool worksheet
            const carpoolHeaderRow = 0;
            const carpoolColumns = 6; // Number of columns
            for (let col = 0; col < carpoolColumns; col++) {
              const cellAddress = XLSX.utils.encode_cell({ r: carpoolHeaderRow, c: col });
              if (!carpoolWs[cellAddress]) continue;

              carpoolWs[cellAddress].s = {
                fill: { fgColor: { rgb: '10B981' } }, // Green background
                font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
                border: {
                  top: { style: 'medium', color: { rgb: '059669' } },
                  bottom: { style: 'medium', color: { rgb: '059669' } },
                  left: { style: 'thin', color: { rgb: '10B981' } },
                  right: { style: 'thin', color: { rgb: '10B981' } },
                },
                alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
              };
            }

            // Style data rows
            carpoolExportData.forEach((_, rowIdx) => {
              const dataRow = rowIdx + 1; // +1 because row 0 is header
              const carpool = sortedCarpools[rowIdx];

              // Different background for assigned vs unassigned
              const bgColor = carpool.assignedCarNumber ? 'E8F5E9' : 'FFF9C4'; // Light green for assigned, light yellow for unassigned

              for (let col = 0; col < carpoolColumns; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: dataRow, c: col });
                if (!carpoolWs[cellAddress]) carpoolWs[cellAddress] = { t: 's', v: '' };

                carpoolWs[cellAddress].s = {
                  fill: { fgColor: { rgb: bgColor } },
                  border: {
                    top: { style: 'thin', color: { rgb: 'D1D5DB' } },
                    bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
                    left: { style: 'thin', color: { rgb: 'D1D5DB' } },
                    right: { style: 'thin', color: { rgb: 'D1D5DB' } },
                  },
                  alignment: {
                    vertical: 'center',
                    horizontal: col === 2 ? 'center' : 'left', // Center align member count
                    wrapText: true,
                  },
                };
              }
            });

            XLSX.utils.book_append_sheet(wb, carpoolWs, 'Carpools');
          }
        }
      } catch (err) {
        console.error('Error adding carpool worksheet:', err);
        // Continue with export even if carpool worksheet fails
      }

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

  const handleRecalculateDeadlines = async () => {
    if (!eventData) return;

    const confirmed = confirm(
      'คุณต้องการคำนวณ deadline ใหม่สำหรับการลงทะเบียนทั้งหมดในอีเวนต์นี้?\n\n' +
      'การดำเนินการนี้จะอัพเดท deadline ให้กับทุกรายการตามการตั้งค่าปัจจุบันของอีเวนต์'
    );

    if (!confirmed) return;

    setRecalculateLoading(true);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventId}/recalculate-deadlines`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถคำนวณ deadline ได้');
      }

      setActionMessage({
        type: 'success',
        text: `คำนวณ deadline เรียบร้อย (อัพเดท ${data.updatedCount} รายการ)`
      });
      setTimeout(() => setActionMessage(null), 5000);

      // Refresh data to show updated deadlines
      fetchEventData();
    } catch (err) {
      console.error('Error recalculating deadlines:', err);
      setActionMessage({ type: 'error', text: 'ไม่สามารถคำนวณ deadline ได้' });
    } finally {
      setRecalculateLoading(false);
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
    const names = parseAttendeeNames(attendee.registration.attendeeNames);
    if (names.length === 0) {
      names.push(''); // Ensure at least one empty string for the form
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

    // Parse room assignments
    let roomAssignments: Array<{ roomId: string; attendeeIndex: number }> = [];
    try {
      console.log('[Edit Registration] Raw roomAssignments data:', (attendee.registration as any).roomAssignments);
      if ((attendee.registration as any).roomAssignments) {
        roomAssignments = JSON.parse((attendee.registration as any).roomAssignments);
        console.log('[Edit Registration] Parsed roomAssignments:', roomAssignments);
      }
    } catch (e) {
      console.error('Error parsing roomAssignments:', e);
    }

    const originalCount = attendee.registration.attendeeCount || 1;
    setOriginalAttendeeCount(originalCount); // Store original count for validation

    setEditFormData({
      attendeeCount: originalCount,
      attendeeNames: names,
      status: attendee.registration.status || 'รอดำเนินการ',
      contactPhone: attendee.registration.contactPhone || '',
      contactEmail: attendee.registration.contactEmail || '',
      specialRequests: attendee.registration.specialRequests || '',
      attendeeTypeSelections,
      roomAllocations,
      roomAssignments,
    });

    // Fetch available rooms
    fetchAvailableRooms();
  };

  const handleCancelEdit = () => {
    // Exit edit mode but keep dropdown expanded
    setEditingRegistration(null);
    setEditFormData({ attendeeCount: 1, attendeeNames: [''], status: 'รอดำเนินการ' });
  };

  const handleSaveEdit = async () => {
    if (!editingRegistration || !eventData) return;

    // ✅ CRITICAL VALIDATION: Check for pending payment slips ONLY when attendeeCount changed
    // Allow editing special requests and room assignments even with pending payment slips
    // But prevent changing attendee count when there are pending slips (affects total amount)
    const attendeeCountChanged = editFormData.attendeeCount !== originalAttendeeCount;

    if (attendeeCountChanged) {
      try {
        const checkResponse = await fetch(`/api/payments/check-pending?registrationId=${editingRegistration}`);
        const checkData = await checkResponse.json();

        if (checkResponse.ok && checkData.hasPending) {
          setActionMessage({
            type: 'error',
            text: 'ไม่สามารถเปลี่ยนจำนวนผู้เข้าร่วมได้ เนื่องจากมีสลิปการชำระเงินที่รอตรวจสอบ กรุณาอนุมัติหรือปฏิเสธสลิปก่อน'
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
        attendee_names: editFormData.attendeeNames, // Send as array, not JSON string
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

      // Include room assignments - always send even if empty array to clear assignments
      if (editFormData.roomAssignments !== undefined) {
        updateData.room_assignments = JSON.stringify(editFormData.roomAssignments || []);
        console.log('[Admin Update] Room Assignments:', editFormData.roomAssignments);
      }

      console.log('[Admin Update] Sending update data:', updateData);

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

  const handleRoomAssignmentChange = (attendeeIndex: number, roomId: string) => {
    const currentAssignments = [...(editFormData.roomAssignments || [])];

    // Remove any existing assignment for this attendee
    const filteredAssignments = currentAssignments.filter(a => a.attendeeIndex !== attendeeIndex);

    // Add new assignment if a room was selected (not empty)
    if (roomId) {
      filteredAssignments.push({ roomId, attendeeIndex });
    }

    setEditFormData({ ...editFormData, roomAssignments: filteredAssignments });
  };

  // Copy registration ID to clipboard
  const handleCopyRegistrationId = (registrationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(registrationId);
    setCopiedRegistrationId(registrationId);
    setShowCopyToast(true);
    // Auto hide toast after 3 seconds
    setTimeout(() => {
      setShowCopyToast(false);
    }, 3000);
  };

  // Check if registration has approved payments
  const hasApprovedPayments = (registration: any): { hasPayment: boolean; totalPaid: number } => {
    // ✅ FIX: paidAmount might not exist in API response, calculate from actual payment fields
    const fullPaymentAmountPaid = registration.fullPaymentAmountPaid || 0;
    const depositAmountPaid = registration.depositAmountPaid || 0;
    const remainingAmountPaid = registration.remainingAmountPaid || 0;
    const additionalPaymentAmountPaid = registration.additionalPaymentAmountPaid || 0;

    // Calculate total paid from actual payment fields only (don't use paidAmount as it's not reliable)
    // ✅ CRITICAL FIX: Include additionalPaymentAmountPaid
    const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;
    const hasPayment = paidAmount > 0;

    return { hasPayment, totalPaid: paidAmount };
  };

  const handleOpenCancellationModal = (registrationId: string) => {
    // Find registration
    const attendee = eventData?.attendees.find(a => a.registration.registrationId === registrationId);
    if (!attendee || !eventData) return;

    // Prepare event data for cancellation modal
    const event: EventType = {
      eventId: eventData.event.eventId,
      eventName: eventData.event.eventName,
      eventNameEN: eventData.event.eventNameEN || '',
      eventDate: eventData.event.eventDate,
      eventEndDate: eventData.event.eventEndDate,
      location: eventData.event.location,
      description: eventData.event.description || '',
      year: eventData.event.year,
      isActive: eventData.event.isActive,
      isPublished: eventData.event.isPublished,
      countsAttendance: true,
      maxCapacity: eventData.event.maxCapacity,
      maxPerCompany: eventData.event.maxPerCompany || 0,
      registrationFee: 0,
      registrationOpen: eventData.event.registrationOpen,
      cancellationPolicy: (eventData.event as any).cancellationPolicy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Prepare registration data
    const registration = {
      ...attendee.registration,
      companyName: attendee.registration.companyName,
      contactName: attendee.registration.contactName,
    } as EventRegistration & { companyName?: string; contactName?: string };

    setSelectedEventForCancellation(event);
    setSelectedRegistrationForCancellation(registration);
    setShowAdminCancellationModal(true);
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

  const handleOpenPaymentModal = async (attendee: Attendee, paymentType?: 'deposit' | 'remaining' | 'full' | 'refund') => {
    // ✅ FIX: Auto-detect paymentType from event configuration if not specified
    let finalPaymentType: 'deposit' | 'remaining' | 'full' | 'refund' = paymentType || 'deposit';

    // If event is in Full Payment Mode, default to 'full' instead of 'deposit'
    if (!paymentType && eventData?.event?.paymentMode === 'full') {
      finalPaymentType = 'full';
    }

    // Set initial form data (amount will be updated after fetching slips)
    setPaymentFormData({
      registrationId: attendee.registration.registrationId,
      paymentType: finalPaymentType,
      amount: 0, // Will be calculated after fetching slips
      slipUrl: finalPaymentType === 'deposit' ? attendee.registration.depositSlipUrl : attendee.registration.remainingSlipUrl,
      paidDate: new Date().toISOString().split('T')[0],
    });
    setPaymentModalOpen(true);

    // Fetch existing payment slips for validation
    setLoadingAdminSlips(true);
    try {
      const response = await fetch(`/api/payments/slips?registrationId=${attendee.registration.registrationId}`);
      if (response.ok) {
        const data = await response.json();
        const fetchedSlips = data.slips || [];
        setAdminPaymentSlips(fetchedSlips);

        // Calculate suggested amount based on fetched slips
        // We need to calculate it here because getAdminSuggestedAmount depends on adminPaymentSlips state
        const approvedSlips = fetchedSlips.filter((slip: any) => slip.status === 'approved');
        const totalPaid = approvedSlips.reduce((sum: number, slip: any) => {
          if (slip.paymentType === 'refund') {
            return sum - (slip.amount || 0);
          }
          return sum + (slip.amount || 0);
        }, 0);

        const totalAmount = attendee.registration.totalAmount || 0;
        const depositAmount = attendee.registration.depositAmount || 0;

        let suggestedAmount = 0;
        switch (finalPaymentType) {
          case 'deposit':
            suggestedAmount = Math.max(0, depositAmount - totalPaid);
            break;
          case 'remaining':
          case 'full':
            suggestedAmount = Math.max(0, totalAmount - totalPaid);
            break;
        }

        // Update form data with calculated amount
        setPaymentFormData(prev => ({
          ...prev,
          amount: suggestedAmount
        }));

        // ✅ CRITICAL FIX: Auto-select available payment type if current selection is invalid
        // This happens AFTER slips are fetched, so we can check availability accurately
        const activeSlips = fetchedSlips.filter((slip: any) =>
          (slip.status === 'approved' || slip.status === 'pending') &&
          slip.paymentType !== 'refund'
        );

        const hasActiveFull = activeSlips.some((s: any) => s.paymentType === 'full');
        const hasActiveDeposit = activeSlips.some((s: any) => s.paymentType === 'deposit');
        const hasActiveRemaining = activeSlips.some((s: any) => s.paymentType === 'remaining');

        let isCurrentTypeAvailable = false;
        switch (finalPaymentType) {
          case 'deposit':
            isCurrentTypeAvailable = !hasActiveFull && !hasActiveDeposit;
            break;
          case 'remaining':
            isCurrentTypeAvailable = !hasActiveFull && !hasActiveRemaining && hasActiveDeposit;
            break;
          case 'full':
            isCurrentTypeAvailable = !hasActiveFull;
            break;
          case 'refund':
            // Refund is always handled separately by getAdminAvailablePaymentTypes
            isCurrentTypeAvailable = true;
            break;
        }

        // If current type is NOT available, auto-select the first available option
        if (!isCurrentTypeAvailable) {
          let newType: 'deposit' | 'remaining' | 'full' | 'additional' | 'refund' | null = null;

          // Priority: additional > full > remaining > deposit
          if (!hasActiveFull) {
            newType = 'full';
          } else if (!hasActiveRemaining && hasActiveDeposit) {
            newType = 'remaining';
          } else if (!hasActiveDeposit && !hasActiveFull) {
            newType = 'deposit';
          } else {
            newType = 'additional'; // Fallback
          }

          if (newType) {
            console.log('[Admin Modal] Auto-selecting available payment type:', newType, '(was:', finalPaymentType, ')');

            // Calculate suggested amount for the new type
            let newSuggestedAmount = 0;
            switch (newType) {
              case 'deposit':
                newSuggestedAmount = Math.max(0, depositAmount - totalPaid);
                break;
              case 'remaining':
              case 'full':
                newSuggestedAmount = Math.max(0, totalAmount - totalPaid);
                break;
              case 'additional':
                newSuggestedAmount = 0;
                break;
            }

            setPaymentFormData(prev => ({
              ...prev,
              paymentType: newType!,
              amount: newSuggestedAmount
            }));
          }
        }
      }
    } catch (error) {
      console.error('[Admin Modal] Failed to fetch payment slips:', error);
      setAdminPaymentSlips([]);
    } finally {
      setLoadingAdminSlips(false);
    }
  };

  // Get available payment types based on existing slips (for Admin modal)
  const getAdminAvailablePaymentTypes = () => {
    // Filter active slips (approved + pending, excluding refund)
    const activeSlips = adminPaymentSlips.filter((slip: any) =>
      (slip.status === 'approved' || slip.status === 'pending') &&
      slip.paymentType !== 'refund'
    );

    const hasActiveFull = activeSlips.some((s: any) => s.paymentType === 'full');
    const hasActiveDeposit = activeSlips.some((s: any) => s.paymentType === 'deposit');
    const hasActiveRemaining = activeSlips.some((s: any) => s.paymentType === 'remaining');
    const hasPendingSlips = adminPaymentSlips.some((slip: any) => slip.status === 'pending');

    // Calculate if overpaid (for refund availability)
    const approvedSlips = adminPaymentSlips.filter((slip: any) => slip.status === 'approved');
    const totalPaid = approvedSlips.reduce((sum: number, slip: any) => {
      if (slip.paymentType === 'refund') {
        return sum - (slip.amount || 0);
      }
      return sum + (slip.amount || 0);
    }, 0);

    const attendee = eventData?.attendees?.find(
      a => a.registration.registrationId === paymentFormData.registrationId
    );
    const totalAmount = attendee?.registration.totalAmount || 0;
    const isOverpaid = totalPaid > totalAmount;

    // ✅ Check if registration is cancelled with refund amount
    const status = String(attendee?.registration.status || '').toLowerCase();
    const isCancelled = status === 'cancelled' || attendee?.registration.status?.includes('ยกเลิก');
    const refundAmount = (attendee?.registration as any)?.refundAmount || 0;
    const hasRefundDue = isCancelled && refundAmount > 0;

    return {
      canUploadDeposit: !hasActiveFull && !hasActiveDeposit,
      canUploadRemaining: !hasActiveFull && !hasActiveRemaining && hasActiveDeposit,
      canUploadFull: !hasActiveFull,
      canUploadAdditional: true, // Always allow additional payments
      canUploadRefund: !hasPendingSlips && (isOverpaid || hasRefundDue), // ✅ Allow refund if overpaid OR cancelled with refund due
      hasWarnings: {
        deposit: hasActiveDeposit,
        remaining: hasActiveRemaining,
        full: hasActiveFull,
      },
      refundReason: (!isOverpaid && !hasRefundDue) ? 'ยังไม่มีการชำระเกินหรือยอดคืนเงิน' : ''
    };
  };

  // Calculate suggested amount based on payment type and existing slips
  const getAdminSuggestedAmount = (paymentType: 'deposit' | 'remaining' | 'full' | 'refund' | 'additional') => {
    // Find the attendee from current modal
    const attendee = eventData?.attendees?.find(
      a => a.registration.registrationId === paymentFormData.registrationId
    );

    if (!attendee) return 0;

    // Calculate total approved payments
    const approvedSlips = adminPaymentSlips.filter((slip: any) => slip.status === 'approved');
    const totalPaid = approvedSlips.reduce((sum: number, slip: any) => {
      // Don't count refunds as payments
      if (slip.paymentType === 'refund') {
        return sum - (slip.amount || 0); // Subtract refund amount
      }
      return sum + (slip.amount || 0);
    }, 0);

    const totalAmount = attendee.registration.totalAmount || 0;
    const depositAmount = attendee.registration.depositAmount || 0;
    const remainingAmount = attendee.registration.remainingAmount || 0;

    switch (paymentType) {
      case 'deposit':
        // Suggest deposit amount minus what's already paid
        return Math.max(0, depositAmount - totalPaid);

      case 'remaining':
        // Suggest remaining amount (should be paid after deposit)
        return Math.max(0, totalAmount - totalPaid);

      case 'full':
        // Suggest total amount minus what's already paid
        return Math.max(0, totalAmount - totalPaid);

      case 'refund':
        // ✅ For cancelled registrations, suggest the refundAmount field
        const status = String(attendee.registration.status || '').toLowerCase();
        const isCancelled = status === 'cancelled' || attendee.registration.status?.includes('ยกเลิก');
        const refundAmount = (attendee.registration as any)?.refundAmount || 0;

        if (isCancelled && refundAmount > 0) {
          // Already refunded slips
          const refundedSlips = adminPaymentSlips.filter((slip: any) =>
            slip.paymentType === 'refund' && slip.status === 'approved'
          );
          const alreadyRefunded = refundedSlips.reduce((sum: number, slip: any) => sum + (slip.amount || 0), 0);
          // Suggest remaining refund amount
          return Math.max(0, refundAmount - alreadyRefunded);
        }

        // Suggest overpaid amount (if any) for non-cancelled registrations
        const overpaid = totalPaid - totalAmount;
        return Math.max(0, overpaid);

      case 'additional':
        // Additional payments start at 0 (admin enters custom amount)
        return 0;

      default:
        return 0;
    }
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
    setAdminPaymentSlips([]); // Reset slips
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

    // ✅ CRITICAL FIX: Refund MUST have slip attached
    if (paymentFormData.paymentType === 'refund' && !paymentFormData.slipFile && !paymentFormData.slipUrl) {
      setActionMessage({ type: 'error', text: 'กรุณาแนบสลิปการโอนเงินคืนสำหรับ Refund' });
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

        // ✅ CHANGED: Upload with autoApprove=false first, then ask admin
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
            autoApprove: false, // ✅ Don't auto-approve yet
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

        console.log('[Client] Upload successful:', uploadData);

        // ✅ Show confirmation modal asking admin whether to approve immediately or keep as pending
        setUploadedSlipData({
          slipId: uploadData.slip.slipId,
          slipUrl: uploadData.slipUrl,
          registrationId: paymentFormData.registrationId,
          eventId: eventId,
          amount: paymentFormData.amount,
          paymentType: paymentFormData.paymentType,
        });
        setApprovalConfirmModalOpen(true);
        handleClosePaymentModal();
      } else {
        // No file to upload - this shouldn't happen for admin uploads
        throw new Error('กรุณาเลือกไฟล์สลิปที่จะอัพโหลด');
      }
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

  // Approval confirmation modal handlers
  const handleApproveImmediately = async () => {
    if (!uploadedSlipData) return;

    setProcessingApprovalChoice(true);
    setActionMessage(null);

    try {
      // Call approve API
      const response = await fetch(`/api/payments/${uploadedSlipData.slipId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminNotes: `อัพโหลดและอนุมัติโดย Admin (${uploadedSlipData.paymentType}: ${uploadedSlipData.amount.toLocaleString()} บาท)`,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to approve slip');
      }

      // ✅ FIX: Fetch updated data BEFORE closing modal for in-place UI update
      await fetchEventData();
      setPaymentDetailsRefreshKey(prev => prev + 1);

      // Now close modal and show success message
      setActionMessage({ type: 'success', text: 'อัพโหลดและอนุมัติสลิปเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      setApprovalConfirmModalOpen(false);
      setUploadedSlipData(null);
    } catch (error) {
      setActionMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการอนุมัติสลิป'
      });
    } finally {
      setProcessingApprovalChoice(false);
    }
  };

  const handleKeepPending = async () => {
    // ✅ FIX: Fetch updated data BEFORE closing modal for in-place UI update
    await fetchEventData();
    setPaymentDetailsRefreshKey(prev => prev + 1);

    // Now close modal and show success message
    setActionMessage({ type: 'success', text: 'อัพโหลดสลิปเรียบร้อยแล้ว รอการตรวจสอบ' });
    setTimeout(() => setActionMessage(null), 3000);
    setApprovalConfirmModalOpen(false);
    setUploadedSlipData(null);
  };

  const handleCancelUpload = async () => {
    if (!uploadedSlipData) return;

    setProcessingApprovalChoice(true);
    setActionMessage(null);

    try {
      // Call reject API to delete the slip
      const response = await fetch(`/api/payments/${uploadedSlipData.slipId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rejectionReason: 'ยกเลิกการอัพโหลดโดย Admin',
          adminNotes: 'Admin ยกเลิกการอัพโหลดสลิปนี้',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel upload');
      }

      // ✅ FIX: Fetch updated data BEFORE closing modal for in-place UI update
      await fetchEventData();
      setPaymentDetailsRefreshKey(prev => prev + 1);

      // Now close modal and show success message
      setActionMessage({ type: 'success', text: 'ยกเลิกการอัพโหลดสลิปแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      setApprovalConfirmModalOpen(false);
      setUploadedSlipData(null);
    } catch (error) {
      setActionMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการยกเลิก'
      });
    } finally {
      setProcessingApprovalChoice(false);
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
    // Force PaymentDetailsModal to refresh
    setPaymentDetailsRefreshKey(prev => prev + 1);
  };

  // Edit Deadline Modal handlers
  const handleOpenEditDeadlineModal = (attendee: Attendee) => {
    if (!eventData?.event) return;

    // ✅ Auto-analyze which deadline to edit based on payment mode and status
    let deadlineType: 'full' | 'deposit' | 'remaining' = 'full';
    let currentDeadline = '';

    if (eventData.event.paymentMode === 'deposit') {
      // Deposit mode: check if deposit is paid
      if (!attendee.registration.depositPaid && attendee.registration.depositDeadline) {
        deadlineType = 'deposit';
        currentDeadline = attendee.registration.depositDeadline;
      } else if (attendee.registration.depositPaid && attendee.registration.remainingDeadline) {
        deadlineType = 'remaining';
        currentDeadline = attendee.registration.remainingDeadline;
      }
    } else {
      // Full payment mode
      deadlineType = 'full';
      currentDeadline = attendee.registration.fullPaymentDeadline || '';
    }

    if (!currentDeadline) {
      setActionMessage({ type: 'error', text: 'ไม่พบกำหนดชำระเงินที่ต้องแก้ไข' });
      return;
    }

    setEditDeadlineFormData({
      registrationId: attendee.registration.registrationId,
      deadlineType,
      currentDeadline,
      updateMethod: 'hours',
      hoursToAdd: 24,
      fixedDate: new Date().toISOString().split('T')[0],
    });
    setEditDeadlineModalOpen(true);
  };

  const handleCloseEditDeadlineModal = () => {
    setEditDeadlineModalOpen(false);
    setEditDeadlineFormData({
      registrationId: '',
      deadlineType: 'full',
      currentDeadline: '',
      updateMethod: 'hours',
      hoursToAdd: 24,
      fixedDate: new Date().toISOString().split('T')[0],
    });
  };

  const handleSaveDeadline = async () => {
    if (!editDeadlineFormData.registrationId) return;

    setUpdatingDeadline(true);
    setActionMessage(null);

    try {
      let newDeadline: string;

      if (editDeadlineFormData.updateMethod === 'hours') {
        // Add hours to current time
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + editDeadlineFormData.hoursToAdd);
        newDeadline = deadline.toISOString();
      } else {
        // Set to end of selected date (23:59:59)
        const deadline = new Date(editDeadlineFormData.fixedDate);
        deadline.setHours(23, 59, 59, 999);
        newDeadline = deadline.toISOString();
      }

      // Prepare update data
      const updateData: Record<string, unknown> = {};
      if (editDeadlineFormData.deadlineType === 'full') {
        updateData.full_payment_deadline = newDeadline;
      } else if (editDeadlineFormData.deadlineType === 'deposit') {
        updateData.deposit_deadline = newDeadline;
      } else if (editDeadlineFormData.deadlineType === 'remaining') {
        updateData.remaining_deadline = newDeadline;
      }

      // Call API to update
      const response = await fetch(`/api/events/${eventId}/admin-update-registration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId: editDeadlineFormData.registrationId,
          updateData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'ไม่สามารถอัพเดทกำหนดชำระเงินได้');
      }

      setActionMessage({ type: 'success', text: 'อัพเดทกำหนดชำระเงินเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      handleCloseEditDeadlineModal();
      fetchEventData();
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setUpdatingDeadline(false);
    }
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

  const handleAddSpecialCharge = async (e?: React.MouseEvent | boolean, ignorePendingSlips = false) => {
    // Handle event parameter if it's an event (not a boolean)
    if (typeof e === 'boolean') {
      ignorePendingSlips = e;
    }

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
        body: JSON.stringify({ ...specialChargeFormData, ignorePendingSlips }),
      });

      const data = await response.json();

      if (!response.ok) {
        // If there are pending slips and user hasn't confirmed yet, show confirm dialog
        if (data.hasPendingSlips && !ignorePendingSlips) {
          const confirmMessage = `${data.error}\n\n${data.details}\n\nคุณต้องการดำเนินการต่อหรือไม่?`;
          if (confirm(confirmMessage)) {
            // Retry with ignorePendingSlips=true
            setAddingCharge(false);
            await handleAddSpecialCharge(true, true);
            return;
          } else {
            setAddingCharge(false);
            return;
          }
        }

        // Show other errors normally
        const errorMessage = data.details
          ? `${data.error}\n\n${data.details}`
          : data.error || 'ไม่สามารถเพิ่มค่าใช้จ่ายได้';
        throw new Error(errorMessage);
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

  const handleDeleteSpecialCharge = async (registrationId: string, chargeId: string, ignorePendingSlips = false) => {
    if (!ignorePendingSlips && !confirm('ยืนยันการลบค่าใช้จ่ายเสริมนี้?')) return;

    setActionMessage(null);

    try {
      const url = `/api/events/${eventId}/special-charges?registrationId=${registrationId}&chargeId=${chargeId}${ignorePendingSlips ? '&ignorePendingSlips=true' : ''}`;
      const response = await fetch(url, { method: 'DELETE' });

      const data = await response.json();

      if (!response.ok) {
        // If there are pending slips and user hasn't confirmed yet, show confirm dialog
        if (data.hasPendingSlips && !ignorePendingSlips) {
          const confirmMessage = `${data.error}\n\n${data.details}\n\nคุณต้องการดำเนินการลบต่อหรือไม่?`;
          if (confirm(confirmMessage)) {
            // Retry with ignorePendingSlips=true
            await handleDeleteSpecialCharge(registrationId, chargeId, true);
            return;
          } else {
            return;
          }
        }

        // Show other errors normally
        const errorMessage = data.details
          ? `${data.error}\n\n${data.details}`
          : data.error || 'ไม่สามารถลบค่าใช้จ่ายได้';
        throw new Error(errorMessage);
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

  // Discount handlers
  const handleOpenDiscountModal = (attendee: Attendee) => {
    setDiscountFormData({
      registrationId: attendee.registration.registrationId,
      description: '',
      discountType: 'fixed',
      value: 0,
    });
    setDiscountsModalOpen(true);
  };

  const handleCloseDiscountModal = () => {
    setDiscountsModalOpen(false);
    setDiscountFormData({
      registrationId: '',
      description: '',
      discountType: 'fixed',
      value: 0,
    });
  };

  const handleAddDiscount = async (e?: React.FormEvent, ignorePendingSlips = false) => {
    if (e) e.preventDefault();

    setAddingDiscount(true);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/discounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...discountFormData, ignorePendingSlips }),
      });

      const data = await response.json();

      if (!response.ok) {
        // If there are pending slips and user hasn't confirmed yet, show confirm dialog
        if (data.hasPendingSlips && !ignorePendingSlips) {
          const confirmMessage = `${data.error}\n\n${data.details}\n\nคุณต้องการดำเนินการต่อหรือไม่?`;
          if (confirm(confirmMessage)) {
            // Retry with ignorePendingSlips=true
            setAddingDiscount(false);
            await handleAddDiscount(undefined, true);
            return;
          } else {
            setAddingDiscount(false);
            return;
          }
        }

        // Show other errors normally
        const errorMessage = data.details
          ? `${data.error}\n\n${data.details}`
          : data.error || 'ไม่สามารถเพิ่มส่วนลดได้';
        throw new Error(errorMessage);
      }

      setActionMessage({ type: 'success', text: data.message || 'เพิ่มส่วนลดเรียบร้อยแล้ว' });
      setTimeout(() => setActionMessage(null), 3000);
      handleCloseDiscountModal();
      fetchEventData(); // Refresh data
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด',
      });
    } finally {
      setAddingDiscount(false);
    }
  };

  const handleDeleteDiscount = async (registrationId: string, discountId: string, ignorePendingSlips = false) => {
    // First confirmation - standard delete confirmation
    if (!ignorePendingSlips && !confirm('ยืนยันการลบส่วนลดนี้?')) return;

    setActionMessage(null);

    try {
      const url = `/api/events/${eventId}/discounts?registrationId=${registrationId}&discountId=${discountId}${ignorePendingSlips ? '&ignorePendingSlips=true' : ''}`;
      const response = await fetch(url, { method: 'DELETE' });

      const data = await response.json();

      if (!response.ok) {
        // If there are pending slips and user hasn't confirmed yet, show confirm dialog
        if (data.hasPendingSlips && !ignorePendingSlips) {
          const confirmMessage = `${data.error}\n\n${data.details}\n\nคุณต้องการดำเนินการต่อหรือไม่?`;
          if (confirm(confirmMessage)) {
            // Retry with ignorePendingSlips=true
            await handleDeleteDiscount(registrationId, discountId, true);
            return;
          } else {
            return;
          }
        }

        // Show detailed error message if available
        const errorMessage = data.details
          ? `${data.error}\n\n${data.details}`
          : data.error || 'ไม่สามารถลบส่วนลดได้';
        throw new Error(errorMessage);
      }

      setActionMessage({ type: 'success', text: data.message || 'ลบส่วนลดเรียบร้อยแล้ว' });
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
      // Exclude cancelled from 'all' filter
      if (isCancelled) return false;
    }

    // Filter by payment status - exclude cancelled registrations from payment filters
    if (paymentFilter !== 'all') {
      // Cancelled registrations should NOT appear in any payment filter
      if (isCancelled) return false;
      if (attendee.registration.paymentStatus !== paymentFilter) return false;
    }

    // Filter by room type
    if (roomTypeFilter !== 'all') {
      // Parse room allocations
      let roomAllocations: Array<{ roomTypeId: string; roomCount: number }> = [];
      try {
        if (attendee.registration.roomAllocations) {
          roomAllocations = JSON.parse(attendee.registration.roomAllocations);
        }
      } catch (e) {
        // Invalid JSON, skip this attendee
      }

      // Check if this attendee has selected the filtered room type
      const hasRoomType = roomAllocations.some(ra => ra.roomTypeId === roomTypeFilter && ra.roomCount > 0);
      if (!hasRoomType) return false;
    }

    // Filter by management (other filters)
    if (managementFilter !== 'all') {
      if (managementFilter === 'no-room') {
        // Show registrations with unassigned attendees (no room number assignments)
        let roomAssignments: Array<{ roomId: string; attendeeIndex: number }> = [];
        try {
          if ((attendee.registration as any).roomAssignments) {
            roomAssignments = JSON.parse((attendee.registration as any).roomAssignments);
          }
        } catch (e) {
          // Invalid JSON or empty
        }

        const attendeeCount = attendee.registration.attendeeCount || 1;
        const assignedCount = roomAssignments.length;
        const hasUnassigned = attendeeCount > assignedCount;

        // Only show if there are unassigned attendees
        if (!hasUnassigned) return false;
      } else if (managementFilter === 'no-carpool') {
        // Show agents who haven't registered a car and haven't joined any carpool
        const registrationId = attendee.registration.registrationId;

        // Check if this registration is a car owner
        const isCarOwner = allCarpools.some(carpool =>
          carpool.ownerRegistrationId === registrationId
        );

        // Check if any member from this registration has joined a carpool
        const hasJoinedCarpool = allCarpools.some(carpool =>
          carpool.members?.some((member: any) =>
            member.registrationId === registrationId
          )
        );

        // Only show if they haven't registered a car AND haven't joined
        if (isCarOwner || hasJoinedCarpool) return false;
      } else if (managementFilter === 'no-table') {
        // Show registrations with attendees who don't have table assignments
        const registrationId = attendee.registration.registrationId;
        const attendeeCount = attendee.registration.attendeeCount || 1;

        // Count how many attendees from this registration are in party tables
        let assignedAttendeeCount = 0;
        allPartyTables.forEach(table => {
          if (table.members) {
            const membersFromThisReg = table.members.filter((m: any) =>
              m.registrationId === registrationId
            );
            assignedAttendeeCount += membersFromThisReg.length;
          }
        });

        // Only show if not all attendees have been assigned to tables
        if (assignedAttendeeCount >= attendeeCount) return false;
      }
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

      // Search in attendeeNames (ชื่อผู้เข้าร่วม)
      const matchAttendeeNames = attendee.registration.attendeeNames?.toLowerCase().includes(term);

      return matchCompany || matchName || matchLicense || matchMemberId || matchRegistrationId || matchAttendeeNames;
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
          {/* Desktop: Horizontal layout, Mobile: Stacked layout */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <Link href="/admin/events" className="text-gray-500 hover:text-gray-700 flex-shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{eventData.event.eventName}</h1>
                {eventData.event.eventNameEN && (
                  <p className="text-sm text-gray-500">{eventData.event.eventNameEN}</p>
                )}
                {/* Event Date */}
                {eventData.event.eventDate && (
                  <div className="flex items-center gap-1.5 text-sm text-blue-600 font-medium mt-1">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{formatEventDateRange(eventData.event.eventDate, eventData.event.eventEndDate)}</span>
                  </div>
                )}
                {/* Status Badges - Single row on all screen sizes */}
                <div className="flex flex-wrap gap-2 mt-2">
                {/* Active/Inactive Status Badge */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  eventData.event.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {eventData.event.isActive ? 'Active' : 'Inactive'}
                </span>

                {/* Published Status Badge */}
                {eventData.event.isPublished && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Published
                  </span>
                )}

                {/* Registration Status with Capacity Check */}
                {(() => {
                  const isFull = eventData.event.maxCapacity > 0 && eventData.summary.totalAttendees >= eventData.event.maxCapacity;

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
                  if (eventData.event.registrationOpen && eventData.event.isPublished) {
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
                  if (eventData.event.registrationOpen && !eventData.event.isPublished) {
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        ยังไม่ Published
                      </span>
                    );
                  }

                  // Show closed status if registration is closed (and not full)
                  if (!eventData.event.registrationOpen) {
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
                </div>
              </div>
            </div>
            {/* Action Buttons - Separate row on mobile, inline on desktop */}
            <div className="flex flex-wrap items-center gap-2">
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
                onClick={handleOpenMessageModal}
                disabled={selectedRegistrationsForMessage.size === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={selectedRegistrationsForMessage.size === 0 ? 'กรุณาเลือกผู้รับก่อน' : 'ส่งข้อความ LINE'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="hidden sm:inline">
                  ส่งข้อความ LINE ({selectedRegistrationsForMessage.size})
                </span>
              </button>

              {/* Room Management Button */}
              <button
                onClick={() => setShowRoomManagementModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                title="จัดการห้องพัก"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="hidden sm:inline">จัดการห้องพัก</span>
              </button>

              {/* Carpool Management Button */}
              {eventData?.event?.hasCarpoolFeature && (
                <button
                  onClick={() => setShowCarpoolManagementModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                  title="จัดการ Carpool"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5 11L6.5 6.5C6.86 5.6 7.69 5 8.62 5H15.38C16.31 5 17.14 5.6 17.5 6.5L19 11M5 11V17C5 17.55 5.45 18 6 18H6.5C7.05 18 7.5 17.55 7.5 17V16H16.5V17C16.5 17.55 16.95 18 17.5 18H18C18.55 18 19 17.55 19 17V11M5 11H19M7 13.5C7 14.33 6.33 15 5.5 15C4.67 15 4 14.33 4 13.5C4 12.67 4.67 12 5.5 12C6.33 12 7 12.67 7 13.5ZM20 13.5C20 14.33 19.33 15 18.5 15C17.67 15 17 14.33 17 13.5C17 12.67 17.67 12 18.5 12C19.33 12 20 12.67 20 13.5Z"/>
                  </svg>
                  <span className="hidden sm:inline">จัดการ Carpool</span>
                </button>
              )}

              {/* Party Table Management Button */}
              {eventData?.event?.hasPartyTableFeature && (
                <button
                  onClick={() => setShowPartyTableManagementModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
                  title="จัดการ Party Table"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="hidden sm:inline">จัดการ Party Table</span>
                </button>
              )}

              {/* Event Summary QR Code Button */}
              <button
                onClick={() => setShowEventSummaryQRModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-colors shadow-sm"
                title="เว็บเช็คข้อมูล"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span className="hidden sm:inline">เว็บเช็คข้อมูล</span>
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

          {/* Total Attendees with Payment Count */}
          <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-indigo-200">
            <p className="text-xl sm:text-3xl font-bold text-indigo-600">
              {(() => {
                // Count attendees who have completed payment (exclude cancelled, include overpaid)
                const isFullPaymentMode = eventData.event.paymentMode === 'full';
                let paidCount = 0;
                let totalActiveAttendees = 0;

                eventData.attendees.forEach(attendee => {
                  // Skip cancelled registrations
                  if (isCancelledRegistration(attendee)) {
                    return;
                  }

                  const reg = attendee.registration;
                  const attendeeCount = reg.attendeeCount || 1;
                  totalActiveAttendees += attendeeCount;

                  let isFullyPaid = false;
                  const paymentStatus = reg.paymentStatus?.toLowerCase() || '';

                  // Check if overpaid (counts as paid, waiting for refund)
                  const isOverpaid = paymentStatus === 'ชำระเกินจำนวน' || paymentStatus.includes('overpaid');

                  if (isFullPaymentMode) {
                    // Full Payment Mode: Check if full payment is approved OR overpaid
                    isFullyPaid = (reg as any).fullPaymentPaid === true || isOverpaid;
                  } else {
                    // Deposit + Remaining Mode: Can pay in full OR pay in installments
                    // Option 1: Pay full amount directly (fullPaymentPaid)
                    // Option 2: Pay deposit + remaining (depositPaid && remainingPaid)
                    const fullPaymentPaid = (reg as any).fullPaymentPaid === true;
                    const depositPaid = reg.depositPaid === true;
                    const remainingPaid = (reg as any).remainingPaid === true;
                    isFullyPaid = fullPaymentPaid || (depositPaid && remainingPaid) || isOverpaid;
                  }

                  if (isFullyPaid) {
                    paidCount += attendeeCount;
                  }
                });

                return `${paidCount}/${totalActiveAttendees}`;
              })()}
            </p>
            <p className="text-[10px] sm:text-sm text-gray-500">ชำระแล้ว/จำนวนผู้เข้าร่วม (คน)</p>
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
            // Calculate payment totals from registration status (exclude cancelled)
            // Note: This counts based on ACTUAL payment status in the database
            // which is updated when payment slips are approved
            let totalPending = 0;
            let totalApproved = 0;

            // Determine payment mode from event configuration
            const isFullPaymentMode = eventData.event.paymentMode === 'full';

            eventData.attendees.forEach(attendee => {
              // Skip cancelled registrations
              if (isCancelledRegistration(attendee)) {
                return;
              }

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
                // Can pay in full OR pay in installments

                // Option 1: Check if paid in full (fullPaymentPaid)
                const fullPaymentPaid = (reg as any).fullPaymentPaid === true;
                const hasFullPaymentSlip = (reg as any).fullPaymentSlipUrl && (reg as any).fullPaymentSlipUrl.trim() !== '';

                if (fullPaymentPaid) {
                  // Paid full amount
                  totalApproved += totalAmount;
                } else if (hasFullPaymentSlip) {
                  // Full payment slip pending approval
                  totalPending += totalAmount;
                } else {
                  // Option 2: Pay in installments (deposit + remaining)
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
              }
            });

            return (
              <>
                <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-yellow-200">
                  <p className="text-lg sm:text-2xl font-bold text-yellow-600">
                    {totalPending.toLocaleString()} บาท
                  </p>
                  <p className="text-[10px] sm:text-xs text-gray-500">รอตรวจสอบ (บาท)</p>
                </div>
                <div className="bg-white rounded-lg shadow p-2 sm:p-4 text-center border-2 border-emerald-200">
                  <p className="text-lg sm:text-2xl font-bold text-emerald-600">
                    {totalApproved.toLocaleString()} บาท
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
            <div className="w-full relative">
              <input
                type="text"
                placeholder="ค้นหาชื่อ, บริษัท, เลขใบอนุญาต, รหัสสมาชิก..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  title="ล้างคำค้นหา"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filter Dropdowns - arranged in a row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Registration Status Filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">สถานะการลงทะเบียน</label>
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as 'all' | 'confirmed' | 'pending' | 'cancelled')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">ทั้งหมด ({eventData.attendees.length})</option>
                  <option value="confirmed">ยืนยันแล้ว ({eventData.summary.confirmedCount})</option>
                  <option value="pending">รอดำเนินการ ({(() => {
                    const cancelledCount = eventData.attendees.filter(a => {
                      const status = String(a.registration.status || '').toLowerCase();
                      return status === 'cancelled' || a.registration.status?.includes('ยกเลิก');
                    }).length;
                    return eventData.attendees.length - eventData.summary.confirmedCount - cancelledCount;
                  })()})</option>
                  <option value="cancelled">ยกเลิก ({eventData.attendees.filter(a => {
                    const status = String(a.registration.status || '').toLowerCase();
                    return status === 'cancelled' || a.registration.status?.includes('ยกเลิก');
                  }).length})</option>
                </select>
              </div>

              {/* Payment Status Filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  <span className="inline-flex items-center gap-2">
                    สถานะการชำระเงิน
                    {(() => {
                      // Count registrations with "รอตรวจสอบ" status
                      const pendingReviewCount = eventData.attendees.filter(a => {
                        const status = String(a.registration.status || '').toLowerCase();
                        const isCancelled = status === 'cancelled' || a.registration.status?.includes('ยกเลิก');
                        return !isCancelled && a.registration.paymentStatus === 'รอตรวจสอบ';
                      }).length;

                      if (pendingReviewCount > 0) {
                        return (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200 animate-pulse-slow">
                            มี {pendingReviewCount} รายการรอตรวจสอบ
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </span>
                </label>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">ทั้งหมด</option>
                  {(() => {
                    // Get unique payment statuses from attendees (exclude cancelled registrations)
                    const nonCancelledAttendees = eventData.attendees.filter(a => {
                      const status = String(a.registration.status || '').toLowerCase();
                      const isCancelled = status === 'cancelled' || a.registration.status?.includes('ยกเลิก');
                      return !isCancelled;
                    });

                    const paymentStatuses = Array.from(
                      new Set(
                        nonCancelledAttendees
                          .map(a => a.registration.paymentStatus)
                          .filter(Boolean)
                      )
                    ).sort();

                    return paymentStatuses.map(status => {
                      const count = nonCancelledAttendees.filter(a => a.registration.paymentStatus === status).length;
                      return (
                        <option key={status} value={status}>
                          {status} ({count})
                        </option>
                      );
                    });
                  })()}
                </select>
              </div>

              {/* Management Filter - Other management tasks */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">การจัดการอื่นๆ</label>
                <select
                  value={managementFilter}
                  onChange={(e) => setManagementFilter(e.target.value as 'all' | 'no-room' | 'no-carpool' | 'no-table')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">ทั้งหมด</option>

                  {/* No Room Assignment - moved from room type filter */}
                  {eventData?.event?.roomTypes && eventData.event.roomTypes.length > 0 && (() => {
                    const unassignedCount = eventData.attendees.reduce((count, attendee) => {
                      // Check if registration is cancelled
                      const status = String(attendee.registration.status || '').toLowerCase();
                      const isCancelled = status === 'cancelled' || attendee.registration.status?.includes('ยกเลิก');

                      // Apply same filters as main list
                      if (filter === 'confirmed') {
                        if (isCancelled || !attendee.isConfirmed) return count;
                      } else if (filter === 'pending') {
                        if (isCancelled || attendee.isConfirmed) return count;
                      } else if (filter === 'cancelled') {
                        if (!isCancelled) return count;
                      } else if (filter === 'all') {
                        if (isCancelled) return count;
                      }

                      // Filter by payment status
                      if (paymentFilter !== 'all') {
                        if (isCancelled) return count;
                        if (attendee.registration.paymentStatus !== paymentFilter) return count;
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
                        const matchAttendeeNames = attendee.registration.attendeeNames?.toLowerCase().includes(term);

                        if (!(matchCompany || matchName || matchLicense || matchMemberId || matchRegistrationId || matchAttendeeNames)) {
                          return count;
                        }
                      }

                      // Check if has unassigned attendees (not assigned to specific room numbers)
                      let roomAssignments: Array<{ roomId: string; attendeeIndex: number }> = [];
                      try {
                        if ((attendee.registration as any).roomAssignments) {
                          roomAssignments = JSON.parse((attendee.registration as any).roomAssignments);
                        }
                      } catch (e) {
                        // Invalid JSON or empty
                      }

                      // Count attendees who haven't been assigned to specific rooms
                      const attendeeCount = attendee.registration.attendeeCount || 1;
                      const assignedCount = roomAssignments.length;
                      const unassigned = attendeeCount - assignedCount;

                      // Only count if there are unassigned attendees
                      return unassigned > 0 ? count + 1 : count;
                    }, 0);

                    return (
                      <option value="no-room">
                        ยังไม่ระบุห้อง ({unassignedCount})
                      </option>
                    );
                  })()}

                  {/* No Carpool - agents who haven't registered car and haven't joined */}
                  <option value="no-carpool">ยังไม่ลงทะเบียนรถยนต์</option>

                  {/* No Table - registrations with attendees who don't have table numbers */}
                  <option value="no-table">ยังไม่มีเลขโต๊ะ/ไม่ครบ</option>
                </select>
              </div>

              {/* Room Type Filter - Only show if event has room types configured */}
              {eventData?.event?.roomTypes && eventData.event.roomTypes.length > 0 && (
                <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">ประเภทการใช้ห้อง</label>
                <select
                  value={roomTypeFilter}
                  onChange={(e) => setRoomTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">ทั้งหมด</option>

                  {eventData.event.roomTypes
                    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                    .map((roomType: any) => {
                      // Count TOTAL ROOMS (not companies) of this room type
                      // Use same filtering logic as filteredAttendees but exclude roomTypeFilter
                      const totalRooms = eventData.attendees.reduce((sum, attendee) => {
                        // Check if registration is cancelled
                        const status = String(attendee.registration.status || '').toLowerCase();
                        const isCancelled = status === 'cancelled' || attendee.registration.status?.includes('ยกเลิก');

                        // Filter by registration status
                        if (filter === 'confirmed') {
                          if (isCancelled || !attendee.isConfirmed) return sum;
                        } else if (filter === 'pending') {
                          if (isCancelled || attendee.isConfirmed) return sum;
                        } else if (filter === 'cancelled') {
                          if (!isCancelled) return sum;
                        } else if (filter === 'all') {
                          if (isCancelled) return sum;
                        }

                        // Filter by payment status
                        if (paymentFilter !== 'all') {
                          if (isCancelled) return sum;
                          if (attendee.registration.paymentStatus !== paymentFilter) return sum;
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
                          const matchAttendeeNames = attendee.registration.attendeeNames?.toLowerCase().includes(term);

                          if (!(matchCompany || matchName || matchLicense || matchMemberId || matchRegistrationId || matchAttendeeNames)) {
                            return sum;
                          }
                        }

                        // Parse room allocations
                        let roomAllocations: Array<{ roomTypeId: string; roomCount: number }> = [];
                        try {
                          if (attendee.registration.roomAllocations) {
                            roomAllocations = JSON.parse(attendee.registration.roomAllocations);
                          }
                        } catch (e) {
                          return sum;
                        }

                        // Find this room type and add its count
                        const allocation = roomAllocations.find(ra => ra.roomTypeId === roomType.typeId);
                        return sum + (allocation?.roomCount || 0);
                      }, 0);

                      // Show room type label with inactive indicator if needed
                      const roomTypeLabel = roomType.isActive
                        ? roomType.typeName
                        : `${roomType.typeName} (ปิดใช้งาน)`;

                      return (
                        <option key={roomType.typeId} value={roomType.typeId}>
                          {roomTypeLabel} ({totalRooms})
                        </option>
                      );
                    })}
                </select>
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Filter Navigator - Active Filters Display */}
        {(searchTerm || filter !== 'all' || paymentFilter !== 'all' || roomTypeFilter !== 'all' || managementFilter !== 'all') && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span className="text-sm font-semibold text-blue-900">กำลังกรองข้อมูล:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* Search Term Chip */}
                  {searchTerm && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 rounded-full text-sm">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span className="text-gray-700">ค้นหา:</span>
                      <span className="font-medium text-gray-900">{searchTerm}</span>
                      <button
                        onClick={() => setSearchTerm('')}
                        className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="ล้างคำค้นหา"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Registration Status Chip */}
                  {filter !== 'all' && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 rounded-full text-sm">
                      <span className="text-gray-700">สถานะการลงทะเบียน:</span>
                      <span className="font-medium text-gray-900">
                        {filter === 'confirmed' ? 'ยืนยันแล้ว' : filter === 'pending' ? 'รอดำเนินการ' : 'ยกเลิก'}
                      </span>
                      <button
                        onClick={() => setFilter('all')}
                        className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="ล้างตัวกรอง"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Payment Status Chip */}
                  {paymentFilter !== 'all' && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 rounded-full text-sm">
                      <span className="text-gray-700">สถานะการชำระเงิน:</span>
                      <span className="font-medium text-gray-900">{paymentFilter}</span>
                      <button
                        onClick={() => setPaymentFilter('all')}
                        className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="ล้างตัวกรอง"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Management Filter Chip */}
                  {managementFilter !== 'all' && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 rounded-full text-sm">
                      <span className="text-gray-700">การจัดการอื่นๆ:</span>
                      <span className="font-medium text-gray-900">
                        {managementFilter === 'no-room' ? 'ยังไม่ระบุห้อง' :
                         managementFilter === 'no-carpool' ? 'ยังไม่ลงทะเบียนรถยนต์' :
                         managementFilter === 'no-table' ? 'ยังไม่มีเลขโต๊ะ/ไม่ครบ' : ''}
                      </span>
                      <button
                        onClick={() => setManagementFilter('all')}
                        className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="ล้างตัวกรอง"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Room Type Chip */}
                  {roomTypeFilter !== 'all' && eventData?.event?.roomTypes && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 rounded-full text-sm">
                      <span className="text-gray-700">ประเภทการใช้ห้อง:</span>
                      <span className="font-medium text-gray-900">
                        {(() => {
                          const selectedRoomType = eventData.event.roomTypes.find((rt: any) => rt.typeId === roomTypeFilter);
                          if (selectedRoomType) {
                            return selectedRoomType.isActive
                              ? selectedRoomType.typeName
                              : `${selectedRoomType.typeName} (ปิดใช้งาน)`;
                          }
                          return roomTypeFilter;
                        })()}
                      </span>
                      <button
                        onClick={() => setRoomTypeFilter('all')}
                        className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                        title="ล้างตัวกรอง"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Clear All Button */}
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilter('all');
                  setPaymentFilter('all');
                  setRoomTypeFilter('all');
                  setManagementFilter('all');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                title="ล้างตัวกรองทั้งหมด"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                ล้างทั้งหมด
              </button>
            </div>
          </div>
        )}

        {/* Attendees List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3 mb-3">
              {/* Select All Checkbox */}
              <input
                type="checkbox"
                checked={
                  filteredAttendees.filter(a => a.registration.lineUserId).length > 0 &&
                  selectedRegistrationsForMessage.size === filteredAttendees.filter(a => a.registration.lineUserId).length
                }
                onChange={toggleSelectAll}
                className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                title="เลือก/ยกเลิก ทั้งหมด (เฉพาะที่มี LINE)"
              />
              <h2 className="text-lg font-semibold text-gray-900">
                รายชื่อผู้เข้าร่วม ({filteredAttendees.length} รายการ)
              </h2>
              {roomsLastFetched && (
                <span className="text-xs text-gray-500 ml-3">
                  ข้อมูลห้องพัก: {roomsLastFetched.toLocaleTimeString('th-TH')}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Refresh Rooms Button */}
              <button
                onClick={() => fetchAllRooms()}
                disabled={roomsLoading}
                className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="รีเฟรชข้อมูลห้องพัก"
              >
                {roomsLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-600 border-t-transparent"></div>
                    <span className="hidden sm:inline">กำลังโหลด...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="hidden sm:inline">รีเฟรช</span>
                  </>
                )}
              </button>
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

                const status = String(attendee.registration.status || '').toLowerCase();
                const isCancelled = status === 'cancelled' || attendee.registration.status?.includes('ยกเลิก');

                return (
                <div
                  key={attendee.registration.registrationId || index}
                  className={`p-4 transition-all duration-200 ${
                    isExpanded
                      ? 'bg-gray-100 hover:bg-gray-150 border-l-4 border-gray-400 shadow-sm'
                      : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  {/* Header Section with LINE Profile - Improved Mobile Layout */}
                  <div className="flex items-start gap-3 sm:gap-4 mb-3">
                    {/* Selection Checkbox (only if has LINE user ID) */}
                    {attendee.registration.lineUserId && attendee.registration.lineUserId.trim() !== '' && (
                      <div className="flex-shrink-0 pt-2 sm:pt-3">
                        <input
                          type="checkbox"
                          checked={selectedRegistrationsForMessage.has(attendee.registration.registrationId)}
                          onChange={() => toggleRegistrationSelection(attendee.registration.registrationId)}
                          className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                          title="เลือกเพื่อส่งข้อความแจ้งชำระเงิน"
                        />
                      </div>
                    )}

                    {/* LINE Profile Picture - Smaller on mobile */}
                    <div className="flex-shrink-0">
                      {attendee.lineProfile?.lineProfilePicture ? (
                        <Image
                          src={attendee.lineProfile.lineProfilePicture}
                          alt={attendee.lineProfile.lineDisplayName || 'Profile'}
                          width={48}
                          height={48}
                          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gray-200 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Basic Info - More space on mobile */}
                    <div className="flex-1 min-w-0">
                      {/* Name and verified icon */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {/* Name from LINE profile or registration - clickable if has memberId */}
                        {attendee.member?.memberId ? (
                          <Link
                            href={`/members/${attendee.member.memberId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-600 hover:text-blue-800 hover:underline break-words transition-colors"
                            title="จัดการชื่อ (เปิดในแท็บใหม่)"
                          >
                            {attendee.lineProfile?.lineDisplayName ||
                             attendee.member?.fullNameTH ||
                             attendee.registration.contactName ||
                             'ไม่ระบุชื่อ'}
                          </Link>
                        ) : (
                          <h3 className="font-medium text-gray-900 break-words">
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
                      </div>

                      {/* Badges - First row: Role and Member ID */}
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
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
                      </div>

                      {/* Badges - Second row: Payment and Room Status */}
                      <div className="flex flex-wrap gap-1.5">
                        {/* Payment Status badge */}
                        {attendee.registration.paymentStatus && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(attendee.registration.paymentStatus)}`}>
                            {attendee.registration.paymentStatus}
                          </span>
                        )}

                        {/* Cancelled Status badge */}
                        {isCancelled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            ยกเลิก
                          </span>
                        )}

                        {/* Unassigned Rooms Warning */}
                        {eventData?.event?.roomTypes && eventData.event.roomTypes.length > 0 && !isCancelled && (() => {
                          let roomAssignments: Array<{ roomId: string; attendeeIndex: number }> = [];
                          try {
                            if ((attendee.registration as any).roomAssignments) {
                              roomAssignments = JSON.parse((attendee.registration as any).roomAssignments);
                            }
                          } catch (e) {
                            console.error('Error parsing roomAssignments:', e);
                          }

                          const unassignedCount = attendee.registration.attendeeCount - roomAssignments.length;

                          if (unassignedCount > 0) {
                            return (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 cursor-help"
                                title={`มีผู้เข้าร่วม ${unassignedCount} คนที่ยังไม่ได้ระบุห้องพัก`}
                              >
                                <span className="hidden sm:inline">⚠️ ยังไม่ระบุห้อง</span>
                                <span className="sm:hidden">⚠️</span>
                                <span className="font-semibold">{unassignedCount}</span>
                                <span className="hidden sm:inline">คน</span>
                              </span>
                            );
                          }
                          return null;
                        })()}

                        {/* Carpool Registration Badge */}
                        {(() => {
                          if (!eventData?.event?.hasCarpoolFeature || isCancelled) return null;

                          // Find all carpools where this registration is the owner
                          const ownedCarpools = allCarpools.filter((carpool: any) =>
                            carpool.ownerRegistrationId === attendee.registration.registrationId &&
                            carpool.status !== 'deleted' && carpool.status !== 'cancelled'
                          );

                          if (ownedCarpools.length === 0) return null;

                          // Build tooltip text with all cars
                          const tooltipLines = ownedCarpools.map((carpool: any, index: number) => {
                            const carNum = carpool.assignedCarNumber ? `รถ #${String(carpool.assignedCarNumber).padStart(3, '0')}` : 'ยังไม่จัดเลข';
                            const plate = carpool.licensePlate || 'ไม่ระบุ';

                            // Get all members in this carpool
                            const memberNames = carpool.members?.map((m: any) => m.name).join(', ') || 'ไม่มีผู้ร่วมรถ';

                            return `${index + 1}. ${carNum} - ${plate}\n   ผู้ร่วมรถ: ${memberNames}`;
                          }).join('\n');

                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCarpoolRegistration({
                                  registrationId: attendee.registration.registrationId,
                                  contactName: attendee.registration.contactName,
                                });
                                setShowCarpoolDetailModal(true);
                              }}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer sm:gap-1"
                              title={`ลงทะเบียนรถ ${ownedCarpools.length} คัน:\n${tooltipLines}\n\nคลิกเพื่อดูรายละเอียด`}
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                              </svg>
                              <span className="hidden sm:inline">ลงทะเบียนรถ {ownedCarpools.length > 1 ? `(${ownedCarpools.length})` : ''}</span>
                            </button>
                          );
                        })()}

                        {/* Carpool Join Badge */}
                        {(() => {
                          if (!eventData?.event?.hasCarpoolFeature || isCancelled) return null;

                          // Find all carpools where this registration has members (but is not the owner)
                          const joinedCarpools = allCarpools.filter((carpool: any) => {
                            if (carpool.ownerRegistrationId === attendee.registration.registrationId) return false;
                            if (carpool.status === 'deleted' || carpool.status === 'cancelled') return false;

                            return carpool.members?.some((member: any) =>
                              member.registrationId === attendee.registration.registrationId
                            );
                          });

                          if (joinedCarpools.length === 0) return null;

                          // Build tooltip text with all cars
                          const tooltipLines = joinedCarpools.map((carpool: any, index: number) => {
                            const carNum = carpool.assignedCarNumber ? `รถ #${String(carpool.assignedCarNumber).padStart(3, '0')}` : 'ยังไม่จัดเลข';
                            const plate = carpool.licensePlate || 'ไม่ระบุ';

                            // Get members from this registration who joined this carpool
                            const members = carpool.members?.filter((m: any) => m.registrationId === attendee.registration.registrationId) || [];
                            const memberNames = members.map((m: any) => m.name).join(', ');

                            return `${index + 1}. ${carNum} - ${plate}\n   ผู้ร่วมรถ: ${memberNames || 'ไม่ระบุ'}`;
                          }).join('\n');

                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCarpoolRegistration({
                                  registrationId: attendee.registration.registrationId,
                                  contactName: attendee.registration.contactName,
                                });
                                setShowCarpoolDetailModal(true);
                              }}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-100 text-pink-800 hover:bg-pink-200 transition-colors cursor-pointer sm:gap-1"
                              title={`Join รถ ${joinedCarpools.length} คัน:\n${tooltipLines}\n\nคลิกเพื่อดูรายละเอียด`}
                            >
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                              </svg>
                              <span className="hidden sm:inline">Join รถ {joinedCarpools.length > 1 ? `(${joinedCarpools.length})` : ''}</span>
                            </button>
                          );
                        })()}
                      </div>

                      {/* Company info */}
                      <p className="text-sm text-gray-600 truncate">
                        {attendee.member?.companyNameTH || attendee.registration.companyName || '-'}
                      </p>

                      {/* License & additional info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                        {attendee.registration.registrationId && (
                          <div className="flex items-center gap-1">
                            <span className="text-indigo-600 font-semibold">🎫 รหัส: {attendee.registration.registrationId}</span>
                            <button
                              onClick={(e) => handleCopyRegistrationId(attendee.registration.registrationId, e)}
                              className="text-gray-400 hover:text-indigo-600"
                              title="คัดลอกรหัสการจอง"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                          </div>
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
                      {attendee.registration.attendeeNames && attendee.registration.attendeeCount > 1 && (() => {
                        const names = parseAttendeeNames(attendee.registration.attendeeNames);
                        return names.length > 0 ? (
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            ผู้ร่วม: {names.join(', ')}
                          </p>
                        ) : null;
                      })()}
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

                          {/* Price Breakdown Section */}
                          {attendee.registration.totalAmount !== undefined && (
                            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                              <p className="text-xs font-semibold text-green-900 mb-2">รายละเอียดค่าใช้จ่าย:</p>
                              <div className="space-y-1 text-xs">
                                {/* Event Fee */}
                                {(attendee.registration.eventFee ?? 0) > 0 && (
                                  <div className="flex justify-between text-gray-700">
                                    <span>ค่าเข้าร่วมกิจกรรม:</span>
                                    <span>{(attendee.registration.eventFee ?? 0).toLocaleString()} บาท</span>
                                  </div>
                                )}

                                {/* Attendee Types Breakdown */}
                                {(() => {
                                  try {
                                    if (attendee.registration.attendeeTypeSelections) {
                                      const selections = JSON.parse(attendee.registration.attendeeTypeSelections);
                                      if (selections && selections.length > 0) {
                                        return selections.map((sel: any, idx: number) => {
                                          const type = eventData?.event?.attendeeTypes?.find((t: any) => t.typeId === sel.typeId);
                                          if (!type) return null;
                                          const subtotal = type.price * sel.quantity;
                                          return (
                                            <div key={idx} className="flex justify-between text-gray-600 ml-3">
                                              <span>→ {type.typeName} {type.price.toLocaleString()} บาท × {sel.quantity} คน</span>
                                              <span>{subtotal.toLocaleString()} บาท</span>
                                            </div>
                                          );
                                        });
                                      }
                                    }
                                  } catch (e) {
                                    console.error('Error parsing attendee types for price:', e);
                                  }
                                  return null;
                                })()}

                                {/* Room Fee */}
                                {(attendee.registration.roomFee ?? 0) > 0 && (
                                  <div className="flex justify-between text-gray-700 mt-1">
                                    <span>ค่าห้องพัก:</span>
                                    <span>{(attendee.registration.roomFee ?? 0).toLocaleString()} บาท</span>
                                  </div>
                                )}

                                {/* Room Allocations Breakdown */}
                                {(() => {
                                  try {
                                    if (attendee.registration.roomAllocations) {
                                      const allocations = JSON.parse(attendee.registration.roomAllocations);
                                      if (allocations && allocations.length > 0) {
                                        return allocations.map((alloc: any, idx: number) => {
                                          const roomType = eventData?.event?.roomTypes?.find((rt: any) => rt.typeId === alloc.roomTypeId);
                                          if (!roomType) return null;
                                          const subtotal = roomType.price * alloc.roomCount;
                                          return (
                                            <div key={idx} className="flex justify-between text-gray-600 ml-3">
                                              <span>→ {roomType.typeName} {roomType.price.toLocaleString()} บาท × {alloc.roomCount} ห้อง</span>
                                              <span>{subtotal.toLocaleString()} บาท</span>
                                            </div>
                                          );
                                        });
                                      }
                                    }
                                  } catch (e) {
                                    console.error('Error parsing room allocations for price:', e);
                                  }
                                  return null;
                                })()}

                                {/* Special Charges */}
                                {(() => {
                                  try {
                                    if (attendee.registration.specialCharges) {
                                      const charges = JSON.parse(attendee.registration.specialCharges);
                                      if (charges && charges.length > 0) {
                                        return (
                                          <>
                                            <div className="border-t border-green-300 mt-1 pt-1"></div>
                                            <div className="text-purple-700 font-medium">ค่าใช้จ่ายเสริม:</div>
                                            {charges.map((charge: any) => (
                                              <div key={charge.chargeId} className="flex justify-between text-purple-600 ml-3">
                                                <span>→ {charge.description}</span>
                                                <span>+{charge.amount.toLocaleString()} บาท</span>
                                              </div>
                                            ))}
                                          </>
                                        );
                                      }
                                    }
                                  } catch (e) {
                                    console.error('Error parsing special charges:', e);
                                  }
                                  return null;
                                })()}

                                {/* Discounts */}
                                {(() => {
                                  try {
                                    if (attendee.registration.discounts) {
                                      const discounts = JSON.parse(attendee.registration.discounts);
                                      if (discounts && discounts.length > 0) {
                                        return (
                                          <>
                                            <div className="border-t border-green-300 mt-1 pt-1"></div>
                                            <div className="text-orange-700 font-medium">ส่วนลด:</div>
                                            {discounts.map((discount: any) => (
                                              <div key={discount.discountId} className="flex justify-between text-orange-600 ml-3">
                                                <span>
                                                  → {discount.description}
                                                  {discount.discountType === 'percentage' && ` (${discount.value}%)`}
                                                  {discount.discountType === 'free' && ' (ฟรี)'}
                                                </span>
                                                <span>-{discount.calculatedAmount.toLocaleString()} บาท</span>
                                              </div>
                                            ))}
                                          </>
                                        );
                                      }
                                    }
                                  } catch (e) {
                                    console.error('Error parsing discounts:', e);
                                  }
                                  return null;
                                })()}

                                {/* Total */}
                                <div className="flex justify-between font-bold border-t-2 border-green-400 pt-1 mt-1 text-green-900">
                                  <span>ยอดรวมทั้งหมด:</span>
                                  <span>{attendee.registration.totalAmount.toLocaleString()} บาท</span>
                                </div>
                              </div>
                            </div>
                          )}

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

                        {/* Attendees with Room Assignments */}
                        {(() => {
                          // Parse room assignments
                          let roomAssignments: Array<{ roomId: string; attendeeIndex: number }> = [];
                          try {
                            if ((attendee.registration as any).roomAssignments) {
                              roomAssignments = JSON.parse((attendee.registration as any).roomAssignments);
                            }
                          } catch (e) {
                            console.error('Error parsing roomAssignments:', e);
                          }

                          if (roomAssignments.length > 0) {
                            // Get attendee names - parse JSON properly
                            const names = parseAttendeeNames(attendee.registration.attendeeNames);
                            const attendeeCount = attendee.registration.attendeeCount || 1;

                            return (
                              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                                <p className="text-xs font-semibold text-indigo-900 mb-2">ชื่อผู้เข้าร่วมและเลขห้อง:</p>
                                <div className="space-y-1">
                                  {Array.from({ length: attendeeCount }).map((_, index) => {
                                    const assignment = roomAssignments.find(a => a.attendeeIndex === index);
                                    const attendeeName = names[index] || `ผู้เข้าร่วมคนที่ ${index + 1}`;

                                    return (
                                      <div key={index} className="text-xs text-gray-700 flex items-center justify-between">
                                        <span>{index + 1}. {attendeeName}</span>
                                        {assignment ? (
                                          <RoomNumberWithTooltip
                                            roomId={assignment.roomId}
                                            eventId={eventId as string}
                                            currentAttendeeIndex={index}
                                            currentRegistrationId={attendee.registration.registrationId}
                                            allAttendees={eventData?.attendees || []}
                                            allRooms={allRooms}
                                          />
                                        ) : (
                                          <span className="text-gray-400 text-xs">ยังไม่จัดห้อง</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
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
                              <option value="รอดำเนินการ">รอดำเนินการ</option>
                              <option value="ยืนยันแล้ว">ยืนยันแล้ว</option>
                              <option value="ชำระครบแล้ว">ชำระครบแล้ว</option>
                              <option value="ยกเลิก">ยกเลิก</option>
                            </select>
                          </div>
                        </div>

                        {/* Attendee Names */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            ชื่อผู้เข้าร่วม {availableRooms.length > 0 && '& เลขห้องพัก'}
                          </label>
                          <div className="space-y-2">
                            {Array.from({ length: editFormData.attendeeCount }).map((_, index) => {
                              const currentAssignment = editFormData.roomAssignments?.find(a => a.attendeeIndex === index);
                              const currentRoomId = currentAssignment?.roomId || '';

                              return (
                                <div key={index} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={editFormData.attendeeNames[index] || ''}
                                    onChange={(e) => handleAttendeeNameChange(index, e.target.value)}
                                    placeholder={index === 0 ? 'ชื่อผู้ติดต่อ' : `ชื่อผู้เข้าร่วมคนที่ ${index + 1}`}
                                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  {availableRooms.length > 0 && (
                                    <select
                                      value={currentRoomId}
                                      onChange={(e) => handleRoomAssignmentChange(index, e.target.value)}
                                      className="w-48 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      <option value="">- ไม่ระบุห้อง -</option>
                                      {availableRooms
                                        .filter(room => {
                                          // Show room if it's the currently selected room OR if it's not full and not locked
                                          if (room.roomId === currentRoomId) return true;
                                          return room.currentOccupancy < room.maxOccupancy && !(room as any).isLocked;
                                        })
                                        .map(room => {
                                          const label = `${room.buildingName}-${room.roomNumber}${room.roomTypeCategory ? ` (${room.roomTypeCategory})` : ''} [${room.currentOccupancy}/${room.maxOccupancy}]`;
                                          return (
                                            <option key={room.roomId} value={room.roomId}>
                                              {label}
                                            </option>
                                          );
                                        })}
                                    </select>
                                  )}
                                </div>
                              );
                            })}
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
                                          = {subtotal.toLocaleString()} บาท
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
                                .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
                                .map((roomType: any) => {
                                  const allocation = editFormData.roomAllocations?.find(ra => ra.roomTypeId === roomType.typeId);
                                  const roomCount = allocation?.roomCount || 0;
                                  const subtotal = roomType.price * roomCount;
                                  const isInactive = roomType.isActive === false;
                                  return (
                                    <div key={roomType.typeId} className={`flex items-center gap-2 bg-white p-2 rounded ${isInactive ? 'opacity-60' : ''}`}>
                                      <span className="text-xs font-medium text-gray-700 flex-1">
                                        {roomType.typeName}
                                        {isInactive && <span className="ml-1.5 text-xs text-red-600 font-semibold">(ปิดใช้งาน)</span>}
                                        <span className="text-gray-500"> ({roomType.price.toLocaleString()} บาท/ห้อง, {roomType.capacity} คน/ห้อง)</span>
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
                                          = {subtotal.toLocaleString()} บาท
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

                          console.log('[Real-time Calc START]', {
                            useAttendeeTypePricing: eventData?.event?.useAttendeeTypePricing,
                            editFormData_attendeeCount: editFormData.attendeeCount,
                            editFormData_attendeeTypeSelections: editFormData.attendeeTypeSelections,
                            eventData_attendeeTypes: eventData?.event?.attendeeTypes,
                          });

                          if (eventData?.event?.useAttendeeTypePricing && (!effectiveAttendeeTypeSelections || effectiveAttendeeTypeSelections.length === 0)) {
                            // Auto-initialize with first active type if needed
                            const activeTypes = eventData.event.attendeeTypes?.filter((t: any) => t.isActive) || [];
                            console.log('[Real-time Calc] Active types found:', activeTypes);

                            if (activeTypes.length > 0 && editFormData.attendeeCount > 0) {
                              const firstType = activeTypes[0];
                              effectiveAttendeeTypeSelections = [{
                                typeId: firstType.typeId,
                                quantity: editFormData.attendeeCount
                              }];
                              console.log('[Real-time Calc] ✅ Auto-initialized attendeeTypeSelections:', effectiveAttendeeTypeSelections);
                            } else {
                              console.log('[Real-time Calc] ❌ Cannot auto-initialize:', {
                                activeTypesLength: activeTypes.length,
                                attendeeCount: editFormData.attendeeCount
                              });
                            }
                          }

                          // Calculate event fee based on pricing type
                          if (eventData?.event?.useAttendeeTypePricing) {
                            // Attendee type pricing
                            if (effectiveAttendeeTypeSelections && effectiveAttendeeTypeSelections.length > 0 && eventData.event.attendeeTypes && eventData.event.attendeeTypes.length > 0) {
                              const attendeeTypes = eventData.event.attendeeTypes;
                              console.log('[Real-time Calc] Calculating with effectiveAttendeeTypeSelections:', effectiveAttendeeTypeSelections);

                              calculatedEventFee = effectiveAttendeeTypeSelections.reduce((sum, sel) => {
                                const type = attendeeTypes.find((t: any) => t.typeId === sel.typeId);
                                const lineTotal = type ? type.price * sel.quantity : 0;
                                console.log('[Real-time Calc] Line calculation:', {
                                  typeId: sel.typeId,
                                  quantity: sel.quantity,
                                  type: type,
                                  price: type?.price,
                                  lineTotal
                                });
                                return sum + lineTotal;
                              }, 0);
                              console.log('[Real-time Calc] ✅ Calculated eventFee:', calculatedEventFee);
                            } else {
                              // Fallback: If no attendee type selections, try to use stored eventFee
                              console.log('[Real-time Calc] ⚠️ Using fallback eventFee from database');
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

                          // Get discounts
                          let discountsTotal = 0;
                          try {
                            if (attendee?.registration?.discounts) {
                              const discounts = typeof attendee.registration.discounts === 'string'
                                ? JSON.parse(attendee.registration.discounts)
                                : attendee.registration.discounts;
                              if (Array.isArray(discounts)) {
                                discountsTotal = discounts.reduce((sum: number, d: any) => sum + (d?.calculatedAmount || 0), 0);
                              }
                            }
                          } catch (e) {
                            console.error('Error parsing discounts:', e);
                            discountsTotal = 0;
                          }

                          const calculatedTotal = Math.max(0, (calculatedEventFee || 0) + (calculatedRoomFee || 0) + (specialChargesTotal || 0) - (discountsTotal || 0));

                          // Debug logging for calculation values
                          console.log('[Real-time Calculation Debug]', {
                            registrationId: attendee?.registration?.registrationId,
                            attendeeCount: editFormData.attendeeCount,
                            calculatedEventFee,
                            calculatedRoomFee,
                            specialChargesTotal,
                            discountsTotal,
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
                                  <span className="font-semibold">{calculatedEventFee.toLocaleString()} บาท</span>
                                </div>
                                {/* ALWAYS show room fee line */}
                                <div className="flex justify-between">
                                  <span>ค่าห้องพัก:</span>
                                  <span className="font-semibold">{calculatedRoomFee.toLocaleString()} บาท</span>
                                </div>
                                {/* Only show special charges if > 0 */}
                                {specialChargesTotal > 0 && (
                                  <div className="flex justify-between">
                                    <span>ค่าใช้จ่ายเสริม:</span>
                                    <span className="font-semibold">+{specialChargesTotal.toLocaleString()} บาท</span>
                                  </div>
                                )}
                                {/* Only show discounts if > 0 */}
                                {discountsTotal > 0 && (
                                  <div className="flex justify-between text-green-700">
                                    <span>ส่วนลด:</span>
                                    <span className="font-semibold">-{discountsTotal.toLocaleString()} บาท</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-green-300 pt-1 mt-1">
                                  <span className="font-bold text-green-900">ยอดรวมทั้งหมด:</span>
                                  <span className="font-bold text-lg text-green-700">{calculatedTotal.toLocaleString()} บาท</span>
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
                    {(() => {
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
                                        +{charge.amount.toLocaleString()} บาท
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
                                      +{specialCharges.reduce((sum: number, c: any) => sum + c.amount, 0).toLocaleString()} บาท
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

                    {/* Discounts Section - Always visible, shown AFTER Special Charges */}
                    {(() => {
                      try {
                        const discounts = attendee.registration.discounts
                          ? JSON.parse(attendee.registration.discounts)
                          : [];

                        return (
                          <div className="p-3 bg-green-50 rounded-lg border border-green-200 mt-3">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-semibold text-green-900">ส่วนลด</span>
                              <button
                                onClick={() => handleOpenDiscountModal(attendee)}
                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                              >
                                + เพิ่มส่วนลด
                              </button>
                            </div>

                            {discounts.length > 0 ? (
                              <div className="space-y-2">
                                {discounts.map((discount: any) => (
                                  <div key={discount.discountId} className="flex items-start justify-between bg-white border border-green-200 rounded p-2">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-800">{discount.description}</p>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {discount.discountType === 'free' ? 'ฟรี (100%)' :
                                         discount.discountType === 'percentage' ? `${discount.value}%` :
                                         'ระบุจำนวน'}
                                        {' • '}เพิ่มเมื่อ: {formatThaiDateTime(discount.addedAt)}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                      <span className="text-sm font-bold text-green-700">
                                        -{discount.calculatedAmount.toLocaleString()} บาท
                                      </span>
                                      <button
                                        onClick={() => handleDeleteDiscount(attendee.registration.registrationId, discount.discountId)}
                                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                                        title="ลบส่วนลด"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <div className="pt-2 border-t border-green-200">
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="font-medium text-gray-600">รวมส่วนลด:</span>
                                    <span className="font-bold text-green-700">
                                      -{discounts.reduce((sum: number, d: any) => sum + d.calculatedAmount, 0).toLocaleString()} บาท
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500 italic">ไม่มีส่วนลด</p>
                            )}
                          </div>
                        );
                      } catch (e) {
                        console.error('Error parsing discounts:', e);
                        return null;
                      }
                    })()}

                    {/* Payment Status & Actions - Moved AFTER Special Charges */}
                    {/* ✅ Show payment section if has totalAmount OR base fees - handles discounted-to-free cases */}
                    {((attendee.registration.totalAmount ?? 0) > 0 ||
                      (attendee.registration.eventFee ?? 0) > 0 ||
                      (attendee.registration.roomFee ?? 0) > 0) && (
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
                              const additionalPaymentAmountPaid = (attendee.registration as any).additionalPaymentAmountPaid || 0;
                              // ✅ CRITICAL FIX: Include additionalPaymentAmountPaid
                              const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;
                              const additionalRequired = Math.max(0, totalAmount - paidAmount);
                              // ✅ Calculate overpayment (if paidAmount > totalAmount)
                              const overpayment = paidAmount > totalAmount ? paidAmount - totalAmount : 0;

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
                                    <span className="font-semibold">{totalAmount.toLocaleString()} บาท</span>
                                  </div>

                                  {/* Show paid amount if > 0 */}
                                  {paidAmount > 0 && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-gray-600">ยอดชำระแล้ว:</span>
                                      <span className="font-semibold text-blue-600">{paidAmount.toLocaleString()} บาท</span>
                                    </div>
                                  )}

                                  {/* Show outstanding if > 0 */}
                                  {additionalRequired > 0 && (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-orange-700 font-medium">คงเหลือยอดค้างชำระ:</span>
                                        <span className="font-semibold text-orange-600">{additionalRequired.toLocaleString()} บาท</span>
                                      </div>
                                      {/* Show deadline based on payment mode - BUILD b5edd69+ */}
                                      {(() => {
                                        console.log('[Deadline Check] additionalRequired:', additionalRequired);
                                        const depositMode = attendee.registration.depositAmount > 0;
                                        let deadline = '';

                                        if (depositMode) {
                                          // Deposit mode: show remaining deadline if deposit paid, otherwise deposit deadline
                                          deadline = attendee.registration.depositPaid
                                            ? attendee.registration.remainingDeadline
                                            : attendee.registration.depositDeadline;
                                        } else {
                                          // Full payment mode: show full payment deadline
                                          deadline = attendee.registration.fullPaymentDeadline || '';
                                        }

                                        // Debug log
                                        console.log('[Deadline Debug]', {
                                          registrationId: attendee.registration.registrationId,
                                          depositMode,
                                          depositPaid: attendee.registration.depositPaid,
                                          depositDeadline: attendee.registration.depositDeadline,
                                          remainingDeadline: attendee.registration.remainingDeadline,
                                          fullPaymentDeadline: attendee.registration.fullPaymentDeadline,
                                          selectedDeadline: deadline
                                        });

                                        if (deadline) {
                                          return (
                                            <div className="text-gray-500 text-xs mt-1 flex items-start justify-between gap-2">
                                              <div>
                                                กำหนดชำระ: {formatDeadline(deadline)}
                                                <br />
                                                <span className="text-orange-600">{getTimeRemaining(deadline)}</span>
                                              </div>
                                              <button
                                                onClick={() => handleOpenEditDeadlineModal(attendee)}
                                                className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors whitespace-nowrap"
                                                title="แก้ไขกำหนดชำระ"
                                              >
                                                ✏️ แก้ไข
                                              </button>
                                            </div>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </>
                                  )}

                                  {/* ✅ Show overpayment if > 0 (paidAmount > totalAmount) */}
                                  {overpayment > 0 && (
                                    <div className="flex items-center justify-between border-t border-blue-200 pt-2 mt-2">
                                      <span className="text-blue-700 font-medium">ชำระไว้เกิน:</span>
                                      <span className="font-semibold text-blue-600">{overpayment.toLocaleString()} บาท</span>
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
                                    <span className="font-semibold">{attendee.registration.depositAmount.toLocaleString()} บาท</span>
                                  </div>
                                  {attendee.registration.depositDeadline && (
                                    <div className="text-gray-500 text-xs flex items-start justify-between gap-2">
                                      <div>
                                        กำหนด: {formatDeadline(attendee.registration.depositDeadline)}
                                        <br />
                                        <span className="text-orange-600">{getTimeRemaining(attendee.registration.depositDeadline)}</span>
                                      </div>
                                      {!attendee.registration.depositPaid && (
                                        <button
                                          onClick={() => handleOpenEditDeadlineModal(attendee)}
                                          className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors whitespace-nowrap"
                                          title="แก้ไขกำหนดชำระ"
                                        >
                                          ✏️ แก้ไข
                                        </button>
                                      )}
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
                                      {!isCancelled && (!attendee.registration.remainingAmount || attendee.registration.remainingAmount === 0 || !attendee.registration.remainingSlipUrl) && (
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
                                      {!isCancelled && (
                                        <button
                                          onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                          className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                          title="ลบการลงทะเบียน"
                                        >
                                          ❌ ลบการลงทะเบียน
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Remaining Payment Section (show if deposit paid) */}
                                {attendee.registration.depositPaid && attendee.registration.remainingAmount > 0 && (
                                  <div className="border-t pt-2">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-gray-600 font-medium">ยอดคงเหลือ:</span>
                                      <span className="font-semibold text-orange-600">{attendee.registration.remainingAmount.toLocaleString()} บาท</span>
                                    </div>
                                    {attendee.registration.remainingDeadline && (
                                      <div className="text-gray-500 text-xs flex items-start justify-between gap-2">
                                        <div>
                                          กำหนด: {formatDeadline(attendee.registration.remainingDeadline)}
                                          <br />
                                          <span className="text-orange-600">{getTimeRemaining(attendee.registration.remainingDeadline)}</span>
                                        </div>
                                        {!attendee.registration.remainingPaid && (
                                          <button
                                            onClick={() => handleOpenEditDeadlineModal(attendee)}
                                            className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors whitespace-nowrap"
                                            title="แก้ไขกำหนดชำระ"
                                          >
                                            ✏️ แก้ไข
                                          </button>
                                        )}
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
                                                <span className="font-semibold text-gray-900">{attendee.registration.totalAmount.toLocaleString()} บาท</span>
                                              </div>
                                              {(() => {
                                                // ✅ Calculate paidAmount from actual payment fields only (don't use paidAmount as it's not reliable)
                                                const fullPaymentAmountPaid = (attendee.registration as any).fullPaymentAmountPaid || 0;
                                                const depositAmountPaid = (attendee.registration as any).depositAmountPaid || 0;
                                                const remainingAmountPaid = (attendee.registration as any).remainingAmountPaid || 0;
                                                const additionalPaymentAmountPaid = (attendee.registration as any).additionalPaymentAmountPaid || 0;
                                                // ✅ CRITICAL FIX: Include additionalPaymentAmountPaid
                                                const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;
                                                const additionalRequired = getAdditionalAmount(attendee, eventData.event.paymentMode || 'deposit');
                                                return (
                                                  <>
                                                    <div className="flex items-center justify-between border-t border-blue-200 pt-1">
                                                      <span className="text-gray-700">ยอดชำระแล้ว:</span>
                                                      <span className="font-semibold text-blue-600">{paidAmount.toLocaleString()} บาท</span>
                                                    </div>
                                                    <div className="flex items-center justify-between border-t border-blue-200 pt-1">
                                                      <span className="text-orange-700 font-medium">ยอดชำระเพิ่ม:</span>
                                                      <span className="font-semibold text-orange-600">{additionalRequired.toLocaleString()} บาท</span>
                                                    </div>
                                                    {/* Show deadline for additional payment */}
                                                    {(() => {
                                                      // Additional payment uses remaining deadline (as it's after deposit is paid)
                                                      const deadline = attendee.registration.remainingDeadline || attendee.registration.fullPaymentDeadline || '';
                                                      if (deadline) {
                                                        return (
                                                          <div className="border-t border-blue-200 pt-1">
                                                            <div className="text-gray-600 text-xs">
                                                              กำหนดชำระ: {formatDeadline(deadline)}
                                                            </div>
                                                            <div className="text-orange-600 text-xs">
                                                              {getTimeRemaining(deadline)}
                                                            </div>
                                                          </div>
                                                        );
                                                      }
                                                      return null;
                                                    })()}
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
                                              {!isCancelled && (
                                                <button
                                                  onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                                  className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                                  title="ลบการลงทะเบียน"
                                                >
                                                  ❌ ลบการลงทะเบียน
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ) : !isCancelled ? (
                                          <button
                                            onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                            className="w-full px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                            title="ลบการลงทะเบียน"
                                          >
                                            ❌ ลบการลงทะเบียน
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <div className="mt-2 flex gap-2">
                                        <button
                                          onClick={() => handleOpenPaymentModal(attendee, 'remaining')}
                                          className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                        >
                                          📤 อัพโหลดสลิป
                                        </button>
                                        {!isCancelled && (
                                          <button
                                            onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                            className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                            title="ลบการลงทะเบียน"
                                          >
                                            ❌ ลบการลงทะเบียน
                                          </button>
                                        )}
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
                                  const additionalPaymentAmountPaid = (attendee.registration as any).additionalPaymentAmountPaid || 0;
                                  // ✅ CRITICAL FIX: Include additionalPaymentAmountPaid
                                  const paidAmount = fullPaymentAmountPaid + depositAmountPaid + remainingAmountPaid + additionalPaymentAmountPaid;
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
                                              <span className="font-semibold text-gray-900">{totalAmount.toLocaleString()} บาท</span>
                                            </div>
                                            <div className="flex items-center justify-between border-t border-blue-200 pt-1">
                                              <span className="text-gray-700">ยอดชำระแล้ว:</span>
                                              <span className="font-semibold text-blue-600">{paidAmount.toLocaleString()} บาท</span>
                                            </div>
                                            {additionalRequired > 0 && (
                                              <div className="flex items-center justify-between border-t border-blue-200 pt-1">
                                                <span className="text-orange-700 font-medium">ยอดชำระเพิ่ม:</span>
                                                <span className="font-semibold text-orange-600">{additionalRequired.toLocaleString()} บาท</span>
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
                                              {!isCancelled && (
                                                <button
                                                  onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                                  className="w-full px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                                  title="ลบการลงทะเบียน"
                                                >
                                                  ❌ ลบการลงทะเบียน
                                                </button>
                                              )}
                                            </>
                                          ) : (
                                            <>
                                              <div className="flex items-center gap-2 text-orange-600">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                ต้องชำระเงินเพิ่มเติม {additionalRequired.toLocaleString()} บาท
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
                                                {!isCancelled && (
                                                  <button
                                                    onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                                    className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                                    title="ลบการลงทะเบียน"
                                                  >
                                                    ❌ ลบการลงทะเบียน
                                                  </button>
                                                )}
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
                                          {!isCancelled && (
                                            <button
                                              onClick={() => handleOpenCancellationModal(attendee.registration.registrationId)}
                                              className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                                              title="ลบการลงทะเบียน"
                                            >
                                              ❌ ลบการลงทะเบียน
                                            </button>
                                          )}
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
                            key={`payment-history-${attendee.registration.registrationId}-${paymentDetailsRefreshKey}`}
                            registrationId={attendee.registration.registrationId}
                            onUpdate={() => fetchEventData()}
                          />
                        </div>
                      )}

                    {/* Delete button for free events (no payment required) */}
                    {!isCancelled && (!attendee.registration.totalAmount || attendee.registration.totalAmount === 0) && (
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

                    {/* Refund Information Section (for cancelled registrations) */}
                    {isCancelled && (attendee.registration as any).refundAmount !== undefined && (attendee.registration as any).refundAmount > 0 && (
                      <div className="mt-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                          <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          ข้อมูลการคืนเงิน
                        </h4>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">ยอดคืนเงิน:</span>
                            <span className="font-semibold text-green-600">{((attendee.registration as any).refundAmount || 0).toLocaleString()} บาท</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="text-gray-600">สถานะ:</span>
                            <span className={`font-medium ${
                              (attendee.registration as any).refundStatus === 'completed' ? 'text-green-600' :
                              (attendee.registration as any).refundStatus === 'processing' ? 'text-blue-600' :
                              'text-orange-600'
                            }`}>
                              {(attendee.registration as any).refundStatus === 'completed' ? 'คืนเงินแล้ว' :
                               (attendee.registration as any).refundStatus === 'processing' ? 'กำลังดำเนินการ' :
                               'รอดำเนินการ'}
                            </span>
                          </div>

                          {(attendee.registration as any).cancelledAt && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">ยกเลิกเมื่อ:</span>
                              <span className="text-gray-900">{formatThaiDateTime((attendee.registration as any).cancelledAt)}</span>
                            </div>
                          )}

                          {(attendee.registration as any).cancellationReason && (
                            <div className="pt-2 border-t border-yellow-200">
                              <span className="text-gray-600">เหตุผล:</span>
                              <p className="text-gray-900 mt-1">{(attendee.registration as any).cancellationReason}</p>
                            </div>
                          )}
                        </div>

                        {/* Refund Upload Button - Show if not completed */}
                        {(attendee.registration as any).refundStatus !== 'completed' && (
                          <div className="mt-3 pt-3 border-t border-yellow-200">
                            <button
                              onClick={() => handleOpenPaymentModal(attendee, 'refund')}
                              className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              อัพโหลดสลิปคืนเงิน
                            </button>
                            <p className="text-xs text-gray-600 mt-2 text-center">
                              อัพโหลดสลิปการโอนเงินคืนให้ลูกค้า
                            </p>
                          </div>
                        )}

                        {/* Show Payment History link */}
                        <div className="mt-3 pt-3 border-t border-yellow-200">
                          <button
                            onClick={() => handleOpenPaymentDetailsModal(attendee)}
                            className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            ดูประวัติการชำระเงินและการคืนเงิน
                          </button>
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4">
            <h2 className="text-lg font-bold text-gray-900 mb-3">
              อัพโหลดสลิปการชำระเงิน
            </h2>

            <div className="space-y-3">
              {/* Payment Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ประเภทการชำระเงิน *
                </label>
                {loadingAdminSlips ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-xs text-gray-500 mt-2">กำลังตรวจสอบประวัติการชำระเงิน...</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {(() => {
                        const available = getAdminAvailablePaymentTypes();
                        return (
                          <>
                            <label className={`flex items-center gap-2 p-2 border rounded ${
                              available.canUploadDeposit ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50 cursor-not-allowed bg-gray-50'
                            }`}>
                              <input
                                type="radio"
                                value="deposit"
                                checked={paymentFormData.paymentType === 'deposit'}
                                onChange={(e) => {
                                  const newType = e.target.value as 'deposit' | 'remaining' | 'full' | 'refund' | 'additional';
                                  setPaymentFormData({
                                    ...paymentFormData,
                                    paymentType: newType,
                                    amount: getAdminSuggestedAmount(newType)
                                  });
                                }}
                                disabled={!available.canUploadDeposit}
                                className="w-4 h-4 text-blue-600"
                              />
                              <span className="text-sm">ชำระมัดจำ (งวดที่ 1)</span>
                              {available.hasWarnings.deposit && (
                                <span className="text-xs text-amber-600 ml-auto">⚠️ มีสลิปอยู่แล้ว</span>
                              )}
                            </label>
                            <label className={`flex items-center gap-2 p-2 border rounded ${
                              available.canUploadRemaining ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50 cursor-not-allowed bg-gray-50'
                            }`}>
                              <input
                                type="radio"
                                value="remaining"
                                checked={paymentFormData.paymentType === 'remaining'}
                                onChange={(e) => {
                                  const newType = e.target.value as 'deposit' | 'remaining' | 'full' | 'refund' | 'additional';
                                  setPaymentFormData({
                                    ...paymentFormData,
                                    paymentType: newType,
                                    amount: getAdminSuggestedAmount(newType)
                                  });
                                }}
                                disabled={!available.canUploadRemaining}
                                className="w-4 h-4 text-blue-600"
                              />
                              <span className="text-sm">ชำระยอดที่เหลือ (งวดที่ 2)</span>
                              {available.hasWarnings.remaining && (
                                <span className="text-xs text-amber-600 ml-auto">⚠️ มีสลิปอยู่แล้ว</span>
                              )}
                            </label>
                            <label className={`flex items-center gap-2 p-2 border rounded ${
                              available.canUploadFull ? 'cursor-pointer hover:bg-gray-50' : 'opacity-50 cursor-not-allowed bg-gray-50'
                            }`}>
                              <input
                                type="radio"
                                value="full"
                                checked={paymentFormData.paymentType === 'full'}
                                onChange={(e) => {
                                  const newType = e.target.value as 'deposit' | 'remaining' | 'full' | 'refund' | 'additional';
                                  setPaymentFormData({
                                    ...paymentFormData,
                                    paymentType: newType,
                                    amount: getAdminSuggestedAmount(newType)
                                  });
                                }}
                                disabled={!available.canUploadFull}
                                className="w-4 h-4 text-blue-600"
                              />
                              <span className="text-sm font-semibold text-green-700">ชำระเต็มจำนวน (ทั้งหมด)</span>
                              {available.hasWarnings.full && (
                                <span className="text-xs text-amber-600 ml-auto">⚠️ มีสลิปอยู่แล้ว</span>
                              )}
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer p-2 border border-purple-300 rounded hover:bg-purple-50">
                              <input
                                type="radio"
                                value="additional"
                                checked={paymentFormData.paymentType === 'additional'}
                                onChange={(e) => {
                                  const newType = e.target.value as 'deposit' | 'remaining' | 'full' | 'refund' | 'additional';
                                  setPaymentFormData({
                                    ...paymentFormData,
                                    paymentType: newType,
                                    amount: 0 // Additional always starts at 0
                                  });
                                }}
                                className="w-4 h-4 text-purple-600"
                              />
                              <span className="text-sm font-semibold text-purple-700">💰 ค่าใช้จ่ายเพิ่มเติม</span>
                            </label>
                            <label className={`flex items-center gap-2 p-2 border border-red-300 rounded ${
                              available.canUploadRefund ? 'cursor-pointer hover:bg-red-50' : 'opacity-50 cursor-not-allowed bg-gray-50'
                            }`}>
                              <input
                                type="radio"
                                value="refund"
                                checked={paymentFormData.paymentType === 'refund'}
                                onChange={(e) => {
                                  const newType = e.target.value as 'deposit' | 'remaining' | 'full' | 'refund' | 'additional';
                                  setPaymentFormData({
                                    ...paymentFormData,
                                    paymentType: newType,
                                    amount: getAdminSuggestedAmount(newType)
                                  });
                                }}
                                disabled={!available.canUploadRefund}
                                className="w-4 h-4 text-red-600"
                              />
                              <span className="text-sm font-semibold text-red-700">💸 โอนเงินคืน (Refund)</span>
                              {!available.canUploadRefund && (
                                <span className="text-xs text-red-600 ml-auto">
                                  ❌ {available.refundReason || 'มีสลิปรออนุมัติ'}
                                </span>
                              )}
                            </label>
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      หมายเหตุ: การอัพโหลดสลิปประเภทเดิมซ้ำจะถูกตรวจสอบที่ฝั่ง server และอาจถูกปฏิเสธ
                    </p>
                  </>
                )}
              </div>

              {/* Amount and Date in same row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Amount Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    จำนวนเงิน (บาท) *
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
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                    required
                  />
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    วันที่ชำระ *
                  </label>
                  <input
                    type="date"
                    value={paymentFormData.paidDate}
                    onChange={(e) => setPaymentFormData({ ...paymentFormData, paidDate: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Slip Upload Options */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  📎 สลิปการโอนเงิน
                </label>

                {/* File Upload Option - Compact */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 hover:border-blue-400 transition-colors">
                  <label className="cursor-pointer block">
                    <div className="flex items-center gap-3">
                      {paymentFormData.slipFile ? (
                        <>
                          <div className="text-green-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{paymentFormData.slipFile.name}</p>
                            <p className="text-xs text-gray-500">
                              {(paymentFormData.slipFile.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setPaymentFormData({ ...paymentFormData, slipFile: null });
                            }}
                            className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                          >
                            ลบ
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="text-gray-400">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-700">คลิกเพื่ออัพโหลดไฟล์</p>
                            <p className="text-xs text-gray-500">JPG, PNG, PDF (สูงสุด 5MB)</p>
                          </div>
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

                {paymentFormData.uploadingFile && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-2 flex items-center gap-2 mt-2">
                    <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-xs text-blue-800">กำลังอัพโหลดไฟล์...</span>
                  </div>
                )}
              </div>

              {/* Note - Compact */}
              <div className="bg-blue-50 border border-blue-200 rounded p-2">
                <p className="text-xs text-blue-800">
                  <strong>หมายเหตุ:</strong> การกดยืนยันจะบันทึกการชำระเงินลงในระบบและอัพเดทสถานะอัตโนมัติ
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

      {/* Approval Confirmation Modal - After Upload */}
      {approvalConfirmModalOpen && uploadedSlipData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              อัพโหลดสลิปสำเร็จ
            </h2>

            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                สลิปการชำระเงินได้ถูกอัพโหลดเรียบร้อยแล้ว<br />
                คุณต้องการดำเนินการอย่างไร?
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-sm text-gray-700">
                  <div className="flex justify-between mb-1">
                    <span className="font-medium">ประเภท:</span>
                    <span>{uploadedSlipData.paymentType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">จำนวนเงิน:</span>
                    <span>{uploadedSlipData.amount.toLocaleString()} บาท</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleApproveImmediately}
                  disabled={processingApprovalChoice}
                  className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {processingApprovalChoice ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>กำลังดำเนินการ...</span>
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      <span>อนุมัติทันที</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleKeepPending}
                  disabled={processingApprovalChoice}
                  className="w-full px-4 py-3 bg-yellow-600 text-white font-medium rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>⏳</span>
                  <span>รอตรวจสอบ</span>
                </button>

                <button
                  onClick={handleCancelUpload}
                  disabled={processingApprovalChoice}
                  className="w-full px-4 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {processingApprovalChoice ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>กำลังยกเลิก...</span>
                    </>
                  ) : (
                    <>
                      <span>✗</span>
                      <span>ยกเลิกการอัพโหลด</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                <strong>คำอธิบาย:</strong><br />
                • <strong>อนุมัติทันที</strong>: อนุมัติสลิปและอัพเดทสถานะการชำระเงินทันที<br />
                • <strong>รอตรวจสอบ</strong>: สลิปจะอยู่ในสถานะรอตรวจสอบ สามารถอนุมัติทีหลังได้<br />
                • <strong>ยกเลิก</strong>: ลบสลิปที่อัพโหลดออกจากระบบ
              </p>
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

      {/* Discounts Modal */}
      {discountsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              เพิ่มส่วนลด
            </h2>

            <form onSubmit={handleAddDiscount} className="space-y-4">
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายละเอียดส่วนลด
                </label>
                <input
                  type="text"
                  value={discountFormData.description}
                  onChange={(e) => setDiscountFormData({ ...discountFormData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="เช่น ส่วนลดสมาชิกพิเศษ, Early Bird"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  ระบุรายละเอียดของส่วนลด
                </p>
              </div>

              {/* Discount Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ประเภทส่วนลด
                </label>
                <select
                  value={discountFormData.discountType}
                  onChange={(e) => setDiscountFormData({
                    ...discountFormData,
                    discountType: e.target.value as 'fixed' | 'percentage' | 'free',
                    value: e.target.value === 'free' ? 0 : discountFormData.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="fixed">ระบุจำนวนเงิน (บาท)</option>
                  <option value="percentage">เปอร์เซ็นต์ (%)</option>
                  <option value="free">ฟรี (ไม่ต้องชำระเลย)</option>
                </select>
              </div>

              {/* Value (only for fixed and percentage) */}
              {discountFormData.discountType !== 'free' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {discountFormData.discountType === 'percentage' ? 'เปอร์เซ็นต์ (%)' : 'จำนวนเงิน (บาท)'}
                  </label>
                  <input
                    type="number"
                    value={discountFormData.value}
                    onChange={(e) => setDiscountFormData({ ...discountFormData, value: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder={discountFormData.discountType === 'percentage' ? '0-100' : '0'}
                    min="0"
                    max={discountFormData.discountType === 'percentage' ? '100' : undefined}
                    step={discountFormData.discountType === 'percentage' ? '1' : '0.01'}
                    required
                  />
                </div>
              )}

              {/* Note */}
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <p className="text-sm text-green-800">
                  <strong>หมายเหตุ:</strong> ส่วนลดจะถูกหักออกจากยอดรวมทั้งหมด (Event Fee + Room Fee + Special Charges)
                  {discountFormData.discountType === 'free' && (
                    <span className="block mt-1 font-semibold">
                      ส่วนลดแบบฟรีจะทำให้ยอดชำระเป็น 0 บาท
                    </span>
                  )}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={addingDiscount}
                  className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {addingDiscount ? 'กำลังเพิ่ม...' : 'เพิ่มส่วนลด'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseDiscountModal}
                  disabled={addingDiscount}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
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
              : actionMessage.type === 'warning'
              ? 'bg-yellow-600 text-white'
              : 'bg-red-600 text-white'
          }`}>
            {actionMessage.type === 'success' ? (
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : actionMessage.type === 'warning' ? (
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
          key={paymentDetailsRefreshKey}
          registrationId={selectedRegistrationForPayment.registrationId}
          totalAmount={selectedRegistrationForPayment.totalAmount}
          companyName={selectedRegistrationForPayment.companyName}
          contactName={selectedRegistrationForPayment.contactName}
          onClose={handleClosePaymentDetailsModal}
          onUpdate={handlePaymentDetailsUpdate}
        />
      )}

      {/* Message Template Modal */}
      {messageTemplateModalOpen && eventData && (
        <MessageTemplateModal
          isOpen={messageTemplateModalOpen}
          onClose={() => {
            setMessageTemplateModalOpen(false);
            setSelectedRegistrationsForMessage(new Set()); // Clear selection after sending
            setCarpoolsDataForMessages({}); // Clear carpool data
            setPartyTablesDataForMessages({}); // Clear party tables data
          }}
          selectedRegistrations={
            filteredAttendees
              .filter(a => selectedRegistrationsForMessage.has(a.registration.registrationId))
              .map(a => ({
                registration: a.registration as any, // Cast to EventRegistration type
                lineUserId: a.registration.lineUserId,
              }))
          }
          event={eventData.event as any} // Cast to Event type
          carpoolsData={carpoolsDataForMessages}
          partyTablesData={partyTablesDataForMessages}
          rooms={allRooms} // Pass rooms data for Felix parking lookup
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
                  {paymentWarningModal.totalPaid.toLocaleString()} บาท
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  <strong>หากยืนยันลบ:</strong>
                </p>
                <ul className="list-disc list-inside text-sm text-red-700 mt-2 space-y-1">
                  <li>ระบบจะไม่คำนวณยอดเงิน {paymentWarningModal.totalPaid.toLocaleString()} บาท นี้ในยอดรับรวม</li>
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

      {/* Room Management Modal */}
      <RoomManagementModal
        isOpen={showRoomManagementModal}
        onClose={() => setShowRoomManagementModal(false)}
        eventId={eventId as string}
        eventName={eventData?.event?.eventName || ''}
        onRoomUpdate={fetchAllRooms}
      />

      {/* Carpool Management Modal */}
      <CarpoolManagementModal
        isOpen={showCarpoolManagementModal}
        onClose={() => setShowCarpoolManagementModal(false)}
        eventId={eventId as string}
        eventName={eventData?.event?.eventName || ''}
        carpoolSettings={eventData?.event?.carpoolSettings}
        onSettingsUpdate={fetchEventData}
      />

      {/* Party Table Management Modal */}
      <PartyTableManagementModal
        isOpen={showPartyTableManagementModal}
        onClose={() => setShowPartyTableManagementModal(false)}
        eventId={eventId as string}
        eventName={eventData?.event?.eventName || ''}
        partyTableSettings={eventData?.event?.partyTableSettings}
        onSettingsUpdate={fetchEventData}
      />

      {/* Event Summary QR Code Modal */}
      <EventSummaryQRModal
        isOpen={showEventSummaryQRModal}
        onClose={() => setShowEventSummaryQRModal(false)}
        eventId={eventId as string}
      />

      {/* Car Number Assignment Modal */}
      <CarNumberAssignmentModal
        isOpen={showCarNumberAssignmentModal}
        onClose={() => setShowCarNumberAssignmentModal(false)}
        eventId={eventId as string}
        eventName={eventData?.event?.eventName || ''}
      />

      {/* Admin Cancellation Modal (NEW) */}
      {showAdminCancellationModal && selectedRegistrationForCancellation && selectedEventForCancellation && (
        <AdminCancellationModal
          isOpen={showAdminCancellationModal}
          onClose={() => {
            setShowAdminCancellationModal(false);
            setSelectedRegistrationForCancellation(null);
            setSelectedEventForCancellation(null);
          }}
          registration={selectedRegistrationForCancellation}
          event={selectedEventForCancellation}
          onSuccess={() => {
            setShowAdminCancellationModal(false);
            setSelectedRegistrationForCancellation(null);
            setSelectedEventForCancellation(null);
            fetchEventData(); // Refresh data
            setActionMessage({ type: 'success', text: 'ยกเลิกการจองสำเร็จ' });
          }}
        />
      )}

      {/* Edit Deadline Modal */}
      {editDeadlineModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">✏️ แก้ไขกำหนดชำระเงิน</h2>
              <button
                onClick={handleCloseEditDeadlineModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Current Deadline Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 mb-1">
                  <strong>ประเภท:</strong> {
                    editDeadlineFormData.deadlineType === 'full' ? 'ชำระเต็มจำนวน' :
                    editDeadlineFormData.deadlineType === 'deposit' ? 'มัดจำ' :
                    'ยอดคงเหลือ'
                  }
                </p>
                <p className="text-sm text-blue-900">
                  <strong>กำหนดปัจจุบัน:</strong> {formatDeadline(editDeadlineFormData.currentDeadline)}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  {getTimeRemaining(editDeadlineFormData.currentDeadline)}
                </p>
              </div>

              {/* Update Method Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  วิธีการตั้งกำหนดใหม่
                </label>
                <div className="space-y-2">
                  <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      value="hours"
                      checked={editDeadlineFormData.updateMethod === 'hours'}
                      onChange={(e) => setEditDeadlineFormData({ ...editDeadlineFormData, updateMethod: e.target.value as 'hours' | 'fixed' })}
                      className="mr-3"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">⏰ เพิ่มจำนวนชั่วโมง</div>
                      <div className="text-xs text-gray-500">นับจากเวลาปัจจุบัน</div>
                    </div>
                  </label>
                  <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      value="fixed"
                      checked={editDeadlineFormData.updateMethod === 'fixed'}
                      onChange={(e) => setEditDeadlineFormData({ ...editDeadlineFormData, updateMethod: e.target.value as 'hours' | 'fixed' })}
                      className="mr-3"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">📅 กำหนดวันตายตัว</div>
                      <div className="text-xs text-gray-500">สิ้นวัน 23:59 ของวันที่เลือก</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Hours Input (if method is hours) */}
              {editDeadlineFormData.updateMethod === 'hours' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    จำนวนชั่วโมงที่ต้องการเพิ่ม
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={editDeadlineFormData.hoursToAdd}
                    onChange={(e) => setEditDeadlineFormData({ ...editDeadlineFormData, hoursToAdd: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="เช่น 24, 48, 72"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    กำหนดใหม่จะเป็น: {new Date(Date.now() + editDeadlineFormData.hoursToAdd * 60 * 60 * 1000).toLocaleString('th-TH')}
                  </p>
                </div>
              )}

              {/* Date Input (if method is fixed) */}
              {editDeadlineFormData.updateMethod === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    เลือกวันที่กำหนด
                  </label>
                  <input
                    type="date"
                    value={editDeadlineFormData.fixedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setEditDeadlineFormData({ ...editDeadlineFormData, fixedDate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    กำหนดใหม่จะเป็น: {new Date(editDeadlineFormData.fixedDate + 'T23:59:59').toLocaleString('th-TH')}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseEditDeadlineModal}
                disabled={updatingDeadline}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveDeadline}
                disabled={updatingDeadline}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {updatingDeadline ? 'กำลังบันทึก...' : '💾 บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification for Copy Registration ID */}
      {showCopyToast && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">คัดลอกรหัสการจองแล้ว: {copiedRegistrationId}</span>
          </div>
        </div>
      )}

      {/* Carpool Detail Modal */}
      {selectedCarpoolRegistration && (
        <CarpoolDetailModal
          isOpen={showCarpoolDetailModal}
          onClose={() => {
            setShowCarpoolDetailModal(false);
            setSelectedCarpoolRegistration(null);
          }}
          eventId={eventId as string}
          registrationId={selectedCarpoolRegistration.registrationId}
          contactName={selectedCarpoolRegistration.contactName}
        />
      )}
    </div>
  );
}

// Component: Room Number with Tooltip
function RoomNumberWithTooltip({
  roomId,
  eventId,
  currentAttendeeIndex,
  currentRegistrationId,
  allAttendees,
  allRooms,
}: {
  roomId: string;
  eventId: string;
  currentAttendeeIndex: number;
  currentRegistrationId: string;
  allAttendees: Attendee[];
  allRooms: Array<{
    roomId: string;
    buildingName: string;
    roomNumber: string;
    roomTypeCategory?: string;
    maxOccupancy: number;
    isLocked?: boolean;
  }>;
}) {
  const [room, setRoom] = useState<any>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [roommates, setRoommates] = useState<Array<{
    name: string;
    companyName: string;
    registrationId: string;
  }>>([]);

  useEffect(() => {
    fetchRoomAndRoommates();
  }, [roomId, allAttendees, allRooms]);

  const fetchRoomAndRoommates = async () => {
    try {
      // ✅ OPTIMIZED: Use allRooms prop instead of fetching
      const foundRoom = allRooms.find((r: any) => r.roomId === roomId);
      if (foundRoom) {
        setRoom(foundRoom);
      }

      // Find all roommates (people in the same room)
      const roommatesList: Array<{
        name: string;
        companyName: string;
        registrationId: string;
      }> = [];

      allAttendees.forEach(attendee => {
        let roomAssignments: Array<{ roomId: string; attendeeIndex: number }> = [];
        try {
          if ((attendee.registration as any).roomAssignments) {
            roomAssignments = JSON.parse((attendee.registration as any).roomAssignments);
          }
        } catch (e) {
          console.error('Error parsing roomAssignments:', e);
        }

        // Parse attendee names properly
        const names = parseAttendeeNames(attendee.registration.attendeeNames);

        roomAssignments.forEach(assignment => {
          if (assignment.roomId === roomId) {
            // Skip current attendee
            if (assignment.attendeeIndex === currentAttendeeIndex &&
                attendee.registration.registrationId === currentRegistrationId) {
              return;
            }

            roommatesList.push({
              name: names[assignment.attendeeIndex] || `ผู้เข้าร่วมคนที่ ${assignment.attendeeIndex + 1}`,
              companyName: attendee.registration.companyName,
              registrationId: attendee.registration.registrationId,
            });
          }
        });
      });

      setRoommates(roommatesList);
    } catch (error) {
      console.error('Error fetching room details:', error);
    }
  };

  const handleCopyRegistrationId = (registrationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(registrationId);
  };

  if (!room) {
    return <span className="text-xs text-gray-400">กำลังโหลด...</span>;
  }

  const roomNumber = `${room.buildingName} ${room.roomNumber}`;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        className="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors"
      >
        {roomNumber}
      </button>

      {/* Tooltip */}
      {showTooltip && roommates.length > 0 && (
        <div className="absolute z-50 right-0 mt-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900">ผู้พักร่วมห้อง</h4>
            <button
              onClick={() => setShowTooltip(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {roommates.map((roommate, idx) => (
              <div key={idx} className="text-sm border-b border-gray-100 pb-2 last:border-0">
                <p className="font-medium text-gray-900">{roommate.name}</p>
                <p className="text-xs text-gray-600">{roommate.companyName}</p>
                <div className="flex items-center gap-1 mt-1">
                  <p className="text-xs text-gray-500">
                    รหัส: {roommate.registrationId.slice(0, 8)}
                  </p>
                  <button
                    onClick={(e) => handleCopyRegistrationId(roommate.registrationId, e)}
                    className="text-gray-400 hover:text-indigo-600"
                    title="คัดลอกรหัสการจอง"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
