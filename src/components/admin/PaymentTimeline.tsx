'use client';

import { useState } from 'react';
import Image from 'next/image';

export interface PaymentSlip {
  slipId: string;
  registrationId: string;
  eventId: string;
  amount: number;
  paymentType: 'full' | 'deposit' | 'remaining' | 'additional';
  description?: string;
  slipUrl: string;
  uploadedAt: string;
  uploadedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

interface PaymentTimelineProps {
  slips: PaymentSlip[];
  onApprove?: (slipId: string, notes?: string) => Promise<void>;
  onReject?: (slipId: string, reason: string, notes?: string) => Promise<void>;
  readonly?: boolean;
}

const PaymentTypeLabels: Record<PaymentSlip['paymentType'], string> = {
  full: 'ชำระเต็มจำนวน',
  deposit: 'ชำระมัดจำ',
  remaining: 'ชำระยอดคงเหลือ',
  additional: 'ชำระเพิ่มเติม',
};

const StatusBadges: Record<PaymentSlip['status'], { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'รอตรวจสอบ' },
  approved: { bg: 'bg-green-100', text: 'text-green-800', label: 'อนุมัติแล้ว' },
  rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'ปฏิเสธ' },
};

export default function PaymentTimeline({ slips, onApprove, onReject, readonly = false }: PaymentTimelineProps) {
  const [selectedSlip, setSelectedSlip] = useState<PaymentSlip | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async (slip: PaymentSlip) => {
    if (!onApprove || readonly) return;

    setIsLoading(true);
    try {
      await onApprove(slip.slipId, adminNotes || undefined);
      setAdminNotes('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!onReject || !selectedSlip || readonly) return;

    if (!rejectReason.trim()) {
      alert('กรุณาระบุเหตุผลในการปฏิเสธ');
      return;
    }

    setIsLoading(true);
    try {
      await onReject(selectedSlip.slipId, rejectReason, adminNotes || undefined);
      setShowRejectModal(false);
      setSelectedSlip(null);
      setRejectReason('');
      setAdminNotes('');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (slips.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center">
        <p className="text-gray-500">ยังไม่มีการอัพโหลดสลิปการชำระเงิน</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">ประวัติการชำระเงิน</h3>

      <div className="space-y-3">
        {slips.map((slip, index) => {
          const statusBadge = StatusBadges[slip.status];

          return (
            <div
              key={slip.slipId}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-gray-900">
                      {index + 1}. {PaymentTypeLabels[slip.paymentType]}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                      {statusBadge.label}
                    </span>
                  </div>

                  <div className="space-y-1 text-sm text-gray-600">
                    <p>จำนวนเงิน: <span className="font-semibold text-gray-900">{slip.amount.toLocaleString()} บาท</span></p>
                    <p>อัพโหลดเมื่อ: {formatDate(slip.uploadedAt)}</p>
                    {slip.description && <p>หมายเหตุ: {slip.description}</p>}
                    {slip.reviewedAt && (
                      <p className="text-gray-500">
                        ตรวจสอบเมื่อ: {formatDate(slip.reviewedAt)}
                      </p>
                    )}
                    {slip.rejectionReason && (
                      <p className="text-red-600 mt-2">
                        <span className="font-semibold">เหตุผลที่ปฏิเสธ:</span> {slip.rejectionReason}
                      </p>
                    )}
                    {slip.adminNotes && (
                      <p className="text-gray-700 mt-2 bg-gray-50 p-2 rounded">
                        <span className="font-semibold">บันทึกของ Admin:</span> {slip.adminNotes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <button
                    onClick={() => {
                      setSelectedSlip(slip);
                      setShowImageModal(true);
                    }}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    ดูสลิป
                  </button>

                  {slip.status === 'pending' && !readonly && (
                    <>
                      <button
                        onClick={() => handleApprove(slip)}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        อนุมัติ
                      </button>
                      <button
                        onClick={() => {
                          setSelectedSlip(slip);
                          setShowRejectModal(true);
                        }}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        ปฏิเสธ
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Image Modal */}
      {showImageModal && selectedSlip && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setShowImageModal(false)}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full h-full flex flex-col">
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-100 z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <Image
                src={selectedSlip.slipUrl}
                alt="Payment Slip"
                width={1000}
                height={1000}
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="text-center mt-4">
              <p className="text-sm text-white text-opacity-70">คลิกที่พื้นหลังเพื่อปิด</p>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedSlip && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowRejectModal(false);
            setRejectReason('');
            setAdminNotes('');
          }}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              ปฏิเสธสลิป - {PaymentTypeLabels[selectedSlip.paymentType]}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เหตุผลในการปฏิเสธ <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  rows={3}
                  placeholder="เช่น สลิปไม่ชัดเจน, จำนวนเงินไม่ตรง"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  บันทึกเพิ่มเติม (ไม่บังคับ)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="บันทึกภายในสำหรับ admin"
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason('');
                    setAdminNotes('');
                  }}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleReject}
                  disabled={isLoading || !rejectReason.trim()}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
