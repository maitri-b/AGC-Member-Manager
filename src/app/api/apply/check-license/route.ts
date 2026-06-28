// API Route to check if license number already exists
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { getAllMembers } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { licenseNumber } = body;

    if (!licenseNumber || typeof licenseNumber !== 'string') {
      return NextResponse.json({ error: 'Invalid license number' }, { status: 400 });
    }

    const db = adminDb();

    // Check 1: Check in pending/approved applications
    const existingApplication = await db.collection('membershipApplications')
      .where('licenseNumber', '==', licenseNumber)
      .where('status', 'in', ['pending', 'approved'])
      .limit(1)
      .get();

    if (!existingApplication.empty) {
      return NextResponse.json({
        exists: true,
        source: 'application',
        message: 'มีข้อมูลเลขที่ใบอนุญาตนี้ในระบบการสมัครสมาชิกแล้ว ไม่สามารถลงทะเบียนซ้ำได้ กรุณาติดต่อทีมนายทะเบียน',
      });
    }

    // Check 2: Check in Google Sheets member database
    try {
      const allMembers = await getAllMembers();
      const existingMember = allMembers.find(member => member.licenseNumber === licenseNumber);

      if (existingMember) {
        return NextResponse.json({
          exists: true,
          source: 'member',
          message: 'มีข้อมูลเลขที่ใบอนุญาตนี้ในฐานข้อมูลสมาชิกแล้ว ไม่สามารถลงทะเบียนซ้ำได้ กรุณาติดต่อทีมนายทะเบียน',
        });
      }
    } catch (sheetsError) {
      console.error('Error checking Google Sheets:', sheetsError);
      // Continue even if sheets check fails - don't block the user
    }

    // License number is available
    return NextResponse.json({
      exists: false,
      message: 'เลขที่ใบอนุญาตนี้สามารถใช้งานได้',
    });
  } catch (error) {
    console.error('Error checking license:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบ' }, { status: 500 });
  }
}
