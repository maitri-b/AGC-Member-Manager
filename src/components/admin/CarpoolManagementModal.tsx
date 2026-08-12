'use client';

import { useState, useEffect } from 'react';
import { Carpool, CarpoolMember } from '@/types/carpool';

interface CarpoolManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  carpoolSettings?: {
    totalCarNumbers: number;
    maxSeatsPerCar?: number;
    showCarNumbersToMembers?: boolean;
    carpoolActive?: boolean;
  };
  onSettingsUpdate?: () => void; // Callback to refresh parent data after settings update
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
  carpoolSettings,
  onSettingsUpdate,
}: CarpoolManagementModalProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<'carpools' | 'car-numbers'>('carpools');

  const [carpools, setCarpools] = useState<EnrichedCarpool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Car number assignment state - initialized from carpoolSettings
  const [totalCars, setTotalCars] = useState(carpoolSettings?.totalCarNumbers || 10);
  const [showCarNumbers, setShowCarNumbers] = useState(carpoolSettings?.showCarNumbersToMembers ?? false);
  const [carpoolActive, setCarpoolActive] = useState(carpoolSettings?.carpoolActive ?? true); // New: Active/Inactive toggle
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
  const [ownerRegistrationData, setOwnerRegistrationData] = useState<any>(null);
  const [selectedOwnerMembers, setSelectedOwnerMembers] = useState<string[]>([]);

  // Delete confirmation modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingCarpoolId, setDeletingCarpoolId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Delete last member confirmation modal
  const [showDeleteLastMemberModal, setShowDeleteLastMemberModal] = useState(false);
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<{carpoolId: string; lineUserId: string; name: string} | null>(null);

  // Member management modal state
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [managingCarpoolId, setManagingCarpoolId] = useState<string | null>(null);
  const [expandedCarpoolId, setExpandedCarpoolId] = useState<string | null>(null);

  // Registration search for inviting members
  const [searchRegistrationId, setSearchRegistrationId] = useState('');
  const [searchedRegistration, setSearchedRegistration] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMembersToAdd, setSelectedMembersToAdd] = useState<string[]>([]);
  const [allRegistrations, setAllRegistrations] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Change car number modal state
  const [showChangeCarNumberModal, setShowChangeCarNumberModal] = useState(false);
  const [changingCarpool, setChangingCarpool] = useState<EnrichedCarpool | null>(null);
  const [newCarNumber, setNewCarNumber] = useState<number>(0);
  const [changingCarNumber, setChangingCarNumber] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCarpools();
      fetchAllRegistrations();
    }
  }, [isOpen, eventId]);

  // Sync settings with carpoolSettings when it changes
  useEffect(() => {
    if (carpoolSettings?.totalCarNumbers) {
      setTotalCars(carpoolSettings.totalCarNumbers);
    }
    setShowCarNumbers(carpoolSettings?.showCarNumbersToMembers ?? false);
    setCarpoolActive(carpoolSettings?.carpoolActive ?? true);
  }, [carpoolSettings?.totalCarNumbers, carpoolSettings?.showCarNumbersToMembers, carpoolSettings?.carpoolActive]);

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
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/carpools`);
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

  const fetchAllRegistrations = async () => {
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch registrations');
      }
      const data = await response.json();
      setAllRegistrations(data.attendees || []);
    } catch (err) {
      console.error('Error fetching registrations:', err);
    }
  };

  const handleCreateCarpool = () => {
    setEditingCarpoolId(null);
    setFormData({
      licensePlate: '',
      ownerRegistrationId: '',
      members: [],
    });
    setOwnerRegistrationData(null);
    setSelectedOwnerMembers([]);
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

  const fetchOwnerRegistration = async (registrationId: string) => {
    if (!registrationId.trim()) return;

    try {
      const response = await fetch(`/api/registrations/${registrationId}`);
      if (!response.ok) {
        throw new Error('ไม่พบรหัสการจองนี้');
      }

      const data = await response.json();
      setOwnerRegistrationData(data.registration);
    } catch (err) {
      console.error('Error fetching owner registration:', err);
      alert(err instanceof Error ? err.message : 'ไม่พบรหัสการจอง');
      setOwnerRegistrationData(null);
    }
  };

  const handleSaveCarpool = async () => {
    // Validate for new carpool creation
    if (!editingCarpoolId) {
      if (selectedOwnerMembers.length === 0) {
        alert('กรุณาเลือกสมาชิกในรถอย่างน้อย 1 คน');
        return;
      }
    }

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
        // Create new Carpool with selected members
        const members = selectedOwnerMembers.map((name) => ({
          registrationId: formData.ownerRegistrationId,
          lineUserId: ownerRegistrationData?.lineUserId || '',
          name,
        }));

        const payload = {
          eventId,
          ownerRegistrationId: formData.ownerRegistrationId,
          licensePlate: formData.licensePlate,
          members,
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

  const handleRemoveMember = async (carpoolId: string, lineUserId: string, name: string) => {
    // Find the carpool to check member count
    const targetCarpool = carpools.find(cp => cp.carpoolId === carpoolId);

    if (!targetCarpool) {
      alert('ไม่พบข้อมูล Carpool');
      return;
    }

    // Calculate how many members will remain after removing this specific member
    // Use lineUserId + name combination to identify the specific member (same as removal logic)
    const remainingMembers = targetCarpool.members.filter(
      (m: any) => !(m.lineUserId === lineUserId && m.name === name)
    );

    // Check if this is the last member
    if (remainingMembers.length === 0) {
      // Show confirmation modal for deleting entire carpool
      setPendingMemberRemoval({ carpoolId, lineUserId, name });
      setShowDeleteLastMemberModal(true);
      return;
    }

    // Normal confirmation for removing member
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสมาชิกคนนี้ออกจาก Carpool?')) {
      return;
    }

    await executeRemoveMember(carpoolId, lineUserId, name);
  };

  const executeRemoveMember = async (carpoolId: string, lineUserId: string, name: string) => {
    try {
      const response = await fetch(`/api/carpools/${carpoolId}/remove-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: [{ lineUserId, name }],
        }),
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

  const handleConfirmDeleteLastMember = async () => {
    if (!pendingMemberRemoval) return;

    await executeRemoveMember(
      pendingMemberRemoval.carpoolId,
      pendingMemberRemoval.lineUserId,
      pendingMemberRemoval.name
    );

    // Close modal and clear pending state
    setShowDeleteLastMemberModal(false);
    setPendingMemberRemoval(null);
  };

  const handleSearchRegistration = async (regId?: string) => {
    const idToSearch = regId || searchRegistrationId;
    if (!idToSearch.trim()) {
      alert('กรุณาใส่รหัสการจอง');
      return;
    }

    setSearchLoading(true);
    setShowDropdown(false);
    try {
      const response = await fetch(`/api/registrations/${idToSearch}`);
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
          attendeeIndex: index,
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

  const handleSaveSettings = async () => {
    try {
      // Update event carpoolSettings with all settings
      const response = await fetch(`/api/admin/events`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId, // eventId must be in body, not URL
          carpoolSettings: {
            ...carpoolSettings,
            totalCarNumbers: totalCars,
            showCarNumbersToMembers: showCarNumbers,
            carpoolActive: carpoolActive,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      alert(`บันทึกการตั้งค่า Carpool สำเร็จ`);

      // Call parent callback to refresh event data instead of full page reload
      if (onSettingsUpdate) {
        onSettingsUpdate();
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      alert(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

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
          {/* Tab: Carpools List */}
          {activeTab === 'carpools' && (
            <>
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
                            {carpool.members.map((member, index) => {
                              // Clean member name - remove JSON formatting if present
                              let displayName = member.name;
                              try {
                                // If name is JSON string like '["Name"]', parse it
                                const parsed = JSON.parse(member.name);
                                displayName = Array.isArray(parsed) ? parsed[0] : parsed;
                              } catch {
                                // Not JSON, use as-is but remove quotes/brackets
                                displayName = member.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                              }

                              return (
                                <div
                                  key={`${member.lineUserId}-${index}`}
                                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-900">
                                      {displayName}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      ({member.registrationId})
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveMember(carpool.carpoolId, member.lineUserId, member.name)}
                                    className="text-xs text-red-600 hover:text-red-800 transition-colors"
                                  >
                                    ลบ
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
            </>
          )}

          {/* Tab: Car Numbers Assignment */}
          {activeTab === 'car-numbers' && (
            <>
              {loading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <p className="text-gray-600 mt-2">กำลังโหลดข้อมูล...</p>
                </div>
              ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                  {error}
                </div>
              ) : (
                <>
                  {/* Carpool Settings */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="space-y-4">
                      {/* Active/Inactive Toggle */}
                      <div className="flex items-center justify-between pb-3 border-b border-gray-300">
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-semibold text-gray-800">สถานะ Carpool:</label>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCarpoolActive(!carpoolActive)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                carpoolActive ? 'bg-green-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  carpoolActive ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                            <span className={`text-sm font-medium ${carpoolActive ? 'text-green-700' : 'text-gray-600'}`}>
                              {carpoolActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        {!carpoolActive && (
                          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-medium">
                            เห็นเฉพาะ Admin
                          </span>
                        )}
                      </div>

                      {/* Total Cars & Show Numbers */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-medium text-gray-700 w-40">จำนวนรถทั้งหมด:</label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={totalCars}
                            onChange={(e) => setTotalCars(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                            className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <span className="text-xs text-gray-500">คัน</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="text-sm font-medium text-gray-700 w-40">แสดงเลขรถให้สมาชิก:</label>
                          <input
                            type="checkbox"
                            id="showCarNumbersCheckbox"
                            checked={showCarNumbers}
                            onChange={(e) => setShowCarNumbers(e.target.checked)}
                            className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                          />
                          <label htmlFor="showCarNumbersCheckbox" className="text-sm text-gray-600 cursor-pointer">
                            เปิดใช้งาน
                          </label>
                        </div>
                      </div>

                      {/* Save Button */}
                      <div className="pt-3 border-t border-gray-300">
                        <button
                          onClick={handleSaveSettings}
                          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          💾 บันทึกการตั้งค่าทั้งหมด
                        </button>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          การตั้งค่าจะถูกบันทึกลง Event Settings
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Car Slots Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {carSlots.map((slot) => (
                      <div
                        key={slot.carNumber}
                        className={`border rounded-lg p-4 ${
                          slot.carpool
                            ? 'border-purple-300 bg-purple-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-bold text-gray-900">
                            🚗 รถคันที่ {slot.carNumber}
                          </h3>
                        </div>

                        {slot.carpool ? (
                          <div>
                            <div className="space-y-1 text-sm mb-3">
                              <p className="font-semibold text-gray-900">{slot.carpool.licensePlate}</p>
                              <p className="text-gray-600">{slot.carpool.ownerCompanyName}</p>
                              <p className="text-gray-500 text-xs">
                                {slot.carpool.members.length} คน
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setChangingCarpool(slot.carpool);
                                  setNewCarNumber(0);
                                  setShowChangeCarNumberModal(true);
                                }}
                                className="flex-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                              >
                                เปลี่ยนเลขรถ
                              </button>
                              <button
                                onClick={() => handleUnassign(slot.carpool!.carpoolId)}
                                className="flex-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                              >
                                ยกเลิกเลขรถ
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-gray-500 mb-3 italic">ยังไม่มี Carpool</p>
                            <button
                              onClick={() => handleAssignClick(slot.carNumber)}
                              disabled={availableCarpools.length === 0}
                              className="w-full px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              กำหนด Carpool
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {availableCarpools.length === 0 && carpools.length > 0 && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        ✅ Carpool ทั้งหมดได้รับเลขรถแล้ว
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
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
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    รหัสการจอง (Owner) *
                  </label>
                  <input
                    type="text"
                    value={formData.ownerRegistrationId}
                    onChange={(e) => {
                      setFormData({ ...formData, ownerRegistrationId: e.target.value });
                      setShowDropdown(e.target.value.length > 0);
                      setOwnerRegistrationData(null);
                      setSelectedOwnerMembers([]);
                    }}
                    placeholder="พิมพ์เพื่อค้นหา..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    พิมพ์รหัสจอง, ชื่อบริษัท, ชื่อ LINE, หรือชื่อผู้ร่วมทีม
                  </p>

                  {/* Enhanced Search Dropdown */}
                  {showDropdown && formData.ownerRegistrationId && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {allRegistrations
                        .filter((reg) => {
                          const searchLower = formData.ownerRegistrationId.toLowerCase();
                          return (
                            reg.registration.registrationId?.toLowerCase().includes(searchLower) ||
                            reg.registration.companyName?.toLowerCase().includes(searchLower) ||
                            reg.registration.attendeeNames?.toLowerCase().includes(searchLower) ||
                            reg.lineProfile?.lineDisplayName?.toLowerCase().includes(searchLower)
                          );
                        })
                        .slice(0, 10)
                        .map((reg) => (
                          <button
                            key={reg.registration.registrationId}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, ownerRegistrationId: reg.registration.registrationId });
                              setShowDropdown(false);
                              fetchOwnerRegistration(reg.registration.registrationId);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left border-b last:border-b-0"
                          >
                            <img
                              src={reg.lineProfile?.linePictureUrl || '/default-avatar.png'}
                              alt={reg.lineProfile?.lineDisplayName || 'User'}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">
                                {reg.lineProfile?.lineDisplayName || 'ไม่มีชื่อ'}
                              </p>
                              <p className="text-xs text-gray-600 truncate">
                                {reg.registration.companyName || 'ไม่มีชื่อบริษัท'}
                              </p>
                              <p className="text-xs text-blue-600 truncate">
                                {reg.registration.registrationId}
                              </p>
                            </div>
                          </button>
                        ))}
                      {allRegistrations.filter((reg) => {
                        const searchLower = formData.ownerRegistrationId.toLowerCase();
                        return (
                          reg.registration.registrationId?.toLowerCase().includes(searchLower) ||
                          reg.registration.companyName?.toLowerCase().includes(searchLower) ||
                          reg.registration.attendeeNames?.toLowerCase().includes(searchLower) ||
                          reg.lineProfile?.lineDisplayName?.toLowerCase().includes(searchLower)
                        );
                      }).length === 0 && (
                        <div className="px-4 py-3 text-center text-gray-500 text-sm">
                          ไม่พบรหัสการจอง
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Member Selection (shown when ownerRegistrationData is loaded) */}
              {!editingCarpoolId && ownerRegistrationData && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900 text-sm">
                      เลือกสมาชิกที่จะเข้าร่วม Carpool
                    </h4>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          let allNames: string[] = [];
                          const rawNames = ownerRegistrationData.attendeeNames;

                          // Try to parse as JSON first
                          try {
                            const parsed = JSON.parse(rawNames);
                            allNames = Array.isArray(parsed) ? parsed : [rawNames];
                          } catch {
                            // If not JSON, split by comma
                            allNames = rawNames?.split(',').map((n: string) => n.trim()).filter((n: string) => n) || [];
                          }

                          // Filter to only include members NOT already in a carpool
                          const availableNames = allNames.filter((name) => {
                            let isInCarpool = false;
                            carpools.forEach(cp => {
                              const member = cp.members?.find((m: any) => {
                                const cleanName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                                return cleanName === name || m.name === name;
                              });
                              if (member && member.registrationId === formData.ownerRegistrationId) {
                                isInCarpool = true;
                              }
                            });
                            return !isInCarpool;
                          });

                          setSelectedOwnerMembers(availableNames);
                        }}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        เลือกทั้งหมด
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedOwnerMembers([])}
                        className="text-xs px-2 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                      >
                        ยกเลิกทั้งหมด
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(() => {
                      let names: string[] = [];
                      const rawNames = ownerRegistrationData.attendeeNames;

                      // Try to parse as JSON first (handles ["name1", "name2"] format)
                      try {
                        const parsed = JSON.parse(rawNames);
                        names = Array.isArray(parsed) ? parsed : [rawNames];
                      } catch {
                        // If not JSON, split by comma
                        names = rawNames?.split(',').map((n: string) => n.trim()).filter((n: string) => n) || [];
                      }

                      return names.map((name: string, index: number) => {
                        // Check if this member is already in a carpool
                        let isInCarpool = false;
                        let carpoolInfo = '';

                        carpools.forEach(cp => {
                          const member = cp.members?.find((m: any) => {
                            const cleanName = m.name.replace(/^\["|"\]$/g, '').replace(/^['"]|['"]$/g, '');
                            return cleanName === name || m.name === name;
                          });
                          if (member && member.registrationId === formData.ownerRegistrationId) {
                            isInCarpool = true;
                            carpoolInfo = `อยู่ใน Carpool ${cp.licensePlate} แล้ว`;
                          }
                        });

                        return (
                          <label
                            key={index}
                            className={`flex items-center gap-2 p-2 rounded border ${
                              isInCarpool
                                ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                                : 'bg-white border-gray-200 hover:bg-blue-50 cursor-pointer'
                            } transition-colors`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedOwnerMembers.includes(name)}
                              disabled={isInCarpool}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOwnerMembers([...selectedOwnerMembers, name]);
                                } else {
                                  setSelectedOwnerMembers(selectedOwnerMembers.filter((n) => n !== name));
                                }
                              }}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-900 flex-1">
                              {name}
                              {isInCarpool && (
                                <span className="text-xs text-orange-600 ml-2 italic">
                                  ({carpoolInfo})
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      });
                    })() || (
                      <p className="text-sm text-gray-500 italic text-center">ไม่มีรายชื่อสมาชิก</p>
                    )}
                  </div>

                  <p className="text-xs text-gray-600 mt-3">
                    เลือก {selectedOwnerMembers.length} จาก{' '}
                    {(() => {
                      const rawNames = ownerRegistrationData.attendeeNames;
                      try {
                        const parsed = JSON.parse(rawNames);
                        return Array.isArray(parsed) ? parsed.length : 1;
                      } catch {
                        return rawNames?.split(',').filter((n: string) => n.trim()).length || 0;
                      }
                    })()} คน
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
                  ค้นหาการจอง (รหัสจอง, ชื่อบริษัท, ชื่อ LINE, ชื่อผู้ร่วมทีม)
                </label>
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchRegistrationId}
                      onChange={(e) => {
                        setSearchRegistrationId(e.target.value);
                        setShowDropdown(e.target.value.length > 0);
                      }}
                      onFocus={() => searchRegistrationId && setShowDropdown(true)}
                      placeholder="พิมพ์เพื่อค้นหา..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleSearchRegistration();
                        }
                      }}
                    />
                    <button
                      onClick={() => handleSearchRegistration()}
                      disabled={searchLoading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {searchLoading ? 'กำลังค้นหา...' : 'ค้นหา'}
                    </button>
                  </div>

                  {/* Dropdown List */}
                  {showDropdown && searchRegistrationId && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {allRegistrations
                        .filter((reg) => {
                          const searchLower = searchRegistrationId.toLowerCase();
                          const regId = reg.registration.registrationId?.toLowerCase() || '';
                          const company = reg.registration.companyName?.toLowerCase() || '';
                          const attendeeNames = reg.registration.attendeeNames?.toLowerCase() || '';
                          const lineProfile = reg.lineProfile?.lineDisplayName?.toLowerCase() || '';

                          return (
                            regId.includes(searchLower) ||
                            company.includes(searchLower) ||
                            attendeeNames.includes(searchLower) ||
                            lineProfile.includes(searchLower)
                          );
                        })
                        .slice(0, 10)
                        .map((reg, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setSearchRegistrationId(reg.registration.registrationId);
                              setShowDropdown(false);
                              handleSearchRegistration(reg.registration.registrationId);
                            }}
                            className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center gap-3">
                              {reg.lineProfile?.lineProfilePicture && (
                                <img
                                  src={reg.lineProfile.lineProfilePicture}
                                  alt="profile"
                                  className="w-8 h-8 rounded-full"
                                />
                              )}
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {reg.lineProfile?.lineDisplayName || reg.registration.contactName}
                                  <span className="ml-2 text-xs text-gray-500">
                                    {reg.registration.registrationId}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-600">{reg.registration.companyName}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      {allRegistrations.filter((reg) => {
                        const searchLower = searchRegistrationId.toLowerCase();
                        return (
                          reg.registration.registrationId?.toLowerCase().includes(searchLower) ||
                          reg.registration.companyName?.toLowerCase().includes(searchLower) ||
                          reg.registration.attendeeNames?.toLowerCase().includes(searchLower) ||
                          reg.lineProfile?.lineDisplayName?.toLowerCase().includes(searchLower)
                        );
                      }).length === 0 && (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">
                          ไม่พบผลลัพธ์
                        </div>
                      )}
                    </div>
                  )}
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
                      {searchedRegistration.attendeeNames ? (() => {
                        let names: string[] = [];
                        const rawNames = searchedRegistration.attendeeNames;

                        // Try to parse as JSON first
                        try {
                          const parsed = JSON.parse(rawNames);
                          names = Array.isArray(parsed) ? parsed : [rawNames];
                        } catch {
                          // If not JSON, split by comma
                          names = rawNames.split(',').map((n: string) => n.trim()).filter((n: string) => n);
                        }

                        return names.map((trimmedName: string, index: number) => {
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
                        });
                      })() : (
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

      {/* Assignment Modal - Select Carpool for Car Number */}
      {showAssignmentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                เลือก Carpool สำหรับรถคันที่ {assigningCarNumber}
              </h3>

              {availableCarpools.length === 0 ? (
                <p className="text-sm text-gray-500">ไม่มี Carpool ที่ว่างให้เลือก</p>
              ) : (
                <div className="space-y-2 mb-6">
                  {availableCarpools.map((carpool) => (
                    <label
                      key={carpool.carpoolId}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedCarpoolId === carpool.carpoolId
                          ? 'bg-purple-50 border-purple-500'
                          : 'hover:bg-gray-50 border-gray-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carpool"
                        checked={selectedCarpoolId === carpool.carpoolId}
                        onChange={() => setSelectedCarpoolId(carpool.carpoolId)}
                        className="w-4 h-4 text-purple-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          🚗 {carpool.licensePlate}
                        </p>
                        <p className="text-xs text-gray-600">
                          {carpool.ownerCompanyName} • {carpool.members.length} สมาชิก
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAssignmentModal(false);
                    setSelectedCarpoolId(null);
                    setAssigningCarNumber(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirmAssignment}
                  disabled={!selectedCarpoolId || assigning}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigning ? 'กำลังบันทึก...' : 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Car Number Modal */}
      {showChangeCarNumberModal && changingCarpool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                เปลี่ยนเลขรถสำหรับ {changingCarpool.licensePlate}
              </h3>

              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>เลขรถปัจจุบัน:</strong> {changingCarpool.assignedCarNumber || '-'}
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  {changingCarpool.ownerCompanyName} • {changingCarpool.members.length} สมาชิก
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลือกเลขรถใหม่
                </label>
                <select
                  value={newCarNumber}
                  onChange={(e) => setNewCarNumber(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>-- เลือกเลขรถ --</option>
                  {carSlots
                    .filter(slot => !slot.carpool || slot.carpool.carpoolId === changingCarpool.carpoolId)
                    .map(slot => (
                      <option key={slot.carNumber} value={slot.carNumber}>
                        รถคันที่ {slot.carNumber}
                        {slot.carpool?.carpoolId === changingCarpool.carpoolId ? ' (ปัจจุบัน)' : ''}
                      </option>
                    ))
                  }
                </select>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowChangeCarNumberModal(false);
                    setChangingCarpool(null);
                    setNewCarNumber(0);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={async () => {
                    if (newCarNumber === 0 || newCarNumber === changingCarpool.assignedCarNumber) {
                      alert('กรุณาเลือกเลขรถใหม่');
                      return;
                    }

                    setChangingCarNumber(true);
                    try {
                      const response = await fetch(`/api/carpools/${changingCarpool.carpoolId}/assign-car-number`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ carNumber: newCarNumber }),
                      });

                      if (!response.ok) {
                        throw new Error('Failed to change car number');
                      }

                      alert('เปลี่ยนเลขรถสำเร็จ!');
                      setShowChangeCarNumberModal(false);
                      setChangingCarpool(null);
                      setNewCarNumber(0);
                      await fetchCarpools();
                    } catch (err) {
                      console.error('Error changing car number:', err);
                      alert('เกิดข้อผิดพลาดในการเปลี่ยนเลขรถ');
                    } finally {
                      setChangingCarNumber(false);
                    }
                  }}
                  disabled={changingCarNumber || newCarNumber === 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingCarNumber ? 'กำลังบันทึก...' : 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Last Member Confirmation Modal */}
      {showDeleteLastMemberModal && pendingMemberRemoval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">ยืนยันการลบ Carpool</h3>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-700 mb-3">
                  <strong>"{pendingMemberRemoval.name}"</strong> เป็นสมาชิกคนสุดท้ายในรถคันนี้
                </p>
                <p className="text-sm text-gray-600">
                  Carpool จะต้องมีสมาชิกในรถอย่างน้อย 1 คน หากต้องการลบสมาชิกคนนี้ออกจากรถ
                  <strong className="text-red-600"> Carpool ทั้งคันจะถูกลบด้วย</strong>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteLastMemberModal(false);
                    setPendingMemberRemoval(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirmDeleteLastMember}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  ยืนยันลบ Carpool
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
