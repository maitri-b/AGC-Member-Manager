'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface DisputeRequest {
  id: string;
  userId: string;
  lineUserId: string;
  lineDisplayName: string;
  lineImage: string;
  memberId: string;
  licenseNumber: string;
  contactPhone: string;
  contactEmail: string;
  reason: string;
  memberInfo: {
    companyNameTH: string;
    companyNameEN: string;
    fullNameTH: string;
    nickname: string;
    positionClub: string;
  };
  currentLinkedUserInfo?: {
    displayName: string;
    lineUserId: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedByName?: string;
  resolution?: string;
}

export default function AdminDisputesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [disputes, setDisputes] = useState<{
    pending: DisputeRequest[];
    processed: DisputeRequest[];
  }>({ pending: [], processed: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showResolveModal, setShowResolveModal] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [resolution, setResolution] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'processed'>('pending');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    fetchDisputes();
  }, []);

  const fetchDisputes = async () => {
    try {
      const res = await fetch('/api/admin/disputes');
      if (res.ok) {
        const data = await res.json();
        setDisputes({
          pending: data.pending || [],
          processed: data.processed || [],
        });
      }
    } catch (error) {
      console.error('Error fetching disputes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!showResolveModal) return;

    setProcessingId(showResolveModal.id);
    try {
      const res = await fetch('/api/admin/disputes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputeId: showResolveModal.id,
          action: showResolveModal.action,
          resolution,
        }),
      });

      if (res.ok) {
        await fetchDisputes();
        setShowResolveModal(null);
        setResolution('');
        alert(showResolveModal.action === 'approve'
          ? 'อนุมัติและโอนการเชื่อมต่อเรียบร้อยแล้ว'
          : 'ปฏิเสธคำร้องเรียบร้อยแล้ว'
        );
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
            <h1 className="text-xl font-bold text-gray-900">คำร้องแจ้งปัญหา</h1>
            {disputes.pending.length > 0 && (
              <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
                {disputes.pending.length} รอดำเนินการ
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Info Box */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-orange-800">
            <strong>คำร้องแจ้งปัญหา</strong> คือกรณีที่สมาชิกพบว่ามีบัญชี LINE อื่นเชื่อมต่อกับข้อมูลสมาชิกของตนแล้ว
            การอนุมัติจะ<strong>ยกเลิกการเชื่อมต่อเดิม</strong>และเชื่อมต่อบัญชี LINE ของผู้ร้องแทน
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            รอดำเนินการ ({disputes.pending.length})
          </button>
          <button
            onClick={() => setActiveTab('processed')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'processed'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            ดำเนินการแล้ว ({disputes.processed.length})
          </button>
        </div>

        {/* Dispute List */}
        <div className="space-y-4">
          {(activeTab === 'pending' ? disputes.pending : disputes.processed).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-gray-500">
                {activeTab === 'pending' ? 'ไม่มีคำร้องที่รอดำเนินการ' : 'ยังไม่มีคำร้องที่ดำเนินการแล้ว'}
              </p>
            </div>
          ) : (
            (activeTab === 'pending' ? disputes.pending : disputes.processed).map((dispute) => (
              <div key={dispute.id} className="bg-white rounded-xl shadow-sm p-6">
                {/* Header with comparison */}
                <div className="flex items-center gap-2 mb-4 text-orange-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="font-medium">คำร้องแจ้งปัญหาการยืนยันตัวตน</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Requester (B) */}
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-xs text-green-600 font-medium mb-3">ผู้ร้องขอ (ต้องการเชื่อมต่อ)</p>
                    <div className="flex items-center gap-3 mb-3">
                      {dispute.lineImage ? (
                        <Image
                          src={dispute.lineImage}
                          alt={dispute.lineDisplayName}
                          width={48}
                          height={48}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                          <span className="text-green-600 font-medium">
                            {dispute.lineDisplayName?.charAt(0) || '?'}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{dispute.lineDisplayName}</p>
                        <p className="text-xs text-gray-500">LINE Account</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-500">เบอร์ติดต่อ:</span>
                        <span className="ml-2 font-medium text-gray-900">{dispute.contactPhone}</span>
                      </div>
                      {dispute.contactEmail && (
                        <div>
                          <span className="text-gray-500">อีเมล:</span>
                          <span className="ml-2 font-medium text-gray-900">{dispute.contactEmail}</span>
                        </div>
                      )}
                      {dispute.reason && (
                        <div>
                          <span className="text-gray-500">เหตุผล:</span>
                          <p className="mt-1 text-gray-900">{dispute.reason}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Current linked user (A) */}
                  <div className="bg-red-50 rounded-lg p-4">
                    <p className="text-xs text-red-600 font-medium mb-3">ผู้ที่เชื่อมต่ออยู่ปัจจุบัน</p>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-red-200 rounded-full flex items-center justify-center">
                        <span className="text-red-600 font-medium">
                          {dispute.currentLinkedUserInfo?.displayName?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {dispute.currentLinkedUserInfo?.displayName || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500">LINE Account ปัจจุบัน</p>
                      </div>
                    </div>
                    <p className="text-sm text-red-600">
                      หากอนุมัติ บัญชีนี้จะถูกยกเลิกการเชื่อมต่อ
                    </p>
                  </div>
                </div>

                {/* Member Info */}
                <div className="mt-4 bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 font-medium mb-2">ข้อมูลสมาชิกที่ต้องการเชื่อมต่อ</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">รหัสสมาชิก</span>
                      <p className="font-bold text-blue-600">{dispute.memberId}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">ใบอนุญาต</span>
                      <p className="font-medium text-gray-900">{dispute.licenseNumber}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">บริษัท</span>
                      <p className="font-medium text-gray-900">
                        {dispute.memberInfo.companyNameTH || dispute.memberInfo.companyNameEN}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">ผู้ติดต่อ</span>
                      <p className="font-medium text-gray-900">{dispute.memberInfo.fullNameTH}</p>
                    </div>
                  </div>
                </div>

                {/* Timestamp */}
                <div className="mt-4 text-xs text-gray-500">
                  ส่งคำร้องเมื่อ: {new Date(dispute.createdAt).toLocaleString('th-TH')}
                </div>

                {/* Status for processed */}
                {dispute.status !== 'pending' && (
                  <div className={`mt-4 p-3 rounded-lg ${
                    dispute.status === 'approved' ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <p className={`font-medium ${
                      dispute.status === 'approved' ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {dispute.status === 'approved' ? '✓ อนุมัติแล้ว' : '✗ ปฏิเสธแล้ว'}
                      {dispute.resolvedByName && ` โดย ${dispute.resolvedByName}`}
                    </p>
                    {dispute.resolution && (
                      <p className="text-sm text-gray-600 mt-1">{dispute.resolution}</p>
                    )}
                  </div>
                )}

                {/* Actions */}
                {dispute.status === 'pending' && (
                  <div className="mt-4 flex gap-2 justify-end">
                    <button
                      onClick={() => setShowResolveModal({ id: dispute.id, action: 'reject' })}
                      disabled={processingId === dispute.id}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:bg-gray-100 transition-colors"
                    >
                      ปฏิเสธ
                    </button>
                    <button
                      onClick={() => setShowResolveModal({ id: dispute.id, action: 'approve' })}
                      disabled={processingId === dispute.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                    >
                      อนุมัติและโอนการเชื่อมต่อ
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {showResolveModal.action === 'approve' ? 'ยืนยันการอนุมัติ' : 'ยืนยันการปฏิเสธ'}
            </h3>

            {showResolveModal.action === 'approve' ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  <strong>คำเตือน:</strong> การอนุมัติจะยกเลิกการเชื่อมต่อของบัญชี LINE เดิม
                  และเชื่อมต่อบัญชี LINE ของผู้ร้องขอแทน
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-600 mb-4">
                การเชื่อมต่อเดิมจะยังคงใช้งานได้
              </p>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                หมายเหตุ/เหตุผล (ไม่บังคับ)
              </label>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder={showResolveModal.action === 'approve'
                  ? 'เช่น ตรวจสอบเอกสารแล้วพบว่าผู้ร้องเป็นเจ้าของข้อมูลที่แท้จริง'
                  : 'เช่น ไม่สามารถยืนยันตัวตนได้'
                }
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowResolveModal(null);
                  setResolution('');
                }}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-200"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleResolve}
                disabled={processingId !== null}
                className={`flex-1 py-2 rounded-lg font-medium disabled:bg-gray-300 transition-colors ${
                  showResolveModal.action === 'approve'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {processingId ? 'กำลังดำเนินการ...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
