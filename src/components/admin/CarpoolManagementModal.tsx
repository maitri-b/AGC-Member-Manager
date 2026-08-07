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

interface CarSlot {
  carNumber: number;
  carpool: EnrichedCarpool | null;
}

export default function CarpoolManagementModal({
  isOpen,
  onClose,
  eventId,
  eventName,
}: CarpoolManagementModalProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<'carpools' | 'car-numbers'>('carpools');

  const [carpools, setCarpools] = useState<EnrichedCarpool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Car number assignment state
  const [totalCars, setTotalCars] = useState(10);
  const [carSlots, setCarSlots] = useState<CarSlot[]>([]);

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

  // Member management modal state
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [managingCarpoolId, setManagingCarpoolId] = useState<string | null>(null);
  const [expandedCarpoolId, setExpandedCarpoolId] = useState<string | null>(null);

  // Registration search for inviting members
  const [searchRegistrationId, setSearchRegistrationId] = useState('');
  const [searchedRegistration, setSearchedRegistration] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMembersToAdd, setSelectedMembersToAdd] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchCarpools();
    }
  }, [isOpen, eventId]);

  // Generate car slots based on totalCars and carpools
  useEffect(() => {
    const slots: CarSlot[] = [];
    for (let i = 1; i <= totalCars; i++) {
      const assignedCarpool = carpools.find((cp) => cp.assignedCarNumber === i);
      slots.push({
        carNumber: i,
        carpool: assignedCarpool || null,
      });
    }
    setCarSlots(slots);
  }, [totalCars, carpools]);

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
        const payload = {
          eventId,
          ownerRegistrationId: formData.ownerRegistrationId,
          licensePlate: formData.licensePlate,
          members: formData.members,
        };

        const response = await fetch('/api/carpools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
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

  const handleManageMembers = (carpoolId: string) => {
    setManagingCarpoolId(carpoolId);
    setShowMemberManagement(true);
    setSearchRegistrationId('');
    setSearchedRegistration(null);
    setSelectedMembersToAdd([]);
  };

  const handleToggleExpand = (carpoolId: string) => {
    setExpandedCarpoolId(expandedCarpoolId === carpoolId ? null : carpoolId);
  };

  const handleRemoveMember = async (carpoolId: string, lineUserId: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสมาชิกคนนี้ออกจาก Carpool?')) {
      return;
    }

    try {
      const response = await fetch(`/api/carpools/${carpoolId}/remove-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserIds: [lineUserId] }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove member');
      }

      // Refresh list
      await fetchCarpools();
    } catch (err) {
      console.error('Error removing member:', err);
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleSearchRegistration = async () => {
    if (!searchRegistrationId.trim()) {
      alert('กรุณาใส่รหัสการจอง');
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/registrations/${searchRegistrationId}`);
      if (!response.ok) {
        throw new Error('ไม่พบรหัสการจองนี้');
      }

      const data = await response.json();
      setSearchedRegistration(data.registration);
      setSelectedMembersToAdd([]);
    } catch (err) {
      console.error('Error searching registration:', err);
      alert(err instanceof Error ? err.message : 'ไม่พบรหัสการจอง');
      setSearchedRegistration(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddSelectedMembers = async () => {
    if (!managingCarpoolId || selectedMembersToAdd.length === 0) {
      alert('กรุณาเลือกสมาชิกที่ต้องการเพิ่ม');
      return;
    }

    if (!searchedRegistration) {
      return;
    }

    try {
      // Parse attendee names
      const attendeeNames = searchedRegistration.attendeeNames
        ? searchedRegistration.attendeeNames.split(',').map((n: string) => n.trim())
        : [];

      // Build members array from selected indices
      const membersToAdd: CarpoolMember[] = selectedMembersToAdd.map((indexStr) => {
        const index = parseInt(indexStr);
        return {
          registrationId: searchedRegistration.registrationId,
          lineUserId: searchedRegistration.lineUserId,
          name: attendeeNames[index] || `ผู้เข้าร่วมคนที่ ${index + 1}`,
          isOwner: false,
        };
      });

      const response = await fetch(`/api/carpools/${managingCarpoolId}/add-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members: membersToAdd }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add members');
      }

      // Refresh list and close modal
      await fetchCarpools();
      setShowMemberManagement(false);
      setManagingCarpoolId(null);
      setSearchRegistrationId('');
      setSearchedRegistration(null);
      setSelectedMembersToAdd([]);
    } catch (err) {
      console.error('Error adding members:', err);
      alert(err instanceof Error ? err.message : 'Failed to add members');
    }
  };

  // Car number assignment handlers
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assigningCarNumber, setAssigningCarNumber] = useState<number | null>(null);
  const [selectedCarpoolId, setSelectedCarpoolId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const handleAssignClick = (carNumber: number) => {
    setAssigningCarNumber(carNumber);
    setSelectedCarpoolId(null);
    setShowAssignmentModal(true);
  };

  const handleUnassign = async (carpoolId: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกเลขรถนี้?')) {
      return;
    }

    try {
      const response = await fetch(`/api/carpools/${carpoolId}/unassign-car-number`, {
        method: 'PUT',
      });

      if (!response.ok) {
        throw new Error('Failed to unassign car number');
      }

      // Refresh list
      await fetchCarpools();
    } catch (err) {
      console.error('Error unassigning car number:', err);
      alert(err instanceof Error ? err.message : 'Failed to unassign car number');
    }
  };

  const handleConfirmAssignment = async () => {
    if (!selectedCarpoolId || !assigningCarNumber) {
      alert('กรุณาเลือก Carpool');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch(`/api/carpools/${selectedCarpoolId}/assign-car-number`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carNumber: assigningCarNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign car number');
      }

      // Refresh list and close modal
      await fetchCarpools();
      setShowAssignmentModal(false);
      setAssigningCarNumber(null);
      setSelectedCarpoolId(null);
    } catch (err) {
      console.error('Error assigning car number:', err);
      alert(err instanceof Error ? err.message : 'Failed to assign car number');
    } finally {
      setAssigning(false);
    }
  };

  const availableCarpools = carpools.filter((cp) => !cp.assignedCarNumber);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200">
          <div className="flex items-center justify-between p-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">จัดการ Carpool</h2>
              <p className="text-sm text-gray-600 mt-1">{eventName}</p>
            </div>
            <div className="flex items-center gap-3">
              {activeTab === 'carpools' && (
                <button
                  onClick={handleCreateCarpool}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  + สร้าง Carpool
                </button>
              )}
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

          {/* Tabs */}
          <div className="flex border-t border-gray-200">
            <button
              onClick={() => setActiveTab('carpools')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'carpools'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              รายการ Carpool
            </button>
            <button
              onClick={() => setActiveTab('car-numbers')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'car-numbers'
                  ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              จัดเลขรถ
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
              {carpools.map((carpool) => {
                const isExpanded = expandedCarpoolId === carpool.carpoolId;
                return (
                  <div
                    key={carpool.carpoolId}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
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
                          onClick={() => handleToggleExpand(carpool.carpoolId)}
                          className="px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          title={isExpanded ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด'}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
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

                    {/* Expanded Member List */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-900">รายชื่อสมาชิก</h4>
                          <button
                            onClick={() => handleManageMembers(carpool.carpoolId)}
                            className="px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors"
                          >
                            + เพิ่มสมาชิก
                          </button>
                        </div>

                        {carpool.members.length === 0 ? (
                          <p className="text-sm text-gray-500 italic">ยังไม่มีสมาชิก</p>
                        ) : (
                          <div className="space-y-2">
                            {carpool.members.map((member, index) => (
                              <div
                                key={`${member.lineUserId}-${index}`}
                                className="flex items-center justify-between p-2 bg-gray-50 rounded"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">
                                    {member.name}
                                  </span>
                                  {member.isOwner && (
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                      เจ้าของ
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500">
                                    ({member.registrationId})
                                  </span>
                                </div>
                                {!member.isOwner && (
                                  <button
                                    onClick={() => handleRemoveMember(carpool.carpoolId, member.lineUserId)}
                                    className="text-xs text-red-600 hover:text-red-800 transition-colors"
                                  >
                                    ลบ
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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

      {/* Member Management Modal */}
      {showMemberManagement && managingCarpoolId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">เพิ่มสมาชิกเข้า Carpool</h3>
              <button
                onClick={() => {
                  setShowMemberManagement(false);
                  setManagingCarpoolId(null);
                  setSearchRegistrationId('');
                  setSearchedRegistration(null);
                  setSelectedMembersToAdd([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Search Registration */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ค้นหารหัสการจอง
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchRegistrationId}
                    onChange={(e) => setSearchRegistrationId(e.target.value)}
                    placeholder="REG_xxxxx"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchRegistration();
                      }
                    }}
                  />
                  <button
                    onClick={handleSearchRegistration}
                    disabled={searchLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {searchLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
                  </button>
                </div>
              </div>

              {/* Search Results */}
              {searchedRegistration && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="mb-4">
                    <h4 className="font-semibold text-gray-900 mb-2">ข้อมูลการจอง</h4>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p><strong>บริษัท:</strong> {searchedRegistration.companyName}</p>
                      <p><strong>ผู้ติดต่อ:</strong> {searchedRegistration.contactName}</p>
                      <p><strong>รหัสจอง:</strong> {searchedRegistration.registrationId}</p>
                      <p><strong>จำนวนผู้เข้าร่วม:</strong> {searchedRegistration.attendeeCount} คน</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">เลือกสมาชิกที่ต้องการเพิ่ม</h4>
                    <div className="space-y-2">
                      {searchedRegistration.attendeeNames ? (
                        searchedRegistration.attendeeNames.split(',').map((name: string, index: number) => {
                          const trimmedName = name.trim();
                          const isSelected = selectedMembersToAdd.includes(index.toString());
                          // Check if this member is already in any Carpool
                          const isInCarpool = carpools.some((cp) =>
                            cp.members.some(
                              (m) =>
                                m.registrationId === searchedRegistration.registrationId &&
                                m.lineUserId === searchedRegistration.lineUserId &&
                                m.name === trimmedName
                            )
                          );

                          return (
                            <label
                              key={index}
                              className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                                isInCarpool
                                  ? 'bg-gray-100 cursor-not-allowed'
                                  : isSelected
                                  ? 'bg-blue-50'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isInCarpool}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedMembersToAdd([...selectedMembersToAdd, index.toString()]);
                                  } else {
                                    setSelectedMembersToAdd(
                                      selectedMembersToAdd.filter((i) => i !== index.toString())
                                    );
                                  }
                                }}
                                className="rounded"
                              />
                              <span className={`text-sm ${isInCarpool ? 'text-gray-400' : 'text-gray-900'}`}>
                                {trimmedName}
                              </span>
                              {isInCarpool && (
                                <span className="text-xs text-gray-500 italic">(อยู่ใน Carpool แล้ว)</span>
                              )}
                            </label>
                          );
                        })
                      ) : (
                        <p className="text-sm text-gray-500 italic">ไม่มีรายชื่อผู้เข้าร่วม</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!searchedRegistration && !searchLoading && (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">ใส่รหัสการจองเพื่อค้นหาสมาชิก</p>
                </div>
              )}
            </div>

            {/* Footer */}
            {searchedRegistration && (
              <div className="flex gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowMemberManagement(false);
                    setManagingCarpoolId(null);
                    setSearchRegistrationId('');
                    setSearchedRegistration(null);
                    setSelectedMembersToAdd([]);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleAddSelectedMembers}
                  disabled={selectedMembersToAdd.length === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  เพิ่มสมาชิก ({selectedMembersToAdd.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
