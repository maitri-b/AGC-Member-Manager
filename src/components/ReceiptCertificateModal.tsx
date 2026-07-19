'use client';

import { useState } from 'react';

interface ReceiptCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  initialData: {
    companyName: string;
    memberName: string;
    memberPosition: string;
  };
}

export default function ReceiptCertificateModal({
  isOpen,
  onClose,
  eventId,
  initialData,
}: ReceiptCertificateModalProps) {
  const [companyName, setCompanyName] = useState(initialData.companyName);
  const [memberName, setMemberName] = useState(initialData.memberName);
  const [memberPosition, setMemberPosition] = useState(initialData.memberPosition);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Build URL with query parameters for customized data
      const params = new URLSearchParams({
        companyName,
        memberName,
        memberPosition,
      });

      const response = await fetch(`/api/events/${eventId}/receipt?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to generate receipt');
      }

      // Create a blob from the response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Create a temporary link and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-certificate-${eventId}.pdf`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Close modal after successful download
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error('Error downloading receipt:', error);
      alert('เกิดข้อผิดพลาดในการสร้างใบรับรอง กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 p-6 rounded-t-lg">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">ใบรับรองแทนใบเสร็จรับเงิน</h2>
              <p className="text-green-100 text-sm">กรุณาตรวจสอบข้อมูลก่อนดาวน์โหลด</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
              disabled={isDownloading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Information about receipt certificate */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800 space-y-2">
                <p className="font-semibold">เกี่ยวกับใบรับรองแทนใบเสร็จ:</p>
                <p>
                  ชมรมเอเจ้นท์คลับเป็นกลุ่มที่รวมตัวของผู้ประกอบการธุรกิจนำเที่ยว ไม่ใช่นิติบุคคล
                  จึงไม่มีอำนาจในการออกใบเสร็จรับเงิน
                </p>
                <p>
                  การออกใบรับรองแทนใบเสร็จเป็นแนวทางที่ชมรมใช้เป็นหลักฐานการจ่ายเงินของผู้จ่ายเงิน
                  โดยยึดแนวทางที่กรมสรรพากรกำหนดไว้สำหรับรายจ่ายของกิจการที่ผู้ให้บริการไม่สามารถออกใบเสร็จให้ได้
                  สามารถใช้แทนค่าใช้จ่ายในกิจการได้
                </p>
                <p className="text-xs mt-2">
                  <a
                    href="https://www.rd.go.th/fileadmin/download/15277290359.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 hover:text-blue-900 underline"
                  >
                    อ้างอิงเอกสารจากกรมสรรพากร
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ชื่อบริษัทผู้รับบริการ <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="เช่น บริษัท ตัวอย่าง จำกัด"
                disabled={isDownloading}
              />
              <p className="text-xs text-gray-500 mt-1">
                ระบุชื่อบริษัทที่จะปรากฏในใบรับรอง
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ชื่อผู้เบิกจ่าย <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="เช่น นายสมชาย ใจดี"
                disabled={isDownloading}
              />
              <p className="text-xs text-gray-500 mt-1">
                ระบุชื่อผู้เบิกจ่ายที่จะลงลายมือชื่อในใบรับรอง
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ตำแหน่ง <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={memberPosition}
                onChange={(e) => setMemberPosition(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="เช่น กรรมการผู้จัดการ"
                disabled={isDownloading}
              />
              <p className="text-xs text-gray-500 mt-1">
                ระบุตำแหน่งของผู้เบิกจ่าย
              </p>
            </div>
          </div>

          {/* Preview note */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">หมายเหตุ:</span> ข้อมูลที่คุณกรอกจะถูกนำไปใช้ในการสร้างใบรับรองแทนใบเสร็จ
              กรุณาตรวจสอบความถูกต้องก่อนดาวน์โหลด
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 rounded-b-lg flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDownloading}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading || !companyName || !memberName || !memberPosition}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDownloading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                กำลังสร้าง PDF...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                ดาวน์โหลด PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
