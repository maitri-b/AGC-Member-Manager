'use client';

import { useState, useEffect } from 'react';
import { Event, EventRegistration, calculateRefundAmount } from '@/types/event';

interface AdminCancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
  registration: EventRegistration & {
    companyName?: string;
    contactName?: string;
  };
  event: Event;
  onSuccess: () => void;
}

export default function AdminCancellationModal({
  isOpen,
  onClose,
  registration,
  event,
  onSuccess
}: AdminCancellationModalProps) {
  const [cancellationReason, setCancellationReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundCalculation, setRefundCalculation] = useState<ReturnType<typeof calculateRefundAmount> | null>(null);

  // Calculate refund when modal opens
  useEffect(() => {
    if (isOpen) {
      const calculation = calculateRefundAmount(registration, event);
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
      const response = await fetch(`/api/events/${event.eventId}/cancel-registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registrationId: registration.registrationId,
          cancellationReason: cancellationReason.trim() || undefined,
          isAdmin: true,
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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-200 px-6 py-4 flex items-center justify-between sticky top-0">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-lg font-semibold text-red-900">ยกเลิกการจอง (Admin)</h2>
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
          {/* Event & Registration Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <h3 className="font-semibold text-gray-900">{event.eventName}</h3>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <span className="font-medium">รหัสการจอง:</span>
                <p className="font-mono text-gray-900">{registration.registrationId}</p>
              </div>
              <div>
                <span className="font-medium">บริษัท:</span>
                <p className="text-gray-900">{registration.companyName}</p>
              </div>
              <div>
                <span className="font-medium">ผู้ติดต่อ:</span>
                <p className="text-gray-900">{registration.contactName}</p>
              </div>
              <div>
                <span className="font-medium">จำนวนผู้เข้าร่วม:</span>
                <p className="text-gray-900">{registration.attendeeCount || 0} คน</p>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-gray-900 text-sm">สรุปการคืนเงิน</h4>

            {hasPayment ? (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">ยอดที่ชำระแล้ว:</span>
                    <span className="font-semibold text-gray-900">
                      {(registration.paidAmount || 0).toLocaleString()} บาท
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">เงื่อนไขที่ใช้:</span>
                    <span className="font-medium text-gray-900">{refundCalculation.ruleName}</span>
                  </div>

                  {refundCalculation.refundPercentage > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">เปอร์เซ็นต์คืน:</span>
                      <span className="font-medium text-green-600">{refundCalculation.refundPercentage}%</span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <div className="flex justify-between text-sm">
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
                    <p>สถานะจะเป็น "รอดำเนินการ" จนกว่าจะอัพโหลดสลิปคืนเงินใน tab &quot;รายการยกเลิก&quot;</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-600">
                <p>ไม่มียอดชำระ - ไม่ต้องคืนเงิน</p>
              </div>
            )}
          </div>

          {/* Cancellation Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              เหตุผลการยกเลิก <span className="text-red-500">*</span>
            </label>

            {/* Warning about LINE notification */}
            <div className="mb-3 bg-orange-50 border-l-4 border-orange-500 rounded-r-lg p-4">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-bold text-orange-900 mb-1">⚠️ สำคัญ!</p>
                  <p className="text-sm text-orange-800">
                    ข้อความเหตุผลนี้จะถูกส่งไปยัง <strong>LINE แจ้งเตือนการยกเลิก</strong> ให้สมาชิกทราบด้วย
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    กรุณาระบุข้อความที่ชัดเจน สุภาพ และเป็นมืออาชีพ
                  </p>
                </div>
              </div>
            </div>

            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
              placeholder="ตัวอย่าง: ขออภัยค่ะ เนื่องจากกิจกรรมเต็มแล้ว ทางทีมงานจึงต้องยกเลิกการลงทะเบียนของท่าน จะมีการคืนเงินตามเงื่อนไขที่กำหนดค่ะ"
              disabled={isSubmitting}
              maxLength={500}
            />
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-gray-500">
                💡 ข้อความนี้จะแสดงใน LINE notification
              </p>
              {cancellationReason.length > 0 && (
                <p className="text-xs text-gray-500">
                  {cancellationReason.length}/500 ตัวอักษร
                </p>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">คำเตือน - การดำเนินการนี้ไม่สามารถยกเลิกได้</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>สถานะการจองจะเปลี่ยนเป็น &quot;ยกเลิก&quot; ทันที</li>
                  {registration.carpoolId && (
                    <li>จะถูกลบออกจากรถร่วมเดินทางอัตโนมัติ</li>
                  )}
                  {registration.roomAssignments && (
                    <li>การจัดห้องพักจะถูกยกเลิก</li>
                  )}
                  <li>ระบบจะบันทึกข้อมูลห้องและ carpool เดิมไว้สำหรับอ้างอิง</li>
                  {refundCalculation.refundAmount > 0 && (
                    <li>คุณจะต้องอัพโหลดสลิปคืนเงินในภายหลัง</li>
                  )}
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
        <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end sticky bottom-0 border-t border-gray-200">
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
            disabled={isSubmitting || !cancellationReason.trim()}
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
