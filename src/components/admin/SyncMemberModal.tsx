'use client';

import { useState, useEffect } from 'react';

interface SyncMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMemberId?: string; // Pre-filled Member ID (e.g., from approval)
}

interface SyncResult {
  success: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  duration: number;
}

export default function SyncMemberModal({ isOpen, onClose, initialMemberId }: SyncMemberModalProps) {
  const [memberId, setMemberId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Set initial Member ID when modal opens
  useEffect(() => {
    if (isOpen && initialMemberId) {
      setMemberId(initialMemberId);
      setSyncResult(null);
      setError(null);
    }
  }, [isOpen, initialMemberId]);

  const handleSync = async () => {
    if (!memberId.trim()) {
      setError('กรุณาระบุ Member ID');
      return;
    }

    setSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const response = await fetch('/api/admin/sync-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: memberId.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync member');
      }

      const data = await response.json();

      if (data.success && data.result) {
        setSyncResult({
          success: data.result.success,
          total: 1,
          created: data.result.action === 'created' ? 1 : 0,
          updated: data.result.action === 'updated' ? 1 : 0,
          skipped: data.result.action === 'skipped' ? 1 : 0,
          failed: data.result.action === 'error' ? 1 : 0,
          duration: 0,
        });

        if (data.result.action === 'error') {
          setError(data.result.error || 'เกิดข้อผิดพลาดในการ sync');
        }
      } else {
        throw new Error('Sync failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการ sync');
      setSyncResult({
        success: false,
        total: 1,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 1,
        duration: 0,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleClose = () => {
    setMemberId('');
    setSyncResult(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            Sync ข้อมูลสมาชิกใหม่
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={syncing}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Info message */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  กรุณากด Sync เพื่อดึงข้อมูลสมาชิกจาก Google Sheets มาเก็บใน Firestore
                  ระบบจะดึงข้อมูลล่าสุดของสมาชิกคนนี้มาอัพเดท
                </p>
              </div>
            </div>
          </div>

          {/* Member ID input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Member ID
            </label>
            <input
              type="text"
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="เช่น 726"
              disabled={syncing || !!initialMemberId}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {initialMemberId && (
              <p className="mt-1 text-xs text-gray-500">
                Member ID ถูกระบุไว้แล้วจากการอนุมัติสมาชิก
              </p>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Sync result */}
          {syncResult && syncResult.success && (
            <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">
                    Sync สำเร็จ!
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    {syncResult.created > 0 && `สร้างใหม่ ${syncResult.created} รายการ`}
                    {syncResult.updated > 0 && `อัพเดท ${syncResult.updated} รายการ`}
                    {syncResult.skipped > 0 && `ข้าม ${syncResult.skipped} รายการ`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          {!syncResult?.success && (
            <button
              onClick={handleSync}
              disabled={syncing || !memberId.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลัง Sync...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync ข้อมูล
                </>
              )}
            </button>
          )}
          <button
            onClick={handleClose}
            disabled={syncing}
            className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncResult?.success ? 'เสร็จสิ้น' : 'ยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  );
}
