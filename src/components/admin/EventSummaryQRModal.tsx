// Event Summary QR Code Modal
// Displays QR code and shareable URL for event summary page
'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface EventSummaryQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
}

export default function EventSummaryQRModal({
  isOpen,
  onClose,
  eventId,
}: EventSummaryQRModalProps) {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const summaryUrl = `${window.location.origin}/events/${eventId}/summary`;

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      generateQRCode();
    }
  }, [isOpen, eventId]);

  const generateQRCode = async () => {
    try {
      if (canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, summaryUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#1e1b4b', // indigo-950
            light: '#ffffff',
          },
        });

        // Also generate data URL for download
        const dataUrl = await QRCode.toDataURL(summaryUrl, {
          width: 600,
          margin: 2,
          color: {
            dark: '#1e1b4b',
            light: '#ffffff',
          },
        });
        setQrCodeDataUrl(dataUrl);
      }
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(summaryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    if (qrCodeDataUrl) {
      const link = document.createElement('a');
      link.href = qrCodeDataUrl;
      link.download = `event-${eventId}-summary-qr.png`;
      link.click();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <h2 className="text-2xl font-bold">เว็บเช็คข้อมูล</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-indigo-100 mt-2 text-sm">
            สำหรับสมาชิกเช็คข้อมูลรถ ห้องพัก และโต๊ะ
          </p>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* QR Code Display */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-8 mb-6 flex justify-center">
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <canvas ref={canvasRef} className="mx-auto" />
            </div>
          </div>

          {/* URL Display */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              URL สำหรับแชร์
            </label>
            <div className="bg-gray-100 border-2 border-gray-300 rounded-lg p-4">
              <p className="text-sm text-gray-800 break-all font-mono">
                {summaryUrl}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleDownloadQR}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-4 px-6 rounded-lg transition-all flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              ดาวน์โหลด QR Code
            </button>

            <button
              onClick={handleCopyUrl}
              className={`w-full ${
                copied
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-gray-700 hover:bg-gray-800'
              } text-white font-semibold py-4 px-6 rounded-lg transition-all flex items-center justify-center gap-3 shadow-md hover:shadow-lg`}
            >
              {copied ? (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  คัดลอกแล้ว!
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  คัดลอก URL
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-4 px-6 rounded-lg transition-colors"
            >
              ปิด
            </button>
          </div>

          {/* Usage Instructions */}
          <div className="mt-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">วิธีใช้งาน</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>แชร์ QR Code หรือ URL ให้สมาชิกสแกนเข้าชม</li>
                  <li>สมาชิกสามารถค้นหาข้อมูลด้วยรหัสการจองทัวร์</li>
                  <li>ระบบจะแสดงข้อมูลเฉพาะที่เปิดใช้งาน (รถ/ห้อง/โต๊ะ)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
