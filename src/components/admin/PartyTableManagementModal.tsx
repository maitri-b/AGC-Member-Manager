'use client';

import { useState, useEffect } from 'react';
import { PartyTable, TableMember, PartyTableSettings } from '@/types/partyTable';

// Helper function to normalize member names
function normalizeMemberName(name: any): string {
  if (!name) return '';

  // If it's already a string and not JSON, return it
  if (typeof name === 'string' && !name.startsWith('[') && !name.startsWith('{')) {
    return name.trim();
  }

  // If it's an array, join with comma
  if (Array.isArray(name)) {
    return name.join(', ').trim();
  }

  // Try to parse if it looks like JSON
  if (typeof name === 'string' && (name.startsWith('[') || name.startsWith('{'))) {
    try {
      const parsed = JSON.parse(name);
      if (Array.isArray(parsed)) {
        return parsed.join(', ').trim();
      }
      return String(parsed).trim();
    } catch {
      // If parsing fails, return the original string
      return name.trim();
    }
  }

  return String(name).trim();
}

// Helper function to parse attendeeNames from database format
function parseAttendeeNames(attendeeNames: any): string[] {
  if (!attendeeNames) return [];

  // If it's already an array, return it
  if (Array.isArray(attendeeNames)) {
    return attendeeNames.map((n: any) => String(n).trim());
  }

  // If it's a string, try to parse as JSON first
  if (typeof attendeeNames === 'string') {
    // Try parsing as JSON array
    if (attendeeNames.startsWith('[')) {
      try {
        const parsed = JSON.parse(attendeeNames);
        if (Array.isArray(parsed)) {
          return parsed.map((n: any) => String(n).trim());
        }
      } catch {
        // If JSON parse fails, fall through to comma split
      }
    }

    // Fall back to comma-separated string
    return attendeeNames.split(',').map((n: string) => n.trim()).filter(Boolean);
  }

  return [String(attendeeNames).trim()];
}

// Helper function to display member name with fallback for empty names
function displayMemberName(name: string, index?: number): string {
  const normalized = normalizeMemberName(name);

  // If name is empty or just whitespace, use fallback
  if (!normalized || normalized.trim() === '') {
    return index !== undefined ? `ผู้เข้าร่วมคนที่ ${index + 1}` : 'ไม่ระบุชื่อ';
  }

  return normalized;
}

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
  const [memberManagementTab, setMemberManagementTab] = useState<'groups' | 'registrations'>('registrations');

  // Registration search for inviting members
  const [searchRegistrationId, setSearchRegistrationId] = useState('');
  const [searchedRegistration, setSearchedRegistration] = useState<any>(null);
  const [memberManagementSearchTerm, setMemberManagementSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMembersToAdd, setSelectedMembersToAdd] = useState<{
    registrationId: string;
    attendeeIndex: number;
    name: string;
    companyName: string;
    lineUserId: string;
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

  // Assign Table Number Modal state (new)
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTableNumberForAssign, setSelectedTableNumberForAssign] = useState<number | null>(null);
  const [assignModalTab, setAssignModalTab] = useState<'groups' | 'registrations'>('groups');
  const [assignSearchTerm, setAssignSearchTerm] = useState('');
  const [selectedGroupForAssign, setSelectedGroupForAssign] = useState<string | null>(null);
  const [selectedMembersForNewGroup, setSelectedMembersForNewGroup] = useState<{
    registrationId: string;
    attendeeIndex: number;
    name: string;
    companyName: string;
    lineUserId: string;
  }[]>([]);
  const [assigning, setAssigning] = useState(false);

  // Create New Group Modal state
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [createGroupSearchTerm, setCreateGroupSearchTerm] = useState('');
  const [selectedMembersForCreate, setSelectedMembersForCreate] = useState<{
    registrationId: string;
    attendeeIndex: number;
    name: string;
    companyName: string;
    lineUserId: string;
  }[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

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
      // Filter out deleted and canceled registrations
      const activeRegistrations = (data.attendees || []).filter(
        (reg: any) => reg.status !== 'deleted' && reg.status !== 'canceled'
      );
      setAllRegistrations(activeRegistrations);
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

      // Wait for response to complete before refreshing
      await response.json();
      await fetchTables();

      return true; // Success
    } catch (err) {
      console.error('Error assigning table number:', err);
      throw err; // Re-throw to be handled by caller
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

      // Wait for response to complete
      await response.json();

      // Refresh data first
      await fetchTables();

      // Then show success message
      alert('ยกเลิกเลขโต๊ะสำเร็จ!');
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

      // Check if registration is deleted or canceled
      if (data.registration.status === 'deleted' || data.registration.status === 'canceled') {
        throw new Error('รหัสลงทะเบียนนี้ถูกยกเลิกหรือลบแล้ว');
      }

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
    if (!managingTableId) {
      alert('ไม่พบข้อมูลโต๊ะ');
      return;
    }

    // Check if adding from group or individual members
    if (memberManagementTab === 'groups') {
      if (!selectedGroupForAssign) {
        alert('กรุณาเลือกกลุ่มโต๊ะที่ต้องการเพิ่ม');
        return;
      }

      // Get the selected group's members
      const selectedGroup = unassignedTables.find(t => t.tableId === selectedGroupForAssign);
      if (!selectedGroup || selectedGroup.members.length === 0) {
        alert('ไม่พบสมาชิกในกลุ่มโต๊ะที่เลือก');
        return;
      }

      try {
        const response = await fetch(`/api/party-tables/${managingTableId}/add-members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ members: selectedGroup.members }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to add group');
        }

        alert(`เพิ่มกลุ่มโต๊ะ (${selectedGroup.members.length} คน) สำเร็จ!`);
        setSelectedGroupForAssign(null);
        setShowMemberManagement(false);
        setManagingTableId(null);
        setMemberManagementSearchTerm('');
        await fetchTables();
      } catch (err) {
        console.error('Error adding group:', err);
        alert(err instanceof Error ? err.message : 'Failed to add group');
      }
    } else {
      // Adding individual members from registrations
      if (selectedMembersToAdd.length === 0) {
        alert('กรุณาเลือกสมาชิกที่ต้องการเพิ่ม');
        return;
      }

      try {
        const members = selectedMembersToAdd.map((m) => ({
          registrationId: m.registrationId,
          lineUserId: m.lineUserId,
          name: normalizeMemberName(m.name),
          attendeeIndex: m.attendeeIndex,
          companyName: m.companyName,
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
        setShowMemberManagement(false);
        setManagingTableId(null);
        setMemberManagementSearchTerm('');
        await fetchTables();
      } catch (err) {
        console.error('Error adding members:', err);
        alert(err instanceof Error ? err.message : 'Failed to add members');
      }
    }
  };

  // Handle assign table number (new modal flow)
  const handleOpenAssignModal = (tableNumber: number) => {
    setSelectedTableNumberForAssign(tableNumber);
    setShowAssignModal(true);
    setAssignModalTab('groups');
    setAssignSearchTerm('');
    setSelectedGroupForAssign(null);
    setSelectedMembersForNewGroup([]);
  };

  const handleCreateNewGroup = async () => {
    if (selectedMembersForCreate.length === 0) {
      alert('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
      return;
    }

    setCreatingGroup(true);
    try {
      // Get first member's registration to use as host
      const firstMember = selectedMembersForCreate[0];
      const hostRegistration = allRegistrations.find(
        (r: any) => r.registration.registrationId === firstMember.registrationId
      );

      if (!hostRegistration) {
        throw new Error('ไม่พบข้อมูลการลงทะเบียน');
      }

      // Prepare members data
      const initialMembers = selectedMembersForCreate.map((m) => ({
        registrationId: m.registrationId,
        lineUserId: m.lineUserId,
        name: normalizeMemberName(m.name),
        attendeeIndex: m.attendeeIndex,
        companyName: m.companyName,
      }));

      // Create new party table
      const createResponse = await fetch('/api/party-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          tableGroupName: undefined, // Auto-generate from company name
          hostRegistrationId: firstMember.registrationId,
          hostCompanyName: firstMember.companyName,
          hostContactName: hostRegistration.registration.contactName || '',
          initialMembers,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create party table');
      }

      await createResponse.json();

      setShowCreateGroupModal(false);
      setSelectedMembersForCreate([]);
      setCreateGroupSearchTerm('');
      alert('สร้างกลุ่มโต๊ะสำเร็จ!');

      // Refresh tables list
      await fetchTables();
    } catch (error) {
      console.error('Error creating group:', error);
      alert(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleAssignFromModal = async () => {
    if (!selectedTableNumberForAssign) return;

    setAssigning(true);
    try {
      // Case 1: Assign existing group
      if (assignModalTab === 'groups' && selectedGroupForAssign) {
        await handleAssignTableNumber(selectedGroupForAssign, selectedTableNumberForAssign);
        setShowAssignModal(false);
        setSelectedGroupForAssign(null);
        alert(`จัดเลขโต๊ะ #${selectedTableNumberForAssign} สำเร็จ!`);
      }
      // Case 2: Create new group from selected members
      else if (assignModalTab === 'registrations' && selectedMembersForNewGroup.length > 0) {
        // Get first member's registration to use as host
        const firstMember = selectedMembersForNewGroup[0];
        const hostRegistration = allRegistrations.find(
          (r: any) => r.registration.registrationId === firstMember.registrationId
        );

        if (!hostRegistration) {
          throw new Error('ไม่พบข้อมูลการลงทะเบียน');
        }

        // Prepare members data
        const initialMembers = selectedMembersForNewGroup.map((m) => ({
          registrationId: m.registrationId,
          lineUserId: m.lineUserId,
          name: normalizeMemberName(m.name),
          attendeeIndex: m.attendeeIndex,
          companyName: m.companyName,
        }));

        // Create new party table
        const createResponse = await fetch('/api/party-tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId,
            tableGroupName: undefined, // Auto-generate from company name
            hostRegistrationId: firstMember.registrationId,
            hostCompanyName: firstMember.companyName,
            hostContactName: hostRegistration.registration.contactName || '',
            initialMembers,
          }),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json();
          throw new Error(errorData.error || 'Failed to create party table');
        }

        const { table } = await createResponse.json();

        // Assign table number
        await handleAssignTableNumber(table.tableId, selectedTableNumberForAssign);

        setShowAssignModal(false);
        setSelectedMembersForNewGroup([]);
        alert(`สร้างกลุ่มโต๊ะและจัดเลขโต๊ะ #${selectedTableNumberForAssign} สำเร็จ!`);
      }
    } catch (error) {
      console.error('Error assigning table:', error);
      alert(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
    } finally {
      setAssigning(false);
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
            <div className="flex items-center gap-3">
              {activeTab === 'tables' && (
                <button
                  onClick={() => setShowCreateGroupModal(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  + สร้างกลุ่มโต๊ะใหม่
                </button>
              )}
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
              onCreateNewGroup={() => {
                setShowCreateGroupModal(true);
                setSelectedMembersForCreate([]);
                setCreateGroupSearchTerm('');
              }}
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
              allRegistrations={allRegistrations}
              allTables={tables}
              onAssignTableNumber={handleAssignTableNumber}
              onUnassignTableNumber={handleUnassignTableNumber}
              onChangeTableNumber={(table) => {
                setChangingTable(table);
                setNewTableNumber(table.assignedTableNumber || 1);
                setShowChangeTableNumberModal(true);
              }}
              onTableNumberClick={handleOpenAssignModal}
              onManageMembers={(tableId) => {
                setManagingTableId(tableId);
                setShowMemberManagement(true);
              }}
              onRemoveMember={(tableId, registrationId, attendeeIndex, name) => {
                setPendingMemberRemoval({ tableId, registrationId, attendeeIndex, name });
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

      {/* Assign Table Number Modal */}
      {showAssignModal && selectedTableNumberForAssign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">
                  จัดสมาชิกเข้าโต๊ะ #{selectedTableNumberForAssign}
                </h3>
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedTableNumberForAssign(null);
                    setSelectedGroupForAssign(null);
                    setSelectedMembersForNewGroup([]);
                    setAssignSearchTerm('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setAssignModalTab('groups')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    assignModalTab === 'groups'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  กลุ่มโต๊ะ
                </button>
                <button
                  onClick={() => setAssignModalTab('registrations')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    assignModalTab === 'registrations'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  รหัสการจอง
                </button>
              </div>

              {/* Search */}
              <div className="mt-4">
                <input
                  type="text"
                  value={assignSearchTerm}
                  onChange={(e) => setAssignSearchTerm(e.target.value)}
                  placeholder="ค้นหา: ชื่อบริษัท, ชื่อ LINE, ชื่อสมาชิก"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {assignModalTab === 'groups' ? (
                <AssignModalGroupsTab
                  tables={tables}
                  searchTerm={assignSearchTerm}
                  selectedGroupId={selectedGroupForAssign}
                  onSelectGroup={setSelectedGroupForAssign}
                />
              ) : (
                <AssignModalRegistrationsTab
                  registrations={allRegistrations}
                  tables={tables}
                  searchTerm={assignSearchTerm}
                  selectedMembers={selectedMembersForNewGroup}
                  onToggleMember={(member) => {
                    const exists = selectedMembersForNewGroup.find(
                      (m) => m.registrationId === member.registrationId && m.attendeeIndex === member.attendeeIndex
                    );
                    if (exists) {
                      setSelectedMembersForNewGroup(
                        selectedMembersForNewGroup.filter(
                          (m) => !(m.registrationId === member.registrationId && m.attendeeIndex === member.attendeeIndex)
                        )
                      );
                    } else {
                      setSelectedMembersForNewGroup([...selectedMembersForNewGroup, member]);
                    }
                  }}
                />
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedTableNumberForAssign(null);
                    setSelectedGroupForAssign(null);
                    setSelectedMembersForNewGroup([]);
                  }}
                  disabled={assigning}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleAssignFromModal}
                  disabled={
                    assigning ||
                    (assignModalTab === 'groups' && !selectedGroupForAssign) ||
                    (assignModalTab === 'registrations' && selectedMembersForNewGroup.length === 0)
                  }
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                >
                  {assigning ? 'กำลังจัด...' : `จัดโต๊ะ #${selectedTableNumberForAssign}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create New Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">
                  สร้างกลุ่มโต๊ะใหม่
                </h3>
                <button
                  onClick={() => {
                    setShowCreateGroupModal(false);
                    setSelectedMembersForCreate([]);
                    setCreateGroupSearchTerm('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Info */}
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  💡 เลือกสมาชิกอย่างน้อย 1 คนเพื่อสร้างกลุ่มโต๊ะ ระบบจะใช้ชื่อบริษัทของสมาชิกคนแรกเป็นชื่อกลุ่มโดยอัตโนมัติ
                </p>
              </div>

              {/* Search */}
              <div className="mt-4">
                <input
                  type="text"
                  value={createGroupSearchTerm}
                  onChange={(e) => setCreateGroupSearchTerm(e.target.value)}
                  placeholder="ค้นหา: ชื่อบริษัท, ชื่อ LINE, ชื่อสมาชิก"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <AssignModalRegistrationsTab
                registrations={allRegistrations}
                tables={tables}
                searchTerm={createGroupSearchTerm}
                selectedMembers={selectedMembersForCreate}
                onToggleMember={(member) => {
                  const exists = selectedMembersForCreate.find(
                    (m) => m.registrationId === member.registrationId && m.attendeeIndex === member.attendeeIndex
                  );
                  if (exists) {
                    setSelectedMembersForCreate(
                      selectedMembersForCreate.filter(
                        (m) => !(m.registrationId === member.registrationId && m.attendeeIndex === member.attendeeIndex)
                      )
                    );
                  } else {
                    setSelectedMembersForCreate([...selectedMembersForCreate, member]);
                  }
                }}
              />
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCreateGroupModal(false);
                    setSelectedMembersForCreate([]);
                    setCreateGroupSearchTerm('');
                  }}
                  disabled={creatingGroup}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleCreateNewGroup}
                  disabled={creatingGroup || selectedMembersForCreate.length === 0}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                >
                  {creatingGroup ? 'กำลังสร้าง...' : `สร้างกลุ่มโต๊ะ (${selectedMembersForCreate.length} คน)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">เพิ่มสมาชิกเข้าโต๊ะ</h3>
                <button
                  onClick={() => {
                    setShowMemberManagement(false);
                    setManagingTableId(null);
                    setSelectedMembersToAdd([]);
                    setSelectedGroupForAssign(null);
                    setMemberManagementSearchTerm('');
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setMemberManagementTab('groups')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    memberManagementTab === 'groups'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  กลุ่มโต๊ะ
                </button>
                <button
                  onClick={() => setMemberManagementTab('registrations')}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    memberManagementTab === 'registrations'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  รหัสการจอง
                </button>
              </div>

              {/* Search */}
              <div className="mt-4">
                <input
                  type="text"
                  value={memberManagementSearchTerm}
                  onChange={(e) => setMemberManagementSearchTerm(e.target.value)}
                  placeholder="ค้นหา: ชื่อบริษัท, ชื่อ LINE, ชื่อสมาชิก"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {memberManagementTab === 'groups' ? (
                <AssignModalGroupsTab
                  tables={unassignedTables}
                  searchTerm={memberManagementSearchTerm}
                  selectedGroupId={selectedGroupForAssign}
                  onSelectGroup={setSelectedGroupForAssign}
                />
              ) : (
                <AssignModalRegistrationsTab
                  registrations={allRegistrations}
                  tables={tables}
                  searchTerm={memberManagementSearchTerm}
                  selectedMembers={selectedMembersToAdd}
                  onToggleMember={(member) => {
                    const exists = selectedMembersToAdd.find(
                      (m) => m.registrationId === member.registrationId && m.attendeeIndex === member.attendeeIndex
                    );
                    if (exists) {
                      setSelectedMembersToAdd(
                        selectedMembersToAdd.filter(
                          (m) => !(m.registrationId === member.registrationId && m.attendeeIndex === member.attendeeIndex)
                        )
                      );
                    } else {
                      setSelectedMembersToAdd([...selectedMembersToAdd, member]);
                    }
                  }}
                />
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowMemberManagement(false);
                    setManagingTableId(null);
                    setSelectedMembersToAdd([]);
                    setSelectedGroupForAssign(null);
                    setMemberManagementSearchTerm('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleAddMembers}
                  disabled={memberManagementTab === 'registrations' ? selectedMembersToAdd.length === 0 : !selectedGroupForAssign}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                >
                  {memberManagementTab === 'groups'
                    ? (selectedGroupForAssign ? `เพิ่มกลุ่มโต๊ะ` : 'เลือกกลุ่มโต๊ะ')
                    : `เพิ่มสมาชิก (${selectedMembersToAdd.length} คน)`
                  }
                </button>
              </div>
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
  onCreateNewGroup,
  onDeleteTable,
  onManageMembers,
  onToggleExpand,
  expandedTableId,
  onRemoveMember,
}: {
  tables: EnrichedPartyTable[];
  defaultSeats: number;
  maxSeats?: number;
  onCreateNewGroup: () => void;
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
          สมาชิกสามารถสร้างโต๊ะเองได้จากหน้า Event Detail หรือคุณสามารถสร้างกลุ่มโต๊ะให้สมาชิกได้
        </p>
        <button
          onClick={onCreateNewGroup}
          className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 inline-flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          สร้างกลุ่มโต๊ะใหม่
        </button>
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
                          <p className="text-sm font-medium text-gray-900">{displayMemberName(member.name, member.attendeeIndex)}</p>
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
                              displayMemberName(member.name, member.attendeeIndex)
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
  allRegistrations,
  allTables,
  onAssignTableNumber,
  onUnassignTableNumber,
  onChangeTableNumber,
  onTableNumberClick,
  onManageMembers,
  onRemoveMember,
  defaultSeats,
}: {
  tableSlots: TableSlot[];
  unassignedTables: EnrichedPartyTable[];
  allRegistrations: any[];
  allTables: EnrichedPartyTable[];
  onAssignTableNumber: (tableId: string, tableNumber: number) => void;
  onUnassignTableNumber: (tableId: string) => void;
  onChangeTableNumber: (table: EnrichedPartyTable) => void;
  onTableNumberClick: (tableNumber: number) => void;
  onManageMembers: (tableId: string) => void;
  onRemoveMember: (tableId: string, registrationId: string, attendeeIndex: number, name: string) => void;
  defaultSeats: number;
}) {

  return (
    <div className="space-y-6">
      {/* Info Box */}
      {unassignedTables.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0"
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
            <div>
              <p className="font-medium text-orange-900">
                มีกลุ่มโต๊ะที่ยังไม่ได้จัดเลข {unassignedTables.length} กลุ่ม
              </p>
              <p className="text-sm text-orange-700 mt-1">
                💡 คลิกที่เลขโต๊ะว่าง (สีเทา) เพื่อเลือกกลุ่มโต๊ะหรือสมาชิกที่จะ assign
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Table Number Grid */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">เลขโต๊ะทั้งหมด</h3>
        <p className="text-sm text-gray-600 mb-4">
          คลิกที่ช่องสีเทาเพื่อจัดสมาชิกเข้าโต๊ะ • ช่องสีม่วงคือโต๊ะที่จัดแล้ว
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tableSlots.map((slot) => {
            const isOccupied = !!slot.table;

            return (
              <div key={slot.tableNumber} className="relative">
                {/* Table Number Card */}
                <div className={`border-2 rounded-lg overflow-hidden ${
                  isOccupied ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white'
                }`}>
                  {/* Header with Table Number */}
                  <div className={`p-3 flex items-center justify-between ${
                    isOccupied ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}>
                    <span className="font-semibold">โต๊ะ {slot.tableNumber}</span>
                    {isOccupied && slot.table && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => onChangeTableNumber(slot.table!)}
                          className="p-1 bg-white rounded hover:bg-gray-100 transition-colors"
                          title="เปลี่ยนเลขโต๊ะ"
                        >
                          <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => onUnassignTableNumber(slot.table!.tableId)}
                          className="p-1 bg-white rounded hover:bg-gray-100 transition-colors"
                          title="ยกเลิกการจัดเลขโต๊ะ"
                        >
                          <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-3">
                    {isOccupied && slot.table ? (
                      <div className="space-y-2">
                        {/* Group Name */}
                        <p className="font-medium text-sm text-gray-900">
                          {slot.table.tableGroupName || `กลุ่มโต๊ะ: ${slot.table.hostCompanyName}`}
                        </p>

                        {/* Member Count */}
                        <p className="text-xs text-gray-600">
                          {slot.table.members.length} / {defaultSeats} คน
                        </p>

                        {/* Member List */}
                        <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                          {slot.table.members.map((member, idx) => (
                            <div key={idx} className="text-xs text-gray-700 flex items-center gap-1 group">
                              <span className="text-purple-600">•</span>
                              <span className="flex-1">{displayMemberName(member.name, member.attendeeIndex)}</span>
                              <button
                                onClick={() => onRemoveMember(
                                  slot.table!.tableId,
                                  member.registrationId,
                                  member.attendeeIndex,
                                  displayMemberName(member.name, member.attendeeIndex)
                                )}
                                className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 transition-opacity p-0.5"
                                title="ลบออกจากโต๊ะ"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add Member Button */}
                        <button
                          onClick={() => onManageMembers(slot.table!.tableId)}
                          className="w-full mt-3 px-3 py-2 bg-purple-100 text-purple-700 text-xs rounded hover:bg-purple-200 transition-colors font-medium"
                        >
                          + เพิ่มสมาชิก
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onTableNumberClick(slot.tableNumber)}
                        className="w-full py-6 text-sm text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                      >
                        + จัดสมาชิกเข้าโต๊ะ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Assign Modal - Groups Tab
function AssignModalGroupsTab({
  tables,
  searchTerm,
  selectedGroupId,
  onSelectGroup,
}: {
  tables: EnrichedPartyTable[];
  searchTerm: string;
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string) => void;
}) {
  // Filter: only show unassigned groups
  const unassignedGroups = tables.filter((t) => t.status === 'active' && !t.assignedTableNumber);

  // Apply search filter
  const filteredGroups = unassignedGroups.filter((group) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      group.tableGroupName?.toLowerCase().includes(term) ||
      group.hostCompanyName?.toLowerCase().includes(term) ||
      group.hostContactName?.toLowerCase().includes(term) ||
      group.members.some((m) => m.name.toLowerCase().includes(term))
    );
  });

  if (filteredGroups.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {searchTerm ? 'ไม่พบกลุ่มโต๊ะที่ตรงกับการค้นหา' : 'ไม่มีกลุ่มโต๊ะที่ยังไม่ได้จัดเลข'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {filteredGroups.map((group) => (
        <button
          key={group.tableId}
          onClick={() => onSelectGroup(group.tableId)}
          className={`text-left p-4 border-2 rounded-lg transition-all ${
            selectedGroupId === group.tableId
              ? 'border-purple-600 bg-purple-50'
              : 'border-gray-200 hover:border-purple-300 bg-white'
          }`}
        >
          <p className="font-semibold text-gray-900">
            {group.tableGroupName || `โต๊ะของ ${group.hostCompanyName}`}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {group.members.length} คน • {group.hostContactName}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {group.members.slice(0, 3).map((member, idx) => (
              <span key={idx} className="text-xs px-2 py-1 bg-gray-100 rounded">
                {displayMemberName(member.name, member.attendeeIndex)}
              </span>
            ))}
            {group.members.length > 3 && (
              <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                +{group.members.length - 3}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

// Assign Modal - Registrations Tab
function AssignModalRegistrationsTab({
  registrations,
  tables,
  searchTerm,
  selectedMembers,
  onToggleMember,
}: {
  registrations: any[];
  tables: EnrichedPartyTable[];
  searchTerm: string;
  selectedMembers: { registrationId: string; attendeeIndex: number; name: string; companyName: string; lineUserId: string }[];
  onToggleMember: (member: { registrationId: string; attendeeIndex: number; name: string; companyName: string; lineUserId: string }) => void;
}) {
  // Helper: Check if a member is already assigned to a table
  const isMemberAssigned = (registrationId: string, attendeeIndex: number) => {
    return tables.some((table) =>
      table.members.some((m) => m.registrationId === registrationId && m.attendeeIndex === attendeeIndex)
    );
  };

  // Helper: Check if member is selected
  const isMemberSelected = (registrationId: string, attendeeIndex: number) => {
    return selectedMembers.some((m) => m.registrationId === registrationId && m.attendeeIndex === attendeeIndex);
  };

  // Filter registrations based on search
  const filteredRegistrations = registrations.filter((item) => {
    if (!item?.registration) return false;

    // Skip if all members are already assigned
    const attendeeNames = parseAttendeeNames(item.registration.attendeeNames);
    const allAssigned = attendeeNames.every((_name: string, idx: number) => isMemberAssigned(item.registration.registrationId, idx));
    if (allAssigned && attendeeNames.length > 0) return false;

    if (!searchTerm) return true;

    const term = searchTerm.toLowerCase();
    return (
      item.registration.companyName?.toLowerCase().includes(term) ||
      item.registration.contactName?.toLowerCase().includes(term) ||
      item.lineProfile?.lineDisplayName?.toLowerCase().includes(term) ||
      item.registration.attendeeNames?.toLowerCase().includes(term)
    );
  });

  if (filteredRegistrations.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {searchTerm ? 'ไม่พบรหัสการจองที่ตรงกับการค้นหา' : 'ไม่มีรหัสการจองที่มีสมาชิกคงเหลือ'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredRegistrations.map((item) => {
        const registration = item.registration;
        const attendeeNames = parseAttendeeNames(registration.attendeeNames);

        return (
          <div key={registration.registrationId} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-900">{registration.companyName || registration.contactName}</p>
                <p className="text-sm text-gray-600">
                  รหัส: {registration.registrationId} • {registration.contactName}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {attendeeNames.map((name: string, idx: number) => {
                const isAssigned = isMemberAssigned(registration.registrationId, idx);
                const isSelected = isMemberSelected(registration.registrationId, idx);

                return (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
                      isAssigned ? 'bg-gray-50 opacity-50 cursor-not-allowed' : 'hover:bg-purple-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isAssigned}
                      onChange={() => {
                        if (!isAssigned) {
                          onToggleMember({
                            registrationId: registration.registrationId,
                            attendeeIndex: idx,
                            name,
                            companyName: registration.companyName || registration.contactName || '',
                            lineUserId: registration.lineUserId || '',
                          });
                        }
                      }}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                    />
                    <span className={`text-sm ${isAssigned ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {displayMemberName(name, idx)}
                    </span>
                    {isAssigned && <span className="text-xs text-gray-500 ml-auto">ถูก assign แล้ว</span>}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
