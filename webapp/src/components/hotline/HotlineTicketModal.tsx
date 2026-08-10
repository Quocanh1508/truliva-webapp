import { useState, useEffect } from 'react';
import { fetchApi, getFiltersData } from '../../api/client';
import { Search, X, Loader2, Clock, Send, User, Check, ShoppingBag } from 'lucide-react';
import ProvinceSelect from '../ProvinceSelect';
import CategoryTreeSelect from '../CategoryTreeSelect';

// ═══════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════

interface Props {
  ticket: any | null; // null = create mode
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  userRole: string;
}

const SOURCE_OPTIONS = ['Hotline (Cuộc gọi)', 'Zalo OA', 'Fanpage / Messenger', 'Webapp', 'Khác'];
const SERVICE_REQUEST_OPTIONS = ['Sửa chữa', 'Lắp đặt', 'Thay lọc', 'Bảo hành', 'Tư vấn', 'Khiếu nại', 'Khác'];
const PHASE3_REQUEST_TYPE_OPTIONS = ['Sửa chữa', 'Lắp đặt', 'Thay lọc', 'Bảo hành', 'Tư vấn', 'Khác'];
const PHASE3_SERVICE_TYPE_OPTIONS = ['Áp lực nước yếu', 'Rò rỉ', 'Máy không hoạt động', 'TDS cao', 'Không ra nước', 'Tiếng ồn', 'Thay linh kiện', 'Khác'];
const PHASE3_ACTION_OPTIONS = [
  { key: 'VERIFY_APPROVE', label: 'Xác thực & Chuyển xử lý' },
  { key: 'REJECT_TO_PHASE2', label: 'Trả về sửa thông tin' },
  { key: 'CANCEL', label: 'Hủy phiếu' }
];
const STATUS_OPTIONS = [
  'CHỜ XÁC THỰC', 'CHƯA THỰC HIỆN', 'ĐANG CHỜ NHÓM 2 PHẢN HỒI',
  'KHÁCH HẸN GỌI LẠI SAU', 'CHƯA LIÊN HỆ ĐƯỢC KHÁCH',
  'ĐÃ CHUYỂN YÊU CẦU', 'ĐÃ HOÀN THÀNH', 'ĐÃ HỦY'
];

// ═══════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════

export default function HotlineTicketModal({ ticket, isOpen, onClose, onSaved, userRole }: Props) {
  const isEditMode = !!ticket;
  const canPhase3 = ['ADMIN', 'COORDINATOR', 'HOTLINE'].includes(userRole);
  // Product tree options
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    getFiltersData().then(data => {
      if (data) {
        setCategories(data.categories || []);
        setProducts(data.products || []);
      }
    }).catch(console.error);
  }, []);

  // Phase 1: Search
  const [searchPhone, setSearchPhone] = useState('');
  const [searchSerial, setSearchSerial] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [activeResultTab, setActiveResultTab] = useState<'customers' | 'orders' | 'serials'>('customers');
  const [selectedResultId, setSelectedResultId] = useState<string>('');

  const selectCustomer = (c: any) => {
    setSelectedResultId(`cust-${c.id}`);
    setFormData(prev => ({
      ...prev,
      customerName: c.fullName || prev.customerName,
      customerPhone: c.phoneNumber || prev.customerPhone,
      email: c.email || prev.email,
      provinceName: c.provinceName || prev.provinceName,
      address: c.fullAddress || c.address || prev.address
    }));
  };

  const selectOrder = (o: any) => {
    setSelectedResultId(`ord-${o.id}`);
    setFormData(prev => ({
      ...prev,
      customerName: o.billFullName || prev.customerName,
      customerPhone: o.billPhoneNumber || prev.customerPhone,
      productName: o.items?.[0]?.productName || prev.productName,
      address: (o.shippingAddress as any)?.full_address || prev.address,
      provinceName: (o.shippingAddress as any)?.province || prev.provinceName
    }));
  };

  const selectSerialItem = (s: any) => {
    setSelectedResultId(`ser-${s.id}`);
    setFormData(prev => ({
      ...prev,
      customerName: s.customerName || prev.customerName,
      customerPhone: s.customerPhone || prev.customerPhone,
      serialNumber: s.serialNumber || prev.serialNumber,
      productName: `${s.productLine || ''} ${s.model || ''}`.trim() || prev.productName,
      provinceName: s.province || prev.provinceName,
      address: s.address || prev.address
    }));
  };

  // Phase 2: Form data
  const [formData, setFormData] = useState({
    customerName: '', customerPhone: '', secondaryPhones: '',
    email: '', dateOfBirth: '', provinceName: '', address: '',
    source: '', channel: '', productName: '', serialNumber: '',
    serviceRequestType: '', customerSupportDetail: '',
    targetTeam: '', handlerUserId: ''
  });
  const [saving, setSaving] = useState(false);

  // Phase 3: Verify data
  const [phase3Data, setPhase3Data] = useState({
    phase3RequestType: '', phase3ServiceType: '', sparePartName: '',
    consultationNote: '', status: '', action: '', feedback: ''
  });
  const [savingPhase3, setSavingPhase3] = useState(false);

  // Handlers dropdown
  const [handlers, setHandlers] = useState<any[]>([]);

  // Detail data for edit mode
  const [ticketDetail, setTicketDetail] = useState<any>(null);

  // ── Load ticket detail when editing ──
  useEffect(() => {
    if (isEditMode && ticket?.id) {
      fetchApi(`/hotlines/${ticket.id}`).then(data => {
        setTicketDetail(data);
        setFormData({
          customerName: data.customerName || '',
          customerPhone: data.customerPhone || '',
          secondaryPhones: data.secondaryPhones || '',
          email: data.email || '',
          dateOfBirth: data.dateOfBirth || '',
          provinceName: data.provinceName || '',
          address: data.address || '',
          source: data.source || '',
          channel: data.channel || '',
          productName: data.productName || '',
          serialNumber: data.serialNumber || '',
          serviceRequestType: data.serviceRequestType || '',
          customerSupportDetail: data.customerSupportDetail || '',
          targetTeam: data.targetTeam || '',
          handlerUserId: data.handlerUserId || ''
        });
        setPhase3Data({
          phase3RequestType: data.phase3RequestType || '',
          phase3ServiceType: data.phase3ServiceType || '',
          sparePartName: data.sparePartName || '',
          consultationNote: data.consultationNote || '',
          status: data.status || '',
          action: '',
          feedback: ''
        });
      }).catch(console.error);
    }
  }, [isEditMode, ticket?.id]);

  // ── Load handlers when targetTeam changes ──
  useEffect(() => {
    if (formData.targetTeam) {
      fetchApi(`/hotlines/handlers?team=${encodeURIComponent(formData.targetTeam)}`)
        .then(data => setHandlers(data || []))
        .catch(() => setHandlers([]));
    }
  }, [formData.targetTeam]);

  // ── Phase 1: Search ──
  const handleSearch = async () => {
    if (!searchPhone && !searchSerial) return;
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchPhone) params.set('phone', searchPhone);
      if (searchSerial) params.set('serial', searchSerial);
      const data = await fetchApi(`/hotlines/search-customer?${params.toString()}`);
      setSearchResults(data);

      // Auto-fill from first result
      if (data.customers?.[0]) {
        setActiveResultTab('customers');
        selectCustomer(data.customers[0]);
      } else if (data.orders?.[0]) {
        setActiveResultTab('orders');
        selectOrder(data.orders[0]);
      } else if (data.serials?.[0]) {
        setActiveResultTab('serials');
        selectSerialItem(data.serials[0]);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  // ── Phase 2: Save ──
  const handleSavePhase2 = async () => {
    if (!formData.customerName || !formData.customerPhone || !formData.provinceName || !formData.source || !formData.productName || !formData.serviceRequestType || !formData.customerSupportDetail || !formData.targetTeam) {
      alert('Vui lòng nhập đầy đủ các trường bắt buộc (*)');
      return;
    }
    setSaving(true);
    try {
      if (isEditMode) {
        await fetchApi(`/hotlines/${ticket.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData)
        });
      } else {
        await fetchApi('/hotlines', {
          method: 'POST',
          body: JSON.stringify(formData)
        });
      }
      onSaved();
    } catch (err: any) {
      alert(err.message || 'Lỗi lưu phiếu');
    } finally {
      setSaving(false);
    }
  };

  // ── Phase 3: Verify ──
  const handleSavePhase3 = async () => {
    if (!phase3Data.action && !phase3Data.status) {
      alert('Vui lòng chọn thao tác xử lý hoặc trạng thái');
      return;
    }
    setSavingPhase3(true);
    try {
      await fetchApi(`/hotlines/${ticket.id}/verify`, {
        method: 'POST',
        body: JSON.stringify(phase3Data)
      });
      onSaved();
    } catch (err: any) {
      alert(err.message || 'Lỗi xử lý Phase 3');
    } finally {
      setSavingPhase3(false);
    }
  };

  const updateForm = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  // ═══════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl mx-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-2xl">
          <h2 className="text-lg font-bold text-[#1B3A6B]">
            {isEditMode ? `Chi tiết Yêu cầu Hotline - ${ticket.ticketCode}` : 'Tạo mới Yêu cầu Hotline'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 transition-all">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* ── Body: 2 Columns ── */}
        <div className="flex flex-col lg:flex-row">
          {/* ═══ CỘT TRÁI: Phase 1 + Phase 2 ═══ */}
          <div className="flex-1 p-6 space-y-6 border-r border-gray-200">
            {/* ── NHÓM 1: Tìm kiếm lịch sử KH ── */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">NHÓM 1. TÌM KIẾM LỊCH SỬ KH</h3>
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-xs text-gray-500 mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    placeholder="Số điện thoại"
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-xs text-gray-500 mb-1">Serial</label>
                  <input
                    type="text"
                    placeholder="Serial"
                    value={searchSerial}
                    onChange={(e) => setSearchSerial(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleSearch}
                    disabled={searching}
                    className="px-4 py-2 bg-[#00A3FF] text-white text-sm font-medium rounded-lg hover:bg-[#0090E0] disabled:opacity-50 flex items-center gap-1.5 transition-all"
                  >
                    {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Tìm kiếm
                  </button>
                </div>
              </div>
              {/* Search Results Selector */}
              {searchResults && (
                <div className="space-y-2 pt-2 border-t border-gray-200 mt-2">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>
                      Tìm thấy: <b>{searchResults.customers?.length || 0}</b> KH,{' '}
                      <b>{searchResults.orders?.length || 0}</b> đơn hàng,{' '}
                      <b>{searchResults.serials?.length || 0}</b> serial.
                    </span>
                    {selectedResultId && (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <Check size={13} /> Đã chọn kết quả
                      </span>
                    )}
                  </div>

                  {/* Result Category Tabs */}
                  <div className="flex gap-1.5 border-b border-gray-200 pb-1">
                    {(searchResults.customers?.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setActiveResultTab('customers')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-t-md transition-all ${
                          activeResultTab === 'customers'
                            ? 'bg-[#1B3A6B] text-white shadow-sm'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Khách hàng ({searchResults.customers.length})
                      </button>
                    )}
                    {(searchResults.orders?.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setActiveResultTab('orders')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-t-md transition-all ${
                          activeResultTab === 'orders'
                            ? 'bg-[#1B3A6B] text-white shadow-sm'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Đơn hàng ({searchResults.orders.length})
                      </button>
                    )}
                    {(searchResults.serials?.length > 0) && (
                      <button
                        type="button"
                        onClick={() => setActiveResultTab('serials')}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-t-md transition-all ${
                          activeResultTab === 'serials'
                            ? 'bg-[#1B3A6B] text-white shadow-sm'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Serial ({searchResults.serials.length})
                      </button>
                    )}
                  </div>

                  {/* List of matched items */}
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {activeResultTab === 'customers' && searchResults.customers?.map((c: any) => {
                      const isSelected = selectedResultId === `cust-${c.id}`;
                      return (
                        <div
                          key={c.id}
                          onClick={() => selectCustomer(c)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-400'
                              : 'border-gray-200 bg-white hover:bg-blue-50/40'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                              <User size={13} className="text-blue-600 shrink-0" />
                              <span className="truncate">{c.fullName || 'Chưa tên'}</span>
                              <span className="text-gray-500 font-normal shrink-0">({c.phoneNumber})</span>
                            </div>
                            {(c.fullAddress || c.address) && (
                              <div className="text-gray-500 text-[11px] truncate">
                                {c.fullAddress || c.address}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); selectCustomer(c); }}
                            className={`px-3 py-1 text-[11px] font-semibold rounded-md shrink-0 transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            }`}
                          >
                            {isSelected ? '✓ Đã chọn' : 'Chọn KH này'}
                          </button>
                        </div>
                      );
                    })}

                    {activeResultTab === 'orders' && searchResults.orders?.map((o: any) => {
                      const isSelected = selectedResultId === `ord-${o.id}`;
                      return (
                        <div
                          key={o.id}
                          onClick={() => selectOrder(o)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-400'
                              : 'border-gray-200 bg-white hover:bg-blue-50/40'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                              <ShoppingBag size={13} className="text-purple-600 shrink-0" />
                              <span className="text-blue-600 font-mono font-medium">ORD{Math.abs(o.pancakeOrderId).toString().padStart(8, '0')}</span>
                              <span className="truncate">{o.billFullName}</span>
                              <span className="text-gray-500 font-normal shrink-0">({o.billPhoneNumber})</span>
                            </div>
                            <div className="text-gray-500 text-[11px] truncate">
                              SP: {o.items?.[0]?.productName || 'Dịch vụ'} | Trạng thái: {o.adminStatus || 'Mới'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); selectOrder(o); }}
                            className={`px-3 py-1 text-[11px] font-semibold rounded-md shrink-0 transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            }`}
                          >
                            {isSelected ? '✓ Đã chọn' : 'Chọn Đơn này'}
                          </button>
                        </div>
                      );
                    })}

                    {activeResultTab === 'serials' && searchResults.serials?.map((s: any) => {
                      const isSelected = selectedResultId === `ser-${s.id}`;
                      return (
                        <div
                          key={s.id}
                          onClick={() => selectSerialItem(s)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-400'
                              : 'border-gray-200 bg-white hover:bg-blue-50/40'
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                              <span className="font-mono text-blue-600">{s.serialNumber}</span>
                              {s.customerName && <span className="truncate">- {s.customerName}</span>}
                              {s.customerPhone && <span className="text-gray-500 font-normal shrink-0">({s.customerPhone})</span>}
                            </div>
                            <div className="text-gray-500 text-[11px] truncate">
                              {s.productLine || s.model} | {s.status || 'Chưa kích hoạt'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); selectSerialItem(s); }}
                            className={`px-3 py-1 text-[11px] font-semibold rounded-md shrink-0 transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            }`}
                          >
                            {isSelected ? '✓ Đã chọn' : 'Chọn Serial này'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── NHÓM 2: Nhập thông tin yêu cầu ── */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">NHÓM 2. NHẬP THÔNG TIN YÊU CẦU</h3>

              {/* Tên đầy đủ */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tên đầy đủ *</label>
                <input type="text" placeholder="Tên đầy đủ" value={formData.customerName} onChange={(e) => updateForm('customerName', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                <p className="text-xs text-blue-500 mt-1">Vui lòng nhập Họ và tên thật của khách hàng – VD: Nguyễn Văn An</p>
              </div>

              {/* SĐT + SĐT phụ */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Số điện thoại *</label>
                  <input type="text" placeholder="Số điện thoại" value={formData.customerPhone} onChange={(e) => updateForm('customerPhone', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Số điện thoại phụ</label>
                  <input type="text" placeholder="VD: 0914567123 – Nguyễn Văn An" value={formData.secondaryPhones} onChange={(e) => updateForm('secondaryPhones', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>
              <p className="text-xs text-blue-500 -mt-2">Vui lòng nhập theo format: SDT (10 ký tự số) – Họ tên khách hàng. VD: 0914567123 – Nguyễn Văn An</p>

              {/* Email + Ngày sinh */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                  <input type="email" placeholder="Email" value={formData.email} onChange={(e) => updateForm('email', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Ngày sinh</label>
                  <input type="date" value={formData.dateOfBirth} onChange={(e) => updateForm('dateOfBirth', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>

              {/* Tỉnh/thành phố */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tỉnh/thành phố *</label>
                <ProvinceSelect
                  value={formData.provinceName}
                  onChange={(val: string) => updateForm('provinceName', val)}
                />
              </div>

              {/* Địa chỉ */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Địa chỉ</label>
                <input type="text" placeholder="Nhập địa chỉ" value={formData.address} onChange={(e) => updateForm('address', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              {/* Nguồn */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nguồn *</label>
                <select value={formData.source} onChange={(e) => updateForm('source', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="">Chọn</option>
                  {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Sản phẩm + Serial */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Sản phẩm *</label>
                  <CategoryTreeSelect
                    categories={categories}
                    products={products}
                    selected={formData.productName ? [formData.productName] : []}
                    onChange={(nextSelected) => {
                      const val = nextSelected[nextSelected.length - 1] || nextSelected[0] || '';
                      updateForm('productName', val);
                    }}
                    placeholder="-- Chọn sản phẩm --"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Serial</label>
                  <input type="text" placeholder="Serial" value={formData.serialNumber} onChange={(e) => updateForm('serialNumber', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>

              {/* Yêu cầu dịch vụ */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Yêu cầu dịch vụ *</label>
                <select value={formData.serviceRequestType} onChange={(e) => updateForm('serviceRequestType', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="">Chọn</option>
                  {SERVICE_REQUEST_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Nội dung KH cần hỗ trợ */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nội dung khách hàng cần hỗ trợ *</label>
                <textarea rows={3} placeholder="Mô tả chi tiết nội dung khách hàng cần hỗ trợ..." value={formData.customerSupportDetail} onChange={(e) => updateForm('customerSupportDetail', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
              </div>

              {/* Team xử lý + Người xử lý */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Team xử lý yêu cầu *</label>
                  <select value={formData.targetTeam} onChange={(e) => { updateForm('targetTeam', e.target.value); updateForm('handlerUserId', ''); }}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="">Chọn</option>
                    <option value="Hotline">Hotline</option>
                    <option value="Coordinator">Coordinator</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Người xử lý yêu cầu</label>
                  <select value={formData.handlerUserId} onChange={(e) => updateForm('handlerUserId', e.target.value)}
                    disabled={!formData.targetTeam}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100">
                    <option value="">Người gửi yêu cầu</option>
                    {handlers.map(h => <option key={h.id} value={h.id}>{h.fullName} | {h.email || ''}</option>)}
                  </select>
                </div>
              </div>

              {/* Nút gửi Phase 2 */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSavePhase2}
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#00A3FF] text-white text-sm font-medium rounded-lg hover:bg-[#0090E0] disabled:opacity-50 flex items-center gap-2 transition-all"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {isEditMode ? 'Cập nhật yêu cầu' : 'Gửi yêu cầu'}
                </button>
              </div>
            </div>
          </div>

          {/* ═══ CỘT PHẢI: Phase 3 (Verify & Xử lý) ═══ */}
          <div className={`flex-1 p-6 space-y-4 ${!isEditMode ? 'opacity-40 pointer-events-none' : ''}`}>
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">NHÓM 3. NGƯỜI GIẢI QUYẾT NHẬN YÊU CẦU & XỬ LÝ</h3>

            {!canPhase3 && isEditMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                ⚠️ Chỉ Hotline / Admin / Coordinator được phép thao tác Phase 3
              </div>
            )}

            <div className={!canPhase3 ? 'opacity-50 pointer-events-none' : ''}>
              {/* Thời gian liên hệ */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Thời gian liên hệ</label>
                <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-gray-50">
                  <Clock size={14} className="text-gray-400" />
                  <span>{new Date().toLocaleString('vi-VN')}</span>
                </div>
              </div>

              {/* Loại yêu cầu + Loại dịch vụ */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Loại yêu cầu *</label>
                  <select value={phase3Data.phase3RequestType} onChange={(e) => setPhase3Data(prev => ({ ...prev, phase3RequestType: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="">Chọn</option>
                    {PHASE3_REQUEST_TYPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Loại dịch vụ *</label>
                  <select value={phase3Data.phase3ServiceType} onChange={(e) => setPhase3Data(prev => ({ ...prev, phase3ServiceType: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="">Chọn</option>
                    {PHASE3_SERVICE_TYPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Linh kiện */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Linh kiện</label>
                <input type="text" placeholder="Tên linh kiện (nếu có)" value={phase3Data.sparePartName} onChange={(e) => setPhase3Data(prev => ({ ...prev, sparePartName: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              {/* Đơn hàng liên kết (nếu đã convert) */}
              {ticketDetail?.convertedOrder && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Đơn hàng</label>
                  <div className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-blue-50 text-blue-700 font-medium">
                    ORD{Math.abs(ticketDetail.convertedOrder.pancakeOrderId).toString().padStart(10, '0')} | {ticketDetail.convertedOrder.billFullName || ''}
                  </div>
                </div>
              )}

              {/* Ghi chú nội dung tư vấn */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Ghi chú nội dung tư vấn</label>
                <textarea rows={3} placeholder="Nhập ghi chú..." value={phase3Data.consultationNote} onChange={(e) => setPhase3Data(prev => ({ ...prev, consultationNote: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
                {/* Lịch sử ghi chú */}
                {ticketDetail?.notesHistory?.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-blue-500 cursor-pointer hover:underline">Lịch sử ghi chú ({ticketDetail.notesHistory.length})</summary>
                    <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                      {ticketDetail.notesHistory.map((n: any) => (
                        <div key={n.id} className="bg-gray-50 border border-gray-200 rounded p-2 text-xs">
                          <span className="font-medium text-gray-700">{n.userName}</span>
                          <span className="text-gray-400 ml-2">{new Date(n.createdAt).toLocaleString('vi-VN')}</span>
                          <p className="text-gray-600 mt-0.5">{n.note}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {/* Trạng thái */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Trạng thái *</label>
                <select value={phase3Data.status} onChange={(e) => setPhase3Data(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="">Chọn trạng thái</option>
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <hr className="border-gray-200" />

              {/* Thao tác xử lý */}
              <div className="mb-4 pt-3">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Thao tác xử lý</label>
                <select value={phase3Data.action} onChange={(e) => setPhase3Data(prev => ({ ...prev, action: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                  <option value="">Chọn</option>
                  {PHASE3_ACTION_OPTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                </select>
              </div>

              {/* Nội dung phản hồi bước 3 */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nội dung phản hồi của bước 3</label>
                <textarea rows={2} placeholder="Nội dung phản hồi của bước 3" value={phase3Data.feedback} onChange={(e) => setPhase3Data(prev => ({ ...prev, feedback: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
                {/* Lịch sử phản hồi */}
                {ticketDetail?.feedbackHistory?.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-blue-500 cursor-pointer hover:underline">Lịch sử phản hồi ({ticketDetail.feedbackHistory.length})</summary>
                    <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                      {ticketDetail.feedbackHistory.map((f: any) => (
                        <div key={f.id} className="bg-gray-50 border border-gray-200 rounded p-2 text-xs">
                          <span className="font-medium text-gray-700">{f.userName}</span>
                          <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">{f.action}</span>
                          <span className="text-gray-400 ml-2">{new Date(f.createdAt).toLocaleString('vi-VN')}</span>
                          <p className="text-gray-600 mt-0.5">{f.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {/* Nút gửi Phase 3 */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSavePhase3}
                  disabled={savingPhase3 || !canPhase3}
                  className="px-6 py-2.5 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:bg-[#142d55] disabled:opacity-50 flex items-center gap-2 transition-all"
                >
                  {savingPhase3 ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Gửi thao tác xử lý
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
