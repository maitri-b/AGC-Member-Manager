'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface VerificationRequest {
  id: string;
  userId: string;
  lineUserId: string;
  lineDisplayName: string;
  lineImage: string;
  memberId: string;
  licenseNumber: string;
  phone: string;
  memberInfo: {
    companyNameTH: string;
    companyNameEN: string;
    fullNameTH: string;
    nickname: string;
    positionClub: string;
  };
  systemData?: {
    companyNameTH: string;
    companyNameEN: string;
    licenseNumber: string;
    lineName: string;
    mobile: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedByName?: string;
  rejectedByName?: string;
  rejectionReason?: string;
  hasDuplicatePending?: boolean;
  duplicateCount?: number;
  autoRejectedDueTo?: string;
}

export default function AdminVerificationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<{
    pending: VerificationRequest[];
    processed: VerificationRequest[];
  }>({ pending: [], processed: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sendingLineId, setSendingLineId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const res = await fetch('/api/admin/verification');
      if (res.ok) {
        const data = await res.json();
        setRequests({
          pending: data.pending || [],
          processed: data.processed || [],
        });
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleApprove = async (requestId: string) => {
    if (!confirm('ยืนยันการอนุมัติคำขอนี้?')) return;

    setProcessingId(requestId);
    try {
      const res = await fetch('/api/admin/verification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action: 'approve' }),
      });

      if (res.ok) {
        await fetchRequests();
        alert('อนุมัติคำขอเรียบร้อยแล้ว');
      } else {
        const data = await res.json();
        alert(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingId(requestId);
    try {
      const res = await fetch('/api/admin/verification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action: 'reject',
          rejectionReason: rejectionReason || 'ไม่ผ่านการตรวจสอบ',
        }),
      });

      if (res.ok) {
        await fetchRequests();
        setShowRejectModal(null);
        setRejectionReason('');
        alert('ปฏิเสธคำขอเรียบร้อยแล้ว');
      } else {
        const data = await res.json();
        alert(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setProcessingId(null);
    }
  };

  // Generate reply message for copying
  const generateReplyMessage = (request: VerificationRequest) => {
    if (request.status === 'approved') {
      return `🎉 ยินดีด้วย! คำขอยืนยันตัวตนของคุณได้รับการอนุมัติแล้ว

คุณสามารถเข้าถึงข้อมูลและบริการต่างๆ ของ Agents Club ได้แล้วครับ

📌 รหัสสมาชิก: ${request.memberId}
🏢 บริษัท: ${request.memberInfo.companyNameTH || request.memberInfo.companyNameEN || '-'}

ขอบคุณที่เป็นส่วนหนึ่งของ Agents Club ครับ
Helping & Sharing`;
    } else {
      return `ขออภัย คำขอยืนยันตัวตนของคุณไม่ผ่านการอนุมัติ

📋 เหตุผล: ${request.rejectionReason || 'ไม่ผ่านการตรวจสอบข้อมูล'}

หากคุณเชื่อว่าเป็นข้อผิดพลาด หรือต้องการส่งคำขอใหม่ กรุณาเข้าสู่ระบบและยืนยันตัวตนอีกครั้ง

หากมีข้อสงสัย สามารถติดต่อทีมงาน Agents Club ได้เลยครับ`;
    }
  };

  // Copy message to clipboard
  const handleCopyMessage = async (request: VerificationRequest) => {
    const message = generateReplyMessage(request);
    try {
      await navigator.clipboard.writeText(message);
      setCopiedId(request.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      alert('ไม่สามารถคัดลอกข้อความได้');
    }
  };

  // Send LINE notification
  const handleSendLine = async (request: VerificationRequest) => {
    if (!request.lineUserId) {
      alert('ไม่พบ LINE User ID');
      return;
    }

    setSendingLineId(request.id);
    try {
      const res = await fetch('/api/line/send-verification-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: request.lineUserId,
          memberId: request.memberId,
          status: request.status,
          rejectionReason: request.rejectionReason,
          lineDisplayName: request.lineDisplayName,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'ส่งข้อความสำเร็จ');
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการส่งข้อความ');
      }
    } catch (error) {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSendingLineId(null);
    }
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">คำขอยืนยันตัวตน</h1>
            {requests.pending.length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {requests.pending.length} รอดำเนินการ
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            รอดำเนินการ ({requests.pending.length})
          </button>
          <button
            onClick={() => setActiveTab('processed')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'processed'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            ดำเนินการแล้ว ({requests.processed.length})
          </button>
        </div>

        {/* Request List */}
        <div className="space-y-3">
          {(activeTab === 'pending' ? requests.pending : requests.processed).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500">
                {activeTab === 'pending' ? 'ไม่มีคำขอที่รอดำเนินการ' : 'ยังไม่มีคำขอที่ดำเนินการแล้ว'}
              </p>
            </div>
          ) : (
            (activeTab === 'pending' ? requests.pending : requests.processed).map((request) => (
              <div key={request.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Compact Header - Always visible */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {/* Profile Image */}
                    {request.lineImage ? (
                      <Image
                        src={request.lineImage}
                        alt={request.lineDisplayName}
                        width={48}
                        height={48}
                        className="rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}

                    {/* Name and Info - LINE Profile only */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{request.lineDisplayName}</p>
                        {/* Duplicate warning badge */}
                        {request.hasDuplicatePending && (
                          <span className="flex-shrink-0 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            ซ้ำ {request.duplicateCount} ราย
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(request.createdAt).toLocaleDateString('th-TH')}
                      </p>
                    </div>

                    {/* Status for processed requests */}
                    {request.status !== 'pending' && (
                      <span className={`flex-shrink-0 px-3 py-1 rounded-full text-sm font-medium ${
                        request.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {request.status === 'approved' ? '✓ อนุมัติ' : '✗ ปฏิเสธ'}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 sm:gap-2 ml-2 sm:ml-4">
                    {request.status === 'pending' && (
                      <>
                        {/* Desktop buttons */}
                        <button
                          onClick={() => handleApprove(request.id)}
                          disabled={processingId === request.id}
                          className="hidden sm:flex bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors text-sm"
                        >
                          {processingId === request.id ? '...' : 'อนุมัติ'}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(request.id)}
                          disabled={processingId === request.id}
                          className="hidden sm:flex bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-300 transition-colors text-sm"
                        >
                          ปฏิเสธ
                        </button>
                        {/* Mobile icon buttons */}
                        <button
                          onClick={() => handleApprove(request.id)}
                          disabled={processingId === request.id}
                          className="sm:hidden p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                          title="อนุมัติ"
                        >
                          {processingId === request.id ? (
                            <span className="w-5 h-5 block text-center">...</span>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(request.id)}
                          disabled={processingId === request.id}
                          className="sm:hidden p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 transition-colors"
                          title="ปฏิเสธ"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    )}

                    {/* Expand Button */}
                    <button
                      onClick={() => toggleExpand(request.id)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title={expandedIds.has(request.id) ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                    >
                      <svg
                        className={`w-5 h-5 text-gray-500 transition-transform ${expandedIds.has(request.id) ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expandable Details */}
                {expandedIds.has(request.id) && (
                  <div className="px-4 pb-4 pt-2 border-t bg-gray-50">
                    {/* Duplicate warning alert */}
                    {request.hasDuplicatePending && (
                      <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <div className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-amber-800">
                              พบคำขอซ้ำ {request.duplicateCount} รายการสำหรับรหัสสมาชิก {request.memberId}
                            </p>
                            <p className="text-xs text-amber-600 mt-1">
                              เมื่ออนุมัติรายนี้ คำขออื่นจะถูกปฏิเสธโดยอัตโนมัติ
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Auto-rejected notice */}
                    {request.autoRejectedDueTo && (
                      <div className="mb-4 p-3 rounded-lg bg-gray-100 border border-gray-200">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">หมายเหตุ:</span> คำขอนี้ถูกปฏิเสธอัตโนมัติเนื่องจากมีผู้อื่นได้รับการอนุมัติสำหรับรหัสสมาชิกนี้แล้ว
                        </p>
                      </div>
                    )}

                    {/* Status info for processed */}
                    {request.status !== 'pending' && !request.autoRejectedDueTo && (
                      <div className={`mb-4 p-3 rounded-lg ${
                        request.status === 'approved' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                      }`}>
                        <p className={`text-sm ${request.status === 'approved' ? 'text-green-700' : 'text-red-700'}`}>
                          {request.status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ'}โดย: {request.approvedByName || request.rejectedByName || 'Admin'}
                        </p>
                        {request.rejectionReason && (
                          <p className="text-sm text-red-600 mt-1">เหตุผล: {request.rejectionReason}</p>
                        )}

                        {/* Action buttons for processed requests */}
                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                          {/* Copy Message Button */}
                          <button
                            onClick={() => handleCopyMessage(request)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                              copiedId === request.id
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {copiedId === request.id ? (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                คัดลอกแล้ว
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                คัดลอกข้อความตอบกลับ
                              </>
                            )}
                          </button>

                          {/* Send LINE Button */}
                          <button
                            onClick={() => handleSendLine(request)}
                            disabled={sendingLineId === request.id}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                              request.status === 'approved'
                                ? 'bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300'
                                : 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300'
                            }`}
                          >
                            {sendingLineId === request.id ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                กำลังส่ง...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 2C6.48 2 2 6.48 2 12c0 5.52 4.48 10 10 10s10-4.48 10-10c0-5.52-4.48-10-10-10zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.02-1.96 1.25-5.54 3.66-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.37-.49 1.02-.74 3.98-1.73 6.64-2.87 7.97-3.43 3.8-1.57 4.59-1.85 5.1-1.85.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z"/>
                                </svg>
                                ส่ง LINE แจ้งผล{request.status === 'approved' ? ' + Profile' : ''}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Comparison Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Section: ข้อมูลที่สมาชิกแจ้ง */}
                      <div className="bg-blue-50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          ข้อมูลที่สมาชิกแจ้ง
                        </h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">เลขใบอนุญาต:</span>
                            <span className="text-sm font-medium text-gray-900">{request.licenseNumber || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">เบอร์มือถือ:</span>
                            <span className="text-sm font-medium text-gray-900">{request.phone || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-gray-500">ชื่อ LINE:</span>
                            <span className="text-sm font-medium text-gray-900">{request.lineDisplayName || '-'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Section: ข้อมูลจากระบบ */}
                      <div className="bg-green-50 rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          ข้อมูลจากระบบ
                        </h4>
                        {request.systemData ? (
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">รหัสสมาชิก:</span>
                              <span className="text-sm font-bold text-blue-600">{request.memberId}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">ชื่อผู้ติดต่อ:</span>
                              <span className="text-sm font-medium text-gray-900">
                                {request.memberInfo.fullNameTH}
                                {request.memberInfo.nickname && ` (${request.memberInfo.nickname})`}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">ชื่อบริษัท:</span>
                              <span className="text-sm font-medium text-gray-900">{request.systemData.companyNameTH || request.systemData.companyNameEN || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">เลขใบอนุญาต:</span>
                              <span className="text-sm font-medium text-gray-900">{request.systemData.licenseNumber || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">เบอร์มือถือ:</span>
                              <span className="text-sm font-medium text-gray-900">{request.systemData.mobile || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">ชื่อ LINE:</span>
                              <span className="text-sm font-medium text-gray-900">{request.systemData.lineName || '-'}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">รหัสสมาชิก:</span>
                              <span className="text-sm font-bold text-blue-600">{request.memberId}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xs text-gray-500">ชื่อผู้ติดต่อ:</span>
                              <span className="text-sm font-medium text-gray-900">
                                {request.memberInfo.fullNameTH}
                                {request.memberInfo.nickname && ` (${request.memberInfo.nickname})`}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-2">ไม่พบข้อมูลเพิ่มเติมในระบบ</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">ปฏิเสธคำขอ</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เหตุผลในการปฏิเสธ
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="กรุณาระบุเหตุผล (ไม่บังคับ)"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectionReason('');
                }}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={processingId === showRejectModal}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-300"
              >
                ยืนยันปฏิเสธ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
