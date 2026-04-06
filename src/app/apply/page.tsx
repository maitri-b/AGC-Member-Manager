'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LineLoginButton from '@/components/LineLoginButton';
import { Toast, useToast } from '@/components/Toast';

interface ApplicationForm {
  // Company Info
  companyNameEN: string;
  companyNameTH: string;
  nickname: string;
  positionCompany: string;
  licenseNumber: string;

  // Contact Info
  lineId: string;
  lineName: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;

  // Sponsors
  sponsor1: string;
  sponsor2: string;
}

const initialFormData: ApplicationForm = {
  companyNameEN: '',
  companyNameTH: '',
  nickname: '',
  positionCompany: '',
  licenseNumber: '',
  lineId: '',
  lineName: '',
  email: '',
  phone: '',
  mobile: '',
  website: '',
  sponsor1: '',
  sponsor2: '',
};

// LINE OA link for document submission
const LINE_OA_LINK = 'https://lin.ee/YahadVz';

export default function ApplyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useToast();

  const [formData, setFormData] = useState<ApplicationForm>(initialFormData);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-fill LINE name from session
  useEffect(() => {
    if (session?.user) {
      setFormData(prev => ({
        ...prev,
        lineName: session.user.name || '',
      }));
    }
  }, [session]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Required fields
    if (!formData.companyNameEN.trim()) newErrors.companyNameEN = 'กรุณากรอกชื่อบริษัท (ภาษาอังกฤษ)';
    if (!formData.companyNameTH.trim()) newErrors.companyNameTH = 'กรุณากรอกชื่อ-นามสกุล';
    if (!formData.nickname.trim()) newErrors.nickname = 'กรุณากรอกชื่อเล่น';
    if (!formData.positionCompany.trim()) newErrors.positionCompany = 'กรุณากรอกตำแหน่งในบริษัท';
    if (!formData.licenseNumber.trim()) newErrors.licenseNumber = 'กรุณากรอกเลขใบอนุญาตนำเที่ยว';
    if (!formData.lineId.trim()) newErrors.lineId = 'กรุณากรอก LINE ID';
    if (!formData.lineName.trim()) newErrors.lineName = 'กรุณากรอกชื่อที่แสดงใน LINE';
    if (!formData.email.trim()) newErrors.email = 'กรุณากรอกอีเมล';
    if (!formData.mobile.trim()) newErrors.mobile = 'กรุณากรอกเบอร์มือถือ';
    if (!formData.sponsor1.trim()) newErrors.sponsor1 = 'กรุณากรอกผู้รับรองสมาชิก ท่านที่ 1';
    if (!formData.sponsor2.trim()) newErrors.sponsor2 = 'กรุณากรอกผู้รับรองสมาชิก ท่านที่ 2';

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'กรุณากรอกอีเมลให้ถูกต้อง';
    }

    // License number format (xx/xxxxx)
    if (formData.licenseNumber && !/^\d{2}\/\d{5}$/.test(formData.licenseNumber)) {
      newErrors.licenseNumber = 'กรุณากรอกในรูปแบบ xx/xxxxx เช่น 11/12345';
    }

    // Terms acceptance
    if (!acceptedTerms) newErrors.acceptedTerms = 'กรุณายอมรับเงื่อนไขและกฎกติกาของชมรม';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'เกิดข้อผิดพลาดในการส่งใบสมัคร');
      }

      setSubmitted(true);
      toast.success('ส่งใบสมัครเรียบร้อยแล้ว');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading while checking session
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  // Not logged in - show login prompt
  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
        <div className="w-full max-w-md">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-28 h-28 mb-6">
              <img
                src="/images/AGC-logo.png"
                alt="Agents Club Logo"
                className="w-full h-full object-contain rounded-full shadow-lg"
              />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              สมัครสมาชิก Agents Club
            </h1>
            <p className="text-gray-600 text-lg">
              Helping & Sharing
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">เข้าสู่ระบบด้วย LINE</h2>
              <p className="text-gray-500 text-sm">
                กรุณาล็อกอินด้วย LINE ก่อนกรอกใบสมัคร
              </p>
            </div>

            {/* LINE Login Button */}
            <LineLoginButton callbackUrl="/apply" />

            {/* Info */}
            <div className="bg-blue-50 rounded-lg p-4 mt-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-sm text-gray-600">
                  <p className="font-medium text-gray-700 mb-1">ขั้นตอนการสมัครสมาชิก</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>ล็อกอินด้วย LINE Account</li>
                    <li>กรอกข้อมูลบริษัทและข้อมูลติดต่อ</li>
                    <li>ยอมรับเงื่อนไขและส่งใบสมัคร</li>
                    <li>ส่งเอกสาร (ใบอนุญาตนำเที่ยว + นามบัตร) ทาง LINE</li>
                    <li>รอการอนุมัติจากคณะกรรมการ</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="text-center mt-6">
            <p className="text-sm text-gray-500 mb-2">หากมีปัญหา ติดต่อทีมนายทะเบียน</p>
            <a href="https://lin.ee/YahadVz" target="_blank" rel="noopener noreferrer">
              <img
                src="https://scdn.line-apps.com/n/line_add_friends/btn/th.png"
                alt="เพิ่มเพื่อน"
                height="36"
                className="inline-block"
              />
            </a>
          </div>
        </div>

        <Toast toasts={toast.toasts} onRemove={toast.removeToast} />
      </div>
    );
  }

  // Submitted successfully
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 px-4 py-8">
        <div className="w-full max-w-lg text-center">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">
              ส่งใบสมัครเรียบร้อยแล้ว!
            </h1>
            <p className="text-gray-600 mb-6">
              ทีมนายทะเบียนจะตรวจสอบข้อมูลและติดต่อกลับภายใน 3-5 วันทำการ
            </p>

            {/* Document Submission Notice */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6 text-left">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-orange-800 mb-2">
                    เอกสารที่ต้องจัดส่งเพิ่มเติม
                  </h3>
                  <p className="text-sm text-orange-700 mb-3">
                    กรุณาจัดส่งเอกสารดังต่อไปนี้ให้กับนายทะเบียนชมรม:
                  </p>
                  <ul className="text-sm text-orange-700 space-y-1 mb-4">
                    <li className="flex items-start gap-2">
                      <span className="font-medium">1.</span>
                      <span><strong>ใบอนุญาตประกอบธุรกิจนำเที่ยว</strong> ฉบับปัจจุบัน (ต้องไม่หมดอายุ)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">2.</span>
                      <span><strong>นามบัตร</strong> ของผู้สมัคร</span>
                    </li>
                  </ul>
                  <div className="bg-white rounded-lg p-3 border border-orange-200">
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>ช่องทางการส่งเอกสาร:</strong>
                    </p>
                    <p className="text-sm text-gray-600 mb-3">
                      กรุณาส่งเอกสารผ่านทาง LINE ของนายทะเบียนชมรม
                    </p>
                    <a
                      href={LINE_OA_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                      </svg>
                      ส่งเอกสารทาง LINE
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>ขั้นตอนถัดไป:</strong><br />
                1. ส่งเอกสารให้นายทะเบียนตามช่องทางด้านบน<br />
                2. คณะกรรมการจะพิจารณาใบสมัครและติดต่อผู้รับรอง<br />
                3. หากผ่านการอนุมัติจะได้รับเชิญเข้ากลุ่ม LINE ของชมรม
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => router.push('/')}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                กลับหน้าหลัก
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Logged in - show application form
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 mb-4">
            <img
              src="/images/AGC-logo.png"
              alt="Agents Club Logo"
              className="w-full h-full object-contain rounded-full shadow-lg"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            แบบฟอร์มสมัครสมาชิกชมรม Agents Club
          </h1>
          <p className="text-gray-600">
            กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง
          </p>
        </div>

        {/* User Info Banner */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <p className="text-sm text-green-600">ล็อกอินด้วย LINE แล้ว</p>
              <p className="font-medium text-green-800">{session.user.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/apply' })}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            เปลี่ยน LINE
          </button>
        </div>

        {/* Application Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Company Info */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              ข้อมูลบริษัทและผู้ติดต่อ
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  บริษัท (ภาษาอังกฤษ) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="companyNameEN"
                  value={formData.companyNameEN}
                  onChange={handleInputChange}
                  placeholder="Company Name (English)"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.companyNameEN ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.companyNameEN && <p className="text-red-500 text-xs mt-1">{errors.companyNameEN}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อ-นามสกุล (ภาษาไทย) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="companyNameTH"
                  value={formData.companyNameTH}
                  onChange={handleInputChange}
                  placeholder="ชื่อ-นามสกุล"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.companyNameTH ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.companyNameTH && <p className="text-red-500 text-xs mt-1">{errors.companyNameTH}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อเล่น <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="nickname"
                  value={formData.nickname}
                  onChange={handleInputChange}
                  placeholder="ชื่อเล่น"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.nickname ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.nickname && <p className="text-red-500 text-xs mt-1">{errors.nickname}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ตำแหน่งในบริษัท <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="positionCompany"
                  value={formData.positionCompany}
                  onChange={handleInputChange}
                  placeholder="ตำแหน่ง"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.positionCompany ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.positionCompany && <p className="text-red-500 text-xs mt-1">{errors.positionCompany}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ใบอนุญาตนำเที่ยวเลขที่ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="licenseNumber"
                  value={formData.licenseNumber}
                  onChange={handleInputChange}
                  placeholder="xx/xxxxx"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.licenseNumber ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.licenseNumber && <p className="text-red-500 text-xs mt-1">{errors.licenseNumber}</p>}
              </div>
            </div>
          </div>

          {/* Section 2: Contact Info */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              ข้อมูลการติดต่อ
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ไอดีไลน์ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="lineId"
                  value={formData.lineId}
                  onChange={handleInputChange}
                  placeholder="LINE ID"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.lineId ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.lineId && <p className="text-red-500 text-xs mt-1">{errors.lineId}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อไลน์ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="lineName"
                  value={formData.lineName}
                  onChange={handleInputChange}
                  placeholder="ชื่อที่แสดงใน LINE"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.lineName ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.lineName && <p className="text-red-500 text-xs mt-1">{errors.lineName}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  อีเมล <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="email@example.com"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="02-xxx-xxxx"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เบอร์มือถือ <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleInputChange}
                  placeholder="08x-xxx-xxxx"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.mobile ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.mobile && <p className="text-red-500 text-xs mt-1">{errors.mobile}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เว็บไซต์
                </label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="www.example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Sponsors */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              ผู้รับรองสมาชิก
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ผู้รับรองสมาชิก ท่านที่ 1 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="sponsor1"
                  value={formData.sponsor1}
                  onChange={handleInputChange}
                  placeholder="ชื่อ-นามสกุล หรือ ชื่อเล่น ของผู้รับรอง"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.sponsor1 ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.sponsor1 && <p className="text-red-500 text-xs mt-1">{errors.sponsor1}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ผู้รับรองสมาชิก ท่านที่ 2 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="sponsor2"
                  value={formData.sponsor2}
                  onChange={handleInputChange}
                  placeholder="ชื่อ-นามสกุล หรือ ชื่อเล่น ของผู้รับรอง"
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.sponsor2 ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.sponsor2 && <p className="text-red-500 text-xs mt-1">{errors.sponsor2}</p>}
              </div>
            </div>
          </div>

          {/* Section 4: Document Notice */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-orange-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              เอกสารที่ต้องจัดส่งเพิ่มเติม
            </h2>

            <div className="bg-white rounded-lg p-4 border border-orange-200">
              <p className="text-sm text-gray-700 mb-3">
                <strong>หลังจากส่งใบสมัครแล้ว</strong> กรุณาจัดส่งเอกสารดังต่อไปนี้ให้กับนายทะเบียนชมรม:
              </p>
              <ul className="text-sm text-gray-700 space-y-2 mb-4">
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span><strong>ใบอนุญาตประกอบธุรกิจนำเที่ยว</strong> ฉบับปัจจุบัน (ต้องไม่หมดอายุ)</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span><strong>นามบัตร</strong> ของผู้สมัคร</span>
                </li>
              </ul>
              <div className="bg-orange-50 rounded-lg p-3">
                <p className="text-sm text-orange-800">
                  <strong>ช่องทางการส่งเอกสาร:</strong> กรุณาส่งเอกสารผ่านทาง LINE ของนายทะเบียนชมรม (จะแสดงลิงก์หลังส่งใบสมัครเรียบร้อย)
                </p>
              </div>
            </div>
          </div>

          {/* Section 5: Terms and Conditions */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              เงื่อนไขและกฎกติกาของชมรม
            </h2>

            <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto text-sm text-gray-700 mb-4">
              <p className="mb-4 text-gray-600">
                กรุณาอ่านเงื่อนไขและกฎกติกาของชมรมให้ครบถ้วน และกดยอมรับหากท่านเข้าใจและสามารถปฏิบัติตามเงื่อนไขของชมรมได้
              </p>

              <h3 className="font-semibold text-gray-800 mb-2">วัตถุประสงค์ของชมรม Agents Club</h3>
              <p className="mb-4">
                ชมรม Agents Club ก่อตั้งขึ้นเพื่อส่งเสริมการช่วยเหลือและแบ่งปัน (Helping & Sharing) ระหว่างสมาชิก ทั้งในด้านข้อมูล ข่าวสาร ตลอดจนการพัฒนาความรู้ความสามารถด้านการดำเนินธุรกิจนำเที่ยว เพื่อให้องค์กรของสมาชิกเจริญเติบโตอย่างยั่งยืน รวมถึงการจัดกิจกรรมต่าง ๆ ของชมรมเพื่อส่งเสริมและพัฒนาวิชาชีพนำเที่ยวของสมาชิก
              </p>

              <h3 className="font-semibold text-gray-800 mb-2">คุณสมบัติและเงื่อนไขการเป็นสมาชิกประเภทสามัญ</h3>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>เป็นบริษัททัวร์ที่ดำเนินธุรกิจในรูปแบบตัวแทนจำหน่าย (Agent) โดยส่งลูกค้าร่วมทัวร์ (Join Tour) เป็นหลัก หรืออาจดำเนินการหน้าร้านเองบ้าง แต่จะต้องมีการส่งลูกค้าร่วมทัวร์ให้กับบริษัทอื่นด้วย และต้องมีใบอนุญาตประกอบธุรกิจนำเที่ยวประเภททั่วไป (Outbound)</li>
                <li>ผู้สมัครต้องมีแนวคิดที่สอดคล้องกับวัตถุประสงค์ของชมรม คือ การช่วยเหลือและแบ่งปัน (Helping & Sharing)</li>
                <li>ผู้สมัครต้องมีสมาชิกชมรม Agents Club รับรองจำนวน 2 ท่าน</li>
              </ul>
              <p className="text-xs text-gray-500 mb-4 bg-yellow-50 p-2 rounded">
                <strong>หมายเหตุ:</strong> สงวนสิทธิ์สำหรับบริษัทที่มีใบอนุญาตนำเที่ยวประเภททั่วไป (Outbound) และให้บริการในรูปแบบ Tour Distributor / Retail (ตัวแทนจำหน่ายทัวร์หรือส่งลูกค้าร่วมทัวร์) เท่านั้น
              </p>

              <h3 className="font-semibold text-gray-800 mb-2">กฎกติกาภายในกลุ่ม LINE ของชมรม</h3>
              <ul className="list-disc list-inside space-y-1">
                <li>ห้ามโพสต์ขายทัวร์หรือโฆษณาในกลุ่ม</li>
                <li>ห้ามเชิญสมาชิกใหม่เข้ากลุ่มด้วยตนเอง โดยสมาชิกใหม่จะต้องผ่านการลงทะเบียนและได้รับการอนุมัติจากชมรมเท่านั้น</li>
                <li>ห้ามโพสต์ข้อความทักทาย เช่น สวัสดีตอนเช้า หรือข้อความที่ไม่เกี่ยวข้องกับวัตถุประสงค์ของชมรม</li>
                <li>ห้ามโพสต์เนื้อหาเกี่ยวกับการเมืองโดยเด็ดขาด</li>
              </ul>
            </div>

            <label className={`flex items-start gap-3 p-4 rounded-lg cursor-pointer transition-colors ${acceptedTerms ? 'bg-green-50 border border-green-200' : errors.acceptedTerms ? 'bg-red-50 border border-red-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => {
                  setAcceptedTerms(e.target.checked);
                  if (e.target.checked) setErrors(prev => ({ ...prev, acceptedTerms: '' }));
                }}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                ข้าพเจ้าได้อ่านและเข้าใจเงื่อนไขและกฎกติกาของชมรม Agents Club แล้ว และยินยอมปฏิบัติตามทุกประการ
              </span>
            </label>
            {errors.acceptedTerms && <p className="text-red-500 text-xs mt-2">{errors.acceptedTerms}</p>}
          </div>

          {/* Submit Button */}
          <div className="flex flex-col items-center gap-4">
            <button
              type="submit"
              disabled={submitting}
              className="w-full md:w-auto px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  กำลังส่งใบสมัคร...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  ส่งใบสมัครสมาชิก
                </>
              )}
            </button>

            {/* Contact */}
            <div className="text-center text-sm text-gray-500">
              <p className="mb-2">หากพบปัญหา ติดต่อทีมนายทะเบียน</p>
              <a href="https://lin.ee/YahadVz" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://scdn.line-apps.com/n/line_add_friends/btn/th.png"
                  alt="เพิ่มเพื่อน"
                  height="36"
                  className="inline-block"
                />
              </a>
            </div>
          </div>
        </form>
      </div>

      <Toast toasts={toast.toasts} onRemove={toast.removeToast} />
    </div>
  );
}
