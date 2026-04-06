'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Toast, useToast } from '@/components/Toast';

interface Application {
  id: string;
  applicationId: string;
  companyNameEN: string;
  companyNameTH: string;
  nickname: string;
  positionCompany: string;
  licenseNumber: string;
  lineId: string;
  lineName: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  sponsor1: string;
  sponsor2: string;
  lineUserId: string;
  lineDisplayName: string;
  lineProfilePicture: string;
  status: 'pending' | 'approved' | 'rejected';
  documentStatus: 'pending' | 'received';
  notes?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedByName?: string;
  rejectedAt?: string;
  rejectedByName?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'รอพิจารณา', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'อนุมัติแล้ว', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'ไม่อนุมัติ', color: 'bg-red-100 text-red-800' },
};

const DOC_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'รอเอกสาร', color: 'bg-orange-100 text-orange-800' },
  received: { label: 'ได้รับเอกสารแล้ว', color: 'bg-blue-100 text-blue-800' },
};

export default function ApplicationsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/login');
    }
  }, [sessionStatus, router]);

  useEffect(() => {
    if (session) {
      fetchApplications();
    }
  }, [session, filter]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/applications?status=${filter}`);
      if (!response.ok) {
        if (response.status === 403) {
          router.push('/unauthorized');
          return;
        }
        throw new Error('Failed to fetch applications');
      }
      const data = await response.json();
      setApplications(data.applications || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (app: Application) => {
    setSelectedApp(app);
    setNotes(app.notes || '');
    setRejectionReason(app.rejectionReason || '');
    setShowModal(true);
  };

  const handleUpdateStatus = async (newStatus: 'approved' | 'rejected') => {
    if (!selectedApp) return;

    if (newStatus === 'rejected' && !rejectionReason.trim()) {
      toast.error('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
      return;
    }

    setUpdating(true);
    try {
      const response = await fetch('/api/admin/applications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: selectedApp.id,
          status: newStatus,
          rejectionReason: newStatus === 'rejected' ? rejectionReason : undefined,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update');
      }

      toast.success(newStatus === 'approved' ? 'อนุมัติใบสมัครเรียบร้อย' : 'ปฏิเสธใบสมัครเรียบร้อย');
      setShowModal(false);
      fetchApplications();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateDocStatus = async (docStatus: 'pending' | 'received') => {
    if (!selectedApp) return;

    setUpdating(true);
    try {
      const response = await fetch('/api/admin/applications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: selectedApp.id,
          documentStatus: docStatus,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update');
      }

      toast.success('อัพเดทสถานะเอกสารเรียบร้อย');
      setSelectedApp({ ...selectedApp, documentStatus: docStatus });
      fetchApplications();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setUpdating(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedApp) return;

    setUpdating(true);
    try {
      const response = await fetch('/api/admin/applications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: selectedApp.id,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update');
      }

      toast.success('บันทึกหมายเหตุเรียบร้อย');
      setSelectedApp({ ...selectedApp, notes });
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (appId: string) => {
    if (!confirm('ต้องการลบใบสมัครนี้หรือไม่?')) return;

    try {
      const response = await fetch(`/api/admin/applications?id=${appId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete');
      }

      toast.success('ลบใบสมัครเรียบร้อย');
      setShowModal(false);
      fetchApplications();
    } catch (error) {
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-gray-500 hover:text-gray-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-xl font-semibold text-gray-800">
                จัดการใบสมัครสมาชิก
              </h1>
            </div>
            <div className="text-sm text-gray-500">
              {applications.length} รายการ
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow-sm p-1 mb-6 inline-flex">
          {[
            { value: 'pending', label: 'รอพิจารณา' },
            { value: 'approved', label: 'อนุมัติแล้ว' },
            { value: 'rejected', label: 'ไม่อนุมัติ' },
            { value: 'all', label: 'ทั้งหมด' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Applications Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {applications.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500">ไม่พบใบสมัคร</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ผู้สมัคร</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">บริษัท</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">เลขใบอนุญาต</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">เอกสาร</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">วันที่สมัคร</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {applications.map((app) => (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {app.lineProfilePicture ? (
                            <img
                              src={app.lineProfilePicture}
                              alt=""
                              className="w-10 h-10 rounded-full"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-gray-500 text-sm">{app.nickname?.charAt(0)}</span>
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{app.nickname}</div>
                            <div className="text-sm text-gray-500">{app.companyNameTH}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">{app.companyNameEN}</div>
                        <div className="text-xs text-gray-500">{app.positionCompany}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-gray-900">{app.licenseNumber}</span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${STATUS_LABELS[app.status]?.color}`}>
                          {STATUS_LABELS[app.status]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${DOC_STATUS_LABELS[app.documentStatus || 'pending']?.color}`}>
                          {DOC_STATUS_LABELS[app.documentStatus || 'pending']?.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(app.createdAt)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => handleViewDetails(app)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          ดูรายละเอียด
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showModal && selectedApp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                รายละเอียดใบสมัคร
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Applicant Info */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                {selectedApp.lineProfilePicture ? (
                  <img
                    src={selectedApp.lineProfilePicture}
                    alt=""
                    className="w-16 h-16 rounded-full"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-gray-500 text-xl">{selectedApp.nickname?.charAt(0)}</span>
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">{selectedApp.nickname}</h3>
                  <p className="text-sm text-gray-600">{selectedApp.companyNameTH}</p>
                  <p className="text-sm text-gray-500">{selectedApp.lineDisplayName} (LINE)</p>
                </div>
                <div className="ml-auto flex gap-2">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${STATUS_LABELS[selectedApp.status]?.color}`}>
                    {STATUS_LABELS[selectedApp.status]?.label}
                  </span>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${DOC_STATUS_LABELS[selectedApp.documentStatus || 'pending']?.color}`}>
                    {DOC_STATUS_LABELS[selectedApp.documentStatus || 'pending']?.label}
                  </span>
                </div>
              </div>

              {/* Company Info */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">ข้อมูลบริษัท</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">บริษัท (EN):</span>
                    <p className="font-medium">{selectedApp.companyNameEN}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">ตำแหน่ง:</span>
                    <p className="font-medium">{selectedApp.positionCompany}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">เลขใบอนุญาต:</span>
                    <p className="font-medium font-mono">{selectedApp.licenseNumber}</p>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">ข้อมูลติดต่อ</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">LINE ID:</span>
                    <p className="font-medium">{selectedApp.lineId}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">ชื่อ LINE:</span>
                    <p className="font-medium">{selectedApp.lineName}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">อีเมล:</span>
                    <p className="font-medium">{selectedApp.email}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">มือถือ:</span>
                    <p className="font-medium">{selectedApp.mobile}</p>
                  </div>
                  {selectedApp.phone && (
                    <div>
                      <span className="text-gray-500">โทรศัพท์:</span>
                      <p className="font-medium">{selectedApp.phone}</p>
                    </div>
                  )}
                  {selectedApp.website && (
                    <div>
                      <span className="text-gray-500">เว็บไซต์:</span>
                      <p className="font-medium">{selectedApp.website}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sponsors */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">ผู้รับรอง</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">ผู้รับรอง 1:</span>
                    <p className="font-medium">{selectedApp.sponsor1}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">ผู้รับรอง 2:</span>
                    <p className="font-medium">{selectedApp.sponsor2}</p>
                  </div>
                </div>
              </div>

              {/* Document Status */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">สถานะเอกสาร</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateDocStatus('pending')}
                    disabled={updating || selectedApp.documentStatus === 'pending'}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      selectedApp.documentStatus === 'pending'
                        ? 'bg-orange-100 text-orange-800 font-medium'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    รอเอกสาร
                  </button>
                  <button
                    onClick={() => handleUpdateDocStatus('received')}
                    disabled={updating || selectedApp.documentStatus === 'received'}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      selectedApp.documentStatus === 'received'
                        ? 'bg-blue-100 text-blue-800 font-medium'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    ได้รับเอกสารแล้ว
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <h4 className="font-medium text-gray-700 mb-3">หมายเหตุ</h4>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เพิ่มหมายเหตุ..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  onClick={handleSaveNotes}
                  disabled={updating}
                  className="mt-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  บันทึกหมายเหตุ
                </button>
              </div>

              {/* Rejection Reason (for rejected or when rejecting) */}
              {(selectedApp.status === 'rejected' || selectedApp.status === 'pending') && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-3">เหตุผลที่ไม่อนุมัติ</h4>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="ระบุเหตุผล (จำเป็นต้องกรอกเมื่อไม่อนุมัติ)"
                    rows={2}
                    disabled={selectedApp.status === 'rejected'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-50"
                  />
                </div>
              )}

              {/* Dates */}
              <div className="text-xs text-gray-500 pt-4 border-t">
                <p>สมัครเมื่อ: {formatDate(selectedApp.createdAt)}</p>
                {selectedApp.approvedAt && (
                  <p>อนุมัติเมื่อ: {formatDate(selectedApp.approvedAt)} โดย {selectedApp.approvedByName}</p>
                )}
                {selectedApp.rejectedAt && (
                  <p>ปฏิเสธเมื่อ: {formatDate(selectedApp.rejectedAt)} โดย {selectedApp.rejectedByName}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex items-center justify-between">
              <button
                onClick={() => handleDelete(selectedApp.id)}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md"
              >
                ลบใบสมัคร
              </button>

              {selectedApp.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateStatus('rejected')}
                    disabled={updating}
                    className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50"
                  >
                    ไม่อนุมัติ
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('approved')}
                    disabled={updating}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    อนุมัติ
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toast toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  );
}
