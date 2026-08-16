// Party Table Management Library Functions
import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  PartyTable,
  CreatePartyTableData,
  CreateReservationTableData,
  UpdatePartyTableData,
  TableMember,
  AddMembersToTableData,
  RemoveMembersFromTableData,
  AssignTableNumberData,
  AssignGroupsToTableNumberData,
  RemoveGroupFromTableNumberData,
  MoveMembersData,
  PartyTableHistory,
  PartyTableAction,
  PartyTableHistoryMetadata,
} from '@/types/partyTable';

/**
 * Generate a unique Party Table ID
 */
function generateTableId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `TABLE_${timestamp}_${random}`;
}

/**
 * Generate a unique History ID
 */
function generateHistoryId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `HISTORY_${timestamp}_${random}`;
}

/**
 * Create a new Party Table
 */
export async function createPartyTable(data: CreatePartyTableData, createdBy: string, createdByName: string, isJoinTable = false): Promise<PartyTable> {
  const db = adminDb();
  const tableId = generateTableId();
  const now = new Date().toISOString();

  // Add joinedAt, joinedBy, joinedByName to initial members
  const membersWithMetadata: TableMember[] = (data.initialMembers || []).map(member => ({
    ...member,
    joinedAt: now,
    joinedBy: createdBy,
    joinedByName: createdByName,
  }));

  // VALIDATION: Check if any member is already in another table (server-side)
  for (const member of membersWithMetadata) {
    const existingTable = await findMemberTable(
      member.registrationId,
      member.attendeeIndex,
      data.eventId
    );

    if (existingTable) {
      throw new Error(
        `สมาชิก "${member.name}" อยู่ในกลุ่มโต๊ะอื่นอยู่แล้ว (${existingTable.tableGroupName || `โต๊ะของ ${existingTable.hostCompanyName}`}). ` +
        'แต่ละคนสามารถอยู่ได้เพียง 1 กลุ่มโต๊ะเท่านั้น'
      );
    }
  }

  // Auto-generate table group name from company name if not provided
  const tableGroupName = data.tableGroupName || `กลุ่มโต๊ะ: ${data.hostCompanyName}`;

  const table: PartyTable = {
    tableId,
    eventId: data.eventId,
    tableGroupName,
    hostRegistrationId: data.hostRegistrationId,
    hostCompanyName: data.hostCompanyName,
    hostContactName: data.hostContactName,
    members: membersWithMetadata,
    isJoinTable, // Set Join Table flag (created from registration codes)
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  await db.collection('partyTables').doc(tableId).set(table);

  // Log history
  await logTableHistory({
    eventId: data.eventId,
    tableId,
    action: 'table_created',
    performedBy: createdBy,
    performedByName: createdByName,
    metadata: {
      memberCount: membersWithMetadata.length,
    },
  });

  return table;
}

/**
 * Create a new Reservation Table (กลุ่มจองโต๊ะ)
 * This creates a table group with only reserved seats, no actual members
 */
export async function createReservationTable(
  data: CreateReservationTableData,
  createdByName: string
): Promise<PartyTable> {
  const db = adminDb();
  const tableId = generateTableId();
  const now = new Date().toISOString();

  // Create a reservation table with no members, only reserved seat count
  const table: PartyTable = {
    tableId,
    eventId: data.eventId,
    tableGroupName: data.tableGroupName,
    // Use a placeholder for host fields since this is admin-created
    hostRegistrationId: 'SYSTEM_RESERVATION',
    hostCompanyName: 'ระบบจองโต๊ะ',
    hostContactName: createdByName,
    members: [], // No actual members, only reserved seats
    isReservation: true, // Mark as reservation group
    reservedSeats: data.reservedSeats,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: data.createdBy,
  };

  await db.collection('partyTables').doc(tableId).set(table);

  // Log history
  await logTableHistory({
    eventId: data.eventId,
    tableId,
    action: 'table_created',
    performedBy: data.createdBy,
    performedByName: createdByName,
    metadata: {
      memberCount: data.reservedSeats, // Use reserved seats as member count
    },
  });

  return table;
}

/**
 * Get Party Table by ID
 */
export async function getPartyTableById(tableId: string): Promise<PartyTable | null> {
  const db = adminDb();
  const doc = await db.collection('partyTables').doc(tableId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as PartyTable;
}

/**
 * Get all Party Tables for an event
 */
export async function getPartyTablesByEvent(eventId: string): Promise<PartyTable[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('partyTables')
    .where('eventId', '==', eventId)
    .get();

  // Filter out deleted tables
  return snapshot.docs
    .map(doc => doc.data() as PartyTable)
    .filter(table => table.status === 'active');
}

/**
 * Get Party Tables hosted by a registration
 */
export async function getPartyTablesByHost(hostRegistrationId: string): Promise<PartyTable[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('partyTables')
    .where('hostRegistrationId', '==', hostRegistrationId)
    .get();

  // Filter out deleted tables
  return snapshot.docs
    .map(doc => doc.data() as PartyTable)
    .filter(table => table.status === 'active');
}

/**
 * Update Party Table
 */
export async function updatePartyTable(
  tableId: string,
  updates: UpdatePartyTableData
): Promise<void> {
  const db = adminDb();
  const updateData: Record<string, any> = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await db.collection('partyTables').doc(tableId).update(updateData);
}

/**
 * Add members to Party Table Group
 *
 * IMPORTANT: Can only add members to UNASSIGNED groups OR Join Tables.
 * Member-created groups that are assigned cannot be modified.
 */
export async function addMembersToTable(
  data: AddMembersToTableData
): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(data.tableId);

  if (!table) {
    throw new Error('Party Table not found');
  }

  // Prevent adding members to assigned member-created groups
  // Allow adding to Join Tables (isJoinTable) even when assigned
  if (table.assignedTableNumber && !table.isJoinTable) {
    throw new Error(
      `Cannot add members directly to a member-created group assigned to table #${table.assignedTableNumber}. ` +
      'To modify this table, either unassign the group first, or create a new group.'
    );
  }

  const now = new Date().toISOString();

  // Add metadata to new members
  const membersToAdd: TableMember[] = data.members.map(member => ({
    ...member,
    joinedAt: now,
    joinedBy: data.addedBy,
    joinedByName: data.addedByName,
  }));

  // Filter out members that are already in the table
  // Use combination of registrationId + attendeeIndex to identify unique members
  const existingMemberKeys = new Set(
    table.members.map(m => `${m.registrationId}::${m.attendeeIndex}`)
  );
  const uniqueMembersToAdd = membersToAdd.filter(
    m => !existingMemberKeys.has(`${m.registrationId}::${m.attendeeIndex}`)
  );

  if (uniqueMembersToAdd.length === 0) {
    return; // No new members to add
  }

  // VALIDATION: Check if any member is already in another table (server-side)
  for (const member of uniqueMembersToAdd) {
    const existingTable = await findMemberTable(
      member.registrationId,
      member.attendeeIndex,
      table.eventId
    );

    if (existingTable && existingTable.tableId !== data.tableId) {
      throw new Error(
        `สมาชิก "${member.name}" อยู่ในกลุ่มโต๊ะอื่นอยู่แล้ว (${existingTable.tableGroupName || `โต๊ะของ ${existingTable.hostCompanyName}`}). ` +
        'แต่ละคนสามารถอยู่ได้เพียง 1 กลุ่มโต๊ะเท่านั้น'
      );
    }
  }

  const updatedMembers = [...table.members, ...uniqueMembersToAdd];

  await db.collection('partyTables').doc(data.tableId).update({
    members: updatedMembers,
    updatedAt: now,
  });

  // Log history for each added member
  for (const member of uniqueMembersToAdd) {
    await logTableHistory({
      eventId: table.eventId,
      tableId: data.tableId,
      action: 'member_added',
      memberId: member.registrationId,
      memberName: member.name,
      performedBy: data.addedBy,
      performedByName: data.addedByName,
    });
  }
}

/**
 * Remove members from Party Table Group
 *
 * IMPORTANT: Can only remove members from UNASSIGNED groups OR Join Tables.
 * Member-created groups that are assigned cannot have individual members removed.
 */
export async function removeMembersFromTable(
  data: RemoveMembersFromTableData
): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(data.tableId);

  if (!table) {
    throw new Error('Party Table not found');
  }

  // Prevent removing members from assigned member-created groups
  // Allow removing from Join Tables (isJoinTable) even when assigned
  if (table.assignedTableNumber && !table.isJoinTable) {
    throw new Error(
      `ไม่สามารถลบสมาชิกออกจากโต๊ะที่ถูกจัดเลขโต๊ะแล้ว (โต๊ะ #${table.assignedTableNumber})\n` +
      'หากต้องการแก้ไข กรุณาติดต่อ Admin เพื่อยกเลิกการจัดเลขโต๊ะก่อน'
    );
  }

  const now = new Date().toISOString();

  // Create a set of member keys to remove
  const memberKeysToRemove = new Set(
    data.memberIds.map(m => `${m.registrationId}::${m.attendeeIndex}`)
  );

  // Filter out members to remove
  const updatedMembers = table.members.filter(
    member => !memberKeysToRemove.has(`${member.registrationId}::${member.attendeeIndex}`)
  );

  // If no members left after removal, mark table as deleted
  if (updatedMembers.length === 0) {
    console.log(`[PartyTable] No members left in ${data.tableId}, marking as deleted`);
    await db.collection('partyTables').doc(data.tableId).update({
      members: updatedMembers,
      status: 'deleted',
      deletedAt: now,
      deletedBy: data.removedBy,
      deletionReason: data.reason || 'No members remaining',
      updatedAt: now,
    });

    // Log table deletion
    await logTableHistory({
      eventId: table.eventId,
      tableId: data.tableId,
      action: 'table_deleted',
      performedBy: data.removedBy,
      performedByName: data.removedByName,
      metadata: {
        reason: 'No members remaining',
      },
    });
  } else {
    await db.collection('partyTables').doc(data.tableId).update({
      members: updatedMembers,
      updatedAt: now,
    });
  }

  // Log history for each removed member
  const removedMembers = table.members.filter(
    member => memberKeysToRemove.has(`${member.registrationId}::${member.attendeeIndex}`)
  );

  for (const member of removedMembers) {
    await logTableHistory({
      eventId: table.eventId,
      tableId: data.tableId,
      action: 'member_removed',
      memberId: member.registrationId,
      memberName: member.name,
      performedBy: data.removedBy,
      performedByName: data.removedByName,
      metadata: {
        reason: data.reason,
      },
    });
  }
}

/**
 * Soft delete Party Table (mark as deleted)
 */
export async function deletePartyTable(
  tableId: string,
  deletedBy: string,
  deletedByName: string,
  reason?: string
): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(tableId);

  if (!table) {
    throw new Error('Party Table not found');
  }

  const now = new Date().toISOString();

  // Soft delete: mark as deleted instead of removing document
  await db.collection('partyTables').doc(tableId).update({
    status: 'deleted',
    deletedAt: now,
    deletedBy,
    deletionReason: reason,
    updatedAt: now,
  });

  // Log history
  await logTableHistory({
    eventId: table.eventId,
    tableId,
    action: 'table_deleted',
    performedBy: deletedBy,
    performedByName: deletedByName,
    metadata: {
      reason,
      memberCount: table.members.length,
    },
  });
}

/**
 * Hard delete Party Table (permanently remove document)
 */
export async function hardDeletePartyTable(tableId: string): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(tableId);

  if (!table) {
    throw new Error('Party Table not found');
  }

  // Permanently delete the table document
  await db.collection('partyTables').doc(tableId).delete();

  // Note: History is preserved even after hard delete
}

/**
 * Assign table number to a Party Table Group
 *
 * IMPORTANT: This function assigns a table number to a SINGLE group.
 * The group keeps its members, and assignedTableNumber is set.
 * For assigning MULTIPLE groups to one table number, use assignGroupsToTableNumber instead.
 *
 * BUSINESS RULE: Only 1 Join Table per table number.
 * If assigning a Join Table to a table number that already has a Join Table,
 * the new Join Table's members will be merged into the existing one, and the new one will be deleted.
 */
export async function assignTableNumber(data: AssignTableNumberData): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(data.tableId);

  if (!table) {
    throw new Error('Party Table not found');
  }

  // Check if this is a group (has members) or already assigned
  if (table.assignedTableNumber) {
    throw new Error('This table group is already assigned to a table number');
  }

  const oldTableNumber = table.assignedTableNumber;

  console.log('[assignTableNumber] Assigning table number to group:', {
    tableId: data.tableId,
    tableNumber: data.tableNumber,
    groupName: table.tableGroupName,
    memberCount: table.members.length,
    isJoinTable: table.isJoinTable,
  });

  // BUSINESS RULE: Check if this is a Join Table being assigned to a table that already has a Join Table
  if (table.isJoinTable) {
    const existingJoinTable = await findJoinTableAtTableNumber(table.eventId, data.tableNumber);

    if (existingJoinTable) {
      console.log('[assignTableNumber] Found existing Join Table at this table number, merging...');

      // Merge this Join Table into the existing one, then delete this one
      await mergeJoinTables(
        data.tableId,  // source (this table being assigned)
        existingJoinTable.tableId,  // destination (existing Join Table)
        data.assignedBy,
        data.assignedByName
      );

      console.log('[assignTableNumber] Join Tables merged successfully');
      return; // Exit early - table was merged and deleted
    }
  }

  // Normal assignment (no merge needed)
  await db.collection('partyTables').doc(data.tableId).update({
    assignedTableNumber: data.tableNumber,
    updatedAt: new Date().toISOString(),
  });

  console.log('[assignTableNumber] Table number assigned successfully');

  // Log history
  try {
    await logTableHistory({
      eventId: table.eventId,
      tableId: data.tableId,
      action: 'number_assigned',
      performedBy: data.assignedBy,
      performedByName: data.assignedByName,
      metadata: {
        oldTableNumber,
        newTableNumber: data.tableNumber,
        memberCount: table.members.length,
      },
    });
  } catch (historyError) {
    console.error('[assignTableNumber] Error logging history:', historyError);
  }
}

/**
 * Unassign table number from Party Table
 */
export async function unassignTableNumber(
  tableId: string,
  performedBy: string,
  performedByName: string
): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(tableId);

  if (!table) {
    throw new Error('Party Table not found');
  }

  const oldTableNumber = table.assignedTableNumber;

  await db.collection('partyTables').doc(tableId).update({
    assignedTableNumber: FieldValue.delete(),
    updatedAt: new Date().toISOString(),
  });

  // Log history
  await logTableHistory({
    eventId: table.eventId,
    tableId,
    action: 'number_unassigned',
    performedBy,
    performedByName,
    metadata: {
      oldTableNumber,
    },
  });
}

/**
 * Get Party Table by table number
 */
export async function getPartyTableByNumber(
  eventId: string,
  tableNumber: number
): Promise<PartyTable | null> {
  const db = adminDb();
  const snapshot = await db
    .collection('partyTables')
    .where('eventId', '==', eventId)
    .where('assignedTableNumber', '==', tableNumber)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as PartyTable;
}

/**
 * Move members between tables
 */
export async function moveMembersBetweenTables(data: MoveMembersData): Promise<void> {
  const db = adminDb();

  const sourceTable = await getPartyTableById(data.sourceTableId);
  const destTable = await getPartyTableById(data.destinationTableId);

  if (!sourceTable) {
    throw new Error('Source table not found');
  }
  if (!destTable) {
    throw new Error('Destination table not found');
  }

  const now = new Date().toISOString();

  // Create a set of member keys to move
  const memberKeysToMove = new Set(
    data.memberIds.map(m => `${m.registrationId}::${m.attendeeIndex}`)
  );

  // Find members to move
  const membersToMove = sourceTable.members.filter(
    member => memberKeysToMove.has(`${member.registrationId}::${member.attendeeIndex}`)
  );

  if (membersToMove.length === 0) {
    throw new Error('No members found to move');
  }

  // Update moved members with new metadata
  const updatedMembersToMove: TableMember[] = membersToMove.map(member => ({
    ...member,
    joinedAt: now,
    joinedBy: data.movedBy,
    joinedByName: data.movedByName,
  }));

  // Remove from source table
  const updatedSourceMembers = sourceTable.members.filter(
    member => !memberKeysToMove.has(`${member.registrationId}::${member.attendeeIndex}`)
  );

  // Add to destination table
  const updatedDestMembers = [...destTable.members, ...updatedMembersToMove];

  // Update both tables
  const batch = db.batch();

  // Update source table
  if (updatedSourceMembers.length === 0) {
    // If source table is empty, mark as deleted
    batch.update(db.collection('partyTables').doc(data.sourceTableId), {
      members: updatedSourceMembers,
      status: 'deleted',
      deletedAt: now,
      deletedBy: data.movedBy,
      deletionReason: 'All members moved to another table',
      updatedAt: now,
    });
  } else {
    batch.update(db.collection('partyTables').doc(data.sourceTableId), {
      members: updatedSourceMembers,
      updatedAt: now,
    });
  }

  // Update destination table
  batch.update(db.collection('partyTables').doc(data.destinationTableId), {
    members: updatedDestMembers,
    updatedAt: now,
  });

  await batch.commit();

  // Log history for moved members
  for (const member of membersToMove) {
    await logTableHistory({
      eventId: sourceTable.eventId,
      tableId: data.sourceTableId,
      action: 'table_moved',
      memberId: member.registrationId,
      memberName: member.name,
      performedBy: data.movedBy,
      performedByName: data.movedByName,
      metadata: {
        sourceTableId: data.sourceTableId,
        destinationTableId: data.destinationTableId,
        oldTableNumber: sourceTable.assignedTableNumber,
        newTableNumber: destTable.assignedTableNumber,
      },
    });
  }
}

/**
 * Get ALL Party Tables where a member has any team member participating
 * Returns all tables where any member with the same registrationId exists
 */
export async function getAllMemberTables(
  registrationId: string,
  eventId: string
): Promise<PartyTable[]> {
  const db = adminDb();

  // Get all active tables for this event
  const snapshot = await db
    .collection('partyTables')
    .where('eventId', '==', eventId)
    .where('status', '==', 'active')
    .get();

  // Filter tables that have members from this registration
  const tables = snapshot.docs
    .map(doc => doc.data() as PartyTable)
    .filter(table => {
      // Check if any member has matching registrationId
      return table.members?.some(m => m.registrationId === registrationId) || false;
    });

  return tables;
}

/**
 * Find which table a specific member is in
 */
export async function findMemberTable(
  registrationId: string,
  attendeeIndex: number,
  eventId: string
): Promise<PartyTable | null> {
  const db = adminDb();

  // Get all active tables for this event
  const snapshot = await db
    .collection('partyTables')
    .where('eventId', '==', eventId)
    .where('status', '==', 'active')
    .get();

  // Find table containing this specific member
  for (const doc of snapshot.docs) {
    const table = doc.data() as PartyTable;
    const member = table.members?.find(
      m => m.registrationId === registrationId && m.attendeeIndex === attendeeIndex
    );
    if (member) {
      return table;
    }
  }

  return null;
}

/**
 * Log Party Table History
 */
export async function logTableHistory(params: {
  eventId: string;
  tableId: string;
  action: PartyTableAction;
  memberId?: string;
  memberName?: string;
  performedBy: string;
  performedByName: string;
  metadata?: PartyTableHistoryMetadata;
}): Promise<void> {
  const db = adminDb();
  const historyId = generateHistoryId();

  const history: PartyTableHistory = {
    historyId,
    eventId: params.eventId,
    tableId: params.tableId,
    action: params.action,
    ...(params.memberId && { memberId: params.memberId }),
    ...(params.memberName && { memberName: params.memberName }),
    performedBy: params.performedBy,
    performedByName: params.performedByName,
    performedAt: new Date().toISOString(),
    ...(params.metadata && { metadata: params.metadata }),
  };

  await db.collection('partyTableHistory').doc(historyId).set(history);
}

/**
 * Get Party Table History for a table
 */
export async function getTableHistory(tableId: string): Promise<PartyTableHistory[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('partyTableHistory')
    .where('tableId', '==', tableId)
    .orderBy('performedAt', 'desc')
    .get();

  return snapshot.docs.map(doc => doc.data() as PartyTableHistory);
}

/**
 * Get Party Table History for an event
 */
export async function getEventTableHistory(eventId: string): Promise<PartyTableHistory[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('partyTableHistory')
    .where('eventId', '==', eventId)
    .orderBy('performedAt', 'desc')
    .get();

  return snapshot.docs.map(doc => doc.data() as PartyTableHistory);
}

/**
 * Add a group to an existing table number assignment
 *
 * This allows multiple groups to be assigned to the same table number.
 * Each group maintains its own identity and members.
 */
export async function addGroupToTableNumber(
  tableNumber: number,
  groupId: string,
  eventId: string,
  assignedBy: string,
  assignedByName: string
): Promise<void> {
  const db = adminDb();

  // Validate that the group exists and is not already assigned
  const group = await getPartyTableById(groupId);
  if (!group) {
    throw new Error('Group not found');
  }

  if (group.assignedTableNumber && group.assignedTableNumber !== tableNumber) {
    throw new Error(`This group is already assigned to table #${group.assignedTableNumber}`);
  }

  // Assign the group to this table number
  await db.collection('partyTables').doc(groupId).update({
    assignedTableNumber: tableNumber,
    updatedAt: new Date().toISOString(),
  });

  console.log('[addGroupToTableNumber] Group added to table number:', {
    groupId,
    tableNumber,
    groupName: group.tableGroupName,
  });

  // Log history
  await logTableHistory({
    eventId,
    tableId: groupId,
    action: 'number_assigned',
    performedBy: assignedBy,
    performedByName: assignedByName,
    metadata: {
      newTableNumber: tableNumber,
      memberCount: group.members.length,
    },
  });
}

/**
 * Remove a group from a table number assignment
 *
 * This unassigns the group from the table number, making it a standalone group again.
 */
export async function removeGroupFromTableNumber(
  groupId: string,
  removedBy: string,
  removedByName: string
): Promise<void> {
  const db = adminDb();

  const group = await getPartyTableById(groupId);
  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.assignedTableNumber) {
    throw new Error('This group is not assigned to any table number');
  }

  const oldTableNumber = group.assignedTableNumber;

  await db.collection('partyTables').doc(groupId).update({
    assignedTableNumber: FieldValue.delete(),
    updatedAt: new Date().toISOString(),
  });

  console.log('[removeGroupFromTableNumber] Group removed from table number:', {
    groupId,
    oldTableNumber,
  });

  // Log history
  await logTableHistory({
    eventId: group.eventId,
    tableId: groupId,
    action: 'number_unassigned',
    performedBy: removedBy,
    performedByName: removedByName,
    metadata: {
      oldTableNumber,
    },
  });
}

/**
 * Get all groups assigned to a specific table number
 */
export async function getGroupsByTableNumber(
  eventId: string,
  tableNumber: number
): Promise<PartyTable[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('partyTables')
    .where('eventId', '==', eventId)
    .where('assignedTableNumber', '==', tableNumber)
    .where('status', '==', 'active')
    .get();

  return snapshot.docs.map(doc => doc.data() as PartyTable);
}

/**
 * Get total member count for a table number (from all assigned groups)
 */
export async function getTableNumberMemberCount(
  eventId: string,
  tableNumber: number
): Promise<number> {
  const groups = await getGroupsByTableNumber(eventId, tableNumber);
  return groups.reduce((total, group) => total + group.members.length, 0);
}

/**
 * Find existing Join Table group at a specific table number
 * Returns null if no Join Table exists at this table number
 */
export async function findJoinTableAtTableNumber(
  eventId: string,
  tableNumber: number
): Promise<PartyTable | null> {
  const groups = await getGroupsByTableNumber(eventId, tableNumber);
  const joinTable = groups.find((g) => g.isJoinTable === true);
  return joinTable || null;
}

/**
 * Merge members from source Join Table into destination Join Table, then delete source
 * Used when assigning/moving a Join Table to a table number that already has a Join Table
 */
export async function mergeJoinTables(
  sourceTableId: string,
  destinationTableId: string,
  mergedBy: string,
  mergedByName: string
): Promise<void> {
  const db = adminDb();

  const sourceTable = await getPartyTableById(sourceTableId);
  const destTable = await getPartyTableById(destinationTableId);

  if (!sourceTable) {
    throw new Error('Source Join Table not found');
  }

  if (!destTable) {
    throw new Error('Destination Join Table not found');
  }

  if (!sourceTable.isJoinTable || !destTable.isJoinTable) {
    throw new Error('Both tables must be Join Tables for merging');
  }

  console.log('[mergeJoinTables] Merging Join Tables:', {
    sourceTableId,
    destinationTableId,
    sourceMemberCount: sourceTable.members.length,
    destMemberCount: destTable.members.length,
  });

  // Add source members to destination (avoiding duplicates)
  const destMemberKeys = new Set(
    destTable.members.map((m) => `${m.registrationId}::${m.attendeeIndex}`)
  );

  const membersToAdd = sourceTable.members.filter(
    (m) => !destMemberKeys.has(`${m.registrationId}::${m.attendeeIndex}`)
  );

  if (membersToAdd.length > 0) {
    const now = new Date().toISOString();
    const updatedMembers = [
      ...destTable.members,
      ...membersToAdd.map((m) => ({
        ...m,
        joinedAt: now,
        joinedBy: mergedBy,
        joinedByName: mergedByName,
      })),
    ];

    await db.collection('partyTables').doc(destinationTableId).update({
      members: updatedMembers,
      updatedAt: now,
    });

    console.log('[mergeJoinTables] Added members to destination:', membersToAdd.length);
  }

  // Delete source table
  await deletePartyTable(sourceTableId, mergedBy, mergedByName, 'Merged into another Join Table');

  console.log('[mergeJoinTables] Source table deleted');

  // Log history for destination table
  await logTableHistory({
    eventId: destTable.eventId,
    tableId: destinationTableId,
    action: 'member_added',
    performedBy: mergedBy,
    performedByName: mergedByName,
    metadata: {
      reason: `Merged ${membersToAdd.length} members from another Join Table`,
      sourceTableId,
      memberCount: membersToAdd.length,
    },
  });
}
