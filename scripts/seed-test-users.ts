/**
 * Seed Test Users Script
 *
 * Creates test users with various scenarios for testing validation and permissions.
 *
 * Usage:
 *   npm run seed-test-users
 *
 * ⚠️ ONLY run in development/staging environment!
 */

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Import the existing Firebase Admin instance
import { adminDb } from '../src/lib/firebase-admin';

const db = adminDb();

// Test user scenarios
const TEST_USERS = [
  {
    lineUserId: 'test-normal-active',
    displayName: 'Test: Normal Active Member',
    pictureUrl: 'https://via.placeholder.com/150/4CAF50/FFFFFF?text=Normal',
    email: 'test-normal@example.com',
    phone: '081-111-1111',
    companyName: 'Test Company Normal',
    licenseNumber: 'TEST-NORMAL-001',
    licenseStatus: 'active',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
    lineGroupStatus: 'member',
    membershipStatus: 'active',
    role: 'member',
    permissions: [],
    description: '✅ สถานะปกติ - ใบอนุญาตปกติ, อยู่ในกลุ่ม LINE',
  },
  {
    lineUserId: 'test-license-expired',
    displayName: 'Test: Expired License',
    pictureUrl: 'https://via.placeholder.com/150/FF9800/FFFFFF?text=Expired',
    email: 'test-expired@example.com',
    phone: '081-222-2222',
    companyName: 'Test Company Expired',
    licenseNumber: 'TEST-EXPIRED-001',
    licenseStatus: 'expired',
    licenseExpiryDate: '2023-01-01', // Expired
    lineGroupStatus: 'member',
    membershipStatus: 'active',
    role: 'member',
    permissions: [],
    description: '⚠️ ใบอนุญาตหมดอายุ - ไม่ควรลงทะเบียนกิจกรรมได้',
  },
  {
    lineUserId: 'test-license-suspended',
    displayName: 'Test: Suspended License',
    pictureUrl: 'https://via.placeholder.com/150/F44336/FFFFFF?text=Suspended',
    email: 'test-suspended@example.com',
    phone: '081-333-3333',
    companyName: 'Test Company Suspended',
    licenseNumber: 'TEST-SUSPENDED-001',
    licenseStatus: 'suspended',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    suspensionReason: 'Test suspension - Payment overdue',
    suspensionDate: new Date().toISOString(),
    lineGroupStatus: 'member',
    membershipStatus: 'suspended',
    role: 'member',
    permissions: [],
    description: '🚫 ใบอนุญาตถูกระงับ - ไม่ควรลงทะเบียนกิจกรรมได้',
  },
  {
    lineUserId: 'test-left-line-group',
    displayName: 'Test: Left LINE Group',
    pictureUrl: 'https://via.placeholder.com/150/9E9E9E/FFFFFF?text=Left',
    email: 'test-left@example.com',
    phone: '081-444-4444',
    companyName: 'Test Company Left Group',
    licenseNumber: 'TEST-LEFT-001',
    licenseStatus: 'active',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lineGroupStatus: 'left',
    lineGroupLeftDate: new Date().toISOString(),
    membershipStatus: 'inactive',
    role: 'member',
    permissions: [],
    description: '👋 ออกจากกลุ่ม LINE แล้ว - ไม่ควรลงทะเบียนกิจกรรมได้',
  },
  {
    lineUserId: 'test-pending-approval',
    displayName: 'Test: Pending Approval',
    pictureUrl: 'https://via.placeholder.com/150/2196F3/FFFFFF?text=Pending',
    email: 'test-pending@example.com',
    phone: '081-555-5555',
    companyName: 'Test Company Pending',
    licenseNumber: 'TEST-PENDING-001',
    licenseStatus: 'pending',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lineGroupStatus: 'pending',
    membershipStatus: 'pending',
    role: 'member',
    permissions: [],
    description: '⏳ รออนุมัติ - สมาชิกใหม่ยังไม่ได้รับการอนุมัติ',
  },
  {
    lineUserId: 'test-admin-user',
    displayName: 'Test: Admin User',
    pictureUrl: 'https://via.placeholder.com/150/9C27B0/FFFFFF?text=Admin',
    email: 'test-admin@example.com',
    phone: '081-666-6666',
    companyName: 'Test Company Admin',
    licenseNumber: 'TEST-ADMIN-001',
    licenseStatus: 'active',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lineGroupStatus: 'member',
    membershipStatus: 'active',
    role: 'admin',
    permissions: ['admin:access', 'events:manage', 'members:manage', 'payments:manage'],
    description: '👑 Admin - มีสิทธิ์เข้าถึงระบบ Admin ทั้งหมด',
  },
  {
    lineUserId: 'test-event-staff',
    displayName: 'Test: Event Staff',
    pictureUrl: 'https://via.placeholder.com/150/00BCD4/FFFFFF?text=Staff',
    email: 'test-staff@example.com',
    phone: '081-777-7777',
    companyName: 'Test Company Staff',
    licenseNumber: 'TEST-STAFF-001',
    licenseStatus: 'active',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lineGroupStatus: 'member',
    membershipStatus: 'active',
    role: 'event-staff',
    permissions: ['events:manage-assigned', 'events:view-registrations'],
    assignedEventIds: [], // Will be populated based on actual events
    description: '🎫 Event Staff - จัดการกิจกรรมที่ได้รับมอบหมาย',
  },
  {
    lineUserId: 'test-multiple-issues',
    displayName: 'Test: Multiple Issues',
    pictureUrl: 'https://via.placeholder.com/150/E91E63/FFFFFF?text=Issues',
    email: 'test-issues@example.com',
    phone: '081-888-8888',
    companyName: 'Test Company Issues',
    licenseNumber: 'TEST-ISSUES-001',
    licenseStatus: 'expired',
    licenseExpiryDate: '2022-06-01',
    lineGroupStatus: 'left',
    lineGroupLeftDate: '2024-01-15',
    membershipStatus: 'inactive',
    suspensionReason: 'Multiple violations',
    role: 'member',
    permissions: [],
    description: '❌ หลายปัญหา - ใบอนุญาตหมดอายุ + ออกจากกลุ่ม LINE',
  },
  {
    lineUserId: 'test-guest-unverified',
    displayName: 'Test: Guest (Unverified)',
    pictureUrl: 'https://via.placeholder.com/150/9E9E9E/FFFFFF?text=Guest',
    email: 'test-guest@example.com',
    phone: '',
    companyName: '',
    licenseNumber: '',
    licenseStatus: '',
    licenseExpiryDate: '',
    lineGroupStatus: '',
    membershipStatus: '',
    role: 'guest',
    permissions: [],
    description: '👤 Guest - เพิ่ง login ครั้งแรก ยังไม่ได้ยืนยันตัวตน ไม่มีข้อมูลใบอนุญาต',
  },
];

async function seedTestUsers() {
  console.log('🌱 Starting test user seeding...\n');

  // Safety check
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ ERROR: Cannot seed test users in PRODUCTION environment!');
    console.error('   This script should only run in development or staging.');
    process.exit(1);
  }

  // Confirm before proceeding
  console.log('📋 Will create the following test users:');
  console.log('─'.repeat(80));
  TEST_USERS.forEach((user, index) => {
    console.log(`${index + 1}. ${user.displayName}`);
    console.log(`   LINE ID: ${user.lineUserId}`);
    console.log(`   License: ${user.licenseNumber} (${user.licenseStatus})`);
    console.log(`   ${user.description}`);
    console.log('');
  });
  console.log('─'.repeat(80));

  try {
    const batch = db.batch();
    const timestamp = new Date().toISOString();

    for (const user of TEST_USERS) {
      const userRef = db.collection('members').doc(user.lineUserId);

      batch.set(userRef, {
        ...user,
        testAccount: true, // Mark as test account
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLogin: timestamp,
      });
    }

    await batch.commit();

    console.log(`✅ Successfully seeded ${TEST_USERS.length} test users!`);
    console.log('\n📝 Next steps:');
    console.log('   1. These users can now login via LINE OAuth (if LINE IDs are configured)');
    console.log('   2. Or use the admin impersonation feature to view as these users');
    console.log('   3. To clean up: npm run cleanup-test-users');
    console.log('\n💡 Test Scenarios:');
    console.log('   - Normal user:        test-normal-active');
    console.log('   - Expired license:    test-license-expired');
    console.log('   - Suspended:          test-license-suspended');
    console.log('   - Left LINE group:    test-left-line-group');
    console.log('   - Pending approval:   test-pending-approval');
    console.log('   - Admin user:         test-admin-user');
    console.log('   - Event staff:        test-event-staff');
    console.log('   - Multiple issues:    test-multiple-issues');

  } catch (error) {
    console.error('❌ Error seeding test users:', error);
    process.exit(1);
  }
}

// Run the seed function
seedTestUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
