// API Route for Member Verification - Search by License Number
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAllMembers } from '@/lib/google-sheets';
import { adminDb } from '@/lib/firebase-admin';

const MAX_SEARCH_ATTEMPTS = 3;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id || session.user.lineUserId;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found' }, { status: 400 });
    }

    const db = adminDb();
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Check if user is locked
    if (userData?.isSearchLocked) {
      return NextResponse.json({
        found: false,
        locked: true,
        message: 'บัญชีของคุณถูกระงับการค้นหา กรุณาติดต่อ Admin ทางแชทที่ LINE Official AGC เพื่อปลดล็อค'
      }, { status: 403 });
    }

    const { licenseNumber } = await request.json();

    if (!licenseNumber) {
      return NextResponse.json({ error: 'License number is required' }, { status: 400 });
    }

    // Get current search count
    const currentSearchCount = userData?.searchCount || 0;

    // Check if user has reached search limit
    if (currentSearchCount >= MAX_SEARCH_ATTEMPTS) {
      // Lock the user (use set with merge to handle new users)
      await userRef.set({
        isSearchLocked: true,
        lockedAt: new Date(),
        lockedReason: 'ค้นหาเกินจำนวนครั้งที่กำหนด (3 ครั้ง)',
      }, { merge: true });

      return NextResponse.json({
        found: false,
        locked: true,
        message: 'คุณค้นหาครบ 3 ครั้งแล้ว บัญชีของคุณถูกระงับการค้นหา กรุณาติดต่อ Admin ทางแชทที่ LINE Official AGC เพื่อปลดล็อค'
      }, { status: 403 });
    }

    // Log the search attempt
    await db.collection('searchLogs').add({
      userId: userId,
      userDisplayName: session.user.name || 'Unknown',
      userPictureUrl: session.user.image || '',
      searchQuery: licenseNumber,
      searchType: 'licenseNumber',
      searchedAt: new Date(),
      attemptNumber: currentSearchCount + 1,
    });

    // Increment search count (use set with merge to handle new users)
    await userRef.set({
      searchCount: currentSearchCount + 1,
      lastSearchAt: new Date(),
    }, { merge: true });

    // Get all members and search
    const members = await getAllMembers();

    // Search by license number only
    const normalizedLicense = licenseNumber.trim().replace(/\s+/g, '');

    const matchedMembers = members.filter(member => {
      const memberLicense = (member.licenseNumber || '').trim().replace(/\s+/g, '');

      // Check license number match (exact or partial)
      return memberLicense === normalizedLicense ||
             memberLicense.includes(normalizedLicense) ||
             normalizedLicense.includes(memberLicense);
    });

    // Calculate remaining attempts for response
    const remainingAttemptsForError = MAX_SEARCH_ATTEMPTS - (currentSearchCount + 1);

    if (matchedMembers.length === 0) {
      return NextResponse.json({
        found: false,
        remainingAttempts: remainingAttemptsForError,
        message: `ไม่พบข้อมูลที่ตรงกัน กรุณาตรวจสอบเลขใบอนุญาตให้ถูกต้อง (เหลือโอกาสค้นหาอีก ${remainingAttemptsForError} ครั้ง)`
      });
    }

    if (matchedMembers.length > 1) {
      return NextResponse.json({
        found: false,
        multiple: true,
        remainingAttempts: remainingAttemptsForError,
        message: 'พบข้อมูลหลายรายการ กรุณาติดต่อ Admin'
      });
    }

    const member = matchedMembers[0];

    // Check if already linked to another LINE account
    if (member.lineUserId && member.lineUserId !== session.user.lineUserId && member.lineUserId !== session.user.id) {
      return NextResponse.json({
        found: true,
        alreadyLinked: true,
        member: {
          memberId: member.memberId,
          companyNameTH: member.companyNameTH,
          companyNameEN: member.companyNameEN,
          fullNameTH: member.fullNameTH,
          nickname: member.nickname,
          licenseNumber: member.licenseNumber,
          positionClub: member.positionClub,
          status: member.status,
          mobile: member.mobile ? maskPhone(member.mobile) : '',
        },
        message: 'ข้อมูลสมาชิกนี้มีผู้ยืนยันตัวตนไปแล้ว'
      });
    }

    // Return member info for confirmation (hide sensitive data)
    // Also return remaining search attempts
    const remainingAttempts = MAX_SEARCH_ATTEMPTS - (currentSearchCount + 1);

    return NextResponse.json({
      found: true,
      remainingAttempts,
      member: {
        memberId: member.memberId,
        companyNameTH: member.companyNameTH,
        companyNameEN: member.companyNameEN,
        fullNameTH: member.fullNameTH,
        nickname: member.nickname,
        licenseNumber: member.licenseNumber,
        positionClub: member.positionClub,
        status: member.status,
        // Mask phone for security
        mobile: member.mobile ? maskPhone(member.mobile) : '',
      }
    });

  } catch (error) {
    console.error('Error searching member:', error);
    return NextResponse.json({ error: 'Failed to search member' }, { status: 500 });
  }
}

// Helper to mask phone number (081-xxx-x678)
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return digits.slice(0, 3) + '-xxx-x' + digits.slice(-3);
}
