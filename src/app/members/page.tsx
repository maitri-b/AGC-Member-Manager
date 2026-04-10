'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Member, parseThaiDate } from '@/types/member';
import Navbar from '@/components/Navbar';
import { Toast, useToast } from '@/components/Toast';
import { hasPermission } from '@/lib/permissions';

// Extended Member type with LINE profile from Firestore
interface MemberWithProfile extends Member {
  lineProfile?: {
    lineDisplayName: string;
    lineProfilePicture: string;
  } | null;
}

// Contact Request types
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
  contactDate: string;
  status: 'pending' | 'completed';
  createdAt: string;
  createdBy: string;
  createdByName: string;
  resolution?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
}

interface StaffMember {
  id: string;
  lineDisplayName: string;
  lineProfilePicture?: string;
  role: string;
}

// Attendance status type
interface AttendanceStatus {
  memberId: string;
  hasRecentActivity: boolean;
  eventsLast12Months: number;
}

type ContactTopic = 'license_expired' | 'inactive_member' | 'complaint' | 'line_not_found' | 'other';

const CONTACT_TOPICS: { value: ContactTopic; label: string }[] = [
  { value: 'license_expired', label: 'ใบอนุญาตหมดอายุ/ถูกเพิกถอน' },
  { value: 'inactive_member', label: 'สมาชิกไม่ได้เข้าร่วมกิจกรรม/ขาดการติดต่อ' },
  { value: 'complaint', label: 'แจ้งข้อร้องเรียนระหว่างสมาชิก' },
  { value: 'line_not_found', label: 'ไม่พบข้อมูลไลน์ของสมาชิก' },
  { value: 'other', label: 'อื่นๆ' },
];

// Thai month names (full) for notification messages
const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// Format date for notification messages (outside component)
// Google Sheet uses MM/DD/YYYY format (US format)
function formatThaiDateForMessage(dateStr: string | undefined): string {
  if (!dateStr) return '-';

  try {
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        // Google Sheet uses MM/DD/YYYY (US format)
        const [month, day, year] = parts.map(Number);
        // Convert Buddhist year to Gregorian if needed
        const gregorianYear = year > 2500 ? year - 543 : year;

        return `${day} ${THAI_MONTHS_FULL[month - 1]} ${gregorianYear}`;
      }
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Notification Modal Component
function NotificationModal({
  member,
  onClose,
  onSend,
  sending,
}: {
  member: Member;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  const message = `สวัสดีครับ คุณ${member.fullNameTH || member.nickname || ''}
บริษัท ${member.companyNameTH || member.companyNameEN || ''}

ทางทีมทะเบียนชมรม Agents Club ตรวจพบว่า
ใบอนุญาตธุรกิจนำเที่ยว เลขที่ ${member.licenseNumber || '-'}
มีสถานะ ${member.status || '-'} (หมดอายุ ${formatThaiDateForMessage(member.licenseExpiry)})

หากคุณได้ต่ออายุใบอนุญาตแล้ว หรือมีข้อมูลที่อัพเดท
รบกวนส่งสำเนาใบอนุญาตใหม่มาทาง LINE นี้ด้วยนะครับ

เนื่องจากนโยบายของชมรม อนุญาตให้เฉพาะสมาชิกที่มีใบอนุญาตที่ยังไม่หมดอายุอยู่ในกลุ่ม
หากไม่ได้รับการติดต่อกลับ ทางทีมทะเบียนจะขอนำชื่อออกจาก LINE กลุ่มไว้ก่อนนะครับ

ถ้าทีมทะเบียนได้รับข้อมูลอัพเดทและตรวจสอบเรียบร้อยแล้ว
ทีมงานจะนำกลับเข้ากลุ่มให้ทันทีครับ

ขอบคุณครับ
ไมตรี บุญกิจรุ่งไพศาล
ทีมทะเบียนชมรม Agents Club`;

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">แจ้งเตือนสมาชิก</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-sm text-gray-700 font-mono">
            {message}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-md flex items-center gap-2 ${
              copied
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                คัดลอกแล้ว
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                คัดลอกข้อความ
              </>
            )}
          </button>

          {member.lineUserId && (
            <button
              onClick={onSend}
              disabled={sending}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {sending ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังส่ง...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                  </svg>
                  ส่ง LINE แจ้ง
                </>
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

// Contact Modal Component
function ContactModal({
  member,
  onClose,
  staffList,
  onSuccess,
}: {
  member: MemberWithProfile;
  onClose: () => void;
  staffList: StaffMember[];
  onSuccess: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [showNewForm, setShowNewForm] = useState(false);
  const [contacts, setContacts] = useState<{ pending: ContactRequest[]; completed: ContactRequest[] }>({ pending: [], completed: [] });
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [saving, setSaving] = useState(false);

  // New contact form state
  const [selectedTopic, setSelectedTopic] = useState<ContactTopic | ''>('');
  const [message, setMessage] = useState('');
  const [complaintAgainst, setComplaintAgainst] = useState('');
  const [complaintCompany, setComplaintCompany] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [contactDate, setContactDate] = useState(new Date().toISOString().split('T')[0]);
  const [waitForResponse, setWaitForResponse] = useState(false); // For "other" topic checkbox

  // Resolution form state
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [resolvedById, setResolvedById] = useState('');
  const [resolvedLineStatus, setResolvedLineStatus] = useState<string>('');

  const [copied, setCopied] = useState(false);

  // Fetch contacts for this member
  useEffect(() => {
    fetchContacts();
  }, [member.memberId]);

  const fetchContacts = async () => {
    setLoadingContacts(true);
    try {
      const response = await fetch(`/api/admin/contacts?memberId=${member.memberId}`);
      if (response.ok) {
        const data = await response.json();
        setContacts({ pending: data.pending || [], completed: data.completed || [] });
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
    } finally {
      setLoadingContacts(false);
    }
  };

  // Generate message based on topic
  const generateMessage = (topic: ContactTopic) => {
    const nickname = member.nickname || member.fullNameTH || '';
    const companyName = member.companyNameTH || member.companyNameEN || '';

    switch (topic) {
      case 'license_expired':
        return `สวัสดีครับ คุณ${nickname}
บริษัท ${companyName}

ทางทีมทะเบียนชมรม Agents Club ตรวจพบว่า
ใบอนุญาตธุรกิจนำเที่ยว เลขที่ ${member.licenseNumber || '-'}
มีสถานะ ${member.status || '-'} (หมดอายุ ${formatThaiDateForMessage(member.licenseExpiry)})

หากคุณได้ต่ออายุใบอนุญาตแล้ว หรือมีข้อมูลที่อัพเดท
รบกวนส่งสำเนาใบอนุญาตใหม่มาทาง LINE นี้ด้วยนะครับ

เนื่องจากนโยบายของชมรม อนุญาตให้เฉพาะสมาชิกที่มีใบอนุญาตที่ยังไม่หมดอายุอยู่ในกลุ่ม
หากไม่ได้รับการติดต่อกลับ ทางทีมทะเบียนจะขอนำชื่อออกจาก LINE กลุ่มไว้ก่อนนะครับ

ถ้าทีมทะเบียนได้รับข้อมูลอัพเดทและตรวจสอบเรียบร้อยแล้ว
ทางทีมงานจะนำกลับเข้ากลุ่มให้ทันทีครับ

ขอบคุณครับ
ทีมทะเบียนชมรม Agents Club`;

      case 'inactive_member':
        return `สวัสดีครับ คุณ${nickname}
บริษัท ${companyName}

ทางชมรม Agents Club พบว่าท่านไม่ได้เข้าร่วมกิจกรรมของชมรมมาเกิน 12 เดือนแล้ว

เราอยากทราบว่าท่านยังประกอบธุรกิจนำเที่ยวอยู่หรือไม่
และยังสนใจเข้าร่วมกิจกรรมกับชมรมอยู่มั้ยครับ

ชมรม Agents Club เน้นการมีส่วนร่วมของสมาชิก
การไม่เข้าร่วมกิจกรรมเป็นเวลานานจะมีผลต่อการอยู่ในกลุ่ม LINE ของชมรม

รบกวนตอบกลับมาทาง LINE นี้ด้วยนะครับ

ขอบคุณครับ
ทีมทะเบียนชมรม Agents Club`;

      case 'complaint':
        return `เรียนคุณ${nickname} ${companyName}

ทางคณะกรรมการ ได้รับการร้องเรียนจากสมาชิกของชมรม ${complaintAgainst || '[ชื่อคู่กรณี]'} (${complaintCompany || '[บริษัทคู่กรณี]'}) ตามหนังสือที่แนบมาด้วย

ทางชมรมจึงขอให้สมาชิกได้เคลียร์กันให้เรียบร้อยตามที่มีเรื่องร้องเรียนมา หรือสามารถชี้แจงมาที่คณะกรรมการของชมรมได้ครับ

ในกรณีที่ไม่สามารถเคลียร์กันได้ ทางคณะกรรมการและทีมทะเบียนจะต้องนำท่านออกจากห้องชมรมก่อน

เมื่อเคลียร์กันเรียบร้อยแล้ว ทางทีมทะเบียนจะนำ LINE ของท่านกลับมาในห้องไลน์กลุ่มชมรมอีกครั้ง

#คณะกรรมการชมรม Agents Club`;

      case 'line_not_found':
        return `สวัสดีครับ คุณ${nickname}
บริษัท ${companyName}

ทางทีมทะเบียนชมรม Agents Club ไม่พบไลน์ที่ท่านเคยลงทะเบียนไว้ในกลุ่มชมรม

ไม่ทราบว่า:
- ท่านยังอยู่ในกลุ่มอยู่หรือไม่
- มีการเปลี่ยนชื่อไลน์หรือไม่
- หรือมีการเปลี่ยนตัว LINE Account ที่เข้าร่วมหรือไม่

รบกวนช่วยอัพเดทข้อมูลให้ทีมทะเบียนด้วยนะครับ
เพื่อทางทีมจะได้อัพเดทในระบบต่อไป

ขอบคุณครับ
ทีมทะเบียนชมรม Agents Club`;

      case 'other':
      default:
        return '';
    }
  };

  // Update message when topic or complaint fields change
  // Clear message when switching topics or going back to default
  useEffect(() => {
    if (selectedTopic && selectedTopic !== 'other') {
      setMessage(generateMessage(selectedTopic));
    } else {
      // Clear message when topic is empty or 'other'
      setMessage('');
    }
    // Reset waitForResponse when topic changes
    if (selectedTopic !== 'other') {
      setWaitForResponse(false);
    }
  }, [selectedTopic, complaintAgainst, complaintCompany]);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleSubmit = async () => {
    if (!selectedTopic || !message || !assigneeId) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    setSaving(true);
    try {
      const selectedStaff = staffList.find(s => s.id === assigneeId);
      const response = await fetch('/api/admin/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.memberId,
          memberName: member.nickname || member.fullNameTH || '',
          memberCompany: member.companyNameTH || member.companyNameEN || '',
          topic: selectedTopic,
          topicLabel: CONTACT_TOPICS.find(t => t.value === selectedTopic)?.label || '',
          message,
          complaintAgainst: selectedTopic === 'complaint' ? complaintAgainst : null,
          complaintCompany: selectedTopic === 'complaint' ? complaintCompany : null,
          assigneeId,
          assigneeName: selectedStaff?.lineDisplayName || '',
          contactDate,
          previousLineStatus: member.lineGroupStatus,
          updateLineStatus: selectedTopic === 'other' ? waitForResponse : true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create contact');
      }

      // Reset form and refresh
      setShowNewForm(false);
      setSelectedTopic('');
      setMessage('');
      setComplaintAgainst('');
      setComplaintCompany('');
      setAssigneeId('');
      setWaitForResponse(false);
      fetchContacts();
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async () => {
    if (!resolvingId || !resolution) {
      alert('กรุณากรอกผลการดำเนินการ');
      return;
    }

    if (!resolvedLineStatus) {
      alert('กรุณาเลือกผลสถานะไลน์');
      return;
    }

    setSaving(true);
    try {
      const selectedStaff = staffList.find(s => s.id === resolvedById);
      const response = await fetch('/api/admin/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: resolvingId,
          resolution,
          resolvedById: resolvedById || undefined,
          resolvedByName: selectedStaff?.lineDisplayName || '',
          memberId: member.memberId,
          resolvedLineStatus,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resolve contact');
      }

      setResolvingId(null);
      setResolution('');
      setResolvedById('');
      setResolvedLineStatus('');
      fetchContacts();
      onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">ติดต่อสมาชิก</h3>
            <p className="text-sm text-gray-500">{member.nickname || member.fullNameTH} - {member.companyNameTH || member.companyNameEN}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => { setActiveTab('pending'); setShowNewForm(false); setResolvingId(null); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'pending' && !showNewForm ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            กำลังดำเนินการ ({contacts.pending.length})
          </button>
          <button
            onClick={() => { setActiveTab('completed'); setShowNewForm(false); setResolvingId(null); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${activeTab === 'completed' && !showNewForm ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            เสร็จสิ้น ({contacts.completed.length})
          </button>
          <button
            onClick={() => { setShowNewForm(true); setResolvingId(null); }}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${showNewForm ? 'bg-blue-100 text-blue-700' : 'text-blue-600 hover:bg-blue-50'}`}
          >
            + สร้างการติดต่อใหม่
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {showNewForm ? (
            /* New Contact Form */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หัวข้อเรื่อง *</label>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value as ContactTopic)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกหัวข้อ...</option>
                  {CONTACT_TOPICS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Complaint-specific fields */}
              {selectedTopic === 'complaint' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อคู่กรณี *</label>
                    <input
                      type="text"
                      value={complaintAgainst}
                      onChange={(e) => setComplaintAgainst(e.target.value)}
                      placeholder="ชื่อผู้ร้องเรียน"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">บริษัทคู่กรณี *</label>
                    <input
                      type="text"
                      value={complaintCompany}
                      onChange={(e) => setComplaintCompany(e.target.value)}
                      placeholder="ชื่อบริษัทผู้ร้องเรียน"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ข้อความ *</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={8}
                  placeholder={selectedTopic === 'other' ? 'พิมพ์ข้อความที่ต้องการส่ง...' : 'ข้อความจะถูกสร้างอัตโนมัติ'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                />
                <button
                  onClick={handleCopyMessage}
                  className={`mt-2 px-3 py-1.5 rounded-md text-sm flex items-center gap-1 ${copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      คัดลอกแล้ว
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy ข้อความ
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ผู้รับผิดชอบ *</label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">เลือกผู้รับผิดชอบ...</option>
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.lineDisplayName} ({s.role === 'admin' ? 'Admin' : 'Committee'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ติดต่อ *</label>
                  <input
                    type="date"
                    value={contactDate}
                    onChange={(e) => setContactDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Checkbox for 'other' topic */}
              {selectedTopic === 'other' && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="waitForResponse"
                    checked={waitForResponse}
                    onChange={(e) => setWaitForResponse(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="waitForResponse" className="text-sm text-gray-700">
                    ตั้งสถานะ &quot;รอผลการติดต่อ&quot; (เรื่องที่ต้องรอผลดำเนินการ)
                  </label>
                </div>
              )}

              {/* Note about LINE status change */}
              {selectedTopic && (selectedTopic !== 'other' || waitForResponse) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                  <p className="text-sm text-yellow-800">
                    <strong>หมายเหตุ:</strong> เมื่อบันทึก สถานะไลน์ของสมาชิกจะถูกเปลี่ยนเป็น &quot;รอผลการติดต่อ&quot;
                  </p>
                </div>
              )}
            </div>
          ) : resolvingId ? (
            /* Resolution Form */
            <div className="space-y-4">
              <h4 className="font-medium text-gray-900">สรุปผลดำเนินการ</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ผลการดำเนินการ *</label>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={4}
                  placeholder="สรุปผลการติดต่อ..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* LINE Status Radio Buttons */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ผลสถานะไลน์ *</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resolvedLineStatus"
                      value="ปกติ"
                      checked={resolvedLineStatus === 'ปกติ'}
                      onChange={(e) => setResolvedLineStatus(e.target.value)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">ปกติ</span>
                    <span className="text-xs text-gray-500">(อยู่ในกลุ่ม LINE ตามปกติ)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resolvedLineStatus"
                      value="รอผลการติดต่อ"
                      checked={resolvedLineStatus === 'รอผลการติดต่อ'}
                      onChange={(e) => setResolvedLineStatus(e.target.value)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">รอผลการติดต่อ</span>
                    <span className="text-xs text-gray-500">(ยังติดต่อไม่ได้/รอการตอบกลับ)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="resolvedLineStatus"
                      value="ออกจากกลุ่มแล้ว"
                      checked={resolvedLineStatus === 'ออกจากกลุ่มแล้ว'}
                      onChange={(e) => setResolvedLineStatus(e.target.value)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">ออกจากกลุ่มแล้ว</span>
                    <span className="text-xs text-gray-500">(นำออกจากกลุ่ม LINE แล้ว)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ผู้สรุปผล</label>
                <select
                  value={resolvedById}
                  onChange={(e) => setResolvedById(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกผู้สรุปผล (หรือใช้ตัวเอง)</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.lineDisplayName} ({s.role === 'admin' ? 'Admin' : 'Committee'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            /* Contact List */
            <div className="space-y-3">
              {loadingContacts ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-gray-500 text-sm">กำลังโหลด...</p>
                </div>
              ) : (activeTab === 'pending' ? contacts.pending : contacts.completed).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {activeTab === 'pending' ? 'ไม่มีเรื่องที่กำลังดำเนินการ' : 'ไม่มีเรื่องที่เสร็จสิ้น'}
                </div>
              ) : (
                (activeTab === 'pending' ? contacts.pending : contacts.completed).map(c => (
                  <div key={c.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-sm font-medium text-gray-900">{c.topicLabel}</span>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span>วันที่: {formatDate(c.contactDate)}</span>
                          <span>•</span>
                          <span>ผู้รับผิดชอบ: {c.assigneeName}</span>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        {c.status === 'pending' ? 'กำลังดำเนินการ' : 'เสร็จสิ้น'}
                      </span>
                    </div>
                    <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {c.message}
                    </div>
                    {c.resolution && (
                      <div className="mt-2 p-3 bg-green-50 rounded text-sm text-green-800">
                        <strong>ผลดำเนินการ:</strong> {c.resolution}
                        <div className="text-xs text-green-600 mt-1">
                          โดย {c.resolvedByName} เมื่อ {formatDate(c.resolvedAt || '')}
                        </div>
                      </div>
                    )}
                    {c.status === 'pending' && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => { setResolvingId(c.id); setResolution(''); setResolvedById(''); setResolvedLineStatus(''); }}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                        >
                          สรุปผล
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {(showNewForm || resolvingId) && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={() => { setShowNewForm(false); setResolvingId(null); }}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={showNewForm ? handleSubmit : handleResolve}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : showNewForm ? 'บันทึกการติดต่อ' : 'บันทึกผลดำเนินการ'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MembersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [allMembers, setAllMembers] = useState<MemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLineStatus, setFilterLineStatus] = useState('');
  const [filterExpiry, setFilterExpiry] = useState('');
  const [notifyMember, setNotifyMember] = useState<MemberWithProfile | null>(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const toast = useToast();

  // Contact Modal state
  const [contactMember, setContactMember] = useState<MemberWithProfile | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);

  // Action menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Copy state
  const [copiedIds, setCopiedIds] = useState(false);

  // Attendance status state
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user) {
      // Check if user has permission to view members list
      if (!hasPermission(session.user.permissions || [], 'members:list')) {
        router.push('/unauthorized');
      }
    }
  }, [status, session, router]);

  useEffect(() => {
    if (session?.user && hasPermission(session.user.permissions || [], 'members:list')) {
      fetchAllMembers();
      fetchStaff();
      // Fetch attendance in the background - don't block page load
      fetchAttendanceStatus();
    }
  }, [session]);

  // Fetch staff list for contact modal
  const fetchStaff = async () => {
    try {
      const response = await fetch('/api/admin/staff');
      if (response.ok) {
        const data = await response.json();
        setStaffList(data.staff || []);
      }
    } catch (err) {
      console.error('Error fetching staff:', err);
    }
  };

  const fetchAllMembers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/members');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch members');
      }
      const data = await response.json();
      setAllMembers(data.members);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // Fetch attendance status for all members
  const fetchAttendanceStatus = async () => {
    setLoadingAttendance(true);
    try {
      const response = await fetch('/api/members/attendance');
      if (response.ok) {
        const data = await response.json();
        setAttendanceMap(data.attendance || {});
      }
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  // Calculate all unique LINE statuses (excluding unwanted options)
  const allLineStatuses = useMemo(() => {
    const excludedStatuses = ['ยกเลิกข้อมูล/ลงทะเบียนใหม่แล้ว', 'ข้อมูลซ้ำ'];
    const lineStatuses = [...new Set(allMembers.map((m) => m.lineGroupStatus).filter(Boolean))] as string[];
    return lineStatuses
      .filter(s => !excludedStatuses.includes(s))
      .sort();
  }, [allMembers]);

  // Thai month names (abbreviated)
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // Format date to Thai format with Gregorian year: "3 มี.ค. 2027"
  const formatThaiDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    const date = parseThaiDate(dateStr);
    if (!date) return dateStr;

    const day = date.getDate();
    const month = thaiMonths[date.getMonth()];
    const year = date.getFullYear(); // Gregorian year (ค.ศ.)

    return `${day} ${month} ${year}`;
  };

  // Check if date is expired
  const isExpired = (dateStr: string): boolean => {
    if (!dateStr) return false;
    const date = parseThaiDate(dateStr);
    if (!date) return false;
    return date < new Date();
  };

  // Helper to check license expiry - using licenseExpiry field which maps to column S (วันหมดอายุ)
  const getLicenseExpiryStatus = (member: Member): 'expired' | 'within45' | 'within90' | 'ok' | 'unknown' => {
    // Use licenseExpiry (column S - วันหมดอายุ) for license expiry filtering
    const dateStr = member.licenseExpiry;
    if (!dateStr) return 'unknown';
    const expiry = parseThaiDate(dateStr);
    if (!expiry) return 'unknown';

    const today = new Date();
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired';
    if (diffDays <= 45) return 'within45';
    if (diffDays <= 90) return 'within90';
    return 'ok';
  };

  // Filter members based on all criteria
  const filteredMembers = useMemo(() => {
    const filtered = allMembers.filter((member) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const searchMatch =
          member.memberId?.toLowerCase().includes(searchLower) ||
          member.fullNameTH?.toLowerCase().includes(searchLower) ||
          member.nickname?.toLowerCase().includes(searchLower) ||
          member.companyNameEN?.toLowerCase().includes(searchLower) ||
          member.companyNameTH?.toLowerCase().includes(searchLower) ||
          member.mobile?.includes(search) ||
          member.phone?.includes(search) ||
          member.licenseNumber?.toLowerCase().includes(searchLower);
        if (!searchMatch) return false;
      }

      // Status filter
      if (filterStatus) {
        if (filterStatus === 'ปกติ') {
          // Show only "ปกติ" status
          if (member.status !== 'ปกติ') return false;
        } else if (filterStatus === '__not_normal__') {
          // Show all statuses except "ปกติ"
          if (member.status === 'ปกติ') return false;
        } else if (member.status !== filterStatus) {
          return false;
        }
      }

      // LINE status filter
      if (filterLineStatus) {
        if (filterLineStatus === 'อยู่ในกลุ่ม') {
          if (!(member.lineGroupStatus === 'อยู่ในกลุ่ม' || member.lineGroupStatus?.includes('อยู่'))) return false;
        } else if (filterLineStatus === 'ออกจากกลุ่ม') {
          if (!(member.lineGroupStatus === 'ออกจากกลุ่ม' || member.lineGroupStatus?.includes('ออก'))) return false;
        } else if (member.lineGroupStatus !== filterLineStatus) {
          return false;
        }
      }

      // Expiry filter
      if (filterExpiry) {
        const expiryStatus = getLicenseExpiryStatus(member);
        if (filterExpiry === 'expired' && expiryStatus !== 'expired') return false;
        // within45 = expiring in 0-45 days from today (not expired yet)
        if (filterExpiry === 'within45' && expiryStatus !== 'within45') return false;
        // within90 = expiring in 0-90 days from today (includes within45, not expired yet)
        if (filterExpiry === 'within90' && expiryStatus !== 'within90' && expiryStatus !== 'within45') return false;
      }

      return true;
    });

    // Sort: "รอนำเข้า" first (by lineGroupJoinDate oldest to newest), then by MemberID
    return filtered.sort((a, b) => {
      const aIsPending = a.status === 'รอนำเข้า';
      const bIsPending = b.status === 'รอนำเข้า';

      // Both are "รอนำเข้า" - sort by lineGroupJoinDate (oldest first)
      if (aIsPending && bIsPending) {
        const dateA = parseThaiDate(a.lineGroupJoinDate);
        const dateB = parseThaiDate(b.lineGroupJoinDate);
        if (dateA && dateB) {
          return dateA.getTime() - dateB.getTime(); // oldest first
        }
        // If one has date and other doesn't, prioritize the one with date
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
        // If neither has date, sort by memberId as number (high to low)
        const numA = parseInt(a.memberId || '0', 10);
        const numB = parseInt(b.memberId || '0', 10);
        return numB - numA;
      }

      // "รอนำเข้า" comes first
      if (aIsPending && !bIsPending) return -1;
      if (!aIsPending && bIsPending) return 1;

      // Neither is "รอนำเข้า" - sort by MemberID as number (high to low)
      const numA = parseInt(a.memberId || '0', 10);
      const numB = parseInt(b.memberId || '0', 10);
      return numB - numA; // descending (high to low)
    });
  }, [allMembers, search, filterStatus, filterLineStatus, filterExpiry]);

  const handleClearFilters = () => {
    setSearch('');
    setFilterStatus('');
    setFilterLineStatus('');
    setFilterExpiry('');
  };

  const handleSendNotification = async () => {
    if (!notifyMember) return;

    setSendingNotification(true);
    try {
      const response = await fetch('/api/line/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: notifyMember.memberId }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send notification');
      }
      toast.success(`ส่งแจ้งเตือนไปยัง ${notifyMember.nickname || notifyMember.fullNameTH} เรียบร้อยแล้ว`);
      setNotifyMember(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งแจ้งเตือน');
    } finally {
      setSendingNotification(false);
    }
  };

  // Check if status is not normal
  const isStatusNotNormal = (status: string | undefined) => {
    if (!status) return false;
    const normalStatuses = ['ปกติ', 'active', 'Active'];
    return !normalStatuses.includes(status);
  };

  // Handle copy member IDs
  const handleCopyMemberIds = async () => {
    const ids = filteredMembers.map(m => m.memberId).filter(Boolean).join(',');
    try {
      await navigator.clipboard.writeText(ids);
      setCopiedIds(true);
      toast.success(`คัดลอก ${filteredMembers.length} รหัสสมาชิกแล้ว`);
      setTimeout(() => setCopiedIds(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('ไม่สามารถคัดลอกได้');
    }
  };

  // Handle click outside menu to close it
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openMenuId && !(e.target as Element).closest('.action-menu')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openMenuId]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    // Total registered members
    const totalMembers = allMembers.length;

    // Members with normal LINE status (column U: ปกติ or อยู่ในกลุ่ม)
    const normalLineStatusCount = allMembers.filter(
      (m) => m.lineGroupStatus === 'ปกติ' || m.lineGroupStatus === 'อยู่ในกลุ่ม' || m.lineGroupStatus?.includes('อยู่')
    ).length;

    // Members who have verified identity (have lineUserId)
    const verifiedMembersCount = allMembers.filter((m) => m.lineUserId).length;

    // Verified members with normal license status (column R: ปกติ)
    const verifiedWithNormalLicenseCount = allMembers.filter(
      (m) => m.lineUserId && m.status === 'ปกติ'
    ).length;

    return {
      totalMembers,
      normalLineStatusCount,
      verifiedMembersCount,
      verifiedWithNormalLicenseCount,
    };
  }, [allMembers]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">รายชื่อสมาชิก</h1>
          <p className="text-gray-600 mt-1">สมาชิก Agents Club ทั้งหมด</p>
        </div>

        {/* Summary Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">ลงทะเบียนทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-900">{summaryStats.totalMembers.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">อยู่ในกลุ่ม LINE</p>
                <p className="text-2xl font-bold text-gray-900">{summaryStats.normalLineStatusCount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">ยืนยันตัวตนแล้ว</p>
                <p className="text-2xl font-bold text-gray-900">{summaryStats.verifiedMembersCount.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">ยืนยัน+ใบอนุญาตปกติ</p>
                <p className="text-2xl font-bold text-gray-900">{summaryStats.verifiedWithNormalLicenseCount.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหา</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ชื่อ, บริษัท, รหัส, เบอร์โทร..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะใบอนุญาต</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                <option value="ปกติ">ปกติ</option>
                <option value="__not_normal__">ไม่ปกติ</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะไลน์กลุ่ม</label>
              <select
                value={filterLineStatus}
                onChange={(e) => setFilterLineStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                {allLineStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันหมดอายุใบอนุญาต</label>
              <select
                value={filterExpiry}
                onChange={(e) => setFilterExpiry(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                <option value="expired">หมดอายุแล้ว</option>
                <option value="within45">หมดอายุภายใน 45 วัน</option>
                <option value="within90">หมดอายุภายใน 3 เดือน</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleClearFilters}
                className="w-full px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                ล้างตัวกรอง
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-lg shadow p-3 mb-6 flex items-center gap-3">
          <button
            onClick={handleCopyMemberIds}
            disabled={filteredMembers.length === 0}
            className={`px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium transition-colors ${
              copiedIds
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            {copiedIds ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                คัดลอกแล้ว
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy รหัสสมาชิก ({filteredMembers.length} รายการ)
              </>
            )}
          </button>
        </div>

        {/* Members Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">กำลังโหลดข้อมูล...</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              ไม่พบข้อมูลสมาชิก
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <span className="text-sm text-gray-600">พบ {filteredMembers.length} รายการ (จากทั้งหมด {allMembers.length} รายการ)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>
                        สถานะไลน์
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '50px' }}>
                        รหัส
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '220px' }}>
                        ชื่อ
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ minWidth: '180px' }}>
                        บริษัท
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '120px' }}>
                        ใบอนุญาต
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '140px' }}>
                        LINE Profile
                      </th>
                      <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '100px' }}>
                        เบอร์โทร
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '70px' }}>
                        สถานะ
                      </th>
                      <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ width: '90px' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredMembers.map((member) => (
                      <tr key={member.memberId} className="hover:bg-gray-50">
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                              member.lineGroupStatus === 'อยู่ในกลุ่ม' || member.lineGroupStatus?.includes('อยู่')
                                ? 'bg-green-100 text-green-800'
                                : member.lineGroupStatus === 'ออกจากกลุ่ม' || member.lineGroupStatus?.includes('ออก')
                                ? 'bg-red-100 text-red-800'
                                : member.lineGroupStatus === 'รอนำเข้ากลุ่ม' || member.lineGroupStatus?.includes('รอนำเข้า')
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {member.lineGroupStatus === 'ออกจากกลุ่ม' || member.lineGroupStatus?.includes('ออก')
                                ? 'ออกแล้ว'
                                : member.lineGroupStatus === 'อยู่ในกลุ่ม' || member.lineGroupStatus?.includes('อยู่')
                                ? 'อยู่'
                                : (member.lineGroupStatus || '-')}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-sm font-medium text-gray-900">
                          {member.memberId}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-gray-900 truncate" style={{ maxWidth: '180px' }}>
                              {member.nickname || '-'}
                            </span>
                            {/* Verified icon - show if member has lineUserId (verified identity) */}
                            {member.lineUserId && (
                              <span title="ยืนยันตัวตนแล้ว">
                                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 truncate" style={{ maxWidth: '210px' }}>
                            {member.fullNameTH || '-'}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-sm text-gray-900 truncate" style={{ maxWidth: '200px' }}>
                            {member.companyNameEN || member.companyNameTH || '-'}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-sm text-gray-600">
                            {member.licenseNumber || '-'}
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            {isExpired(member.licenseExpiry) && (
                              <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className={isExpired(member.licenseExpiry) ? 'text-red-600 font-medium' : 'text-gray-500'}>
                              {formatThaiDate(member.licenseExpiry)}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {member.lineProfile ? (
                            <div className="flex items-center gap-2">
                              {member.lineProfile.lineProfilePicture ? (
                                <img
                                  src={member.lineProfile.lineProfilePicture}
                                  alt=""
                                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                                  </svg>
                                </div>
                              )}
                              <span className="text-sm text-gray-900 truncate" style={{ maxWidth: '90px' }}>
                                {member.lineProfile.lineDisplayName || '-'}
                              </span>
                            </div>
                          ) : member.lineName ? (
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              </div>
                              <span className="text-sm text-gray-500 truncate italic" style={{ maxWidth: '90px' }} title="ข้อมูลจากสมาชิก (ยังไม่ยืนยัน)">
                                {member.lineName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-sm text-gray-600">
                          {member.mobile || member.phone || '-'}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                            member.status?.toLowerCase() === 'active' || member.status === 'ปกติ'
                              ? 'bg-green-100 text-green-800'
                              : member.status?.toLowerCase() === 'inactive' || member.status === 'ไม่ปกติ'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {member.status || '-'}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Activity icon - show if participated in last 12 months */}
                            {attendanceMap[member.memberId]?.hasRecentActivity ? (
                              <span
                                className="text-teal-600 p-1"
                                title={`เข้าร่วมกิจกรรม ${attendanceMap[member.memberId]?.eventsLast12Months || 0} ครั้งใน 12 เดือนที่ผ่านมา`}
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                </svg>
                              </span>
                            ) : !loadingAttendance && attendanceMap[member.memberId] !== undefined ? (
                              <span
                                className="text-gray-300 p-1"
                                title="ไม่ได้เข้าร่วมกิจกรรมใน 12 เดือนที่ผ่านมา"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                </svg>
                              </span>
                            ) : null}

                            {/* View detail button - icon only on mobile */}
                            <button
                              onClick={() => router.push(`/members/${member.memberId}`)}
                              className="text-blue-600 hover:text-blue-800 p-1"
                              title="ดูรายละเอียด"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>

                            {/* Contact member button */}
                            <button
                              onClick={() => setContactMember(member)}
                              className="text-purple-600 hover:text-purple-800 p-1"
                              title="ติดต่อสมาชิก"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </button>

                            {/* Notification button for non-normal status */}
                            {isStatusNotNormal(member.status) && (
                              <button
                                onClick={() => setNotifyMember(member)}
                                className="text-orange-600 hover:text-orange-800 p-1"
                                title="แจ้งเตือนสมาชิก"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                              </button>
                            )}

                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Notification Modal */}
      {notifyMember && (
        <NotificationModal
          member={notifyMember}
          onClose={() => setNotifyMember(null)}
          onSend={handleSendNotification}
          sending={sendingNotification}
        />
      )}

      {/* Contact Modal */}
      {contactMember && (
        <ContactModal
          member={contactMember}
          onClose={() => setContactMember(null)}
          staffList={staffList}
          onSuccess={() => {
            toast.success('บันทึกเรียบร้อยแล้ว');
            fetchAllMembers(); // Refresh members in case LINE status changed
          }}
        />
      )}

      {/* Toast Notifications */}
      <Toast toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  );
}
