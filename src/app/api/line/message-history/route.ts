import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

// GET /api/line/message-history?eventId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    // Fetch message history for this event
    const historySnapshot = await db
      .collection('messageHistory')
      .where('eventId', '==', eventId)
      .orderBy('sentAt', 'desc')
      .limit(100)
      .get();

    const history = historySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        eventId: data.eventId,
        subject: data.subject || '',
        message: data.message || '',
        sentAt: data.sentAt?.toDate?.()?.toISOString() || data.sentAt,
        recipients: data.recipients || [],
        recipientCount: (data.recipients || []).length,
      };
    });

    return NextResponse.json({ history }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching message history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch message history' },
      { status: 500 }
    );
  }
}

// POST /api/line/message-history
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventId, subject, message, recipients } = body;

    if (!eventId || !subject || !message || !recipients) {
      return NextResponse.json(
        { error: 'Missing required fields: eventId, subject, message, recipients' },
        { status: 400 }
      );
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'Recipients must be a non-empty array' },
        { status: 400 }
      );
    }

    // Save message history to Firestore
    const historyRef = await db.collection('messageHistory').add({
      eventId,
      subject,
      message,
      recipients, // Array of { lineUserId, contactName, companyName, registrationId }
      sentAt: new Date(),
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: true,
        historyId: historyRef.id,
        message: 'Message history saved successfully'
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error saving message history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save message history' },
      { status: 500 }
    );
  }
}
