'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

// Helper function to normalize member names from JSON array format
function normalizeMemberName(name: any): string {
  if (!name) return '';
  let current = name;

  // Handle multiple levels of JSON encoding
  while (typeof current === 'string' && (current.startsWith('[') || current.startsWith('{'))) {
    try {
      const parsed = JSON.parse(current);
      if (Array.isArray(parsed)) {
        if (parsed.length === 1) {
          current = parsed[0];
          continue;
        }
        return parsed.join(', ').trim();
      }
      current = parsed;
    } catch {
      break;
    }
  }

  if (Array.isArray(current)) {
    return current.join(', ').trim();
  }
  return String(current).trim();
}

// Helper function to display member name with fallback
function displayMemberName(name: string, index?: number): string {
  const normalized = normalizeMemberName(name);
  if (!normalized || normalized.trim() === '') {
    return index !== undefined ? `ผู้เข้าร่วมคนที่ ${index + 1}` : 'ไม่ระบุชื่อ';
  }
  return normalized;
}

interface TableMember {
  registrationId: string;
  lineUserId: string;
  name: string;
  attendeeIndex: number;
  companyName: string;
  joinedAt: string;
  joinedBy: string;
  joinedByName?: string;
}

interface PartyTable {
  tableId: string;
  eventId: string;
  tableGroupName?: string;
  hostRegistrationId: string;
  hostCompanyName: string;
  hostContactName: string;
  members: TableMember[];
  assignedTableNumber?: number;
  isJoinTable?: boolean;
  status: 'active' | 'deleted';
  createdAt: string;
  updatedAt: string;
}

interface PartyTableSettings {
  totalTables: number;
  defaultSeatsPerTable: number;
  maxSeatsPerTable?: number;
  showTableNumbersToMembers: boolean;
  tableActive: boolean;
}

interface UserRegistration {
  registrationId: string;
  lineUserId: string;
  attendeeNames?: string;
  companyName?: string;
  contactName?: string;
}

interface PartyTableSectionProps {
  eventId: string;
  event: {
    hasPartyTableFeature?: boolean;
    partyTableSettings?: PartyTableSettings;
  };
  userRegistration: UserRegistration | null;
  session: {
    user?: {
      lineUserId?: string;
      role?: string;
    };
  } | null;
  isCommitteeOrAdmin: boolean;
  attendeeNames: string[];
}

export default function PartyTableSection({
  eventId,
  event,
  userRegistration,
  session,
  isCommitteeOrAdmin,
  attendeeNames,
}: PartyTableSectionProps) {
  // State management
  const [memberTables, setMemberTables] = useState<PartyTable[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [selectedMembersForTable, setSelectedMembersForTable] = useState<number[]>([]);
  const [creatingTable, setCreatingTable] = useState(false);
  const [invitingToTableId, setInvitingToTableId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [allTables, setAllTables] = useState<PartyTable[]>([]);
  const [showJoinTableModal, setShowJoinTableModal] = useState(false);
  const [searchRegistrationId, setSearchRegistrationId] = useState('');
  const [searchedRegistration, setSearchedRegistration] = useState<any>(null);
  const [searchedRegistrationTables, setSearchedRegistrationTables] = useState<PartyTable[]>([]);
  const [selectedMembersToInvite, setSelectedMembersToInvite] = useState<any[]>([]);
  const [inviting, setInviting] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showTableTooltip, setShowTableTooltip] = useState(false);
  const [showDeleteTableConfirmModal, setShowDeleteTableConfirmModal] = useState(false);
  const [pendingMemberRemoval, setPendingMemberRemoval] = useState<{
    registrationId: string;
    attendeeIndex: number;
    name: string;
    tableId: string;
  } | null>(null);
  const [editingTableName, setEditingTableName] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [savingTableName, setSavingTableName] = useState(false);
  // Join Table states
  const [joinSearchRegistrationId, setJoinSearchRegistrationId] = useState('');
  const [joinSearchedRegistration, setJoinSearchedRegistration] = useState<any>(null);
  const [joinSearchedTables, setJoinSearchedTables] = useState<PartyTable[]>([]);
  const [joinSearchLoading, setJoinSearchLoading] = useState(false);
  const [selectedTableToJoin, setSelectedTableToJoin] = useState<string | null>(null);
  const [selectedMembersToJoin, setSelectedMembersToJoin] = useState<number[]>([]);
  const [joiningTable, setJoiningTable] = useState(false);

  // Derived state
  const ownedTables = memberTables.filter(
    (table) => table.hostRegistrationId === userRegistration?.registrationId
  );
  const joinedTables = memberTables.filter(
    (table) => table.hostRegistrationId !== userRegistration?.registrationId
  );
  const memberTable = ownedTables[0] || null;

  // Get set of attendee indexes that are already in any table
  const attendeeIndexesInTables = new Set<number>();
  memberTables.forEach((table) => {
    table.members.forEach((member) => {
      if (member.registrationId === userRegistration?.registrationId) {
        attendeeIndexesInTables.add(member.attendeeIndex);
      }
    });
  });

  // Fetch member tables on mount and when dependencies change
  useEffect(() => {
    if (event?.hasPartyTableFeature && userRegistration) {
      fetchMemberTables();
    }
  }, [event?.hasPartyTableFeature, userRegistration?.registrationId]);

  // Fetch tables for current user
  const fetchMemberTables = async () => {
    if (!userRegistration?.registrationId) return;

    setTableLoading(true);
    try {
      const response = await fetch(
        `/api/events/${eventId}/my-party-tables?registrationId=${userRegistration.registrationId}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch party tables');
      }

      const data = await response.json();
      setMemberTables(data.tables || []);
    } catch (error) {
      console.error('Error fetching party tables:', error);
      toast.error('ไม่สามารถโหลดข้อมูลโต๊ะได้');
    } finally {
      setTableLoading(false);
    }
  };

  // Handle create table
  const handleCreateTable = async () => {
    if (!userRegistration) {
      toast.error('กรุณาลงทะเบียนก่อนสร้างโต๊ะ');
      return;
    }

    if (selectedMembersForTable.length === 0) {
      toast.error('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
      return;
    }

    setCreatingTable(true);
    try {
      // Build members array - SAME AS CARPOOL
      const initialMembers = selectedMembersForTable.map(index => ({
        registrationId: userRegistration.registrationId,
        lineUserId: userRegistration.lineUserId,
        name: attendeeNames[index] || '',
        attendeeIndex: index,
        companyName: userRegistration.companyName || '',
      }));

      // Use fallback values for required fields
      const hostCompanyName = userRegistration.companyName || 'ไม่ระบุบริษัท';
      const hostContactName = userRegistration.contactName || attendeeNames[0] || 'ไม่ระบุผู้ติดต่อ';

      const response = await fetch('/api/party-tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          tableGroupName: undefined, // Let backend auto-generate from company name
          hostRegistrationId: userRegistration.registrationId,
          hostCompanyName,
          hostContactName,
          initialMembers,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create party table');
      }

      const data = await response.json();
      toast.success('สร้างโต๊ะสำเร็จ!');

      // Reset and refresh
      setShowCreateTableModal(false);
      setSelectedMembersForTable([]);
      await fetchMemberTables();
    } catch (error: any) {
      console.error('Error creating party table:', error);
      toast.error(error.message || 'ไม่สามารถสร้างโต๊ะได้');
    } finally {
      setCreatingTable(false);
    }
  };

  // Handle delete table
  const handleDeleteTable = async (tableId: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบโต๊ะนี้?')) return;

    try {
      const response = await fetch(`/api/party-tables/${tableId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Deleted by table host',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete table');
      }

      toast.success('ลบโต๊ะสำเร็จ!');
      await fetchMemberTables();
    } catch (error: any) {
      console.error('Error deleting table:', error);
      toast.error(error.message || 'ไม่สามารถลบโต๊ะได้');
    }
  };

  // Handle leave table (remove member)
  const handleLeaveTable = async (tableId: string, attendeeIndex: number) => {
    if (!userRegistration) return;

    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการออกจากโต๊ะนี้?')) return;

    try {
      const response = await fetch(`/api/party-tables/${tableId}/remove-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds: [
            {
              registrationId: userRegistration.registrationId,
              attendeeIndex,
            },
          ],
          reason: 'Left by member',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to leave table');
      }

      toast.success('ออกจากโต๊ะสำเร็จ!');
      await fetchMemberTables();
    } catch (error: any) {
      console.error('Error leaving table:', error);
      toast.error(error.message || 'ไม่สามารถออกจากโต๊ะได้');
    }
  };

  // Handle remove member (for table host)
  const handleRemoveMember = async () => {
    if (!pendingMemberRemoval) return;

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
            reason: 'Removed by table host',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove member');
      }

      toast.success(`นำ ${pendingMemberRemoval.name} ออกจากโต๊ะสำเร็จ!`);
      setPendingMemberRemoval(null);
      await fetchMemberTables();
    } catch (error: any) {
      console.error('Error removing member:', error);
      toast.error(error.message || 'ไม่สามารถนำสมาชิกออกได้');
    }
  };

  // Search registration for inviting
  const handleSearchRegistration = async () => {
    if (!searchRegistrationId.trim()) {
      toast.error('กรุณากรอกรหัสลงทะเบียน');
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
      setSearchedRegistration(data.registration);
      setSelectedMembersToInvite([]);

      // Fetch tables for this registration to check which members are already in tables
      const tablesResponse = await fetch(
        `/api/events/${eventId}/my-party-tables?registrationId=${searchRegistrationId}`
      );

      if (tablesResponse.ok) {
        const tablesData = await tablesResponse.json();
        setSearchedRegistrationTables(tablesData.tables || []);
      } else {
        setSearchedRegistrationTables([]);
      }
    } catch (error: any) {
      console.error('Error searching registration:', error);
      toast.error(error.message || 'ไม่พบรหัสลงทะเบียนนี้');
      setSearchedRegistration(null);
      setSearchedRegistrationTables([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Handle invite members to table
  const handleInviteMembers = async () => {
    if (!invitingToTableId || selectedMembersToInvite.length === 0) {
      toast.error('กรุณาเลือกสมาชิกที่ต้องการเชิญ');
      return;
    }

    setInviting(true);
    try {
      const response = await fetch(`/api/party-tables/${invitingToTableId}/add-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          members: selectedMembersToInvite,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to invite members');
      }

      toast.success(`เชิญสมาชิก ${selectedMembersToInvite.length} คนสำเร็จ!`);

      // Reset and refresh
      setShowInviteModal(false);
      setInvitingToTableId(null);
      setSearchRegistrationId('');
      setSearchedRegistration(null);
      setSearchedRegistrationTables([]);
      setSelectedMembersToInvite([]);
      await fetchMemberTables();
    } catch (error: any) {
      console.error('Error inviting members:', error);
      toast.error(error.message || 'ไม่สามารถเชิญสมาชิกได้');
    } finally {
      setInviting(false);
    }
  };

  // Search registration for joining table
  const handleJoinSearchRegistration = async () => {
    if (!joinSearchRegistrationId.trim()) {
      toast.error('กรุณากรอกรหัสลงทะเบียน');
      return;
    }

    setJoinSearchLoading(true);
    try {
      // First, search for the registration
      const regResponse = await fetch(
        `/api/registrations/${joinSearchRegistrationId}`
      );

      if (!regResponse.ok) {
        throw new Error('ไม่พบรหัสลงทะเบียนนี้');
      }

      const regData = await regResponse.json();
      setJoinSearchedRegistration(regData.registration);

      // Then, fetch their party tables
      const tablesResponse = await fetch(
        `/api/events/${eventId}/my-party-tables?registrationId=${joinSearchRegistrationId}`
      );

      if (!tablesResponse.ok) {
        throw new Error('ไม่สามารถดึงข้อมูลโต๊ะได้');
      }

      const tablesData = await tablesResponse.json();
      // Filter for tables where they are the host (owner)
      const ownedTables = (tablesData.tables || []).filter(
        (table: PartyTable) => table.hostRegistrationId === joinSearchRegistrationId
      );
      setJoinSearchedTables(ownedTables);
      setSelectedTableToJoin(null);
      setSelectedMembersToJoin([]);
    } catch (error: any) {
      console.error('Error searching registration:', error);
      toast.error(error.message || 'ไม่พบรหัสลงทะเบียนนี้');
      setJoinSearchedRegistration(null);
      setJoinSearchedTables([]);
    } finally {
      setJoinSearchLoading(false);
    }
  };

  // Handle join table
  const handleJoinTable = async () => {
    if (!selectedTableToJoin || selectedMembersToJoin.length === 0 || !userRegistration) {
      toast.error('กรุณาเลือกโต๊ะและสมาชิกที่ต้องการ Join');
      return;
    }

    setJoiningTable(true);
    try {
      // Build members array
      const members = selectedMembersToJoin.map((index) => ({
        registrationId: userRegistration.registrationId,
        lineUserId: userRegistration.lineUserId,
        name: attendeeNames[index] || '',
        attendeeIndex: index,
        companyName: userRegistration.companyName || '',
      }));

      const response = await fetch(`/api/party-tables/${selectedTableToJoin}/add-members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ members }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join table');
      }

      toast.success(`Join โต๊ะสำเร็จ! ${members.length} คน`);

      // Reset and refresh
      setShowJoinTableModal(false);
      setJoinSearchRegistrationId('');
      setJoinSearchedRegistration(null);
      setJoinSearchedTables([]);
      setSelectedTableToJoin(null);
      setSelectedMembersToJoin([]);
      await fetchMemberTables();
    } catch (error: any) {
      console.error('Error joining table:', error);
      toast.error(error.message || 'ไม่สามารถ Join โต๊ะได้');
    } finally {
      setJoiningTable(false);
    }
  };

  // Update table name
  const handleUpdateTableName = async (tableId: string) => {
    if (!newTableName.trim()) {
      toast.error('กรุณากรอกชื่อกลุ่มโต๊ะ');
      return;
    }

    setSavingTableName(true);
    try {
      const response = await fetch(`/api/party-tables/${tableId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableGroupName: newTableName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update table name');
      }

      toast.success('แก้ไขชื่อกลุ่มโต๊ะสำเร็จ!');
      setEditingTableName(false);
      setNewTableName('');
      await fetchMemberTables();
    } catch (error: any) {
      console.error('Error updating table name:', error);
      toast.error(error.message || 'ไม่สามารถแก้ไขชื่อกลุ่มโต๊ะได้');
    } finally {
      setSavingTableName(false);
    }
  };

  // Check if Party Table feature is active
  if (!event?.hasPartyTableFeature) {
    return null;
  }

  // Check if Party Table is active for members (not admin)
  if (!isCommitteeOrAdmin && !event?.partyTableSettings?.tableActive) {
    return null;
  }

  return (
    <div id="party-table-section" className="bg-white border border-gray-300 rounded-lg p-4 mb-6">
      {/* Inactive Warning Banner for Admin */}
      {isCommitteeOrAdmin && !event?.partyTableSettings?.tableActive && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-yellow-900">Party Table ปิดใช้งาน</h3>
              <p className="text-xs text-yellow-700 mt-1">
                ฟีเจอร์ Party Table ถูกปิดใช้งานโดย Admin (สมาชิกไม่เห็นส่วนนี้)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold text-gray-900">
            🪑 โต๊ะนั่ง (Party Table)
          </h3>
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowTableTooltip(true)}
              onMouseLeave={() => setShowTableTooltip(false)}
              onClick={() => setShowTableTooltip(!showTableTooltip)}
              className="text-blue-500 hover:text-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {showTableTooltip && (
              <div className="absolute left-0 top-6 z-50 w-80 p-4 bg-white border-2 border-purple-300 rounded-lg shadow-xl">
                <div className="space-y-3 text-xs text-gray-700">
                  <div>
                    <p className="font-semibold text-purple-700 mb-1">
                      🪑 โต๊ะนั่ง (Party Table)
                    </p>
                    <p>
                      ระบบจัดโต๊ะนั่งในงาน ให้คุณสามารถสร้างกลุ่มโต๊ะและนั่งโต๊ะเดียวกันกับเพื่อนได้
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-purple-700 mb-1">📌 วิธีการสร้างโต๊ะ:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>กดปุ่ม "สร้างกลุ่มโต๊ะใหม่"</li>
                      <li>เลือกสมาชิกในรหัสลงทะเบียนของคุณ</li>
                      <li>เชิญเพื่อนจากรหัสลงทะเบียนอื่นๆ ได้ภายหลัง</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-purple-700 mb-1">🤝 วิธีการ Join โต๊ะ:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li><strong>วิธีที่ 1:</strong> รอให้เจ้าของโต๊ะเชิญคุณ</li>
                      <li><strong>วิธีที่ 2:</strong> กดปุ่ม "Join โต๊ะ" ค้นหารหัสลงทะเบียนของเพื่อน แล้วขอ Join โต๊ะของเขา</li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-purple-200">
                    <p className="text-gray-600">
                      💡 Admin จะจัดเลขโต๊ะให้ภายหลัง
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons - Only show if user has tables and has available members */}
          {memberTables.length > 0 && attendeeIndexesInTables.size < attendeeNames.length && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => setShowJoinTableModal(true)}
                className="px-2 py-1 bg-white border border-green-500 text-green-700 text-xs font-medium rounded hover:bg-green-50 transition-colors flex items-center gap-1"
                title="Join โต๊ะที่เพื่อนสร้างไว้"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                <span className="hidden sm:inline">Join โต๊ะ</span>
              </button>
              <button
                onClick={() => setShowCreateTableModal(true)}
                className="px-2 py-1 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                title="สร้างกลุ่มโต๊ะใหม่"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">สร้างกลุ่มโต๊ะ</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {tableLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        <>
          {/* Owned Tables */}
          {ownedTables.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                โต๊ะของคุณ
              </h3>
              {ownedTables.map((table) => (
                <div key={table.tableId} className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="mb-3">
                    <div className="mb-2">
                      <div className="w-full">
                        {editingTableName ? (
                          <div>
                            <input
                              type="text"
                              value={newTableName}
                              onChange={(e) => setNewTableName(e.target.value)}
                              placeholder="ชื่อกลุ่มโต๊ะ (ไม่บังคับ)"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleUpdateTableName(table.tableId)}
                                disabled={savingTableName}
                                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                {savingTableName ? 'กำลังบันทึก...' : 'บันทึก'}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingTableName(false);
                                  setNewTableName('');
                                }}
                                className="px-4 py-2 bg-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-400"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold text-purple-900">
                              {table.tableGroupName || `โต๊ะของ ${table.hostCompanyName}`}
                            </h4>
                            <button
                              onClick={() => {
                                setEditingTableName(true);
                                setNewTableName(table.tableGroupName || '');
                              }}
                              className="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded transition-colors"
                              title="แก้ไขชื่อกลุ่ม"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {/* Table Number */}
                        {event?.partyTableSettings?.showTableNumbersToMembers && table.assignedTableNumber && (
                          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-purple-600 text-white text-sm font-medium rounded-full">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                            </svg>
                            โต๊ะ #{table.assignedTableNumber}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Warning for assigned table */}
                  {table.assignedTableNumber && !table.isJoinTable && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2">
                      <p className="text-xs text-yellow-800">
                        ⚠️ โต๊ะนี้ถูกจัดเลขโต๊ะแล้ว ไม่สามารถลบสมาชิกออกได้
                        <br />
                        หากต้องการแก้ไข กรุณาติดต่อ Admin
                      </p>
                    </div>
                  )}

                  {/* Members List */}
                  <div className="space-y-2 mb-4">
                    <p className="text-xs font-medium text-gray-600">
                      สมาชิกในโต๊ะ ({table.members.length} คน
                      {event?.partyTableSettings?.defaultSeatsPerTable &&
                        ` / ${event.partyTableSettings.defaultSeatsPerTable} ที่นั่ง`
                      })
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {table.members.map((member) => (
                        <div
                          key={`${member.registrationId}-${member.attendeeIndex}`}
                          className="flex items-center justify-between bg-white p-2 rounded border border-purple-200"
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{displayMemberName(member.name, member.attendeeIndex)}</p>
                              <p className="text-xs text-gray-500">{member.companyName}</p>
                            </div>
                          </div>
                          {!table.assignedTableNumber && (
                            <button
                              onClick={() =>
                                setPendingMemberRemoval({
                                  registrationId: member.registrationId,
                                  attendeeIndex: member.attendeeIndex,
                                  name: member.name,
                                  tableId: table.tableId,
                                })
                              }
                              className="text-red-600 hover:text-red-800"
                              title={member.registrationId === userRegistration?.registrationId ? "ออกจากโต๊ะ" : "นำออกจากโต๊ะ"}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Action Buttons - Moved to bottom, only show when NOT editing */}
                  {!editingTableName && (
                    <div className="flex items-center gap-2 pt-3 border-t border-purple-200">
                      <button
                        onClick={() => {
                          setInvitingToTableId(table.tableId);
                          setShowInviteModal(true);
                        }}
                        className="flex-1 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        เชิญ
                      </button>
                      <button
                        onClick={() => handleDeleteTable(table.tableId)}
                        className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        ลบโต๊ะ
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Joined Tables */}
          {joinedTables.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                โต๊ะที่เข้าร่วม
              </h3>
              {joinedTables.map((table) => (
                <div key={table.tableId} className="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-base font-semibold text-green-900">
                        {table.tableGroupName || `โต๊ะของ ${table.hostCompanyName}`}
                      </h4>
                      <p className="text-xs text-gray-600 mt-1">เจ้าของโต๊ะ: {table.hostContactName}</p>

                      {/* Table Number */}
                      {event?.partyTableSettings?.showTableNumbersToMembers && table.assignedTableNumber && (
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-green-600 text-white text-sm font-medium rounded-full">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                          </svg>
                          โต๊ะ #{table.assignedTableNumber}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Members List */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-600">
                      สมาชิกในโต๊ะ ({table.members.length} คน)
                    </p>
                    {table.assignedTableNumber && !table.isJoinTable && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2">
                        <p className="text-xs text-yellow-800">
                          ⚠️ โต๊ะนี้ถูกจัดเลขโต๊ะแล้ว ไม่สามารถลบสมาชิกออกได้
                          <br />
                          หากต้องการแก้ไข กรุณาติดต่อ Admin
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {table.members.map((member) => {
                        const isMyMember =
                          member.registrationId === userRegistration?.registrationId;
                        const canLeave = !table.assignedTableNumber || table.isJoinTable;
                        return (
                          <div
                            key={`${member.registrationId}-${member.attendeeIndex}`}
                            className={`flex items-center justify-between p-2 rounded border ${
                              isMyMember
                                ? 'bg-blue-50 border-blue-200'
                                : 'bg-white border-green-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {displayMemberName(member.name, member.attendeeIndex)}
                                  {isMyMember && (
                                    <span className="ml-2 text-xs text-blue-600 font-semibold">
                                      (คุณ)
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-500">{member.companyName}</p>
                              </div>
                            </div>
                            {isMyMember && canLeave && (
                              <button
                                onClick={() => handleLeaveTable(table.tableId, member.attendeeIndex)}
                                className="text-red-600 hover:text-red-800 text-xs font-medium"
                              >
                                ออกจากโต๊ะ
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {memberTables.length === 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">คุณยังไม่มีกลุ่มโต๊ะ</h3>
                  <p className="text-sm text-gray-700 mb-4">
                    📌 <strong>หมายเหตุ:</strong> ทีมงานจะจัดที่นั่งให้สำหรับสมาชิกที่ไม่ได้แจ้งกลุ่มโต๊ะมาล่วงหน้า
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    หากต้องการนั่งโต๊ะเดียวกันกับเพื่อน คุณสามารถ:
                  </p>
                  <ul className="text-sm text-gray-600 space-y-2 mb-4 ml-4">
                    <li className="flex items-start gap-2">
                      <span className="text-purple-600 font-bold mt-0.5">•</span>
                      <span><strong>สร้างกลุ่มโต๊ะใหม่</strong> และเชิญเพื่อนมาร่วม</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-600 font-bold mt-0.5">•</span>
                      <span><strong>Join โต๊ะ</strong> ที่เพื่อนสร้างไว้แล้ว</span>
                    </li>
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setShowCreateTableModal(true)}
                      className="px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      สร้างกลุ่มโต๊ะ
                    </button>
                    <button
                      onClick={() => setShowJoinTableModal(true)}
                      className="px-3 py-2 bg-white border border-green-600 text-green-700 text-sm font-medium rounded-md hover:bg-green-50 transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      Join โต๊ะ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Table Modal */}
      {showCreateTableModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">สร้างโต๊ะใหม่</h3>
              <button
                onClick={() => {
                  setShowCreateTableModal(false);
                  setSelectedMembersForTable([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  💡 ระบบจะใช้ชื่อบริษัทของคุณเป็นชื่อกลุ่มโต๊ะโดยอัตโนมัติ
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลือกสมาชิกในรหัสลงทะเบียนของคุณ (ต้องเลือกอย่างน้อย 1 คน)
                </label>
                <div className="border border-gray-300 rounded-lg p-3 max-h-60 overflow-y-auto">
                  {attendeeNames.map((name, index) => {
                    const isAlreadyInTable = attendeeIndexesInTables.has(index);
                    return (
                      <label
                        key={index}
                        className={`flex items-center gap-3 p-2 rounded ${
                          isAlreadyInTable
                            ? 'bg-gray-100 cursor-not-allowed'
                            : 'hover:bg-gray-50 cursor-pointer'
                        }`}
                        title={isAlreadyInTable ? 'สมาชิกคนนี้อยู่ในกลุ่มโต๊ะอื่นอยู่แล้ว' : ''}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembersForTable.includes(index)}
                          disabled={isAlreadyInTable}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMembersForTable([...selectedMembersForTable, index]);
                            } else {
                              setSelectedMembersForTable(
                                selectedMembersForTable.filter((i) => i !== index)
                              );
                            }
                          }}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <span className={`text-sm ${isAlreadyInTable ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {displayMemberName(name, index)}
                          {isAlreadyInTable && <span className="ml-2 text-xs">(อยู่ในโต๊ะอื่นแล้ว)</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateTableModal(false);
                  setSelectedMembersForTable([]);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCreateTable}
                disabled={creatingTable || selectedMembersForTable.length === 0}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                {creatingTable ? 'กำลังสร้าง...' : 'สร้างโต๊ะ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">เชิญสมาชิกเข้าโต๊ะ</h3>

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

              {/* Section: Own Team Members Not in Any Table */}
              {userRegistration && attendeeNames.length > 0 && (
                <div className="border border-purple-300 bg-purple-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-purple-900 mb-2">
                    สมาชิกของคุณที่ยังไม่ได้อยู่ในโต๊ะ
                  </p>
                  <div className="space-y-2">
                    {attendeeNames.map((name, index) => {
                      const isInTable = attendeeIndexesInTables.has(index);
                      if (isInTable) return null; // Skip members already in tables

                      const isSelected = selectedMembersToInvite.some(
                        (m) =>
                          m.registrationId === userRegistration.registrationId &&
                          m.attendeeIndex === index
                      );

                      return (
                        <label
                          key={index}
                          className="flex items-center gap-3 p-2 rounded hover:bg-purple-100 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedMembersToInvite([
                                  ...selectedMembersToInvite,
                                  {
                                    registrationId: userRegistration.registrationId,
                                    lineUserId: userRegistration.lineUserId,
                                    name: name,
                                    attendeeIndex: index,
                                    companyName: userRegistration.companyName || '',
                                  },
                                ]);
                              } else {
                                setSelectedMembersToInvite(
                                  selectedMembersToInvite.filter(
                                    (m) =>
                                      !(
                                        m.registrationId === userRegistration.registrationId &&
                                        m.attendeeIndex === index
                                      )
                                  )
                                );
                              }
                            }}
                            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                          />
                          <span className="text-sm text-gray-900">{displayMemberName(name, index)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {searchedRegistration && (
                <div className="border border-gray-300 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-900 mb-2">
                    {searchedRegistration.companyName || searchedRegistration.contactName}
                  </p>
                  <div className="space-y-2">
                    {(Array.isArray(searchedRegistration.attendeeNames)
                      ? searchedRegistration.attendeeNames
                      : searchedRegistration.attendeeNames?.split(',') || []
                    ).map((name: string, index: number) => {
                        // Check if this member is already in any table
                        const isInTable = searchedRegistrationTables.some((table) =>
                          table.members.some(
                            (m) =>
                              m.registrationId === searchedRegistration.registrationId &&
                              m.attendeeIndex === index
                          )
                        );
                        return (
                          <label
                            key={index}
                            className={`flex items-center gap-3 p-2 rounded ${
                              isInTable
                                ? 'bg-gray-100 cursor-not-allowed'
                                : 'hover:bg-gray-50 cursor-pointer'
                            }`}
                            title={isInTable ? 'สมาชิกคนนี้อยู่ในกลุ่มโต๊ะอื่นอยู่แล้ว' : ''}
                          >
                            <input
                              type="checkbox"
                              checked={selectedMembersToInvite.some(
                                (m) =>
                                  m.registrationId === searchedRegistration.registrationId &&
                                  m.attendeeIndex === index
                              )}
                              disabled={isInTable}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedMembersToInvite([
                                    ...selectedMembersToInvite,
                                    {
                                      registrationId: searchedRegistration.registrationId,
                                      lineUserId: searchedRegistration.lineUserId,
                                      name: name.trim(),
                                      attendeeIndex: index,
                                      companyName:
                                        searchedRegistration.companyName || '',
                                    },
                                  ]);
                                } else {
                                  setSelectedMembersToInvite(
                                    selectedMembersToInvite.filter(
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
                              className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <span className={`text-sm ${isInTable ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                              {displayMemberName(name.trim(), index)}
                              {isInTable && <span className="ml-2 text-xs">(อยู่ในโต๊ะอื่นแล้ว)</span>}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  setInvitingToTableId(null);
                  setSearchRegistrationId('');
                  setSearchedRegistration(null);
                  setSearchedRegistrationTables([]);
                  setSelectedMembersToInvite([]);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleInviteMembers}
                disabled={inviting || selectedMembersToInvite.length === 0}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
              >
                {inviting ? 'กำลังเชิญ...' : `เชิญ (${selectedMembersToInvite.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {pendingMemberRemoval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">ยืนยันการนำสมาชิกออก</h3>
            <p className="text-gray-700 mb-6">
              คุณแน่ใจหรือไม่ว่าต้องการนำ <strong>{pendingMemberRemoval.name}</strong> ออกจากโต๊ะ?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingMemberRemoval(null)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleRemoveMember}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                นำออก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Table Modal */}
      {showJoinTableModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Join โต๊ะ</h3>
              <button
                onClick={() => {
                  setShowJoinTableModal(false);
                  setJoinSearchRegistrationId('');
                  setJoinSearchedRegistration(null);
                  setJoinSearchedTables([]);
                  setSelectedTableToJoin(null);
                  setSelectedMembersToJoin([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-blue-800">
                💡 <strong>วิธี Join โต๊ะ:</strong> กรอกรหัสลงทะเบียนของเพื่อนที่สร้างโต๊ะแล้ว เลือกโต๊ะที่ต้องการ Join และเลือกสมาชิกในรหัสลงทะเบียนของคุณที่จะนั่งโต๊ะนั้น
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รหัสลงทะเบียนของเพื่อน
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinSearchRegistrationId}
                    onChange={(e) => setJoinSearchRegistrationId(e.target.value.toUpperCase())}
                    placeholder="กรอกรหัสลงทะเบียน (เช่น ABC123)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleJoinSearchRegistration();
                      }
                    }}
                  />
                  <button
                    onClick={handleJoinSearchRegistration}
                    disabled={joinSearchLoading || !joinSearchRegistrationId.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {joinSearchLoading ? 'ค้นหา...' : 'ค้นหา'}
                  </button>
                </div>
              </div>

              {joinSearchedRegistration && (
                <div className="border border-green-300 rounded-lg p-4 bg-green-50">
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    {joinSearchedRegistration.companyName || joinSearchedRegistration.contactName}
                  </p>
                  <p className="text-xs text-gray-600 mb-3">
                    ผู้ติดต่อ: {joinSearchedRegistration.contactName}
                  </p>

                  {joinSearchedTables.length > 0 ? (
                    <>
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        เลือกโต๊ะที่ต้องการ Join:
                      </p>
                      <div className="space-y-2 mb-4">
                        {joinSearchedTables.map((table) => (
                          <label
                            key={table.tableId}
                            className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                              selectedTableToJoin === table.tableId
                                ? 'border-green-600 bg-green-100'
                                : 'border-gray-300 bg-white hover:border-green-400'
                            }`}
                          >
                            <input
                              type="radio"
                              name="joinTable"
                              checked={selectedTableToJoin === table.tableId}
                              onChange={() => setSelectedTableToJoin(table.tableId)}
                              className="mt-1 w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                            />
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900">
                                {table.tableGroupName || `โต๊ะของ ${table.hostCompanyName}`}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                สมาชิก: {table.members.length} คน
                                {event?.partyTableSettings?.defaultSeatsPerTable &&
                                  ` / ${event.partyTableSettings.defaultSeatsPerTable} ที่นั่ง`
                                }
                              </p>
                              {table.assignedTableNumber && (
                                <p className="text-xs text-purple-600 font-medium mt-1">
                                  โต๊ะ #{table.assignedTableNumber}
                                </p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-gray-600 italic">
                      รหัสลงทะเบียนนี้ยังไม่ได้สร้างโต๊ะ
                    </p>
                  )}

                  {selectedTableToJoin && (
                    <div className="border-t border-green-300 pt-4 mt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        เลือกสมาชิกในรหัสลงทะเบียนของคุณที่จะ Join:
                      </p>
                      <div className="border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto bg-white">
                        {attendeeNames.map((name, index) => {
                          const isAlreadyInTable = attendeeIndexesInTables.has(index);
                          return (
                            <label
                              key={index}
                              className={`flex items-center gap-3 p-2 rounded ${
                                isAlreadyInTable
                                  ? 'bg-gray-100 cursor-not-allowed'
                                  : 'hover:bg-gray-50 cursor-pointer'
                              }`}
                              title={isAlreadyInTable ? 'สมาชิกคนนี้อยู่ในกลุ่มโต๊ะอื่นอยู่แล้ว' : ''}
                            >
                              <input
                                type="checkbox"
                                checked={selectedMembersToJoin.includes(index)}
                                disabled={isAlreadyInTable}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedMembersToJoin([...selectedMembersToJoin, index]);
                                  } else {
                                    setSelectedMembersToJoin(
                                      selectedMembersToJoin.filter((i) => i !== index)
                                    );
                                  }
                                }}
                                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                              />
                              <span className={`text-sm ${isAlreadyInTable ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                {displayMemberName(name, index)}
                                {isAlreadyInTable && <span className="ml-2 text-xs">(อยู่ในโต๊ะอื่นแล้ว)</span>}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowJoinTableModal(false);
                  setJoinSearchRegistrationId('');
                  setJoinSearchedRegistration(null);
                  setJoinSearchedTables([]);
                  setSelectedTableToJoin(null);
                  setSelectedMembersToJoin([]);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleJoinTable}
                disabled={
                  joiningTable ||
                  !selectedTableToJoin ||
                  selectedMembersToJoin.length === 0
                }
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
              >
                {joiningTable ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    กำลัง Join...
                  </>
                ) : (
                  'Join โต๊ะ'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
