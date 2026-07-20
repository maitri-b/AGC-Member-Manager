'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { DEFAULT_TEMPLATES, MessageTemplateType, MessageTemplate } from '@/lib/message-templates';
import TestMessageModal from '@/components/admin/TestMessageModal';

interface TemplateData {
  default: string;
  custom?: string;
}

interface User {
  id: string;
  name: string;
  lineUserId: string;
  lineDisplayName?: string;
  role: string;
  memberId?: string;
  companyNameEN?: string;
}

export default function MessageTemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Record<string, TemplateData>>({});
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplateType | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testTemplateType, setTestTemplateType] = useState<MessageTemplateType | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<MessageTemplateType | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.role === 'admin' && Object.keys(templates).length === 0) {
      fetchTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.role]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/settings/message-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');

      const data = await response.json();
      setTemplates(data.templates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('ไม่สามารถโหลดข้อมูล template ได้');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (templateType: MessageTemplateType) => {
    const template = templates[templateType];
    setEditingTemplate(templateType);
    setEditValue(template?.custom || template?.default || '');
    setShowPreview(false);
  };

  const handleSave = async (templateType: MessageTemplateType) => {
    try {
      setSaving(templateType);

      const response = await fetch('/api/admin/settings/message-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType,
          customTemplate: editValue,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save template');
      }

      await fetchTemplates();
      setEditingTemplate(null);
      toast.success('บันทึก template เรียบร้อย');
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error(error instanceof Error ? error.message : 'ไม่สามารถบันทึก template ได้');
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async (templateType: MessageTemplateType) => {
    if (!confirm('ต้องการรีเซ็ตกลับเป็นค่าเริ่มต้นหรือไม่?')) {
      return;
    }

    try {
      setSaving(templateType);

      const response = await fetch('/api/admin/settings/message-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType,
          customTemplate: '', // Empty string to reset
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reset template');
      }

      await fetchTemplates();
      setEditingTemplate(null);
      toast.success('รีเซ็ต template เรียบร้อย');
    } catch (error) {
      console.error('Error resetting template:', error);
      toast.error(error instanceof Error ? error.message : 'ไม่สามารถรีเซ็ต template ได้');
    } finally {
      setSaving(null);
    }
  };

  const handleCancel = () => {
    setEditingTemplate(null);
    setEditValue('');
    setShowPreview(false);
  };

  const toggleTemplate = (templateType: MessageTemplateType) => {
    if (expandedTemplate === templateType) {
      setExpandedTemplate(null);
      setEditingTemplate(null);
      setShowPreview(false);
    } else {
      setExpandedTemplate(templateType);
    }
  };

  const handleOpenTestModal = (templateType: MessageTemplateType) => {
    setTestTemplateType(templateType);
    setTestModalOpen(true);
  };

  const handleSendTestMessage = async (lineUserId: string, userData: User) => {
    if (!testTemplateType) return;

    try {
      const response = await fetch('/api/admin/settings/message-templates/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType: testTemplateType,
          lineUserId,
          userData,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send test message');
      }

      toast.success(`ส่งข้อความทดสอบให้ ${userData.lineDisplayName || userData.name} เรียบร้อย`);
    } catch (error) {
      console.error('Error sending test message:', error);
      toast.error(error instanceof Error ? error.message : 'ไม่สามารถส่งข้อความทดสอบได้');
      throw error;
    }
  };

  const renderPreview = (template: string) => {
    // Replace variables with example data
    const previewText = template
      .replace(/\{\{memberName\}\}/g, 'คุณสมชาย ใจดี')
      .replace(/\{\{eventName\}\}/g, 'ทริปญี่ปุ่น โตเกียว-ฟูจิ 5 วัน 4 คืน')
      .replace(/\{\{amountText\}\}/g, '25,000')
      .replace(/\{\{deadlineText\}\}/g, '15 สิงหาคม 2569 (อีก 3 วัน - เร่งด่วน!)')
      .replace(/\{\{paymentTypeLabel\}\}/g, 'มัดจำ')
      .replace(/\{\{daysOverdue\}\}/g, '2')
      .replace(/\{\{registrationId\}\}/g, 'REG-2024-001')
      .replace(/\{\{eventLink\}\}/g, 'https://agc-member-manager.vercel.app/events/event123')
      .replace(/\{\{memberId\}\}/g, 'M-2024-001')
      .replace(/\{\{fullName\}\}/g, 'สมชาย ใจดี')
      .replace(/\{\{companyName\}\}/g, 'ABC Company Limited')
      .replace(/\{\{memberStatus\}\}/g, 'Active Member')
      .replace(/\{\{profileLink\}\}/g, 'https://agc-member-manager.vercel.app/profile')
      .replace(/\{\{rejectionReason\}\}/g, 'ข้อมูลยังไม่ครบถ้วน')
      .replace(/\{\{lineOfficialAccount\}\}/g, 'https://lin.ee/nzAjXXq');

    return previewText;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (session?.user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">ไม่มีสิทธิ์เข้าถึง</h1>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            กลับหน้าหลัก
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/admin/settings" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">จัดการ Message Templates</h1>
              <p className="text-sm text-gray-500 mt-1">Customize LINE notification message templates</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Info Banner */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded mb-6">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">เกี่ยวกับ Message Templates:</p>
              <p className="mb-2">
                คุณสามารถปรับแต่งข้อความแจ้งเตือนที่ส่งผ่าน LINE ได้ตามต้องการ โดยใช้ตัวแปรต่างๆ แล้วแต่ประเภทข้อความ
              </p>
              <div className="space-y-1">
                <p className="text-xs">
                  <strong>สำหรับข้อความชำระเงิน:</strong>
                  <code className="ml-2 px-1.5 py-0.5 bg-white rounded text-xs">
                    {'{{memberName}}'} {'{{eventName}}'} {'{{amountText}}'} {'{{deadlineText}}'} {'{{eventLink}}'} {'{{registrationId}}'}
                  </code>
                </p>
                <p className="text-xs">
                  <strong>สำหรับข้อความสมัครสมาชิก:</strong>
                  <code className="ml-2 px-1.5 py-0.5 bg-white rounded text-xs">
                    {'{{memberName}}'} {'{{memberId}}'} {'{{fullName}}'} {'{{companyName}}'} {'{{memberStatus}}'} {'{{profileLink}}'} {'{{rejectionReason}}'}
                  </code>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Templates List */}
        <div className="space-y-4">
          {Object.keys(DEFAULT_TEMPLATES).map((key) => {
            const templateType = key as MessageTemplateType;
            const templateInfo = DEFAULT_TEMPLATES[templateType];
            const templateData = templates[key];
            const isEditing = editingTemplate === templateType;
            const isCustomized = !!templateData?.custom;
            const isExpanded = expandedTemplate === templateType;

            return (
              <div key={key} className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
                {/* Template Header - Clickable to expand/collapse */}
                <button
                  onClick={() => toggleTemplate(templateType)}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 p-4 hover:from-blue-700 hover:to-blue-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-white">{templateInfo.name}</h2>
                        {isCustomized && (
                          <span className="px-2 py-0.5 bg-yellow-500 text-white text-xs font-medium rounded-full">
                            กำหนดเอง
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-blue-100 mt-1">{templateInfo.description}</p>
                    </div>
                    <svg
                      className={`w-6 h-6 text-white transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Template Body - Collapsible */}
                {isExpanded && (
                  <div className="p-6 border-t border-gray-200">
                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          แก้ไข Template
                        </label>
                        <textarea
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          rows={12}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                          placeholder="ใส่เนื้อหาข้อความ..."
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          ตัวแปรที่ใช้ได้: {templateInfo.variables.map((v) => `{{${v}}}`).join(', ')}
                        </p>
                      </div>

                      {/* Preview Toggle */}
                      <div>
                        <button
                          onClick={() => setShowPreview(!showPreview)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {showPreview ? 'ซ่อนตัวอย่าง' : 'แสดงตัวอย่าง'}
                        </button>
                      </div>

                      {showPreview && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <p className="text-xs font-semibold text-gray-700 mb-2">ตัวอย่าง:</p>
                          <div className="bg-white border border-gray-300 rounded-lg p-4 whitespace-pre-wrap text-sm">
                            {renderPreview(editValue)}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center gap-3 pt-4">
                        <button
                          onClick={() => handleSave(templateType)}
                          disabled={saving === templateType}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {saving === templateType ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                              <span>กำลังบันทึก...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>บันทึก</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={saving === templateType}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                          ยกเลิก
                        </button>
                        {isCustomized && (
                          <button
                            onClick={() => handleReset(templateType)}
                            disabled={saving === templateType}
                            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 ml-auto"
                          >
                            รีเซ็ตเป็นค่าเริ่มต้น
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p className="text-xs font-semibold text-gray-700 mb-2">
                          {isCustomized ? 'Template ปัจจุบัน (กำหนดเอง):' : 'Template ปัจจุบัน (ค่าเริ่มต้น):'}
                        </p>
                        <div className="bg-white border border-gray-300 rounded-lg p-4 whitespace-pre-wrap text-sm">
                          {templateData?.custom || templateData?.default || ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleEdit(templateType)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>แก้ไข</span>
                        </button>
                        <button
                          onClick={() => handleOpenTestModal(templateType)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span>ทดสอบส่ง</span>
                        </button>
                        {isCustomized && (
                          <button
                            onClick={() => handleReset(templateType)}
                            disabled={saving === templateType}
                            className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            รีเซ็ตเป็นค่าเริ่มต้น
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Test Message Modal */}
      {testTemplateType && (
        <TestMessageModal
          isOpen={testModalOpen}
          onClose={() => setTestModalOpen(false)}
          templateType={testTemplateType}
          templateName={DEFAULT_TEMPLATES[testTemplateType].name}
          onSendTest={handleSendTestMessage}
        />
      )}
    </div>
  );
}
