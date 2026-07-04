// Activity Log Service for tracking changes in event registrations
import { adminDb } from './firebase-admin';

export interface ActivityLog {
  logId: string;                  // Auto-generated ID
  eventId: string;                // Event ID
  registrationId: string;         // Registration ID being modified
  action: 'update' | 'cancel' | 'confirm' | 'payment' | 'special_charge';

  // User who made the change
  userId: string;                 // LINE user ID or admin ID
  userName: string;               // Display name or admin name
  userRole: string;               // 'admin', 'committee', 'event-staff', 'member', etc.

  // Change details
  changes?: {
    field: string;                // Field name that was changed
    oldValue: any;                // Previous value
    newValue: any;                // New value
  }[];

  // Additional context
  reason?: string;                // For cancellations or special actions
  notes?: string;                 // Additional notes

  // Timestamp
  createdAt: string;              // ISO timestamp
}

/**
 * Create an activity log entry
 */
export async function createActivityLog(log: Omit<ActivityLog, 'logId' | 'createdAt'>): Promise<string> {
  try {
    const db = adminDb();
    const logsRef = db.collection('activityLogs');

    const logData: ActivityLog = {
      ...log,
      logId: logsRef.doc().id,
      createdAt: new Date().toISOString(),
    };

    await logsRef.doc(logData.logId).set(logData);

    console.log('[Activity Log] Created:', {
      logId: logData.logId,
      action: logData.action,
      registrationId: logData.registrationId,
    });

    return logData.logId;
  } catch (error) {
    console.error('[Activity Log] Error creating log:', error);
    throw error;
  }
}

/**
 * Get activity logs for a specific registration
 */
export async function getActivityLogs(
  registrationId: string,
  limit: number = 50
): Promise<ActivityLog[]> {
  try {
    const db = adminDb();
    const snapshot = await db
      .collection('activityLogs')
      .where('registrationId', '==', registrationId)
      .limit(limit)
      .get();

    const logs = snapshot.docs.map(doc => doc.data() as ActivityLog);

    // Sort by createdAt descending (newest first) in JavaScript
    logs.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return logs;
  } catch (error) {
    console.error('[Activity Log] Error fetching logs:', error);
    return [];
  }
}

/**
 * Get activity logs for a specific event
 */
export async function getEventActivityLogs(
  eventId: string,
  limit: number = 100
): Promise<ActivityLog[]> {
  try {
    const db = adminDb();
    const snapshot = await db
      .collection('activityLogs')
      .where('eventId', '==', eventId)
      .limit(limit)
      .get();

    const logs = snapshot.docs.map(doc => doc.data() as ActivityLog);

    // Sort by createdAt descending (newest first) in JavaScript
    logs.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return logs;
  } catch (error) {
    console.error('[Activity Log] Error fetching event logs:', error);
    return [];
  }
}

/**
 * Helper to create a detailed change log entry for registration updates
 */
export async function logRegistrationUpdate(params: {
  eventId: string;
  registrationId: string;
  userId: string;
  userName: string;
  userRole: string;
  oldData: Record<string, any>;
  newData: Record<string, any>;
  notes?: string;
}): Promise<string> {
  const { eventId, registrationId, userId, userName, userRole, oldData, newData, notes } = params;

  // Detect changes
  const changes: { field: string; oldValue: any; newValue: any }[] = [];

  for (const key in newData) {
    if (oldData[key] !== newData[key]) {
      changes.push({
        field: key,
        oldValue: oldData[key],
        newValue: newData[key],
      });
    }
  }

  // Create log
  return await createActivityLog({
    eventId,
    registrationId,
    action: 'update',
    userId,
    userName,
    userRole,
    changes,
    notes,
  });
}

/**
 * Helper to create a cancellation log entry
 */
export async function logRegistrationCancellation(params: {
  eventId: string;
  registrationId: string;
  userId: string;
  userName: string;
  userRole: string;
  reason: string;
}): Promise<string> {
  const { eventId, registrationId, userId, userName, userRole, reason } = params;

  return await createActivityLog({
    eventId,
    registrationId,
    action: 'cancel',
    userId,
    userName,
    userRole,
    reason,
  });
}

/**
 * Helper to create a payment confirmation log entry
 */
export async function logPaymentConfirmation(params: {
  eventId: string;
  registrationId: string;
  userId: string;
  userName: string;
  userRole: string;
  paymentType: string;
  amount: number;
}): Promise<string> {
  const { eventId, registrationId, userId, userName, userRole, paymentType, amount } = params;

  return await createActivityLog({
    eventId,
    registrationId,
    action: 'payment',
    userId,
    userName,
    userRole,
    notes: `ยืนยันการชำระเงิน ${paymentType}: ฿${amount.toLocaleString()}`,
  });
}
