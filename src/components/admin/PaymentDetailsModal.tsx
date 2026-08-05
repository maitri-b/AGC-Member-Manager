'use client';

import { useState, useEffect } from 'react';
import PaymentTimeline, { PaymentSlip } from './PaymentTimeline';
import PaymentSummary, { PaymentSummary as PaymentSummaryType } from './PaymentSummary';

interface PaymentDetailsModalProps {
  registrationId: string;
  totalAmount: number;
  companyName: string;
  contactName: string;
  onClose: () => void;
  onUpdate?: () => void; // Callback to refresh parent data after approve/reject
}

export default function PaymentDetailsModal({
  registrationId,
  totalAmount,
  companyName,
  contactName,
  onClose,
  onUpdate,
}: PaymentDetailsModalProps) {
  const [paymentSlips, setPaymentSlips] = useState<PaymentSlip[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch payment slips and summary
  useEffect(() => {
    fetchPaymentData();
  }, [registrationId]);

  const fetchPaymentData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch payment slips
      const slipsResponse = await fetch(`/api/payments?registrationId=${registrationId}`);
      if (!slipsResponse.ok) {
        throw new Error('Failed to fetch payment slips');
      }
      const slipsData = await slipsResponse.json();
      setPaymentSlips(slipsData.slips || []);

      // Fetch payment summary
      const summaryResponse = await fetch(`/api/payments/summary?registrationId=${registrationId}&totalAmount=${totalAmount}`);
      if (!summaryResponse.ok) {
        throw new Error('Failed to fetch payment summary');
      }
      const summaryData = await summaryResponse.json();
      setPaymentSummary(summaryData.summary);

    } catch (err) {
      console.error('Error fetching payment data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (slipId: string, notes?: string) => {
    try {
      const response = await fetch(`/api/payments/${slipId}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve payment slip');
      }

      alert('อนุมัติสลิปเรียบร้อยแล้ว');

      // Notify parent to refresh (this will update the attendee list and buttons)
      if (onUpdate) {
        onUpdate();
      }

      // Refresh payment data in modal
      await fetchPaymentData();
    } catch (err) {
      console.error('Error approving payment:', err);
      alert(err instanceof Error ? err.message : 'Failed to approve payment');
    }
  };

  const handleReject = async (slipId: string, reason: string, notes?: string) => {
    try {
      const response = await fetch(`/api/payments/${slipId}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason, notes }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject payment slip');
      }

      alert('ปฏิเสธสลิปเรียบร้อยแล้ว');

      // Notify parent to refresh (this will update the attendee list and buttons)
      if (onUpdate) {
        onUpdate();
      }

      // Refresh payment data in modal
      await fetchPaymentData();
    } catch (err) {
      console.error('Error rejecting payment:', err);
      alert(err instanceof Error ? err.message : 'Failed to reject payment');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">ประวัติการชำระเงิน</h2>
            <p className="text-sm text-gray-600 mt-1">
              {companyName} - {contactName} (ID: {registrationId})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">กำลังโหลดข้อมูล...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">
                <span className="font-semibold">เกิดข้อผิดพลาด:</span> {error}
              </p>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Payment Summary */}
              {paymentSummary && (
                <PaymentSummary summary={paymentSummary} />
              )}

              {/* Payment Timeline */}
              <PaymentTimeline
                slips={paymentSlips}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
