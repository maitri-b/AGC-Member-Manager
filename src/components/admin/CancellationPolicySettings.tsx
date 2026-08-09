'use client';

import { useState } from 'react';
import { CancellationPolicy, DateBasedCancellationRule, validateCancellationPolicyDates } from '@/types/event';

interface CancellationPolicySettingsProps {
  value: CancellationPolicy | undefined;
  onChange: (policy: CancellationPolicy | undefined) => void;
  eventDate?: string; // Event date for reference/validation
}

export default function CancellationPolicySettings({
  value,
  onChange,
  eventDate
}: CancellationPolicySettingsProps) {
  const [editingRule, setEditingRule] = useState<DateBasedCancellationRule | null>(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Initialize default policy if not provided
  const policy: CancellationPolicy = value || {
    enabled: false,
    noRefundPolicy: {
      active: false,
      description: ''
    },
    dateBasedPolicies: [],
    sendLineNotification: true
  };

  // Update policy and notify parent
  const updatePolicy = (updates: Partial<CancellationPolicy>) => {
    const newPolicy = { ...policy, ...updates };
    onChange(newPolicy);
  };

  // Toggle enabled state
  const handleToggleEnabled = (enabled: boolean) => {
    if (!enabled) {
      onChange(undefined); // Clear policy when disabled
    } else {
      onChange({
        enabled: true,
        noRefundPolicy: { active: false, description: '' },
        dateBasedPolicies: [],
        sendLineNotification: true
      });
    }
  };

  // Toggle no refund policy
  const handleToggleNoRefund = (active: boolean) => {
    updatePolicy({
      noRefundPolicy: {
        ...policy.noRefundPolicy,
        active
      }
    });
  };

  // Update no refund description
  const handleNoRefundDescriptionChange = (description: string) => {
    updatePolicy({
      noRefundPolicy: {
        active: policy.noRefundPolicy?.active || false,
        description
      }
    });
  };

  // Add or update date-based rule
  const handleSaveRule = (rule: DateBasedCancellationRule) => {
    let updatedRules: DateBasedCancellationRule[];

    if (editingRule) {
      // Update existing rule
      updatedRules = policy.dateBasedPolicies.map(r =>
        r.ruleId === rule.ruleId ? rule : r
      );
    } else {
      // Add new rule
      updatedRules = [...policy.dateBasedPolicies, rule];
    }

    // Validate dates
    const validation = validateCancellationPolicyDates(updatedRules);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    setValidationErrors([]);
    updatePolicy({ dateBasedPolicies: updatedRules });
    setShowRuleForm(false);
    setEditingRule(null);
  };

  // Delete rule
  const handleDeleteRule = (ruleId: string) => {
    const updatedRules = policy.dateBasedPolicies.filter(r => r.ruleId !== ruleId);
    updatePolicy({ dateBasedPolicies: updatedRules });
  };

  // Toggle rule active status
  const handleToggleRuleActive = (ruleId: string, active: boolean) => {
    const updatedRules = policy.dateBasedPolicies.map(r =>
      r.ruleId === ruleId ? { ...r, active } : r
    );
    updatePolicy({ dateBasedPolicies: updatedRules });
  };

  // Open form for new rule
  const handleAddRule = () => {
    setEditingRule(null);
    setShowRuleForm(true);
    setValidationErrors([]);
  };

  // Open form for editing rule
  const handleEditRule = (rule: DateBasedCancellationRule) => {
    setEditingRule(rule);
    setShowRuleForm(true);
    setValidationErrors([]);
  };

  // Cancel rule form
  const handleCancelRuleForm = () => {
    setShowRuleForm(false);
    setEditingRule(null);
    setValidationErrors([]);
  };

  // Sort rules by date (earliest first)
  const sortedRules = [...policy.dateBasedPolicies].sort(
    (a, b) => new Date(a.cancelBeforeDate).getTime() - new Date(b.cancelBeforeDate).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Enable Cancellation System */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="cancellation-enabled"
          checked={policy.enabled}
          onChange={(e) => handleToggleEnabled(e.target.checked)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
        />
        <label htmlFor="cancellation-enabled" className="font-semibold text-gray-900">
          เปิดใช้งานระบบยกเลิกการจอง
        </label>
      </div>

      {/* Policy Settings (only shown when enabled) */}
      {policy.enabled && (
        <div className="space-y-6 pl-7 border-l-2 border-gray-200">
          {/* No Refund Policy */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="no-refund"
                checked={policy.noRefundPolicy?.active || false}
                onChange={(e) => handleToggleNoRefund(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="no-refund" className="font-medium text-gray-900">
                ไม่คืนเงินในทุกกรณี
              </label>
            </div>

            {policy.noRefundPolicy?.active && (
              <div className="pl-7">
                <label className="block text-sm text-gray-700 mb-1">
                  คำอธิบายเพิ่มเติม (ถ้ามี)
                </label>
                <textarea
                  value={policy.noRefundPolicy.description || ''}
                  onChange={(e) => handleNoRefundDescriptionChange(e.target.value)}
                  placeholder="เช่น: เนื่องจากกิจกรรมมีการจองล่วงหน้าและชำระค่าใช้จ่ายกับทางโรงแรมแล้ว"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* Date-Based Policies */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">เงื่อนไขตามวันที่</h4>
              <button
                type="button"
                onClick={handleAddRule}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                + เพิ่มเงื่อนไข
              </button>
            </div>

            {/* Helper text */}
            <p className="text-xs text-gray-500">
              💡 "ยกเลิกก่อนวันที่ X" หมายถึงต้องยกเลิกภายใน 23:59 น. ของวันก่อนหน้า
            </p>

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-semibold text-red-800 mb-1">ข้อผิดพลาด:</p>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Rules list */}
            {sortedRules.length > 0 ? (
              <div className="space-y-2">
                {sortedRules.map((rule) => (
                  <RuleItem
                    key={rule.ruleId}
                    rule={rule}
                    onEdit={handleEditRule}
                    onDelete={handleDeleteRule}
                    onToggleActive={handleToggleRuleActive}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                ยังไม่มีเงื่อนไข คลิก "+ เพิ่มเงื่อนไข" เพื่อสร้าง
              </div>
            )}
          </div>

          {/* LINE Notification */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="line-notification"
              checked={policy.sendLineNotification}
              onChange={(e) => updatePolicy({ sendLineNotification: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="line-notification" className="text-sm text-gray-700">
              ส่ง LINE แจ้งเตือนเมื่อมีการยกเลิกและคืนเงิน
            </label>
          </div>
        </div>
      )}

      {/* Rule Form Modal */}
      {showRuleForm && (
        <RuleFormModal
          rule={editingRule}
          existingDates={policy.dateBasedPolicies
            .filter(r => !editingRule || r.ruleId !== editingRule.ruleId)
            .map(r => r.cancelBeforeDate)}
          eventDate={eventDate}
          onSave={handleSaveRule}
          onCancel={handleCancelRuleForm}
        />
      )}
    </div>
  );
}

// Rule Item Component
interface RuleItemProps {
  rule: DateBasedCancellationRule;
  onEdit: (rule: DateBasedCancellationRule) => void;
  onDelete: (ruleId: string) => void;
  onToggleActive: (ruleId: string, active: boolean) => void;
}

function RuleItem({ rule, onEdit, onDelete, onToggleActive }: RuleItemProps) {
  const getRefundText = () => {
    if (rule.refundType === 'percentage') {
      return `คืน ${rule.refundValue}%`;
    } else if (rule.refundType === 'fixed') {
      return `คืน ${rule.refundValue.toLocaleString()} บาท`;
    } else {
      return 'ไม่คืนเงิน';
    }
  };

  return (
    <div className={`p-3 border rounded-lg ${rule.active ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <input
            type="checkbox"
            checked={rule.active}
            onChange={(e) => onToggleActive(rule.ruleId, e.target.checked)}
            className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <div className="flex-1">
            <h5 className={`font-medium ${rule.active ? 'text-gray-900' : 'text-gray-500'}`}>
              {rule.ruleName}
            </h5>
            <div className="flex items-center gap-2 mt-1 text-sm">
              <span className={rule.active ? 'text-gray-600' : 'text-gray-400'}>
                ยกเลิกก่อน: {new Date(rule.cancelBeforeDate).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
              <span className="text-gray-300">•</span>
              <span className={`font-medium ${rule.active ? 'text-blue-600' : 'text-gray-400'}`}>
                {getRefundText()}
              </span>
            </div>
            {rule.description && (
              <p className={`mt-1 text-xs ${rule.active ? 'text-gray-500' : 'text-gray-400'}`}>
                {rule.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(rule)}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            แก้ไข
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`ต้องการลบเงื่อนไข "${rule.ruleName}" ใช่หรือไม่?`)) {
                onDelete(rule.ruleId);
              }
            }}
            className="text-red-600 hover:text-red-700 text-sm font-medium"
          >
            ลบ
          </button>
        </div>
      </div>
    </div>
  );
}

// Rule Form Modal Component
interface RuleFormModalProps {
  rule: DateBasedCancellationRule | null;
  existingDates: string[];
  eventDate?: string;
  onSave: (rule: DateBasedCancellationRule) => void;
  onCancel: () => void;
}

function RuleFormModal({ rule, existingDates, eventDate, onSave, onCancel }: RuleFormModalProps) {
  const [formData, setFormData] = useState<Partial<DateBasedCancellationRule>>(
    rule || {
      ruleId: `RULE_${Date.now()}`,
      ruleName: '',
      cancelBeforeDate: '',
      refundType: 'percentage',
      refundValue: 0,
      description: '',
      active: true,
      createdAt: new Date().toISOString()
    }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof DateBasedCancellationRule, value: any) => {
    setFormData({ ...formData, [field]: value });
    // Clear error for this field
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.ruleName?.trim()) {
      newErrors.ruleName = 'กรุณาระบุชื่อเงื่อนไข';
    }

    if (!formData.cancelBeforeDate) {
      newErrors.cancelBeforeDate = 'กรุณาเลือกวันที่';
    } else if (existingDates.includes(formData.cancelBeforeDate)) {
      newErrors.cancelBeforeDate = 'วันที่นี้ถูกใช้งานแล้ว';
    }

    if (formData.refundType !== 'none' && (!formData.refundValue || formData.refundValue <= 0)) {
      newErrors.refundValue = 'กรุณาระบุจำนวนเงินหรือเปอร์เซ็นต์';
    }

    if (formData.refundType === 'percentage' && formData.refundValue! > 100) {
      newErrors.refundValue = 'เปอร์เซ็นต์ต้องไม่เกิน 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSave(formData as DateBasedCancellationRule);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {rule ? 'แก้ไขเงื่อนไข' : 'เพิ่มเงื่อนไขใหม่'}
          </h3>

          {/* Rule Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ชื่อเงื่อนไข <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.ruleName || ''}
              onChange={(e) => handleChange('ruleName', e.target.value)}
              placeholder="เช่น: ยกเลิกก่อน 30 วัน"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
                errors.ruleName ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.ruleName && <p className="mt-1 text-xs text-red-600">{errors.ruleName}</p>}
          </div>

          {/* Cancel Before Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ยกเลิกก่อนวันที่ <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.cancelBeforeDate || ''}
              onChange={(e) => handleChange('cancelBeforeDate', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
                errors.cancelBeforeDate ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.cancelBeforeDate && <p className="mt-1 text-xs text-red-600">{errors.cancelBeforeDate}</p>}
            <p className="mt-1 text-xs text-gray-500">
              ต้องยกเลิกภายใน 23:59 น. ของวันก่อนหน้า
            </p>
          </div>

          {/* Refund Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภทการคืนเงิน <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refundType"
                  value="percentage"
                  checked={formData.refundType === 'percentage'}
                  onChange={() => handleChange('refundType', 'percentage')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">คืนเป็นเปอร์เซ็นต์ (%)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refundType"
                  value="fixed"
                  checked={formData.refundType === 'fixed'}
                  onChange={() => handleChange('refundType', 'fixed')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">คืนจำนวนเงินคงที่ (บาท)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refundType"
                  value="none"
                  checked={formData.refundType === 'none'}
                  onChange={() => handleChange('refundType', 'none')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">เก็บเงินเต็มจำนวน (ไม่คืน)</span>
              </label>
            </div>
          </div>

          {/* Refund Value */}
          {formData.refundType !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.refundType === 'percentage' ? 'เปอร์เซ็นต์ที่คืน' : 'จำนวนเงินที่คืน'}{' '}
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={formData.refundValue || ''}
                  onChange={(e) => handleChange('refundValue', parseFloat(e.target.value) || 0)}
                  min="0"
                  max={formData.refundType === 'percentage' ? '100' : undefined}
                  step={formData.refundType === 'percentage' ? '1' : '100'}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
                    errors.refundValue ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <span className="absolute right-3 top-2 text-sm text-gray-500">
                  {formData.refundType === 'percentage' ? '%' : 'บาท'}
                </span>
              </div>
              {errors.refundValue && <p className="mt-1 text-xs text-red-600">{errors.refundValue}</p>}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              คำอธิบายเพิ่มเติม (ถ้ามี)
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
              placeholder="เช่น: สำหรับการยกเลิกล่วงหน้า"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="rule-active"
              checked={formData.active || false}
              onChange={(e) => handleChange('active', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="rule-active" className="text-sm text-gray-700">
              เปิดใช้งานเงื่อนไขนี้
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {rule ? 'บันทึก' : 'เพิ่มเงื่อนไข'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
