/**
 * Script to check member validation for LINE message sending
 *
 * This script helps identify members who:
 * - Have lineUserId but are excluded from message lists due to validation rules
 * - May have issues with their account status
 *
 * Usage:
 *   npx ts-node scripts/check-member-validation.ts
 *
 * This script checks validation rules for LINE message sending:
 * 1. Must have lineUserId (connected to LINE)
 * 2. Must have memberId (verified member)
 * 3. Must be active (isActive !== false in Firestore)
 * 4. Must have status 'ปกติ' in Google Sheets (Column R)
 *
 * Note: lineGroupStatus (Column U) is NOT validated
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAllMembers } from '../src/lib/google-sheets';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Initialize Firebase Admin
if (getApps().length === 0) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  initializeApp({
    credential: cert(serviceAccount as any),
  });
}

const db = getFirestore();

interface ValidationIssue {
  userId: string;
  memberId: string;
  lineUserId: string;
  lineDisplayName: string;
  issues: string[];
  canReceiveMessages: boolean;
}

async function checkMemberValidation() {
  console.log('🔍 Starting member validation check...');
  console.log('='.repeat(80));

  try {
    // Fetch all users from Firestore
    const usersSnapshot = await db.collection('users').get();
    console.log(`\n📊 Total users in Firestore: ${usersSnapshot.size}`);

    // Fetch all members from Google Sheets
    const googleSheetMembers = await getAllMembers();
    const sheetMembersMap = new Map(
      googleSheetMembers.map(m => [m.memberId, m])
    );
    console.log(`📊 Total members in Google Sheets: ${googleSheetMembers.length}`);

    const issues: ValidationIssue[] = [];
    let totalWithLineUserId = 0;
    let totalPassingValidation = 0;

    // Check each user
    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();

      // Skip users without lineUserId
      if (!userData.lineUserId) {
        return;
      }

      totalWithLineUserId++;

      const userId = doc.id;
      const memberId = userData.memberId || '';
      const lineUserId = userData.lineUserId;
      const lineDisplayName = userData.lineDisplayName || userData.displayName || userData.name || '';
      const userIssues: string[] = [];

      // Validation 1: Must have memberId
      const hasMemberId = !!userData.memberId;
      if (!hasMemberId) {
        userIssues.push('❌ ไม่มี memberId (ยังไม่ได้ verify)');
      }

      // Validation 2: Must be active (isActive !== false)
      const isActive = userData.isActive !== false;
      if (!isActive) {
        userIssues.push('❌ isActive = false (ถูกระงับ)');
      }

      // Validation 3: Check verificationStatus
      if (userData.verificationStatus === 'reset') {
        userIssues.push('⚠️ verificationStatus = reset (LINE connection ถูก reset)');
      }

      // Validation 4: Must have status 'ปกติ' in Google Sheets
      if (memberId) {
        const sheetData = sheetMembersMap.get(memberId);
        if (!sheetData) {
          userIssues.push('⚠️ ไม่พบข้อมูลใน Google Sheets');
        } else if (sheetData.status !== 'ปกติ') {
          userIssues.push(`❌ สถานะใน Google Sheets = "${sheetData.status}" (ต้องเป็น "ปกติ")`);
        }
      }

      // Determine if can receive messages
      const canReceiveMessages = hasMemberId && isActive &&
        (memberId ? sheetMembersMap.get(memberId)?.status === 'ปกติ' : false);

      if (canReceiveMessages) {
        totalPassingValidation++;
      }

      // Record if there are any issues
      if (userIssues.length > 0) {
        issues.push({
          userId,
          memberId,
          lineUserId,
          lineDisplayName,
          issues: userIssues,
          canReceiveMessages,
        });
      }
    });

    // Display summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Summary Report');
    console.log('='.repeat(80));
    console.log(`Total users with LINE User ID:        ${totalWithLineUserId}`);
    console.log(`Passing all validations:              ${totalPassingValidation} ✅`);
    console.log(`Failed validation (excluded):         ${totalWithLineUserId - totalPassingValidation} ❌`);
    console.log('='.repeat(80));

    // Display issues
    if (issues.length > 0) {
      console.log(`\n⚠️ Found ${issues.length} users with validation issues:\n`);

      // Group by can/cannot receive messages
      const canReceive = issues.filter(i => i.canReceiveMessages);
      const cannotReceive = issues.filter(i => !i.canReceiveMessages);

      if (cannotReceive.length > 0) {
        console.log(`\n❌ ${cannotReceive.length} users CANNOT receive messages:\n`);
        cannotReceive.forEach((issue, index) => {
          console.log(`${index + 1}. Member ID: ${issue.memberId || '(ไม่มี)'}`);
          console.log(`   LINE Display Name: ${issue.lineDisplayName}`);
          console.log(`   LINE User ID: ${issue.lineUserId}`);
          console.log(`   Issues:`);
          issue.issues.forEach(i => console.log(`     - ${i}`));
          console.log('');
        });
      }

      if (canReceive.length > 0) {
        console.log(`\n⚠️ ${canReceive.length} users CAN receive messages but have warnings:\n`);
        canReceive.forEach((issue, index) => {
          console.log(`${index + 1}. Member ID: ${issue.memberId || '(ไม่มี)'}`);
          console.log(`   LINE Display Name: ${issue.lineDisplayName}`);
          console.log(`   LINE User ID: ${issue.lineUserId}`);
          console.log(`   Warnings:`);
          issue.issues.forEach(i => console.log(`     - ${i}`));
          console.log('');
        });
      }
    } else {
      console.log('\n✅ All users with LINE User ID pass validation!');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Validation check completed successfully!');

  } catch (error) {
    console.error('❌ Error during validation check:', error);
    throw error;
  }
}

// Run validation check
checkMemberValidation()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
