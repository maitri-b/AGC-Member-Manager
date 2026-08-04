'use client';

import { useState, useEffect } from 'react';
import { EventRoom, EventRoomInput } from '@/types/event';
import { useToast } from '../Toast';

interface RoomManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
}

interface RoomOccupant {
  attendeeName: string;
  attendeeIndex: number;
  companyName: string;
  registrationId: string;
}

interface RoomWithOccupants extends EventRoom {
  occupants: RoomOccupant[];
}

export default function RoomManagementModal({
  isOpen,
  onClose,
  eventId,
  eventName,
}: RoomManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'manage' | 'summary'>('manage');
  const [rooms, setRooms] = useState<EventRoom[]>([]);
  const [roomsWithOccupants, setRoomsWithOccupants] = useState<RoomWithOccupants[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Room transfer state
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferData, setTransferData] = useState<{
    registrationId: string;
    attendeeIndex: number;
    attendeeName: string;
    currentRoomId: string;
    newRoomId: string;
  } | null>(null);
  const [transferring, setTransferring] = useState(false);

  // Form state for creating/editing room
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [formData, setFormData] = useState<EventRoomInput>({
    buildingName: '',
    roomNumber: '',
    roomTypeCategory: '',
    maxOccupancy: 2,
    isLocked: false,
    note: '',
  });

  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
      if (activeTab === 'summary') {
        fetchRoomOccupants();
      }
    }
  }, [isOpen, eventId, activeTab]);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/events/${eventId}/rooms`);
      if (!response.ok) throw new Error('Failed to fetch rooms');
      const data = await response.json();
      setRooms(data.rooms || []);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      toast.error('ไม่สามารถโหลดข้อมูลห้องพักได้');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoomOccupants = async () => {
    try {
      setLoading(true);

      // Fetch rooms
      const roomsResponse = await fetch(`/api/events/${eventId}/rooms`);
      if (!roomsResponse.ok) throw new Error('Failed to fetch rooms');
      const roomsData = await roomsResponse.json();
      const fetchedRooms = roomsData.rooms || [];

      // Fetch event registrations
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to fetch registrations');
      const eventData = await eventResponse.json();
      const registrations = eventData.attendees || [];

      // Build room occupancy map
      const roomOccupancyMap: Record<string, RoomOccupant[]> = {};

      registrations.forEach((attendee: any) => {
        const reg = attendee.registration;

        // Skip cancelled registrations
        if (reg.status === 'ยกเลิก') return;

        try {
          if (reg.roomAssignments) {
            const assignments = JSON.parse(reg.roomAssignments);
            if (Array.isArray(assignments)) {
              // Parse attendee names
              let attendeeNames: string[] = [];
              try {
                attendeeNames = JSON.parse(reg.attendeeNames || '[]');
              } catch (e) {
                attendeeNames = [];
              }

              assignments.forEach((assignment: any) => {
                if (assignment.roomId) {
                  const attendeeName = attendeeNames[assignment.attendeeIndex] || `ผู้เข้าพักท่านที่ ${assignment.attendeeIndex + 1}`;

                  if (!roomOccupancyMap[assignment.roomId]) {
                    roomOccupancyMap[assignment.roomId] = [];
                  }

                  roomOccupancyMap[assignment.roomId].push({
                    attendeeName,
                    attendeeIndex: assignment.attendeeIndex,
                    companyName: reg.companyName,
                    registrationId: reg.registrationId,
                  });
                }
              });
            }
          }
        } catch (e) {
          console.error('Error parsing room assignments:', e);
        }
      });

      // Merge rooms with occupants
      const roomsWithOccupantsData: RoomWithOccupants[] = fetchedRooms.map((room: EventRoom) => ({
        ...room,
        occupants: roomOccupancyMap[room.roomId] || [],
      }));

      setRoomsWithOccupants(roomsWithOccupantsData);
    } catch (error) {
      console.error('Error fetching room occupants:', error);
      toast.error('ไม่สามารถโหลดข้อมูลผู้พักได้');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = () => {
    setEditingRoomId(null);
    setFormData({
      buildingName: '',
      roomNumber: '',
      roomTypeCategory: '',
      maxOccupancy: 2,
      isLocked: false,
      note: '',
    });
    setShowRoomForm(true);
  };

  const handleEditRoom = (room: EventRoom) => {
    setEditingRoomId(room.roomId);
    setFormData({
      buildingName: room.buildingName,
      roomNumber: room.roomNumber,
      roomTypeCategory: room.roomTypeCategory || '',
      maxOccupancy: room.maxOccupancy,
      isLocked: room.isLocked || false,
      note: room.note || '',
    });
    setShowRoomForm(true);
  };

  const handleSaveRoom = async () => {
    if (!formData.buildingName || !formData.roomNumber || formData.maxOccupancy < 1) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      setSaving(true);

      let response;
      if (editingRoomId) {
        // Update existing room
        response = await fetch(`/api/events/${eventId}/rooms/${editingRoomId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      } else {
        // Create new room
        response = await fetch(`/api/events/${eventId}/rooms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save room');
      }

      toast.success(editingRoomId ? 'แก้ไขห้องพักสำเร็จ' : 'เพิ่มห้องพักสำเร็จ');
      setShowRoomForm(false);
      fetchRooms();
    } catch (error: any) {
      console.error('Error saving room:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('คุณต้องการลบห้องนี้หรือไม่?')) return;

    try {
      const response = await fetch(`/api/events/${eventId}/rooms/${roomId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete room');
      }

      toast.success('ลบห้องพักสำเร็จ');
      fetchRooms();
    } catch (error: any) {
      console.error('Error deleting room:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาด');
    }
  };

  const handleOpenTransferModal = (occupant: RoomOccupant, currentRoomId: string) => {
    setTransferData({
      registrationId: occupant.registrationId,
      attendeeIndex: occupant.attendeeIndex,
      attendeeName: occupant.attendeeName,
      currentRoomId,
      newRoomId: '',
    });
    setTransferModalOpen(true);
  };

  const handleTransferRoom = async () => {
    if (!transferData || !transferData.newRoomId) {
      toast.error('กรุณาเลือกห้องปลายทาง');
      return;
    }

    if (transferData.newRoomId === transferData.currentRoomId) {
      toast.error('ไม่สามารถย้ายไปห้องเดิมได้');
      return;
    }

    try {
      setTransferring(true);

      // Fetch current registration to get room assignments
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to fetch event data');
      const eventData = await eventResponse.json();
      const registration = eventData.attendees.find(
        (a: any) => a.registration.registrationId === transferData.registrationId
      );

      if (!registration) {
        throw new Error('ไม่พบข้อมูลการลงทะเบียน');
      }

      // Parse current room assignments
      let roomAssignments: Array<{ roomId: string; attendeeIndex: number }> = [];
      try {
        roomAssignments = JSON.parse(registration.registration.roomAssignments || '[]');
      } catch (e) {
        console.error('Error parsing room assignments:', e);
      }

      // Update the assignment for this attendee
      const updatedAssignments = roomAssignments.map((assignment) => {
        if (assignment.attendeeIndex === transferData.attendeeIndex) {
          return { ...assignment, roomId: transferData.newRoomId };
        }
        return assignment;
      });

      // Update registration with new room assignments
      const updateResponse = await fetch(`/api/events/${eventId}/admin-update-registration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId: transferData.registrationId,
          updateData: {
            room_assignments: JSON.stringify(updatedAssignments),
          },
        }),
      });

      if (!updateResponse.ok) {
        const data = await updateResponse.json();
        throw new Error(data.error || 'Failed to transfer room');
      }

      toast.success('ย้ายห้องสำเร็จ');
      setTransferModalOpen(false);
      setTransferData(null);
      fetchRoomOccupants();
    } catch (error: any) {
      console.error('Error transferring room:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาด');
    } finally {
      setTransferring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">จัดการห้องพัก</h2>
            <p className="text-sm text-gray-600 mt-1">{eventName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 flex-shrink-0">
          <div className="flex px-6">
            <button
              onClick={() => setActiveTab('manage')}
              className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'manage'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              จัดการห้อง ({rooms.length})
            </button>
            <button
              onClick={() => setActiveTab('summary')}
              className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'summary'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              สรุปห้องพัก
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'manage' ? (
            <div className="space-y-4">
              {/* Add Room Button */}
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  จำนวนห้องทั้งหมด: {rooms.length} ห้อง
                </p>
                <button
                  onClick={handleCreateRoom}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  เพิ่มห้องพัก
                </button>
              </div>

              {/* Room Form */}
              {showRoomForm && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold text-gray-900">
                    {editingRoomId ? 'แก้ไขห้องพัก' : 'เพิ่มห้องพักใหม่'}
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ชื่ออาคาร *
                      </label>
                      <input
                        type="text"
                        value={formData.buildingName}
                        onChange={(e) => setFormData({ ...formData, buildingName: e.target.value })}
                        placeholder="เช่น A, B, C"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        เลขห้อง *
                      </label>
                      <input
                        type="text"
                        value={formData.roomNumber}
                        onChange={(e) => setFormData({ ...formData, roomNumber: e.target.value })}
                        placeholder="เช่น 101, 102"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ประเภทห้อง
                      </label>
                      <input
                        type="text"
                        value={formData.roomTypeCategory || ''}
                        onChange={(e) => setFormData({ ...formData, roomTypeCategory: e.target.value })}
                        placeholder="เช่น Twin, Double, Suite"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        จำนวนผู้พักสูงสุด *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.maxOccupancy}
                        onChange={(e) => setFormData({ ...formData, maxOccupancy: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isLocked"
                        checked={formData.isLocked || false}
                        onChange={(e) => setFormData({ ...formData, isLocked: e.target.checked })}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="isLocked" className="text-sm font-medium text-gray-700">
                        ล็อคห้อง (ห้ามสำรองห้องนี้)
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        หมายเหตุ
                      </label>
                      <textarea
                        value={formData.note || ''}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        placeholder="เช่น สำรองสำหรับ VIP, มีข้อกำหนดพิเศษ"
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowRoomForm(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={handleSaveRoom}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                  </div>
                </div>
              )}

              {/* Room List */}
              {loading ? (
                <div className="text-center py-12 text-gray-500">กำลังโหลด...</div>
              ) : rooms.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  ยังไม่มีห้องพัก กรุณาเพิ่มห้องพักใหม่
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Group by building */}
                  {Object.entries(
                    rooms.reduce((acc, room) => {
                      if (!acc[room.buildingName]) acc[room.buildingName] = [];
                      acc[room.buildingName].push(room);
                      return acc;
                    }, {} as Record<string, EventRoom[]>)
                  ).map(([buildingName, buildingRooms]) => (
                    <div key={buildingName} className="space-y-2">
                      <h3 className="font-semibold text-gray-900 mt-4 mb-2">
                        อาคาร {buildingName} ({buildingRooms.length} ห้อง)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {buildingRooms.map((room) => (
                          <div
                            key={room.roomId}
                            className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">
                                  ห้อง {room.roomNumber}
                                  {room.roomTypeCategory && (
                                    <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                      {room.roomTypeCategory}
                                    </span>
                                  )}
                                  {room.isLocked && (
                                    <span className="ml-2 text-xs font-normal text-red-600 bg-red-50 px-2 py-0.5 rounded">
                                      🔒 ล็อค
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-600">
                                  รองรับ {room.maxOccupancy} คน
                                </div>
                                {room.note && (
                                  <div className="text-xs text-gray-500 mt-1 italic">
                                    📝 {room.note}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleEditRoom(room)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                  title="แก้ไข"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteRoom(room.roomId)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="ลบ"
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
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-900">{roomsWithOccupants.length}</div>
                  <div className="text-sm text-blue-700">ห้องทั้งหมด</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-900">
                    {roomsWithOccupants.filter(r => r.occupants.length > 0).length}
                  </div>
                  <div className="text-sm text-green-700">ห้องมีผู้พัก</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-amber-900">
                    {roomsWithOccupants.reduce((sum, r) => sum + r.occupants.length, 0)}
                  </div>
                  <div className="text-sm text-amber-700">ผู้เข้าพักทั้งหมด</div>
                </div>
              </div>

              {/* Room List with Occupants */}
              {loading ? (
                <div className="text-center py-12 text-gray-500">กำลังโหลด...</div>
              ) : roomsWithOccupants.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  ยังไม่มีห้องพัก กรุณาเพิ่มห้องพักในแท็บ "จัดการห้อง"
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Group by building */}
                  {Object.entries(
                    roomsWithOccupants.reduce((acc, room) => {
                      if (!acc[room.buildingName]) acc[room.buildingName] = [];
                      acc[room.buildingName].push(room);
                      return acc;
                    }, {} as Record<string, RoomWithOccupants[]>)
                  ).map(([buildingName, buildingRooms]) => (
                    <div key={buildingName} className="space-y-3">
                      <h3 className="font-semibold text-gray-900 text-lg border-b border-gray-300 pb-2">
                        อาคาร {buildingName}
                      </h3>
                      <div className="space-y-2">
                        {buildingRooms.map((room) => {
                          const isFull = room.occupants.length >= room.maxOccupancy;
                          const isEmpty = room.occupants.length === 0;
                          const isLocked = room.isLocked || false;

                          return (
                            <div
                              key={room.roomId}
                              className={`border rounded-lg p-4 ${
                                isLocked
                                  ? 'border-red-300 bg-red-50'
                                  : isEmpty
                                  ? 'border-gray-300 bg-gray-50'
                                  : isFull
                                  ? 'border-green-300 bg-green-50'
                                  : 'border-blue-300 bg-blue-50'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="font-semibold text-gray-900">
                                    ห้อง {room.roomNumber}
                                    {room.roomTypeCategory && (
                                      <span className="ml-2 text-xs font-normal text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
                                        {room.roomTypeCategory}
                                      </span>
                                    )}
                                    {isLocked && (
                                      <span className="ml-2 text-xs font-normal text-red-700 bg-red-200 px-2 py-0.5 rounded">
                                        🔒 ล็อค
                                      </span>
                                    )}
                                  </div>
                                  <div className={`text-sm px-2 py-0.5 rounded ${
                                    isLocked
                                      ? 'bg-red-200 text-red-800'
                                      : isEmpty
                                      ? 'bg-gray-200 text-gray-700'
                                      : isFull
                                      ? 'bg-green-200 text-green-800'
                                      : 'bg-blue-200 text-blue-800'
                                  }`}>
                                    {room.occupants.length}/{room.maxOccupancy} คน
                                  </div>
                                </div>
                              </div>

                              {room.note && (
                                <div className="text-sm text-gray-700 mb-3 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                                  📝 {room.note}
                                </div>
                              )}

                              {room.occupants.length > 0 ? (
                                <div className="space-y-2">
                                  {room.occupants.map((occupant, idx) => (
                                    <div
                                      key={`${occupant.registrationId}-${occupant.attendeeIndex}`}
                                      className="flex items-center justify-between bg-white border border-gray-200 rounded p-3"
                                    >
                                      <div className="flex-1">
                                        <div className="font-medium text-gray-900">
                                          {occupant.attendeeName}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                          {occupant.companyName} · รหัส: {occupant.registrationId.slice(0, 8)}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleOpenTransferModal(occupant, room.roomId)}
                                        className="ml-3 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                        title="ย้ายห้อง"
                                      >
                                        ย้าย
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-500 italic">ยังไม่มีผู้พัก</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>

      {/* Transfer Modal */}
      {transferModalOpen && transferData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">ย้ายห้องพัก</h3>

            <div className="mb-4">
              <p className="text-sm text-gray-700 mb-1">
                <strong>ผู้พัก:</strong> {transferData.attendeeName}
              </p>
              <p className="text-sm text-gray-700">
                <strong>ห้องปัจจุบัน:</strong>{' '}
                {(() => {
                  const currentRoom = roomsWithOccupants.find(r => r.roomId === transferData.currentRoomId);
                  return currentRoom ? `${currentRoom.buildingName}-${currentRoom.roomNumber}` : 'ไม่ระบุ';
                })()}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลือกห้องปลายทาง *
              </label>
              <select
                value={transferData.newRoomId}
                onChange={(e) => setTransferData({ ...transferData, newRoomId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">- เลือกห้อง -</option>
                {roomsWithOccupants
                  .filter(room => {
                    // Exclude current room
                    if (room.roomId === transferData.currentRoomId) return false;
                    // Only show rooms that are not full and not locked
                    return room.occupants.length < room.maxOccupancy && !room.isLocked;
                  })
                  .map(room => (
                    <option key={room.roomId} value={room.roomId}>
                      {room.buildingName}-{room.roomNumber}
                      {room.roomTypeCategory && ` (${room.roomTypeCategory})`} [{room.occupants.length}/{room.maxOccupancy}]
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setTransferModalOpen(false);
                  setTransferData(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleTransferRoom}
                disabled={transferring || !transferData.newRoomId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {transferring ? 'กำลังย้าย...' : 'ย้ายห้อง'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
