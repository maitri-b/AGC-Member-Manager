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
  companyNameSubmitted?: string;
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
        <div className="space-y-4">
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
              <div key={request.id} className="bg-white rounded-xl shadow-sm p-6">
                {/* Header with LINE Profile and Member ID */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b">
                  <div className="flex items-center gap-4">
                    {request.lineImage ? (
                      <Image
                        src={request.lineImage}
                        alt={request.lineDisplayName}
                        width={56}
                        height={56}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center">
                        <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-gray-900">{request.lineDisplayName}</p>
                      <p className="text-sm text-gray-500">รหัสสมาชิก: <span className="font-bold text-blue-600">{request.memberId}</span></p>
                      <p className="text-xs text-gray-400">{new Date(request.createdAt).toLocaleString('th-TH')}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  {request.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(request.id)}
                        disabled={processingId === request.id}
                        className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                      >
                        {processingId === request.id ? '...' : 'อนุมัติ'}
                      </button>
                      <button
                        onClick={() => setShowRejectModal(request.id)}
                        disabled={processingId === request.id}
                        className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-300 transition-colors"
                      >
                        ปฏิเสธ
                      </button>
                    </div>
                  )}

                  {/* Status for processed requests */}
                  {request.status !== 'pending' && (
                    <div className={`px-4 py-2 rounded-lg ${
                      request.status === 'approved' ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      <p className={`font-medium ${
                        request.status === 'approved' ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {request.status === 'approved' ? '✓ อนุมัติแล้ว' : '✗ ปฏิเสธแล้ว'}
                        {request.approvedByName && ` โดย ${request.approvedByName}`}
                        {request.rejectedByName && ` โดย ${request.rejectedByName}`}
                      </p>
                      {request.rejectionReason && (
                        <p className="text-sm text-red-600 mt-1">เหตุผล: {request.rejectionReason}</p>
                      )}
                    </div>
                  )}
                </div>

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
                        <span className="text-xs text-gray-500">ชื่อบริษัท:</span>
                        <span className="text-sm font-medium text-gray-900">{request.companyNameSubmitted || '-'}</span>
                      </div>
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
                      ข้อมูลจากระบบ (Google Sheet)
                    </h4>
                    {request.systemData ? (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">ชื่อบริษัท (Q):</span>
                          <span className="text-sm font-medium text-gray-900">{request.systemData.companyNameTH || request.systemData.companyNameEN || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">เลขใบอนุญาต (I):</span>
                          <span className="text-sm font-medium text-gray-900">{request.systemData.licenseNumber || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">เบอร์มือถือ (H):</span>
                          <span className="text-sm font-medium text-gray-900">{request.systemData.mobile || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-gray-500">ชื่อ LINE (F):</span>
                          <span className="text-sm font-medium text-gray-900">{request.systemData.lineName || '-'}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">ไม่พบข้อมูลสมาชิกในระบบ</p>
                    )}
                  </div>
                </div>

                {/* Additional Member Info */}
                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">ชื่อผู้ติดต่อ</p>
                      <p className="font-medium text-gray-900">
                        {request.memberInfo.fullNameTH}
                        {request.memberInfo.nickname && ` (${request.memberInfo.nickname})`}
                      </p>
                    </div>
                    {request.memberInfo.positionClub && (
                      <div>
                        <p className="text-xs text-gray-500">ตำแหน่งในสมาคม</p>
                        <p className="font-medium text-gray-900">{request.memberInfo.positionClub}</p>
                      </div>
                    )}
                  </div>
                </div>
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
