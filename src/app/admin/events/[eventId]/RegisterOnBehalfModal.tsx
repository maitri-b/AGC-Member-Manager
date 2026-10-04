'use client';

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

interface User {
  userId: string;
  lineUserId: string;
  memberId?: string;
  displayName: string;
  companyName?: string;
  licenseNumber?: string;
  fullNameTH?: string;
  phone?: string;
  role: string;
  isMember: boolean;
}

interface FavoriteMember {
  userId: string;
  memberId?: string | null;
  displayName: string;
  companyName?: string | null;
  licenseNumber?: string | null;
  fullNameTH?: string | null;
  addedAt: Date;
}

interface AttendeeType {
  typeId: string;
  typeName: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
}

interface RoomType {
  typeId: string;
  typeName: string;
  price: number;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
}

interface RegisterOnBehalfModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  useAttendeeTypePricing: boolean;
  attendeeTypes?: AttendeeType[];
  roomTypes?: RoomType[];
  requireAttendeeNames?: boolean;
  onSuccess: () => void;
}

export default function RegisterOnBehalfModal({
  isOpen,
  onClose,
  eventId,
  eventName,
  useAttendeeTypePricing,
  attendeeTypes = [],
  roomTypes = [],
  requireAttendeeNames = true,
  onSuccess,
}: RegisterOnBehalfModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [activeTab, setActiveTab] = useState<'search' | 'favorites'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Favorites state
  const [favorites, setFavorites] = useState<FavoriteMember[]>([]);
  const [selectedFavorites, setSelectedFavorites] = useState<Set<string>>(new Set());
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [batchRegistering, setBatchRegistering] = useState(false);

  // Registration form state
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [attendeeNames, setAttendeeNames] = useState<string[]>([]);
  const [attendeeTypeSelections, setAttendeeTypeSelections] = useState<Array<{ typeId: string; quantity: number }>>([]);
  const [roomAllocations, setRoomAllocations] = useState<Array<{ roomTypeId: string; roomCount: number }>>([]);
  const [specialRequests, setSpecialRequests] = useState('');
  const [sendNotification, setSendNotification] = useState(true); // Default: checked
  const [submitting, setSubmitting] = useState(false);

  // Load favorites on mount
  useEffect(() => {
    if (isOpen) {
      fetchFavorites();
    }
  }, [isOpen]);

  // Fetch favorites from API
  const fetchFavorites = async () => {
    setLoadingFavorites(true);
    try {
      const response = await fetch('/api/admin/favorites');
      if (response.ok) {
        const data = await response.json();
        setFavorites(data.favorites || []);
      } else {
        toast.error('ไม่สามารถโหลดรายการโปรดได้');
      }
    } catch (error) {
      console.error('Error fetching favorites:', error);
      toast.error('เกิดข้อผิดพลาดในการโหลดรายการโปรด');
    } finally {
      setLoadingFavorites(false);
    }
  };

  // Add user to favorites
  const addToFavorites = async (user: User) => {
    try {
      const response = await fetch('/api/admin/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          memberId: user.memberId,
          displayName: user.displayName,
          companyName: user.companyName,
          licenseNumber: user.licenseNumber,
          fullNameTH: user.fullNameTH,
        }),
      });

      if (response.ok) {
        toast.success('เพิ่มในรายการโปรดแล้ว');
        await fetchFavorites(); // Reload favorites
      } else {
        const data = await response.json();
        toast.error(data.error || 'ไม่สามารถเพิ่มในรายการโปรดได้');
      }
    } catch (error) {
      console.error('Error adding to favorites:', error);
      toast.error('เกิดข้อผิดพลาดในการเพิ่มรายการโปรด');
    }
  };

  // Remove user from favorites
  const removeFromFavorites = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/favorites?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('ลบออกจากรายการโปรดแล้ว');
        await fetchFavorites(); // Reload favorites
        // Also remove from selected if it was selected
        const newSelected = new Set(selectedFavorites);
        newSelected.delete(userId);
        setSelectedFavorites(newSelected);
      } else {
        toast.error('ไม่สามารถลบออกจากรายการโปรดได้');
      }
    } catch (error) {
      console.error('Error removing from favorites:', error);
      toast.error('เกิดข้อผิดพลาดในการลบรายการโปรด');
    }
  };

  // Toggle favorite selection
  const toggleFavoriteSelection = (userId: string) => {
    const newSelected = new Set(selectedFavorites);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedFavorites(newSelected);
  };

  // Batch register selected favorites
  const handleBatchRegister = async () => {
    if (selectedFavorites.size === 0) {
      toast.error('กรุณาเลือกสมาชิกที่ต้องการลงทะเบียน');
      return;
    }

    const confirmed = confirm(
      `ต้องการลงทะเบียนให้สมาชิก ${selectedFavorites.size} คนใช่หรือไม่?\n\n` +
      `แต่ละคนจะได้รับการลงทะเบียน 1 ที่นั่ง โดยใช้ชื่อจริงจาก Google Sheets เป็นชื่อผู้เข้าร่วม`
    );

    if (!confirmed) return;

    setBatchRegistering(true);
    try {
      const registrations = favorites
        .filter(f => selectedFavorites.has(f.userId))
        .map(f => ({
          userId: f.userId,
          displayName: f.displayName,
          fullNameTH: f.fullNameTH || undefined,
          memberId: f.memberId || undefined,
          licenseNumber: f.licenseNumber || undefined,
        }));

      const response = await fetch(`/api/events/${eventId}/register-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrations,
          sendNotification: true, // Always send notification for batch registration
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(
          `ลงทะเบียนสำเร็จ ${data.successful} คน` +
          (data.failed > 0 ? ` | ล้มเหลว ${data.failed} คน` : ''),
          { duration: 5000 }
        );

        // Show errors if any
        if (data.errors && data.errors.length > 0) {
          console.error('Batch registration errors:', data.errors);
        }

        // Clear selections
        setSelectedFavorites(new Set());

        // Refresh parent component
        onSuccess();

        // Don't close modal - admin might want to do more registrations
      } else {
        toast.error(data.error || 'ไม่สามารถลงทะเบียนได้');
      }
    } catch (error) {
      console.error('Batch registration error:', error);
      toast.error('เกิดข้อผิดพลาดในการลงทะเบียนแบบกลุ่ม');
    } finally {
      setBatchRegistering(false);
    }
  };

  // Search users
  useEffect(() => {
    if (searchQuery.length < 2) {
      setUsers([]);
      return;
    }

    const delaySearch = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const data = await response.json();
          setUsers(data.users || []);
        } else {
          toast.error('ไม่สามารถค้นหาผู้ใช้ได้');
        }
      } catch (error) {
        console.error('Search error:', error);
        toast.error('เกิดข้อผิดพลาดในการค้นหา');
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  // Auto-calculate attendee count from attendee type selections
  useEffect(() => {
    if (useAttendeeTypePricing && attendeeTypeSelections.length > 0) {
      const total = attendeeTypeSelections.reduce((sum, s) => sum + s.quantity, 0);
      setAttendeeCount(total);
      // Auto-adjust attendee names array
      if (total > attendeeNames.length) {
        setAttendeeNames([...attendeeNames, ...Array(total - attendeeNames.length).fill('')]);
      } else if (total < attendeeNames.length) {
        setAttendeeNames(attendeeNames.slice(0, total));
      }
    }
  }, [attendeeTypeSelections, useAttendeeTypePricing]);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setStep(2);
    // Don't auto-fill attendee names - admin will fill them manually
  };

  const handleAttendeeCountChange = (newCount: number) => {
    setAttendeeCount(newCount);
    // Adjust attendee names array
    if (newCount > attendeeNames.length) {
      setAttendeeNames([...attendeeNames, ...Array(newCount - attendeeNames.length).fill('')]);
    } else if (newCount < attendeeNames.length) {
      setAttendeeNames(attendeeNames.slice(0, newCount));
    }
  };

  const handleAttendeeNameChange = (index: number, value: string) => {
    const newNames = [...attendeeNames];
    newNames[index] = value;
    setAttendeeNames(newNames);
  };

  const handleSubmit = async () => {
    if (!selectedUser) return;

    // Validate attendee count
    if (attendeeCount === 0) {
      toast.error('กรุณาระบุจำนวนผู้เข้าร่วม');
      return;
    }

    // No validation required for attendee names - admin can submit without filling all names

    setSubmitting(true);
    try {
      const response = await fetch(`/api/events/${eventId}/register-on-behalf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: selectedUser.userId,
          attendeeCount,
          attendeeNames,
          specialRequests,
          attendeeTypeSelections,
          roomAllocations,
          sendNotification, // Send notification preference
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`ลงทะเบียนสำเร็จ รหัสลงทะเบียน: ${data.registrationId}`);
        onSuccess();
        handleClose();
      } else {
        toast.error(data.error || 'ไม่สามารถลงทะเบียนได้');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('เกิดข้อผิดพลาดในการลงทะเบียน');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSearchQuery('');
    setUsers([]);
    setSelectedUser(null);
    setAttendeeCount(0);
    setAttendeeNames([]);
    setAttendeeTypeSelections([]);
    setRoomAllocations([]);
    setSpecialRequests('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">ลงทะเบียนกิจกรรมแทนสมาชิก</h2>
            <p className="text-sm text-gray-600 mt-1">{eventName}</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 ? (
            <>
              {/* Tab Navigation */}
              <div className="mb-6 border-b border-gray-200">
                <div className="flex gap-4">
                  <button
                    onClick={() => setActiveTab('search')}
                    className={`pb-3 px-2 font-medium transition-colors relative ${
                      activeTab === 'search'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    🔍 ค้นหาสมาชิก
                    {activeTab === 'search' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('favorites')}
                    className={`pb-3 px-2 font-medium transition-colors relative ${
                      activeTab === 'favorites'
                        ? 'text-blue-600'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    ⭐ รายการโปรด
                    {favorites.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
                        {favorites.length}
                      </span>
                    )}
                    {activeTab === 'favorites' && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                    )}
                  </button>
                </div>
              </div>

              {/* Search Tab */}
              {activeTab === 'search' && (
                <>
                  {/* Step 1: Select User */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ขั้นตอนที่ 1: เลือกสมาชิก/ผู้ใช้
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="🔍 ค้นหาด้วย ชื่อ, รหัสสมาชิก, เลขใบอนุญาต, บริษัท..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {searching && (
                        <div className="absolute right-3 top-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Search Results */}
                  {users.length > 0 && (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      <p className="text-sm text-gray-600 mb-2">พบผลการค้นหา {users.length} รายการ</p>
                      {users.map((user) => {
                        const isInFavorites = favorites.some(f => f.userId === user.userId);
                        return (
                          <div
                            key={user.userId}
                            className="w-full p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <button
                                onClick={() => handleSelectUser(user)}
                                className="flex-1 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{user.displayName}</span>
                                  {user.isMember && (
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                      สมาชิก
                                    </span>
                                  )}
                                  {!user.isMember && (
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                                      Guest
                                    </span>
                                  )}
                                </div>
                                {user.memberId && (
                                  <p className="text-xs text-gray-500 mt-1">รหัสสมาชิก: {user.memberId}</p>
                                )}
                                {user.companyName && (
                                  <p className="text-xs text-gray-600 mt-1">{user.companyName}</p>
                                )}
                                {user.licenseNumber && (
                                  <p className="text-xs text-gray-500 mt-1">ใบอนุญาต: {user.licenseNumber}</p>
                                )}
                              </button>
                              <div className="flex items-center gap-2">
                                {!isInFavorites ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addToFavorites(user);
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium text-amber-600 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors"
                                    title="เพิ่มในรายการโปรด"
                                  >
                                    ⭐ บันทึก
                                  </button>
                                ) : (
                                  <span className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-300 rounded-lg">
                                    ⭐ บันทึกแล้ว
                                  </span>
                                )}
                                <button
                                  onClick={() => handleSelectUser(user)}
                                  className="text-gray-400 hover:text-gray-600"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

              {searchQuery.length >= 2 && !searching && users.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="mt-2">ไม่พบผู้ใช้ที่ค้นหา</p>
                </div>
              )}

                  {searchQuery.length < 2 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>กรุณากรอกอย่างน้อย 2 ตัวอักษรเพื่อค้นหา</p>
                    </div>
                  )}
                </>
              )}

              {/* Favorites Tab */}
              {activeTab === 'favorites' && (
                <>
                  {loadingFavorites ? (
                    <div className="text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <p className="text-sm text-gray-600 mt-3">กำลังโหลดรายการโปรด...</p>
                    </div>
                  ) : favorites.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                      <p className="mt-3 font-medium">ยังไม่มีรายการโปรด</p>
                      <p className="text-sm mt-1">ค้นหาสมาชิกและกดปุ่ม "⭐ บันทึก" เพื่อเพิ่มในรายการโปรด</p>
                    </div>
                  ) : (
                    <>
                      {/* Batch Actions Header */}
                      <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-700">
                              {selectedFavorites.size > 0 ? (
                                <span className="text-blue-600">เลือกแล้ว {selectedFavorites.size} คน</span>
                              ) : (
                                'เลือกสมาชิกเพื่อลงทะเบียนแบบกลุ่ม'
                              )}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              แต่ละคนจะได้รับการลงทะเบียน 1 ที่นั่ง
                            </p>
                          </div>
                          {selectedFavorites.size > 0 && (
                            <button
                              onClick={handleBatchRegister}
                              disabled={batchRegistering}
                              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                            >
                              {batchRegistering ? (
                                <span className="flex items-center gap-2">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  กำลังลงทะเบียน...
                                </span>
                              ) : (
                                `🚀 ลงทะเบียนทั้งหมด (${selectedFavorites.size})`
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Favorites List with Checkboxes */}
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        <p className="text-sm text-gray-600 mb-2">รายการโปรด {favorites.length} รายการ</p>
                        {favorites.map((favorite) => {
                          const isSelected = selectedFavorites.has(favorite.userId);
                          return (
                            <div
                              key={favorite.userId}
                              className={`w-full p-4 border rounded-lg transition-all ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-300 shadow-sm'
                                  : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                {/* Checkbox */}
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleFavoriteSelection(favorite.userId)}
                                  className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                />

                                {/* Member Info */}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900">
                                      {favorite.fullNameTH || favorite.displayName}
                                    </span>
                                    {favorite.memberId && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                                        สมาชิก
                                      </span>
                                    )}
                                  </div>
                                  {favorite.memberId && (
                                    <p className="text-xs text-gray-500 mt-1">รหัสสมาชิก: {favorite.memberId}</p>
                                  )}
                                  {favorite.companyName && (
                                    <p className="text-xs text-gray-600 mt-1">{favorite.companyName}</p>
                                  )}
                                  {favorite.licenseNumber && (
                                    <p className="text-xs text-gray-500 mt-1">ใบอนุญาต: {favorite.licenseNumber}</p>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-2">
                                  <button
                                    onClick={() => {
                                      // Convert FavoriteMember to User for handleSelectUser
                                      const user: User = {
                                        userId: favorite.userId,
                                        lineUserId: favorite.userId, // Assuming userId is same as lineUserId
                                        memberId: favorite.memberId || undefined,
                                        displayName: favorite.displayName,
                                        companyName: favorite.companyName || undefined,
                                        licenseNumber: favorite.licenseNumber || undefined,
                                        fullNameTH: favorite.fullNameTH || undefined,
                                        phone: undefined,
                                        role: 'member',
                                        isMember: !!favorite.memberId,
                                      };
                                      handleSelectUser(user);
                                    }}
                                    className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                                    title="ลงทะเบียนเดี่ยว"
                                  >
                                    ลงทะเบียน
                                  </button>
                                  <button
                                    onClick={() => removeFromFavorites(favorite.userId)}
                                    className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                                    title="ลบออกจากรายการโปรด"
                                  >
                                    ลบ
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              {/* Step 2: Registration Form */}
              <div className="space-y-6">
                {/* Selected User Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-900">ลงทะเบียนให้:</p>
                      <p className="text-lg font-bold text-blue-700 mt-1">{selectedUser?.displayName}</p>
                      {selectedUser?.companyName && (
                        <p className="text-sm text-blue-600">{selectedUser.companyName}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setStep(1)}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      เลือกใหม่
                    </button>
                  </div>
                </div>

                {/* Attendee Count (if not using attendee type pricing) */}
                {!useAttendeeTypePricing && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      จำนวนผู้เข้าร่วม
                    </label>
                    <select
                      value={attendeeCount}
                      onChange={(e) => handleAttendeeCountChange(Number(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="0" disabled>โปรดระบุจำนวนผู้เข้าร่วม</option>
                      {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>{num} คน</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Attendee Type Selections */}
                {useAttendeeTypePricing && attendeeTypes.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-blue-900 mb-3">
                      ประเภทผู้เข้าร่วม
                    </label>
                    <div className="space-y-2">
                      {attendeeTypes
                        .filter(t => t.isActive)
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((type) => {
                          const selection = attendeeTypeSelections.find(s => s.typeId === type.typeId);
                          const quantity = selection?.quantity || 0;
                          const subtotal = type.price * quantity;
                          return (
                            <div key={type.typeId} className="flex items-center gap-2 bg-white p-2 rounded">
                              <span className="text-sm font-medium text-gray-700 flex-1">
                                {type.typeName} <span className="text-gray-500">({type.price.toLocaleString()} บาท/คน)</span>
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="50"
                                value={quantity === 0 ? '' : quantity}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const qty = value === '' ? 0 : parseInt(value);
                                  const newSelections = attendeeTypeSelections.filter(s => s.typeId !== type.typeId);
                                  if (qty > 0) {
                                    newSelections.push({ typeId: type.typeId, quantity: qty });
                                  }
                                  setAttendeeTypeSelections(newSelections);
                                }}
                                className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                                placeholder="0"
                              />
                              <span className="text-sm text-gray-600 w-12 text-right">คน</span>
                              {quantity > 0 && (
                                <span className="text-sm font-semibold text-blue-600 w-24 text-right">
                                  = {subtotal.toLocaleString()} บาท
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-900">จำนวนผู้เข้าร่วมทั้งหมด:</span>
                        <span className="text-lg font-bold text-blue-700">{attendeeCount} คน</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Attendee Names */}
                {requireAttendeeNames && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      รายชื่อผู้เข้าร่วม ({attendeeCount} คน)
                    </label>
                    <div className="space-y-2">
                      {attendeeNames.map((name, index) => (
                        <input
                          key={index}
                          type="text"
                          value={name}
                          onChange={(e) => handleAttendeeNameChange(index, e.target.value)}
                          placeholder={`ชื่อผู้เข้าร่วมคนที่ ${index + 1}`}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Room Allocations */}
                {roomTypes.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <label className="block text-sm font-semibold text-amber-900 mb-3">
                      การจัดห้องพัก
                    </label>
                    <div className="space-y-2">
                      {roomTypes
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((roomType) => {
                          const allocation = roomAllocations.find(ra => ra.roomTypeId === roomType.typeId);
                          const roomCount = allocation?.roomCount || 0;
                          const subtotal = roomType.price * roomCount;
                          const isInactive = roomType.isActive === false;
                          return (
                            <div key={roomType.typeId} className={`flex items-center gap-2 bg-white p-2 rounded ${isInactive ? 'opacity-60' : ''}`}>
                              <span className="text-sm font-medium text-gray-700 flex-1">
                                {roomType.typeName}
                                {isInactive && <span className="ml-1.5 text-xs text-red-600 font-semibold">(ปิดใช้งาน)</span>}
                                <span className="text-gray-500"> ({roomType.price.toLocaleString()} บาท/ห้อง, {roomType.capacity} คน/ห้อง)</span>
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="20"
                                value={roomCount === 0 ? '' : roomCount}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const count = value === '' ? 0 : parseInt(value);
                                  const newAllocations = roomAllocations.filter(ra => ra.roomTypeId !== roomType.typeId);
                                  if (count > 0) {
                                    newAllocations.push({ roomTypeId: roomType.typeId, roomCount: count });
                                  }
                                  setRoomAllocations(newAllocations);
                                }}
                                className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center"
                                placeholder="0"
                              />
                              <span className="text-sm text-gray-600 w-12 text-right">ห้อง</span>
                              {roomCount > 0 && (
                                <span className="text-sm font-semibold text-amber-600 w-24 text-right">
                                  = {subtotal.toLocaleString()} บาท
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Special Requests */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ความต้องการพิเศษ
                  </label>
                  <textarea
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="เช่น ต้องการอาหารเจ, แพ้อาหารทะเล, ต้องการห้องชั้นล่าง"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* LINE Notification Toggle */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendNotification}
                      onChange={(e) => setSendNotification(e.target.checked)}
                      className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-green-900">แจ้งผลการลงทะเบียนให้สมาชิกทราบผ่าน LINE</span>
                      <p className="text-xs text-green-700 mt-1">
                        เมื่อเลือก ระบบจะส่งข้อความยืนยันการลงทะเบียนไปยัง LINE ของสมาชิกโดยอัตโนมัติ
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  ย้อนกลับ
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'กำลังลงทะเบียน...' : 'ยืนยันการลงทะเบียน'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
