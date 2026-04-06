// API Route for Admin - Contact Request Management
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { adminDb } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { updateMember } from '@/lib/google-sheets';

interface ContactRequest {
  id: string;
  memberId: string;
  memberName: string;
  memberCompany: string;
  topic: 'license_expired' | 'inactive_member' | 'complaint' | 'line_not_found' | 'other';
  topicLabel: string;
  message: string;
  complaintAgainst?: string;
  complaintCompany?: string;
  assigneeId: string;
  assigneeName: string;
  contactDate: Date;
  status: 'pending' | 'completed';
  createdAt: Date;
  createdBy: string;
  createdByName: string;
  resolution?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: Date;
  previousLineStatus?: string;
  lineStatusChanged?: boolean;
}

// GET - Fetch contact requests for a member
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'members:list')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const memberId = searchParams.get('memberId');
    const status = searchParams.get('status'); // 'pending' | 'completed' | 'all'

    if (!memberId) {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }

    const db = adminDb();
    // Query without orderBy to avoid needing composite index
    // We'll sort in memory instead
    const snapshot = await db.collection('contactRequests')
      .where('memberId', '==', memberId)
      .get();

    const requests: ContactRequest[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      requests.push({
        id: doc.id,
        memberId: data.memberId,
        memberName: data.memberName,
        memberCompany: data.memberCompany,
        topic: data.topic,
        topicLabel: data.topicLabel,
        message: data.message,
        complaintAgainst: data.complaintAgainst,
        complaintCompany: data.complaintCompany,
        assigneeId: data.assigneeId,
        assigneeName: data.assigneeName,
        contactDate: data.contactDate?.toDate?.() || data.contactDate,
        status: data.status,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        createdBy: data.createdBy,
        createdByName: data.createdByName,
        resolution: data.resolution,
        resolvedBy: data.resolvedBy,
        resolvedByName: data.resolvedByName,
        resolvedAt: data.resolvedAt?.toDate?.() || data.resolvedAt,
        previousLineStatus: data.previousLineStatus,
        lineStatusChanged: data.lineStatusChanged,
      });
    });

    // Sort by createdAt descending (in memory)
    requests.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });

    // Filter by status
    const pending = requests.filter(r => r.status === 'pending');
    const completed = requests.filter(r => r.status === 'completed');

    return NextResponse.json({
      pending,
      completed,
      total: requests.length,
    });
  } catch (error) {
    console.error('Error fetching contact requests:', error);
    return NextResponse.json({ error: 'Failed to fetch contact requests' }, { status: 500 });
  }
}

// POST - Create new contact request
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'members:list')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      memberId,
      memberName,
      memberCompany,
      topic,
      topicLabel,
      message,
      complaintAgainst,
      complaintCompany,
      assigneeId,
      assigneeName,
      contactDate,
      previousLineStatus,
      updateLineStatus,
    } = body;

    if (!memberId || !topic || !message || !assigneeId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = adminDb();

    const contactRequest = {
      memberId,
      memberName: memberName || '',
      memberCompany: memberCompany || '',
      topic,
      topicLabel: topicLabel || '',
      message,
      complaintAgainst: complaintAgainst || null,
      complaintCompany: complaintCompany || null,
      assigneeId,
      assigneeName: assigneeName || '',
      contactDate: contactDate ? new Date(contactDate) : new Date(),
      status: 'pending',
      createdAt: new Date(),
      createdBy: session.user.id,
      createdByName: session.user.name || '',
      previousLineStatus: previousLineStatus || null,
      lineStatusChanged: false,
    };

    const docRef = await db.collection('contactRequests').add(contactRequest);

    // Update LINE status in Google Sheet
    // For all topics except 'other', always update LINE status
    // For 'other' topic, only update if updateLineStatus is true (checkbox checked)
    const shouldUpdateLineStatus = topic !== 'other' || updateLineStatus;

    if (shouldUpdateLineStatus && memberId) {
      try {
        await updateMember(memberId, {
          lineGroupStatus: 'รอผลการติดต่อ',
          lastUpdated: new Date().toISOString(),
          updatedBy: session.user.name || session.user.id,
        });

        // Update the document to reflect the change
        await docRef.update({ lineStatusChanged: true });

        console.log(`Updated LINE status to 'รอผลการติดต่อ' for member ${memberId}`);
      } catch (sheetError) {
        console.error('Error updating LINE status in Google Sheet:', sheetError);
        // Don't fail the whole request
      }
    }

    return NextResponse.json({
      success: true,
      requestId: docRef.id,
      message: 'Contact request created successfully',
    });
  } catch (error) {
    console.error('Error creating contact request:', error);
    return NextResponse.json({ error: 'Failed to create contact request' }, { status: 500 });
  }
}

// PUT - Update contact request (resolve)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(session.user.permissions || [], 'members:list')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { requestId, resolution, resolvedById, resolvedByName, memberId, resolvedLineStatus } = body;

    if (!requestId || !resolution) {
      return NextResponse.json({ error: 'requestId and resolution are required' }, { status: 400 });
    }

    if (!resolvedLineStatus) {
      return NextResponse.json({ error: 'resolvedLineStatus is required' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('contactRequests').doc(requestId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Contact request not found' }, { status: 404 });
    }

    const currentData = doc.data();
    if (currentData?.status === 'completed') {
      return NextResponse.json({ error: 'This request has already been completed' }, { status: 400 });
    }

    // Update contact request document
    await docRef.update({
      status: 'completed',
      resolution,
      resolvedBy: resolvedById || session.user.id,
      resolvedByName: resolvedByName || session.user.name || '',
      resolvedAt: new Date(),
      resolvedLineStatus,
    });

    // Update member's LINE status in Google Sheet
    if (memberId && resolvedLineStatus) {
      try {
        await updateMember(memberId, {
          lineGroupStatus: resolvedLineStatus,
          lastUpdated: new Date().toISOString(),
          updatedBy: session.user.name || session.user.id,
        });
        console.log(`Updated LINE status to '${resolvedLineStatus}' for member ${memberId}`);
      } catch (sheetError) {
        console.error('Error updating LINE status in Google Sheet:', sheetError);
        // Don't fail the whole request, but log the error
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Contact request resolved successfully',
    });
  } catch (error) {
    console.error('Error updating contact request:', error);
    return NextResponse.json({ error: 'Failed to update contact request' }, { status: 500 });
  }
}
