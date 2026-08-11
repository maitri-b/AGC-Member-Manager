'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useEffectiveSessionContext } from '@/lib/EffectiveSessionProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { hasPermission } from '@/lib/permissions';

interface LineHistoryEntry {
  lineUserId: string;
  lineDisplayName: string;
  lineProfilePicture?: string;
  resetAt: { _seconds: number } | string;
  resetBy: string;
  resetByName?: string;
  reason?: string;
}

interface User {
  id: string;
  lineDisplayName?: string;
  lineProfilePicture?: string;
  lineUserId: string;
  role: string;
  memberId?: string;
  isActive: boolean;
  permissions: string[];
  assignedEventIds?: string[];
  createdAt?: { _seconds: number };
  lastLoginAt?: { _seconds: number };
  licenseNumber?: string;
  phone?: string;
  verificationStatus?: string;
  isSearchLocked?: boolean;
  searchCount?: number;
  lockedAt?: { _seconds: number };
  lockedReason?: string;
  lineHistory?: LineHistoryEntry[];
  adminNote?: string;
  adminNoteIcon?: string;
  adminNoteUpdatedAt?: { _seconds: number } | string;
  adminNoteUpdatedBy?: string;
  adminNoteUpdatedByName?: string;
}

interface SearchLog {
  id: string;
  searchQuery: string;
  searchType: string;
  searchedAt: string;
  attemptNumber: number;
}

interface PendingCounts {
  applications: number;
  verifications: number;
  profileChanges: number;
  disputes: number;
}

export default function AdminPage() {
  const { data: session, status } = useSession(); // Real admin session (for audit logs, etc.)
  const { data: effectiveSession, status: effectiveStatus } = useEffectiveSessionContext(); // Effective session (for permission checks)
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    role: '',
    memberId: '',
    isActive: true,
    assignedEventIds: [] as string[],
  });
  const [searchLogs, setSearchLogs] = useState<SearchLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showResetLineModal, setShowResetLineModal] = useState(false);
  const [resetLineReason, setResetLineReason] = useState('');
  const [resetLineLoading, setResetLineLoading] = useState(false);
  const [sendLineNotification, setSendLineNotification] = useState(true); // Default: true
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({
    applications: 0,
    verifications: 0,
    profileChanges: 0,
    disputes: 0,
  });
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Admin note states
  const [editingNoteUser, setEditingNoteUser] = useState<User | null>(null);
  const [adminNoteText, setAdminNoteText] = useState('');
  const [adminNoteIcon, setAdminNoteIcon] = useState('note');
  const [savingNote, setSavingNote] = useState(false);

  // Send message states
  const [sendMessageUser, setSendMessageUser] = useState<User | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messageTemplate, setMessageTemplate] = useState<string>('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Member search states
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberOptions, setMemberOptions] = useState<Array<{
    memberId: string;
    nickname: string;
    fullNameTH: string;
    companyNameTH: string;
    companyNameEN: string;
    licenseNumber: string;
  }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [allMembersData, setAllMembersData] = useState<Array<{
    memberId: string;
    nickname: string;
    fullNameTH: string;
    companyNameTH: string;
    companyNameEN: string;
    licenseNumber: string;
  }>>([]);
  const [memberPreview, setMemberPreview] = useState<{
    memberId: string;
    fullNameTH: string;
    nickname: string;
    companyNameTH: string;
    companyNameEN: string;
    lineId: string;
    phone: string;
    mobile: string;
    email: string;
    licenseNumber: string;
    status: string;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Event assignment states
  const [activePublishedEvents, setActivePublishedEvents] = useState<Array<{
    eventId: string;
    eventName: string;
    eventDate: string;
    year: number;
  }>>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated' || effectiveStatus === 'unauthenticated') {
      router.push('/login');
    } else if (effectiveStatus === 'authenticated' && !hasPermission(effectiveSession?.user?.permissions || [], 'admin:access')) {
      router.push('/unauthorized');
    }
  }, [status, effectiveStatus, session, effectiveSession, router]);

  useEffect(() => {
    if (effectiveStatus === 'authenticated' && effectiveSession && hasPermission(effectiveSession.user.permissions || [], 'admin:users')) {
      fetchUsers();
      fetchPendingCounts();
      // NOTE: Members data now loaded lazily when needed (on search or modal open)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]); // Only run when authentication status changes, not on every session update

  // Lazy load members data when user starts searching
  useEffect(() => {
    // Only load if:
    // 1. User is searching AND
    // 2. Members data hasn't been loaded yet
    if (userSearchQuery && allMembersData.length === 0 && !loadingMembers) {
      fetchAllMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSearchQuery]);

  const fetchPendingCounts = async () => {
    try {
      // Use optimized pending-counts API (uses Firestore count() for minimal reads)
      const response = await fetch('/api/admin/pending-counts');
      if (response.ok) {
        const data = await response.json();
        setPendingCounts({
          applications: data.applications || 0,
          verifications: data.verifications || 0,
          profileChanges: data.profileChanges || 0,
          disputes: data.disputes || 0,
        });
      }
    } catch (err) {
      console.error('Error fetching pending counts:', err);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = async (user: User) => {
    setEditingUser(user);
    setEditForm({
      role: user.role,
      memberId: user.memberId || '',
      isActive: user.isActive,
      assignedEventIds: user.assignedEventIds || [],
    });
    setSearchLogs([]);
    setMemberSearchQuery('');
    setMemberPreview(null);
    setSendLineNotification(true); // Reset to default (checked)

    // Fetch search logs for guest users only
    if (user.role === 'guest' && user.searchCount && user.searchCount > 0) {
      setLoadingLogs(true);
      try {
        const response = await fetch(`/api/admin/users/${user.id}/search-logs`);
        if (response.ok) {
          const data = await response.json();
          setSearchLogs(data.logs || []);
        }
      } catch (err) {
        console.error('Error fetching search logs:', err);
      } finally {
        setLoadingLogs(false);
      }
    }

    // Fetch all members for search dropdown and table display (lazy loaded)
    if (allMembersData.length === 0 && !loadingMembers) {
      fetchAllMembers();
    }

    // Load member preview if user already has a memberId
    if (user.memberId) {
      fetchMemberPreview(user.memberId);
    }

    // Fetch active published events for event assignment
    fetchActivePublishedEvents();
  };

  // Fetch all members from Google Sheets for search dropdown and table display
  // Lazy loaded - only called when opening edit modal
  const fetchAllMembers = async () => {
    setLoadingMembers(true);
    try {
      const response = await fetch('/api/members');
      if (!response.ok) {
        console.error('Failed to fetch members');
        return;
      }
      const data = await response.json();

      console.log('Total members fetched:', data.members?.length);
      console.log('Sample member:', data.members?.[0]);

      // Filter only active members and map to options
      // Support both "Active" and "ปกติ" status
      const options = data.members
        .filter((m: any) => m.status === 'Active' || m.status === 'ปกติ')
        .map((m: any) => ({
          memberId: m.memberId,
          nickname: m.nickname || '',
          fullNameTH: m.fullNameTH || '',
          companyNameTH: m.companyNameTH || '',
          companyNameEN: m.companyNameEN || '',
          licenseNumber: m.licenseNumber || '',
        }))
        .sort((a: any, b: any) => a.nickname.localeCompare(b.nickname, 'th'));

      console.log('Active members filtered:', options.length);

      // Set both memberOptions (for modal) and allMembersData (for table display)
      setMemberOptions(options);
      setAllMembersData(options);
    } catch (err) {
      console.error('Error fetching members:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  // Fetch member preview details
  const fetchMemberPreview = async (memberId: string) => {
    if (!memberId.trim()) {
      setMemberPreview(null);
      return;
    }

    setLoadingPreview(true);
    try {
      const response = await fetch(`/api/members/${memberId}`);
      if (response.ok) {
        const data = await response.json();
        setMemberPreview({
          memberId: data.member.memberId,
          fullNameTH: data.member.fullNameTH,
          nickname: data.member.nickname,
          companyNameTH: data.member.companyNameTH,
          companyNameEN: data.member.companyNameEN,
          lineId: data.member.lineId,
          phone: data.member.phone,
          mobile: data.member.mobile,
          email: data.member.email,
          licenseNumber: data.member.licenseNumber,
          status: data.member.status,
        });
      } else {
        setMemberPreview(null);
      }
    } catch (err) {
      console.error('Error fetching member preview:', err);
      setMemberPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Fetch active and published events for event assignment
  const fetchActivePublishedEvents = async () => {
    setLoadingEvents(true);
    try {
      const response = await fetch('/api/admin/events');
      if (response.ok) {
        const data = await response.json();
        // Filter for active events only
        const activePublished = (data.events || [])
          .filter((event: any) => event.isActive)
          .map((event: any) => ({
            eventId: event.eventId,
            eventName: event.eventName,
            eventDate: event.eventDate,
            year: event.year,
          }))
          .sort((a: any, b: any) => {
            // Sort by year (desc) then by event date (desc)
            if (a.year !== b.year) return b.year - a.year;
            return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
          });
        setActivePublishedEvents(activePublished);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Handle member selection from dropdown
  const handleMemberSelect = (memberId: string) => {
    setEditForm({ ...editForm, memberId });
    setMemberSearchQuery(''); // Clear search after selection
    fetchMemberPreview(memberId); // Load full member details
  };

  // Handle manual member ID input
  const handleMemberIdChange = (memberId: string) => {
    setEditForm({ ...editForm, memberId });
    // Debounce the preview fetch
    if (memberId.trim()) {
      const timeoutId = setTimeout(() => {
        fetchMemberPreview(memberId);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setMemberPreview(null);
    }
  };

  const handleUnlockSearch = async () => {
    if (!editingUser) return;

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          unlockSearch: true,
        }),
      });

      if (!response.ok) throw new Error('Failed to unlock user');

      setSuccess('ปลดล็อคการค้นหาเรียบร้อยแล้ว');
      setEditingUser(null);
      setSearchLogs([]);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleResetLineConnection = async () => {
    if (!editingUser) return;

    setResetLineLoading(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          resetLineConnection: true,
          resetReason: resetLineReason || 'เปลี่ยน LINE Account',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset LINE connection');
      }

      setSuccess(`รีเซ็ตการเชื่อมต่อ LINE สำหรับ ${editingUser.lineDisplayName} เรียบร้อยแล้ว สมาชิกสามารถล็อกอินด้วย LINE Account ใหม่และยืนยันตัวตนใหม่ได้`);
      setShowResetLineModal(false);
      setResetLineReason('');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setResetLineLoading(false);
    }
  };

  const formatLineHistoryDate = (timestamp: { _seconds: number } | string) => {
    if (typeof timestamp === 'string') {
      return new Date(timestamp).toLocaleString('th-TH');
    }
    return new Date(timestamp._seconds * 1000).toLocaleString('th-TH');
  };

  // Get emoji icon for admin note (for selection buttons only)
  const getNoteEmoji = (iconType?: string) => {
    const icons: { [key: string]: string } = {
      urgent: '🔴',
      reminder: '⏰',
      note: '📝',
      schedule: '📅',
      call: '📞',
      waiting: '⏳',
      alert: '⚠️',
    };
    return icons[iconType || 'note'] || '📝';
  };

  // Handle admin note save
  const handleSaveAdminNote = async () => {
    if (!editingNoteUser) return;
    setSavingNote(true);
    try {
      const response = await fetch('/api/admin/users/note', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingNoteUser.id,
          adminNote: adminNoteText,
          adminNoteIcon: adminNoteIcon
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save note');
      }

      setSuccess('บันทึกหมายเหตุเรียบร้อยแล้ว');
      setEditingNoteUser(null);
      setAdminNoteText('');
      setAdminNoteIcon('note');
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSavingNote(false);
    }
  };

  // Handle send LINE message
  const handleSendMessage = async () => {
    if (!sendMessageUser) return;
    setSendingMessage(true);
    try {
      const response = await fetch('/api/admin/users/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineUserId: sendMessageUser.lineUserId,
          message: messageText,
          templateType: messageTemplate || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send message');
      }

      setSuccess('ส่งข้อความเรียบร้อยแล้ว');
      setSendMessageUser(null);
      setMessageText('');
      setMessageTemplate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    try {
      // Build update payload - only include role if user has admin:roles permission
      const payload: Record<string, unknown> = {
        userId: editingUser.id,
        memberId: editForm.memberId || null,
        isActive: editForm.isActive,
        assignedEventIds: editForm.assignedEventIds || [],
        sendLineNotification: sendLineNotification, // Include notification preference
      };

      // Only include role if user has permission to change roles
      if (hasPermission(effectiveSession?.user?.permissions || [], 'admin:roles')) {
        payload.role = editForm.role;
      }

      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      setSuccess('บันทึกข้อมูลเรียบร้อยแล้ว');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'admin': return 'ผู้ดูแลระบบ';
      case 'committee': return 'กรรมการ';
      case 'event-co': return 'ผู้ประสานงาน';
      case 'event-staff': return 'เจ้าหน้าที่';
      case 'member': return 'สมาชิก';
      default: return 'ผู้เยี่ยมชม';
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'committee': return 'bg-blue-100 text-blue-800';
      case 'event-co': return 'bg-purple-100 text-purple-800';
      case 'event-staff': return 'bg-orange-100 text-orange-800';
      case 'member': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (timestamp?: { _seconds: number }) => {
    if (!timestamp) return '-';
    return new Date(timestamp._seconds * 1000).toLocaleString('th-TH');
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">จัดการระบบ</h1>
          <p className="text-gray-600 mt-1">จัดการผู้ใช้งานและสิทธิ์การเข้าถึง</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="float-right">&times;</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">
            {success}
            <button onClick={() => setSuccess(null)} className="float-right">&times;</button>
          </div>
        )}

        {/* Quick Actions */}
        <div className="mb-6 flex flex-wrap gap-3">
          <a
            href="/admin/applications"
            className="relative inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            ใบสมัครสมาชิก
            {pendingCounts.applications > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-lg animate-pulse">
                {pendingCounts.applications}
              </span>
            )}
          </a>
          <a
            href="/admin/verification"
            className="relative inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            คำขอยืนยันตัวตน
            {pendingCounts.verifications > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-lg animate-pulse">
                {pendingCounts.verifications}
              </span>
            )}
          </a>
          <a
            href="/admin/profile-changes"
            className="relative inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            คำขอแก้ไขข้อมูล
            {pendingCounts.profileChanges > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-lg animate-pulse">
                {pendingCounts.profileChanges}
              </span>
            )}
          </a>
          <a
            href="/admin/disputes"
            className="relative inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            คำร้องแจ้งปัญหา
            {pendingCounts.disputes > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-lg animate-pulse">
                {pendingCounts.disputes}
              </span>
            )}
          </a>
          <a
            href="/admin/events"
            className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            จัดการกิจกรรม
          </a>
        </div>

        {/* Pending Summary Card */}
        {(pendingCounts.applications + pendingCounts.verifications + pendingCounts.profileChanges + pendingCounts.disputes) > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-yellow-800">คำร้องรอดำเนินการ</h3>
                <p className="text-sm text-yellow-700">
                  รวมทั้งหมด {pendingCounts.applications + pendingCounts.verifications + pendingCounts.profileChanges + pendingCounts.disputes} รายการ
                  {pendingCounts.applications > 0 && ` • ใบสมัคร ${pendingCounts.applications}`}
                  {pendingCounts.verifications > 0 && ` • ยืนยันตัวตน ${pendingCounts.verifications}`}
                  {pendingCounts.profileChanges > 0 && ` • แก้ไขข้อมูล ${pendingCounts.profileChanges}`}
                  {pendingCounts.disputes > 0 && ` • แจ้งปัญหา ${pendingCounts.disputes}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">ผู้ใช้ทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900">{users.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">ผู้ดูแลระบบ</p>
            <p className="text-2xl font-bold text-red-600">{users.filter(u => u.role === 'admin').length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">กรรมการ</p>
            <p className="text-2xl font-bold text-blue-600">{users.filter(u => u.role === 'committee').length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">รอการอนุมัติ</p>
            <p className="text-2xl font-bold text-yellow-600">{users.filter(u => u.role === 'guest').length}</p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="font-semibold text-gray-900">รายชื่อผู้ใช้งาน</h2>
                <div className="flex flex-wrap gap-2">
                  {/* Role Filter */}
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="all">ทุกประเภท</option>
                    <option value="admin">ผู้ดูแลระบบ</option>
                    <option value="committee">กรรมการ</option>
                    <option value="event-co">ผู้ประสานงาน</option>
                    <option value="event-staff">เจ้าหน้าที่</option>
                    <option value="member">สมาชิก</option>
                    <option value="guest">ผู้เยี่ยมชม</option>
                  </select>
                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="verified">ยืนยันตัวตนแล้ว</option>
                    <option value="pending">รอยืนยันตัวตน</option>
                    <option value="locked">ถูกล็อค</option>
                    <option value="inactive">ไม่ใช้งาน</option>
                  </select>
                </div>
              </div>
              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="ค้นหาด้วย ชื่อ LINE, รหัสสมาชิก, เลขใบอนุญาต, เบอร์โทร, ชื่อ-นามสกุล, ชื่อเล่น, ชื่อบริษัท..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <svg
                  className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ผู้ใช้
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    บทบาท
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รหัสสมาชิก
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">
                    เลขใบอนุญาต
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    เบอร์โทร
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">
                    เข้าใช้ล่าสุด
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    หมายเหตุ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users
                  .filter((user) => {
                    // Role filter
                    if (roleFilter !== 'all' && user.role !== roleFilter) {
                      return false;
                    }
                    // Status filter
                    if (statusFilter === 'verified' && user.verificationStatus !== 'verified') {
                      return false;
                    }
                    if (statusFilter === 'pending' && user.verificationStatus !== 'pending' && user.role === 'guest') {
                      // Show guests who haven't verified yet
                      return user.role === 'guest';
                    }
                    if (statusFilter === 'pending' && user.verificationStatus === 'pending') {
                      return true;
                    }
                    if (statusFilter === 'pending' && user.verificationStatus !== 'pending') {
                      return false;
                    }
                    if (statusFilter === 'locked' && !user.isSearchLocked) {
                      return false;
                    }
                    if (statusFilter === 'inactive' && user.isActive !== false) {
                      return false;
                    }

                    // Search filter
                    if (userSearchQuery) {
                      const query = userSearchQuery.toLowerCase();

                      // Search in user's own fields
                      const matchesUserFields =
                        user.lineDisplayName?.toLowerCase().includes(query) ||
                        user.memberId?.toLowerCase().includes(query) ||
                        user.licenseNumber?.toLowerCase().includes(query) ||
                        user.phone?.toLowerCase().includes(query) ||
                        user.lineUserId?.toLowerCase().includes(query);

                      // Search in member data from Google Sheets
                      const memberData = allMembersData.find(m => m.memberId === user.memberId);
                      const matchesMemberFields = memberData && (
                        memberData.fullNameTH?.toLowerCase().includes(query) ||
                        memberData.nickname?.toLowerCase().includes(query) ||
                        memberData.companyNameTH?.toLowerCase().includes(query) ||
                        memberData.companyNameEN?.toLowerCase().includes(query) ||
                        memberData.licenseNumber?.toLowerCase().includes(query)
                      );

                      if (!matchesUserFields && !matchesMemberFields) {
                        return false;
                      }
                    }

                    return true;
                  })
                  .map((user) => {
                    // Get member data for this user
                    const memberData = allMembersData.find(m => m.memberId === user.memberId);

                    return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center max-w-xs">
                        {user.lineProfilePicture ? (
                          <img
                            src={user.lineProfilePicture}
                            alt={user.lineDisplayName || 'User'}
                            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-gray-500 text-sm">
                              {user.lineDisplayName?.charAt(0) || '?'}
                            </span>
                          </div>
                        )}
                        <div className="ml-3 min-w-0 flex-1">
                          {user.memberId ? (
                            <Link
                              href={`/members/${user.memberId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors truncate block"
                              title="ดูโปรไฟล์สมาชิก (เปิดในแท็บใหม่)"
                            >
                              {user.lineDisplayName || 'Unknown'}
                            </Link>
                          ) : (
                            <p className="text-sm font-medium text-gray-900 truncate">{user.lineDisplayName || 'Unknown'}</p>
                          )}
                          {memberData && (
                            <>
                              {memberData.fullNameTH && (
                                <p className="text-xs text-gray-600 truncate">{memberData.fullNameTH} ({memberData.nickname || '-'})</p>
                              )}
                              {(memberData.companyNameTH || memberData.companyNameEN) && (
                                <p className="text-xs text-gray-500 truncate">
                                  {memberData.companyNameTH || memberData.companyNameEN}
                                </p>
                              )}
                            </>
                          )}
                          <p className="text-xs text-gray-400 truncate">ID: {user.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(user.role)}`}>
                        {getRoleDisplayName(user.role)}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {user.memberId || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 hidden xl:table-cell">
                      {user.licenseNumber || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 hidden lg:table-cell">
                      {user.phone || '-'}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {user.verificationStatus === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            รอพิจารณาคำขอ
                          </span>
                        )}
                        {user.verificationStatus === 'verified' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ยืนยันตัวตนแล้ว
                          </span>
                        )}
                        {user.verificationStatus === 'rejected' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ถูกปฏิเสธ
                          </span>
                        )}
                        {user.isSearchLocked && (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                            🔒 Locked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden xl:table-cell">
                      {formatDate(user.lastLoginAt)}
                    </td>
                    <td className="px-4 py-4 text-sm max-w-[120px]">
                      {user.adminNote ? (
                        <div className="relative group inline-block">
                          <button
                            onClick={() => {
                              setEditingNoteUser(user);
                              setAdminNoteText(user.adminNote || '');
                              setAdminNoteIcon(user.adminNoteIcon || 'note');
                            }}
                            className={!user.adminNoteIcon || user.adminNoteIcon === 'note' || user.adminNoteIcon === 'none' ? 'text-blue-600 hover:text-blue-800' : 'text-lg hover:scale-110 transition-transform'}
                            title="ดูหมายเหตุ"
                          >
                            {user.adminNoteIcon === 'none' ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                              </svg>
                            ) : !user.adminNoteIcon || user.adminNoteIcon === 'note' ? (
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                              </svg>
                            ) : (
                              getNoteEmoji(user.adminNoteIcon)
                            )}
                          </button>
                          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 bg-gray-900 text-white text-xs rounded-lg p-3 z-10 shadow-lg">
                            <div className="font-semibold mb-1 flex items-center gap-2">
                              {!user.adminNoteIcon || user.adminNoteIcon === 'note' || user.adminNoteIcon === 'none' ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                              ) : (
                                <span>{getNoteEmoji(user.adminNoteIcon)}</span>
                              )}
                              <span>หมายเหตุจาก Admin:</span>
                            </div>
                            <div className="whitespace-pre-wrap break-words">{user.adminNote}</div>
                            {user.adminNoteUpdatedByName && (
                              <div className="text-gray-400 mt-2 text-xs">
                                โดย {user.adminNoteUpdatedByName}
                              </div>
                            )}
                            <div className="absolute left-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingNoteUser(user);
                            setAdminNoteText('');
                            setAdminNoteIcon('note');
                          }}
                          className="text-gray-400 hover:text-gray-600"
                          title="เพิ่มหมายเหตุ"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => {
                            setSendMessageUser(user);
                            setMessageText('');
                            setMessageTemplate('');
                          }}
                          className="text-green-600 hover:text-green-800"
                          title="ส่งข้อความ LINE"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {editingUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 my-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">แก้ไขข้อมูลผู้ใช้</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4 mb-4">
                  {editingUser.lineProfilePicture ? (
                    <img
                      src={editingUser.lineProfilePicture}
                      alt={editingUser.lineDisplayName || 'User'}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-500">{editingUser.lineDisplayName?.charAt(0) || '?'}</span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{editingUser.lineDisplayName}</p>
                    <p className="text-sm text-gray-500">LINE ID: {editingUser.id.slice(0, 12)}...</p>
                  </div>
                </div>

                {/* Role selection - only show if user has admin:roles permission */}
                {hasPermission(effectiveSession?.user?.permissions || [], 'admin:roles') ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท</label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="guest">ผู้เยี่ยมชม (Guest)</option>
                      <option value="member">สมาชิก (Member)</option>
                      <option value="event-co">ผู้ประสานงาน (Event-Co)</option>
                      <option value="event-staff">เจ้าหน้าที่ (Event-Staff)</option>
                      <option value="committee">กรรมการ (Committee)</option>
                      <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท</label>
                    <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-gray-700">
                      {getRoleDisplayName(editForm.role)}
                      <span className="text-xs text-gray-500 ml-2">(ไม่สามารถแก้ไขได้)</span>
                    </div>
                  </div>
                )}

                {/* Member Search and Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ค้นหาและเลือกสมาชิก
                  </label>

                  {/* Search Input */}
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="พิมพ์ชื่อเล่น, ชื่อ, รหัสสมาชิก, ชื่อบริษัท, หรือเลขใบอนุญาต..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    {loadingMembers && (
                      <div className="absolute right-3 top-2.5">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600"></div>
                      </div>
                    )}
                  </div>

                  {/* Dropdown Results */}
                  {memberSearchQuery && (
                    <div className="max-h-60 overflow-y-auto border border-gray-300 rounded-md bg-white shadow-lg mb-2">
                      {memberOptions
                        .filter((m) => {
                          const query = memberSearchQuery.toLowerCase();
                          return (
                            m.nickname.toLowerCase().includes(query) ||
                            m.fullNameTH.toLowerCase().includes(query) ||
                            m.memberId.toLowerCase().includes(query) ||
                            m.companyNameTH.toLowerCase().includes(query) ||
                            m.companyNameEN.toLowerCase().includes(query) ||
                            m.licenseNumber.toLowerCase().includes(query)
                          );
                        })
                        .slice(0, 50)
                        .map((member) => (
                          <button
                            key={member.memberId}
                            onClick={() => handleMemberSelect(member.memberId)}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                  {member.nickname} ({member.fullNameTH})
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                  {member.companyNameTH || member.companyNameEN}
                                </p>
                              </div>
                              <span className="text-xs font-mono text-gray-600 flex-shrink-0">
                                {member.memberId}
                              </span>
                            </div>
                          </button>
                        ))}

                      {memberOptions.filter((m) => {
                        const query = memberSearchQuery.toLowerCase();
                        return (
                          m.nickname.toLowerCase().includes(query) ||
                          m.fullNameTH.toLowerCase().includes(query) ||
                          m.memberId.toLowerCase().includes(query) ||
                          m.companyNameTH.toLowerCase().includes(query) ||
                          m.companyNameEN.toLowerCase().includes(query) ||
                          m.licenseNumber.toLowerCase().includes(query)
                        );
                      }).length === 0 && (
                        <div className="px-3 py-4 text-center text-sm text-gray-500">
                          ไม่พบสมาชิกที่ตรงกับคำค้นหา
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual Input Option */}
                  {!memberSearchQuery && (
                    <>
                      <label className="block text-xs font-medium text-gray-600 mb-1 mt-3">
                        หรือพิมพ์รหัสสมาชิกโดยตรง
                      </label>
                      <input
                        type="text"
                        value={editForm.memberId}
                        onChange={(e) => handleMemberIdChange(e.target.value)}
                        placeholder="เช่น 24001"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </>
                  )}

                  {/* Loading Indicator */}
                  {loadingPreview && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      กำลังตรวจสอบข้อมูล...
                    </div>
                  )}

                  {/* Member Preview Card */}
                  {!loadingPreview && memberPreview && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-xs font-semibold text-green-800 mb-2">✓ พบข้อมูลสมาชิก</p>
                      <div className="space-y-1 text-xs text-gray-700">
                        <p><span className="font-medium">รหัส:</span> {memberPreview.memberId}</p>
                        <p><span className="font-medium">ชื่อ:</span> {memberPreview.fullNameTH}</p>
                        <p><span className="font-medium">ชื่อเล่น:</span> {memberPreview.nickname}</p>
                        <p><span className="font-medium">บริษัท:</span> {memberPreview.companyNameTH}</p>
                        {memberPreview.lineId && (
                          <p><span className="font-medium">LINE ID:</span> {memberPreview.lineId}</p>
                        )}
                        {memberPreview.mobile && (
                          <p><span className="font-medium">มือถือ:</span> {memberPreview.mobile}</p>
                        )}
                        {memberPreview.licenseNumber && (
                          <p><span className="font-medium">เลขใบอนุญาต:</span> {memberPreview.licenseNumber}</p>
                        )}
                        <p>
                          <span className="font-medium">สถานะ:</span>{' '}
                          <span className={memberPreview.status === 'Active' ? 'text-green-600' : 'text-gray-600'}>
                            {memberPreview.status}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Not Found Message */}
                  {!loadingPreview && editForm.memberId.trim() && !memberPreview && (
                    <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-xs text-yellow-800">
                        ⚠️ ไม่พบรหัสสมาชิก &quot;{editForm.memberId}&quot; ในระบบ
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editForm.isActive}
                      onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm font-medium text-gray-700">เปิดใช้งาน (Active)</span>
                  </label>
                </div>

                {/* Event Assignment Section - Only for event-staff and event-co */}
                {(editForm.role === 'event-staff' || editForm.role === 'event-co') && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">มอบหมายกิจกรรม</h4>
                    <p className="text-xs text-gray-600 mb-3">
                      เลือกกิจกรรมที่ต้องการมอบหมายให้จัดการ (เฉพาะกิจกรรมที่เปิดใช้งาน)
                    </p>
                    {loadingEvents ? (
                      <div className="text-sm text-gray-500">กำลังโหลดกิจกรรม...</div>
                    ) : activePublishedEvents.length === 0 ? (
                      <div className="text-sm text-gray-500">ไม่มีกิจกรรมที่สามารถมอบหมายได้</div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto border rounded-md p-3 space-y-2">
                        {activePublishedEvents.map((event) => (
                          <label
                            key={event.eventId}
                            className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={editForm.assignedEventIds?.includes(event.eventId) || false}
                              onChange={(e) => {
                                const current = editForm.assignedEventIds || [];
                                const updated = e.target.checked
                                  ? [...current, event.eventId]
                                  : current.filter(id => id !== event.eventId);
                                setEditForm({ ...editForm, assignedEventIds: updated });
                              }}
                              className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {event.eventName}
                              </p>
                              <p className="text-xs text-gray-500">
                                {event.eventDate} • ปี {event.year}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {editForm.assignedEventIds && editForm.assignedEventIds.length > 0 && (
                      <p className="text-xs text-gray-600 mt-2">
                        เลือกแล้ว {editForm.assignedEventIds.length} กิจกรรม
                      </p>
                    )}
                  </div>
                )}

                {/* Reset LINE Connection Section - Only for verified members with memberId */}
                {editingUser.memberId && (editingUser.verificationStatus === 'verified' || editingUser.role === 'member' || editingUser.role === 'committee' || editingUser.role === 'admin') && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      เปลี่ยน LINE Account
                    </h4>
                    <div className="bg-purple-50 rounded-lg p-3 mb-3">
                      <p className="text-sm text-purple-800">
                        หากสมาชิกต้องการเปลี่ยน LINE Account ที่ใช้เข้าระบบ
                        กดปุ่มด้านล่างเพื่อรีเซ็ตการเชื่อมต่อ LINE
                      </p>
                      <p className="text-xs text-purple-600 mt-1">
                        รหัสสมาชิก: <span className="font-semibold">{editingUser.memberId}</span> จะยังคงอยู่
                      </p>
                    </div>

                    <button
                      onClick={() => setShowResetLineModal(true)}
                      className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      รีเซ็ตการเชื่อมต่อ LINE
                    </button>

                    {/* LINE History */}
                    {editingUser.lineHistory && editingUser.lineHistory.length > 0 && (
                      <div className="mt-4">
                        <h5 className="text-xs font-semibold text-gray-700 mb-2">ประวัติ LINE Account เดิม:</h5>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {editingUser.lineHistory.map((entry, index) => (
                            <div key={index} className="text-xs bg-white border border-gray-200 rounded px-2 py-1">
                              <div className="flex justify-between">
                                <span className="font-medium text-gray-800">{entry.lineDisplayName}</span>
                                <span className="text-gray-500">
                                  {formatLineHistoryDate(entry.resetAt)}
                                </span>
                              </div>
                              {entry.reason && (
                                <div className="text-gray-500 mt-0.5">เหตุผล: {entry.reason}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Search Lock Section - Only show for guest role */}
                {editingUser.role === 'guest' && (editingUser.isSearchLocked || (editingUser.searchCount && editingUser.searchCount > 0)) && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      สถานะการค้นหา
                    </h4>

                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">จำนวนครั้งที่ค้นหา:</span>
                        <span className="text-sm font-medium">{editingUser.searchCount || 0} / 3 ครั้ง</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">สถานะ:</span>
                        {editingUser.isSearchLocked ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">
                            🔒 ถูกล็อค
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ปกติ
                          </span>
                        )}
                      </div>
                      {editingUser.lockedReason && (
                        <div className="mt-2 text-xs text-orange-600">
                          สาเหตุ: {editingUser.lockedReason}
                        </div>
                      )}
                    </div>

                    {editingUser.isSearchLocked && (
                      <button
                        onClick={handleUnlockSearch}
                        className="w-full px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                        ปลดล็อคการค้นหา
                      </button>
                    )}

                    {/* Search History */}
                    {searchLogs.length > 0 && (
                      <div className="mt-4">
                        <h5 className="text-xs font-semibold text-gray-700 mb-2">ประวัติการค้นหา:</h5>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {searchLogs.map((log) => (
                            <div key={log.id} className="text-xs bg-white border border-gray-200 rounded px-2 py-1">
                              <div className="flex justify-between">
                                <span className="font-medium text-gray-800">ครั้งที่ {log.attemptNumber}:</span>
                                <span className="text-gray-500">
                                  {new Date(log.searchedAt).toLocaleString('th-TH')}
                                </span>
                              </div>
                              <div className="text-gray-600">
                                ค้นหา: <span className="font-mono">{log.searchQuery}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {loadingLogs && (
                      <div className="mt-2 text-xs text-gray-500 text-center">กำลังโหลดประวัติ...</div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200">
                {/* LINE Notification Checkbox - Only show when changing guest to member */}
                {hasPermission(effectiveSession?.user?.permissions || [], 'admin:roles') &&
                 (editingUser.role === 'guest' || editingUser.role === 'visitor') &&
                 (editForm.role === 'member' || editForm.role === 'committee' || editForm.role === 'admin') &&
                 editForm.memberId && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendLineNotification}
                        onChange={(e) => setSendLineNotification(e.target.checked)}
                        className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900">ส่งข้อความแจ้งผลการยืนยันตัวตนผ่าน LINE</span>
                        <p className="text-xs text-gray-600 mt-1">
                          ระบบจะส่ง LINE Flex Message ไปแจ้งให้สมาชิกทราบว่าได้รับการยืนยันตัวตนแล้ว พร้อมรายละเอียดสมาชิก
                        </p>
                      </div>
                    </label>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleSaveUser}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                  >
                    บันทึก
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Admin Note Modal */}
      {editingNoteUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">หมายเหตุจาก Admin</h3>
              <p className="text-sm text-gray-600 mt-1">
                User: {editingNoteUser.lineDisplayName || 'Unknown'}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {/* Icon Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลือกประเภทหมายเหตุ
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'none', label: 'ไม่ระบุ', emoji: '⭕', color: 'bg-gray-100 border-gray-300 hover:bg-gray-200' },
                    { id: 'urgent', label: 'เรื่องด่วน', emoji: '🔴', color: 'bg-red-100 border-red-300 hover:bg-red-200' },
                    { id: 'reminder', label: 'เตือนความจำ', emoji: '⏰', color: 'bg-yellow-100 border-yellow-300 hover:bg-yellow-200' },
                    { id: 'note', label: 'Note ทั่วไป', emoji: null, color: 'bg-blue-100 border-blue-300 hover:bg-blue-200' },
                    { id: 'schedule', label: 'ตั้งเวลา', emoji: '📅', color: 'bg-purple-100 border-purple-300 hover:bg-purple-200' },
                    { id: 'call', label: 'โทรหา', emoji: '📞', color: 'bg-green-100 border-green-300 hover:bg-green-200' },
                    { id: 'waiting', label: 'รอการตอบรับ', emoji: '⏳', color: 'bg-orange-100 border-orange-300 hover:bg-orange-200' },
                    { id: 'alert', label: 'ตกใจ', emoji: '⚠️', color: 'bg-pink-100 border-pink-300 hover:bg-pink-200' },
                  ].map((iconType) => (
                    <button
                      key={iconType.id}
                      type="button"
                      onClick={() => setAdminNoteIcon(iconType.id)}
                      className={`flex flex-col items-center gap-1 p-3 border-2 rounded-lg transition-all ${
                        adminNoteIcon === iconType.id
                          ? iconType.color + ' border-opacity-100 shadow-md'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {iconType.id === 'none' ? (
                        <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      ) : iconType.emoji ? (
                        <span className="text-xl">{iconType.emoji}</span>
                      ) : (
                        <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                      )}
                      <span className="text-xs font-medium text-gray-700">{iconType.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Note Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  หมายเหตุ
                </label>
                <textarea
                  value={adminNoteText}
                  onChange={(e) => setAdminNoteText(e.target.value)}
                  placeholder="เพิ่มหมายเหตุเกี่ยวกับ user นี้..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-2">
                  หมายเหตุนี้จะแสดงเฉพาะ Admin เท่านั้น
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setEditingNoteUser(null);
                  setAdminNoteText('');
                  setAdminNoteIcon('note');
                }}
                disabled={savingNote}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveAdminNote}
                disabled={savingNote}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingNote ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send LINE Message Modal */}
      {sendMessageUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
              <h3 className="text-lg font-semibold text-green-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                ส่งข้อความ LINE
              </h3>
              <p className="text-sm text-green-700 mt-1">
                ถึง: {sendMessageUser.lineDisplayName || 'Unknown'}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลือก Template (ไม่บังคับ)
                </label>
                <select
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">-- เขียนข้อความเอง --</option>
                  <option value="verification_reminder">แจ้งเตือนให้ยืนยันตัวตน</option>
                  <option value="application_approved">แจ้งใบสมัครได้รับการอนุมัติ</option>
                  <option value="application_rejected">แจ้งใบสมัครไม่ได้รับการอนุมัติ</option>
                </select>
                {messageTemplate === 'verification_reminder' && (
                  <p className="text-xs text-blue-600 mt-1">
                    ส่งข้อความแจ้งให้สมาชิกที่ยังไม่ได้ยืนยันตัวตนดำเนินการยืนยัน พร้อมลิงก์
                  </p>
                )}
              </div>

              {/* Custom Message */}
              {!messageTemplate && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ข้อความ
                  </label>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800">
                  ⚠️ ข้อความจะถูกส่งทันทีหลังกดปุ่ม "ส่งข้อความ" และไม่สามารถยกเลิกได้
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setSendMessageUser(null);
                  setMessageText('');
                  setMessageTemplate('');
                }}
                disabled={sendingMessage}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage || (!messageTemplate && !messageText.trim())}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {sendingMessage ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    กำลังส่ง...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                    ส่งข้อความ
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset LINE Connection Confirmation Modal */}
      {showResetLineModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200 bg-purple-50">
              <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                ยืนยันการรีเซ็ต LINE
              </h3>
            </div>
            <div className="p-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800 font-medium mb-2">การดำเนินการนี้จะ:</p>
                <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                  <li>ลบการเชื่อมต่อ LINE Account ปัจจุบัน</li>
                  <li>เก็บประวัติ LINE เดิมไว้</li>
                  <li>คงรหัสสมาชิก <span className="font-semibold">{editingUser.memberId}</span> และสิทธิ์เดิมไว้</li>
                  <li>ล้างข้อมูล LINE ใน Google Sheet</li>
                </ul>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-700 mb-2">
                  หลังจากรีเซ็ต สมาชิกต้อง:
                </p>
                <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
                  <li>ล็อกอินด้วย LINE Account ใหม่</li>
                  <li>ยืนยันตัวตนใหม่ด้วยรหัสสมาชิกเดิม ({editingUser.memberId})</li>
                </ol>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เหตุผล (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={resetLineReason}
                  onChange={(e) => setResetLineReason(e.target.value)}
                  placeholder="เช่น เปลี่ยนเบอร์โทรศัพท์"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetLineModal(false);
                  setResetLineReason('');
                }}
                disabled={resetLineLoading}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleResetLineConnection}
                disabled={resetLineLoading}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {resetLineLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    กำลังดำเนินการ...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    ยืนยันรีเซ็ต
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
