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

export default function RoomManagementModal({
  isOpen,
  onClose,
  eventId,
  eventName,
}: RoomManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'manage' | 'summary'>('manage');
  const [rooms, setRooms] = useState<EventRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state for creating/editing room
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [formData, setFormData] = useState<EventRoomInput>({
    buildingName: '',
    roomNumber: '',
    roomTypeCategory: '',
    maxOccupancy: 2,
  });

  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
    }
  }, [isOpen, eventId]);

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

  const handleCreateRoom = () => {
    setEditingRoomId(null);
    setFormData({
      buildingName: '',
      roomNumber: '',
      roomTypeCategory: '',
      maxOccupancy: 2,
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
                              <div>
                                <div className="font-medium text-gray-900">
                                  ห้อง {room.roomNumber}
                                  {room.roomTypeCategory && (
                                    <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                      {room.roomTypeCategory}
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-gray-600">
                                  รองรับ {room.maxOccupancy} คน
                                </div>
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
            <div className="text-center py-12 text-gray-500">
              สรุปห้องพัก (กำลังพัฒนา)
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
    </div>
  );
}
