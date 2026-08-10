'use client';

import { useState, useEffect } from 'react';
import { Event, EventRegistration, calculateRefundAmount } from '@/types/event';

// Flexible registration type that works with both EventRegistration and UserRegistration
type CancellationRegistration = Pick<EventRegistration, 'registrationId'> & {
  paidAmount?: number;
  totalAmount?: number;
  attendeeCount?: number;
  carpoolId?: string;
  roomAssignments?: string;
};

interface CancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  registration: CancellationRegistration;
  event: Event;
  onSuccess: () => void;
}

export default function CancellationModal({
  isOpen,
  onClose,
  registration,
  event,
  onSuccess
}: CancellationModalProps) {
  const [cancellationReason, setCancellationReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundCalculation, setRefundCalculation] = useState<ReturnType<typeof calculateRefundAmount> | null>(null);

  // Calculate refund when modal opens
  useEffect(() => {
    if (isOpen) {
      // Create a minimal EventRegistration object for refund calculation
      const registrationForCalculation = {
        ...registration,
        // Add required fields that calculateRefundAmount doesn't actually use
        registrationDate: new Date().toISOString(),
        eventId: event.eventId,
        companyName: '',
        licenseNumber: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        lineUserId: '',
        memberId: '',
        hasClubRep: false,
        lineRepName: '',
        attendeeCount: registration.attendeeCount || 1,
        attendeeNames: '',
        shirtCount: 0,
        shirtSizes: '',
        shirtReceived: false,
        eventFee: 0,
        shirtFee: 0,
        totalAmount: registration.totalAmount || 0,
        slipUrl: '',
        status: '',
      } as EventRegistration;

      const calculation = calculateRefundAmount(registrationForCalculation, event);
      setRefundCalculation(calculation);
      setCancellationReason('');
      setError(null);
    }
  }, [isOpen, registration, event]);

  const handleSubmit = async () => {
    if (!refundCalculation) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(event.eventId)}/cancel-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId: registration.registrationId,
          cancellationReason: cancellationReason.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'ไม่สามารถยกเลิกการจองได้');
      }

      // Success
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error cancelling registration:', err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !refundCalculation) return null;

  const hasPayment = (registration.paidAmount || 0) > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-200 px-6 py-4 flex items-center justify-between sticky top-0">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-lg font-semibold text-red-900">ยืนยันการยกเลิกการจอง</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isSubmitting}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Event Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">{event.eventName}</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>รหัสการจอง: <span className="font-mono text-gray-900">{registration.registrationId}</span></p>
              <p>จำนวนผู้เข้าร่วม: <span className="font-semibold text-gray-900">{registration.attendeeCount || 0} คน</span></p>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-gray-900 text-sm">สรุปการคืนเงิน</h4>

            {hasPayment ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ยอดที่ชำระแล้ว:</span>
                  <span className="font-semibold text-gray-900">
                    {(registration.paidAmount || 0).toLocaleString()} บาท
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">เงื่อนไขที่ใช้:</span>
                  <span className="font-medium text-gray-900">
                    {refundCalculation.isAfterFinalRule && refundCalculation.cancelBeforeDate
                      ? `ยกเลิกตั้งแต่ ${new Date(refundCalculation.cancelBeforeDate).toLocaleDateString('th-TH', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })} เป็นต้นไป`
                      : refundCalculation.cancelBeforeDate
                        ? `ยกเลิกก่อน ${new Date(refundCalculation.cancelBeforeDate).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}`
                        : refundCalculation.ruleName}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">เปอร์เซ็นต์คืน:</span>
                  <span className={refundCalculation.refundPercentage > 0 ? "font-medium text-green-600" : "font-medium text-red-600"}>
                    {refundCalculation.refundPercentage}%
                  </span>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">ยอดคืน:</span>
                    <span className="font-bold text-green-600 text-lg">
                      {refundCalculation.refundAmount.toLocaleString()} บาท
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">ยอดหักค่าใช้จ่าย:</span>
                    <span className="font-semibold text-red-600">
                      {refundCalculation.chargeAmount.toLocaleString()} บาท
                    </span>
                  </div>
                </div>

                {refundCalculation.refundAmount > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800">
                    <p className="font-medium mb-1">ข้อมูลการคืนเงิน</p>
                    <p>ทาง admin จะดำเนินการคืนเงินให้คุณภายใน 7-14 วันทำการ และจะแจ้งเตือนผ่าน LINE เมื่อโอนเงินเรียบร้อยแล้ว</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-600">
                <p>ไม่มียอดชำระ - ไม่ต้องคืนเงิน</p>
              </div>
            )}
          </div>

          {/* Cancellation Reason (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              เหตุผลการยกเลิก (ไม่บังคับ)
            </label>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
              placeholder="เช่น มีธุระส่วนตัว, เปลี่ยนใจ, ฯลฯ"
              disabled={isSubmitting}
              maxLength={500}
            />
            {cancellationReason.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {cancellationReason.length}/500 ตัวอักษร
              </p>
            )}
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">คำเตือน</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>การยกเลิกจะมีผลทันที และไม่สามารถยกเลิกการดำเนินการได้</li>
                  {registration.carpoolId && (
                    <li>คุณจะถูกลบออกจากรถร่วมเดินทางโดยอัตโนมัติ</li>
                  )}
                  {registration.roomAssignments && (
                    <li>การจัดห้องพักของคุณจะถูกยกเลิก</li>
                  )}
                  <li>หากมีการคืนเงิน จะได้รับแจ้งเตือนผ่าน LINE เมื่อโอนเงินสำเร็จ</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex gap-2">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end sticky bottom-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-sm"
            disabled={isSubmitting}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                กำลังดำเนินการ...
              </>
            ) : (
              'ยืนยันการยกเลิก'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
