'use client';

import { useEffect, useState } from 'react';

interface CarpoolMember {
  registrationId: string;
  name: string;
  attendeeIndex: number;
}

interface CarpoolDetails {
  carpoolId: string;
  licensePlate: string;
  ownerRegistrationId: string;
  ownerName: string;
  capacity: number;
  members: CarpoolMember[];
}

interface CarpoolDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  registrationId: string;
  contactName: string;
}

export default function CarpoolDetailModal({
  isOpen,
  onClose,
  eventId,
  registrationId,
  contactName,
}: CarpoolDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [carpool, setCarpool] = useState<CarpoolDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && eventId && registrationId) {
      fetchCarpoolDetails();
    }
  }, [isOpen, eventId, registrationId]);

  const fetchCarpoolDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all carpools for this event
      const response = await fetch(`/api/events/${eventId}/carpools`);
      if (!response.ok) {
        throw new Error('Failed to fetch carpool data');
      }

      const data = await response.json();
      const carpools = data.carpools || [];

      // Find carpool where this registration is owner or member
      const foundCarpool = carpools.find((c: any) => {
        // Check if owner
        if (c.ownerRegistrationId === registrationId) return true;

        // Check if member
        if (c.members && Array.isArray(c.members)) {
          return c.members.some((m: any) => m.registrationId === registrationId);
        }

        return false;
      });

      if (foundCarpool) {
        setCarpool({
          carpoolId: foundCarpool.carpoolId,
          licensePlate: foundCarpool.licensePlate || 'ไม่ระบุ',
          ownerRegistrationId: foundCarpool.ownerRegistrationId,
          ownerName: foundCarpool.ownerContactName || 'ไม่ระบุ',
          capacity: foundCarpool.capacity || 0,
          members: foundCarpool.members || [],
        });
      } else {
        setError('ไม่พบข้อมูลการลงทะเบียนรถ');
      }
    } catch (err) {
      console.error('Error fetching carpool details:', err);
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isOwner = carpool?.ownerRegistrationId === registrationId;
  const totalMembers = (carpool?.members?.length || 0) + 1; // +1 for owner

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-50 to-blue-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              รายละเอียดการลงทะเบียนรถ
            </h3>
            <p className="text-sm text-gray-600 mt-1">{contactName}</p>
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

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-120px)]">
          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 mt-2">กำลังโหลดข้อมูล...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <svg className="w-12 h-12 text-red-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          )}

          {!loading && !error && carpool && (
            <div className="space-y-4">
              {/* Car Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-600 text-white p-2 rounded-lg">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">ข้อมูลรถ</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">ทะเบียนรถ:</span>
                        <span className="font-medium text-gray-900">{carpool.licensePlate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">จำนวนที่นั่ง:</span>
                        <span className="font-medium text-gray-900">{carpool.capacity} ที่นั่ง</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">ที่นั่งที่ใช้แล้ว:</span>
                        <span className="font-medium text-gray-900">
                          {totalMembers} / {carpool.capacity} ที่นั่ง
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Owner Information */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-green-600 text-white p-2 rounded-lg">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">เจ้าของรถ</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-900 font-medium">{carpool.ownerName}</span>
                      {isOwner && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                          คุณ
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Members List */}
              {carpool.members && carpool.members.length > 0 && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-purple-600 text-white p-2 rounded-lg">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 mb-3">ผู้ร่วมรถ ({carpool.members.length} คน)</h4>
                      <ul className="space-y-2">
                        {carpool.members.map((member, index) => {
                          const isSelf = member.registrationId === registrationId;
                          return (
                            <li
                              key={`${member.registrationId}-${member.attendeeIndex}-${index}`}
                              className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-purple-100"
                            >
                              <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <span className="text-gray-900 text-sm">{member.name}</span>
                              </div>
                              {isSelf && !isOwner && (
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                  คุณ
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State for Members */}
              {(!carpool.members || carpool.members.length === 0) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-gray-600 text-sm">ยังไม่มีผู้ร่วมรถ</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
