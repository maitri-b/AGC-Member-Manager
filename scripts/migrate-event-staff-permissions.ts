/**
 * Migration Script: Update event-co and event-staff permissions
 *
 * This script removes 'members:list' permission and adds 'members:view' permission
 * for all users with role 'event-co' or 'event-staff'.
 *
 * Run with: npm run migrate-permissions
 */

import { adminDb } from '../src/lib/firebase-admin';

async function migrateEventStaffPermissions() {
  console.log('🚀 Starting migration: event-co and event-staff permissions...\n');

  const db = adminDb();
  const usersRef = db.collection('users');

  try {
    // Get all users with role event-co or event-staff
    const snapshot = await usersRef
      .where('role', 'in', ['event-co', 'event-staff'])
      .get();

    if (snapshot.empty) {
      console.log('✅ No event-co or event-staff users found. Migration not needed.');
      return;
    }

    console.log(`📊 Found ${snapshot.size} users to migrate:\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of snapshot.docs) {
      const userData = doc.data();
      const userId = doc.id;
      const role = userData.role;
      const currentPermissions = userData.permissions || [];

      console.log(`👤 User: ${userId} (${role})`);
      console.log(`   Current permissions: [${currentPermissions.join(', ')}]`);

      // Check if migration is needed
      const hasMembersList = currentPermissions.includes('members:list');
      const hasMembersView = currentPermissions.includes('members:view');

      if (!hasMembersList && hasMembersView) {
        console.log(`   ⏭️  SKIP: Already migrated\n`);
        skippedCount++;
        continue;
      }

      try {
        // Remove 'members:list' and add 'members:view'
        let newPermissions = currentPermissions.filter((p: string) => p !== 'members:list');

        if (!newPermissions.includes('members:view')) {
          newPermissions.push('members:view');
        }

        // Update user document
        await usersRef.doc(userId).update({
          permissions: newPermissions,
          updatedAt: new Date(),
          updatedBy: 'migration-script',
        });

        console.log(`   New permissions: [${newPermissions.join(', ')}]`);
        console.log(`   ✅ UPDATED\n`);
        updatedCount++;
      } catch (error) {
        console.error(`   ❌ ERROR: Failed to update user ${userId}:`, error);
        errorCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Total users found:    ${snapshot.size}`);
    console.log(`✅ Updated:           ${updatedCount}`);
    console.log(`⏭️  Skipped:           ${skippedCount}`);
    console.log(`❌ Errors:            ${errorCount}`);
    console.log('='.repeat(60));

    if (errorCount > 0) {
      console.log('\n⚠️  Migration completed with errors. Please check the logs above.');
      process.exit(1);
    } else {
      console.log('\n🎉 Migration completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Fatal error during migration:', error);
    process.exit(1);
  }
}

// Run migration
migrateEventStaffPermissions();
