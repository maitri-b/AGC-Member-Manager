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

// Type definition for test user (based on Firestore users collection schema)
interface TestUser {
  lineUserId: string;
  displayName: string;
  pictureUrl: string;
  email: string;
  phone: string;
  companyName: string;
  licenseNumber: string;
  licenseStatus: string;
  licenseExpiryDate: string;
  lineGroupStatus: string;
  membershipStatus: string;
  role: 'admin' | 'member' | 'guest';
  memberId?: string; // Required for members who can register for events
  permissions: string[];
  assignedEventIds?: string[];
  lineGroupLeftDate?: string;
  suspensionReason?: string;
  suspensionDate?: string;
  description: string;
  testAccount: boolean;
}

/**
 * Validation rules for test users based on role
 */
interface ValidationRule {
  requiredFields?: string[];
  mustNotHave?: string[];
  description: string;
}

const VALIDATION_RULES: Record<'member' | 'admin' | 'guest', ValidationRule> = {
  member: {
    requiredFields: ['memberId', 'companyName', 'licenseNumber', 'phone'],
    description: 'Members who can register for events MUST have memberId, companyName, licenseNumber, and phone'
  },
  admin: {
    requiredFields: ['memberId', 'permissions'],
    description: 'Admin users MUST have memberId and permissions array'
  },
  guest: {
    requiredFields: [],
    mustNotHave: ['memberId'],
    description: 'Guest users should NOT have memberId (they cannot register for events)'
  }
};

/**
 * Validate test user data based on role
 */
function validateTestUser(user: Partial<TestUser>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic required fields for all users
  const basicFields = ['lineUserId', 'displayName', 'role'];
  for (const field of basicFields) {
    if (!user[field as keyof TestUser]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Role-specific validation
  if (user.role) {
    const rules = VALIDATION_RULES[user.role];

    if (rules.requiredFields) {
      for (const field of rules.requiredFields) {
        if (!user[field as keyof TestUser]) {
          errors.push(`${user.role} MUST have ${field} - ${rules.description}`);
        }
      }
    }

    if (rules.mustNotHave) {
      for (const field of rules.mustNotHave) {
        if (user[field as keyof TestUser]) {
          errors.push(`${user.role} should NOT have ${field} - ${rules.description}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Test user scenarios (with explicit type annotation)
const TEST_USERS: TestUser[] = [
  {
    lineUserId: 'test-normal-active',
    displayName: 'Test: Normal Active Member',
    pictureUrl: 'https://ui-avatars.com/api/?name=Normal&background=4CAF50&color=fff&size=150',
    email: 'test-normal@example.com',
    phone: '081-111-1111',
    companyName: 'Test Company Normal',
    licenseNumber: 'TEST-NORMAL-001',
    licenseStatus: 'active',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
    lineGroupStatus: 'member',
    membershipStatus: 'active',
    role: 'member',
    memberId: 'TEST-MEMBER-001', // Member ID for event registration
    permissions: [],
    testAccount: true,
    description: '✅ สถานะปกติ - ใบอนุญาตปกติ, อยู่ในกลุ่ม LINE',
  },
  {
    lineUserId: 'test-license-expired',
    displayName: 'Test: Expired License',
    pictureUrl: 'https://ui-avatars.com/api/?name=Expired&background=FF9800&color=fff&size=150',
    email: 'test-expired@example.com',
    phone: '081-222-2222',
    companyName: 'Test Company Expired',
    licenseNumber: 'TEST-EXPIRED-001',
    licenseStatus: 'expired',
    licenseExpiryDate: '2023-01-01', // Expired
    lineGroupStatus: 'member',
    membershipStatus: 'inactive',
    role: 'guest',
    permissions: [],
    testAccount: true,
    description: '⚠️ ใบอนุญาตหมดอายุ - สูญเสียสถานะสมาชิก กลับมาเป็น guest',
  },
  {
    lineUserId: 'test-license-suspended',
    displayName: 'Test: Suspended License',
    pictureUrl: 'https://ui-avatars.com/api/?name=Suspended&background=F44336&color=fff&size=150',
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
    role: 'guest',
    permissions: [],
    testAccount: true,
    description: '🚫 ใบอนุญาตถูกระงับ - สูญเสียสถานะสมาชิก กลับมาเป็น guest',
  },
  {
    lineUserId: 'test-left-line-group',
    displayName: 'Test: Left LINE Group',
    pictureUrl: 'https://ui-avatars.com/api/?name=Left&background=9E9E9E&color=fff&size=150',
    email: 'test-left@example.com',
    phone: '081-444-4444',
    companyName: 'Test Company Left Group',
    licenseNumber: 'TEST-LEFT-001',
    licenseStatus: 'active',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lineGroupStatus: 'left',
    lineGroupLeftDate: new Date().toISOString(),
    membershipStatus: 'active',
    role: 'member',
    memberId: 'TEST-MEMBER-004', // Member ID for event registration
    permissions: [],
    testAccount: true,
    description: '👋 ออกจากกลุ่ม LINE แล้ว - ยังคงเป็นสมาชิก แต่ไม่อยู่ในกลุ่ม LINE',
  },
  {
    lineUserId: 'test-pending-approval',
    displayName: 'Test: Pending Approval',
    pictureUrl: 'https://ui-avatars.com/api/?name=Pending&background=2196F3&color=fff&size=150',
    email: 'test-pending@example.com',
    phone: '081-555-5555',
    companyName: 'Test Company Pending',
    licenseNumber: 'TEST-PENDING-001',
    licenseStatus: 'pending',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lineGroupStatus: 'pending',
    membershipStatus: 'pending',
    role: 'member',
    memberId: 'TEST-MEMBER-005', // Member ID for event registration
    permissions: [],
    testAccount: true,
    description: '⏳ รออนุมัติ - สมาชิกใหม่รอการอนุมัติ แต่ถือว่าเป็น member แล้ว',
  },
  {
    lineUserId: 'test-admin-user',
    displayName: 'Test: Admin User',
    pictureUrl: 'https://ui-avatars.com/api/?name=Admin&background=9C27B0&color=fff&size=150',
    email: 'test-admin@example.com',
    phone: '081-666-6666',
    companyName: 'Test Company Admin',
    licenseNumber: 'TEST-ADMIN-001',
    licenseStatus: 'active',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lineGroupStatus: 'member',
    membershipStatus: 'active',
    role: 'admin',
    memberId: 'TEST-MEMBER-006', // Member ID for event registration
    permissions: ['admin:access', 'events:manage', 'members:manage', 'payments:manage'],
    testAccount: true,
    description: '👑 Admin - มีสิทธิ์เข้าถึงระบบ Admin ทั้งหมด',
  },
  {
    lineUserId: 'test-event-staff',
    displayName: 'Test: Event Staff',
    pictureUrl: 'https://ui-avatars.com/api/?name=Staff&background=00BCD4&color=fff&size=150',
    email: 'test-staff@example.com',
    phone: '081-777-7777',
    companyName: 'Test Company Staff',
    licenseNumber: 'TEST-STAFF-001',
    licenseStatus: 'active',
    licenseExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lineGroupStatus: 'member',
    membershipStatus: 'active',
    role: 'member',
    memberId: 'TEST-MEMBER-007', // Member ID for event registration
    permissions: ['events:manage-assigned', 'events:view-registrations'],
    assignedEventIds: [], // Will be populated based on actual events
    testAccount: true,
    description: '🎫 Event Staff - สมาชิกที่เป็น staff จัดการกิจกรรม',
  },
  {
    lineUserId: 'test-multiple-issues',
    displayName: 'Test: Multiple Issues',
    pictureUrl: 'https://ui-avatars.com/api/?name=Issues&background=E91E63&color=fff&size=150',
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
    role: 'guest',
    permissions: [],
    testAccount: true,
    description: '❌ หลายปัญหา - ใบอนุญาตหมดอายุ + ออกจากกลุ่ม LINE, สูญเสียสถานะสมาชิก',
  },
  {
    lineUserId: 'test-guest-unverified',
    displayName: 'Test: Guest (Unverified)',
    pictureUrl: 'https://ui-avatars.com/api/?name=Guest&background=9E9E9E&color=fff&size=150',
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
    testAccount: true,
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

  // ✅ VALIDATE ALL TEST USERS BEFORE SEEDING
  console.log('🔍 Validating test user data...\n');
  let hasErrors = false;

  for (const user of TEST_USERS) {
    const validation = validateTestUser(user);
    if (!validation.valid) {
      hasErrors = true;
      console.error(`❌ Validation FAILED for: ${user.displayName}`);
      validation.errors.forEach(error => console.error(`   - ${error}`));
      console.log('');
    }
  }

  if (hasErrors) {
    console.error('\n❌ CANNOT SEED: Test users have validation errors!');
    console.error('   Please fix the test user definitions above.\n');
    process.exit(1);
  }

  console.log('✅ All test users validated successfully!\n');

  // Confirm before proceeding
  console.log('📋 Will create the following test users:');
  console.log('─'.repeat(80));
  TEST_USERS.forEach((user, index) => {
    const memberIdInfo = user.memberId ? ` [memberId: ${user.memberId}]` : ' [NO memberId - cannot register for events]';
    console.log(`${index + 1}. ${user.displayName}${memberIdInfo}`);
    console.log(`   LINE ID: ${user.lineUserId}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   License: ${user.licenseNumber} (${user.licenseStatus})`);
    console.log(`   ${user.description}`);
    console.log('');
  });
  console.log('─'.repeat(80));

  try {
    const batch = db.batch();
    const timestamp = new Date().toISOString();

    for (const user of TEST_USERS) {
      // ✅ Write to 'users' collection (NOT 'members')
      const userRef = db.collection('users').doc(user.lineUserId);

      batch.set(userRef, {
        ...user,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastLoginAt: timestamp,
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
