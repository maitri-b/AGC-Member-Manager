// Firestore Members Query Service
// Fast queries for members collection (Phase 1 Migration)
import { adminDb } from '@/lib/firebase-admin';
import { Member, MemberStatus } from '@/types/member';

/**
 * Convert Firestore document to Member object
 */
function firestoreDocToMember(doc: FirebaseFirestore.DocumentSnapshot): Member {
  const data = doc.data();
  if (!data) {
    throw new Error('Document has no data');
  }

  // Convert Firestore Timestamp to Date string if needed
  const syncedAt = data.syncedAt?.toDate?.() || null;

  return {
    memberId: data.memberId || doc.id,
    companyNameEN: data.companyNameEN || '',
    companyNameTH: data.companyNameTH || '',
    fullNameTH: data.fullNameTH || '',
    nickname: data.nickname || '',
    lineId: data.lineId || '',
    lineName: data.lineName || '',
    phone: data.phone || '',
    mobile: data.mobile || '',
    email: data.email || '',
    website: data.website || '',
    licenseNumber: data.licenseNumber || '',
    licenseExpiry: data.licenseExpiry || '',
    licenseDocumentUrl: data.licenseDocumentUrl || '',
    positionCompany: data.positionCompany || '',
    positionClub: data.positionClub || '',
    status: data.status || '',
    sponsor1: data.sponsor1 || '',
    sponsor2: data.sponsor2 || '',
    lineGroupStatus: data.lineGroupStatus || '',
    lineGroupJoinDate: data.lineGroupJoinDate || '',
    lineGroupJoinBy: data.lineGroupJoinBy || '',
    lineGroupLeaveDate: data.lineGroupLeaveDate || '',
    lineGroupLeaveBy: data.lineGroupLeaveBy || '',
    lineUserId: data.lineUserId || '',
    lastUpdated: data.lastUpdated || '',
    updatedBy: data.updatedBy || '',
    lineDisplayName: data.lineDisplayName || '',
  } as Member;
}

/**
 * Get all members from Firestore members collection
 * @returns Array of Member objects
 */
export async function getAllMembersFromFirestore(): Promise<Member[]> {
  try {
    const db = adminDb();
    const snapshot = await db.collection('members').get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(firestoreDocToMember);
  } catch (error) {
    console.error('Error fetching all members from Firestore:', error);
    throw error;
  }
}

/**
 * Get a single member by ID from Firestore
 * @param memberId - The member ID
 * @returns Member object or null if not found
 */
export async function getMemberByIdFromFirestore(memberId: string): Promise<Member | null> {
  try {
    const db = adminDb();
    const doc = await db.collection('members').doc(memberId).get();

    if (!doc.exists) {
      return null;
    }

    return firestoreDocToMember(doc);
  } catch (error) {
    console.error(`Error fetching member ${memberId} from Firestore:`, error);
    throw error;
  }
}

/**
 * Get members by status from Firestore
 * @param status - The status to filter by (e.g., 'ปกติ', 'Active')
 * @returns Array of Member objects
 */
export async function getMembersByStatusFromFirestore(status: MemberStatus): Promise<Member[]> {
  try {
    const db = adminDb();

    // Fetch all members and filter in JavaScript to avoid composite index requirement
    const snapshot = await db.collection('members').get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs
      .map(firestoreDocToMember)
      .filter((member) => member.status === status);
  } catch (error) {
    console.error(`Error fetching members with status ${status} from Firestore:`, error);
    throw error;
  }
}

/**
 * Get active members from Firestore
 * Active means status is 'ปกติ' or 'Active'
 * @returns Array of Member objects
 */
export async function getActiveMembersFromFirestore(): Promise<Member[]> {
  try {
    const db = adminDb();

    // Fetch all members and filter in JavaScript
    const snapshot = await db.collection('members').get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs
      .map(firestoreDocToMember)
      .filter((member) => member.status === 'ปกติ' || member.status?.toLowerCase() === 'active');
  } catch (error) {
    console.error('Error fetching active members from Firestore:', error);
    throw error;
  }
}

/**
 * Get member by LINE User ID from Firestore
 * @param lineUserId - The LINE User ID
 * @returns Member object or null if not found
 */
export async function getMemberByLineUserIdFromFirestore(lineUserId: string): Promise<Member | null> {
  try {
    const db = adminDb();

    // Fetch all members and find by lineUserId to avoid composite index
    const snapshot = await db.collection('members').get();

    if (snapshot.empty) {
      return null;
    }

    const member = snapshot.docs
      .map(firestoreDocToMember)
      .find((m) => m.lineUserId === lineUserId);

    return member || null;
  } catch (error) {
    console.error(`Error fetching member by LINE User ID ${lineUserId} from Firestore:`, error);
    throw error;
  }
}

/**
 * Get members with LINE User ID (linked to LINE)
 * @returns Array of Member objects
 */
export async function getMembersLinkedToLine(): Promise<Member[]> {
  try {
    const db = adminDb();

    // Fetch all members and filter in JavaScript
    const snapshot = await db.collection('members').get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs
      .map(firestoreDocToMember)
      .filter((member) => !!member.lineUserId);
  } catch (error) {
    console.error('Error fetching members linked to LINE from Firestore:', error);
    throw error;
  }
}

/**
 * Get members by LINE Group Status from Firestore
 * @param status - The LINE Group Status to filter by
 * @returns Array of Member objects
 */
export async function getMembersByLineGroupStatusFromFirestore(status: string): Promise<Member[]> {
  try {
    const db = adminDb();

    // Fetch all members and filter in JavaScript
    const snapshot = await db.collection('members').get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs
      .map(firestoreDocToMember)
      .filter((member) => member.lineGroupStatus === status);
  } catch (error) {
    console.error(`Error fetching members by LINE Group Status ${status} from Firestore:`, error);
    throw error;
  }
}

/**
 * Search members in Firestore
 * Note: This performs client-side filtering. For large datasets, consider implementing
 * Algolia or Typesense for full-text search.
 * @param query - Search query string
 * @returns Array of matching Member objects
 */
export async function searchMembersInFirestore(query: string): Promise<Member[]> {
  try {
    const db = adminDb();
    const snapshot = await db.collection('members').get();

    if (snapshot.empty) {
      return [];
    }

    const lowerQuery = query.toLowerCase();

    return snapshot.docs
      .map(firestoreDocToMember)
      .filter((member) => {
        return (
          member.fullNameTH?.toLowerCase().includes(lowerQuery) ||
          member.nickname?.toLowerCase().includes(lowerQuery) ||
          member.companyNameEN?.toLowerCase().includes(lowerQuery) ||
          member.companyNameTH?.toLowerCase().includes(lowerQuery) ||
          member.memberId?.includes(query) ||
          member.lineId?.toLowerCase().includes(lowerQuery) ||
          member.lineName?.toLowerCase().includes(lowerQuery) ||
          member.email?.toLowerCase().includes(lowerQuery) ||
          member.mobile?.includes(query) ||
          member.phone?.includes(query) ||
          member.licenseNumber?.toLowerCase().includes(lowerQuery)
        );
      });
  } catch (error) {
    console.error('Error searching members in Firestore:', error);
    throw error;
  }
}

/**
 * Get member statistics from Firestore
 * @returns Object with member counts
 */
export async function getMemberStatsFromFirestore(): Promise<{
  total: number;
  active: number;
  inactive: number;
  linkedToLine: number;
  expiringLicenses: number;
}> {
  try {
    const db = adminDb();
    const snapshot = await db.collection('members').get();

    if (snapshot.empty) {
      return {
        total: 0,
        active: 0,
        inactive: 0,
        linkedToLine: 0,
        expiringLicenses: 0,
      };
    }

    const members = snapshot.docs.map(firestoreDocToMember);
    const today = new Date();

    const active = members.filter(
      (m) => m.status === 'ปกติ' || m.status?.toLowerCase() === 'active'
    ).length;

    const inactive = members.filter(
      (m) => m.status === 'ไม่ปกติ' || m.status?.toLowerCase() === 'inactive'
    ).length;

    const linkedToLine = members.filter((m) => !!m.lineUserId).length;

    // Check for licenses expiring in next 30 days
    const expiringLicenses = members.filter((m) => {
      if (!m.licenseExpiry) return false;

      const parts = m.licenseExpiry.split('/');
      if (parts.length !== 3) return false;

      const month = parseInt(parts[0], 10) - 1;
      const day = parseInt(parts[1], 10);
      let year = parseInt(parts[2], 10);

      // Convert Buddhist year to Gregorian if needed
      if (year > 2500) {
        year -= 543;
      }

      const expiry = new Date(year, month, day);
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays > 0 && diffDays <= 30;
    }).length;

    return {
      total: members.length,
      active,
      inactive,
      linkedToLine,
      expiringLicenses,
    };
  } catch (error) {
    console.error('Error getting member stats from Firestore:', error);
    throw error;
  }
}
