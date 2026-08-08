// Carpool Management Library Functions
import { adminDb } from './firebase-admin';
import { Carpool, CreateCarpoolData, UpdateCarpoolData, CarpoolMember } from '@/types/carpool';

/**
 * Generate a unique Carpool ID
 */
function generateCarpoolId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `CARPOOL_${timestamp}_${random}`;
}

/**
 * Create a new Carpool
 */
export async function createCarpool(data: CreateCarpoolData): Promise<Carpool> {
  const db = adminDb();
  const carpoolId = generateCarpoolId();
  const now = new Date().toISOString();

  const carpool: Carpool = {
    carpoolId,
    eventId: data.eventId,
    ownerRegistrationId: data.ownerRegistrationId,
    licensePlate: data.licensePlate,
    members: data.members,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await db.collection('carpools').doc(carpoolId).set(carpool);

  // Update carpoolId in eventRegistrations for all members
  await updateMembersCarpoolId(data.members, carpoolId);

  return carpool;
}

/**
 * Get Carpool by ID
 */
export async function getCarpoolById(carpoolId: string): Promise<Carpool | null> {
  const db = adminDb();
  const doc = await db.collection('carpools').doc(carpoolId).get();

  if (!doc.exists) {
    return null;
  }

  return doc.data() as Carpool;
}

/**
 * Get all Carpools for an event
 */
export async function getCarpoolsByEvent(eventId: string): Promise<Carpool[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('carpools')
    .where('eventId', '==', eventId)
    .get();

  // Filter out deleted/cancelled carpools
  return snapshot.docs
    .map(doc => doc.data() as Carpool)
    .filter(cp => cp.status !== 'deleted' && cp.status !== 'cancelled');
}

/**
 * Get Carpools owned by a registration
 */
export async function getCarpoolsByOwner(ownerRegistrationId: string): Promise<Carpool[]> {
  const db = adminDb();
  const snapshot = await db
    .collection('carpools')
    .where('ownerRegistrationId', '==', ownerRegistrationId)
    .get();

  // Filter out deleted/cancelled carpools
  return snapshot.docs
    .map(doc => doc.data() as Carpool)
    .filter(cp => cp.status !== 'deleted' && cp.status !== 'cancelled');
}

/**
 * Update Carpool
 */
export async function updateCarpool(
  carpoolId: string,
  updates: UpdateCarpoolData
): Promise<void> {
  const db = adminDb();
  const updateData: Record<string, any> = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await db.collection('carpools').doc(carpoolId).update(updateData);

  // If members were updated, sync carpoolId in eventRegistrations
  if (updates.members) {
    await updateMembersCarpoolId(updates.members, carpoolId);
  }
}

/**
 * Add members to Carpool
 */
export async function addMembersToCarpool(
  carpoolId: string,
  newMembers: CarpoolMember[]
): Promise<void> {
  const db = adminDb();
  const carpool = await getCarpoolById(carpoolId);

  if (!carpool) {
    throw new Error('Carpool not found');
  }

  // Filter out members that are already in the carpool
  // Use combination of lineUserId + name to identify unique members
  const existingMemberKeys = new Set(
    carpool.members.map(m => `${m.lineUserId}::${m.name}`)
  );
  const membersToAdd = newMembers.filter(
    m => !existingMemberKeys.has(`${m.lineUserId}::${m.name}`)
  );

  if (membersToAdd.length === 0) {
    return; // No new members to add
  }

  const updatedMembers = [...carpool.members, ...membersToAdd];

  await db.collection('carpools').doc(carpoolId).update({
    members: updatedMembers,
    updatedAt: new Date().toISOString(),
  });

  // Update carpoolId in eventRegistrations
  await updateMembersCarpoolId(membersToAdd, carpoolId);
}

/**
 * Remove members from Carpool
 * @param membersToRemove - Array of members to remove (with lineUserId + name)
 */
export async function removeMembersFromCarpool(
  carpoolId: string,
  membersToRemove: Array<{ lineUserId: string; name: string }>
): Promise<void> {
  const db = adminDb();
  const carpool = await getCarpoolById(carpoolId);

  if (!carpool) {
    throw new Error('Carpool not found');
  }

  // Filter members to remove
  // If name is empty string, remove all members with that lineUserId (legacy support)
  // Otherwise, remove only the specific member with lineUserId + name
  const updatedMembers = carpool.members.filter((member) => {
    for (const toRemove of membersToRemove) {
      if (toRemove.name === '') {
        // Legacy: remove all members with this lineUserId
        if (member.lineUserId === toRemove.lineUserId) {
          return false;
        }
      } else {
        // New: remove specific member by lineUserId + name
        if (member.lineUserId === toRemove.lineUserId && member.name === toRemove.name) {
          return false;
        }
      }
    }
    return true;
  });

  await db.collection('carpools').doc(carpoolId).update({
    members: updatedMembers,
    updatedAt: new Date().toISOString(),
  });

  // Clear carpoolId in eventRegistrations ONLY for lineUserIds that have NO remaining members in the carpool
  const uniqueLineUserIds = Array.from(new Set(membersToRemove.map(m => m.lineUserId)));
  const lineUserIdsToRemove = uniqueLineUserIds.filter(lineUserId => {
    // Check if this lineUserId still has any members in the updated carpool
    return !updatedMembers.some(m => m.lineUserId === lineUserId);
  });

  if (lineUserIdsToRemove.length > 0) {
    await clearMembersCarpoolId(lineUserIdsToRemove);
  }
}

/**
 * Soft delete Carpool (mark as deleted)
 */
export async function deleteCarpool(carpoolId: string): Promise<void> {
  const db = adminDb();
  const carpool = await getCarpoolById(carpoolId);

  if (!carpool) {
    throw new Error('Carpool not found');
  }

  // Clear carpoolId in eventRegistrations for all members
  const lineUserIds = carpool.members.map(m => m.lineUserId);
  await clearMembersCarpoolId(lineUserIds);

  // Soft delete: mark as deleted instead of removing document
  await db.collection('carpools').doc(carpoolId).update({
    status: 'deleted',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Hard delete Carpool (permanently remove document)
 */
export async function hardDeleteCarpool(carpoolId: string): Promise<void> {
  const db = adminDb();
  const carpool = await getCarpoolById(carpoolId);

  if (!carpool) {
    throw new Error('Carpool not found');
  }

  // Clear carpoolId in eventRegistrations for all members
  const lineUserIds = carpool.members.map(m => m.lineUserId);
  await clearMembersCarpoolId(lineUserIds);

  // Permanently delete the carpool document
  await db.collection('carpools').doc(carpoolId).delete();
}

/**
 * Assign car number to Carpool
 */
export async function assignCarNumber(
  carpoolId: string,
  carNumber: number
): Promise<void> {
  const db = adminDb();

  await db.collection('carpools').doc(carpoolId).update({
    assignedCarNumber: carNumber,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Unassign car number from Carpool
 */
export async function unassignCarNumber(carpoolId: string): Promise<void> {
  const db = adminDb();

  await db.collection('carpools').doc(carpoolId).update({
    assignedCarNumber: null,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Get Carpool by car number
 */
export async function getCarpoolByCarNumber(
  eventId: string,
  carNumber: number
): Promise<Carpool | null> {
  const db = adminDb();
  const snapshot = await db
    .collection('carpools')
    .where('eventId', '==', eventId)
    .where('assignedCarNumber', '==', carNumber)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as Carpool;
}

/**
 * Helper: Update carpoolId in eventRegistrations for members
 */
async function updateMembersCarpoolId(
  members: CarpoolMember[],
  carpoolId: string
): Promise<void> {
  const db = adminDb();
  const batch = db.batch();

  for (const member of members) {
    const snapshot = await db
      .collection('eventRegistrations')
      .where('registrationId', '==', member.registrationId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      batch.update(docRef, { carpoolId });
    }
  }

  await batch.commit();
}

/**
 * Helper: Clear carpoolId in eventRegistrations for members
 */
async function clearMembersCarpoolId(lineUserIds: string[]): Promise<void> {
  const db = adminDb();
  const batch = db.batch();

  for (const lineUserId of lineUserIds) {
    const snapshot = await db
      .collection('eventRegistrations')
      .where('lineUserId', '==', lineUserId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      batch.update(docRef, { carpoolId: null });
    }
  }

  await batch.commit();
}

/**
 * Get Carpool by owner's registration ID
 */
export async function getCarpoolByRegistrationId(registrationId: string, eventId: string): Promise<Carpool | null> {
  const db = adminDb();

  const snapshot = await db
    .collection('carpools')
    .where('eventId', '==', eventId)
    .where('ownerRegistrationId', '==', registrationId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return {
    carpoolId: doc.id,
    ...doc.data(),
  } as Carpool;
}

/**
 * Get Carpool for a specific member (from registration's carpoolId)
 */
export async function getMemberCarpool(lineUserId: string, eventId: string): Promise<Carpool | null> {
  const db = adminDb();

  // Get registration to find carpoolId
  const regSnapshot = await db
    .collection('eventRegistrations')
    .where('lineUserId', '==', lineUserId)
    .where('eventId', '==', eventId)
    .limit(1)
    .get();

  if (regSnapshot.empty) {
    return null;
  }

  const registration = regSnapshot.docs[0].data();

  if (!registration.carpoolId) {
    return null;
  }

  return await getCarpoolById(registration.carpoolId);
}

/**
 * Get ALL Carpools where a member has any team member participating
 * Returns all carpools where any member with the same lineUserId exists
 */
export async function getAllMemberCarpools(lineUserId: string, eventId: string): Promise<Carpool[]> {
  const db = adminDb();

  // Get all active carpools for this event
  const snapshot = await db
    .collection('carpools')
    .where('eventId', '==', eventId)
    .get();

  // Filter carpools that have members with matching lineUserId
  const carpools = snapshot.docs
    .map(doc => doc.data() as Carpool)
    .filter(cp => {
      // Exclude deleted/cancelled carpools
      if (cp.status === 'deleted' || cp.status === 'cancelled') {
        return false;
      }
      // Check if any member has matching lineUserId
      return cp.members?.some(m => m.lineUserId === lineUserId) || false;
    });

  return carpools;
}
