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

    // Validate dates when updating policies
    if (updates.dateBasedPolicies) {
      const validation = validateCancellationPolicyDates(updates.dateBasedPolicies);
      if (!validation.valid) {
        setValidationErrors(validation.errors);
      } else {
        setValidationErrors([]);
      }
    }

    onChange(newPolicy);
  };

  // Toggle enabled state
  const handleToggleEnabled = (enabled: boolean) => {
    if (!enabled) {
      onChange(undefined); // Clear policy when disabled
      setValidationErrors([]);
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

  // Add new empty rule
  const handleAddRule = () => {
    const newRule: DateBasedCancellationRule = {
      ruleId: `RULE_${Date.now()}`,
      ruleName: '',
      cancelBeforeDate: '',
      refundType: 'percentage',
      refundValue: 0,
      description: '',
      active: true,
      createdAt: new Date().toISOString()
    };

    updatePolicy({
      dateBasedPolicies: [...policy.dateBasedPolicies, newRule]
    });
  };

  // Update rule
  const handleUpdateRule = (ruleId: string, updates: Partial<DateBasedCancellationRule>) => {
    const updatedRules = policy.dateBasedPolicies.map(r =>
      r.ruleId === ruleId ? { ...r, ...updates } : r
    );
    updatePolicy({ dateBasedPolicies: updatedRules });
  };

  // Delete rule
  const handleDeleteRule = (ruleId: string) => {
    const updatedRules = policy.dateBasedPolicies.filter(r => r.ruleId !== ruleId);
    updatePolicy({ dateBasedPolicies: updatedRules });
  };

  // Toggle rule active status
  const handleToggleRuleActive = (ruleId: string, active: boolean) => {
    handleUpdateRule(ruleId, { active });
  };

  // Sort rules by date (earliest first)
  const sortedRules = [...policy.dateBasedPolicies].sort(
    (a, b) => {
      if (!a.cancelBeforeDate) return 1;
      if (!b.cancelBeforeDate) return -1;
      return new Date(a.cancelBeforeDate).getTime() - new Date(b.cancelBeforeDate).getTime();
    }
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

            {/* Rules list (inline editable) */}
            {sortedRules.length > 0 ? (
              <div className="space-y-3">
                {sortedRules.map((rule) => (
                  <RuleInlineForm
                    key={rule.ruleId}
                    rule={rule}
                    onUpdate={(updates) => handleUpdateRule(rule.ruleId, updates)}
                    onDelete={() => {
                      if (confirm(`ต้องการลบเงื่อนไข "${rule.ruleName || 'ไม่มีชื่อ'}" ใช่หรือไม่?`)) {
                        handleDeleteRule(rule.ruleId);
                      }
                    }}
                    onToggleActive={handleToggleRuleActive}
                    existingDates={policy.dateBasedPolicies
                      .filter(r => r.ruleId !== rule.ruleId)
                      .map(r => r.cancelBeforeDate)
                      .filter(d => d)} // Filter out empty dates
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
    </div>
  );
}

// Inline Rule Form Component
interface RuleInlineFormProps {
  rule: DateBasedCancellationRule;
  onUpdate: (updates: Partial<DateBasedCancellationRule>) => void;
  onDelete: () => void;
  onToggleActive: (ruleId: string, active: boolean) => void;
  existingDates: string[];
}

function RuleInlineForm({ rule, onUpdate, onDelete, onToggleActive, existingDates }: RuleInlineFormProps) {
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof DateBasedCancellationRule, value: any) => {
    // Clear local error for this field
    if (localErrors[field]) {
      setLocalErrors({ ...localErrors, [field]: '' });
    }

    // Validate on change
    if (field === 'cancelBeforeDate' && value && existingDates.includes(value)) {
      setLocalErrors({ ...localErrors, [field]: 'วันที่นี้ถูกใช้งานแล้ว' });
      return; // Don't update if duplicate
    }

    if (field === 'refundValue') {
      const numValue = parseFloat(value) || 0;
      if (rule.refundType === 'percentage' && numValue > 100) {
        setLocalErrors({ ...localErrors, [field]: 'เปอร์เซ็นต์ต้องไม่เกิน 100' });
        return;
      }
      if (numValue < 0) {
        setLocalErrors({ ...localErrors, [field]: 'ต้องเป็นจำนวนบวก' });
        return;
      }
    }

    onUpdate({ [field]: value });
  };

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
    <div className={`p-4 border rounded-lg ${rule.active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="space-y-3">
        {/* Header with toggle and delete */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={rule.active}
              onChange={(e) => onToggleActive(rule.ruleId, e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-xs font-semibold text-gray-600">
              {rule.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
            </span>
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700 text-sm font-medium"
          >
            ลบ
          </button>
        </div>

        {/* Rule Name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            ชื่อเงื่อนไข <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={rule.ruleName || ''}
            onChange={(e) => handleChange('ruleName', e.target.value)}
            placeholder="เช่น: ยกเลิกก่อน 30 วัน"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Cancel Before Date */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            ยกเลิกก่อนวันที่ <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={rule.cancelBeforeDate || ''}
            onChange={(e) => handleChange('cancelBeforeDate', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
              localErrors.cancelBeforeDate ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {localErrors.cancelBeforeDate && (
            <p className="mt-1 text-xs text-red-600">{localErrors.cancelBeforeDate}</p>
          )}
        </div>

        {/* Refund Type and Value (on same row) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              ประเภทการคืนเงิน <span className="text-red-500">*</span>
            </label>
            <select
              value={rule.refundType}
              onChange={(e) => handleChange('refundType', e.target.value as 'percentage' | 'fixed' | 'none')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="percentage">เปอร์เซ็นต์ (%)</option>
              <option value="fixed">จำนวนเงิน (บาท)</option>
              <option value="none">ไม่คืนเงิน</option>
            </select>
          </div>

          {rule.refundType !== 'none' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {rule.refundType === 'percentage' ? 'เปอร์เซ็นต์' : 'จำนวนเงิน'} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={rule.refundValue || ''}
                  onChange={(e) => handleChange('refundValue', parseFloat(e.target.value) || 0)}
                  min="0"
                  max={rule.refundType === 'percentage' ? '100' : undefined}
                  step={rule.refundType === 'percentage' ? '1' : '100'}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 ${
                    localErrors.refundValue ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <span className="absolute right-3 top-2 text-xs text-gray-500">
                  {rule.refundType === 'percentage' ? '%' : '฿'}
                </span>
              </div>
              {localErrors.refundValue && (
                <p className="mt-1 text-xs text-red-600">{localErrors.refundValue}</p>
              )}
            </div>
          )}
        </div>

        {/* Description (optional) */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            คำอธิบายเพิ่มเติม (ถ้ามี)
          </label>
          <textarea
            value={rule.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={2}
            placeholder="เช่น: สำหรับผู้ที่ยกเลิกล่วงหน้า 30 วัน"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Summary (if valid) */}
        {rule.ruleName && rule.cancelBeforeDate && (
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              <span className="font-semibold">{rule.ruleName}:</span> {getRefundText()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
