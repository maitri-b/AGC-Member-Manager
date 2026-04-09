// API Route for Admin - Get Pending Counts (Optimized for low Firestore reads)
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

// GET: Get all pending counts in a single API call
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();

    // Use Promise.all to run all count queries in parallel
    // Each count query = 1 read (much cheaper than fetching all documents)
    const [
      verificationsSnapshot,
      profileChangesSnapshot,
      applicationsSnapshot,
      disputesSnapshot,
    ] = await Promise.all([
      // Count pending verification requests
      db.collection('verificationRequests')
        .where('status', '==', 'pending')
        .count()
        .get(),
      // Count pending profile change requests
      db.collection('profileChangeRequests')
        .where('status', '==', 'pending')
        .count()
        .get(),
      // Count pending membership applications
      db.collection('membershipApplications')
        .where('status', '==', 'pending')
        .count()
        .get(),
      // Count pending disputes
      db.collection('disputes')
        .where('status', '==', 'pending')
        .count()
        .get(),
    ]);

    const counts = {
      verifications: verificationsSnapshot.data().count,
      profileChanges: profileChangesSnapshot.data().count,
      applications: applicationsSnapshot.data().count,
      disputes: disputesSnapshot.data().count,
      total: 0,
    };

    counts.total = counts.verifications + counts.profileChanges + counts.applications + counts.disputes;

    return NextResponse.json(counts);

  } catch (error) {
    console.error('Error fetching pending counts:', error);
    return NextResponse.json({ error: 'Failed to fetch pending counts' }, { status: 500 });
  }
}
