// API Route for Admin to Update Event Registration
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { updateEventRegistration } from '@/lib/event-sheets';
import { hasPermission } from '@/lib/permissions';

// PUT - Admin update registration
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin/committee permission
    if (!hasPermission(session.user.permissions, 'members:list') &&
        !hasPermission(session.user.permissions, 'admin:access')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ในการแก้ไข' }, { status: 403 });
    }

    const { eventId } = await params;
    const body = await request.json();
    const { registrationId, updateData } = body;

    if (!registrationId) {
      return NextResponse.json({ error: 'กรุณาระบุ registrationId' }, { status: 400 });
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'กิจกรรมนี้ยังไม่พร้อมรับการแก้ไข' }, { status: 400 });
    }

    // Prepare update data with admin info
    const finalUpdateData: Record<string, unknown> = {
      ...updateData,
      last_update_info: JSON.stringify({
        updated: {
          by: 'admin',
          userId: session.user.id,
          userName: session.user.name,
          at: new Date().toISOString(),
        },
      }),
    };

    // Update in Google Sheets
    await updateEventRegistration(eventData.sheetName, registrationId, finalUpdateData);

    return NextResponse.json({
      success: true,
      message: 'อัพเดทข้อมูลเรียบร้อยแล้ว',
    });
  } catch (error) {
    console.error('Error updating registration (admin):', error);
    return NextResponse.json({ error: 'ไม่สามารถอัพเดทข้อมูลได้ กรุณาลองใหม่' }, { status: 500 });
  }
}

// DELETE - Admin cancel/delete registration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin/committee permission
    if (!hasPermission(session.user.permissions, 'members:list') &&
        !hasPermission(session.user.permissions, 'admin:access')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ในการยกเลิก' }, { status: 403 });
    }

    const { eventId } = await params;
    const { searchParams } = new URL(request.url);
    const registrationId = searchParams.get('registrationId');

    if (!registrationId) {
      return NextResponse.json({ error: 'กรุณาระบุ registrationId' }, { status: 400 });
    }

    const db = adminDb();

    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();

    if (!eventDoc.exists) {
      return NextResponse.json({ error: 'ไม่พบกิจกรรมนี้' }, { status: 404 });
    }

    const eventData = eventDoc.data();

    if (!eventData?.sheetName) {
      return NextResponse.json({ error: 'กิจกรรมนี้ยังไม่พร้อมรับการแก้ไข' }, { status: 400 });
    }

    // Update status to 'cancelled' instead of deleting
    const updateData: Record<string, unknown> = {
      status: 'cancelled',
      last_update_info: JSON.stringify({
        cancelled: {
          by: 'admin',
          userId: session.user.id,
          userName: session.user.name,
          at: new Date().toISOString(),
        },
      }),
    };

    await updateEventRegistration(eventData.sheetName, registrationId, updateData);

    return NextResponse.json({
      success: true,
      message: 'ยกเลิกการลงทะเบียนเรียบร้อยแล้ว',
    });
  } catch (error) {
    console.error('Error cancelling registration (admin):', error);
    return NextResponse.json({ error: 'ไม่สามารถยกเลิกได้ กรุณาลองใหม่' }, { status: 500 });
  }
}
