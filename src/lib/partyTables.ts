// Party Table Management Library Functions
import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  PartyTable,
  CreatePartyTableData,
  UpdatePartyTableData,
  TableMember,
  AddMembersToTableData,
  RemoveMembersFromTableData,
  AssignTableNumberData,
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
export async function createPartyTable(data: CreatePartyTableData, createdBy: string, createdByName: string): Promise<PartyTable> {
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
 * Add members to Party Table
 */
export async function addMembersToTable(
  data: AddMembersToTableData
): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(data.tableId);

  if (!table) {
    throw new Error('Party Table not found');
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
 * Remove members from Party Table
 */
export async function removeMembersFromTable(
  data: RemoveMembersFromTableData
): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(data.tableId);

  if (!table) {
    throw new Error('Party Table not found');
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
 * Assign table number to Party Table
 */
export async function assignTableNumber(data: AssignTableNumberData): Promise<void> {
  const db = adminDb();
  const table = await getPartyTableById(data.tableId);

  if (!table) {
    throw new Error('Party Table not found');
  }

  const oldTableNumber = table.assignedTableNumber;

  await db.collection('partyTables').doc(data.tableId).update({
    assignedTableNumber: data.tableNumber,
    updatedAt: new Date().toISOString(),
  });

  // Log history
  await logTableHistory({
    eventId: table.eventId,
    tableId: data.tableId,
    action: 'number_assigned',
    performedBy: data.assignedBy,
    performedByName: data.assignedByName,
    metadata: {
      oldTableNumber,
      newTableNumber: data.tableNumber,
    },
  });
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
