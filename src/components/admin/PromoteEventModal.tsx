'use client';

import { useState, useEffect, useMemo } from 'react';
import { Member } from '@/types/member';

interface PromoteEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  eventDescription?: string;
  mainImageUrl?: string;
  registeredMembers?: Array<{
    lineUserId: string;
    contactName: string;
    companyName: string;
    lineDisplayName?: string;
  }>;
}

interface PromotionHistory {
  id: string;
  eventId: string;
  lineUserId: string;
  sentAt: string;
  sentBy: string;
  sentByName: string;
  messageType?: 'promote' | 'custom';
  subject?: string;
  message?: string;
  member: {
    memberId: string;
    fullNameTH?: string;
    companyNameTH?: string;
    lineDisplayName?: string;
  } | null;
}

export default function PromoteEventModal({
  isOpen,
  onClose,
  eventId,
  eventName,
  eventDescription = '',
  mainImageUrl = '',
  registeredMembers = [],
}: PromoteEventModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'select' | 'history'>('select');
  const [history, setHistory] = useState<PromotionHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sentLineUserIds, setSentLineUserIds] = useState<Set<string>>(new Set());
  const [messageHistoryByUser, setMessageHistoryByUser] = useState<Map<string, string[]>>(new Map());

  // NEW: Message mode - 'promote' or 'custom'
  const [messageMode, setMessageMode] = useState<'promote' | 'custom'>('promote');
  const [customMessage, setCustomMessage] = useState('');
  const [messageSubject, setMessageSubject] = useState('');
  const [textareaRef, setTextareaRef] = useState<HTMLTextAreaElement | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<Array<{subject: string; message: string}>>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [attachImage, setAttachImage] = useState(false); // Checkbox for attaching main image

  // Custom message image upload states
  const [customImageFile, setCustomImageFile] = useState<File | null>(null);
  const [customImagePreview, setCustomImagePreview] = useState<string | null>(null);
  const [customImageUrl, setCustomImageUrl] = useState<string>('');
  const [uploadingCustomImage, setUploadingCustomImage] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
      fetchHistory();
      loadTemplates();
      setSelectedMemberIds(new Set());
      setSearchTerm('');
      setMessage(null);
      setActiveTab('select');
      setMessageMode('promote'); // Reset to promote mode
      setCustomMessage(''); // Clear custom message
      setMessageSubject(''); // Clear subject
      setShowTemplates(false);
      setAttachImage(!!mainImageUrl); // Auto-check if image exists
      // Reset custom image states
      setCustomImageFile(null);
      setCustomImagePreview(null);
      setCustomImageUrl('');
    }
  }, [isOpen, eventId, mainImageUrl]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      const data = await response.json();

      // Filter members for LINE message sending with strict validation:
      // 1. Must have lineUserId (connected to LINE)
      // 2. Must have memberId (verified member)
      // 3. Must be active in Firestore (isActive !== false)
      // 4. Must have status 'ปกติ' in Google Sheets (Column R: สถานะ)
      // Note: lineGroupStatus (Column U) is NOT validated - all values allowed
      const filteredMembers = (data.users || []).filter((user: any) => {
        const hasLineUserId = !!user.lineUserId;
        const hasMemberId = !!user.memberId;
        const isActive = user.isActive !== false; // Default to true if not set
        const hasNormalStatus = user.memberStatus === 'ปกติ'; // Column R from Google Sheets

        return hasLineUserId && hasMemberId && isActive && hasNormalStatus;
      });

      console.log('Fetched members sample (first 3):', filteredMembers.slice(0, 3));
      console.log(`Total members after filtering: ${filteredMembers.length}`);
      setMembers(filteredMembers);
    } catch (error) {
      console.error('Error fetching members:', error);
      setMessage({ type: 'error', text: 'ไม่สามารถโหลดรายชื่อสมาชิกได้' });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch(`/api/line/promotion-history?eventId=${eventId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch history');
      }
      const data = await response.json();
      setHistory(data.history || []);

      // Create set of line user IDs who have been sent messages
      const sentIds = new Set<string>(data.history.map((h: PromotionHistory) => h.lineUserId));
      setSentLineUserIds(sentIds);

      // Create map of message history by user (lineUserId -> array of subjects)
      const historyMap = new Map<string, string[]>();
      data.history.forEach((h: PromotionHistory) => {
        const subjects = historyMap.get(h.lineUserId) || [];
        const subject = h.subject || (h.messageType === 'promote' ? '📢 โปรโมทกิจกรรม' : 'ข้อความกำหนดเอง');
        subjects.push(subject);
        historyMap.set(h.lineUserId, subjects);
      });
      setMessageHistoryByUser(historyMap);
    } catch (error) {
      console.error('Error fetching promotion history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Create set of registered member line user IDs for badge display
  const registeredLineUserIds = useMemo(() => {
    return new Set(registeredMembers.map(m => m.lineUserId));
  }, [registeredMembers]);

  // Filter and sort members
  const filteredMembers = useMemo(() => {
    let filtered = [...members];

    // Both modes show all verified members with LINE accounts
    // No filtering by messageMode - show all members in both promote and custom modes

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
  }, [members, searchTerm, messageMode, registeredLineUserIds]);

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

  // Load templates from localStorage
  const loadTemplates = () => {
    try {
      const stored = localStorage.getItem('lineMessageTemplates');
      if (stored) {
        setSavedTemplates(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  // Save current message as template
  const saveTemplate = () => {
    if (!messageSubject.trim() || !customMessage.trim()) {
      setMessage({ type: 'error', text: 'กรุณากรอกหัวข้อและข้อความก่อนบันทึก' });
      return;
    }

    const newTemplate = {
      subject: messageSubject,
      message: customMessage,
    };

    const updated = [...savedTemplates, newTemplate];
    setSavedTemplates(updated);

    try {
      localStorage.setItem('lineMessageTemplates', JSON.stringify(updated));
      setMessage({ type: 'success', text: 'บันทึกเทมเพลตสำเร็จ' });
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      console.error('Error saving template:', error);
      setMessage({ type: 'error', text: 'ไม่สามารถบันทึกเทมเพลตได้' });
    }
  };

  // Load template
  const loadTemplate = (template: {subject: string; message: string}) => {
    setMessageSubject(template.subject);
    setCustomMessage(template.message);
    setShowTemplates(false);
    setMessage({ type: 'success', text: 'โหลดเทมเพลตสำเร็จ' });
    setTimeout(() => setMessage(null), 2000);
  };

  // Delete template
  const deleteTemplate = (index: number) => {
    const updated = savedTemplates.filter((_, i) => i !== index);
    setSavedTemplates(updated);

    try {
      localStorage.setItem('lineMessageTemplates', JSON.stringify(updated));
      setMessage({ type: 'success', text: 'ลบเทมเพลตสำเร็จ' });
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      console.error('Error deleting template:', error);
      setMessage({ type: 'error', text: 'ไม่สามารถลบเทมเพลตได้' });
    }
  };

  // Handle custom image file selection
  const handleCustomImageSelect = (file: File | null) => {
    if (!file) {
      setCustomImageFile(null);
      setCustomImagePreview(null);
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'ประเภทไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ภาพ (JPEG, PNG, หรือ WebP)' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setMessage({ type: 'error', text: 'ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 5MB)' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    // Set file and create preview
    setCustomImageFile(file);
    const previewUrl = URL.createObjectURL(file);
    setCustomImagePreview(previewUrl);
    setCustomImageUrl(''); // Clear URL input when file is selected
  };

  // Remove custom image
  const handleRemoveCustomImage = () => {
    setCustomImageFile(null);
    setCustomImagePreview(null);
    setCustomImageUrl('');
  };

  // Insert personalization tag at cursor position
  const insertTag = (tag: string) => {
    if (!textareaRef) return;

    const start = textareaRef.selectionStart;
    const end = textareaRef.selectionEnd;
    const text = customMessage;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const newText = before + tag + after;

    setCustomMessage(newText);

    // Set cursor position after inserted tag
    setTimeout(() => {
      if (textareaRef) {
        textareaRef.focus();
        const newCursorPos = start + tag.length;
        textareaRef.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleSend = async () => {
    if (selectedMemberIds.size === 0) {
      setMessage({ type: 'error', text: 'กรุณาเลือกสมาชิกอย่างน้อย 1 คน' });
      return;
    }

    // Validate custom message
    if (messageMode === 'custom') {
      if (!messageSubject.trim()) {
        setMessage({ type: 'error', text: 'กรุณากรอกหัวข้อข้อความ' });
        return;
      }
      // Allow sending image only (without text message)
      if (!customMessage.trim() && !customImageFile && !customImageUrl) {
        setMessage({ type: 'error', text: 'กรุณากรอกข้อความหรือแนบรูปภาพอย่างน้อย 1 อย่าง' });
        return;
      }
    }

    try {
      setSending(true);
      setMessage(null);

      const memberIdsArray = Array.from(selectedMemberIds);

      // Upload custom image if file is selected (for custom mode)
      let uploadedCustomImageUrl = customImageUrl;
      if (messageMode === 'custom' && customImageFile) {
        try {
          setUploadingCustomImage(true);
          setMessage({ type: 'success', text: 'กำลังอัปโหลดรูปภาพ...' });

          const uploadFormData = new FormData();
          uploadFormData.append('image', customImageFile);

          const uploadResponse = await fetch('/api/upload-image', {
            method: 'POST',
            body: uploadFormData,
          });

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            console.error('Upload error:', errorData);
            throw new Error('ไม่สามารถอัปโหลดรูปภาพได้');
          }

          const uploadResult = await uploadResponse.json();
          uploadedCustomImageUrl = uploadResult.url;
          setMessage({ type: 'success', text: 'อัปโหลดรูปภาพสำเร็จ' });
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
          setMessage({ type: 'error', text: uploadError instanceof Error ? uploadError.message : 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ' });
          setSending(false);
          setUploadingCustomImage(false);
          return;
        } finally {
          setUploadingCustomImage(false);
        }
      }

      let response;

      if (messageMode === 'promote') {
        // Promote mode: Use existing promote-event API
        const eventUrl = `/events/`;
        response = await fetch('/api/line/promote-event', {
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
            attachImage: attachImage && mainImageUrl ? true : false,
            imageUrl: attachImage && mainImageUrl ? mainImageUrl : undefined,
          }),
        });
      } else {
        // Custom mode: Use send-notification API with personalization
        response = await fetch('/api/line/send-notification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lineUserIds: memberIdsArray,
            message: customMessage,
            subject: messageSubject,
            eventId,
            eventName,
            enablePersonalization: true,
            imageUrl: uploadedCustomImageUrl || undefined, // Include image URL if available
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send messages');
      }

      const result = await response.json();
      setMessage({ type: 'success', text: result.message || 'ส่งข้อความสำเร็จ' });

      // Reset selection after success
      setSelectedMemberIds(new Set());
      setCustomMessage('');
      setMessageSubject('');

      // Refresh history to include both promote and custom messages
      await fetchHistory();

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Error sending message:', error);
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
    const needsTruncation = shortDescription.length > 600;

    if (needsTruncation) {
      shortDescription = shortDescription.substring(0, 600) + '...';
    }

    return `🎉 ${eventName}

${shortDescription}${needsTruncation ? '\n\nอ่านเพิ่มเติม 👉' : ''}

เชิญชวนให้เข้าร่วมกิจกรรม
คลิกเพื่อดูรายละเอียดและลงทะเบียน:
${process.env.NEXT_PUBLIC_BASE_URL}/events/${encodeURIComponent(eventId)}`;
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
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">ส่งข้อความ LINE</h2>
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

          {/* Message Mode Selection */}
          {activeTab === 'select' && (
            <div className="mb-4 bg-gray-50 rounded-lg p-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">ประเภทข้อความ:</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setMessageMode('promote')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    messageMode === 'promote'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  📢 โปรโมทกิจกรรม
                </button>
                <button
                  onClick={() => setMessageMode('custom')}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    messageMode === 'custom'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  ✉️ ข้อความกำหนดเอง
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {messageMode === 'promote'
                  ? '• ส่งข้อความโปรโมทกิจกรรม (เนื้อหาคงที่) ให้สมาชิกที่เลือก'
                  : '• ส่งข้อความกำหนดเอง (แก้ไขได้) พร้อม personalization ให้สมาชิกที่เลือก'}
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('select')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === 'select'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              เลือกผู้รับ
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ประวัติการส่ง ({history.length})
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'history' ? (
            /* History Tab */
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">ประวัติการส่งข้อความ</h3>

              {loadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">กำลังโหลดประวัติ...</p>
                  </div>
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  ยังไม่มีประวัติการส่งข้อความสำหรับกิจกรรมนี้
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((record) => (
                    <div key={record.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="font-medium text-gray-900">
                              {record.member?.lineDisplayName || record.lineUserId}
                            </div>
                            {record.messageType && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                record.messageType === 'promote'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {record.messageType === 'promote' ? '📢 โปรโมท' : '✉️ กำหนดเอง'}
                              </span>
                            )}
                          </div>
                          {record.member?.companyNameTH && (
                            <div className="text-sm text-gray-600 mt-1">
                              {record.member.companyNameTH}
                            </div>
                          )}
                          {record.member?.memberId && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 mt-2">
                              ID: {record.member.memberId}
                            </span>
                          )}
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <div>{new Date(record.sentAt).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}</div>
                          <div className="text-xs mt-1">
                            {new Date(record.sentAt).toLocaleTimeString('th-TH', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Message Subject */}
                      {record.subject && (
                        <div className="bg-gray-50 border-l-4 border-blue-400 p-3 rounded">
                          <p className="text-xs text-gray-600 mb-1">หัวข้อ:</p>
                          <p className="text-sm font-semibold text-gray-900">{record.subject}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Select Members Tab */
            <>
              {/* Custom Message Input (only in custom mode) */}
              {messageMode === 'custom' && (
                <div className="bg-white border border-gray-300 rounded-lg p-4 space-y-4">
                  {/* Subject Field */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      หัวข้อข้อความ: <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={messageSubject}
                      onChange={(e) => setMessageSubject(e.target.value)}
                      placeholder="เช่น: แจ้งเปลี่ยนแปลงสถานที่จัดงาน, ขอบคุณที่ร่วมกิจกรรม..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                      maxLength={200}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {messageSubject.length}/200 ตัวอักษร
                    </p>
                  </div>

                  {/* Message Content */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      เนื้อหาข้อความ: <span className="text-red-500">*</span>
                    </label>

                    {/* Personalization Tags */}
                    <div className="mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        แทรก Personalization Tags:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'ชื่อ LINE', tag: '{LINE_NAME}', color: 'purple' },
                          { label: 'ชื่อติดต่อ', tag: '{CONTACT_NAME}', color: 'blue' },
                          { label: 'ชื่อบริษัท', tag: '{COMPANY_NAME}', color: 'green' },
                          { label: 'Link กิจกรรม', tag: '{EVENT_URL}', color: 'orange' },
                          { label: 'ชื่อกิจกรรม', tag: '{EVENT_NAME}', color: 'pink' }
                        ].map(({ label, tag, color }) => {
                          const colors = {
                            purple: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-300',
                            blue: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300',
                            green: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-300',
                            orange: 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-300',
                            pink: 'bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-300'
                          };
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => insertTag(tag)}
                              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${colors[color as keyof typeof colors]}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-blue-700 mt-2">
                        💡 คลิกปุ่มเพื่อแทรก tag ลงในข้อความ - ระบบจะแทนที่ด้วยข้อมูลจริงของแต่ละคนเมื่อส่ง
                      </p>
                    </div>

                    <textarea
                      ref={(el) => setTextareaRef(el)}
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="พิมพ์ข้อความที่ต้องการส่ง... (สามารถใช้ personalization tags ด้านบนได้)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[150px] font-sans"
                      maxLength={5000}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {customMessage.length}/5000 ตัวอักษร
                    </p>
                  </div>

                  {/* Image Upload Section */}
                  <div className="pt-3 border-t border-gray-200">
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      แนบรูปภาพ (ไม่บังคับ)
                    </label>

                    {/* Image Preview */}
                    {(customImagePreview || customImageUrl) && (
                      <div className="mb-3 relative inline-block">
                        <img
                          src={customImagePreview || customImageUrl}
                          alt="Custom message image"
                          className="max-w-xs max-h-48 rounded border border-gray-300 shadow-sm"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleRemoveCustomImage}
                          className="absolute -top-2 -right-2 p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors shadow-lg"
                          title="ลบรูปภาพ"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* File Input */}
                    {!customImagePreview && !customImageUrl && (
                      <div>
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            handleCustomImageSelect(file);
                          }}
                          className="hidden"
                          id="custom-image-upload"
                          disabled={uploadingCustomImage}
                        />
                        <label
                          htmlFor="custom-image-upload"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer text-sm font-medium border border-gray-300"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          เลือกรูปภาพ
                        </label>
                        <p className="text-xs text-gray-500 mt-2">
                          รองรับ: JPEG, PNG, WebP (ไม่เกิน 5MB)
                        </p>
                      </div>
                    )}

                    {/* Optional URL Input */}
                    {!customImageFile && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          หรือใส่ URL รูปภาพ (HTTPS เท่านั้น)
                        </label>
                        <input
                          type="url"
                          value={customImageUrl}
                          onChange={(e) => setCustomImageUrl(e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* Template Management */}
                  <div className="flex gap-2 pt-3 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={saveTemplate}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      บันทึกเทมเพลต
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowTemplates(!showTemplates)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      </svg>
                      เทมเพลตที่บันทึก ({savedTemplates.length})
                    </button>
                  </div>

                  {/* Saved Templates List */}
                  {showTemplates && savedTemplates.length > 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">เทมเพลตที่บันทึก</h4>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {savedTemplates.map((template, index) => (
                          <div key={index} className="bg-white border border-gray-200 rounded p-3 hover:shadow-sm transition-shadow">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 cursor-pointer" onClick={() => loadTemplate(template)}>
                                <p className="font-medium text-gray-900 text-sm mb-1">{template.subject}</p>
                                <p className="text-xs text-gray-600 line-clamp-2">{template.message}</p>
                              </div>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => loadTemplate(template)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="โหลดเทมเพลต"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTemplate(index)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="ลบเทมเพลต"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {showTemplates && savedTemplates.length === 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500 text-sm">
                      ยังไม่มีเทมเพลตที่บันทึก
                    </div>
                  )}
                </div>
              )}

              {/* Attach Image Checkbox (only for promote mode when mainImageUrl exists) */}
              {messageMode === 'promote' && mainImageUrl && (
                <div className="bg-white border border-gray-300 rounded-lg p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attachImage}
                      onChange={(e) => setAttachImage(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-semibold text-gray-900">แนบรูปภาพกิจกรรม</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          แนะนำ
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mb-2">
                        แนบรูป main image ของกิจกรรมไปกับข้อความประชาสัมพันธ์ เพื่อดึงดูดความสนใจและให้ข้อมูลมากขึ้น
                      </p>
                      {attachImage && (
                        <div className="mt-2">
                          <img
                            src={mainImageUrl}
                            alt="Event Main Image"
                            className="max-w-xs max-h-32 rounded border border-gray-300 shadow-sm"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              )}

              {/* Message Preview */}
              <div className={`border rounded-lg p-4 ${
                messageMode === 'promote' ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'
              }`}>
                <h3 className={`text-sm font-semibold mb-2 ${
                  messageMode === 'promote' ? 'text-purple-900' : 'text-blue-900'
                }`}>
                  ตัวอย่างข้อความที่จะส่ง:
                </h3>
                {messageMode === 'custom' && messageSubject && (
                  <div className="mb-2 pb-2 border-b border-blue-300">
                    <p className="text-xs text-blue-700 font-medium mb-1">หัวข้อ:</p>
                    <p className="text-sm font-semibold text-blue-900">{messageSubject}</p>
                  </div>
                )}
                <pre className={`text-sm whitespace-pre-wrap font-sans ${
                  messageMode === 'promote' ? 'text-purple-800' : 'text-blue-800'
                }`}>
                  {messageMode === 'promote'
                    ? messagePreview
                    : (customMessage
                      ? customMessage
                          .replace(/{LINE_NAME}/g, '[ชื่อ LINE ของสมาชิก]')
                          .replace(/{CONTACT_NAME}/g, '[ชื่อติดต่อ]')
                          .replace(/{COMPANY_NAME}/g, '[ชื่อบริษัท]')
                          .replace(/{EVENT_URL}/g, `${process.env.NEXT_PUBLIC_BASE_URL}/events/${encodeURIComponent(eventId)}`)
                          .replace(/{EVENT_NAME}/g, eventName)
                      : '(ยังไม่ได้กรอกข้อความ)')}
                </pre>
                {messageMode === 'custom' && (customMessage.includes('{LINE_NAME}') || customMessage.includes('{CONTACT_NAME}') || customMessage.includes('{COMPANY_NAME}')) && (
                  <p className="text-xs text-blue-600 mt-2 italic">
                    💡 ข้อความจะถูกปรับแต่งตามข้อมูลของแต่ละคนเมื่อส่ง
                  </p>
                )}
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
                  <span className="text-sm font-medium text-gray-700">
                    เลือกทั้งหมด
                  </span>
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

                          {member.companyNameTH && (
                            <span className="text-sm text-gray-600">
                              - {member.companyNameTH}
                            </span>
                          )}

                          {member.memberId && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              ID: {member.memberId}
                            </span>
                          )}

                          {registeredLineUserIds.has(member.lineUserId!) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                              📋 สมัครแล้ว
                            </span>
                          )}

                          {sentLineUserIds.has(member.lineUserId!) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              ✓ ส่งแล้ว
                            </span>
                          )}
                        </div>

                        {/* Show message history for this user */}
                        {messageHistoryByUser.has(member.lineUserId!) && (
                          <div className="mt-2 text-xs text-gray-600">
                            <span className="font-medium">เคยส่ง: </span>
                            {messageHistoryByUser.get(member.lineUserId!)!.map((subject, idx) => (
                              <span key={idx}>
                                {idx > 0 && ', '}
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                                  {subject}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
            </>
          )}
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
