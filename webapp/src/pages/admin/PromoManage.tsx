import { useState, useEffect } from 'react';
import { fetchApi } from '../../api/client';
import { Plus, Edit2, Trash2, Lock, Unlock, Search, Calendar, Tag, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import CategoryTreeSelect from '../../components/CategoryTreeSelect';

interface Promo {
  id: string;
  code: string;
  promoMonths: number;
  description: string | null;
  isLocked: boolean;
  startDate: string | null;
  endDate: string | null;
  applicableModels: string[];
  createdAt: string;
}

export default function PromoManage() {
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const isAdminOrDev = user?.role === 'ADMIN' || user?.role === 'DEV';

  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal Form State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [code, setCode] = useState('');
  const [promoMonths, setPromoMonths] = useState<number>(6);
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [applicableModelsInput, setApplicableModelsInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [productsStock, setProductsStock] = useState<any[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);

  const loadPromos = async () => {
    try {
      setLoading(true);
      const data = await fetchApi('/promos');
      setPromos(data || []);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi tải danh sách khuyến mãi' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPromos();
    fetchApi('/inventory/stock')
      .then(data => {
        setProductsStock(data.products || []);
      })
      .catch(err => console.error('Lỗi tải sản phẩm:', err));
  }, []);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    setCode('');
    setPromoMonths(6);
    setDescription('');
    setStartDate('');
    setEndDate('');
    setApplicableModelsInput('');
    setSelectedModels([]);
    setIsLocked(false);
    setShowModal(true);
    setMessage(null);
  };

  const openEditModal = (promo: Promo) => {
    setModalMode('edit');
    setEditingId(promo.id);
    setCode(promo.code);
    setPromoMonths(promo.promoMonths);
    setDescription(promo.description || '');
    setStartDate(promo.startDate ? promo.startDate.substring(0, 10) : '');
    setEndDate(promo.endDate ? promo.endDate.substring(0, 10) : '');
    setApplicableModelsInput(promo.applicableModels.join(', '));
    setSelectedModels(promo.applicableModels.map(m => `PROD:${m}`));
    setIsLocked(promo.isLocked);
    setShowModal(true);
    setMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || promoMonths <= 0) {
      alert('Vui lòng nhập đầy đủ thông tin hợp lệ');
      return;
    }

    const applicableModels = selectedModels
      .filter(id => id.startsWith('PROD:'))
      .map(id => id.substring(5));

    const payload = {
      code: code.trim().toUpperCase(),
      promoMonths: Number(promoMonths),
      description: description.trim() || null,
      startDate: startDate || null,
      endDate: endDate || null,
      applicableModels,
      isLocked
    };

    try {
      if (modalMode === 'create') {
        const newPromo = await fetchApi('/promos', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setPromos(prev => [newPromo, ...prev]);
        setMessage({ type: 'success', text: `Tạo mã khuyến mãi "${payload.code}" thành công!` });
      } else {
        const updatedPromo = await fetchApi(`/promos/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setPromos(prev => prev.map(p => p.id === editingId ? updatedPromo : p));
        setMessage({ type: 'success', text: `Cập nhật mã khuyến mãi "${payload.code}" thành công!` });
      }
      setShowModal(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Lỗi khi lưu mã khuyến mãi');
    }
  };

  const handleToggleLock = async (id: string, codeStr: string) => {
    try {
      const updated = await fetchApi(`/promos/${id}/toggle-lock`, { method: 'PATCH' });
      setPromos(prev => prev.map(p => p.id === id ? updated : p));
      setMessage({
        type: 'success',
        text: `${updated.isLocked ? 'Đã khóa' : 'Đã mở khóa'} thành công mã "${codeStr}"`
      });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi cập nhật trạng thái khóa' });
    }
  };

  const handleDelete = async (id: string, codeStr: string) => {
    const isConfirmed = await confirm({
      title: 'Xóa mã khuyến mãi',
      message: `Bạn có chắc chắn muốn xóa mã khuyến mãi "${codeStr}" không? Hành động này không thể hoàn tác.`,
      confirmText: 'Xóa',
      cancelText: 'Hủy bỏ',
      type: 'danger'
    });

    if (!isConfirmed) return;

    try {
      await fetchApi(`/promos/${id}`, { method: 'DELETE' });
      setPromos(prev => prev.filter(p => p.id !== id));
      setMessage({ type: 'success', text: `Đã xóa mã khuyến mãi "${codeStr}"` });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi xóa mã khuyến mãi' });
    }
  };

  // Filter promos
  const filteredPromos = promos.filter(p => {
    const searchLower = searchQuery.toLowerCase();
    return (
      p.code.toLowerCase().includes(searchLower) ||
      (p.description && p.description.toLowerCase().includes(searchLower))
    );
  });

  const getPromoStatus = (promo: Promo) => {
    if (promo.isLocked) return { label: 'Đã khóa', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    const now = new Date();
    if (promo.startDate && now < new Date(promo.startDate)) {
      return { label: 'Chưa chạy', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    if (promo.endDate && now > new Date(promo.endDate)) {
      return { label: 'Hết hạn', color: 'bg-gray-100 text-gray-700 border-gray-200' };
    }
    return { label: 'Đang chạy', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  return (
    <div className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-[calc(100vh-80px)] font-sans">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Quản lý Khuyến mãi Bảo hành</h2>
          <p className="text-sm text-gray-500 mt-0.5">Tạo và quản lý các chương trình cộng thêm tháng bảo hành cho máy</p>
        </div>
        
        {isAdminOrDev && (
          <button
            onClick={openCreateModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 transition shadow-sm"
          >
            <Plus size={16} /> Tạo khuyến mãi
          </button>
        )}
      </div>

      {/* Filter and Search */}
      <div className="px-5 py-3 border-b border-gray-200 flex gap-3 items-center bg-white">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm kiếm mã hoặc mô tả..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-5 bg-gray-50/50">
        {message && (
          <div className={`p-4 mb-4 rounded-lg flex items-center gap-3 border ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {message.type === 'success' ? <CheckCircle size={20} className="text-emerald-500" /> : <AlertCircle size={20} className="text-rose-500" />}
            <span className="text-sm font-medium">{message.text}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 size={36} className="animate-spin text-blue-600" />
          </div>
        ) : filteredPromos.length === 0 ? (
          <div className="bg-white border rounded-lg p-12 text-center shadow-sm">
            <Tag size={48} className="mx-auto text-gray-300 mb-3" />
            <h4 className="font-semibold text-gray-700">Không tìm thấy chương trình khuyến mãi nào</h4>
            <p className="text-sm text-gray-400 mt-1">Hãy nhấp vào nút "Tạo khuyến mãi" để bắt đầu thiết lập</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-700 font-bold text-xs uppercase border-b border-gray-200">
                  <th className="px-5 py-3.5">Mã khuyến mãi</th>
                  <th className="px-5 py-3.5">Thời gian cộng thêm</th>
                  <th className="px-5 py-3.5">Mô tả</th>
                  <th className="px-5 py-3.5">Trạng thái</th>
                  <th className="px-5 py-3.5">Dòng máy áp dụng</th>
                  <th className="px-5 py-3.5">Thời gian hiệu lực</th>
                  {isAdminOrDev && <th className="px-5 py-3.5 text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-150 text-sm text-gray-600">
                {filteredPromos.map(promo => {
                  const status = getPromoStatus(promo);
                  return (
                    <tr key={promo.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-4 font-bold text-gray-900 font-mono tracking-wider">{promo.code}</td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full text-xs">
                          +{promo.promoMonths} tháng
                        </span>
                      </td>
                      <td className="px-5 py-4 font-medium text-gray-500">{promo.description || '-'}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2 py-0.5 border rounded-full text-xs font-semibold ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {promo.applicableModels.length === 0 ? (
                          <span className="text-gray-400 italic text-xs">Tất cả sản phẩm</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {promo.applicableModels.map(m => (
                              <span key={m} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px] font-medium border border-gray-150">
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-gray-500">
                        {promo.startDate || promo.endDate ? (
                          <div className="flex flex-col gap-0.5">
                            {promo.startDate && <div>Từ: {new Date(promo.startDate).toLocaleDateString('vi-VN')}</div>}
                            {promo.endDate && <div>Đến: {new Date(promo.endDate).toLocaleDateString('vi-VN')}</div>}
                          </div>
                        ) : (
                          <span className="text-gray-400">Vô thời hạn</span>
                        )}
                      </td>
                      {isAdminOrDev && (
                        <td className="px-5 py-4 text-right">
                          <div className="flex gap-2.5 justify-end">
                            <button
                              type="button"
                              onClick={() => handleToggleLock(promo.id, promo.code)}
                              title={promo.isLocked ? 'Mở khóa' : 'Khóa mã'}
                              className={`p-1.5 rounded transition ${
                                promo.isLocked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'
                              }`}
                            >
                              {promo.isLocked ? <Unlock size={15} /> : <Lock size={15} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(promo)}
                              title="Sửa"
                              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(promo.id, promo.code)}
                              title="Xóa"
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl border w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b bg-gray-50 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 text-base">
                {modalMode === 'create' ? 'Tạo chương trình khuyến mãi' : 'Chỉnh sửa chương trình'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-5 space-y-4 flex-1 overflow-auto">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Mã khuyến mãi (*)</label>
                <input
                  type="text"
                  required
                  placeholder="Nhập mã (VD: MUNGHE6T)"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none font-mono font-bold tracking-wider"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Số tháng tặng thêm (*)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={promoMonths}
                    onChange={(e) => setPromoMonths(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none font-semibold"
                  />
                </div>
                
                {modalMode === 'edit' && (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Trạng thái Khóa</label>
                    <select
                      value={isLocked ? 'locked' : 'active'}
                      onChange={(e) => setIsLocked(e.target.value === 'locked')}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none bg-white font-medium cursor-pointer"
                    >
                      <option value="active">Hoạt động</option>
                      <option value="locked">Khóa (Lock)</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Mô tả ngắn</label>
                <textarea
                  placeholder="Khuyến mãi cộng thêm 6 tháng bảo hành dịp hè"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Dòng máy áp dụng</label>
                <div className="w-full">
                  <CategoryTreeSelect
                    categories={Array.from(new Set(productsStock.map(p => p.category).filter(Boolean))) as string[]}
                    products={productsStock.map(p => ({ name: p.name, category: p.category, sku: p.sku }))}
                    selected={selectedModels}
                    placeholder="-- Chọn dòng máy/sản phẩm (Để trống = Áp dụng tất cả) --"
                    onChange={(nextSelected) => setSelectedModels(nextSelected)}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1 italic">Hệ thống sẽ đối chiếu tương đối với model thiết bị khi kích hoạt</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Ngày bắt đầu</label>
                  <div className="relative">
                    <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Ngày kết thúc</label>
                  <div className="relative">
                    <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-md text-sm font-semibold text-gray-600 hover:bg-gray-100 transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-semibold transition shadow-sm"
                >
                  Lưu lại
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
