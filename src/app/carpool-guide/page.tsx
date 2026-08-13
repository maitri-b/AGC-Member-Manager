'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function CarpoolGuidePage() {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenFAQ(openFAQ === index ? null : index);
  };

  const faqs = [
    {
      question: 'Q1: สามารถลงทะเบียนรถยนต์ ได้กี่คัน?',
      answer: '✅ ตอบ: 1 เอเจ้นท์สามารถลงทะเบียนรถยนต์ ได้มากกว่า 1 คัน',
    },
    {
      question: 'Q2: ต้องการเลขรหัสลงทะเบียนเพื่อทำอะไร?',
      answer: (
        <>
          <p className="font-semibold">✅ ตอบ:</p>
          <p className="mt-2"><strong>เจ้าของรถ (วิธีที่ 1):</strong></p>
          <p>→ ต้องขอรหัสจากคนที่ต้องการชวนเพื่อค้นหาและเชิญเข้า Carpool</p>
          <p className="mt-2"><strong>ผู้ Join (วิธีที่ 2):</strong></p>
          <p>→ ต้องขอรหัสจากเจ้าของรถเพื่อค้นหา Carpool ของเขา</p>
        </>
      ),
    },
    {
      question: 'Q3: ควรใช้วิธีไหนในการเข้าร่วม Carpool?',
      answer: (
        <>
          <p className="font-semibold">✅ ตอบ:</p>
          <p className="mt-2">คุณสามารถเลือกวิธีการ Join รถคนอื่นได้ 2 วิธี คือ</p>
          <p className="mt-2"><strong>วิธีที่ 1 - เจ้าของรถเพิ่มชื่อ:</strong></p>
          <p>โดยการแจ้งรหัส 6 หลักให้เจ้าของรถเป็นผู้เพิ่มชื่อท่านเข้าสู่ Carpool</p>
          <ul className="list-disc list-inside ml-4 mt-1">
            <li>✅ ง่าย รวดเร็ว</li>
            <li>⚠️ ต้องรอเจ้าของรถดำเนินการ</li>
          </ul>
          <p className="mt-2"><strong>วิธีที่ 2 - ผู้ Join ขอเข้าเอง:</strong></p>
          <p>ผู้ขอ Join รถ จะต้องขอรหัส 6 หลัก จากเจ้าของรถ</p>
          <ul className="list-disc list-inside ml-4 mt-1">
            <li>✅ ทำเองได้ทันที ไม่ต้องรอ</li>
            <li>⚠️ ต้องรู้รหัสลงทะเบียนของเจ้าของรถ</li>
          </ul>
        </>
      ),
    },
    {
      question: 'Q4: แก้ไขหรือลบ Carpool ได้อย่างไร?',
      answer: (
        <>
          <p className="font-semibold">✅ ตอบ:</p>
          <p className="mt-2"><strong>แก้ไข:</strong></p>
          <p>→ กดปุ่ม ✏️ <strong>แก้ไข</strong> ในการ์ด ทะเบียนรถของคุณ</p>
          <p className="mt-2"><strong>ลบ:</strong></p>
          <p>→ กดปุ่ม 🗑️ <strong>ลบ</strong> (ระบบจะถามยืนยัน)</p>
        </>
      ),
    },
    {
      question: 'Q5: ย้ายออก ที่เข้าร่วมได้อย่างไร?',
      answer: (
        <>
          <p className="font-semibold">✅ ตอบ:</p>
          <ol className="list-decimal list-inside ml-4 mt-2">
            <li>ไปที่การ์ด <strong>Carpools ที่เข้าร่วม</strong></li>
            <li>กดปุ่ม <strong>ย้ายออก</strong> (สีแดง) ข้างชื่อสมาชิกของคุณ</li>
            <li>ยืนยันการออก</li>
          </ol>
        </>
      ),
    },
    {
      question: 'Q6: ลบสมาชิกที่ชวนมาย้ายออก ได้อย่างไร?',
      answer: (
        <>
          <p className="font-semibold">✅ ตอบ:</p>
          <ol className="list-decimal list-inside ml-4 mt-2">
            <li>ไปที่การ์ด <strong>ทะเบียนรถของคุณ</strong></li>
            <li>กดปุ่ม <strong>ย้ายออก</strong> (สีแดง) ข้างชื่อสมาชิกที่ต้องการนำออก</li>
            <li>ยืนยันการออก</li>
          </ol>
        </>
      ),
    },
    {
      question: 'Q7: สมาชิกคนเดียวสามารถอยู่ใน Carpool หลายคันได้หรือไม่?',
      answer: (
        <>
          <p className="font-semibold">❌ ตอบ: ไม่ได้</p>
          <ul className="list-disc list-inside ml-4 mt-2">
            <li>สมาชิก 1 คนสามารถอยู่ใน Carpool ได้เพียง 1 คันเท่านั้น</li>
            <li>ถ้าต้องการย้ายรถ ต้องออกจากรถเก่าก่อน</li>
          </ul>
        </>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-green-600 text-white py-8 shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-4xl font-bold mb-2">🚗 คู่มือการใช้งานระบบ Carpool</h1>
          <p className="text-blue-100">การลงทะเบียนรถยนต์และลงชื่อไปด้วยกัน | Agents Club</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Main Content Area */}
          <main className="space-y-8">
            {/* Table of Contents */}
            <section className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                สารบัญ
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Case 1 */}
                <a
                  href="#case1"
                  className="block p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">🚙</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-blue-900 group-hover:text-blue-700 mb-1">
                        กรณีที่ 1: ขับรถไปเอง
                      </h3>
                      <p className="text-sm text-gray-600">
                        สำหรับท่านที่มีรถและจะขับไปเอง
                      </p>
                      <p className="text-xs text-blue-600 mt-2 font-medium">
                        → 5 ขั้นตอน
                      </p>
                    </div>
                  </div>
                </a>

                {/* Case 2 */}
                <a
                  href="#case2"
                  className="block p-4 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">🚐</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-green-900 group-hover:text-green-700 mb-1">
                        กรณีที่ 2: Carpool กับเอเจ้นท์อื่น
                      </h3>
                      <p className="text-sm text-gray-600">
                        สำหรับท่านที่ไม่มีรถหรือต้องการไปกับเพื่อน
                      </p>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-purple-600 font-medium">
                          📝 วิธีที่ 1: เจ้าของรถเพิ่มชื่อ (6 ขั้นตอน)
                        </p>
                        <p className="text-xs text-green-600 font-medium">
                          🔍 วิธีที่ 2: ผู้ Join ขอเข้าเอง (7 ขั้นตอน)
                        </p>
                      </div>
                    </div>
                  </div>
                </a>

                {/* FAQ */}
                <a
                  href="#faq"
                  className="block p-4 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">❓</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-purple-900 group-hover:text-purple-700 mb-1">
                        คำถามที่พบบ่อย (FAQ)
                      </h3>
                      <p className="text-sm text-gray-600">
                        คำตอบสำหรับคำถามยอดนิยม
                      </p>
                      <p className="text-xs text-purple-600 mt-2 font-medium">
                        → 7 คำถาม
                      </p>
                    </div>
                  </div>
                </a>

                {/* Introduction */}
                <a
                  href="#intro"
                  className="block p-4 border-2 border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-3xl">ℹ️</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 group-hover:text-gray-700 mb-1">
                        ระบบ Carpool คืออะไร?
                      </h3>
                      <p className="text-sm text-gray-600">
                        ทำความเข้าใจระบบและจุดเด่น
                      </p>
                    </div>
                  </div>
                </a>
              </div>
            </section>

            {/* Introduction */}
            <section id="intro" className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 scroll-mt-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-3xl">ℹ️</span>
                ระบบ Carpool คืออะไร?
              </h2>
              <div className="prose max-w-none">
                <p className="text-gray-700 mb-4">
                  ระบบที่ช่วยให้สมาชิกสามารถ:
                </p>
                <ul className="space-y-2 mb-6">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 mt-1">✅</span>
                    <span>ลงทะเบียนรถยนต์ของตัวเอง</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 mt-1">✅</span>
                    <span>ชวนเอเจ้นท์จากรหัสลงทะเบียนอื่นร่วมเดินทาง</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 mt-1">✅</span>
                    <span>เข้าร่วมรถของเอเจ้นท์ท่านอื่น</span>
                  </li>
                </ul>

                <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-l-4 border-purple-500 p-4 rounded-r-lg">
                  <h3 className="font-bold text-purple-900 mb-2 flex items-center gap-2">
                    <span>✨</span>
                    จุดเด่นของระบบ
                  </h3>
                  <ul className="space-y-1 text-purple-800">
                    <li>• <strong>1 เอเจ้นท์สามารถลงทะเบียนรถยนต์ ได้มากกว่า 1 คัน</strong></li>
                    <li>• สามารถเชิญเอเจ้นท์จากรหัสลงทะเบียนอื่นได้</li>
                    <li>• ยืดหยุ่น สะดวก ประหยัดค่าใช้จ่าย</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Case 1 */}
            <section id="case1" className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 scroll-mt-4">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-4xl">🚙</span>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">กรณีที่ 1: ขับรถไปเอง</h2>
                  <p className="text-gray-600">เหมาะสำหรับท่านที่มีรถและจะขับไปเอง</p>
                </div>
              </div>

              {/* Step-by-step with images */}
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                    เข้าสู่หน้า Carpool
                  </h3>
                  <p className="text-gray-700 mb-4">
                    เลื่อนหน้าลงมาที่ส่วน <strong>🚗 การลงทะเบียนรถยนต์ และลงชื่อไปด้วยกัน (Carpool)</strong>
                  </p>
                  <div className="rounded-lg overflow-hidden shadow-md border border-gray-200 max-w-2xl">
                    <Image
                      src="https://storage.googleapis.com/agents-club-event-slips/images/howto_carpool/01.jpg"
                      alt="หน้า Carpool เริ่มต้น"
                      width={560}
                      height={280}
                      className="w-full h-auto"
                    />
                  </div>
                  <p className="text-sm text-gray-600 mt-2">💡 หากยังไม่มี Carpool จะแสดงข้อความ "ยังไม่มี Carpool"</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                    ลงทะเบียนรถยนต์ ใหม่
                  </h3>
                  <p className="text-gray-700 mb-4">
                    กดปุ่ม <strong className="text-blue-600">+ ลงทะเบียนรถยนต์</strong> (สีน้ำเงิน)
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span>
                    กรอกข้อมูลรถ
                  </h3>
                  <div className="rounded-lg overflow-hidden shadow-md border border-gray-200 mb-4 max-w-2xl">
                    <Image
                      src="https://storage.googleapis.com/agents-club-event-slips/images/howto_carpool/02.jpg"
                      alt="ฟอร์มลงทะเบียนรถยนต์"
                      width={560}
                      height={280}
                      className="w-full h-auto"
                    />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold text-gray-900">1. เลขทะเบียนรถ</p>
                      <p className="text-gray-700 ml-4">• ใส่ทะเบียนรถของคุณ</p>
                      <p className="text-gray-700 ml-4">• ตัวอย่าง: <code className="bg-gray-200 px-2 py-1 rounded">กก 8888</code></p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">2. เลือกสมาชิกที่จะร่วมเดินทาง</p>
                      <p className="text-gray-700 ml-4">• ✅ เลือกเฉพาะสมาชิกในทีมของคุณ</p>
                      <p className="text-gray-700 ml-4">• ✅ สามารถเลือกได้มากกว่า 1 คน</p>
                    </div>
                  </div>
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mt-4 rounded-r-lg">
                    <p className="font-semibold text-yellow-900">⚠️ สำคัญ!</p>
                    <p className="text-yellow-800 text-sm mt-1">
                      กรุณาระบุทะเบียนรถยนต์ของทีมคุณเท่านั้น หากเดินทางไปกับเอเจ้นท์รายอื่น โปรดเลือก <strong>'Join รถคนอื่น'</strong> แทน
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">4</span>
                    บันทึกข้อมูล
                  </h3>
                  <p className="text-gray-700 mb-2">
                    กดปุ่ม <strong className="text-blue-600">ลงทะเบียนรถยนต์</strong> (สีน้ำเงิน)
                  </p>
                  <p className="text-green-700 font-semibold">✅ ระบบจะแสดงข้อความ "ลงทะเบียนรถยนต์ สำเร็จ"</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">5</span>
                    ตรวจสอบ Carpool ที่สร้าง
                  </h3>
                  <div className="rounded-lg overflow-hidden shadow-md border border-gray-200 mb-4 max-w-2xl">
                    <Image
                      src="https://storage.googleapis.com/agents-club-event-slips/images/howto_carpool/03.jpg"
                      alt="ทะเบียนรถของคุณ"
                      width={560}
                      height={280}
                      className="w-full h-auto"
                    />
                  </div>
                  <p className="text-gray-700 mb-3">
                    หลังจากสร้างสำเร็จ คุณจะเห็น <strong>ทะเบียนรถของคุณ</strong> พร้อมข้อมูล:
                  </p>
                  <ul className="space-y-1 text-gray-700">
                    <li>📌 <strong>เลขทะเบียนรถ</strong> - เช่น กก 8888</li>
                    <li>📌 <strong>เจ้าของ</strong> - ชื่อบริษัทของคุณ</li>
                    <li>📌 <strong>จำนวนสมาชิก</strong> - X คน</li>
                    <li>📌 <strong>รายชื่อสมาชิก</strong> - แสดงทุกคนที่ร่วมรถคันนี้</li>
                  </ul>
                  <div className="bg-white p-4 rounded-lg mt-4 border border-gray-200">
                    <p className="font-semibold text-gray-900 mb-2">ปุ่มจัดการ:</p>
                    <ul className="space-y-1 text-gray-700">
                      <li>• ✏️ <strong>แก้ไข</strong> - เปลี่ยนทะเบียนหรือสมาชิก</li>
                      <li>• 🗑️ <strong>ลบ</strong> - ลบ Carpool นี้</li>
                      <li>• ➕ <strong>ชวนเพื่อนเข้า Carpool</strong> - เพิ่มคนจากรหัสลงทะเบียนอื่น</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* Case 2 */}
            <section id="case2" className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 scroll-mt-4">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-4xl">🚐</span>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">กรณีที่ 2: Carpool ไปกับเอเจ้นท์อื่น</h2>
                  <p className="text-gray-600">เหมาะสำหรับท่านที่ไม่มีรถหรือต้องการไปกับเพื่อน</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6 mb-6">
                <p className="text-gray-800 mb-4">มี <strong>2 วิธี</strong> ในการเข้าร่วม Carpool ของเอเจ้นท์อื่น:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr>
                        <th className="border border-gray-300 px-4 py-2 text-left">วิธี</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">ใครเป็นผู้ดำเนินการ</th>
                        <th className="border border-gray-300 px-4 py-2 text-left">ข้อดี</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      <tr>
                        <td className="border border-gray-300 px-4 py-2 font-semibold">📝 วิธีที่ 1</td>
                        <td className="border border-gray-300 px-4 py-2"><strong>เจ้าของรถ</strong>เป็นคนเพิ่มชื่อ</td>
                        <td className="border border-gray-300 px-4 py-2">ง่าย รวดเร็ว</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-300 px-4 py-2 font-semibold">🔍 วิธีที่ 2</td>
                        <td className="border border-gray-300 px-4 py-2"><strong>ผู้ Join</strong>ขอเข้าร่วมเอง</td>
                        <td className="border border-gray-300 px-4 py-2">ไม่ต้องรอเจ้าของรถ</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-gray-600 mt-3">
                  💡 <strong>แนะนำ:</strong> ใช้วิธีที่ 1 หากเจ้าของรถพร้อมช่วยเหลือ หรือวิธีที่ 2 หากต้องการทำเอง
                </p>
              </div>

              {/* Method 1 */}
              <div id="method1" className="scroll-mt-4">
                <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-lg mb-6">
                  <h3 className="text-xl font-bold text-purple-900 mb-2 flex items-center gap-2">
                    📝 วิธีที่ 1: เจ้าของรถเป็นคนเพิ่มชื่อ Join
                  </h3>
                  <p className="text-purple-800">ผู้ดำเนินการ: เจ้าของรถ (คนที่ลงทะเบียนรถยนต์)</p>
                </div>

                <div className="space-y-6">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    <h4 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
                      <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                      เตรียมข้อมูล
                    </h4>
                    <p className="text-gray-700">
                      <strong>ขอรหัสลงทะเบียน</strong> จากเพื่อนที่ต้องการชวน
                    </p>
                    <p className="text-gray-600 text-sm mt-2">
                      รหัสลงทะเบียน 6 หลัก ตัวอย่าง: <code className="bg-gray-200 px-2 py-1 rounded">ABC123</code>
                    </p>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    <h4 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
                      <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                      เข้าสู่หน้าชวนเพื่อน
                    </h4>
                    <p className="text-gray-700 mb-3">
                      1. ในการ์ด <strong>ทะเบียนรถของคุณ</strong>
                    </p>
                    <p className="text-gray-700">
                      2. กดปุ่ม <strong className="text-blue-600">+ ชวนเพื่อนเข้า Carpool</strong> (สีน้ำเงิน)
                    </p>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    <h4 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
                      <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span>
                      ค้นหารหัสลงทะเบียน
                    </h4>
                    <div className="rounded-lg overflow-hidden shadow-md border border-gray-200 mb-4 max-w-2xl">
                      <Image
                        src="https://storage.googleapis.com/agents-club-event-slips/images/howto_carpool/04.jpg"
                        alt="ฟอร์มชวนเพื่อน"
                        width={560}
                        height={280}
                        className="w-full h-auto"
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-gray-700">
                        <strong>1. ใส่รหัสลงทะเบียน</strong> - ระบุรหัสของเพื่อนที่ต้องการชวน
                      </p>
                      <p className="text-gray-700">
                        <strong>2. กดปุ่ม ค้นหา</strong> (สีน้ำเงิน)
                      </p>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    <h4 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
                      <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">4</span>
                      เลือกสมาชิกที่ต้องการชวน
                    </h4>
                    <p className="text-gray-700">
                      ระบบจะแสดงรายชื่อผู้เข้าร่วมจากรหัสลงทะเบียนนั้น
                    </p>
                    <p className="text-green-700 font-semibold mt-2">
                      ✅ เลือกสมาชิกที่ต้องการชวน (เลือกได้หลายคน)
                    </p>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    <h4 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
                      <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">5</span>
                      ยืนยันการชวน
                    </h4>
                    <p className="text-gray-700 mb-2">
                      กดปุ่ม <strong className="text-blue-600">ชวนเข้า Carpool</strong> (สีน้ำเงิน)
                    </p>
                    <p className="text-green-700 font-semibold">
                      ✅ ระบบจะเพิ่มสมาชิกที่เลือกเข้า ทะเบียนรถของคุณ
                    </p>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                    <h4 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
                      <span className="bg-purple-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">6</span>
                      ตรวจสอบรายชื่อ
                    </h4>
                    <p className="text-gray-700 mb-3">
                      ในการ์ด <strong>ทะเบียนรถของคุณ</strong> จะแสดง:
                    </p>
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <p className="font-semibold text-gray-900 mb-2">รายชื่อสมาชิกทะเบียนรถคันนี้:</p>
                      <ul className="space-y-1 text-gray-700">
                        <li>• ชื่อสมาชิกในทีมของคุณ</li>
                        <li>• ชื่อสมาชิกจากรหัสลงทะเบียนอื่น พร้อมปุ่ม <strong className="text-red-600">ย้ายออก</strong> (สีแดง)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Method 2 */}
              <div id="method2" className="scroll-mt-4 mt-8">
                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg mb-6">
                  <h3 className="text-xl font-bold text-green-900 mb-2 flex items-center gap-2">
                    🔍 วิธีที่ 2: ผู้ Join ขอเข้าร่วมเอง
                  </h3>
                  <p className="text-green-800">ผู้ดำเนินการ: คนที่ต้องการเข้าร่วม Carpool (ผู้ Join)</p>
                </div>

                <div className="space-y-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h4 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                      <span className="bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                      เตรียมข้อมูล
                    </h4>
                    <p className="text-gray-700 mb-2">
                      <strong>ขอรหัสลงทะเบียน</strong> จากเจ้าของรถที่ต้องการเข้าร่วม
                    </p>
                    <p className="text-gray-600 text-sm mb-3">
                      รหัสลงทะเบียน 6 หลัก ตัวอย่าง: <code className="bg-gray-200 px-2 py-1 rounded">ABC123</code>
                    </p>
                    <div className="bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded-r-lg">
                      <p className="font-semibold text-yellow-900 text-sm">⚠️ สำคัญ!</p>
                      <p className="text-yellow-800 text-sm mt-1">
                        คุณต้องมีรหัสลงทะเบียนของเจ้าของรถก่อนถึงจะ Join ได้
                      </p>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h4 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                      <span className="bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">2</span>
                      เข้าสู่หน้า Join รถคนอื่น
                    </h4>
                    <p className="text-gray-700 mb-2">
                      1. เลื่อนลงมาที่ส่วน <strong>🚗 การลงทะเบียนรถยนต์ และรวมไปด้วยกัน (Carpool)</strong>
                    </p>
                    <p className="text-gray-700">
                      2. กดปุ่ม <strong className="text-green-600">Join รถคนอื่น</strong> (สีเขียว)
                    </p>
                    <p className="text-sm text-gray-600 mt-3">
                      💡 ปุ่มนี้จะแสดงเฉพาะเมื่อมีสมาชิกในทีมที่ยังไม่ได้เข้าร่วม Carpool
                    </p>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h4 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                      <span className="bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">3</span>
                      ค้นหารถที่ต้องการ Join
                    </h4>
                    <div className="rounded-lg overflow-hidden shadow-md border border-gray-200 mb-4 max-w-2xl">
                      <Image
                        src="https://storage.googleapis.com/agents-club-event-slips/images/howto_carpool/05.jpg"
                        alt="ฟอร์มเข้าร่วมรถ"
                        width={560}
                        height={280}
                        className="w-full h-auto"
                      />
                    </div>
                    <p className="text-gray-700 mb-3">
                      หน้าต่าง <strong>เข้าร่วมรถของคนอื่น</strong> จะปรากฏขึ้น
                    </p>
                    <div className="space-y-2">
                      <p className="text-gray-700">
                        <strong>1. ใส่รหัสลงทะเบียน</strong> - ระบุรหัสของเจ้าของรถ
                      </p>
                      <p className="text-gray-700">
                        <strong>2. กดปุ่ม ค้นหา</strong> (สีน้ำเงิน)
                      </p>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h4 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                      <span className="bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">4</span>
                      เลือกรถที่ต้องการ Join
                    </h4>
                    <p className="text-gray-700 mb-3">
                      ระบบจะแสดงรายการ <strong>Carpool</strong> ของรหัสลงทะเบียนนั้น
                    </p>
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <p className="text-gray-700 mb-2">แต่ละ Carpool จะแสดง:</p>
                      <ul className="space-y-1 text-gray-700">
                        <li>• 🚗 <strong>เลขทะเบียนรถ</strong></li>
                        <li>• 👤 <strong>เจ้าของ</strong></li>
                        <li>• 👥 <strong>จำนวนสมาชิก</strong></li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h4 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                      <span className="bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">5</span>
                      เลือกสมาชิกที่จะ Join
                    </h4>
                    <p className="text-gray-700 mb-2">
                      ระบบจะแสดง <strong>รายชื่อผู้เข้าร่วมของคุณ</strong>
                    </p>
                    <p className="text-green-700 font-semibold">
                      ✅ เลือกสมาชิกที่ต้องการเข้าร่วม Carpool นี้ (เลือกได้มากกว่า 1 คน)
                    </p>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h4 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                      <span className="bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">6</span>
                      ยืนยันการ Join
                    </h4>
                    <p className="text-gray-700 mb-2">
                      กดปุ่ม <strong className="text-green-600">เข้าร่วม Carpool</strong> (สีเขียว)
                    </p>
                    <p className="text-green-700 font-semibold">
                      ✅ ระบบจะแสดงข้อความ "เข้าร่วม Carpool สำเร็จ"
                    </p>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h4 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                      <span className="bg-green-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm">7</span>
                      ตรวจสอบสถานะ
                    </h4>
                    <p className="text-gray-700 mb-4">
                      หลังจาก Join สำเร็จ คุณจะเห็น 2 ส่วน:
                    </p>

                    <div className="space-y-4">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <p className="font-semibold text-gray-900 mb-2">📋 จัดการรายชื่อร่วม carpool:</p>
                        <p className="text-gray-700 text-sm">แสดงสถานะของสมาชิกในทีมคุณ:</p>
                        <ul className="mt-2 space-y-1 text-sm text-gray-700">
                          <li>• 🔴 <strong>ยังไม่ระบุรถ</strong> - ยังไม่ได้เข้าร่วม Carpool</li>
                          <li>• ✅ <strong>ระบุรถแล้ว</strong> - เข้าร่วม Carpool แล้ว</li>
                        </ul>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <p className="font-semibold text-gray-900 mb-2">🚗 Carpools ที่เข้าร่วม</p>
                        <p className="text-gray-700 text-sm mb-2">การ์ดสีเขียวแสดงข้อมูล:</p>
                        <ul className="space-y-1 text-sm text-gray-700">
                          <li>• เลขทะเบียนรถ</li>
                          <li>• เจ้าของ: ชื่อบริษัท</li>
                          <li>• จำนวนสมาชิก</li>
                          <li>• รายชื่อ (สมาชิกของคุณจะมีคำว่า <strong className="text-green-600">- joined</strong>)</li>
                          <li>• ปุ่ม <strong className="text-red-600">ย้ายออก</strong> (สีแดง)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* FAQ Section */}
            <section id="faq" className="bg-white rounded-xl shadow-lg p-8 border border-gray-200 scroll-mt-4">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <span className="text-3xl">❓</span>
                คำถามที่พบบ่อย (FAQ)
              </h2>

              <div className="space-y-3">
                {faqs.map((faq, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleFAQ(index)}
                      className="w-full px-6 py-4 bg-gradient-to-r from-blue-50 to-green-50 hover:from-blue-100 hover:to-green-100 transition-colors flex items-center justify-between gap-4 text-left"
                    >
                      <span className="font-semibold text-gray-900">{faq.question}</span>
                      <svg
                        className={`w-5 h-5 text-gray-600 transition-transform flex-shrink-0 ${
                          openFAQ === index ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openFAQ === index && (
                      <div className="px-6 py-4 bg-white border-t border-gray-200">
                        <div className="text-gray-700 text-sm">{faq.answer}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Contact Section */}
            <section className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl shadow-lg p-8 border border-blue-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-2xl">📞</span>
                ติดต่อสอบถาม
              </h2>
              <p className="text-gray-700 mb-3">
                หากมีข้อสงสัยหรือปัญหาในการใช้งาน กรุณาติดต่อ:
              </p>
              <div className="space-y-2">
                <p className="text-gray-800">
                  📱 <strong>LINE Official Account:</strong> Agents Club
                </p>
                <p className="text-gray-800">
                  👥 <strong>Admin/Committee</strong>
                </p>
              </div>
            </section>

            {/* Footer */}
            <div className="text-center text-sm text-gray-600 py-6 border-t border-gray-200">
              <p className="mb-1">
                <strong>เอกสารนี้จัดทำโดย:</strong> Agents Club Member Manager System
              </p>
              <p className="mb-1">
                <strong>วันที่อัปเดตล่าสุด:</strong> 13 สิงหาคม 2026
              </p>
              <p>
                <strong>เวอร์ชัน:</strong> 2.0
              </p>
            </div>
          </main>
        </div>
      </div>

      {/* Back to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110"
        aria-label="กลับไปด้านบน"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </button>
    </div>
  );
}
