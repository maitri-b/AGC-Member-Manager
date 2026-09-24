'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { formatThaiDateTime } from '@/lib/date-utils';

interface SyncStatus {
  lastSyncedAt: Date | null;
  totalMembers: number;
}

interface SyncResult {
  success: boolean;
  memberId: string;
  action: 'created' | 'updated' | 'skipped' | 'error';
  error?: string;
}

interface SyncSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: SyncResult[];
  startedAt: string;
  completedAt: string;
  duration: number;
}

export default function SyncMembersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncSummary, setLastSyncSummary] = useState<SyncSummary | null>(null);

  // Sync options
  const [syncMode, setSyncMode] = useState<'all' | 'range' | 'resume'>('all');
  const [startMemberId, setStartMemberId] = useState('');
  const [endMemberId, setEndMemberId] = useState('');
  const [skipExisting, setSkipExisting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/api/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchSyncStatus();
    }
  }, [status]);

  const fetchSyncStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/sync-members');
      if (!response.ok) throw new Error('Failed to fetch sync status');

      const data = await response.json();
      setSyncStatus(data.status);
    } catch (error) {
      console.error('Error fetching sync status:', error);
      alert('ไม่สามารถโหลดสถานะการ sync ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!confirm('คุณต้องการเริ่ม sync members จาก Google Sheets ไปยัง Firestore ใช่หรือไม่?')) {
      return;
    }

    setSyncing(true);
    setLastSyncSummary(null);

    try {
      // Build request body based on sync mode
      const requestBody: {
        startMemberId?: string;
        endMemberId?: string;
        skipExisting?: boolean;
      } = {};

      if (syncMode === 'range') {
        if (startMemberId) requestBody.startMemberId = startMemberId;
        if (endMemberId) requestBody.endMemberId = endMemberId;
      } else if (syncMode === 'resume') {
        requestBody.skipExisting = true;
      }

      if (skipExisting) {
        requestBody.skipExisting = true;
      }

      const response = await fetch('/api/admin/sync-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Sync failed');
      }

      const data = await response.json();
      setLastSyncSummary(data.summary);

      // Refresh sync status
      await fetchSyncStatus();

      alert(`✅ Sync สำเร็จ!\n\nสร้างใหม่: ${data.summary.created}\nอัปเดต: ${data.summary.updated}\nข้าม: ${data.summary.skipped}\nล้มเหลว: ${data.summary.failed}\n\nเวลาที่ใช้: ${(data.summary.duration / 1000).toFixed(2)} วินาที`);
    } catch (error) {
      console.error('Sync error:', error);
      alert('❌ เกิดข้อผิดพลาดในการ sync: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSyncing(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin')}
            className="text-blue-600 hover:text-blue-800 mb-4 flex items-center gap-2"
          >
            ← กลับไปหน้า Admin
          </button>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <span className="text-4xl">🔄</span>
            Sync Members: Google Sheets → Firestore
          </h1>
          <p className="text-gray-600 mt-2">
            Phase 1 Migration - สำรอง/อัปเดต members collection ใน Firestore
          </p>
        </div>

        {/* Current Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span> Current Status
          </h2>
          <div className="space-y-2">
            <p className="text-gray-700">
              <strong>Last Synced:</strong>{' '}
              {syncStatus?.lastSyncedAt
                ? formatThaiDateTime(syncStatus.lastSyncedAt)
                : '-'}
            </p>
            <p className="text-gray-700">
              <strong>Total Members in Firestore:</strong>{' '}
              <span className="text-blue-600 font-semibold">
                {syncStatus?.totalMembers || 0}
              </span>
            </p>
          </div>
        </div>

        {/* Sync Options */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>⚙️</span> Sync Options
          </h2>

          {/* Sync Mode Selection */}
          <div className="space-y-4 mb-6">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                value="all"
                checked={syncMode === 'all'}
                onChange={(e) => setSyncMode(e.target.value as 'all' | 'range' | 'resume')}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium">Sync All Members</div>
                <div className="text-sm text-gray-600">
                  Sync ทุกรายการจาก Google Sheets (อัปเดตทับที่มีอยู่แล้ว)
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="radio"
                value="resume"
                checked={syncMode === 'resume'}
                onChange={(e) => setSyncMode(e.target.value as 'all' | 'range' | 'resume')}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium">Resume Sync (Skip Existing)</div>
                <div className="text-sm text-gray-600">
                  Sync เฉพาะรายการที่ยังไม่มีใน Firestore (ข้ามที่ sync ไปแล้ว)
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="radio"
                value="range"
                checked={syncMode === 'range'}
                onChange={(e) => setSyncMode(e.target.value as 'all' | 'range' | 'resume')}
                className="w-4 h-4"
              />
              <div>
                <div className="font-medium">Sync Specific Range</div>
                <div className="text-sm text-gray-600">
                  กำหนด Member ID ที่ต้องการ sync
                </div>
              </div>
            </label>
          </div>

          {/* Range inputs - show only when range mode is selected */}
          {syncMode === 'range' && (
            <div className="border-l-4 border-blue-400 pl-6 mb-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Member ID (เริ่มจาก)
                </label>
                <input
                  type="text"
                  value={startMemberId}
                  onChange={(e) => setStartMemberId(e.target.value)}
                  placeholder="เช่น 572"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ใส่ Member ID ที่ต้องการเริ่มต้น (หรือเว้นว่างเพื่อเริ่มจากแรกสุด)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Member ID (ถึง)
                </label>
                <input
                  type="text"
                  value={endMemberId}
                  onChange={(e) => setEndMemberId(e.target.value)}
                  placeholder="เช่น 999"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  ใส่ Member ID ที่ต้องการสิ้นสุด (หรือเว้นว่างเพื่อ sync จนจบ)
                </p>
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={skipExisting}
                  onChange={(e) => setSkipExisting(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700">
                  Skip existing members (ข้ามรายการที่มีอยู่แล้วใน Firestore)
                </span>
              </label>
            </div>
          )}

          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`w-full py-3 px-6 rounded-lg font-medium text-white transition-colors ${
              syncing
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {syncing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                กำลัง Sync...
              </span>
            ) : (
              '🔄 Start Sync'
            )}
          </button>
        </div>

        {/* Last Sync Summary */}
        {lastSyncSummary && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span>📋</span> Sync Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{lastSyncSummary.total}</div>
                <div className="text-sm text-gray-600">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{lastSyncSummary.created}</div>
                <div className="text-sm text-gray-600">Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{lastSyncSummary.updated}</div>
                <div className="text-sm text-gray-600">Updated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{lastSyncSummary.skipped}</div>
                <div className="text-sm text-gray-600">Skipped</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{lastSyncSummary.failed}</div>
                <div className="text-sm text-gray-600">Failed</div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              <p><strong>Duration:</strong> {(lastSyncSummary.duration / 1000).toFixed(2)} seconds</p>
            </div>
          </div>
        )}

        {/* Important Notes */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
          <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Important</h3>
          <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
            <li>การ sync จะใช้เวลา 20-30 วินาที สำหรับ ~450 คนสมาชิก</li>
            <li>Google Sheets ยังคงเป็น Source of Truth (ไม่มีผลต่อข้อมูลต้นฉบับ)</li>
            <li>การ sync จะเขียนทับข้อมูลที่มีอยู่แล้วใน Firestore หากเลือก "Sync All"</li>
            <li>ใช้ "Resume Sync" เพื่อ sync เฉพาะรายการใหม่ที่ยังไม่มีใน Firestore</li>
          </ul>
        </div>

        {/* What This Does */}
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mt-4">
          <h3 className="font-semibold text-blue-800 mb-2">ℹ️ What This Does</h3>
          <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
            <li>ดึงข้อมูล members ทั้งหมดจาก Google Sheets</li>
            <li>สร้าง/อัปเดต documents ใน Firestore members collection</li>
            <li>เพิ่มความเร็วการโหลดข้อมูล Admin (5-10x faster)</li>
            <li>ลด Google Sheets API calls (~80%)</li>
            <li>Google Sheets ยังเป็น Source of Truth (ไม่มีผลต่อระบบการจัดการข้อมูลเดิม)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
