'use client';

import { useState, useEffect } from 'react';
import { EventRoom, EventRoomInput } from '@/types/event';
import { useToast } from '../Toast';
import * as XLSX from 'xlsx-js-style';

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
  note?: string;
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

  // Batch edit state
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [editedRooms, setEditedRooms] = useState<Record<string, EventRoom>>({});
  const [batchSaving, setBatchSaving] = useState(false);

  // Filter and search state for Summary tab
  const [roomFilter, setRoomFilter] = useState<'all' | '1-person' | '2-person' | '3-person' | 'empty'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBuildings, setExpandedBuildings] = useState<Record<string, boolean>>({});

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

  // Bulk room transfer state
  const [bulkTransferModalOpen, setBulkTransferModalOpen] = useState(false);
  const [bulkTransferData, setBulkTransferData] = useState<{
    currentRoomId: string;
    currentRoomNumber: string;
    occupants: RoomOccupant[];
    availableRooms: RoomWithOccupants[];
    selectedNewRoomId: string;
  } | null>(null);
  const [bulkTransferring, setBulkTransferring] = useState(false);

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<EventRoomInput[]>([]);

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
                    note: reg.note || '',
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

  const handleDownloadTemplate = () => {
    // Create template data
    const template = [
      {
        'ชื่ออาคาร': 'A',
        'เลขห้อง': '101',
        'ประเภทห้อง': 'Twin',
        'จำนวนผู้พักสูงสุด': 2,
        'ล็อคห้อง (TRUE/FALSE)': 'FALSE',
        'หมายเหตุ': 'ห้องมุม',
      },
      {
        'ชื่ออาคาร': 'A',
        'เลขห้อง': '102',
        'ประเภทห้อง': 'Double',
        'จำนวนผู้พักสูงสุด': 2,
        'ล็อคห้อง (TRUE/FALSE)': 'FALSE',
        'หมายเหตุ': '',
      },
      {
        'ชื่ออาคาร': 'B',
        'เลขห้อง': '201',
        'ประเภทห้อง': 'Suite',
        'จำนวนผู้พักสูงสุด': 4,
        'ล็อคห้อง (TRUE/FALSE)': 'TRUE',
        'หมายเหตุ': 'สำรองสำหรับ VIP',
      },
    ];

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(template);

    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // ชื่ออาคาร
      { wch: 15 }, // เลขห้อง
      { wch: 15 }, // ประเภทห้อง
      { wch: 20 }, // จำนวนผู้พักสูงสุด
      { wch: 25 }, // ล็อคห้อง
      { wch: 30 }, // หมายเหตุ
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Room Template');

    // Download file
    XLSX.writeFile(wb, `Room_Import_Template_${eventName}.xlsx`);
    toast.success('ดาวน์โหลด Template สำเร็จ');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileExt || '')) {
      toast.error('กรุณาเลือกไฟล์ .csv หรือ .xlsx เท่านั้น');
      return;
    }

    setImportFile(file);
    parseImportFile(file);
  };

  const parseImportFile = async (file: File) => {
    try {
      setLoading(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Parse and validate data
      const parsedRooms: EventRoomInput[] = [];
      const errors: string[] = [];

      jsonData.forEach((row: any, index: number) => {
        const rowNum = index + 2; // Excel row number (header is row 1)

        // Extract data from columns
        const buildingName = String(row['ชื่ออาคาร'] || '').trim();
        const roomNumber = String(row['เลขห้อง'] || '').trim();
        const roomTypeCategory = String(row['ประเภทห้อง'] || '').trim();
        const maxOccupancy = parseInt(String(row['จำนวนผู้พักสูงสุด'] || '0'));
        const isLockedStr = String(row['ล็อคห้อง (TRUE/FALSE)'] || 'FALSE').trim().toUpperCase();
        const note = String(row['หมายเหตุ'] || '').trim();

        // Validate required fields
        if (!buildingName) {
          errors.push(`แถว ${rowNum}: ไม่พบชื่ออาคาร`);
          return;
        }
        if (!roomNumber) {
          errors.push(`แถว ${rowNum}: ไม่พบเลขห้อง`);
          return;
        }
        if (!maxOccupancy || maxOccupancy < 1) {
          errors.push(`แถว ${rowNum}: จำนวนผู้พักสูงสุดต้องมากกว่า 0`);
          return;
        }

        // Parse isLocked
        const isLocked = isLockedStr === 'TRUE' || isLockedStr === '1';

        parsedRooms.push({
          buildingName,
          roomNumber,
          roomTypeCategory: roomTypeCategory || undefined,
          maxOccupancy,
          isLocked,
          note: note || undefined,
        });
      });

      if (errors.length > 0) {
        toast.error(`พบข้อผิดพลาด ${errors.length} รายการ:\n${errors.slice(0, 3).join('\n')}`);
        setImportPreview([]);
        return;
      }

      if (parsedRooms.length === 0) {
        toast.error('ไม่พบข้อมูลห้องพักในไฟล์');
        return;
      }

      setImportPreview(parsedRooms);
      toast.success(`พบข้อมูล ${parsedRooms.length} ห้อง พร้อมนำเข้า`);
    } catch (error) {
      console.error('Error parsing file:', error);
      toast.error('ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบไฟล์');
      setImportPreview([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImportRooms = async () => {
    if (importPreview.length === 0) {
      toast.error('ไม่มีข้อมูลที่จะนำเข้า');
      return;
    }

    try {
      setImporting(true);

      // Import rooms one by one
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const room of importPreview) {
        try {
          const response = await fetch(`/api/events/${eventId}/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(room),
          });

          if (response.ok) {
            successCount++;
          } else {
            const data = await response.json();
            errorCount++;
            errors.push(`${room.buildingName}-${room.roomNumber}: ${data.error}`);
          }
        } catch (error) {
          errorCount++;
          errors.push(`${room.buildingName}-${room.roomNumber}: เกิดข้อผิดพลาด`);
        }
      }

      // Show results
      if (successCount > 0) {
        toast.success(`นำเข้าสำเร็จ ${successCount} ห้อง`);
      }
      if (errorCount > 0) {
        toast.error(`นำเข้าไม่สำเร็จ ${errorCount} ห้อง:\n${errors.slice(0, 3).join('\n')}`);
      }

      // Close modal and refresh
      setShowImportModal(false);
      setImportFile(null);
      setImportPreview([]);
      fetchRooms();
    } catch (error) {
      console.error('Error importing rooms:', error);
      toast.error('เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
    } finally {
      setImporting(false);
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

  // Batch edit handlers
  const handleBatchEditChange = (roomId: string, field: keyof EventRoom, value: any) => {
    setEditedRooms(prev => ({
      ...prev,
      [roomId]: {
        ...(prev[roomId] || rooms.find(r => r.roomId === roomId)!),
        [field]: value,
      },
    }));
  };

  const handleSaveBatchEdit = async () => {
    const changedRooms = Object.entries(editedRooms).filter(([roomId, editedRoom]) => {
      const original = rooms.find(r => r.roomId === roomId);
      if (!original) return false;
      return (
        original.buildingName !== editedRoom.buildingName ||
        original.roomNumber !== editedRoom.roomNumber ||
        original.roomTypeCategory !== editedRoom.roomTypeCategory ||
        original.maxOccupancy !== editedRoom.maxOccupancy ||
        original.isLocked !== editedRoom.isLocked ||
        original.note !== editedRoom.note
      );
    });

    if (changedRooms.length === 0) {
      toast.error('ไม่มีการเปลี่ยนแปลงข้อมูล');
      return;
    }

    try {
      setBatchSaving(true);
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const [roomId, editedRoom] of changedRooms) {
        try {
          const response = await fetch(`/api/events/${eventId}/rooms/${roomId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              buildingName: editedRoom.buildingName,
              roomNumber: editedRoom.roomNumber,
              roomTypeCategory: editedRoom.roomTypeCategory,
              maxOccupancy: editedRoom.maxOccupancy,
              isLocked: editedRoom.isLocked,
              note: editedRoom.note,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            const data = await response.json();
            errorCount++;
            errors.push(`${editedRoom.buildingName}-${editedRoom.roomNumber}: ${data.error}`);
          }
        } catch (error) {
          errorCount++;
          errors.push(`${editedRoom.buildingName}-${editedRoom.roomNumber}: เกิดข้อผิดพลาด`);
        }
      }

      if (successCount > 0) {
        toast.success(`บันทึกสำเร็จ ${successCount} ห้อง`);
      }
      if (errorCount > 0) {
        toast.error(`บันทึกไม่สำเร็จ ${errorCount} ห้อง:\n${errors.slice(0, 3).join('\n')}`);
      }

      setEditedRooms({});
      fetchRooms();
    } catch (error) {
      console.error('Error saving batch edit:', error);
      toast.error('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setBatchSaving(false);
    }
  };

  const handleCancelBatchEdit = () => {
    setEditedRooms({});
    toast.success('ยกเลิกการแก้ไข');
  };

  const handleLeaveRoom = async (occupant: RoomOccupant, currentRoomId: string) => {
    if (!confirm(`ต้องการปล่อยห้องสำหรับ ${occupant.attendeeName} ใช่หรือไม่?\n\nห้องจะกลับมาว่างและผู้เข้าพักจะกลับไปเป็นสถานะยังไม่ได้ระบุห้อง`)) {
      return;
    }

    try {
      // Fetch current registration to get room assignments
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to fetch event data');
      const eventData = await eventResponse.json();
      const registration = eventData.attendees.find(
        (a: any) => a.registration.registrationId === occupant.registrationId
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

      // Remove the assignment for this attendee
      const updatedAssignments = roomAssignments.filter(
        (assignment) => assignment.attendeeIndex !== occupant.attendeeIndex
      );

      // Update registration with new room assignments
      const updateResponse = await fetch(`/api/events/${eventId}/admin-update-registration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationId: occupant.registrationId,
          updateData: {
            room_assignments: JSON.stringify(updatedAssignments),
          },
        }),
      });

      if (!updateResponse.ok) {
        const data = await updateResponse.json();
        throw new Error(data.error || 'Failed to leave room');
      }

      // ✅ In-place update: Remove occupant from the room without full refresh
      setRoomsWithOccupants(prevRooms =>
        prevRooms.map(room => {
          if (room.roomId === currentRoomId) {
            return {
              ...room,
              occupants: room.occupants.filter(
                occ => !(occ.registrationId === occupant.registrationId && occ.attendeeIndex === occupant.attendeeIndex)
              ),
            };
          }
          return room;
        })
      );

      toast.success('ปล่อยห้องสำเร็จ');
    } catch (error: any) {
      console.error('Error leaving room:', error);
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

      // ✅ In-place update: Move occupant between rooms without full refresh
      setRoomsWithOccupants(prevRooms => {
        // Find the occupant object from the old room
        let occupantToMove: RoomOccupant | null = null;
        const roomsAfterRemoval = prevRooms.map(room => {
          if (room.roomId === transferData.currentRoomId) {
            const occupantIndex = room.occupants.findIndex(
              occ => occ.registrationId === transferData.registrationId && occ.attendeeIndex === transferData.attendeeIndex
            );
            if (occupantIndex >= 0) {
              occupantToMove = room.occupants[occupantIndex];
              return {
                ...room,
                occupants: room.occupants.filter((_, idx) => idx !== occupantIndex),
              };
            }
          }
          return room;
        });

        // Add occupant to new room
        if (occupantToMove) {
          return roomsAfterRemoval.map(room => {
            if (room.roomId === transferData.newRoomId) {
              return {
                ...room,
                occupants: [...room.occupants, occupantToMove!],
              };
            }
            return room;
          });
        }

        return roomsAfterRemoval;
      });

      toast.success('ย้ายห้องสำเร็จ');
      setTransferModalOpen(false);
      setTransferData(null);
    } catch (error: any) {
      console.error('Error transferring room:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาด');
    } finally {
      setTransferring(false);
    }
  };

  // Handler to open bulk transfer modal
  const handleOpenBulkTransferModal = (room: RoomWithOccupants) => {
    if (room.occupants.length === 0) {
      toast.error('ห้องนี้ไม่มีผู้พัก');
      return;
    }

    // Find available rooms that can accommodate all occupants
    const availableRooms = roomsWithOccupants.filter(r => {
      if (r.roomId === room.roomId) return false; // Exclude current room
      if (r.isLocked) return false; // Exclude locked rooms
      const availableSpace = r.maxOccupancy - r.occupants.length;
      return availableSpace >= room.occupants.length; // Can fit all occupants
    });

    if (availableRooms.length === 0) {
      toast.error(`ไม่มีห้องว่างที่รองรับผู้พัก ${room.occupants.length} คนได้`);
      return;
    }

    setBulkTransferData({
      currentRoomId: room.roomId,
      currentRoomNumber: `${room.buildingName}-${room.roomNumber}`,
      occupants: room.occupants,
      availableRooms,
      selectedNewRoomId: '',
    });
    setBulkTransferModalOpen(true);
  };

  // Handler to execute bulk room transfer
  const handleBulkTransferRoom = async () => {
    if (!bulkTransferData || !bulkTransferData.selectedNewRoomId) {
      toast.error('กรุณาเลือกห้องปลายทาง');
      return;
    }

    try {
      setBulkTransferring(true);

      // Fetch event data to get all registrations
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to fetch event data');
      const eventData = await eventResponse.json();

      // Group occupants by registration ID
      const updates: Array<{
        registrationId: string;
        newAssignments: Array<{ roomId: string; attendeeIndex: number }>;
      }> = [];

      for (const occupant of bulkTransferData.occupants) {
        const registration = eventData.attendees.find(
          (a: any) => a.registration.registrationId === occupant.registrationId
        );

        if (!registration) {
          console.warn(`Registration not found: ${occupant.registrationId}`);
          continue;
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
          if (assignment.attendeeIndex === occupant.attendeeIndex) {
            return { ...assignment, roomId: bulkTransferData.selectedNewRoomId };
          }
          return assignment;
        });

        updates.push({
          registrationId: occupant.registrationId,
          newAssignments: updatedAssignments,
        });
      }

      // Execute all updates
      for (const update of updates) {
        const updateResponse = await fetch(`/api/events/${eventId}/admin-update-registration`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            registrationId: update.registrationId,
            updateData: {
              room_assignments: JSON.stringify(update.newAssignments),
            },
          }),
        });

        if (!updateResponse.ok) {
          const data = await updateResponse.json();
          throw new Error(data.error || `Failed to update ${update.registrationId}`);
        }
      }

      // Update UI state
      setRoomsWithOccupants(prevRooms => {
        // Remove all occupants from current room
        const roomsAfterRemoval = prevRooms.map(room => {
          if (room.roomId === bulkTransferData.currentRoomId) {
            return { ...room, occupants: [] };
          }
          return room;
        });

        // Add all occupants to new room
        return roomsAfterRemoval.map(room => {
          if (room.roomId === bulkTransferData.selectedNewRoomId) {
            return {
              ...room,
              occupants: [...room.occupants, ...bulkTransferData.occupants],
            };
          }
          return room;
        });
      });

      toast.success(`ย้ายผู้พัก ${bulkTransferData.occupants.length} คนสำเร็จ`);
      setBulkTransferModalOpen(false);
      setBulkTransferData(null);
    } catch (error: any) {
      console.error('Error bulk transferring room:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาด');
    } finally {
      setBulkTransferring(false);
    }
  };

  const handleExportToExcel = async () => {
    try {
      // Fetch full event data with payment information
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to fetch event data');
      const eventData = await eventResponse.json();
      const registrations = eventData.attendees || [];

      // Build payment status map by registration ID
      const paymentStatusMap = new Map<string, {
        hasPendingSlip: boolean;
        isPaid: boolean;
        totalAmount: number;
        paidAmount: number;
      }>();

      registrations.forEach((attendee: any) => {
        const reg = attendee.registration;
        const totalAmount = Number(reg.totalAmount) || 0;

        // Calculate total paid amount based on event's payment mode
        let paidAmount = 0;
        if (eventData.event.paymentMode === 'full') {
          // Full payment mode: use fullPaymentAmountPaid
          paidAmount = Number(reg.fullPaymentAmountPaid) || 0;
        } else {
          // Deposit mode: sum all payment components
          paidAmount = (Number(reg.depositAmountPaid) || 0) +
                      (Number(reg.remainingAmountPaid) || 0);
        }

        // Add additional payments (applies to both modes)
        paidAmount += (Number(reg.additionalPaymentAmountPaid) || 0);

        // ✅ Check isPaid using amount comparison (most reliable for all cases)
        // This handles: full payment, deposit+remaining, and additional payments
        const isPaid = totalAmount > 0 && paidAmount >= totalAmount;

        // ✅ Check for PENDING slips (submitted but not yet approved)
        // A slip is pending if:
        // 1. Full payment mode: has fullPaymentSlipUrl but fullPaymentPaid is false
        // 2. Deposit mode: has depositSlipUrl but depositPaid is false, OR has remainingSlipUrl but remainingPaid is false
        let hasPendingSlip = false;

        if (eventData.event.paymentMode === 'full') {
          // Full payment mode: check if slip exists but not approved
          hasPendingSlip = !!(reg.fullPaymentSlipUrl && !reg.fullPaymentPaid);
        } else {
          // Deposit mode: check each payment stage
          const depositPending = !!(reg.depositSlipUrl && !reg.depositPaid);
          const remainingPending = !!(reg.remainingSlipUrl && !reg.remainingPaid);
          hasPendingSlip = depositPending || remainingPending;
        }

        paymentStatusMap.set(reg.registrationId, {
          hasPendingSlip,
          isPaid,
          totalAmount,
          paidAmount,
        });
      });

      // Find max occupants per room in this event to determine number of columns needed
      const maxOccupantsInEvent = Math.max(
        ...roomsWithOccupants.map(room => room.occupants.length),
        1 // At least 1 column
      );

      // Prepare data for Excel
      const excelData: any[] = [];

      // Group rooms by building
      const groupedRooms = roomsWithOccupants.reduce((acc, room) => {
        if (!acc[room.buildingName]) acc[room.buildingName] = [];
        acc[room.buildingName].push(room);
        return acc;
      }, {} as Record<string, RoomWithOccupants[]>);

      // Sort buildings alphabetically
      const sortedBuildings = Object.keys(groupedRooms).sort();

      sortedBuildings.forEach(buildingName => {
        const buildingRooms = groupedRooms[buildingName];

        // Sort rooms by room number
        buildingRooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));

        buildingRooms.forEach(room => {
          if (room.occupants.length === 0) {
            // Empty room - one row with empty occupant columns
            const rowData: any = {
              'อาคาร': buildingName,
              'เลขห้อง': room.roomNumber,
              'ประเภทห้อง': room.roomTypeCategory || '-',
              'จำนวนผู้พัก': `0/${room.maxOccupancy}`,
              'สถานะห้อง': room.isLocked ? 'ล็อค' : 'ว่าง',
            };

            // Add empty occupant columns
            for (let i = 1; i <= maxOccupantsInEvent; i++) {
              rowData[`ผู้เข้าพัก ${i}`] = '-';
            }

            rowData['บริษัท'] = '-';
            rowData['รหัสการจอง'] = '-';
            rowData['สถานะการชำระเงิน'] = '-';
            rowData['หมายเหตุ'] = room.note || '-';
            rowData['_roomStatus'] = room.isLocked ? 'locked' : 'empty';
            rowData['_paymentStatus'] = 'none';

            excelData.push(rowData);
          } else {
            // ONE ROW per room - consolidate all occupants regardless of registration ID
            const rowData: any = {
              'อาคาร': buildingName,
              'เลขห้อง': room.roomNumber,
              'ประเภทห้อง': room.roomTypeCategory || '-',
              'จำนวนผู้พัก': `${room.occupants.length}/${room.maxOccupancy}`,
              'สถานะห้อง': room.isLocked ? 'ล็อค' : 'มีผู้พัก',
            };

            // Add individual occupant names in separate columns with payment status metadata
            const occupantPaymentData: Array<{ name: string; status: 'paid' | 'pending' | 'partial' | 'unpaid' | 'none' }> = [];

            for (let i = 1; i <= maxOccupantsInEvent; i++) {
              const occupant = room.occupants[i - 1];
              if (occupant) {
                const payment = paymentStatusMap.get(occupant.registrationId);
                let status: 'paid' | 'pending' | 'partial' | 'unpaid' | 'none' = 'none';

                if (payment) {
                  if (payment.isPaid) {
                    // Fully paid
                    status = 'paid';
                  } else if (payment.hasPendingSlip) {
                    // Has slip waiting for approval
                    status = 'pending';
                  } else if (payment.paidAmount > 0 && payment.totalAmount > 0) {
                    // Has paid some amount (approved) but not full amount yet
                    status = 'partial';
                  } else {
                    // No payment at all or no slip
                    status = 'unpaid';
                  }
                }

                rowData[`ผู้เข้าพัก ${i}`] = occupant.attendeeName;
                occupantPaymentData.push({ name: occupant.attendeeName, status });
              } else {
                rowData[`ผู้เข้าพัก ${i}`] = '-';
                occupantPaymentData.push({ name: '-', status: 'none' });
              }
            }

            // Store occupant payment statuses for cell coloring
            rowData['_occupantPayments'] = occupantPaymentData;

            // Collect unique companies and registration IDs with their payment statuses
            const companyPaymentMap = new Map<string, 'paid' | 'pending' | 'partial' | 'unpaid'>();
            const registrationPaymentMap = new Map<string, 'paid' | 'pending' | 'partial' | 'unpaid'>();

            room.occupants.forEach(occ => {
              const payment = paymentStatusMap.get(occ.registrationId);
              let status: 'paid' | 'pending' | 'partial' | 'unpaid' = 'unpaid';

              if (payment) {
                if (payment.isPaid) {
                  status = 'paid';
                } else if (payment.hasPendingSlip) {
                  status = 'pending';
                } else if (payment.paidAmount > 0 && payment.totalAmount > 0) {
                  status = 'partial';
                } else {
                  status = 'unpaid';
                }
              }

              companyPaymentMap.set(occ.companyName, status);
              registrationPaymentMap.set(occ.registrationId, status);
            });

            const uniqueCompanies = [...new Set(room.occupants.map(occ => occ.companyName))];
            const uniqueRegistrationIds = [...new Set(room.occupants.map(occ => occ.registrationId))];

            // Store metadata for rich text formatting
            rowData['_companyPayments'] = uniqueCompanies.map(company => ({
              name: company,
              status: companyPaymentMap.get(company) || 'unpaid'
            }));
            rowData['_registrationPayments'] = uniqueRegistrationIds.map(id => ({
              id: id.slice(0, 8),
              status: registrationPaymentMap.get(id) || 'unpaid'
            }));

            // Join with comma if multiple (for plain text fallback)
            rowData['บริษัท'] = uniqueCompanies.join(', ');
            rowData['รหัสการจอง'] = uniqueRegistrationIds.map(id => id.slice(0, 8)).join(', ');

            // Collect ALL unique payment statuses in the room and display them
            const uniqueStatuses = [...new Set(occupantPaymentData.map(occ => occ.status).filter(s => s !== 'none'))];
            const statusTextMap: Record<string, string> = {
              'paid': 'ชำระแล้ว',
              'pending': 'ส่งสลิปแล้ว รอตรวจสอบ',
              'partial': 'ชำระบางส่วนแล้ว รอชำระเพิ่ม',
              'unpaid': 'ยังไม่ชำระ/ไม่มีสลิป'
            };

            const paymentStatusTexts = uniqueStatuses.map(s => statusTextMap[s]).filter(Boolean);
            const paymentStatus = paymentStatusTexts.length > 0 ? paymentStatusTexts.join(', ') : 'ชำระแล้ว';

            // Determine overall payment status code (for backward compatibility if needed)
            let paymentStatusCode: 'paid' | 'pending' | 'partial' | 'unpaid' = 'paid';
            if (uniqueStatuses.includes('unpaid')) {
              paymentStatusCode = 'unpaid';
            } else if (uniqueStatuses.includes('partial')) {
              paymentStatusCode = 'partial';
            } else if (uniqueStatuses.includes('pending')) {
              paymentStatusCode = 'pending';
            }

            rowData['สถานะการชำระเงิน'] = paymentStatus;
            rowData['หมายเหตุ'] = room.note || '-';
            rowData['_roomStatus'] = room.isLocked ? 'locked' : 'occupied';
            rowData['_paymentStatus'] = paymentStatusCode;

            excelData.push(rowData);
          }
        });
      });

      // Build header columns dynamically
      const headerColumns = ['อาคาร', 'เลขห้อง', 'ประเภทห้อง', 'จำนวนผู้พัก', 'สถานะห้อง'];
      for (let i = 1; i <= maxOccupantsInEvent; i++) {
        headerColumns.push(`ผู้เข้าพัก ${i}`);
      }
      headerColumns.push('บริษัท', 'รหัสการจอง', 'สถานะการชำระเงิน', 'หมายเหตุ');

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData, {
        header: headerColumns
      });

      // Set column widths dynamically
      const columnWidths = [
        { wch: 10 },  // อาคาร
        { wch: 12 },  // เลขห้อง
        { wch: 15 },  // ประเภทห้อง
        { wch: 15 },  // จำนวนผู้พัก
        { wch: 12 },  // สถานะห้อง
      ];
      // Add widths for occupant columns
      for (let i = 1; i <= maxOccupantsInEvent; i++) {
        columnWidths.push({ wch: 30 }); // ผู้เข้าพัก columns
      }
      columnWidths.push(
        { wch: 40 },  // บริษัท
        { wch: 25 },  // รหัสการจอง
        { wch: 25 },  // สถานะการชำระเงิน
        { wch: 30 },  // หมายเหตุ
      );

      ws['!cols'] = columnWidths;

      // Apply cell styling with colors
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const row = excelData[R - 1];
        if (!row) continue;

        const roomStatus = row._roomStatus;
        const paymentStatus = row._paymentStatus;

        // Determine background color
        let fillColor = 'FFFFFF'; // White default
        let fontColor = '000000'; // Black default

        if (roomStatus === 'locked') {
          // Locked room: Red pastel background with dark red text
          fillColor = 'FFCCCC'; // Light red/pink pastel
          fontColor = '8B0000'; // Dark red
        } else if (roomStatus === 'empty') {
          // Empty room: Green background
          fillColor = 'CCFFCC'; // Light green
          fontColor = '006400'; // Dark green
        } else if (roomStatus === 'occupied') {
          // Room with occupants - color based on payment status
          if (paymentStatus === 'unpaid') {
            // Unpaid/no slip: Orange
            fillColor = 'FFE5CC'; // Light orange
            fontColor = 'CC5500'; // Dark orange
          } else if (paymentStatus === 'partial') {
            // Partial payment: Light purple/lavender
            fillColor = 'E6D9F2'; // Light lavender
            fontColor = '6A3D9A'; // Dark purple
          } else if (paymentStatus === 'pending') {
            // Slip submitted, pending: Yellow/Gold
            fillColor = 'FFFFCC'; // Light yellow
            fontColor = '996600'; // Dark yellow/brown
          } else if (paymentStatus === 'paid') {
            // Paid: Light blue
            fillColor = 'CCE5FF'; // Light blue
            fontColor = '003366'; // Dark blue
          }
        }

        // Apply fill to all cells in the row
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) continue;

          // Determine alignment based on column
          let horizontalAlign: 'left' | 'center' | 'right' = 'center';
          // Occupant name columns and company column should be left-aligned
          const occupantStartCol = 5; // After 'สถานะห้อง'
          const occupantEndCol = 5 + maxOccupantsInEvent - 1;
          const companyCol = 5 + maxOccupantsInEvent; // บริษัท column

          if ((C >= occupantStartCol && C <= occupantEndCol) || C === companyCol) {
            horizontalAlign = 'left';
          }

          // Determine cell-specific colors for occupant columns
          let cellFillColor = fillColor;
          let cellFontColor = fontColor;

          // Check if this is an occupant column and has payment status data
          if (C >= occupantStartCol && C <= occupantEndCol && row._occupantPayments) {
            const occupantIndex = C - occupantStartCol;
            const occupantPayment = row._occupantPayments[occupantIndex];

            if (occupantPayment && occupantPayment.status !== 'none') {
              // Apply individual color based on this occupant's payment status
              if (occupantPayment.status === 'paid') {
                cellFillColor = 'CCE5FF'; // Light blue
                cellFontColor = '003366'; // Dark blue
              } else if (occupantPayment.status === 'partial') {
                cellFillColor = 'E6D9F2'; // Light lavender
                cellFontColor = '6A3D9A'; // Dark purple
              } else if (occupantPayment.status === 'pending') {
                cellFillColor = 'FFFFCC'; // Light yellow
                cellFontColor = '996600'; // Dark yellow/brown
              } else if (occupantPayment.status === 'unpaid') {
                cellFillColor = 'FFE5CC'; // Light orange
                cellFontColor = 'CC5500'; // Dark orange
              }
            }
          }

          // Helper function to determine worst payment status for company/registration ID cells
          const getWorstStatus = (statuses: Array<'paid' | 'pending' | 'partial' | 'unpaid'>): 'paid' | 'pending' | 'partial' | 'unpaid' => {
            if (statuses.includes('unpaid')) return 'unpaid';
            if (statuses.includes('partial')) return 'partial';
            if (statuses.includes('pending')) return 'pending';
            return 'paid';
          };

          // Apply color for company column based on worst payment status
          const registrationIdCol = companyCol + 1; // รหัสการจอง column
          if (C === companyCol && row._companyPayments && row._companyPayments.length > 0) {
            const statuses = row._companyPayments.map((c: any) => c.status);
            const worstStatus = getWorstStatus(statuses);

            if (worstStatus === 'paid') {
              cellFillColor = 'CCE5FF'; // Light blue
              cellFontColor = '003366'; // Dark blue
            } else if (worstStatus === 'partial') {
              cellFillColor = 'E6D9F2'; // Light lavender
              cellFontColor = '6A3D9A'; // Dark purple
            } else if (worstStatus === 'pending') {
              cellFillColor = 'FFFFCC'; // Light yellow
              cellFontColor = '996600'; // Dark yellow/brown
            } else if (worstStatus === 'unpaid') {
              cellFillColor = 'FFE5CC'; // Light orange
              cellFontColor = 'CC5500'; // Dark orange
            }
          }

          // Apply color for registration ID column based on worst payment status
          if (C === registrationIdCol && row._registrationPayments && row._registrationPayments.length > 0) {
            const statuses = row._registrationPayments.map((r: any) => r.status);
            const worstStatus = getWorstStatus(statuses);

            if (worstStatus === 'paid') {
              cellFillColor = 'CCE5FF'; // Light blue
              cellFontColor = '003366'; // Dark blue
            } else if (worstStatus === 'partial') {
              cellFillColor = 'E6D9F2'; // Light lavender
              cellFontColor = '6A3D9A'; // Dark purple
            } else if (worstStatus === 'pending') {
              cellFillColor = 'FFFFCC'; // Light yellow
              cellFontColor = '996600'; // Dark yellow/brown
            } else if (worstStatus === 'unpaid') {
              cellFillColor = 'FFE5CC'; // Light orange
              cellFontColor = 'CC5500'; // Dark orange
            }
          }

          ws[cellAddress].s = {
            fill: {
              fgColor: { rgb: cellFillColor }
            },
            font: {
              color: { rgb: cellFontColor }
            },
            alignment: {
              vertical: 'center',
              horizontal: horizontalAlign,
              wrapText: true
            },
            border: {
              top: { style: 'thin', color: { rgb: 'CCCCCC' } },
              bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
              left: { style: 'thin', color: { rgb: 'CCCCCC' } },
              right: { style: 'thin', color: { rgb: 'CCCCCC' } }
            }
          };
        }
      }

      // Style header row
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
        if (!ws[cellAddress]) continue;

        ws[cellAddress].s = {
          fill: {
            fgColor: { rgb: '4472C4' } // Blue header
          },
          font: {
            color: { rgb: 'FFFFFF' }, // White text
            bold: true
          },
          alignment: {
            vertical: 'center',
            horizontal: 'center',
            wrapText: true
          },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        };
      }

      XLSX.utils.book_append_sheet(wb, ws, 'สรุปห้องพัก');

      // Download file
      const fileName = `Room_Summary_${eventName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success('Export Excel สำเร็จ');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('เกิดข้อผิดพลาดในการ Export Excel');
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
              {/* Toolbar */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-gray-600">
                    จำนวนห้องทั้งหมด: {rooms.length} ห้อง
                  </p>
                  {/* View Mode Toggle */}
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => {
                        setViewMode('card');
                        setEditedRooms({});
                      }}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        viewMode === 'card'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      title="มุมมองการ์ด"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                        viewMode === 'table'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      title="มุมมองตาราง (Batch Edit)"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                    title="ดาวน์โหลด Template Excel"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="hidden sm:inline">Template</span>
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                    title="นำเข้าข้อมูลจาก Excel/CSV"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="hidden sm:inline">Import</span>
                  </button>
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
              ) : viewMode === 'table' ? (
                /* Table View for Batch Edit */
                <div className="space-y-4">
                  {/* Batch Edit Actions */}
                  {Object.keys(editedRooms).length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                      <p className="text-sm text-blue-900">
                        มีการเปลี่ยนแปลง {Object.keys(editedRooms).length} ห้อง
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCancelBatchEdit}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
                        >
                          ยกเลิก
                        </button>
                        <button
                          onClick={handleSaveBatchEdit}
                          disabled={batchSaving}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
                        >
                          {batchSaving ? 'กำลังบันทึก...' : `บันทึกทั้งหมด`}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Table */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">อาคาร</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">เลขห้อง</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ประเภทห้อง</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">จำนวนคน</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">สถานะ</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">หมายเหตุ</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">จัดการ</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {rooms.map((room) => {
                            const editedRoom = editedRooms[room.roomId] || room;
                            const isEdited = editedRooms[room.roomId] !== undefined;

                            return (
                              <tr key={room.roomId} className={isEdited ? 'bg-yellow-50' : 'hover:bg-gray-50'}>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <input
                                    type="text"
                                    value={editedRoom.buildingName}
                                    onChange={(e) => handleBatchEditChange(room.roomId, 'buildingName', e.target.value)}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <input
                                    type="text"
                                    value={editedRoom.roomNumber}
                                    onChange={(e) => handleBatchEditChange(room.roomId, 'roomNumber', e.target.value)}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <input
                                    type="text"
                                    value={editedRoom.roomTypeCategory || ''}
                                    onChange={(e) => handleBatchEditChange(room.roomId, 'roomTypeCategory', e.target.value)}
                                    placeholder="Twin, Double, etc."
                                    className="w-32 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <input
                                    type="number"
                                    min="1"
                                    value={editedRoom.maxOccupancy}
                                    onChange={(e) => handleBatchEditChange(room.roomId, 'maxOccupancy', parseInt(e.target.value) || 1)}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editedRoom.isLocked || false}
                                      onChange={(e) => handleBatchEditChange(room.roomId, 'isLocked', e.target.checked)}
                                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-700">ล็อค</span>
                                  </label>
                                </td>
                                <td className="px-3 py-3">
                                  <input
                                    type="text"
                                    value={editedRoom.note || ''}
                                    onChange={(e) => handleBatchEditChange(room.roomId, 'note', e.target.value)}
                                    placeholder="หมายเหตุ"
                                    className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <button
                                    onClick={() => handleDeleteRoom(room.roomId)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="ลบ"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                /* Card View */
                <div className="space-y-2">
                  {/* Group by building */}
                  {Object.entries(
                    rooms.reduce((acc, room) => {
                      if (!acc[room.buildingName]) acc[room.buildingName] = [];
                      acc[room.buildingName].push(room);
                      return acc;
                    }, {} as Record<string, EventRoom[]>)
                  ).map(([buildingName, buildingRooms]) => {
                    const availableRooms = buildingRooms.filter(r => !r.isLocked).length;

                    return (
                      <div key={buildingName} className="space-y-2">
                        <h3 className="font-semibold text-gray-900 mt-4 mb-2 flex items-center justify-between">
                          <span>อาคาร {buildingName}</span>
                          <span className="text-sm font-normal text-gray-600">
                            {buildingRooms.length} ห้อง · พร้อมใช้งาน {availableRooms} ห้อง
                          </span>
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
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-900">
                    {roomsWithOccupants.filter(r => r.occupants.length === 0 && !r.isLocked).length}
                  </div>
                  <div className="text-sm text-purple-700">ห้องว่าง</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-amber-900">
                    {roomsWithOccupants.reduce((sum, r) => sum + r.occupants.length, 0)}
                  </div>
                  <div className="text-sm text-amber-700">ผู้เข้าพักทั้งหมด</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-900">
                    {roomsWithOccupants.filter(r => r.isLocked).length}
                  </div>
                  <div className="text-sm text-red-700">ห้องถูกล็อค</div>
                </div>
              </div>

              {/* Export Excel Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleExportToExcel}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                  title="Export สรุปห้องพักเป็น Excel"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export Excel
                </button>
              </div>

              {/* Filter and Search Controls */}
              <div className="space-y-4">
                {/* Filter Buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setRoomFilter('all')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      roomFilter === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    onClick={() => setRoomFilter('1-person')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      roomFilter === '1-person'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ห้องพักเดี่ยว (1 คน)
                  </button>
                  <button
                    onClick={() => setRoomFilter('2-person')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      roomFilter === '2-person'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ห้องพัก 2 คน
                  </button>
                  <button
                    onClick={() => setRoomFilter('3-person')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      roomFilter === '3-person'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ห้องพัก 3 คน
                  </button>
                  <button
                    onClick={() => setRoomFilter('empty')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      roomFilter === 'empty'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ห้องว่าง
                  </button>
                </div>

                {/* Search Box */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="ค้นหา เลขห้อง (เช่น B-101), ชื่อผู้เข้าพัก, ชื่อบริษัท, รหัสการจอง..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
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
                  {(() => {
                    // Apply filters and search
                    let filteredRooms = roomsWithOccupants.filter(room => {
                      // Apply room type filter
                      if (roomFilter === 'empty') return room.occupants.length === 0 && !room.isLocked;
                      if (roomFilter === '1-person') return room.maxOccupancy === 1;
                      if (roomFilter === '2-person') return room.maxOccupancy === 2;
                      if (roomFilter === '3-person') return room.maxOccupancy === 3;
                      return true; // 'all'
                    });

                    // Apply search query
                    if (searchQuery.trim()) {
                      const query = searchQuery.toLowerCase().trim();
                      filteredRooms = filteredRooms.filter(room => {
                        // Search in room number and building
                        if (room.roomNumber.toLowerCase().includes(query)) return true;
                        if (room.buildingName.toLowerCase().includes(query)) return true;

                        // Search in combined format (e.g., "B-101", "A-205")
                        const combinedRoomId = `${room.buildingName}-${room.roomNumber}`.toLowerCase();
                        if (combinedRoomId.includes(query)) return true;

                        // Search in occupants
                        return room.occupants.some(occupant => {
                          if (occupant.attendeeName.toLowerCase().includes(query)) return true;
                          if (occupant.companyName.toLowerCase().includes(query)) return true;
                          if (occupant.registrationId.toLowerCase().includes(query)) return true;
                          if (occupant.note && occupant.note.toLowerCase().includes(query)) return true;
                          return false;
                        });
                      });
                    }

                    // Group filtered rooms by building
                    const groupedRooms = filteredRooms.reduce((acc, room) => {
                      if (!acc[room.buildingName]) acc[room.buildingName] = [];
                      acc[room.buildingName].push(room);
                      return acc;
                    }, {} as Record<string, RoomWithOccupants[]>);

                    // Show message if no results
                    if (Object.keys(groupedRooms).length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-500">
                          ไม่พบห้องพักที่ตรงกับเงื่อนไข
                        </div>
                      );
                    }

                    return Object.entries(groupedRooms).map(([buildingName, buildingRooms]) => {
                    const emptyRoomsCount = buildingRooms.filter(r => r.occupants.length === 0 && !r.isLocked).length;
                    const totalOccupants = buildingRooms.reduce((sum, r) => sum + r.occupants.length, 0);
                    const isExpanded = expandedBuildings[buildingName] ?? false; // Default to collapsed

                    return (
                      <div key={buildingName} className="border border-gray-300 rounded-lg overflow-hidden">
                        {/* Building Header - Clickable */}
                        <button
                          onClick={() => setExpandedBuildings(prev => ({ ...prev, [buildingName]: !isExpanded }))}
                          className="w-full bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-colors p-4 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`w-5 h-5 text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <h3 className="font-semibold text-gray-900 text-lg">
                              อาคาร {buildingName}
                            </h3>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-gray-600">
                              {buildingRooms.length} ห้อง
                            </span>
                            <span className="text-green-600 font-medium">
                              ผู้พัก {totalOccupants} คน
                            </span>
                            <span className="text-purple-600 font-medium">
                              ว่าง {emptyRoomsCount} ห้อง
                            </span>
                          </div>
                        </button>

                        {/* Building Rooms - Collapsible */}
                        {isExpanded && (
                        <div className="p-4 space-y-2 bg-white">
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
                                {/* Bulk Transfer Button */}
                                {!isEmpty && !isLocked && (
                                  <button
                                    onClick={() => handleOpenBulkTransferModal(room)}
                                    className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-2"
                                    title="สลับห้องทั้งหมด"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                    </svg>
                                    สลับห้องทั้งหมด
                                  </button>
                                )}
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
                                      <div className="flex gap-2 ml-3">
                                        <button
                                          onClick={() => handleLeaveRoom(occupant, room.roomId)}
                                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                                          title="ปล่อยห้อง"
                                        >
                                          ปล่อยห้อง
                                        </button>
                                        <button
                                          onClick={() => handleOpenTransferModal(occupant, room.roomId)}
                                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                                          title="ย้ายห้อง"
                                        >
                                          ย้าย
                                        </button>
                                      </div>
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
                        )}
                      </div>
                    );
                  });
                  })()}
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

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">นำเข้าข้อมูลห้องพัก</h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportPreview([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">วิธีการใช้งาน:</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
                  <li>คลิกปุ่ม "Template" เพื่อดาวน์โหลดไฟล์ตัวอย่าง</li>
                  <li>เปิดไฟล์ด้วย Excel และกรอกข้อมูลห้องพักตามรูปแบบ</li>
                  <li>บันทึกไฟล์และอัปโหลดที่นี่</li>
                  <li>ตรวจสอบข้อมูลและกดยืนยันการนำเข้า</li>
                </ol>
              </div>

              {/* Required Columns Info */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">คอลัมน์ที่ต้องมี:</h4>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li><strong>ชื่ออาคาร:</strong> ชื่อของอาคาร (เช่น A, B, C)</li>
                  <li><strong>เลขห้อง:</strong> หมายเลขห้อง (เช่น 101, 102)</li>
                  <li><strong>ประเภทห้อง:</strong> ประเภทห้องพัก (เช่น Twin, Double, Suite) - ไม่บังคับ</li>
                  <li><strong>จำนวนผู้พักสูงสุด:</strong> จำนวนคนที่รองรับได้ (ตัวเลข)</li>
                  <li><strong>ล็อคห้อง (TRUE/FALSE):</strong> ระบุว่าต้องการล็อคห้องหรือไม่</li>
                  <li><strong>หมายเหตุ:</strong> ข้อความเพิ่มเติม - ไม่บังคับ</li>
                </ul>
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลือกไฟล์ Excel/CSV
                </label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {importFile && (
                  <p className="text-sm text-gray-600 mt-1">
                    ไฟล์ที่เลือก: {importFile.name}
                  </p>
                )}
              </div>

              {/* Preview */}
              {importPreview.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">
                    ตัวอย่างข้อมูล ({importPreview.length} ห้อง)
                  </h4>
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">อาคาร</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">ห้อง</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">ประเภท</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">จำนวนคน</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">ล็อค</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {importPreview.map((room, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-900">{room.buildingName}</td>
                            <td className="px-3 py-2 text-gray-900">{room.roomNumber}</td>
                            <td className="px-3 py-2 text-gray-600">{room.roomTypeCategory || '-'}</td>
                            <td className="px-3 py-2 text-gray-900 text-center">{room.maxOccupancy}</td>
                            <td className="px-3 py-2">
                              {room.isLocked ? (
                                <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">🔒 ล็อค</span>
                              ) : (
                                <span className="text-xs text-green-600">ไม่ล็อค</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-xs">{room.note || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                  setImportPreview([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleImportRooms}
                disabled={importing || importPreview.length === 0}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'กำลังนำเข้า...' : `นำเข้า ${importPreview.length} ห้อง`}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Bulk Transfer Modal */}
      {bulkTransferModalOpen && bulkTransferData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">สลับห้องพักทั้งหมด</h3>

            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-gray-800 mb-2">
                <strong>ห้องต้นทาง:</strong> {bulkTransferData.currentRoomNumber}
              </p>
              <p className="text-sm text-gray-800 mb-3">
                <strong>จำนวนผู้พัก:</strong> {bulkTransferData.occupants.length} คน
              </p>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-700 mb-1">รายชื่อผู้พัก:</p>
                {bulkTransferData.occupants.map((occupant, idx) => (
                  <div key={`${occupant.registrationId}-${occupant.attendeeIndex}`} className="text-xs text-gray-600 pl-3">
                    {idx + 1}. {occupant.attendeeName} ({occupant.companyName})
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลือกห้องปลายทาง * (แสดงเฉพาะห้องที่รองรับผู้พัก {bulkTransferData.occupants.length} คน)
              </label>
              <select
                value={bulkTransferData.selectedNewRoomId}
                onChange={(e) => setBulkTransferData({ ...bulkTransferData, selectedNewRoomId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">- เลือกห้อง -</option>
                {bulkTransferData.availableRooms.map(room => {
                  const availableSpace = room.maxOccupancy - room.occupants.length;
                  return (
                    <option key={room.roomId} value={room.roomId}>
                      {room.buildingName}-{room.roomNumber}
                      {room.roomTypeCategory && ` (${room.roomTypeCategory})`}
                      {' '}[ว่าง {availableSpace}/{room.maxOccupancy} ที่]
                      {room.occupants.length > 0 && ' - มีผู้พักอยู่แล้ว'}
                    </option>
                  );
                })}
              </select>
              {bulkTransferData.availableRooms.length === 0 && (
                <p className="text-sm text-red-600 mt-2">
                  ⚠️ ไม่มีห้องว่างที่รองรับผู้พัก {bulkTransferData.occupants.length} คนได้
                </p>
              )}
            </div>

            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ <strong>คำเตือน:</strong> การสลับห้องจะย้ายผู้พักทั้งหมด {bulkTransferData.occupants.length} คน
                จากห้อง {bulkTransferData.currentRoomNumber} ไปยังห้องที่เลือก กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setBulkTransferModalOpen(false);
                  setBulkTransferData(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleBulkTransferRoom}
                disabled={bulkTransferring || !bulkTransferData.selectedNewRoomId}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkTransferring ? 'กำลังสลับห้อง...' : `สลับห้องทั้งหมด (${bulkTransferData.occupants.length} คน)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
