'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { hasPermission } from '@/lib/permissions';

interface ChangeRequest {
  id: string;
  userId: string;
  memberId: string;
  lineDisplayName: string;
  lineImage?: string;
  status: 'pending' | 'approved' | 'rejected';
  changes: Record<string, { oldValue: string; newValue: string }>;
  reason: string;
  createdAt: string;
  processedAt?: string;
  processedByName?: string;
  adminNote?: string;
}

export default function AdminProfileChangesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user) {
      if (!hasPermission(session.user.permissions || [], 'admin:users')) {
        router.push('/unauthorized');
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchRequests();
    }
  }, [status, filter]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Fetch requests based on filter - API now returns pendingCount in every response
      const response = await fetch(`/api/admin/profile-changes?status=${filter}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
        // API returns pendingCount in every response
        setPendingCount(data.pendingCount || 0);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const openModal = (request: ChangeRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setModalAction(action);
    setAdminNote('');
    setShowModal(true);
  };

  const handleAction = async () => {
    if (!selectedRequest || !modalAction) return;

    setProcessing(selectedRequest.id);
    try {
      const response = await fetch('/api/admin/profile-changes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          action: modalAction,
          adminNote,
        }),
      });

      if (response.ok) {
        setShowModal(false);
        setSelectedRequest(null);
        setAdminNote('');
        fetchRequests();
      } else {
        const data = await response.json();
        alert(data.error || 'เกิดข้อผิดพลาด');
      }
    } catch (error) {
      console.error('Error processing request:', error);
      alert('เกิดข้อผิดพลาดในการประมวลผล');
    } finally {
      setProcessing(null);
    }
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      fullNameTH: 'ชื่อเต็ม',
      nickname: 'ชื่อเล่น',
      companyNameTH: 'ชื่อบริษัท (TH)',
      companyNameEN: 'ชื่อบริษัท (EN)',
      positionCompany: 'ตำแหน่งในบริษัท',
      licenseNumber: 'เลขที่ใบอนุญาต',
    };
    return labels[field] || field;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('th-TH');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">รอการอนุมัติ</span>;
      case 'approved':
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">อนุมัติแล้ว</span>;
      case 'rejected':
        return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">ไม่อนุมัติ</span>;
      default:
        return null;
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push('/admin')}
              className="text-red-600 hover:text-red-800 flex items-center gap-2 mb-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              กลับหน้าจัดการระบบ
            </button>
            <h1 className="text-2xl font-bold text-gray-900">คำขอแก้ไขข้อมูลส่วนตัว</h1>
            <p className="text-gray-600 mt-1">ตรวจสอบและอนุมัติคำขอแก้ไขข้อมูลจากสมาชิก</p>
          </div>
        </div>

        {/* Summary Alert */}
        {pendingCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-yellow-800">
                  มีคำขอรอการอนุมัติ {pendingCount} รายการ
                </p>
                <p className="text-sm text-yellow-700">กรุณาตรวจสอบและดำเนินการ</p>
              </div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {[
                { key: 'pending', label: 'รอการอนุมัติ' },
                { key: 'approved', label: 'อนุมัติแล้ว' },
                { key: 'rejected', label: 'ไม่อนุมัติ' },
                { key: 'all', label: 'ทั้งหมด' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key as typeof filter)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    filter === tab.key
                      ? 'border-red-600 text-red-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.key === 'pending' && pendingCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">ไม่มีคำขอ{filter === 'pending' ? 'ที่รอการอนุมัติ' : ''}</p>
            </div>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {request.lineImage ? (
                      <img
                        src={request.lineImage}
                        alt={request.lineDisplayName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-gray-500 font-medium">
                          {request.lineDisplayName?.charAt(0) || '?'}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-gray-900">{request.lineDisplayName}</p>
                      <p className="text-sm text-gray-500">รหัสสมาชิก: {request.memberId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(request.status)}
                    <span className="text-sm text-gray-500">{formatDate(request.createdAt)}</span>
                  </div>
                </div>

                {/* Changes */}
                <div className="p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">รายการที่ขอแก้ไข:</h4>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    {Object.entries(request.changes).map(([field, values]) => (
                      <div key={field} className="flex items-center gap-4">
                        <span className="text-sm font-medium text-gray-600 w-40">{getFieldLabel(field)}:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-red-600 line-through bg-red-50 px-2 py-1 rounded">
                            {values.oldValue || '(ว่าง)'}
                          </span>
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                          <span className="text-sm text-green-600 bg-green-50 px-2 py-1 rounded">
                            {values.newValue || '(ว่าง)'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {request.reason && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">เหตุผลในการขอแก้ไข:</h4>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{request.reason}</p>
                    </div>
                  )}

                  {request.status !== 'pending' && request.processedAt && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>{request.status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}โดย:</span>
                        <span className="font-medium">{request.processedByName || 'Admin'}</span>
                        <span>เมื่อ</span>
                        <span>{formatDate(request.processedAt)}</span>
                      </div>
                      {request.adminNote && (
                        <p className="text-sm text-gray-600 mt-2">
                          <span className="font-medium">หมายเหตุ:</span> {request.adminNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {request.status === 'pending' && (
                  <div className="px-4 py-3 bg-gray-50 border-t flex justify-end gap-3">
                    <button
                      onClick={() => openModal(request, 'reject')}
                      disabled={processing === request.id}
                      className="px-4 py-2 border border-red-600 text-red-600 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      ไม่อนุมัติ
                    </button>
                    <button
                      onClick={() => openModal(request, 'approve')}
                      disabled={processing === request.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      อนุมัติ
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {/* Confirmation Modal */}
      {showModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {modalAction === 'approve' ? 'ยืนยันการอนุมัติ' : 'ยืนยันการไม่อนุมัติ'}
              </h3>

              <p className="text-gray-600 mb-4">
                {modalAction === 'approve'
                  ? 'คุณต้องการอนุมัติคำขอแก้ไขข้อมูลนี้หรือไม่? ระบบจะทำการอัปเดตข้อมูลใน Google Sheet ทันที'
                  : 'คุณต้องการปฏิเสธคำขอแก้ไขข้อมูลนี้หรือไม่?'}
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  หมายเหตุถึงสมาชิก (ถ้ามี)
                </label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={modalAction === 'reject' ? 'กรุณาระบุเหตุผลที่ไม่อนุมัติ...' : 'หมายเหตุเพิ่มเติม (ถ้ามี)'}
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setSelectedRequest(null);
                    setAdminNote('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleAction}
                  disabled={processing === selectedRequest.id}
                  className={`px-4 py-2 text-white rounded-md transition-colors disabled:opacity-50 ${
                    modalAction === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {processing === selectedRequest.id
                    ? 'กำลังดำเนินการ...'
                    : modalAction === 'approve'
                    ? 'อนุมัติ'
                    : 'ไม่อนุมัติ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
