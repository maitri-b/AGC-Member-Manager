'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useEffectiveSessionContext } from '@/lib/EffectiveSessionProvider';
import Image from 'next/image';

interface SummaryData {
  event: {
    eventId: string;
    eventName: string;
    eventNameEN: string;
  };
  registration: {
    registrationId: string;
    companyName: string;
    contactName: string;
    lineDisplayName: string;
    attendeeNames: string[];
  };
  carpools: Array<{
    carpoolId: string;
    licensePlate: string;
    carModel: string;
    assignedCarNumber?: number;
    ownerRegistrationId: string;
    members: Array<{
      name: string;
      attendeeIndex: number;
      isOwner: boolean;
    }>;
  }> | null;
  rooms: Array<{
    roomId: string;
    roomName: string;
    buildingName: string;
    companyName: string;
    roomNumber?: number;
    members: Array<{
      name: string;
      attendeeIndex: number;
    }>;
  }> | null;
  partyTables: Array<{
    tableId: string;
    tableGroupName: string;
    hostCompanyName: string;
    assignedTableNumber?: number;
    members: Array<{
      name: string;
      attendeeIndex: number;
    }>;
  }> | null;
  settings: {
    showCarNumbers: boolean;
    showRoomNumbers: boolean;
    showTableNumbers: boolean;
  };
}

export default function EventSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useEffectiveSessionContext();
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchRegistrationId, setSearchRegistrationId] = useState('');
  const [openCard, setOpenCard] = useState<'carpool' | 'room' | 'table' | null>(null);

  const eventId = params?.eventId as string;

  useEffect(() => {
    if (status === 'loading') return;

    if (!session?.user) {
      router.push('/api/auth/signin');
      return;
    }

    fetchSummaryData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, eventId]); // Remove session from deps to prevent infinite loop

  const fetchSummaryData = async (registrationId?: string) => {
    setLoading(true);
    setError(null);

    try {
      const url = registrationId
        ? `/api/events/${eventId}/summary?registrationId=${encodeURIComponent(registrationId)}`
        : `/api/events/${eventId}/summary`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch summary');
      }

      const data = await response.json();
      setSummaryData(data);

      // Auto-open first available card
      if (data.settings.showCarNumbers && data.carpools && data.carpools.length > 0) {
        setOpenCard('carpool');
      } else if (data.settings.showRoomNumbers && data.rooms && data.rooms.length > 0) {
        setOpenCard('room');
      } else if (data.settings.showTableNumbers && data.partyTables && data.partyTables.length > 0) {
        setOpenCard('table');
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchRegistrationId.trim()) {
      fetchSummaryData(searchRegistrationId.trim());
    } else {
      fetchSummaryData();
    }
  };

  const toggleCard = (cardType: 'carpool' | 'room' | 'table') => {
    setOpenCard(openCard === cardType ? null : cardType);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-lg font-medium text-gray-700">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-pink-100 p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">เกิดข้อผิดพลาด</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => fetchSummaryData()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            ลองอีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  if (!summaryData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {summaryData.event.eventName}
            </h1>
            {summaryData.event.eventNameEN && (
              <p className="text-lg text-gray-600">{summaryData.event.eventNameEN}</p>
            )}
          </div>

          {/* Search Section */}
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchRegistrationId}
                onChange={(e) => setSearchRegistrationId(e.target.value)}
                placeholder="ค้นหาด้วยรหัสการจองทัวร์"
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-base"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                ค้นหา
              </button>
              {searchRegistrationId && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchRegistrationId('');
                    fetchSummaryData();
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold px-6 py-3 rounded-lg transition-colors"
                >
                  ล้าง
                </button>
              )}
            </div>
          </form>

          {/* Registration Info */}
          <div className="border-t-2 border-gray-200 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">รหัสการจองทัวร์</p>
                <p className="text-lg font-bold text-indigo-900">{summaryData.registration.registrationId}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">บริษัท</p>
                <p className="text-lg font-semibold text-gray-900">{summaryData.registration.companyName || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">ชื่อติดต่อ</p>
                <p className="text-lg font-semibold text-gray-900">{summaryData.registration.contactName || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">ชื่อไลน์</p>
                <p className="text-lg font-semibold text-gray-900">{summaryData.registration.lineDisplayName || '-'}</p>
              </div>
            </div>

            {summaryData.registration.attendeeNames.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-500 mb-2">ผู้เข้าร่วมกิจกรรม</p>
                <div className="flex flex-wrap gap-2">
                  {summaryData.registration.attendeeNames.map((name, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-900 font-medium rounded-full text-sm"
                    >
                      {index + 1}. {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Carpool Card */}
        {summaryData.settings.showCarNumbers && summaryData.carpools && summaryData.carpools.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl mb-6 overflow-hidden">
            <button
              onClick={() => toggleCard('carpool')}
              className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-700 hover:to-cyan-700 transition-colors"
            >
              <div className="flex items-center gap-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <div className="text-left">
                  <h2 className="text-2xl font-bold">ข้อมูลรถยนต์</h2>
                  <p className="text-sm opacity-90">{summaryData.carpools.length} รถ</p>
                </div>
              </div>
              <svg
                className={`w-6 h-6 transition-transform ${openCard === 'carpool' ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openCard === 'carpool' && (
              <div className="p-8">
                <div className="space-y-6">
                  {summaryData.carpools.map((carpool) => (
                    <div key={carpool.carpoolId} className="border-2 border-blue-200 rounded-xl p-6 bg-blue-50">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-sm font-medium text-gray-600 mb-1">ทะเบียนรถ</p>
                          <p className="text-xl font-bold text-gray-900">{carpool.licensePlate}</p>
                          {carpool.carModel && (
                            <p className="text-sm text-gray-600 mt-1">{carpool.carModel}</p>
                          )}
                        </div>
                        {carpool.assignedCarNumber && (
                          <div className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl shadow-lg">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                            <span className="text-2xl font-bold">รถคันที่ {carpool.assignedCarNumber}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-2">ผู้โดยสาร</p>
                        <ul className="space-y-2">
                          {carpool.members.map((member, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-base">
                              {member.isOwner && (
                                <span className="inline-flex items-center px-3 py-1 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
                                  เจ้าของรถ
                                </span>
                              )}
                              <span className="font-medium text-gray-900">{member.name}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Room Card */}
        {summaryData.settings.showRoomNumbers && summaryData.rooms && summaryData.rooms.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl mb-6 overflow-hidden">
            <button
              onClick={() => toggleCard('room')}
              className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 transition-colors"
            >
              <div className="flex items-center gap-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <div className="text-left">
                  <h2 className="text-2xl font-bold">ข้อมูลห้องพัก</h2>
                  <p className="text-sm opacity-90">{summaryData.rooms.length} ห้อง</p>
                </div>
              </div>
              <svg
                className={`w-6 h-6 transition-transform ${openCard === 'room' ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openCard === 'room' && (
              <div className="p-8">
                <div className="space-y-6">
                  {summaryData.rooms.map((room) => (
                    <div key={room.roomId} className="border-2 border-green-200 rounded-xl p-6 bg-green-50">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          {room.buildingName && (
                            <p className="text-sm font-medium text-gray-600 mb-1">อาคาร</p>
                          )}
                          {room.buildingName && (
                            <p className="text-lg font-semibold text-gray-900">{room.buildingName}</p>
                          )}
                          {room.roomName && (
                            <p className="text-base text-gray-700 mt-1">{room.roomName}</p>
                          )}
                          {room.companyName && (
                            <p className="text-sm text-gray-600 mt-1">{room.companyName}</p>
                          )}
                        </div>
                        {room.roomNumber && (
                          <div className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl shadow-lg">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            <span className="text-2xl font-bold">ห้อง {room.roomNumber}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-2">ผู้เข้าพัก</p>
                        <ul className="space-y-1">
                          {room.members.map((member, idx) => (
                            <li key={idx} className="text-base font-medium text-gray-900">
                              {member.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Party Table Card */}
        {summaryData.settings.showTableNumbers && summaryData.partyTables && summaryData.partyTables.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl mb-6 overflow-hidden">
            <button
              onClick={() => toggleCard('table')}
              className="w-full px-8 py-6 flex items-center justify-between bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition-colors"
            >
              <div className="flex items-center gap-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <div className="text-left">
                  <h2 className="text-2xl font-bold">ข้อมูลโต๊ะ</h2>
                  <p className="text-sm opacity-90">{summaryData.partyTables.length} กลุ่มโต๊ะ</p>
                </div>
              </div>
              <svg
                className={`w-6 h-6 transition-transform ${openCard === 'table' ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openCard === 'table' && (
              <div className="p-8">
                <div className="space-y-6">
                  {summaryData.partyTables.map((table) => (
                    <div key={table.tableId} className="border-2 border-purple-200 rounded-xl p-6 bg-purple-50">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-sm font-medium text-gray-600 mb-1">กลุ่มโต๊ะ</p>
                          <p className="text-xl font-bold text-gray-900">
                            {table.tableGroupName || `โต๊ะของ ${table.hostCompanyName}`}
                          </p>
                        </div>
                        {table.assignedTableNumber && (
                          <div className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl shadow-lg">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span className="text-2xl font-bold">โต๊ะ {table.assignedTableNumber}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-2">สมาชิก</p>
                        <ul className="space-y-1">
                          {table.members.map((member, idx) => (
                            <li key={idx} className="text-base font-medium text-gray-900">
                              {member.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Data Message */}
        {!summaryData.carpools && !summaryData.rooms && !summaryData.partyTables && (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xl font-medium text-gray-600">ยังไม่มีข้อมูลจัดกลุ่ม</p>
            <p className="text-sm text-gray-500 mt-2">กรุณารอการจัดกลุ่มจากผู้จัดงาน</p>
          </div>
        )}
      </div>
    </div>
  );
}
