'use client';

import { useState, useEffect } from 'react';
import { Carpool, CarpoolMember } from '@/types/carpool';

interface CarpoolManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
}

interface EnrichedCarpool extends Carpool {
  ownerCompanyName: string;
  ownerContactName: string;
}

export default function CarpoolManagementModal({
  isOpen,
  onClose,
  eventId,
  eventName,
}: CarpoolManagementModalProps) {
  const [carpools, setCarpools] = useState<EnrichedCarpool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create/Edit Carpool modal state
  const [showCarpoolForm, setShowCarpoolForm] = useState(false);
  const [editingCarpoolId, setEditingCarpoolId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    licensePlate: '',
    ownerRegistrationId: '',
    members: [] as CarpoolMember[],
  });
  const [saving, setSaving] = useState(false);

  // Delete confirmation modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingCarpoolId, setDeletingCarpoolId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCarpools();
    }
  }, [isOpen, eventId]);

  const fetchCarpools = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/carpools`);
      if (!response.ok) {
        throw new Error('Failed to fetch carpools');
      }
      const data = await response.json();
      setCarpools(data.carpools || []);
    } catch (err) {
      console.error('Error fetching carpools:', err);
      setError(err instanceof Error ? err.message : 'Failed to load carpools');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCarpool = () => {
    setEditingCarpoolId(null);
    setFormData({
      licensePlate: '',
      ownerRegistrationId: '',
      members: [],
    });
    setShowCarpoolForm(true);
  };

  const handleEditCarpool = (carpool: EnrichedCarpool) => {
    setEditingCarpoolId(carpool.carpoolId);
    setFormData({
      licensePlate: carpool.licensePlate,
      ownerRegistrationId: carpool.ownerRegistrationId,
      members: carpool.members,
    });
    setShowCarpoolForm(true);
  };

  const handleSaveCarpool = async () => {
    setSaving(true);
    try {
      if (editingCarpoolId) {
        // Update existing Carpool
        const response = await fetch(`/api/carpools/${editingCarpoolId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licensePlate: formData.licensePlate,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update carpool');
        }
      } else {
        // Create new Carpool
        const response = await fetch('/api/carpools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            ownerRegistrationId: formData.ownerRegistrationId,
            licensePlate: formData.licensePlate,
            members: formData.members,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create carpool');
        }
      }

      // Refresh list
      await fetchCarpools();
      setShowCarpoolForm(false);
    } catch (err) {
      console.error('Error saving carpool:', err);
      alert(err instanceof Error ? err.message : 'Failed to save carpool');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (carpoolId: string) => {
    setDeletingCarpoolId(carpoolId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCarpoolId) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/carpools/${deletingCarpoolId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete carpool');
      }

      // Refresh list
      await fetchCarpools();
      setDeleteConfirmOpen(false);
      setDeletingCarpoolId(null);
    } catch (err) {
      console.error('Error deleting carpool:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete carpool');
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">จัดการ Carpool</h2>
            <p className="text-sm text-gray-600 mt-1">{eventName}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateCarpool}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + สร้าง Carpool
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 mt-2">กำลังโหลดข้อมูล...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && carpools.length === 0 && (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              <p className="text-gray-600 text-lg">ยังไม่มี Carpool</p>
              <p className="text-gray-500 text-sm mt-1">คลิก "สร้าง Carpool" เพื่อเริ่มต้น</p>
            </div>
          )}

          {!loading && !error && carpools.length > 0 && (
            <div className="grid gap-4">
              {carpools.map((carpool) => (
                <div
                  key={carpool.carpoolId}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          🚗 {carpool.licensePlate}
                        </h3>
                        {carpool.assignedCarNumber && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                            รถคันที่ {carpool.assignedCarNumber}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>
                          <strong>บริษัท:</strong> {carpool.ownerCompanyName}
                        </p>
                        <p>
                          <strong>ผู้ติดต่อ:</strong> {carpool.ownerContactName}
                        </p>
                        <p>
                          <strong>รหัสจอง:</strong> {carpool.ownerRegistrationId}
                        </p>
                        <p>
                          <strong>จำนวนสมาชิก:</strong> {carpool.members.length} คน
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditCarpool(carpool)}
                        className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                      >
                        แก้ไข
                      </button>
                      <button
                        onClick={() => handleDeleteClick(carpool.carpoolId)}
                        className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Carpool Modal */}
      {showCarpoolForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {editingCarpoolId ? 'แก้ไข Carpool' : 'สร้าง Carpool ใหม่'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลขทะเบียนรถ *
                </label>
                <input
                  type="text"
                  value={formData.licensePlate}
                  onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                  placeholder="กท 1234"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {!editingCarpoolId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    รหัสการจอง (Owner) *
                  </label>
                  <input
                    type="text"
                    value={formData.ownerRegistrationId}
                    onChange={(e) => setFormData({ ...formData, ownerRegistrationId: e.target.value })}
                    placeholder="REG_xxxxx"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ต้องระบุรหัสการจองสำหรับสร้าง Carpool ใหม่
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCarpoolForm(false)}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveCarpool}
                disabled={saving || !formData.licensePlate || (!editingCarpoolId && !formData.ownerRegistrationId)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">ยืนยันการลบ Carpool</h3>
            <p className="text-gray-600 mb-6">
              คุณแน่ใจหรือไม่ว่าต้องการลบ Carpool นี้? การกระทำนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? 'กำลังลบ...' : 'ลบ Carpool'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
