'use client';

import { useState, useEffect } from 'react';
import { Carpool } from '@/types/carpool';

interface CarNumberAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
}

interface EnrichedCarpool extends Carpool {
  ownerCompanyName: string;
  ownerContactName: string;
}

interface CarSlot {
  carNumber: number;
  carpool: EnrichedCarpool | null;
}

export default function CarNumberAssignmentModal({
  isOpen,
  onClose,
  eventId,
  eventName,
}: CarNumberAssignmentModalProps) {
  const [carpools, setCarpools] = useState<EnrichedCarpool[]>([]);
  const [totalCars, setTotalCars] = useState(10);
  const [carSlots, setCarSlots] = useState<CarSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assignment modal state
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [assigningCarNumber, setAssigningCarNumber] = useState<number | null>(null);
  const [selectedCarpoolId, setSelectedCarpoolId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchCarpools();
    }
  }, [isOpen, eventId]);

  useEffect(() => {
    // Generate car slots based on totalCars
    const slots: CarSlot[] = [];
    for (let i = 1; i <= totalCars; i++) {
      const assignedCarpool = carpools.find((cp) => cp.assignedCarNumber === i);
      slots.push({
        carNumber: i,
        carpool: assignedCarpool || null,
      });
    }
    setCarSlots(slots);
  }, [totalCars, carpools]);

  const fetchCarpools = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/carpools`);
      if (!response.ok) {
        throw new Error('Failed to fetch carpools');
      }
      const data = await response.json();
      setCarpools(data.carpools || []);
    } catch (err) {
      console.error('Error fetching carpools:', err);
      setError(err instanceof Error ? err.message : 'Failed to load carpools');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignClick = (carNumber: number) => {
    setAssigningCarNumber(carNumber);
    setSelectedCarpoolId(null);
    setShowAssignmentModal(true);
  };

  const handleUnassign = async (carpoolId: string) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการยกเลิกเลขรถนี้?')) {
      return;
    }

    try {
      const response = await fetch(`/api/carpools/${carpoolId}/unassign-car-number`, {
        method: 'PUT',
      });

      if (!response.ok) {
        throw new Error('Failed to unassign car number');
      }

      // Refresh list
      await fetchCarpools();
    } catch (err) {
      console.error('Error unassigning car number:', err);
      alert(err instanceof Error ? err.message : 'Failed to unassign car number');
    }
  };

  const handleConfirmAssignment = async () => {
    if (!selectedCarpoolId || !assigningCarNumber) {
      alert('กรุณาเลือก Carpool');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch(`/api/carpools/${selectedCarpoolId}/assign-car-number`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carNumber: assigningCarNumber }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to assign car number');
      }

      // Refresh list and close modal
      await fetchCarpools();
      setShowAssignmentModal(false);
      setAssigningCarNumber(null);
      setSelectedCarpoolId(null);
    } catch (err) {
      console.error('Error assigning car number:', err);
      alert(err instanceof Error ? err.message : 'Failed to assign car number');
    } finally {
      setAssigning(false);
    }
  };

  // Get available carpools (not assigned to any car)
  const availableCarpools = carpools.filter((cp) => !cp.assignedCarNumber);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">จัดเลขรถ</h2>
            <p className="text-sm text-gray-600 mt-1">{eventName}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">จำนวนรถทั้งหมด:</label>
              <input
                type="number"
                min="1"
                max="100"
                value={totalCars}
                onChange={(e) => setTotalCars(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 mt-2">กำลังโหลดข้อมูล...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {carSlots.map((slot) => (
                <div
                  key={slot.carNumber}
                  className={`border rounded-lg p-4 ${
                    slot.carpool
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-gray-900">
                      🚗 รถคันที่ {slot.carNumber}
                    </h3>
                  </div>

                  {slot.carpool ? (
                    <div>
                      <div className="space-y-1 text-sm mb-3">
                        <p className="font-semibold text-gray-900">{slot.carpool.licensePlate}</p>
                        <p className="text-gray-600">{slot.carpool.ownerCompanyName}</p>
                        <p className="text-gray-500 text-xs">
                          {slot.carpool.members.length} คน
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnassign(slot.carpool!.carpoolId)}
                        className="w-full px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                      >
                        ยกเลิกเลขรถ
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-gray-500 mb-3 italic">ยังไม่มี Carpool</p>
                      <button
                        onClick={() => handleAssignClick(slot.carNumber)}
                        disabled={availableCarpools.length === 0}
                        className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        กำหนด Carpool
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && availableCarpools.length === 0 && carpools.length > 0 && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ✅ Carpool ทั้งหมดได้รับเลขรถแล้ว
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Assignment Modal */}
      {showAssignmentModal && assigningCarNumber && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">
                กำหนด Carpool ให้รถคันที่ {assigningCarNumber}
              </h3>
              <button
                onClick={() => {
                  setShowAssignmentModal(false);
                  setAssigningCarNumber(null);
                  setSelectedCarpoolId(null);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {availableCarpools.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  ไม่มี Carpool ที่ว่างสำหรับกำหนดเลขรถ
                </p>
              ) : (
                <div className="space-y-2">
                  {availableCarpools.map((carpool) => (
                    <label
                      key={carpool.carpoolId}
                      className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedCarpoolId === carpool.carpoolId
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="carpool"
                        checked={selectedCarpoolId === carpool.carpoolId}
                        onChange={() => setSelectedCarpoolId(carpool.carpoolId)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900 mb-1">
                          🚗 {carpool.licensePlate}
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <p><strong>บริษัท:</strong> {carpool.ownerCompanyName}</p>
                          <p><strong>ผู้ติดต่อ:</strong> {carpool.ownerContactName}</p>
                          <p><strong>จำนวนสมาชิก:</strong> {carpool.members.length} คน</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {availableCarpools.length > 0 && (
              <div className="flex gap-3 p-6 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowAssignmentModal(false);
                    setAssigningCarNumber(null);
                    setSelectedCarpoolId(null);
                  }}
                  disabled={assigning}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirmAssignment}
                  disabled={assigning || !selectedCarpoolId}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {assigning ? 'กำลังกำหนด...' : 'กำหนดเลขรถ'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
