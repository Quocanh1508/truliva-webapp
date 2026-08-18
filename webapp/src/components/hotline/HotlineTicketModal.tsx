import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { fetchApi, getFiltersData, uploadImages } from '../../api/client';
import { WORK_TYPES, WORK_TYPE_SERVICES, HOTLINE_SERVICE_REQUEST_TYPES } from '../../utils/workTypes';
import { X, Loader2, Clock, Send, User, ShoppingBag, UploadCloud } from 'lucide-react';
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


const STATUS_OPTIONS = [
  'Chưa liên hệ được khách',
  'Chưa thực hiện',
  'Đã hoàn thành',
  'Đã hủy',
  'Khách hẹn gọi lại sau'
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

  // Attachments state
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleUploadAttachments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedFiles = Array.from(e.target.files);
    if (attachmentUrls.length + selectedFiles.length > 5) {
      setUploadError('Tối đa 5 ảnh đính kèm');
      return;
    }
    setUploadingAttachment(true);
    setUploadError('');
    try {
      const urls = await uploadImages(selectedFiles);
      setAttachmentUrls(prev => [...prev, ...urls]);
    } catch (err: any) {
      setUploadError(err.message || 'Lỗi upload ảnh');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachmentUrls(prev => prev.filter((_, i) => i !== index));
  };

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
        const rawStatus = data.status || 'Chưa thực hiện';
        const initialStatus = (rawStatus === 'CHỜ XÁC THỰC' || rawStatus === 'CHƯA THỰC HIỆN') ? 'Chưa thực hiện' : rawStatus;
        setPhase3Data({
          phase3RequestType: data.phase3RequestType || '',
          phase3ServiceType: data.phase3ServiceType || '',
          sparePartName: data.sparePartName || '',
          consultationNote: data.consultationNote || '',
          status: initialStatus,
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

  // ── ESC Key listener to close modal ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
    const payload = { ...formData, attachmentUrls };
    try {
      if (isEditMode) {
        await fetchApi(`/hotlines/${ticket.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await fetchApi('/hotlines', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      onSaved();
    } catch (err: any) {
      alert(err.message || 'Lỗi lưu phiếu');
    } finally {
      setSaving(false);
    }
  };

  // ── Phase 3: Verify / Save ──
  const handleSavePhase3 = async () => {
    if (!phase3Data.consultationNote?.trim()) {
      alert('Vui lòng nhập Ghi chú nội dung tư vấn');
      return;
    }
    if (!phase3Data.status) {
      alert('Vui lòng chọn Trạng thái');
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
      alert(err.message || 'Lỗi lưu thông tin');
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl mx-4 my-auto">
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
          {/* ═══ CỘT TRÁI: Thông tin Yêu cầu & Tiếp nhận ═══ */}
          <div className="flex-1 p-6 space-y-6 border-r border-gray-200">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00A3FF]"></div>
              <h3 className="text-base font-bold text-[#1B3A6B]">Thông tin Yêu cầu & Tiếp nhận</h3>
            </div>

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
                  {HOTLINE_SERVICE_REQUEST_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Nội dung KH cần hỗ trợ */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nội dung khách hàng cần hỗ trợ *</label>
                <textarea rows={3} placeholder="Mô tả chi tiết nội dung khách hàng cần hỗ trợ..." value={formData.customerSupportDetail} onChange={(e) => updateForm('customerSupportDetail', e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
              </div>

              {/* Hình ảnh đính kèm (Không bắt buộc) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-gray-700">
                    Hình ảnh đính kèm <span className="text-xs text-gray-400 font-normal">(không bắt buộc)</span>
                  </label>
                  <span className="text-xs text-gray-400 font-medium">{attachmentUrls.length}/5 ảnh</span>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2.5">
                    {attachmentUrls.map((url, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 shadow-xs group">
                        <img src={url} alt={`attachment-${idx}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(idx)}
                          className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded-full hover:bg-red-600 transition-colors opacity-90"
                          title="Xóa ảnh"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}

                    {attachmentUrls.length < 5 && (
                      <label className={`w-20 h-20 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 transition-all ${uploadingAttachment ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingAttachment ? (
                          <Loader2 size={18} className="animate-spin text-blue-500" />
                        ) : (
                          <>
                            <UploadCloud size={20} className="text-gray-400" />
                            <span className="text-[10px] text-gray-500 font-medium mt-1">+ Thêm ảnh</span>
                          </>
                        )}
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingAttachment || attachmentUrls.length >= 5}
                          onChange={handleUploadAttachments}
                        />
                      </label>
                    )}
                  </div>
                  {uploadError && <p className="text-xs text-red-500 font-medium">{uploadError}</p>}
                </div>
              </div>

              {/* Team xử lý + Người xử lý */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Team xử lý yêu cầu *</label>
                  <select value={formData.targetTeam} onChange={(e) => { updateForm('targetTeam', e.target.value); updateForm('handlerUserId', ''); }}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200">
                    <option value="">Chọn team...</option>
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
                    <option value="">Chọn người xử lý...</option>
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

          {/* ═══ CỘT PHẢI: Xác thực & Xử lý Yêu cầu ═══ */}
          <div className={`flex-1 p-6 space-y-4 ${!isEditMode ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100 mb-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
              <h3 className="text-base font-bold text-[#1B3A6B]">Xác thực & Xử lý Yêu cầu</h3>
            </div>

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
              {(() => {
                const availableServiceTypes = phase3Data.phase3RequestType
                  ? (WORK_TYPE_SERVICES[phase3Data.phase3RequestType] || [])
                  : Array.from(new Set(Object.values(WORK_TYPE_SERVICES).flat()));

                return (
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Loại yêu cầu *</label>
                      <select
                        value={phase3Data.phase3RequestType}
                        onChange={(e) => {
                          const newReqType = e.target.value;
                          const allowed = WORK_TYPE_SERVICES[newReqType] || [];
                          setPhase3Data(prev => ({
                            ...prev,
                            phase3RequestType: newReqType,
                            phase3ServiceType: allowed.includes(prev.phase3ServiceType) ? prev.phase3ServiceType : ''
                          }));
                        }}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Chọn</option>
                        {WORK_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Loại dịch vụ *</label>
                      <select
                        value={phase3Data.phase3ServiceType}
                        onChange={(e) => setPhase3Data(prev => ({ ...prev, phase3ServiceType: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Chọn</option>
                        {availableServiceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })()}

              {/* Cảnh báo đỏ/vàng */}
              <div className="mb-4 bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-800 font-medium flex items-start gap-2">
                <span className="text-amber-600 font-bold text-sm shrink-0">⚠️</span>
                <span className="leading-relaxed">Yêu cầu phát sinh sản phẩm, linh kiện hay chi phí cần tạo bổ sung đơn hàng từ hệ thống Pancake POS</span>
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
                <label className="block text-sm font-semibold text-gray-700 mb-1">Ghi chú nội dung tư vấn *</label>
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

              {/* Nút Lưu lại */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSavePhase3}
                  disabled={savingPhase3 || !canPhase3}
                  className="px-6 py-2.5 bg-[#1B3A6B] text-white text-sm font-medium rounded-lg hover:bg-[#142d55] disabled:opacity-50 flex items-center gap-2 transition-all shadow-xs"
                >
                  {savingPhase3 ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Lưu lại
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
