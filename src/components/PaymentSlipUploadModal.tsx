'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';

interface PaymentSlipUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  registrationId: string;
  eventId: string;
  paymentType: 'deposit' | 'remaining' | 'full' | 'additional';
  amount: number;
  onSuccess?: () => void;
  // Payment mode context for determining available payment types
  paymentMode?: 'full' | 'deposit';
  depositPaid?: boolean;
  totalAmount?: number;
  depositAmount?: number;
  remainingAmount?: number;
  // ✅ NEW: Actual amounts already paid (for calculating remaining balance)
  fullPaymentAmountPaid?: number;
  depositAmountPaid?: number;
  remainingAmountPaid?: number;
}

export default function PaymentSlipUploadModal({
  isOpen,
  onClose,
  registrationId,
  eventId,
  paymentType: initialPaymentType,
  amount: initialAmount,
  onSuccess,
  paymentMode = 'full',
  depositPaid = false,
  totalAmount = 0,
  depositAmount = 0,
  remainingAmount = 0,
  fullPaymentAmountPaid = 0,
  depositAmountPaid = 0,
  remainingAmountPaid = 0,
}: PaymentSlipUploadModalProps) {
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');

  // ✅ NEW: User-editable payment type and amount
  const [selectedPaymentType, setSelectedPaymentType] = useState<'deposit' | 'remaining' | 'full' | 'additional'>(initialPaymentType);
  const [customAmount, setCustomAmount] = useState<string>(initialAmount.toString());

  // Reset form when modal opens
  if (!isOpen) {
    // Reset state when closed
    if (slipFile || description || selectedPaymentType !== initialPaymentType || customAmount !== initialAmount.toString()) {
      setTimeout(() => {
        setSlipFile(null);
        setDescription('');
        setSelectedPaymentType(initialPaymentType);
        setCustomAmount(initialAmount.toString());
      }, 300);
    }
    return null;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        toast.error('กรุณาเลือกไฟล์ภาพ (JPG, PNG, WebP) หรือ PDF เท่านั้น');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('ขนาดไฟล์ต้องไม่เกิน 10 MB');
        return;
      }

      setSlipFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!slipFile) {
      toast.error('กรุณาเลือกไฟล์สลิปการชำระเงิน');
      return;
    }

    // ✅ Validate custom amount
    const amountValue = parseFloat(customAmount);
    if (isNaN(amountValue) || amountValue <= 0) {
      toast.error('กรุณากรอกจำนวนเงินที่ถูกต้อง');
      return;
    }

    setUploading(true);

    try {
      // Convert file to base64
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove data:image/jpeg;base64, prefix
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(slipFile);
      });

      console.log('[Client] Uploading payment slip...');
      console.log('[Client] registrationId:', registrationId);
      console.log('[Client] eventId:', eventId);
      console.log('[Client] paymentType:', selectedPaymentType);
      console.log('[Client] amount:', amountValue);

      // Upload via member API
      const uploadResponse = await fetch('/api/payments/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId,
          eventId,
          amount: amountValue,  // ✅ Use user-input amount
          paymentType: selectedPaymentType,  // ✅ Use user-selected payment type
          fileData: fileBase64,
          fileName: slipFile.name,
          mimeType: slipFile.type,
          description: description || undefined,
        }),
      });

      // Check response before parsing JSON
      if (!uploadResponse.ok) {
        let errorMessage = `อัพโหลดไฟล์ล้มเหลว: ${uploadResponse.status}`;
        try {
          const errorData = await uploadResponse.json();
          console.error('[Client] Upload failed, error data:', errorData);
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch (e) {
          const errorText = await uploadResponse.text();
          console.error('[Client] Upload failed, response text:', errorText);
        }
        throw new Error(errorMessage);
      }

      const uploadData = await uploadResponse.json();

      console.log('[Client] ✅ Upload successful');

      toast.success('อัพโหลดสลิปสำเร็จ! กรุณารอเจ้าหน้าที่ตรวจสอบ');

      // Reset form
      setSlipFile(null);
      setDescription('');

      // Call onSuccess callback
      if (onSuccess) {
        onSuccess();
      }

      // Close modal
      onClose();
    } catch (error) {
      console.error('[Client] Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการอัพโหลดสลิป');
    } finally {
      setUploading(false);
    }
  };

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case 'deposit':
        return 'มัดจำ';
      case 'remaining':
        return 'ยอดคงเหลือ';
      case 'full':
        return 'เต็มจำนวน';
      case 'additional':
        return 'ค่าใช้จ่ายเพิ่มเติม';
      default:
        return '';
    }
  };

  // ✅ Determine available payment type options based on payment mode and status
  const getAvailablePaymentTypes = (): Array<{ value: string; label: string; suggestedAmount: number }> => {
    const options: Array<{ value: string; label: string; suggestedAmount: number }> = [];

    if (paymentMode === 'deposit') {
      // Deposit payment mode
      if (!depositPaid) {
        // Deposit not yet paid - can pay deposit or full
        // Calculate remaining amount needed for deposit (in case partial payment was made)
        const depositRemaining = Math.max(0, depositAmount - depositAmountPaid);
        const totalRemaining = Math.max(0, totalAmount - depositAmountPaid - remainingAmountPaid);

        options.push(
          { value: 'deposit', label: 'มัดจำ', suggestedAmount: depositRemaining },
          { value: 'full', label: 'เต็มจำนวน (ชำระทั้งหมด)', suggestedAmount: totalRemaining }
        );
      } else {
        // Deposit already paid - can pay remaining
        // Calculate remaining amount needed (subtract what's already been paid for remaining)
        const remainingNeeded = Math.max(0, remainingAmount - remainingAmountPaid);
        options.push(
          { value: 'remaining', label: 'ยอดคงเหลือ', suggestedAmount: remainingNeeded }
        );
      }
    } else {
      // Full payment mode
      // Calculate remaining amount needed (subtract what's already been paid)
      const fullPaymentRemaining = Math.max(0, totalAmount - fullPaymentAmountPaid);

      // ✅ FIXED: Determine correct label based on payment status
      // If already paid some amount (fullPaymentAmountPaid > 0), this is "additional" payment
      // If never paid anything, this is "full" payment
      let label = 'เต็มจำนวน';
      if (fullPaymentAmountPaid > 0) {
        // Already paid something - this is additional/remaining payment
        label = 'ยอดคงเหลือ';
      }

      options.push(
        { value: 'full', label: label, suggestedAmount: fullPaymentRemaining }
      );
    }

    // Additional payment option - always available
    options.push(
      { value: 'additional', label: 'ค่าใช้จ่ายเพิ่มเติม', suggestedAmount: 0 }
    );

    return options;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            อัพโหลดสลิปการชำระเงิน
          </h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Registration ID - Read only */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">Registration ID:</span>
              <span className="text-xs font-mono text-gray-900">{registrationId}</span>
            </div>
          </div>

          {/* Payment Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภทการชำระเงิน <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPaymentType}
              onChange={(e) => {
                const newType = e.target.value as 'deposit' | 'remaining' | 'full' | 'additional';
                setSelectedPaymentType(newType);

                // Auto-fill suggested amount
                const option = getAvailablePaymentTypes().find(opt => opt.value === newType);
                if (option && option.suggestedAmount > 0) {
                  setCustomAmount(option.suggestedAmount.toString());
                } else {
                  setCustomAmount('');
                }
              }}
              disabled={uploading}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:opacity-50"
            >
              {getAvailablePaymentTypes().map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              เลือกประเภทการชำระเงินที่ตรงกับการโอนของคุณ
            </p>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              โปรดระบุยอดเงินที่โอน
              {(() => {
                const selectedOption = getAvailablePaymentTypes().find(opt => opt.value === selectedPaymentType);
                if (selectedOption && selectedOption.suggestedAmount > 0) {
                  return ` (แนะนำ ${selectedOption.suggestedAmount.toLocaleString()} บาท)`;
                }
                return '';
              })()}
              <span className="text-red-500"> *</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              disabled={uploading}
              placeholder="กรอกจำนวนเงินที่โอนจริง"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:opacity-50"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              กรอกจำนวนเงินที่คุณโอนจริง (อาจแตกต่างจากยอดแนะนำก็ได้)
            </p>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ไฟล์สลิปการชำระเงิน <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {slipFile && (
              <p className="mt-2 text-sm text-green-600">
                ✓ {slipFile.name} ({(slipFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              รองรับไฟล์: JPG, PNG, WebP, PDF (สูงสุด 10 MB)
            </p>
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              หมายเหตุ (ถ้ามี)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading}
              rows={3}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
              placeholder="ระบุข้อความเพิ่มเติม (ถ้ามี)"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={!slipFile || uploading}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'กำลังอัพโหลด...' : 'อัพโหลดสลิป'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
