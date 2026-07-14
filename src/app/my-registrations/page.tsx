'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface Registration {
  eventId: string;
  eventName: string;
  eventNameEN: string;
  eventDate: string;
  coverImageUrl?: string;
  registrationId: string;
  registrationDate: string;
  attendeeCount: number;
  totalAmount: number;
  paymentStatus: string;
  status: string;
}

export default function MyRegistrationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchMyRegistrations();
    }
  }, [session]);

  const fetchMyRegistrations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/my-registrations');

      if (!response.ok) {
        throw new Error('ไม่สามารถโหลดข้อมูลได้');
      }

      const data = await response.json();
      setRegistrations(data.registrations || []);
    } catch (err) {
      console.error('Error fetching registrations:', err);
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('ยืนยัน') || statusLower.includes('confirmed')) {
      return 'bg-green-100 text-green-800 border-green-300';
    } else if (statusLower.includes('ยกเลิก') || statusLower.includes('cancelled')) {
      return 'bg-red-100 text-red-800 border-red-300';
    } else if (statusLower.includes('รอ') || statusLower.includes('pending')) {
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getPaymentStatusBadgeClass = (status: string): string => {
    if (status.includes('ชำระครบ') || status.includes('อนุมัติ')) {
      return 'bg-emerald-100 text-emerald-800';
    } else if (status.includes('รอตรวจสอบ')) {
      return 'bg-purple-100 text-purple-800';
    } else if (status.includes('รอชำระ')) {
      return 'bg-orange-100 text-orange-800';
    } else if (status.includes('พ้นกำหนด')) {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-gray-100 text-gray-800';
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full text-center">
          <svg className="w-12 h-12 text-red-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-800 font-medium mb-4">{error}</p>
          <button
            onClick={fetchMyRegistrations}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">ประวัติการจอง</h1>
              <p className="text-blue-100 text-sm mt-1">รายการกิจกรรมที่คุณลงทะเบียนไว้</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {registrations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <svg className="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">ยังไม่มีการจอง</h3>
            <p className="text-gray-600 mb-6">คุณยังไม่ได้ลงทะเบียนกิจกรรมใดๆ</p>
            <Link
              href="/events"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              ดูกิจกรรมทั้งหมด
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span className="text-sm sm:text-base font-medium text-gray-700">
                  พบ {registrations.length} รายการ
                </span>
              </div>
            </div>

            {/* Registration Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {registrations.map((reg) => (
                <div key={reg.registrationId} className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  {/* Event Cover Image */}
                  <div className="relative h-40 sm:h-48 bg-gradient-to-br from-blue-100 to-indigo-100">
                    {reg.coverImageUrl ? (
                      <Image
                        src={reg.coverImageUrl}
                        alt={reg.eventName}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-16 h-16 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    {/* Event Name */}
                    <h3 className="font-semibold text-gray-900 text-base sm:text-lg mb-1 line-clamp-2">
                      {reg.eventName}
                    </h3>

                    {/* Event Date */}
                    <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      {new Date(reg.eventDate).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>

                    {/* Registration Info */}
                    <div className="space-y-2 mb-4">
                      {/* Attendee Count */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">จำนวนผู้เข้าร่วม:</span>
                        <span className="font-semibold text-gray-900">{reg.attendeeCount} คน</span>
                      </div>

                      {/* Total Amount */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">ยอดเงินรวม:</span>
                        <span className="font-semibold text-gray-900">
                          {reg.totalAmount.toLocaleString()} บาท
                        </span>
                      </div>

                      {/* Payment Status */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">สถานะการชำระ:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusBadgeClass(reg.paymentStatus)}`}>
                          {reg.paymentStatus}
                        </span>
                      </div>

                      {/* Registration Status */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">สถานะการจอง:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClass(reg.status)}`}>
                          {reg.status}
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <Link
                      href={`/events/${reg.eventId}`}
                      className="block w-full text-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      ดูรายละเอียด
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
