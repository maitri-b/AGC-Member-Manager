'use client';

import { useState, useEffect } from 'react';
import { PartyTable, TableMember, PartyTableSettings } from '@/types/partyTable';

interface PartyTableManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  partyTableSettings?: PartyTableSettings;
  onSettingsUpdate?: () => void; // Callback to refresh parent data after settings update
}

interface EnrichedPartyTable extends PartyTable {
  hostCompanyName: string;
  hostContactName: string;
}

interface TableSlot {
  tableNumber: number;
  table: EnrichedPartyTable | null;
}

export default function PartyTableManagementModal({
  isOpen,
  onClose,
  eventId,
  eventName,
  partyTableSettings,
  onSettingsUpdate,
}: PartyTableManagementModalProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<'tables' | 'table-numbers'>('tables');

  const [tables, setTables] = useState<EnrichedPartyTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Table number assignment state - initialized from partyTableSettings
  const totalTables = partyTableSettings?.totalTables || 20;
  const defaultSeats = partyTableSettings?.defaultSeatsPerTable || 10;
  const maxSeats = partyTableSettings?.maxSeatsPerTable;
  const [tableSlots, setTableSlots] = useState<TableSlot[]>([]);

  // Delete confirmation modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Member management modal state
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [managingTableId, setManagingTableId] = useState<string | null>(null);
  const [expandedTableId, setExpandedTableId] = useState<string | null>(null);

  // Registration search for inviting members
  const [searchRegistrationId, setSearchRegistrationId] = useState('');
  const [searchedRegistration, setSearchedRegistration] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMembersToAdd, setSelectedMembersToAdd] = useState<{
    registrationId: string;
    attendeeIndex: number;
    name: string;
  }[]>([]);
  const [allRegistrations, setAllRegistrations] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Change table number modal state
  const [showChangeTableNumberModal, setShowChangeTableNumberModal] = useState(false);
  const [changingTable, setChangingTable] = useState<EnrichedPartyTable | null>(null);
  const [newTableNumber, setNewTableNumber] = useState<number>(0);
  const [changingTableNumber, setChangingTableNumber] = useState(false);

  // Member removal state
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<{
    tableId: string;
    registrationId: string;
    attendeeIndex: number;
    name: string;
  } | null>(null);
  const [removingMember, setRemovingMember] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTables();
      fetchAllRegistrations();
    }
  }, [isOpen, eventId]);

  // Generate table slots based on totalTables and tables
  useEffect(() => {
    const slots: TableSlot[] = [];
    for (let i = 1; i <= totalTables; i++) {
      const assignedTable = tables.find((t) => t.assignedTableNumber === i);
      slots.push({
        tableNumber: i,
        table: assignedTable || null,
      });
    }
    setTableSlots(slots);
  }, [totalTables, tables]);

  const fetchTables = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/party-tables`);
      if (!response.ok) {
        throw new Error('Failed to fetch party tables');
      }
      const data = await response.json();
      setTables(data.tables || []);
    } catch (err) {
      console.error('Error fetching party tables:', err);
      setError(err instanceof Error ? err.message : 'Failed to load party tables');
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

  const handleDeleteTable = async () => {
    if (!deletingTableId) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/party-tables/${deletingTableId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Deleted by admin',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete table');
      }

      alert('ลบโต๊ะสำเร็จ!');
      setDeleteConfirmOpen(false);
      setDeletingTableId(null);
      await fetchTables();
    } catch (err) {
      console.error('Error deleting table:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete table');
    } finally {
      setDeleting(false);
    }
  };

  const handleAssignTableNumber = async (tableId: string, tableNumber: number) => {
    try {
      const response = await fetch(`/api/party-tables/${tableId}/assign-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to assign table number');
      }

      alert(`จัดเลขโต๊ะ #${tableNumber} สำเร็จ!`);
      await fetchTables();
    } catch (err) {
      console.error('Error assigning table number:', err);
      alert(err instanceof Error ? err.message : 'Failed to assign table number');
    }
  };

  const handleUnassignTableNumber = async (tableId: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกเลขโต๊ะนี้?')) return;

    try {
      const response = await fetch(`/api/party-tables/${tableId}/unassign-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to unassign table number');
      }

      alert('ยกเลิกเลขโต๊ะสำเร็จ!');
      await fetchTables();
    } catch (err) {
      console.error('Error unassigning table number:', err);
      alert(err instanceof Error ? err.message : 'Failed to unassign table number');
    }
  };

  const handleChangeTableNumber = async () => {
    if (!changingTable || newTableNumber < 1 || newTableNumber > totalTables) {
      alert('กรุณาระบุเลขโต๊ะที่ถูกต้อง');
      return;
    }

    // Check if table number is already taken
    const existingTable = tables.find(
      (t) => t.assignedTableNumber === newTableNumber && t.tableId !== changingTable.tableId
    );
    if (existingTable) {
      alert(`เลขโต๊ะ #${newTableNumber} ถูกใช้แล้ว`);
      return;
    }

    setChangingTableNumber(true);
    try {
      const response = await fetch(`/api/party-tables/${changingTable.tableId}/assign-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber: newTableNumber }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to change table number');
      }

      alert(`เปลี่ยนเป็นโต๊ะ #${newTableNumber} สำเร็จ!`);
      setShowChangeTableNumberModal(false);
      setChangingTable(null);
      setNewTableNumber(0);
      await fetchTables();
    } catch (err) {
      console.error('Error changing table number:', err);
      alert(err instanceof Error ? err.message : 'Failed to change table number');
    } finally {
      setChangingTableNumber(false);
    }
  };

  const handleSearchRegistration = async () => {
    if (!searchRegistrationId.trim()) {
      alert('กรุณากรอกรหัสลงทะเบียน');
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(
        `/api/events/${eventId}/registrations/${searchRegistrationId}`
      );

      if (!response.ok) {
        throw new Error('ไม่พบรหัสลงทะเบียนนี้');
      }

      const data = await response.json();
      setSearchedRegistration(data.registration);
      setSelectedMembersToAdd([]);
    } catch (err) {
      console.error('Error searching registration:', err);
      alert(err instanceof Error ? err.message : 'ไม่พบรหัสลงทะเบียนนี้');
      setSearchedRegistration(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddMembers = async () => {
    if (!managingTableId || selectedMembersToAdd.length === 0) {
      alert('กรุณาเลือกสมาชิกที่ต้องการเพิ่ม');
      return;
    }

    try {
      const members = selectedMembersToAdd.map((m) => ({
        registrationId: m.registrationId,
        lineUserId: searchedRegistration.lineUserId,
        name: m.name,
        attendeeIndex: m.attendeeIndex,
        companyName: searchedRegistration.companyName || '',
      }));

      const response = await fetch(`/api/party-tables/${managingTableId}/add-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add members');
      }

      alert(`เพิ่มสมาชิก ${selectedMembersToAdd.length} คนสำเร็จ!`);
      setSearchRegistrationId('');
      setSearchedRegistration(null);
      setSelectedMembersToAdd([]);
      await fetchTables();
    } catch (err) {
      console.error('Error adding members:', err);
      alert(err instanceof Error ? err.message : 'Failed to add members');
    }
  };

  const handleRemoveMember = async () => {
    if (!pendingMemberRemoval) return;

    setRemovingMember(true);
    try {
      const response = await fetch(
        `/api/party-tables/${pendingMemberRemoval.tableId}/remove-members`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberIds: [
              {
                registrationId: pendingMemberRemoval.registrationId,
                attendeeIndex: pendingMemberRemoval.attendeeIndex,
              },
            ],
            reason: 'Removed by admin',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove member');
      }

      alert(`นำ ${pendingMemberRemoval.name} ออกจากโต๊ะสำเร็จ!`);
      setPendingMemberRemoval(null);
      await fetchTables();
    } catch (err) {
      console.error('Error removing member:', err);
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemovingMember(false);
    }
  };

  if (!isOpen) return null;

  const unassignedTables = tables.filter((t) => !t.assignedTableNumber && t.status === 'active');
  const assignedTables = tables.filter((t) => t.assignedTableNumber && t.status === 'active');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">จัดการ Party Table</h2>
              <p className="text-sm text-gray-600 mt-1">{eventName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('tables')}
              className={`pb-3 px-1 font-medium text-sm transition-colors relative ${
                activeTab === 'tables'
                  ? 'text-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Table Groups
              {activeTab === 'tables' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('table-numbers')}
              className={`pb-3 px-1 font-medium text-sm transition-colors relative ${
                activeTab === 'table-numbers'
                  ? 'text-purple-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Table Numbers
              {activeTab === 'table-numbers' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600"></div>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          ) : activeTab === 'tables' ? (
            <TabTableGroups
              tables={tables}
              defaultSeats={defaultSeats}
              maxSeats={maxSeats}
              onDeleteTable={(tableId) => {
                setDeletingTableId(tableId);
                setDeleteConfirmOpen(true);
              }}
              onManageMembers={(tableId) => {
                setManagingTableId(tableId);
                setShowMemberManagement(true);
              }}
              onToggleExpand={(tableId) => {
                setExpandedTableId(expandedTableId === tableId ? null : tableId);
              }}
              expandedTableId={expandedTableId}
              onRemoveMember={(tableId, registrationId, attendeeIndex, name) => {
                setPendingMemberRemoval({ tableId, registrationId, attendeeIndex, name });
              }}
            />
          ) : (
            <TabTableNumbers
              tableSlots={tableSlots}
              unassignedTables={unassignedTables}
              onAssignTableNumber={handleAssignTableNumber}
              onUnassignTableNumber={handleUnassignTableNumber}
              onChangeTableNumber={(table) => {
                setChangingTable(table);
                setNewTableNumber(table.assignedTableNumber || 1);
                setShowChangeTableNumberModal(true);
              }}
              defaultSeats={defaultSeats}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{tables.filter((t) => t.status === 'active').length}</span> โต๊ะทั้งหมด
              <span className="mx-2">•</span>
              <span className="font-medium">{assignedTables.length}</span> โต๊ะที่จัดเลขแล้ว
              <span className="mx-2">•</span>
              <span className="font-medium">{unassignedTables.length}</span> โต๊ะที่ยังไม่ได้จัดเลข
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">ยืนยันการลบโต๊ะ</h3>
            <p className="text-gray-700 mb-6">
              คุณแน่ใจหรือไม่ว่าต้องการลบโต๊ะนี้? สมาชิกทุกคนในโต๊ะจะถูกนำออก
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeletingTableId(null);
                }}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleDeleteTable}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
              >
                {deleting ? 'กำลังลบ...' : 'ลบโต๊ะ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Management Modal */}
      {showMemberManagement && managingTableId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">เพิ่มสมาชิกเข้าโต๊ะ</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รหัสลงทะเบียน
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchRegistrationId}
                    onChange={(e) => setSearchRegistrationId(e.target.value)}
                    placeholder="กรอกรหัสลงทะเบียน"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchRegistration();
                      }
                    }}
                  />
                  <button
                    onClick={handleSearchRegistration}
                    disabled={searchLoading}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    {searchLoading ? 'ค้นหา...' : 'ค้นหา'}
                  </button>
                </div>
              </div>

              {searchedRegistration && (
                <div className="border border-gray-300 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-900 mb-3">
                    {searchedRegistration.companyName || searchedRegistration.contactName}
                  </p>
                  <div className="space-y-2">
                    {searchedRegistration.attendeeNames
                      ?.split(',')
                      .map((name: string, index: number) => (
                        <label
                          key={index}
                          className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedMembersToAdd.some(
                              (m) =>
                                m.registrationId === searchedRegistration.registrationId &&
                                m.attendeeIndex === index
                            )}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMembersToAdd([
                                  ...selectedMembersToAdd,
                                  {
                                    registrationId: searchedRegistration.registrationId,
                                    attendeeIndex: index,
                                    name: name.trim(),
                                  },
                                ]);
                              } else {
                                setSelectedMembersToAdd(
                                  selectedMembersToAdd.filter(
                                    (m) =>
                                      !(
                                        m.registrationId ===
                                          searchedRegistration.registrationId &&
                                        m.attendeeIndex === index
                                      )
                                  )
                                );
                              }
                            }}
                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                          />
                          <span className="text-sm text-gray-900">{name.trim()}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowMemberManagement(false);
                  setManagingTableId(null);
                  setSearchRegistrationId('');
                  setSearchedRegistration(null);
                  setSelectedMembersToAdd([]);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAddMembers}
                disabled={selectedMembersToAdd.length === 0}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                เพิ่ม ({selectedMembersToAdd.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Table Number Modal */}
      {showChangeTableNumberModal && changingTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">เปลี่ยนเลขโต๊ะ</h3>
            <p className="text-sm text-gray-600 mb-4">
              โต๊ะปัจจุบัน: {changingTable.tableGroupName || `โต๊ะของ ${changingTable.hostCompanyName}`}
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลขโต๊ะใหม่ (1-{totalTables})
              </label>
              <input
                type="number"
                min="1"
                max={totalTables}
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowChangeTableNumberModal(false);
                  setChangingTable(null);
                  setNewTableNumber(0);
                }}
                disabled={changingTableNumber}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleChangeTableNumber}
                disabled={changingTableNumber}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                {changingTableNumber ? 'กำลังเปลี่ยน...' : 'เปลี่ยนเลขโต๊ะ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {pendingMemberRemoval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">ยืนยันการนำสมาชิกออก</h3>
            <p className="text-gray-700 mb-6">
              คุณแน่ใจหรือไม่ว่าต้องการนำ <strong>{pendingMemberRemoval.name}</strong> ออกจากโต๊ะ?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingMemberRemoval(null)}
                disabled={removingMember}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleRemoveMember}
                disabled={removingMember}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400"
              >
                {removingMember ? 'กำลังนำออก...' : 'นำออก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Tab 1: Table Groups
function TabTableGroups({
  tables,
  defaultSeats,
  maxSeats,
  onDeleteTable,
  onManageMembers,
  onToggleExpand,
  expandedTableId,
  onRemoveMember,
}: {
  tables: EnrichedPartyTable[];
  defaultSeats: number;
  maxSeats?: number;
  onDeleteTable: (tableId: string) => void;
  onManageMembers: (tableId: string) => void;
  onToggleExpand: (tableId: string) => void;
  expandedTableId: string | null;
  onRemoveMember: (tableId: string, registrationId: string, attendeeIndex: number, name: string) => void;
}) {
  const activeTables = tables.filter((t) => t.status === 'active');

  if (activeTables.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-16 h-16 text-gray-400 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <p className="text-gray-600">ยังไม่มีโต๊ะในกิจกรรมนี้</p>
        <p className="text-sm text-gray-500 mt-2">
          สมาชิกสามารถสร้างโต๊ะเองได้จากหน้า Event Detail
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activeTables.map((table) => {
        const isExpanded = expandedTableId === table.tableId;
        const memberCount = table.members.length;
        const capacityPercentage = maxSeats
          ? Math.round((memberCount / maxSeats) * 100)
          : Math.round((memberCount / defaultSeats) * 100);
        const capacityStatus =
          capacityPercentage >= 100
            ? 'overbooked'
            : capacityPercentage >= 80
            ? 'full'
            : 'available';
        const statusColor =
          capacityStatus === 'overbooked'
            ? 'text-red-600 bg-red-50'
            : capacityStatus === 'full'
            ? 'text-orange-600 bg-orange-50'
            : 'text-green-600 bg-green-50';

        return (
          <div
            key={table.tableId}
            className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">
                    {table.tableGroupName || `โต๊ะของ ${table.hostCompanyName}`}
                  </h3>
                  {table.assignedTableNumber && (
                    <span className="px-3 py-1 bg-purple-600 text-white text-xs font-medium rounded-full">
                      โต๊ะ #{table.assignedTableNumber}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  เจ้าของโต๊ะ: {table.hostContactName} ({table.hostCompanyName})
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor}`}>
                    {memberCount} / {maxSeats || defaultSeats} ที่นั่ง ({capacityPercentage}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onManageMembers(table.tableId)}
                  className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                  title="เพิ่มสมาชิก"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => onToggleExpand(table.tableId)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
                >
                  {isExpanded ? 'ซ่อน' : 'แสดง'} สมาชิก
                </button>
                <button
                  onClick={() => onDeleteTable(table.tableId)}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                  title="ลบโต๊ะ"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-gray-200 pt-3 mt-3">
                <p className="text-xs font-medium text-gray-600 mb-2">
                  สมาชิกในโต๊ะ ({memberCount} คน)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {table.members.map((member, idx) => (
                    <div
                      key={`${member.registrationId}-${member.attendeeIndex}`}
                      className="flex items-center justify-between bg-gray-50 p-2 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 text-purple-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.companyName}</p>
                        </div>
                      </div>
                      {member.registrationId !== table.hostRegistrationId && (
                        <button
                          onClick={() =>
                            onRemoveMember(
                              table.tableId,
                              member.registrationId,
                              member.attendeeIndex,
                              member.name
                            )
                          }
                          className="text-red-600 hover:text-red-800"
                          title="นำออกจากโต๊ะ"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Tab 2: Table Numbers
function TabTableNumbers({
  tableSlots,
  unassignedTables,
  onAssignTableNumber,
  onUnassignTableNumber,
  onChangeTableNumber,
  defaultSeats,
}: {
  tableSlots: TableSlot[];
  unassignedTables: EnrichedPartyTable[];
  onAssignTableNumber: (tableId: string, tableNumber: number) => void;
  onUnassignTableNumber: (tableId: string) => void;
  onChangeTableNumber: (table: EnrichedPartyTable) => void;
  defaultSeats: number;
}) {
  const [selectedTableNumber, setSelectedTableNumber] = useState<number | null>(null);
  const [selectedUnassignedTable, setSelectedUnassignedTable] = useState<string | null>(null);

  const handleAssignClick = () => {
    if (selectedTableNumber && selectedUnassignedTable) {
      onAssignTableNumber(selectedUnassignedTable, selectedTableNumber);
      setSelectedTableNumber(null);
      setSelectedUnassignedTable(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Unassigned Tables */}
      {unassignedTables.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-orange-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            โต๊ะที่ยังไม่ได้จัดเลข ({unassignedTables.length} โต๊ะ)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unassignedTables.map((table) => (
              <button
                key={table.tableId}
                onClick={() => setSelectedUnassignedTable(table.tableId)}
                className={`text-left p-3 border-2 rounded-lg transition-all ${
                  selectedUnassignedTable === table.tableId
                    ? 'border-purple-600 bg-purple-50'
                    : 'border-gray-200 hover:border-purple-300 bg-white'
                }`}
              >
                <p className="font-medium text-gray-900">
                  {table.tableGroupName || `โต๊ะของ ${table.hostCompanyName}`}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {table.members.length} คน • {table.hostContactName}
                </p>
              </button>
            ))}
          </div>
          {selectedUnassignedTable && selectedTableNumber && (
            <button
              onClick={handleAssignClick}
              className="mt-4 w-full px-4 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700"
            >
              จัดโต๊ะ #{selectedTableNumber}
            </button>
          )}
        </div>
      )}

      {/* Table Number Grid */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">เลขโต๊ะทั้งหมด</h3>
        <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {tableSlots.map((slot) => {
            const isSelected = selectedTableNumber === slot.tableNumber;
            const isOccupied = !!slot.table;

            return (
              <div key={slot.tableNumber} className="relative">
                <button
                  onClick={() => {
                    if (!isOccupied && selectedUnassignedTable) {
                      setSelectedTableNumber(slot.tableNumber);
                    }
                  }}
                  disabled={isOccupied}
                  className={`w-full aspect-square rounded-lg font-semibold text-sm transition-all ${
                    isOccupied
                      ? 'bg-purple-600 text-white cursor-default'
                      : isSelected
                      ? 'bg-purple-200 text-purple-900 border-2 border-purple-600'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-2 border-gray-200'
                  }`}
                >
                  #{slot.tableNumber}
                </button>

                {isOccupied && slot.table && (
                  <div className="absolute -bottom-2 -right-2 group">
                    <div className="flex gap-1">
                      <button
                        onClick={() => onChangeTableNumber(slot.table!)}
                        className="p-1 bg-white rounded-full shadow-md hover:bg-gray-100"
                        title="เปลี่ยนเลขโต๊ะ"
                      >
                        <svg
                          className="w-3 h-3 text-gray-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => onUnassignTableNumber(slot.table!.tableId)}
                        className="p-1 bg-white rounded-full shadow-md hover:bg-red-100"
                        title="ยกเลิกเลขโต๊ะ"
                      >
                        <svg
                          className="w-3 h-3 text-red-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-10 w-48">
                      <div className="bg-gray-800 text-white text-xs rounded-lg p-2 shadow-lg">
                        <p className="font-medium">
                          {slot.table.tableGroupName || `โต๊ะของ ${slot.table.hostCompanyName}`}
                        </p>
                        <p className="text-gray-300 mt-1">{slot.table.members.length} คน</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
