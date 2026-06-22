import { useState } from 'react';
import { broadcastNotification } from '../../api/client';
import { Send, Bell, CheckSquare, Square, AlertCircle, CheckCircle, Bold, Italic, List } from 'lucide-react';

const rolesList = [
  { key: 'KTV', label: 'Kỹ thuật viên (KTV)', group: 'tech' },
  { key: 'ADMIN', label: 'Quản trị viên (Admin)', group: 'office' },
  { key: 'DEV', label: 'Lập trình viên (Dev)', group: 'office' },
  { key: 'SALE_SUPERVISOR', label: 'Quản lý kinh doanh (Sale Supervisor)', group: 'office' },
  { key: 'SALER', label: 'Nhân viên kinh doanh (Saler)', group: 'office' },
  { key: 'HOTLINE', label: 'Hotline / CSKH', group: 'office' },
  { key: 'COORDINATOR', label: 'Điều phối viên (Coordinator)', group: 'office' },
  { key: 'STAFF', label: 'Nhân viên văn phòng (Staff)', group: 'office' },
];

export default function BroadcastNotification() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const insertFormatting = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('notification-content-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    
    let replacement = '';
    if (prefix === '- ' && suffix === '') {
      replacement = selected
        .split('\n')
        .map(line => line.startsWith('- ') ? line : `- ${line}`)
        .join('\n');
      if (replacement === '') {
        replacement = '- ';
      }
    } else {
      replacement = prefix + selected + suffix;
    }

    const before = text.substring(0, start);
    const after = text.substring(end);

    setContent(before + replacement + after);
    
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + selected.length + suffix.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleCheckboxChange = (roleKey: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleKey)
        ? prev.filter(r => r !== roleKey)
        : [...prev, roleKey]
    );
  };

  const handleSelectAll = () => {
    setSelectedRoles(rolesList.map(r => r.key));
  };

  const handleDeselectAll = () => {
    setSelectedRoles([]);
  };

  const handleSelectOfficeOnly = () => {
    setSelectedRoles(rolesList.filter(r => r.group === 'office').map(r => r.key));
  };

  const handleSelectTechOnly = () => {
    setSelectedRoles(rolesList.filter(r => r.group === 'tech').map(r => r.key));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!title.trim() || !content.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo.');
      return;
    }

    if (selectedRoles.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất một vai trò nhận thông báo.');
      return;
    }

    setLoading(true);
    try {
      const response = await broadcastNotification({
        title: title.trim(),
        content: content.trim(),
        targetRoles: selectedRoles,
      });

      setSuccessMessage(response.message || 'Đã phát thông báo hệ thống thành công!');
      // Reset form
      setTitle('');
      setContent('');
      setSelectedRoles([]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Có lỗi xảy ra khi phát thông báo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 text-left animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h2 className="font-bold text-2xl text-[#1B3A6B] flex items-center gap-2">
          <Bell size={26} className="text-[#1B3A6B]" /> Phát thông báo hệ thống
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Gửi thông báo diện rộng qua ứng dụng (DB) và thông báo đẩy (Push Notification/Web Push) đến các nhóm tài khoản.
        </p>
      </div>

      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl flex items-start gap-3">
          <CheckCircle className="shrink-0 text-green-500 mt-0.5" size={18} />
          <div>
            <span className="font-semibold block text-sm">Gửi thành công!</span>
            <span className="text-xs">{successMessage}</span>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3">
          <AlertCircle className="shrink-0 text-red-500 mt-0.5" size={18} />
          <div>
            <span className="font-semibold block text-sm">Lỗi dữ liệu</span>
            <span className="text-xs">{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Form Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Tiêu đề */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Tiêu đề thông báo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề thông báo (ví dụ: Cập nhật hệ thống...)"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/20 focus:border-[#1B3A6B] transition-all text-sm"
              disabled={loading}
            />
          </div>

          {/* Nội dung */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-sm font-semibold text-gray-700">
                Nội dung thông báo <span className="text-red-500">*</span>
              </label>
              
              {/* Toolbar định dạng */}
              <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-200">
                <button
                  type="button"
                  onClick={() => insertFormatting('**', '**')}
                  className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-900"
                  title="Chữ đậm (**in đậm**)"
                  disabled={loading}
                >
                  <Bold size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('*', '*')}
                  className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-900"
                  title="Chữ nghiêng (*in nghiêng*)"
                  disabled={loading}
                >
                  <Italic size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormatting('- ')}
                  className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-600 hover:text-gray-900"
                  title="Danh sách gạch đầu dòng (- dòng)"
                  disabled={loading}
                >
                  <List size={14} />
                </button>
              </div>
            </div>
            <textarea
              id="notification-content-textarea"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Nhập nội dung thông báo... (Hỗ trợ định dạng: **chữ đậm**, *chữ nghiêng*, - danh sách)"
              rows={6}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/20 focus:border-[#1B3A6B] transition-all text-sm leading-relaxed"
              disabled={loading}
            />
          </div>

          {/* Nhóm đối tượng nhận */}
          <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
              <label className="block text-sm font-semibold text-gray-700">
                Đối tượng nhận <span className="text-red-500">*</span>
              </label>
              
              {/* Nút thao tác nhanh */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="px-2 py-1 text-[11px] font-semibold bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                  disabled={loading}
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={handleSelectOfficeOnly}
                  className="px-2 py-1 text-[11px] font-semibold bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                  disabled={loading}
                >
                  Khối Văn phòng
                </button>
                <button
                  type="button"
                  onClick={handleSelectTechOnly}
                  className="px-2 py-1 text-[11px] font-semibold bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                  disabled={loading}
                >
                  Khối Kỹ thuật (KTV)
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2 py-1 text-[11px] font-semibold bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                  disabled={loading}
                >
                  Bỏ chọn hết
                </button>
              </div>
            </div>

            {/* Grid Checkbox các Roles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50/50 rounded-xl border border-gray-100">
              {rolesList.map(role => {
                const isChecked = selectedRoles.includes(role.key);
                return (
                  <div
                    key={role.key}
                    onClick={() => !loading && handleCheckboxChange(role.key)}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer select-none ${
                      isChecked
                        ? 'bg-blue-50/30 border-blue-200 text-blue-900 font-semibold'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="shrink-0 text-gray-400 group-hover:text-blue-500">
                      {isChecked ? (
                        <CheckSquare size={18} className="text-blue-600" />
                      ) : (
                        <Square size={18} />
                      )}
                    </span>
                    <span className="text-[13px]">{role.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Nút gửi */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-[#1B3A6B] hover:bg-[#152e55] transition-all text-white border-none cursor-pointer"
            >
              {loading ? (
                <>
                  <span className="spinner border-t-white" style={{ width: '16px', height: '16px' }}></span>
                  Đang phát thông báo...
                </>
              ) : (
                <>
                  <Send size={16} /> Phát thông báo ngay
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
