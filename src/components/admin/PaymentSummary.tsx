'use client';

export interface PaymentSummary {
  registrationId: string;
  totalAmount: number;
  totalPaid: number;
  totalPending: number;
  balance: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid';
  lastPaymentDate?: string;
  paymentsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
}

interface PaymentSummaryProps {
  summary: PaymentSummary;
  compact?: boolean;
}

const PaymentStatusConfig = {
  unpaid: {
    label: 'ยังไม่ได้ชำระ',
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200',
  },
  partial: {
    label: 'ชำระบางส่วน',
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
  },
  paid: {
    label: 'ชำระครบ',
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-200',
  },
  overpaid: {
    label: 'ชำระเกิน',
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
  },
};

export default function PaymentSummary({ summary, compact = false }: PaymentSummaryProps) {
  const statusConfig = PaymentStatusConfig[summary.paymentStatus];

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (compact) {
    return (
      <div className={`border rounded-lg p-3 ${statusConfig.border} ${statusConfig.bg}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-semibold ${statusConfig.text}`}>
              {statusConfig.label}
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              ชำระแล้ว {formatCurrency(summary.totalPaid)} / {formatCurrency(summary.totalAmount)} บาท
            </p>
          </div>
          {summary.balance > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-500">คงเหลือ</p>
              <p className="text-sm font-bold text-gray-900">
                {formatCurrency(summary.balance)} บาท
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">สรุปการชำระเงิน</h3>
        <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.text}`}>
          {statusConfig.label}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">ยอดรวมทั้งหมด</p>
          <p className="text-lg font-bold text-gray-900">
            {formatCurrency(summary.totalAmount)} บาท
          </p>
        </div>

        <div className="bg-green-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">ชำระแล้ว</p>
          <p className="text-lg font-bold text-green-700">
            {formatCurrency(summary.totalPaid)} บาท
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            ({summary.approvedCount} ครั้ง)
          </p>
        </div>

        <div className="bg-yellow-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">รอตรวจสอบ</p>
          <p className="text-lg font-bold text-yellow-700">
            {formatCurrency(summary.totalPending)} บาท
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            ({summary.pendingCount} ครั้ง)
          </p>
        </div>

        <div className={`rounded-lg p-3 ${summary.balance > 0 ? 'bg-red-50' : 'bg-blue-50'}`}>
          <p className="text-xs text-gray-500 mb-1">
            {summary.balance > 0 ? 'ยอดคงเหลือต้องชำระ' : summary.balance < 0 ? 'ชำระเกิน' : 'ชำระครบ'}
          </p>
          <p className={`text-lg font-bold ${summary.balance > 0 ? 'text-red-700' : summary.balance < 0 ? 'text-blue-700' : 'text-green-700'}`}>
            {formatCurrency(Math.abs(summary.balance))} บาท
          </p>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">จำนวนสลิปทั้งหมด:</span>
          <span className="font-medium text-gray-900">{summary.paymentsCount} สลิป</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">อนุมัติแล้ว:</span>
          <span className="font-medium text-green-700">{summary.approvedCount} สลิป</span>
        </div>
        {summary.pendingCount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">รอตรวจสอบ:</span>
            <span className="font-medium text-yellow-700">{summary.pendingCount} สลิป</span>
          </div>
        )}
        {summary.rejectedCount > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">ปฏิเสธ:</span>
            <span className="font-medium text-red-700">{summary.rejectedCount} สลิป</span>
          </div>
        )}
        {summary.lastPaymentDate && (
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <span className="text-gray-600">ชำระครั้งล่าสุด:</span>
            <span className="font-medium text-gray-900">{formatDate(summary.lastPaymentDate)}</span>
          </div>
        )}
      </div>

      {summary.balance > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            <span className="font-semibold">⚠️ ยอดคงเหลือต้องชำระ:</span> ยังต้องชำระอีก {formatCurrency(summary.balance)} บาท
          </p>
        </div>
      )}

      {summary.balance < 0 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">ℹ️ ชำระเกิน:</span> ชำระมากกว่ายอดรวม {formatCurrency(Math.abs(summary.balance))} บาท
          </p>
        </div>
      )}
    </div>
  );
}
