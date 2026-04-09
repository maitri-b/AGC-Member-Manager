'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Image from 'next/image';

interface MemberInfo {
  memberId: string;
  companyNameTH: string;
  companyNameEN: string;
  fullNameTH: string;
  nickname: string;
  licenseNumber: string;
  positionClub: string;
  status: string;
  mobile: string;
}

interface VerificationStatus {
  hasRequest: boolean;
  status: 'pending' | 'approved' | 'rejected' | null;
  memberId?: string;
  memberInfo?: {
    companyNameTH: string;
    fullNameTH: string;
  };
  rejectionReason?: string;
  createdAt?: string;
}

export default function VerifyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<'check' | 'search' | 'confirm' | 'alreadyLinked' | 'dispute' | 'disputeSubmitted' | 'submitted' | 'verified'>('check');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [isAlreadyLinked, setIsAlreadyLinked] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    checkVerificationStatus();
  }, []);

  const checkVerificationStatus = async () => {
    try {
      const res = await fetch('/api/verification/request');
      const data = await res.json();

      setVerificationStatus(data);

      if (data.hasRequest) {
        if (data.status === 'approved') {
          setStep('verified');
        } else if (data.status === 'pending') {
          setStep('submitted');
        } else if (data.status === 'rejected') {
          setStep('search'); // Allow retry
        }
      } else {
        setStep('search');
      }
    } catch (err) {
      console.error('Error checking verification status:', err);
      setStep('search');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/verification/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseNumber, phone }),
      });

      const data = await res.json();

      // Handle locked account or HTTP errors
      if (!res.ok) {
        if (data.locked) {
          setError(data.message || 'บัญชีถูกระงับการค้นหา กรุณาติดต่อ Admin ทางแชทที่ LINE Official AGC');
        } else {
          setError(data.error || data.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
        }
        return;
      }

      if (!data.found) {
        setError(data.message || 'ไม่พบข้อมูลสมาชิก');
        return;
      }

      setMemberInfo(data.member);

      // Check if already linked to another account
      if (data.alreadyLinked) {
        setIsAlreadyLinked(true);
        setStep('alreadyLinked');
        return;
      }

      setStep('confirm');
    } catch (err) {
      console.error('Search error:', err);
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!memberInfo || !phone) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/verification/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: memberInfo.memberId,
          licenseNumber: memberInfo.licenseNumber,
          phone,
          email,
          reason: disputeReason,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      setStep('disputeSubmitted');
    } catch (err) {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitVerification = async () => {
    if (!memberInfo) return;

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/verification/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: memberInfo.memberId,
          licenseNumber: memberInfo.licenseNumber,
          companyNameInput: companyName,
          phone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      // Update verificationStatus with the new request info
      setVerificationStatus({
        hasRequest: true,
        status: 'pending',
        memberId: memberInfo.memberId,
        memberInfo: {
          companyNameTH: memberInfo.companyNameTH,
          fullNameTH: memberInfo.fullNameTH,
        },
      });

      setStep('submitted');
    } catch (err) {
      setError('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
    }
  };

  if (status === 'loading' || step === 'check') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto mb-4 shadow-lg">
            <Image
              src="/images/AGC-logo.png"
              alt="Agents Club Logo"
              width={80}
              height={80}
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ยืนยันตัวตนสมาชิก</h1>
          <p className="text-gray-600 mt-2">Agents Club Member Verification</p>
        </div>

        {/* User Info */}
        {session?.user && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex items-center gap-4">
            {session.user.image && (
              <Image
                src={session.user.image}
                alt={session.user.name || 'User'}
                width={48}
                height={48}
                className="rounded-full"
              />
            )}
            <div>
              <p className="font-medium text-gray-900">{session.user.name}</p>
              <p className="text-sm text-gray-500">LINE Account</p>
            </div>
          </div>
        )}

        {/* Step: Search */}
        {step === 'search' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              กรอกข้อมูลเพื่อยืนยันตัวตน
            </h2>

            {verificationStatus?.status === 'rejected' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 font-medium">คำขอก่อนหน้าถูกปฏิเสธ</p>
                <p className="text-red-600 text-sm mt-1">
                  {verificationStatus.rejectionReason || 'กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง'}
                </p>
              </div>
            )}

            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เลขใบอนุญาตนำเที่ยว <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="เช่น 11/12345"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  เลขที่ใบอนุญาตประกอบธุรกิจนำเที่ยว
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อบริษัท/ร้าน <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="กรอกชื่อบริษัทหรือร้านของคุณ"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  ใช้เพื่อยืนยันตัวตนกับทีมนายทะเบียน
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์โทรศัพท์ <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="เช่น 0812345678"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  สำหรับให้ Admin ติดต่อกลับ
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !licenseNumber || !companyName || !phone}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'กำลังค้นหา...' : 'ค้นหาข้อมูลสมาชิก'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500 text-center mb-4">
                ไม่พบข้อมูล? กรุณาติดต่อ Admin ทางแชทที่ LINE Official AGC
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                กลับไปหน้าหลัก
              </button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === 'confirm' && memberInfo && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              ยืนยันข้อมูลสมาชิก
            </h2>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">รหัสสมาชิก</p>
                  <p className="font-medium text-gray-900">{memberInfo.memberId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">ชื่อบริษัท</p>
                  <p className="font-medium text-gray-900">{memberInfo.companyNameTH || memberInfo.companyNameEN}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">ชื่อผู้ติดต่อ</p>
                  <p className="font-medium text-gray-900">
                    {memberInfo.fullNameTH}
                    {memberInfo.nickname && ` (${memberInfo.nickname})`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">เลขใบอนุญาต</p>
                  <p className="font-medium text-gray-900">{memberInfo.licenseNumber}</p>
                </div>
                {memberInfo.positionClub && (
                  <div>
                    <p className="text-xs text-gray-500">ตำแหน่งในสมาคม</p>
                    <p className="font-medium text-gray-900">{memberInfo.positionClub}</p>
                  </div>
                )}
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              ข้อมูลนี้ถูกต้องใช่หรือไม่? หากใช่ กรุณากดยืนยันเพื่อส่งคำขอไปยัง Admin
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('search');
                  setMemberInfo(null);
                  setError('');
                }}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                ย้อนกลับ
              </button>
              <button
                onClick={handleSubmitVerification}
                disabled={isLoading}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
              >
                {isLoading ? 'กำลังส่ง...' : 'ยืนยันข้อมูล'}
              </button>
            </div>
          </div>
        )}

        {/* Step: Already Linked - Show dispute option */}
        {step === 'alreadyLinked' && memberInfo && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                มีผู้ยืนยันตัวตนแล้ว
              </h2>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <p className="text-orange-800 text-sm leading-relaxed">
                ข้อมูลสมาชิกนี้มีบัญชี LINE อื่นเชื่อมต่ออยู่แล้ว
                หากคุณเป็นเจ้าของข้อมูลที่แท้จริง สามารถแจ้งปัญหาไปยังทีมนายทะเบียนเพื่อตรวจสอบและแก้ไขได้
              </p>
            </div>

            {/* Member Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-xs text-gray-500 mb-2">ข้อมูลสมาชิก</p>
              <div className="space-y-2">
                <p className="font-medium text-gray-900">{memberInfo.companyNameTH || memberInfo.companyNameEN}</p>
                <p className="text-sm text-gray-600">{memberInfo.fullNameTH}</p>
                <p className="text-sm text-gray-500">ใบอนุญาต: {memberInfo.licenseNumber}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('search');
                  setMemberInfo(null);
                  setIsAlreadyLinked(false);
                  setError('');
                }}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                ย้อนกลับ
              </button>
              <button
                onClick={() => setStep('dispute')}
                className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-medium hover:bg-orange-700 transition-colors"
              >
                แจ้งปัญหา
              </button>
            </div>
          </div>
        )}

        {/* Step: Dispute Form */}
        {step === 'dispute' && memberInfo && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              แจ้งปัญหาการยืนยันตัวตน
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              กรุณากรอกข้อมูลติดต่อเพื่อให้ทีมนายทะเบียนสามารถตรวจสอบและติดต่อกลับได้
            </p>

            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">ข้อมูลที่ต้องการยืนยัน</p>
                <p className="font-medium text-gray-900">{memberInfo.companyNameTH || memberInfo.companyNameEN}</p>
                <p className="text-sm text-gray-600">ใบอนุญาต: {memberInfo.licenseNumber}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์โทรศัพท์ติดต่อ <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="เช่น 081-234-5678"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  เบอร์ที่ทีมนายทะเบียนสามารถติดต่อกลับได้
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  อีเมล (ไม่บังคับ)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  รายละเอียดเพิ่มเติม (ไม่บังคับ)
                </label>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="อธิบายสถานการณ์หรือข้อมูลเพิ่มเติมที่จะช่วยยืนยันตัวตนของคุณ"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep('alreadyLinked');
                    setError('');
                  }}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                >
                  ย้อนกลับ
                </button>
                <button
                  onClick={handleSubmitDispute}
                  disabled={isLoading || !phone}
                  className="flex-1 bg-orange-600 text-white py-3 rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-300 transition-colors"
                >
                  {isLoading ? 'กำลังส่ง...' : 'ส่งคำร้อง'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Dispute Submitted */}
        {step === 'disputeSubmitted' && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              ส่งคำร้องเรียบร้อยแล้ว
            </h2>
            <p className="text-gray-600 mb-4">
              ทีมนายทะเบียนได้รับคำร้องของคุณแล้ว
            </p>
            <div className="bg-orange-50 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-orange-800">
                <strong>ขั้นตอนถัดไป:</strong>
              </p>
              <ul className="text-sm text-orange-700 mt-2 space-y-1 list-disc list-inside">
                <li>ทีมนายทะเบียนจะตรวจสอบข้อมูล</li>
                <li>อาจมีการติดต่อกลับทางเบอร์โทรที่ให้ไว้</li>
                <li>ผลการพิจารณาจะแจ้งให้ทราบภายหลัง</li>
              </ul>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              กลับหน้าหลัก
            </button>
          </div>
        )}

        {/* Step: Submitted - Waiting for approval */}
        {step === 'submitted' && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              รอการอนุมัติ
            </h2>
            <p className="text-gray-600 mb-6">
              คำขอยืนยันตัวตนของคุณถูกส่งไปยัง Admin แล้ว กรุณารอการอนุมัติ
            </p>

            {verificationStatus?.memberInfo && (
              <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                <p className="text-xs text-gray-500">ข้อมูลที่ส่ง</p>
                <p className="font-medium text-gray-900">{verificationStatus.memberInfo.companyNameTH}</p>
                <p className="text-sm text-gray-600">{verificationStatus.memberInfo.fullNameTH}</p>
              </div>
            )}

            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              กลับหน้าหลัก
            </button>
          </div>
        )}

        {/* Step: Verified */}
        {step === 'verified' && (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              ยืนยันตัวตนสำเร็จ
            </h2>
            <p className="text-gray-600 mb-6">
              บัญชี LINE ของคุณเชื่อมต่อกับข้อมูลสมาชิกเรียบร้อยแล้ว
            </p>

            {verificationStatus?.memberInfo && (
              <div className="bg-green-50 rounded-lg p-4 mb-6 text-left">
                <p className="text-xs text-gray-500">รหัสสมาชิก</p>
                <p className="font-bold text-green-700 text-xl">{verificationStatus.memberId}</p>
                <p className="font-medium text-gray-900 mt-2">{verificationStatus.memberInfo.companyNameTH}</p>
                <p className="text-sm text-gray-600">{verificationStatus.memberInfo.fullNameTH}</p>
              </div>
            )}

            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              ไปยังหน้าหลัก
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-8">
          Agents Club / Helping & Sharing
        </p>
      </div>
    </div>
  );
}
