'use client';

import React, { useState, useEffect } from 'react';
import { PartyTable, TableMember, PartyTableSettings } from '@/types/partyTable';

// Helper function to normalize member names
function normalizeMemberName(name: any): string {
  if (!name) return '';

  let current = name;

  // Handle multiple levels of JSON encoding
  // Keep parsing until we get a non-JSON string or array
  while (typeof current === 'string' && (current.startsWith('[') || current.startsWith('{'))) {
    try {
      const parsed = JSON.parse(current);

      // If we got an array, join it and return
      if (Array.isArray(parsed)) {
        // If array has only one element, return it
        if (parsed.length === 1) {
          current = parsed[0];
          // Continue loop in case it's still JSON
          continue;
        }
        // Multiple elements: join with comma
        return parsed.join(', ').trim();
      }

      // If parsed to something else, update current and continue
      current = parsed;
    } catch {
      // If parsing fails, break and return what we have
      break;
    }
  }

  // If it's an array at this point, join it
  if (Array.isArray(current)) {
    return current.join(', ').trim();
  }

  // Return as string
  return String(current).trim();
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

// Helper function to truncate company name to 20 characters at word boundary
function truncateCompanyName(companyName: string, maxLength: number = 20): string {
  if (!companyName || companyName.length <= maxLength) {
    return companyName;
  }

  // Find the last space within maxLength
  const truncated = companyName.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');

  // If there's a space, truncate at word boundary
  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex) + '..';
  }

  // Otherwise, just truncate at maxLength
  return truncated + '..';
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

// Helper function to display member name with company for Join tables
function displayMemberNameWithCompany(name: string, companyName: string, index?: number): string {
  const displayName = displayMemberName(name, index);
  const truncatedCompany = truncateCompanyName(companyName);
  return `${displayName} (${truncatedCompany})`;
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
  isJoinTable?: boolean;      // Explicitly declare for TypeScript in Vercel builds
  isReservation?: boolean;    // Explicitly declare for TypeScript in Vercel builds
  reservedSeats?: number;     // Explicitly declare for TypeScript in Vercel builds
}

interface TableSlot {
  tableNumber: number;
  groups: EnrichedPartyTable[];  // Changed from single table to array of groups
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

  // Edit table name modal state
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingTable, setEditingTable] = useState<EnrichedPartyTable | null>(null);
  const [newTableName, setNewTableName] = useState('');
  const [savingName, setSavingName] = useState(false);

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

  // Create Reservation Table Modal state
  const [showCreateReservationModal, setShowCreateReservationModal] = useState(false);
  const [reservationName, setReservationName] = useState('');
  const [reservationSeats, setReservationSeats] = useState<number>(10);
  const [creatingReservation, setCreatingReservation] = useState(false);

  // Edit Reservation Modal state
  const [showEditReservationModal, setShowEditReservationModal] = useState(false);
  const [editingReservationTable, setEditingReservationTable] = useState<EnrichedPartyTable | null>(null);
  const [editReservationName, setEditReservationName] = useState('');
  const [editReservationSeats, setEditReservationSeats] = useState<number>(10);
  const [updatingReservation, setUpdatingReservation] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchTables();
      fetchAllRegistrations();
    }
  }, [isOpen, eventId]);

  // Generate table slots based on totalTables and tables
  // IMPORTANT: Each table number can have MULTIPLE groups assigned
  useEffect(() => {
    const slots: TableSlot[] = [];
    for (let i = 1; i <= totalTables; i++) {
      const assignedGroups = tables.filter((t) => t.assignedTableNumber === i);
      slots.push({
        tableNumber: i,
        groups: assignedGroups,
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
        (reg: any) => {
          const status = reg.registration?.status || reg.status;
          return status !== 'deleted' && status !== 'canceled' && status !== 'cancelled';
        }
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

  const handleEditTableName = (table: EnrichedPartyTable) => {
    setEditingTable(table);
    setNewTableName(table.tableGroupName || '');
    setShowEditNameModal(true);
  };

  const handleSaveTableName = async () => {
    if (!editingTable) return;

    setSavingName(true);
    try {
      const response = await fetch(`/api/party-tables/${editingTable.tableId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableGroupName: newTableName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update table name');
      }

      alert('บันทึกชื่อโต๊ะสำเร็จ!');
      setShowEditNameModal(false);
      setEditingTable(null);
      setNewTableName('');
      await fetchTables();
    } catch (err) {
      console.error('Error updating table name:', err);
      alert(err instanceof Error ? err.message : 'Failed to update table name');
    } finally {
      setSavingName(false);
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

    // BUSINESS RULE: Check if moving a Join Table to a table number that already has a Join Table
    const isMovingJoinTable = changingTable.isJoinTable === true;
    const groupsAtDestination = tables.filter(
      (t) => t.assignedTableNumber === newTableNumber && t.tableId !== changingTable.tableId
    );
    const existingJoinTableAtDestination = groupsAtDestination.find((t) => t.isJoinTable === true);

    if (isMovingJoinTable && existingJoinTableAtDestination) {
      // Confirm merge with user
      const confirmMerge = confirm(
        `โต๊ะ #${newTableNumber} มีกลุ่ม "Join โต๊ะ" อยู่แล้ว\n\n` +
        `สมาชิกจากกลุ่ม Join โต๊ะที่คุณกำลังย้าย (${changingTable.members.length} คน) จะถูกรวมเข้ากับกลุ่ม Join โต๊ะที่มีอยู่ (${existingJoinTableAtDestination.members.length} คน)\n\n` +
        `กลุ่มที่ย้ายจะถูกลบออกหลังจากรวมสมาชิกเรียบร้อยแล้ว\n\n` +
        `ต้องการดำเนินการต่อหรือไม่?`
      );

      if (!confirmMerge) {
        return; // User cancelled
      }
    } else if (groupsAtDestination.length > 0 && !isMovingJoinTable) {
      // Regular table - allow multiple groups at same table number
      const confirmMultiple = confirm(
        `โต๊ะ #${newTableNumber} มีกลุ่มอื่นอยู่แล้ว ${groupsAtDestination.length} กลุ่ม\n\n` +
        `ต้องการเพิ่มกลุ่มนี้เข้าไปด้วยหรือไม่?`
      );

      if (!confirmMultiple) {
        return; // User cancelled
      }
    }

    setChangingTableNumber(true);
    try {
      // First, unassign from current table
      await fetch(`/api/party-tables/${changingTable.tableId}/unassign-number`, {
        method: 'POST',
      });

      // Then assign to new table number (this will handle merge if needed)
      const response = await fetch(`/api/party-tables/${changingTable.tableId}/assign-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber: newTableNumber }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to change table number');
      }

      // Show appropriate success message
      if (isMovingJoinTable && existingJoinTableAtDestination) {
        alert(
          `รวมกลุ่ม Join โต๊ะสำเร็จ!\n\n` +
          `สมาชิก ${changingTable.members.length} คนได้ถูกรวมเข้ากับกลุ่ม Join โต๊ะที่โต๊ะ #${newTableNumber} แล้ว`
        );
      } else {
        alert(`เปลี่ยนเป็นโต๊ะ #${newTableNumber} สำเร็จ!`);
      }

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
        `/api/registrations/${searchRegistrationId}`
      );

      if (!response.ok) {
        throw new Error('ไม่พบรหัสลงทะเบียนนี้');
      }

      const data = await response.json();

      // Check if registration is deleted or canceled
      if (data.registration.status === 'deleted' || data.registration.status === 'cancelled' || data.registration.status === 'canceled') {
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

  const handleCreateReservation = async () => {
    if (!reservationName.trim()) {
      alert('กรุณาใส่ชื่อกลุ่มจองโต๊ะ');
      return;
    }

    if (!reservationSeats || reservationSeats < 1) {
      alert('กรุณาใส่จำนวนที่นั่งที่ต้องการจอง (อย่างน้อย 1 ที่)');
      return;
    }

    setCreatingReservation(true);
    try {
      const createResponse = await fetch('/api/party-tables/create-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          tableGroupName: reservationName.trim(),
          reservedSeats: reservationSeats,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create reservation table');
      }

      await createResponse.json();

      setShowCreateReservationModal(false);
      setReservationName('');
      setReservationSeats(10);
      alert('สร้างกลุ่มจองโต๊ะสำเร็จ!');

      // Refresh tables list
      await fetchTables();
    } catch (error) {
      console.error('Error creating reservation:', error);
      alert(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
    } finally {
      setCreatingReservation(false);
    }
  };

  const handleUpdateReservation = async () => {
    if (!editingReservationTable) return;

    if (!editReservationName.trim()) {
      alert('กรุณาใส่ชื่อกลุ่มจองโต๊ะ');
      return;
    }

    if (!editReservationSeats || editReservationSeats < 1) {
      alert('กรุณาใส่จำนวนที่นั่งที่ต้องการจอง (อย่างน้อย 1 ที่)');
      return;
    }

    setUpdatingReservation(true);
    try {
      const updateResponse = await fetch(`/api/party-tables/${editingReservationTable.tableId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableGroupName: editReservationName.trim(),
          reservedSeats: editReservationSeats,
        }),
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(errorData.error || 'Failed to update reservation table');
      }

      await updateResponse.json();

      setShowEditReservationModal(false);
      setEditingReservationTable(null);
      setEditReservationName('');
      setEditReservationSeats(10);
      alert('แก้ไขกลุ่มจองโต๊ะสำเร็จ!');

      // Refresh tables list
      await fetchTables();
    } catch (error) {
      console.error('Error updating reservation:', error);
      alert(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด');
    } finally {
      setUpdatingReservation(false);
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
        // BUSINESS RULE: Check if a Join Table already exists at this table number
        const existingJoinTableAtDestination = tables.find(
          (t) => t.assignedTableNumber === selectedTableNumberForAssign && t.isJoinTable === true
        );

        // Prepare members data
        const membersToAdd = selectedMembersForNewGroup.map((m) => ({
          registrationId: m.registrationId,
          lineUserId: m.lineUserId,
          name: normalizeMemberName(m.name),
          attendeeIndex: m.attendeeIndex,
          companyName: m.companyName,
        }));

        if (existingJoinTableAtDestination) {
          // Join Table exists - add members to existing group instead of creating new one
          console.log('[handleAssignFromModal] Found existing Join Table, adding members to it');

          const addMembersResponse = await fetch(
            `/api/party-tables/${existingJoinTableAtDestination.tableId}/add-members`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ members: membersToAdd }),
            }
          );

          if (!addMembersResponse.ok) {
            const errorData = await addMembersResponse.json();
            throw new Error(errorData.error || 'Failed to add members to existing Join Table');
          }

          // Refresh tables to show updated member list
          await fetchTables();

          setShowAssignModal(false);
          setSelectedMembersForNewGroup([]);
          alert(
            `เพิ่มสมาชิก ${membersToAdd.length} คนเข้ากลุ่ม Join โต๊ะที่โต๊ะ #${selectedTableNumberForAssign} สำเร็จ!`
          );
        } else {
          // No Join Table exists - create new one
          const firstMember = selectedMembersForNewGroup[0];
          const hostRegistration = allRegistrations.find(
            (r: any) => r.registration.registrationId === firstMember.registrationId
          );

          if (!hostRegistration) {
            throw new Error('ไม่พบข้อมูลการลงทะเบียน');
          }

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
              initialMembers: membersToAdd,
              isJoinTable: true, // Mark as Join Table (created from registration codes)
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
                <>
                  <button
                    onClick={() => setShowCreateGroupModal(true)}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                  >
                    + สร้างกลุ่มโต๊ะใหม่
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateReservationModal(true);
                      setReservationName('');
                      setReservationSeats(10);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    + สร้างกลุ่มจองโต๊ะ
                  </button>
                </>
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
              onCreateReservation={() => {
                setShowCreateReservationModal(true);
                setReservationName('');
                setReservationSeats(10);
              }}
              onEditReservation={(table) => {
                setEditingReservationTable(table);
                setEditReservationName(table.tableGroupName || '');
                setEditReservationSeats(table.reservedSeats || 10);
                setShowEditReservationModal(true);
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
              onEditTableName={handleEditTableName}
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
              onEditTableName={handleEditTableName}
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

      {/* Create Reservation Table Modal */}
      {showCreateReservationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">
                  สร้างกลุ่มจองโต๊ะ
                </h3>
                <button
                  onClick={() => {
                    setShowCreateReservationModal(false);
                    setReservationName('');
                    setReservationSeats(10);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  💡 กลุ่มจองโต๊ะใช้สำหรับจองที่นั่งไว้ล่วงหน้าสำหรับผู้ที่ไม่ได้ลงทะเบียนในระบบ
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ชื่อกลุ่มจองโต๊ะ
                </label>
                <input
                  type="text"
                  value={reservationName}
                  onChange={(e) => setReservationName(e.target.value)}
                  placeholder="เช่น: จองสำหรับแขกวีไอพี"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  จำนวนที่นั่งที่ต้องการจอง
                </label>
                <input
                  type="number"
                  min="1"
                  value={reservationSeats}
                  onChange={(e) => setReservationSeats(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCreateReservationModal(false);
                    setReservationName('');
                    setReservationSeats(10);
                  }}
                  disabled={creatingReservation}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleCreateReservation}
                  disabled={creatingReservation || !reservationName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {creatingReservation ? 'กำลังสร้าง...' : 'สร้างกลุ่มจองโต๊ะ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Reservation Table Modal */}
      {showEditReservationModal && editingReservationTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">
                  แก้ไขกลุ่มจองโต๊ะ
                </h3>
                <button
                  onClick={() => {
                    setShowEditReservationModal(false);
                    setEditingReservationTable(null);
                    setEditReservationName('');
                    setEditReservationSeats(10);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ชื่อกลุ่มจองโต๊ะ
                </label>
                <input
                  type="text"
                  value={editReservationName}
                  onChange={(e) => setEditReservationName(e.target.value)}
                  placeholder="เช่น: จองสำหรับแขกวีไอพี"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  จำนวนที่นั่งที่ต้องการจอง
                </label>
                <input
                  type="number"
                  min="1"
                  value={editReservationSeats}
                  onChange={(e) => setEditReservationSeats(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowEditReservationModal(false);
                    setEditingReservationTable(null);
                    setEditReservationName('');
                    setEditReservationSeats(10);
                  }}
                  disabled={updatingReservation}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleUpdateReservation}
                  disabled={updatingReservation || !editReservationName.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {updatingReservation ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Table Name Modal */}
      {showEditNameModal && editingTable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">แก้ไขชื่อกลุ่มโต๊ะ</h3>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ชื่อกลุ่มโต๊ะ:
              </label>
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="เช่น: เพื่อน Agent, กลุ่มมิตรภาพ"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveTableName();
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                ถ้าไม่ระบุชื่อ จะใช้ชื่อบริษัทของเจ้าของโต๊ะเป็นค่าเริ่มต้น
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowEditNameModal(false);
                  setEditingTable(null);
                  setNewTableName('');
                }}
                disabled={savingName}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveTableName}
                disabled={savingName}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {savingName ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
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
  onCreateReservation,
  onEditReservation,
  onDeleteTable,
  onManageMembers,
  onToggleExpand,
  expandedTableId,
  onRemoveMember,
  onEditTableName,
}: {
  tables: EnrichedPartyTable[];
  defaultSeats: number;
  maxSeats?: number;
  onCreateNewGroup: () => void;
  onCreateReservation: () => void;
  onEditReservation: (table: EnrichedPartyTable) => void;
  onDeleteTable: (tableId: string) => void;
  onManageMembers: (tableId: string) => void;
  onToggleExpand: (tableId: string) => void;
  expandedTableId: string | null;
  onRemoveMember: (tableId: string, registrationId: string, attendeeIndex: number, name: string) => void;
  onEditTableName: (table: EnrichedPartyTable) => void;
}) {
  const [searchQuery, setSearchQuery] = React.useState('');

  // Filter tables based on search query
  const activeTables = React.useMemo(() => {
    const active = tables.filter((t) => t.status === 'active');

    if (!searchQuery.trim()) return active;

    const query = searchQuery.toLowerCase();
    return active.filter(table => {
      // Search in table group name
      if (table.tableGroupName?.toLowerCase().includes(query)) return true;

      // Search in host company name
      if (table.hostCompanyName?.toLowerCase().includes(query)) return true;

      // Search in host contact name
      if (table.hostContactName?.toLowerCase().includes(query)) return true;

      // Search in members
      if (table.members?.some(member => {
        // Search in member name
        if (member.name?.toLowerCase().includes(query)) return true;
        // Search in member company name
        if ((member as any).companyName?.toLowerCase().includes(query)) return true;
        // Search in member LINE display name
        if ((member as any).lineDisplayName?.toLowerCase().includes(query)) return true;
        // Search in registration ID
        if (member.registrationId?.toLowerCase().includes(query)) return true;
        return false;
      })) return true;

      return false;
    });
  }, [tables, searchQuery]);

  // Check if there are NO tables at all (not just filtered results)
  const hasNoTables = tables.filter((t) => t.status === 'active').length === 0;

  // Filter state
  const [filterUnassigned, setFilterUnassigned] = React.useState(false);

  // Apply unassigned filter
  const filteredTables = React.useMemo(() => {
    if (!filterUnassigned) return activeTables;
    return activeTables.filter(t => !t.assignedTableNumber);
  }, [activeTables, filterUnassigned]);

  return (
    <div className="space-y-4">
      {/* Search Box - Always show if there are any tables */}
      {!hasNoTables && (
        <>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหา: ชื่อบริษัท, ชื่อ LINE, ชื่อผู้เข้าร่วม, รหัสการจอง, ชื่อโต๊ะ..."
              className="w-full px-4 py-2.5 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                ล้าง
              </button>
            )}
          </div>

          {/* Filter: Unassigned Tables */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterUnassigned}
                onChange={(e) => setFilterUnassigned(e.target.checked)}
                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">แสดงเฉพาะโต๊ะที่ยังไม่ระบุเลขโต๊ะ</span>
            </label>
            {filterUnassigned && (
              <span className="text-xs text-purple-600 font-medium">
                ({filteredTables.length} โต๊ะ)
              </span>
            )}
          </div>

          {/* Search Results Info */}
          {searchQuery && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                <span className="font-medium">พบ {filteredTables.length} กลุ่มโต๊ะ</span>
                {filteredTables.length === 0 && ' ที่ตรงกับคำค้นหา'}
              </p>
            </div>
          )}
        </>
      )}

      {/* No Tables Message */}
      {hasNoTables && (
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
          <div className="mt-4 flex gap-2 justify-center">
            <button
              onClick={onCreateNewGroup}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              สร้างกลุ่มโต๊ะใหม่
            </button>
            <button
              onClick={onCreateReservation}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              สร้างกลุ่มจองโต๊ะ
            </button>
          </div>
        </div>
      )}

      {/* No Search Results Message */}
      {!hasNoTables && filteredTables.length === 0 && (
        <div className="text-center py-8">
          <svg
            className="w-12 h-12 text-gray-400 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <p className="text-gray-600">ไม่พบกลุ่มโต๊ะที่ตรงกับเงื่อนไข</p>
          <p className="text-sm text-gray-500 mt-1">ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
        </div>
      )}

      {/* Table Groups List */}
      {filteredTables.map((table) => {
        const isExpanded = expandedTableId === table.tableId;
        const isReservation = table.isReservation === true;
        const memberCount = isReservation ? (table.reservedSeats || 0) : table.members.length;
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
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">
                      {isReservation
                        ? `🔖 ${table.tableGroupName || 'กลุ่มจองโต๊ะ'}`
                        : (table.isJoinTable ? 'Join โต๊ะ' : (table.tableGroupName || `โต๊ะของ ${table.hostCompanyName}`))}
                    </h3>
                    {/* Edit name button */}
                    <button
                      onClick={() => onEditTableName(table)}
                      className="text-gray-400 hover:text-blue-600 p-1"
                      title="แก้ไขชื่อกลุ่มโต๊ะ"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                  </div>
                  {table.assignedTableNumber && (
                    <span className="px-3 py-1 bg-purple-600 text-white text-xs font-medium rounded-full">
                      โต๊ะ #{table.assignedTableNumber}
                    </span>
                  )}
                </div>
                {!isReservation && (
                  <p className="text-sm text-gray-600 mt-1">
                    เจ้าของโต๊ะ: {table.hostContactName} ({table.hostCompanyName})
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded ${statusColor}`}>
                    {isReservation
                      ? `${memberCount} ที่จอง / ${maxSeats || defaultSeats} ที่นั่ง (${capacityPercentage}%)`
                      : `${memberCount} / ${maxSeats || defaultSeats} ที่นั่ง (${capacityPercentage}%)`
                    }
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isReservation ? (
                  <button
                    onClick={() => onEditReservation(table)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                    title="แก้ไขกลุ่มจอง"
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
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>
                ) : (
                  <>
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
                  </>
                )}
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

            {isExpanded && !isReservation && (
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
  onEditTableName,
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
  onEditTableName: (table: EnrichedPartyTable) => void;
  defaultSeats: number;
}) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterNotFull, setFilterNotFull] = React.useState(false);

  // Filter table slots based on search query
  const filteredTableSlots = React.useMemo(() => {
    let slots = tableSlots;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      slots = slots.filter(slot => {
        // Check if any group in this slot matches the search
        return slot.groups.some(group => {
          // Search in table group name
          if (group.tableGroupName?.toLowerCase().includes(query)) return true;

          // Search in host company name
          if (group.hostCompanyName?.toLowerCase().includes(query)) return true;

          // Search in host contact name
          if (group.hostContactName?.toLowerCase().includes(query)) return true;

          // Search in members
          if (group.members?.some(member => {
            // Search in member name
            if (member.name?.toLowerCase().includes(query)) return true;
            // Search in member company name
            if ((member as any).companyName?.toLowerCase().includes(query)) return true;
            // Search in member LINE display name
            if ((member as any).lineDisplayName?.toLowerCase().includes(query)) return true;
            // Search in registration ID
            if (member.registrationId?.toLowerCase().includes(query)) return true;
            return false;
          })) return true;

          return false;
        });
      });
    }

    // Apply "not full" filter
    if (filterNotFull) {
      slots = slots.filter(slot => {
        // Only show slots that have groups with members less than defaultSeats
        return slot.groups.some(group => {
          const memberCount = group.isReservation ? (group.reservedSeats || 0) : group.members.length;
          return memberCount < defaultSeats;
        });
      });
    }

    return slots;
  }, [tableSlots, searchQuery, filterNotFull, defaultSeats]);

  return (
    <div className="space-y-6">
      {/* Search Box */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ค้นหา: ชื่อบริษัท, ชื่อ LINE, ชื่อผู้เข้าร่วม, รหัสการจอง, ชื่อโต๊ะ..."
          className="w-full px-4 py-2.5 pr-20 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            ล้าง
          </button>
        )}
      </div>

      {/* Filter: Not Full Tables */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterNotFull}
            onChange={(e) => setFilterNotFull(e.target.checked)}
            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
          />
          <span className="text-sm text-gray-700">แสดงเฉพาะโต๊ะที่จำนวนสมาชิกยังไม่ถึงจำนวนที่นั่งมาตรฐาน ({defaultSeats} คน)</span>
        </label>
        {filterNotFull && (
          <span className="text-xs text-purple-600 font-medium">
            ({filteredTableSlots.length} โต๊ะ)
          </span>
        )}
      </div>

      {/* Search Results Info */}
      {searchQuery && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            <span className="font-medium">พบ {filteredTableSlots.length} โต๊ะ</span>
            {filteredTableSlots.length === 0 && ' ที่ตรงกับคำค้นหา'}
          </p>
        </div>
      )}
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
          {filteredTableSlots.map((slot) => {
            const isOccupied = slot.groups.length > 0;
            const totalMembers = slot.groups.reduce((sum, g) => {
              const memberCount = g.isReservation ? (g.reservedSeats || 0) : g.members.length;
              return sum + memberCount;
            }, 0);

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
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">โต๊ะ {slot.tableNumber}</span>
                      {isOccupied && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          totalMembers >= defaultSeats
                            ? 'bg-green-100 text-green-800'
                            : 'bg-purple-800 text-white'
                        }`}>
                          {totalMembers} คน
                        </span>
                      )}
                    </div>
                    {isOccupied && (
                      <button
                        onClick={() => onTableNumberClick(slot.tableNumber)}
                        className="p-1 bg-white rounded hover:bg-gray-100 transition-colors"
                        title="เพิ่มกลุ่มเข้าโต๊ะนี้"
                      >
                        <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-3">
                    {isOccupied ? (
                      <div className="space-y-3">
                        {/* Display each group separately */}
                        {slot.groups.map((group) => {
                          const isJoinTable = group.isJoinTable;
                          const isReservation = group.isReservation;
                          const memberCount = isReservation ? (group.reservedSeats || 0) : group.members.length;
                          const borderColor = isJoinTable ? 'border-orange-300' : (isReservation ? 'border-blue-300' : 'border-gray-200');
                          const groupName = isJoinTable
                            ? 'Join โต๊ะ'
                            : (isReservation
                              ? `🔖 ${group.tableGroupName || 'กลุ่มจองโต๊ะ'}`
                              : (group.tableGroupName || `กลุ่มโต๊ะ: ${group.hostCompanyName}`));

                          return (
                            <div key={group.tableId} className={`border-2 ${borderColor} rounded-lg p-2 bg-white`}>
                              {/* Group Header */}
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-1">
                                    <p className="font-medium text-xs text-gray-900">
                                      {groupName}
                                    </p>
                                    {/* Edit name button */}
                                    <button
                                      onClick={() => onEditTableName(group)}
                                      className="text-gray-400 hover:text-blue-600 p-0.5"
                                      title="แก้ไขชื่อกลุ่มโต๊ะ"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                    </button>
                                  </div>
                                  <p className={`text-xs mt-0.5 ${
                                    memberCount >= defaultSeats ? 'text-green-700 font-medium' : 'text-gray-500'
                                  }`}>
                                    {isReservation ? `${memberCount} ที่จอง` : `${memberCount} คน`}
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  {/* Move table button */}
                                  <button
                                    onClick={() => onChangeTableNumber(group)}
                                    className="text-blue-600 hover:text-blue-800 p-1"
                                    title="ย้ายกลุ่มนี้ไปเลขโต๊ะอื่น"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                    </svg>
                                  </button>
                                  {/* Remove group button */}
                                  <button
                                    onClick={() => onUnassignTableNumber(group.tableId)}
                                    className="text-red-600 hover:text-red-800 p-1"
                                    title="ลบกลุ่มนี้ออกจากโต๊ะ"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              {/* Member List - Hide for reservations */}
                              {!isReservation && (
                                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                  {group.members.map((member, idx) => {
                                  const memberDisplayName = isJoinTable
                                    ? displayMemberNameWithCompany(member.name, member.companyName, member.attendeeIndex)
                                    : displayMemberName(member.name, member.attendeeIndex);

                                  return (
                                    <div key={idx} className="text-xs text-gray-600 flex items-center gap-1 group/member">
                                      <span className="text-purple-400">•</span>
                                      <span className="flex-1">{memberDisplayName}</span>
                                      {/* Show remove button only for Join tables */}
                                      {isJoinTable && (
                                        <button
                                          onClick={() => onRemoveMember(
                                            group.tableId,
                                            member.registrationId,
                                            member.attendeeIndex,
                                            displayMemberName(member.name, member.attendeeIndex)
                                          )}
                                          className="opacity-0 group-hover/member:opacity-100 text-red-500 hover:text-red-700 transition-opacity p-0.5"
                                          title="ลบออกจากกลุ่ม"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        onClick={() => onTableNumberClick(slot.tableNumber)}
                        className="w-full py-6 text-sm text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                      >
                        + จัดกลุ่มเข้าโต๊ะ
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
            {group.isJoinTable ? 'Join โต๊ะ' : (group.tableGroupName || `โต๊ะของ ${group.hostCompanyName}`)}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {group.isReservation ? (group.reservedSeats || 0) : group.members.length} คน • {group.hostContactName}
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
