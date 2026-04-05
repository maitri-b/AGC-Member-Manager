// API Route for Admin - Migrate User Data to Consistent Field Names
// This one-time migration converts old field names to new consistent names
// Old: displayName, pictureUrl, name, image
// New: lineDisplayName, lineProfilePicture
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admin can run migration
    if (!hasPermission(session.user.permissions || [], 'admin:access')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const db = adminDb();
    const usersSnapshot = await db.collection('users').get();

    let migratedCount = 0;
    let skippedCount = 0;
    const migratedUsers: string[] = [];

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();

      // Check if migration is needed
      // User needs migration if they have old field names but not new ones
      const hasOldDisplayName = userData.displayName && !userData.lineDisplayName;
      const hasOldPictureUrl = userData.pictureUrl && !userData.lineProfilePicture;
      const hasOldName = userData.name && !userData.lineDisplayName;
      const hasOldImage = userData.image && !userData.lineProfilePicture;

      if (hasOldDisplayName || hasOldPictureUrl || hasOldName || hasOldImage) {
        const updates: Record<string, unknown> = {
          migratedAt: new Date(),
          migratedBy: session.user.id,
        };

        // Set new field names from old ones
        if (!userData.lineDisplayName) {
          updates.lineDisplayName = userData.displayName || userData.name || null;
        }
        if (!userData.lineProfilePicture) {
          updates.lineProfilePicture = userData.pictureUrl || userData.image || null;
        }

        await doc.ref.update(updates);
        migratedCount++;
        migratedUsers.push(doc.id);
      } else {
        skippedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration completed. Migrated: ${migratedCount}, Skipped: ${skippedCount}`,
      migratedCount,
      skippedCount,
      migratedUsers,
    });

  } catch (error) {
    console.error('Error migrating users:', error);
    return NextResponse.json({ error: 'Failed to migrate users' }, { status: 500 });
  }
}

// GET: Check migration status
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
    const usersSnapshot = await db.collection('users').get();

    let needsMigration = 0;
    let alreadyMigrated = 0;
    const usersNeedingMigration: { id: string; hasOld: string[] }[] = [];

    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();

      const hasOldFields: string[] = [];
      if (userData.displayName && !userData.lineDisplayName) hasOldFields.push('displayName');
      if (userData.pictureUrl && !userData.lineProfilePicture) hasOldFields.push('pictureUrl');
      if (userData.name && !userData.lineDisplayName) hasOldFields.push('name');
      if (userData.image && !userData.lineProfilePicture) hasOldFields.push('image');

      if (hasOldFields.length > 0) {
        needsMigration++;
        usersNeedingMigration.push({ id: doc.id, hasOld: hasOldFields });
      } else {
        alreadyMigrated++;
      }
    }

    return NextResponse.json({
      totalUsers: usersSnapshot.size,
      needsMigration,
      alreadyMigrated,
      usersNeedingMigration: usersNeedingMigration.slice(0, 10), // Show first 10
    });

  } catch (error) {
    console.error('Error checking migration status:', error);
    return NextResponse.json({ error: 'Failed to check migration status' }, { status: 500 });
  }
}
