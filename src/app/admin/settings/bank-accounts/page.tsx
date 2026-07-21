'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { BankAccount } from '@/types/bank-account';
import Image from 'next/image';

export default function BankAccountsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [formData, setFormData] = useState({
    bankName: '',
    accountName: '',
    accountNumber: '',
    qrCodeUrl: '',
    isActive: true,
    isDefault: false,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchAccounts();
    }
  }, [session]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/bank-accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');

      const data = await response.json();
      setAccounts(data.accounts || []);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      showMessage('error', 'ไม่สามารถโหลดข้อมูลบัญชีธนาคารได้');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleOpenModal = (account?: BankAccount) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        bankName: account.bankName,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        qrCodeUrl: account.qrCodeUrl || '',
        isActive: account.isActive,
        isDefault: account.isDefault,
      });
    } else {
      setEditingAccount(null);
      setFormData({
        bankName: '',
        accountName: '',
        accountNumber: '',
        qrCodeUrl: '',
        isActive: true,
        isDefault: false,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingAccount(null);
    setFormData({
      bankName: '',
      accountName: '',
      accountNumber: '',
      qrCodeUrl: '',
      isActive: true,
      isDefault: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.bankName || !formData.accountName || !formData.accountNumber) {
      showMessage('error', 'กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      const url = '/api/admin/bank-accounts';
      const method = editingAccount ? 'PUT' : 'POST';
      const body = editingAccount
        ? { id: editingAccount.id, ...formData }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save account');
      }

      showMessage('success', editingAccount ? 'บันทึกข้อมูลเรียบร้อย' : 'เพิ่มบัญชีใหม่เรียบร้อย');
      handleCloseModal();
      fetchAccounts();
    } catch (error) {
      console.error('Error saving account:', error);
      showMessage('error', error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลได้');
    }
  };

  const handleDelete = async (account: BankAccount) => {
    if (!confirm(`ต้องการลบบัญชี ${account.bankName} - ${account.accountNumber} หรือไม่?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/bank-accounts?id=${account.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete account');
      }

      showMessage('success', 'ลบบัญชีเรียบร้อย');
      fetchAccounts();
    } catch (error) {
      console.error('Error deleting account:', error);
      showMessage('error', error instanceof Error ? error.message : 'ไม่สามารถลบบัญชีได้');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">บัญชีธนาคาร</h2>
            <p className="text-sm text-gray-600 mt-1">
              จัดการบัญชีธนาคารสำหรับรับชำระเงิน
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + เพิ่มบัญชีใหม่
          </button>
        </div>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div className="px-6 py-4">
          <div
            className={`p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}
          >
            {message.text}
          </div>
        </div>
      )}

      {/* Accounts List */}
      <div className="p-6">
        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🏦</div>
            <p className="text-gray-600">ยังไม่มีบัญชีธนาคาร</p>
            <button
              onClick={() => handleOpenModal()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              เพิ่มบัญชีแรก
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className={`border rounded-lg p-4 ${
                  account.isDefault ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{account.bankName}</h3>
                      {account.isDefault && (
                        <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                          ค่าเริ่มต้น
                        </span>
                      )}
                      {!account.isActive && (
                        <span className="px-2 py-0.5 bg-gray-400 text-white text-xs rounded-full">
                          ปิดใช้งาน
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{account.accountName}</p>
                    <p className="text-sm text-gray-600 font-mono">{account.accountNumber}</p>
                  </div>
                  {account.qrCodeUrl && (
                    <div className="ml-4">
                      <Image
                        src={account.qrCodeUrl}
                        alt="QR Code"
                        width={60}
                        height={60}
                        className="rounded border border-gray-200"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => handleOpenModal(account)}
                    className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm transition-colors"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => handleDelete(account)}
                    disabled={account.isDefault}
                    className="flex-1 px-3 py-2 bg-red-50 text-red-600 rounded hover:bg-red-100 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSubmit}>
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900">
                    {editingAccount ? 'แก้ไขบัญชีธนาคาร' : 'เพิ่มบัญชีใหม่'}
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อธนาคาร <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="เช่น ธนาคารกสิกรไทย"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ชื่อบัญชี <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.accountName}
                    onChange={(e) => setFormData({ ...formData, accountName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ชื่อบัญชีผู้รับเงิน"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    เลขที่บัญชี <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="xxx-x-xxxxx-x"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    QR Code URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={formData.qrCodeUrl}
                    onChange={(e) => setFormData({ ...formData, qrCodeUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    URL ของ QR Code Promptpay (อัพโหลดไปยัง Firebase Storage แล้ววาง URL)
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">เปิดใช้งาน</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">ตั้งเป็นค่าเริ่มต้น</span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingAccount ? 'บันทึก' : 'เพิ่มบัญชี'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
