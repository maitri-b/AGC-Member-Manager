'use client';

import { useState, useEffect, useRef } from 'react';
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

interface SavedTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

interface MessageHistory {
  id: string;
  eventId: string;
  subject: string;
  sentAt: string;
  sentBy: string;
  sentByName: string;
  recipients: Array<{
    lineUserId: string;
    contactName: string;
    companyName: string;
    registrationId: string;
  }>;
  message: string;
}

export default function MessageTemplateModal({
  isOpen,
  onClose,
  selectedRegistrations,
  event,
}: MessageTemplateModalProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'custom' | 'history'>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplateType | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [editableTemplate, setEditableTemplate] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [previewRecipient, setPreviewRecipient] = useState(0);
  const [baseUrl, setBaseUrl] = useState('https://agc-member-manager.vercel.app');
  const [customTemplates, setCustomTemplates] = useState<Record<string, string>>({});

  // Custom message tab states
  const [customSubject, setCustomSubject] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // History tab states
  const [messageHistory, setMessageHistory] = useState<MessageHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Textarea ref for cursor position
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch base URL and custom templates from settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/settings');
        if (response.ok) {
          const settings = await response.json();
          setBaseUrl(settings.baseUrl || 'https://agc-member-manager.vercel.app');
          setCustomTemplates(settings.messageTemplates || {});
          setSavedTemplates(settings.savedMessageTemplates || []);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
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
  }, [selectedTemplate, previewRecipient, baseUrl, customTemplates]);

  // Update preview when user edits the template or changes preview recipient
  useEffect(() => {
    if (selectedTemplate && selectedRegistrations.length > 0 && editableTemplate) {
      const registration = selectedRegistrations[previewRecipient].registration;
      const preview = personalizeMessage(selectedTemplate, registration, event, editableTemplate, baseUrl);
      setCustomMessage(preview);
    }
  }, [editableTemplate, previewRecipient, selectedRegistrations, selectedTemplate, event, baseUrl]);

  // Update custom message preview
  useEffect(() => {
    if (activeTab === 'custom' && selectedRegistrations.length > 0 && customContent) {
      const registration = selectedRegistrations[previewRecipient].registration;
      const preview = personalizeCustomMessage(customContent, registration);
      // Preview is shown in the preview box
    }
  }, [customContent, previewRecipient, selectedRegistrations, activeTab]);

  // Load history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history' && isOpen) {
      fetchMessageHistory();
    }
  }, [activeTab, isOpen, event.eventId]);

  const fetchMessageHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/line/message-history?eventId=${event.eventId}`);
      if (response.ok) {
        const data = await response.json();
        setMessageHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to fetch message history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const personalizeCustomMessage = (template: string, registration: EventRegistration): string => {
    let message = template;

    // Replace placeholders
    message = message.replace(/\{\{memberName\}\}/g, registration.contactName || 'สมาชิก');
    message = message.replace(/\{\{companyName\}\}/g, registration.companyName || '');
    message = message.replace(/\{\{eventName\}\}/g, event.eventName || '');
    message = message.replace(/\{\{registrationId\}\}/g, registration.registrationId || '');
    message = message.replace(/\{\{attendeeCount\}\}/g, String(registration.attendeeCount || 1));

    return message;
  };

  const updateMessageFromTemplate = (templateType: MessageTemplateType) => {
    if (selectedRegistrations.length === 0) return;

    const registration = selectedRegistrations[previewRecipient].registration;
    const template = customTemplates[templateType];

    setEditableTemplate(template || '');
    const message = personalizeMessage(templateType, registration, event, template, baseUrl);
    setCustomMessage(message);
  };

  const handleTemplateChange = (templateType: MessageTemplateType) => {
    setSelectedTemplate(templateType);
    updateMessageFromTemplate(templateType);
  };

  // Insert personalize tag at cursor position
  const insertTag = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = customContent;

    // Insert tag at cursor position
    const newText = text.substring(0, start) + tag + text.substring(end);

    // Check max length
    if (newText.length > 1000) {
      toast.error('ข้อความยาวเกิน 1,000 ตัวอักษร');
      return;
    }

    setCustomContent(newText);

    // Set cursor position after the inserted tag
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName.trim() || !customContent.trim()) {
      toast.error('กรุณาระบุชื่อ template และข้อความ');
      return;
    }

    const newTemplate: SavedTemplate = {
      id: Date.now().toString(),
      name: newTemplateName,
      content: customContent,
      createdAt: new Date().toISOString(),
    };

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedMessageTemplates: [...savedTemplates, newTemplate],
        }),
      });

      if (response.ok) {
        setSavedTemplates([...savedTemplates, newTemplate]);
        setShowSaveDialog(false);
        setNewTemplateName('');
        toast.success('บันทึก template เรียบร้อย');
      } else {
        toast.error('ไม่สามารถบันทึก template ได้');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('เกิดข้อผิดพลาด');
    }
  };

  const handleLoadTemplate = (template: SavedTemplate) => {
    setCustomSubject(template.name);
    setCustomContent(template.content);
    toast.success(`โหลด template "${template.name}" เรียบร้อย`);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('ต้องการลบ template นี้หรือไม่?')) return;

    const updated = savedTemplates.filter(t => t.id !== templateId);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          savedMessageTemplates: updated,
        }),
      });

      if (response.ok) {
        setSavedTemplates(updated);
        toast.success('ลบ template เรียบร้อย');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('ไม่สามารถลบ template ได้');
    }
  };

  const handleSendMessages = async () => {
    let messageToSend = '';
    let subject = '';

    if (activeTab === 'templates') {
      if (!editableTemplate.trim() && !customMessage.trim()) {
        toast.error('กรุณาระบุข้อความ');
        return;
      }
      messageToSend = editableTemplate;
      subject = DEFAULT_TEMPLATES[selectedTemplate!]?.name || 'แจ้งชำระเงิน';
    } else if (activeTab === 'custom') {
      if (!customContent.trim()) {
        toast.error('กรุณาระบุข้อความ');
        return;
      }
      messageToSend = customContent;
      subject = customSubject || 'ข้อความกำหนดเอง';
    }

    if (selectedRegistrations.length === 0) {
      toast.error('กรุณาเลือกผู้รับอย่างน้อย 1 คน');
      return;
    }

    setIsSending(true);

    try {
      const results = await Promise.allSettled(
        selectedRegistrations.map(async ({ registration, lineUserId }) => {
          let personalizedMsg = '';

          if (activeTab === 'templates' && selectedTemplate && editableTemplate) {
            personalizedMsg = personalizeMessage(selectedTemplate, registration, event, editableTemplate, baseUrl);
          } else if (activeTab === 'custom') {
            personalizedMsg = personalizeCustomMessage(messageToSend, registration);
          }

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

      // Save to history
      await saveToHistory(subject, messageToSend);

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

  const saveToHistory = async (subject: string, message: string) => {
    try {
      await fetch('/api/line/message-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.eventId,
          subject,
          message,
          recipients: selectedRegistrations.map(({ registration, lineUserId }) => ({
            lineUserId,
            contactName: registration.contactName,
            companyName: registration.companyName,
            registrationId: registration.registrationId,
          })),
        }),
      });
    } catch (error) {
      console.error('Failed to save message history:', error);
    }
  };

  if (!isOpen) return null;

  const currentRecipient = selectedRegistrations[previewRecipient];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">ส่งข้อความ LINE</h2>
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

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'templates'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📋 Templates
            </button>
            <button
              onClick={() => setActiveTab('custom')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'custom'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              ✏️ ข้อความกำหนดเอง
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              📜 ประวัติการส่ง
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="space-y-6">
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
                    Template ข้อความ: (สามารถแก้ไขได้)
                  </label>
                  <span className="text-xs text-gray-500">
                    {editableTemplate.length} / 1,000 ตัวอักษร
                  </span>
                </div>
                <textarea
                  value={editableTemplate}
                  onChange={(e) => setEditableTemplate(e.target.value.slice(0, 1000))}
                  rows={12}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
                />
                <p className="text-xs text-gray-500 mt-2">
                  💡 ใช้ {'{{'} และ {'}}'}  เพื่อใส่ตัวแปร เช่น {'{{memberName}}'}, {'{{amountText}}'} - ระบบจะแทนค่าสำหรับแต่ละคนอัตโนมัติ
                </p>
              </div>

              {/* Preview Box */}
              {currentRecipient && customMessage && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-xs font-medium text-gray-600 mb-2">
                    ✨ ตัวอย่างข้อความที่จะส่งถึง: {currentRecipient.registration.contactName}
                  </div>
                  <div className="bg-white border border-gray-300 rounded-lg p-3 text-sm whitespace-pre-wrap font-sans">
                    {customMessage}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Custom Message Tab */}
          {activeTab === 'custom' && (
            <div className="space-y-6">
              {/* Saved Templates */}
              {savedTemplates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Templates ที่บันทึกไว้:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {savedTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="p-3 border border-gray-200 rounded-lg flex items-center justify-between hover:bg-gray-50"
                      >
                        <button
                          onClick={() => handleLoadTemplate(template)}
                          className="flex-1 text-left"
                        >
                          <div className="font-medium text-gray-900 text-sm">{template.name}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(template.createdAt).toLocaleDateString('th-TH')}
                          </div>
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="ml-2 text-red-600 hover:text-red-800"
                          title="ลบ template"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  หัวข้อข้อความ:
                </label>
                <input
                  type="text"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="เช่น: แจ้งเตือนการชำระเงิน"
                />
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

              {/* Message Content */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    ข้อความ:
                  </label>
                  <span className="text-xs text-gray-500">
                    {customContent.length} / 1,000 ตัวอักษร
                  </span>
                </div>

                {/* Personalize Tag Buttons */}
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="text-xs text-gray-600 font-medium mr-2 flex items-center">
                    แทรก Personalize:
                  </span>
                  <button
                    type="button"
                    onClick={() => insertTag('{{memberName}}')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-100 border border-blue-200 transition-colors"
                    title="แทรกชื่อสมาชิก"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    ชื่อสมาชิก
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('{{companyName}}')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-md hover:bg-green-100 border border-green-200 transition-colors"
                    title="แทรกชื่อบริษัท"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    ชื่อบริษัท
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('{{eventName}}')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded-md hover:bg-purple-100 border border-purple-200 transition-colors"
                    title="แทรกชื่อกิจกรรม"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    ชื่อกิจกรรม
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('{{registrationId}}')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-md hover:bg-amber-100 border border-amber-200 transition-colors"
                    title="แทรกรหัสการลงทะเบียน"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                    รหัสลงทะเบียน
                  </button>
                  <button
                    type="button"
                    onClick={() => insertTag('{{attendeeCount}}')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-pink-50 text-pink-700 text-xs font-medium rounded-md hover:bg-pink-100 border border-pink-200 transition-colors"
                    title="แทรกจำนวนผู้เข้าร่วม"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    จำนวนผู้เข้าร่วม
                  </button>
                </div>

                <textarea
                  ref={textareaRef}
                  value={customContent}
                  onChange={(e) => setCustomContent(e.target.value.slice(0, 1000))}
                  rows={12}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  placeholder="พิมพ์ข้อความที่ต้องการส่ง... หรือใช้ปุ่มด้านบนเพื่อแทรก personalize tags"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">
                    💡 กดปุ่มด้านบนเพื่อแทรก personalize tags - ระบบจะแทนค่าสำหรับแต่ละคนอัตโนมัติ
                  </p>
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    disabled={!customContent.trim()}
                    className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    บันทึกเป็น Template
                  </button>
                </div>
              </div>

              {/* Preview Box */}
              {currentRecipient && customContent && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="text-xs font-medium text-gray-600 mb-2">
                    ✨ ตัวอย่างข้อความที่จะส่งถึง: {currentRecipient.registration.contactName}
                  </div>
                  <div className="bg-white border border-gray-300 rounded-lg p-3 text-sm whitespace-pre-wrap font-sans">
                    {personalizeCustomMessage(customContent, currentRecipient.registration)}
                  </div>
                </div>
              )}

              {/* Save Template Dialog */}
              {showSaveDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">บันทึก Template</h3>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ชื่อ Template:
                    </label>
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                      placeholder="เช่น: แจ้งเตือนการชำระเงิน"
                      autoFocus
                    />
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => {
                          setShowSaveDialog(false);
                          setNewTemplateName('');
                        }}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={handleSaveTemplate}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        บันทึก
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {loadingHistory ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 mt-2">กำลังโหลดประวัติ...</p>
                </div>
              ) : messageHistory.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-gray-500">ยังไม่มีประวัติการส่งข้อความ</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messageHistory.map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                        className="w-full px-4 py-3 bg-white hover:bg-gray-50 flex items-center justify-between"
                      >
                        <div className="flex-1 text-left">
                          <div className="font-medium text-gray-900">{item.subject}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {new Date(item.sentAt).toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })} • ส่งถึง {item.recipients.length} ราย
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            expandedHistoryId === item.id ? 'transform rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {expandedHistoryId === item.id && (
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                          <div className="mb-3">
                            <div className="text-sm font-medium text-gray-700 mb-2">ข้อความที่ส่ง:</div>
                            <div className="bg-white border border-gray-300 rounded p-3 text-sm whitespace-pre-wrap">
                              {item.message}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              รายชื่อผู้รับ ({item.recipients.length} ราย):
                            </div>
                            <div className="bg-white border border-gray-300 rounded p-3 max-h-48 overflow-y-auto">
                              <div className="space-y-2">
                                {item.recipients.map((recipient, idx) => (
                                  <div key={idx} className="text-sm flex items-center justify-between py-1 border-b border-gray-100 last:border-0">
                                    <div>
                                      <span className="font-medium text-gray-900">{recipient.contactName}</span>
                                      <span className="text-gray-500 ml-2">({recipient.companyName})</span>
                                    </div>
                                    <span className="text-xs text-gray-500">{recipient.registrationId}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab !== 'history' && (
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
                disabled={isSending || (activeTab === 'templates' && !customMessage.trim()) || (activeTab === 'custom' && !customContent.trim())}
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
        )}
      </div>
    </div>
  );
}
