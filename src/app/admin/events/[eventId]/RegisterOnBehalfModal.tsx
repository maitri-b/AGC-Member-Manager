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
  phone?: string;
  role: string;
  isMember: boolean;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Registration form state
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [attendeeNames, setAttendeeNames] = useState<string[]>([]);
  const [attendeeTypeSelections, setAttendeeTypeSelections] = useState<Array<{ typeId: string; quantity: number }>>([]);
  const [roomAllocations, setRoomAllocations] = useState<Array<{ roomTypeId: string; roomCount: number }>>([]);
  const [specialRequests, setSpecialRequests] = useState('');
  const [sendNotification, setSendNotification] = useState(true); // Default: checked
  const [submitting, setSubmitting] = useState(false);

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
                  {users.map((user) => (
                    <button
                      key={user.userId}
                      onClick={() => handleSelectUser(user)}
                      className="w-full text-left p-4 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
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
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
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
