import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchApi, getFiltersData } from '../../api/client';
import { X, Loader2, Clock, Send, User, ShoppingBag } from 'lucide-react';
import ProvinceSelect from '../ProvinceSelect';
import CategoryTreeSelect from '../CategoryTreeSelect';
import SourceTreeSelect from '../SourceTreeSelect';

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

const SERVICE_REQUEST_OPTIONS = [
  'Bảo Hành - Bảo Trì',
  'Hướng dẫn sử dụng',
  'Khác',
  'Lắp đặt',
  'Thay lõi lọc',
  'Tra cứu thông tin',
  'Tư vấn kỹ thuật',
  'Tư vấn sản phẩm'
];
const PHASE3_REQUEST_TYPE_OPTIONS = [
  'Bảo Hành - Bảo Trì',
  'Hướng dẫn sử dụng',
  'Khác',
  'Lắp đặt',
  'Thay lõi lọc',
  'Tra cứu thông tin',
  'Tư vấn kỹ thuật',
  'Tư vấn sản phẩm'
];
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

import { usePermission } from '../../context/PermissionContext';

export default function HotlineTicketModal({ ticket, isOpen, onClose, onSaved, userRole }: Props) {
  const isEditMode = !!ticket;
  const { hasPermission } = usePermission();
  const canPhase3 = ['ADMIN', 'DEV'].includes(userRole) || hasPermission('HOTLINE_TICKET_VERIFY');
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

  // Phone suggestion (inline customer lookup)
  const [phoneSuggestions, setPhoneSuggestions] = useState<any[]>([]);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const [phoneSearching, setPhoneSearching] = useState(false);
  const phoneDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneSuggestionRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (phoneSuggestionRef.current && !phoneSuggestionRef.current.contains(e.target as Node)) {
        setShowPhoneSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchPhoneSuggestions = useCallback(async (phone: string) => {
    if (phone.length < 5) {
      setPhoneSuggestions([]);
      setShowPhoneSuggestions(false);
      return;
    }
    setPhoneSearching(true);
    try {
      const data = await fetchApi(`/hotlines/search-customer?phone=${encodeURIComponent(phone)}`);
      const suggestions: any[] = [];
      // Collect customers
      if (data.customers?.length) {
        data.customers.forEach((c: any) => suggestions.push({
          type: 'customer', id: c.id,
          label: c.fullName || 'Chưa tên',
          phone: c.phoneNumber,
          detail: c.fullAddress || c.address || '',
          raw: c
        }));
      }
      // Collect orders
      if (data.orders?.length) {
        data.orders.forEach((o: any) => suggestions.push({
          type: 'order', id: o.id,
          label: o.billFullName || 'Đơn hàng',
          phone: o.billPhoneNumber,
          detail: o.items?.[0]?.productName || 'Dịch vụ',
          raw: o
        }));
      }
      // Collect serials
      if (data.serials?.length) {
        data.serials.forEach((s: any) => suggestions.push({
          type: 'serial', id: s.id,
          label: s.customerName || s.serialNumber,
          phone: s.customerPhone,
          detail: `${s.productLine || ''} ${s.model || ''}`.trim(),
          raw: s
        }));
      }
      setPhoneSuggestions(suggestions);
      setShowPhoneSuggestions(suggestions.length > 0);
    } catch (err) {
      console.error('Phone suggestion error:', err);
      setPhoneSuggestions([]);
    } finally {
      setPhoneSearching(false);
    }
  }, []);

  const handlePhoneChange = (value: string) => {
    // Only allow digits
    const digits = value.replace(/\D/g, '').slice(0, 10);
    updateForm('customerPhone', digits);
    // Debounce search
    if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
    phoneDebounceRef.current = setTimeout(() => searchPhoneSuggestions(digits), 500);
  };

  const selectSuggestion = (s: any) => {
    setShowPhoneSuggestions(false);
    if (s.type === 'customer') {
      const c = s.raw;
      setFormData(prev => ({
        ...prev,
        customerName: c.fullName || prev.customerName,
        customerPhone: c.phoneNumber || prev.customerPhone,
        email: c.email || prev.email,
        provinceName: c.provinceName || prev.provinceName,
        address: c.fullAddress || c.address || prev.address
      }));
    } else if (s.type === 'order') {
      const o = s.raw;
      setFormData(prev => ({
        ...prev,
        customerName: o.billFullName || prev.customerName,
        customerPhone: o.billPhoneNumber || prev.customerPhone,
        productName: o.items?.[0]?.productName || prev.productName,
        address: (o.shippingAddress as any)?.full_address || prev.address,
        provinceName: (o.shippingAddress as any)?.province || prev.provinceName
      }));
    } else if (s.type === 'serial') {
      const sr = s.raw;
      setFormData(prev => ({
        ...prev,
        customerName: sr.customerName || prev.customerName,
        customerPhone: sr.customerPhone || prev.customerPhone,
        serialNumber: sr.serialNumber || prev.serialNumber,
        productName: `${sr.productLine || ''} ${sr.model || ''}`.trim() || prev.productName,
        provinceName: sr.province || prev.provinceName,
        address: sr.address || prev.address
      }));
    }
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

  // ── Phase 2: Save ──
  const handleSavePhase2 = async () => {
    if (!formData.customerName || !formData.customerPhone || !formData.address || !formData.provinceName || !formData.source || !formData.productName || !formData.serviceRequestType || !formData.customerSupportDetail || !formData.targetTeam) {
      alert('Vui lòng nhập đầy đủ các trường bắt buộc (*)');
      return;
    }
    // Validate phone: exactly 10 digits starting with 0
    if (!/^0\d{9}$/.test(formData.customerPhone)) {
      alert('Số điện thoại phải gồm đúng 10 ký tự số liền kề (bắt đầu bằng 0)');
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
          {/* ═══ CỘT TRÁI: Nhập thông tin yêu cầu ═══ */}
          <div className="flex-1 p-6 space-y-6 border-r border-gray-200">

            <div className="space-y-4">

              {/* Tên đầy đủ */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tên đầy đủ *</label>
                <input type="text" placeholder="Tên đầy đủ" value={formData.customerName} onChange={(e) => updateForm('customerName', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                <p className="text-xs text-blue-500 mt-1">Vui lòng nhập Họ và tên thật của khách hàng – VD: Nguyễn Văn An</p>
              </div>

              {/* SĐT + SĐT phụ */}
              <div className="grid grid-cols-2 gap-4">
                <div className="relative" ref={phoneSuggestionRef}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Số điện thoại *</label>
                  <div className="relative">
                    <input type="text" placeholder="Nhập 10 ký tự số" value={formData.customerPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      onFocus={() => { if (phoneSuggestions.length > 0) setShowPhoneSuggestions(true); }}
                      maxLength={10}
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
                        formData.customerPhone && !/^0\d{9}$/.test(formData.customerPhone)
                          ? 'border-red-300 bg-red-50/30'
                          : 'border-gray-300'
                      }`} />
                    {phoneSearching && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 size={14} className="animate-spin text-blue-500" />
                      </div>
                    )}
                  </div>
                  {formData.customerPhone && formData.customerPhone.length > 0 && formData.customerPhone.length < 10 && (
                    <p className="text-xs text-amber-500 mt-0.5">Cần nhập đủ 10 số ({formData.customerPhone.length}/10)</p>
                  )}
                  {formData.customerPhone && formData.customerPhone.length === 10 && !/^0\d{9}$/.test(formData.customerPhone) && (
                    <p className="text-xs text-red-500 mt-0.5">SĐT phải bắt đầu bằng số 0</p>
                  )}
                  {/* Phone Suggestions Dropdown */}
                  {showPhoneSuggestions && phoneSuggestions.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 font-semibold uppercase">
                        Gợi ý từ lịch sử ({phoneSuggestions.length})
                      </div>
                      {phoneSuggestions.map((s, idx) => (
                        <div
                          key={`${s.type}-${s.id}-${idx}`}
                          onClick={() => selectSuggestion(s)}
                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center gap-2 transition-colors"
                        >
                          <div className="shrink-0">
                            {s.type === 'customer' && <User size={14} className="text-blue-600" />}
                            {s.type === 'order' && <ShoppingBag size={14} className="text-purple-600" />}
                            {s.type === 'serial' && <span className="text-xs font-mono text-emerald-600">SN</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-800 truncate">{s.label}</div>
                            <div className="text-[11px] text-gray-500 truncate">{s.phone} • {s.detail}</div>
                          </div>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                            s.type === 'customer' ? 'bg-blue-100 text-blue-700' :
                            s.type === 'order' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {s.type === 'customer' ? 'KH' : s.type === 'order' ? 'ĐH' : 'Serial'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Số điện thoại phụ</label>
                  <input type="text" placeholder="VD: 0914567123 – Nguyễn Văn An" value={formData.secondaryPhones} onChange={(e) => updateForm('secondaryPhones', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>
              <p className="text-xs text-blue-500 -mt-2">SĐT bắt buộc 10 ký tự số liền kề nhau, bắt đầu bằng số 0</p>

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

              {/* Địa chỉ (bắt buộc, lên trước) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Địa chỉ *</label>
                <input type="text" placeholder="Nhập địa chỉ chi tiết" value={formData.address} onChange={(e) => updateForm('address', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200" />
              </div>

              {/* Tỉnh/thành phố (xuống sau) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tỉnh/thành phố *</label>
                <ProvinceSelect
                  value={formData.provinceName}
                  onChange={(val: string) => updateForm('provinceName', val)}
                />
              </div>

              {/* Nguồn */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nguồn *</label>
                <SourceTreeSelect
                  value={formData.source}
                  onChange={(val: string) => updateForm('source', val)}
                />
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
