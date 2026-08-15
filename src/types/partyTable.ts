// Party Table Type Definitions
// For event seating arrangements and table group management

/**
 * Table Member - Individual attendee in a party table
 * Similar to CarpoolMember but for table seating
 */
export interface TableMember {
  registrationId: string;    // Foreign key to eventRegistrations
  lineUserId: string;         // LINE user ID
  name: string;               // Attendee name
  attendeeIndex: number;      // Stable identifier (index in attendeeNames array)
  companyName: string;        // Company/agency name
  joinedAt: string;           // ISO timestamp
  joinedBy: string;           // userId who added this member
  joinedByName?: string;      // Display name of user who added
}

/**
 * Party Table - Represents a table group for event seating
 *
 * IMPORTANT: This serves TWO purposes:
 * 1. Party Table Group (กลุ่มโต๊ะ) - When assignedTableNumber is NOT set
 *    - members[] contains the group's members
 *    - Can be managed (add/remove members)
 *
 * 2. Table Number Assignment (เลขโต๊ะ) - When assignedTableNumber IS set
 *    - assignedGroupIds[] references other Party Table Groups
 *    - individualMembers[] contains individual attendees added directly
 *    - members[] is IGNORED for display (kept for backward compatibility)
 */
export interface PartyTable {
  tableId: string;                    // Auto-generated unique ID
  eventId: string;                    // Foreign key to events
  tableGroupName?: string;            // Optional group name (e.g., "Agent Friends")
  hostRegistrationId: string;         // Table host (creator)
  hostCompanyName: string;            // Host's company
  hostContactName: string;            // Host's contact name

  // For Party Table Groups (when NOT assigned to table number)
  members: TableMember[];             // Array of table members
  isAdminCreated?: boolean;           // True if admin created this group (not member-initiated)

  // For Table Number Assignments (when assigned to table number)
  assignedTableNumber?: number;       // Admin-assigned table number (1 to N)
  assignedGroupIds?: string[];        // tableIds of groups assigned to this table number
  individualMembers?: TableMember[];  // Individual members added directly (not from groups)

  status: 'active' | 'deleted';       // Table status
  createdAt: string;                  // ISO timestamp
  updatedAt: string;                  // ISO timestamp
  createdBy: string;                  // userId who created
  deletedAt?: string;                 // ISO timestamp (soft delete)
  deletedBy?: string;                 // userId who deleted
  deletionReason?: string;            // Reason for deletion
}

/**
 * Party Table Settings - Event-level configuration
 * Stored in Event document as nested object
 */
export interface PartyTableSettings {
  totalTables: number;                // Total number of tables available
  defaultSeatsPerTable: number;       // Default capacity per table
  maxSeatsPerTable?: number;          // Hard limit (optional, can exceed with warning)
  showTableNumbersToMembers: boolean; // Whether members can see assigned table numbers
  tableActive: boolean;               // Feature visibility toggle for members
}

/**
 * Party Table History - Audit log for table changes
 */
export interface PartyTableHistory {
  historyId: string;                  // Auto-generated
  eventId: string;                    // Foreign key to events
  tableId: string;                    // Foreign key to partyTables
  action: PartyTableAction;           // Type of action performed
  memberId?: string;                  // For member-specific actions (registrationId)
  memberName?: string;                // Display name
  performedBy: string;                // userId who performed action
  performedByName: string;            // Display name
  performedAt: string;                // ISO timestamp
  metadata?: PartyTableHistoryMetadata; // Additional context
}

/**
 * Party Table Action Types
 */
export type PartyTableAction =
  | 'table_created'
  | 'table_deleted'
  | 'member_added'
  | 'member_removed'
  | 'number_assigned'
  | 'number_unassigned'
  | 'table_moved';

/**
 * Party Table History Metadata
 */
export interface PartyTableHistoryMetadata {
  oldTableNumber?: number;
  newTableNumber?: number;
  reason?: string;
  memberCount?: number;
  sourceTableId?: string;
  destinationTableId?: string;
}

/**
 * Create Party Table Data - Input for creating new table
 */
export interface CreatePartyTableData {
  eventId: string;
  tableGroupName?: string;
  hostRegistrationId: string;
  hostCompanyName: string;
  hostContactName: string;
  initialMembers?: Omit<TableMember, 'joinedAt' | 'joinedBy' | 'joinedByName'>[];
  createdBy: string;
  isAdminCreated?: boolean;  // NEW: True if admin creates from registration codes
}

/**
 * Update Party Table Data - Input for updating table
 */
export interface UpdatePartyTableData {
  tableGroupName?: string;
  assignedTableNumber?: number;
  status?: 'active' | 'deleted';
  deletionReason?: string;
}

/**
 * Add Members to Table Data - Input for adding members
 */
export interface AddMembersToTableData {
  tableId: string;
  members: Omit<TableMember, 'joinedAt' | 'joinedBy' | 'joinedByName'>[];
  addedBy: string;
  addedByName: string;
}

/**
 * Remove Members from Table Data - Input for removing members
 */
export interface RemoveMembersFromTableData {
  tableId: string;
  memberIds: { registrationId: string; attendeeIndex: number }[]; // Unique identifier
  removedBy: string;
  removedByName: string;
  reason?: string;
}

/**
 * Assign Table Number Data - Input for assigning table number to a group
 */
export interface AssignTableNumberData {
  tableId: string;  // The group table ID to assign
  tableNumber: number;
  assignedBy: string;
  assignedByName: string;
}

/**
 * Assign Groups To Table Number - Input for assigning multiple groups + individuals to a table number
 */
export interface AssignGroupsToTableNumberData {
  tableNumber: number;
  groupIds: string[];  // tableIds of groups to assign
  individualMembers?: Omit<TableMember, 'joinedAt' | 'joinedBy' | 'joinedByName'>[];
  assignedBy: string;
  assignedByName: string;
}

/**
 * Remove Group From Table Number - Input for removing a group from table number
 */
export interface RemoveGroupFromTableNumberData {
  tableNumber: number;
  groupId: string;  // tableId of group to remove
  removedBy: string;
  removedByName: string;
}

/**
 * Move Members Between Tables Data
 */
export interface MoveMembersData {
  sourceTableId: string;
  destinationTableId: string;
  memberIds: { registrationId: string; attendeeIndex: number }[];
  movedBy: string;
  movedByName: string;
}

/**
 * Table Capacity Status - For UI indicators
 */
export type TableCapacityStatus = 'available' | 'comfortable' | 'full' | 'overbooked';

/**
 * Party Table with Enriched Data - For display purposes
 */
export interface PartyTableWithDetails extends PartyTable {
  currentMemberCount: number;
  capacityStatus: TableCapacityStatus;
  capacityPercentage: number;
  isHost: boolean;              // True if current user is host
  hasCurrentUserMembers: boolean; // True if current user has members in table
}

/**
 * Helper: Get capacity status based on member count and max seats
 */
export function getTableCapacityStatus(
  memberCount: number,
  maxSeats: number
): TableCapacityStatus {
  const percentage = (memberCount / maxSeats) * 100;

  if (percentage >= 100) {
    return memberCount > maxSeats ? 'overbooked' : 'full';
  } else if (percentage >= 80) {
    return 'comfortable';
  } else {
    return 'available';
  }
}

/**
 * Helper: Get capacity color for UI
 */
export function getTableCapacityColor(status: TableCapacityStatus): string {
  switch (status) {
    case 'available':
      return 'green'; // <80%
    case 'comfortable':
      return 'yellow'; // 80-99%
    case 'full':
      return 'orange'; // 100%
    case 'overbooked':
      return 'red'; // >100%
  }
}

/**
 * Helper: Check if member already exists in table
 */
export function isMemberInTable(
  table: PartyTable,
  registrationId: string,
  attendeeIndex: number
): boolean {
  return table.members.some(
    (m) => m.registrationId === registrationId && m.attendeeIndex === attendeeIndex
  );
}

/**
 * Helper: Find table by member
 */
export function findTableByMember(
  tables: PartyTable[],
  registrationId: string,
  attendeeIndex: number
): PartyTable | undefined {
  return tables.find((table) =>
    table.status === 'active' &&
    isMemberInTable(table, registrationId, attendeeIndex)
  );
}

/**
 * Helper: Get members not in any table
 */
export function getMembersNotInTables(
  attendeeNames: string[],
  registrationId: string,
  allTables: PartyTable[]
): { name: string; originalIndex: number }[] {
  return attendeeNames
    .map((name, index) => ({ name, originalIndex: index }))
    .filter(({ originalIndex }) => {
      return !findTableByMember(allTables, registrationId, originalIndex);
    });
}

/**
 * Helper: Validate table capacity
 */
export function validateTableCapacity(
  currentMemberCount: number,
  newMembersCount: number,
  maxSeats: number
): { isValid: boolean; warning?: string } {
  const totalMembers = currentMemberCount + newMembersCount;

  if (totalMembers > maxSeats) {
    return {
      isValid: false,
      warning: `จำนวนสมาชิก (${totalMembers}) เกินจำนวนที่นั่งสูงสุด (${maxSeats})`,
    };
  }

  if (totalMembers === maxSeats) {
    return {
      isValid: true,
      warning: `โต๊ะจะเต็ม (${totalMembers}/${maxSeats} ที่นั่ง)`,
    };
  }

  return { isValid: true };
}

/**
 * Helper: Format table display name
 */
export function formatTableDisplayName(table: PartyTable): string {
  if (table.tableGroupName) {
    return table.tableGroupName;
  }
  return `โต๊ะของ ${table.hostCompanyName || table.hostContactName}`;
}

/**
 * Helper: Format table number display
 */
export function formatTableNumber(tableNumber: number | undefined): string {
  if (!tableNumber) return 'ยังไม่ได้จัดโต๊ะ';
  return `โต๊ะ #${tableNumber}`;
}
