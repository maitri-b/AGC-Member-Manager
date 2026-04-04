// API Route for Member Verification - Search by License Number
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAllMembers } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { licenseNumber } = await request.json();

    if (!licenseNumber) {
      return NextResponse.json({ error: 'License number is required' }, { status: 400 });
    }

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

    if (matchedMembers.length === 0) {
      return NextResponse.json({
        found: false,
        message: 'ไม่พบข้อมูลที่ตรงกัน กรุณาตรวจสอบเลขใบอนุญาตให้ถูกต้อง'
      });
    }

    if (matchedMembers.length > 1) {
      return NextResponse.json({
        found: false,
        multiple: true,
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
    return NextResponse.json({
      found: true,
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
