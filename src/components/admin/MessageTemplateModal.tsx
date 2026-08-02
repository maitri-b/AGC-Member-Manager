'use client';

import { useState, useEffect } from 'react';
import { EventRegistration, Event } from '@/types/event';
import {
  MessageTemplateType,
  DEFAULT_TEMPLATES,
  personalizeMessage,
  suggestTemplate,
} from '@/lib/message-templates';
import { toast } from 'react-hot-toast';

interface MessageTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRegistrations: Array<{
    registration: EventRegistration;
    lineUserId: string;
  }>;
  event: Event;
}

export default function MessageTemplateModal({
  isOpen,
  onClose,
  selectedRegistrations,
  event,
}: MessageTemplateModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplateType | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [previewRecipient, setPreviewRecipient] = useState(0);
  const [baseUrl, setBaseUrl] = useState('https://agc-member-manager.vercel.app');
  const [customTemplates, setCustomTemplates] = useState<Record<string, string>>({});

  // Fetch base URL and custom templates from settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/settings');
        if (response.ok) {
          const settings = await response.json();
          setBaseUrl(settings.baseUrl || 'https://agc-member-manager.vercel.app');
          setCustomTemplates(settings.messageTemplates || {});
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        // Keep default values
      }
    };
    fetchSettings();
  }, []);

  // Auto-suggest template when modal opens
  useEffect(() => {
    if (isOpen && selectedRegistrations.length > 0 && !selectedTemplate) {
      const suggested = suggestTemplate(selectedRegistrations[0].registration, event);
      setSelectedTemplate(suggested);
      updateMessageFromTemplate(suggested);
    }
  }, [isOpen, selectedRegistrations, baseUrl]);

  // Update message when template or preview recipient changes
  useEffect(() => {
    if (selectedTemplate && selectedRegistrations.length > 0) {
      updateMessageFromTemplate(selectedTemplate);
    }
  }, [selectedTemplate, previewRecipient, baseUrl]);

  const updateMessageFromTemplate = (templateType: MessageTemplateType) => {
    if (selectedRegistrations.length === 0) return;

    const registration = selectedRegistrations[previewRecipient].registration;
    // Use custom template if available, otherwise use default
    const template = customTemplates[templateType];
    const message = personalizeMessage(templateType, registration, event, template, baseUrl);
    setCustomMessage(message);
  };

  const handleTemplateChange = (templateType: MessageTemplateType) => {
    setSelectedTemplate(templateType);
    updateMessageFromTemplate(templateType);
  };

  const handleSendMessages = async () => {
    if (!customMessage.trim()) {
      toast.error('กรุณาระบุข้อความ');
      return;
    }

    if (selectedRegistrations.length === 0) {
      toast.error('กรุณาเลือกผู้รับอย่างน้อย 1 คน');
      return;
    }

    setIsSending(true);

    try {
      // Send personalized messages to each recipient
      const results = await Promise.allSettled(
        selectedRegistrations.map(async ({ registration, lineUserId }) => {
          // Personalize message for this recipient using the template
          // CRITICAL FIX: Use custom template (if available) for EACH recipient
          const personalizedMsg = selectedTemplate
            ? personalizeMessage(selectedTemplate, registration, event, customTemplates[selectedTemplate], baseUrl)
            : customMessage; // For custom messages without template, send as-is

          // Send via LINE API
          const response = await fetch('/api/line/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lineUserIds: [lineUserId],
              message: personalizedMsg,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to send to ${registration.contactName}`);
          }

          return { success: true, name: registration.contactName };
        })
      );

      // Count successes and failures
      const successes = results.filter((r) => r.status === 'fulfilled').length;
      const failures = results.filter((r) => r.status === 'rejected').length;

      if (failures === 0) {
        toast.success(`ส่งข้อความสำเร็จ ${successes} ราย`);
        onClose();
      } else {
        toast.error(`ส่งสำเร็จ ${successes} ราย, ล้มเหลว ${failures} ราย`);
      }
    } catch (error) {
      console.error('Error sending messages:', error);
      toast.error('เกิดข้อผิดพลาดในการส่งข้อความ');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  const currentRecipient = selectedRegistrations[previewRecipient];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">ส่งข้อความแจ้งชำระเงิน</h2>
            <p className="text-sm text-gray-600 mt-1">
              ผู้รับ: {selectedRegistrations.length} ราย
            </p>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              เลือก Template ข้อความ:
            </label>
            <div className="grid grid-cols-2 gap-3">
              {Object.values(DEFAULT_TEMPLATES).map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateChange(template.id)}
                  className={`p-4 border-2 rounded-lg text-left transition-all ${
                    selectedTemplate === template.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="font-medium text-gray-900 mb-1">{template.name}</div>
                  <div className="text-xs text-gray-600">{template.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Preview Recipient Selector */}
          {selectedRegistrations.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ดูตัวอย่างข้อความสำหรับ:
              </label>
              <select
                value={previewRecipient}
                onChange={(e) => setPreviewRecipient(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {selectedRegistrations.map((item, index) => (
                  <option key={index} value={index}>
                    {item.registration.contactName} - {item.registration.registrationId}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Message Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                ข้อความ: (สามารถแก้ไขได้)
              </label>
              <span className="text-xs text-gray-500">
                {customMessage.length} / 1,000 ตัวอักษร
              </span>
            </div>
            <textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value.slice(0, 1000))}
              rows={12}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
            />
            <p className="text-xs text-gray-500 mt-2">
              💡 ข้อความจะถูก personalize สำหรับผู้รับแต่ละคนโดยอัตโนมัติ
            </p>
          </div>

          {/* Preview Box */}
          {currentRecipient && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-600 mb-2">
                ตัวอย่างข้อความที่จะส่งถึง: {currentRecipient.registration.contactName}
              </div>
              <div className="bg-white border border-gray-300 rounded-lg p-3 text-sm whitespace-pre-wrap font-sans">
                {selectedTemplate
                  ? personalizeMessage(selectedTemplate, currentRecipient.registration, event, customTemplates[selectedTemplate] || undefined, baseUrl)
                  : customMessage}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-sm text-gray-600">
            จะส่งข้อความถึง <span className="font-bold text-gray-900">{selectedRegistrations.length}</span> ราย
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSendMessages}
              disabled={isSending || !customMessage.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>กำลังส่ง...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span>ส่งข้อความ</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
