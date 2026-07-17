'use client';

import { useState, useEffect, useMemo } from 'react';
import { Member } from '@/types/member';

interface PromoteEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  eventDescription?: string;
}

export default function PromoteEventModal({
  isOpen,
  onClose,
  eventId,
  eventName,
  eventDescription = '',
}: PromoteEventModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      setSelectedMemberIds(new Set());
      setSearchTerm('');
      setMessage(null);
    }
  }, [isOpen]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      const data = await response.json();

      // Filter: Only members with status === 'ปกติ' and lineUserId exists
      const filteredMembers = (data.users || []).filter((user: any) => {
        const hasLineUserId = !!user.lineUserId;
        const hasNormalStatus = user.memberId; // Has memberId means they are verified
        return hasLineUserId && hasNormalStatus;
      });

      setMembers(filteredMembers);
    } catch (error) {
      console.error('Error fetching members:', error);
      setMessage({ type: 'error', text: 'ไม่สามารถโหลดรายชื่อสมาชิกได้' });
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort members
  const filteredMembers = useMemo(() => {
    let filtered = [...members];

    // Search filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter((member) => {
        const fullNameTH = member.lineDisplayName || member.fullNameTH || '';
        const companyNameTH = member.companyNameTH || member.memberId || '';
        const memberId = member.memberId || '';
        const lineDisplayName = member.lineDisplayName || '';

        return (
          fullNameTH.toLowerCase().includes(lowerSearch) ||
          companyNameTH.toLowerCase().includes(lowerSearch) ||
          memberId.toLowerCase().includes(lowerSearch) ||
          lineDisplayName.toLowerCase().includes(lowerSearch)
        );
      });
    }

    // Sort by Member ID descending
    filtered.sort((a, b) => {
      const idA = parseInt(a.memberId || '0', 10);
      const idB = parseInt(b.memberId || '0', 10);
      return idB - idA; // Descending
    });

    return filtered;
  }, [members, searchTerm]);

  const handleToggleSelect = (lineUserId: string) => {
    setSelectedMemberIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(lineUserId)) {
        newSet.delete(lineUserId);
      } else {
        newSet.add(lineUserId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedMemberIds.size === filteredMembers.length) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(filteredMembers.map((m) => m.lineUserId!)));
    }
  };

  const handleSend = async () => {
    if (selectedMemberIds.size === 0) {
      setMessage({ type: 'error', text: 'กรุณาเลือกสมาชิกอย่างน้อย 1 คน' });
      return;
    }

    try {
      setSending(true);
      setMessage(null);

      const eventUrl = `/events/`;
      const memberIdsArray = Array.from(selectedMemberIds);

      const response = await fetch('/api/line/promote-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberIds: memberIdsArray,
          eventId,
          eventName,
          eventDescription,
          eventUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send messages');
      }

      const result = await response.json();
      setMessage({ type: 'success', text: result.message || 'ส่งข้อความสำเร็จ' });

      // Reset selection after success
      setSelectedMemberIds(new Set());

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error sending promotion:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ไม่สามารถส่งข้อความได้',
      });
    } finally {
      setSending(false);
    }
  };

  // Generate message preview
  const messagePreview = useMemo(() => {
    let shortDescription = eventDescription;
    const needsTruncation = shortDescription.length > 200;

    if (needsTruncation) {
      shortDescription = shortDescription.substring(0, 200) + '...';
    }

    return `🎉 ${eventName}

${shortDescription}${needsTruncation ? '\n\nอ่านเพิ่มเติม 👉' : ''}

เชิญชวนให้เข้าร่วมกิจกรรม
คลิกเพื่อดูรายละเอียดและลงทะเบียน:
${process.env.NEXT_PUBLIC_BASE_URL}/events/${eventId}`;
  }, [eventId, eventName, eventDescription]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">ส่งข้อความโปรโมทกิจกรรม</h2>
            <p className="text-sm text-gray-600 mt-1">{eventName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Message Preview */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">ตัวอย่างข้อความที่จะส่ง:</h3>
            <pre className="text-sm text-blue-800 whitespace-pre-wrap font-sans">{messagePreview}</pre>
          </div>

          {/* Success/Error Message */}
          {message && (
            <div
              className={`border rounded-lg p-4 ${
                message.type === 'success'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Search */}
          <div>
            <input
              type="text"
              placeholder="ค้นหาด้วยชื่อ, บริษัท, หรือ Member ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Member List */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMemberIds.size === filteredMembers.length && filteredMembers.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">เลือกทั้งหมด</span>
                </label>
                <span className="text-sm text-gray-600">
                  เลือกแล้ว {selectedMemberIds.size} / {filteredMembers.length} คน
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">กำลังโหลดรายชื่อสมาชิก...</p>
                </div>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {searchTerm ? 'ไม่พบสมาชิกที่ค้นหา' : 'ไม่มีสมาชิกที่สามารถส่งข้อความได้'}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {filteredMembers.map((member) => {
                  const isSelected = selectedMemberIds.has(member.lineUserId!);

                  return (
                    <label
                      key={member.lineUserId}
                      className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-blue-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(member.lineUserId!)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">
                            {member.lineDisplayName || member.fullNameTH || member.nickname || '-'}
                          </span>

                          {member.memberId && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              ID: {member.memberId}
                            </span>
                          )}
                        </div>

                        <div className="text-sm text-gray-600 mt-1">
                          LINE: {member.lineDisplayName || '-'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ยกเลิก
          </button>

          <button
            onClick={handleSend}
            disabled={sending || selectedMemberIds.size === 0}
            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>กำลังส่ง...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <span>ส่งข้อความ ({selectedMemberIds.size} คน)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
