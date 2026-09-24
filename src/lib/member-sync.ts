// Member Sync Service: Google Sheets → Firestore
// Part of Phase 1 Migration - Sync members collection from Google Sheets
import { adminDb } from '@/lib/firebase-admin';
import { getAllMembers, getMemberById } from '@/lib/google-sheets';
import { Member } from '@/types/member';
import { FieldValue } from 'firebase-admin/firestore';

export interface SyncResult {
  success: boolean;
  memberId: string;
  action: 'created' | 'updated' | 'skipped' | 'error';
  error?: string;
}

export interface SyncSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: SyncResult[];
  startedAt: Date;
  completedAt: Date;
  duration: number; // milliseconds
}

/**
 * Sync a single member from Google Sheets to Firestore members collection
 * @param memberId - The member ID to sync
 * @returns SyncResult with success status and details
 */
export async function syncSingleMemberToFirestore(memberId: string): Promise<SyncResult> {
  try {
    // Fetch member data from Google Sheets
    const member = await getMemberById(memberId);

    if (!member || !member.memberId) {
      return {
        success: false,
        memberId,
        action: 'skipped',
        error: 'Member not found in Google Sheets',
      };
    }

    // Get Firestore reference
    const db = adminDb();
    const memberRef = db.collection('members').doc(member.memberId);

    // Check if member already exists
    const existingDoc = await memberRef.get();
    const action: 'created' | 'updated' = existingDoc.exists ? 'updated' : 'created';

    // Prepare member data with sync metadata
    const memberData = {
      // Core member data from Google Sheets
      memberId: member.memberId,

      // Company
      companyNameEN: member.companyNameEN || '',
      companyNameTH: member.companyNameTH || '',

      // Personal
      fullNameTH: member.fullNameTH || '',
      nickname: member.nickname || '',

      // LINE
      lineId: member.lineId || '',
      lineName: member.lineName || '',
      lineUserId: member.lineUserId || '',
      lineDisplayName: member.lineDisplayName || '',

      // Contact
      phone: member.phone || '',
      mobile: member.mobile || '',
      email: member.email || '',
      website: member.website || '',

      // License
      licenseNumber: member.licenseNumber || '',
      licenseExpiry: member.licenseExpiry || '',
      licenseDocumentUrl: member.licenseDocumentUrl || '',

      // Position
      positionCompany: member.positionCompany || '',
      positionClub: member.positionClub || '',

      // Status
      status: member.status || '',

      // Sponsor
      sponsor1: member.sponsor1 || '',
      sponsor2: member.sponsor2 || '',

      // LINE Group
      lineGroupStatus: member.lineGroupStatus || '',
      lineGroupJoinDate: member.lineGroupJoinDate || '',
      lineGroupJoinBy: member.lineGroupJoinBy || '',
      lineGroupLeaveDate: member.lineGroupLeaveDate || '',
      lineGroupLeaveBy: member.lineGroupLeaveBy || '',

      // System fields from Google Sheets
      lastUpdated: member.lastUpdated || '',
      updatedBy: member.updatedBy || '',

      // Sync metadata
      syncedAt: FieldValue.serverTimestamp(),
      syncedFrom: 'google-sheets',
    };

    // Write to Firestore
    await memberRef.set(memberData, { merge: true });

    return {
      success: true,
      memberId: member.memberId,
      action,
    };
  } catch (error) {
    console.error(`Error syncing member ${memberId}:`, error);
    return {
      success: false,
      memberId,
      action: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Sync all members from Google Sheets to Firestore members collection
 * @returns SyncSummary with detailed results
 */
export async function syncAllMembersToFirestore(): Promise<SyncSummary> {
  const startedAt = new Date();
  const results: SyncResult[] = [];

  try {
    // Fetch all members from Google Sheets
    console.log('Fetching all members from Google Sheets...');
    const members = await getAllMembers();
    console.log(`Found ${members.length} members to sync`);

    // Sync each member
    for (const member of members) {
      if (!member.memberId) {
        results.push({
          success: false,
          memberId: 'unknown',
          action: 'skipped',
          error: 'Missing memberId',
        });
        continue;
      }

      const result = await syncSingleMemberToFirestore(member.memberId);
      results.push(result);

      // Log progress every 50 members
      if (results.length % 50 === 0) {
        console.log(`Progress: ${results.length}/${members.length} members processed`);
      }
    }

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    // Calculate summary
    const summary: SyncSummary = {
      total: results.length,
      created: results.filter((r) => r.action === 'created').length,
      updated: results.filter((r) => r.action === 'updated').length,
      skipped: results.filter((r) => r.action === 'skipped').length,
      failed: results.filter((r) => r.action === 'error').length,
      results,
      startedAt,
      completedAt,
      duration,
    };

    console.log('Sync completed:', {
      total: summary.total,
      created: summary.created,
      updated: summary.updated,
      skipped: summary.skipped,
      failed: summary.failed,
      duration: `${(summary.duration / 1000).toFixed(2)}s`,
    });

    return summary;
  } catch (error) {
    console.error('Error in syncAllMembersToFirestore:', error);

    const completedAt = new Date();
    const duration = completedAt.getTime() - startedAt.getTime();

    return {
      total: results.length,
      created: results.filter((r) => r.action === 'created').length,
      updated: results.filter((r) => r.action === 'updated').length,
      skipped: results.filter((r) => r.action === 'skipped').length,
      failed: results.filter((r) => r.action === 'error').length + 1, // +1 for the overall error
      results,
      startedAt,
      completedAt,
      duration,
    };
  }
}

/**
 * Get sync status from Firestore
 * Returns the last sync timestamp and count
 */
export async function getSyncStatus(): Promise<{
  lastSyncedAt: Date | null;
  totalMembers: number;
}> {
  try {
    const db = adminDb();
    const membersSnapshot = await db.collection('members').limit(1).orderBy('syncedAt', 'desc').get();

    if (membersSnapshot.empty) {
      return {
        lastSyncedAt: null,
        totalMembers: 0,
      };
    }

    // Get total count
    const countSnapshot = await db.collection('members').count().get();
    const totalMembers = countSnapshot.data().count;

    // Get last synced timestamp
    const lastDoc = membersSnapshot.docs[0];
    const lastSyncedAt = lastDoc.data().syncedAt?.toDate() || null;

    return {
      lastSyncedAt,
      totalMembers,
    };
  } catch (error) {
    console.error('Error getting sync status:', error);
    return {
      lastSyncedAt: null,
      totalMembers: 0,
    };
  }
}
