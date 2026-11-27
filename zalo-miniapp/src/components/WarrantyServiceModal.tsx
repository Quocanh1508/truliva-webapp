import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Wrench,
  Search,
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Award,
} from 'lucide-react';
import { API_BASE_URL, fetchZaloApi } from '../api/client';

export type WarrantyModalMode = 'warranty' | 'support';

interface WarrantyServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: WarrantyModalMode;
  initialSerial?: string;
  initialModel?: string;
  user?: any;
  onActivated?: () => void;
}

const SUPPORT_TYPES = [
  'Thay lõi lọc định kỳ',
  'Bảo dưỡng / Kiểm tra máy',
  'Sửa chữa / Báo lỗi',
  'Lắp đặt / Di dời máy',
  'Hỗ trợ kỹ thuật khác',
];

const COMMON_PROVINCES = [
  'Thành phố Hồ Chí Minh',
  'Thành phố Hà Nội',
  'Thành phố Đà Nẵng',
  'Thành phố Hải Phòng',
  'Thành phố Cần Thơ',
  'Tỉnh Bình Dương',
  'Tỉnh Đồng Nai',
  'Tỉnh Bà Rịa - Vũng Tàu',
  'Tỉnh Long An',
  'Tỉnh Khánh Hòa',
  'Tỉnh Nghệ An',
  'Tỉnh Thanh Hóa',
  'Tỉnh Bắc Ninh',
  'Tỉnh Quảng Ninh',
  'Tỉnh Lâm Đồng',
  'Tỉnh Bình Thuận',
  'Tỉnh Tây Ninh',
  'Tỉnh Tiền Giang',
  'Tỉnh Kiên Giang',
  'Tỉnh An Giang',
  'Tỉnh Đắk Lắk',
  'Tỉnh Gia Lai',
  'Tỉnh Thừa Thiên Huế',
  'Tỉnh Quảng Nam',
  'Tỉnh Bình Định',
  'Tỉnh Thái Nguyên',
  'Tỉnh Hưng Yên',
  'Tỉnh Hải Dương',
  'Tỉnh Nam Định',
  'Tỉnh Vĩnh Phúc',
  'Tỉnh khác',
];

function normalizePhone10(raw: string): string {
  const digits = (raw || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('84') && digits.length >= 11) {
    return '0' + digits.slice(2, 11);
  }
  return digits.slice(0, 10);
}

export default function WarrantyServiceModal({
  isOpen,
  onClose,
  initialMode = 'warranty',
  initialSerial = '',
  initialModel = '',
  user,
  onActivated,
}: WarrantyServiceModalProps) {
  const [mode, setMode] = useState<WarrantyModalMode>(initialMode);

  // Shared user fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [province, setProvince] = useState('Thành phố Hồ Chí Minh');
  const [address, setAddress] = useState('');

  // Tab 1: Warranty activation
  const [serialInput, setSerialInput] = useState('');
  const [checkingSerial, setCheckingSerial] = useState(false);
  const [serialInfo, setSerialInfo] = useState<any>(null);
  const [checkError, setCheckError] = useState('');
  const [invoiceImageUrl, setInvoiceImageUrl] = useState('');
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState('');
  const [activateSuccess, setActivateSuccess] = useState<any>(null);

  // Tab 2: Technical support ticket
  const [supportModel, setSupportModel] = useState('');
  const [supportSerial, setSupportSerial] = useState('');
  const [supportType, setSupportType] = useState(SUPPORT_TYPES[0]);
  const [supportDetail, setSupportDetail] = useState('');
  const [submittingSupport, setSubmittingSupport] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [supportTicketCode, setSupportTicketCode] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setCustomerName(user?.fullName && !user.fullName.startsWith('Khách hàng') ? user.fullName : '');
    setCustomerPhone(normalizePhone10(user?.phoneNumber || ''));
    setAddress(user?.address || '');
    setSerialInput(initialSerial || '');
    setSupportSerial(initialSerial || '');
    setSupportModel(initialModel || 'Máy lọc nước Truliva');
    setSerialInfo(null);
    setCheckError('');
    setInvoiceImageUrl('');
    setActivateError('');
    setActivateSuccess(null);
    setSupportError('');
    setSupportTicketCode('');
    setSupportDetail('');

    if (initialMode === 'warranty' && initialSerial) {
      handleCheckSerial(initialSerial);
    }
  }, [isOpen, initialMode, initialSerial, initialModel, user]);

  const handleCheckSerial = async (targetSerial?: string) => {
    const sn = (targetSerial ?? serialInput).trim();
    if (!sn) {
      setCheckError('Vui lòng nhập số Serial in trên thân máy');
      return;
    }
    setCheckingSerial(true);
    setCheckError('');
    setSerialInfo(null);
    setActivateError('');
    try {
      const data = await fetchZaloApi(`/serials/public/check/${encodeURIComponent(sn)}`);
      setSerialInfo(data);
    } catch (err: any) {
      setCheckError(err.message || 'Không tìm thấy số Serial trong hệ thống. Vui lòng kiểm tra lại.');
    } finally {
      setCheckingSerial(false);
    }
  };

  const handleUploadInvoice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setActivateError('Ảnh hóa đơn tối đa 20MB');
      return;
    }

    setUploadingInvoice(true);
    setActivateError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API_BASE_URL}/serials/public/upload-invoice`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'Không thể tải ảnh hóa đơn');
      }
      setInvoiceImageUrl(data.url);
    } catch (err: any) {
      setActivateError(err.message || 'Lỗi tải ảnh hóa đơn');
    } finally {
      setUploadingInvoice(false);
    }
  };

  const handleActivateWarranty = async (e: React.FormEvent) => {
    e.preventDefault();
    const sn = (serialInfo?.serialNumber || serialInput).trim();
    const phone = normalizePhone10(customerPhone);

    if (!sn || !customerName.trim() || !phone || !province.trim() || !address.trim()) {
      setActivateError('Vui lòng điền đầy đủ Họ tên, SĐT, Tỉnh/TP và Địa chỉ lắp đặt.');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      setActivateError('Số điện thoại phải gồm đúng 10 chữ số.');
      return;
    }
    if (!invoiceImageUrl) {
      setActivateError('Vui lòng tải lên ảnh hóa đơn / phiếu mua hàng.');
      return;
    }

    setActivating(true);
    setActivateError('');
    try {
      const data = await fetchZaloApi('/serials/public/activate', {
        method: 'POST',
        body: JSON.stringify({
          serialNumber: sn,
          customerName: customerName.trim(),
          customerPhone: phone,
          province: province.trim(),
          address: address.trim(),
          invoiceImageUrl,
        }),
      });
      setActivateSuccess(data);
      onActivated?.();
    } catch (err: any) {
      setActivateError(err.message || 'Không thể kích hoạt bảo hành. Vui lòng thử lại.');
    } finally {
      setActivating(false);
    }
  };

  const handleSubmitSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone10(customerPhone);
    if (!customerName.trim() || !phone || !province.trim() || !address.trim() || !supportModel.trim() || !supportDetail.trim()) {
      setSupportError('Vui lòng điền đầy đủ thông tin bắt buộc (*)');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      setSupportError('Số điện thoại phải gồm đúng 10 chữ số.');
      return;
    }

    setSubmittingSupport(true);
    setSupportError('');
    try {
      const res = await fetchZaloApi('/hotlines/public/create-support', {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: phone,
          provinceName: province.trim(),
          address: address.trim(),
          productName: supportModel.trim(),
          serialNumber: supportSerial.trim() || undefined,
          serviceRequestType: supportType,
          customerSupportDetail: supportDetail.trim(),
        }),
      });
      setSupportTicketCode(res?.ticket?.ticketCode || res?.ticketCode || 'ĐÃ TIẾP NHẬN');
    } catch (err: any) {
      setSupportError(err.message || 'Không thể gửi yêu cầu kỹ thuật. Vui lòng thử lại.');
    } finally {
      setSubmittingSupport(false);
    }
  };

  if (!isOpen) return null;

  const isAlreadyActivated =
    serialInfo &&
    (serialInfo.status === 'Đã kích hoạt' || serialInfo.status === 'KH xác nhận');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/65 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
      <div
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
        style={{ borderTop: '4px solid #1B3A6B' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-[#1B3A6B]/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#1B3A6B]/10 text-[#1B3A6B] flex items-center justify-center">
              {mode === 'warranty' ? <ShieldCheck size={20} /> : <Wrench size={20} />}
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-[#1B3A6B]">
                {mode === 'warranty' ? 'Bảo hành điện tử Truliva' : 'Yêu cầu Kỹ thuật viên'}
              </h3>
              <p className="text-[11px] text-slate-500">Thực hiện trực tiếp trên Zalo Mini App</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-4 pt-3 pb-2 bg-slate-50 border-b border-slate-100 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('warranty')}
            className={`flex-1 min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'warranty'
                ? 'bg-[#1B3A6B] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            <Award size={14} />
            <span>Kích hoạt bảo hành</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('support')}
            className={`flex-1 min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mode === 'support'
                ? 'bg-[#1B3A6B] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            <Wrench size={14} />
            <span>Yêu cầu KTV</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
          {mode === 'warranty' ? (
            activateSuccess ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={30} />
                </div>
                <h4 className="font-extrabold text-base text-slate-900">Kích hoạt bảo hành thành công!</h4>
                <p className="text-slate-600 leading-relaxed">
                  Thiết bị <strong className="font-mono text-[#1B3A6B]">{serialInfo?.serialNumber || serialInput}</strong> đã được kích hoạt bảo hành điện tử và đồng bộ vào tài khoản của bạn.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[44px] bg-[#1B3A6B] text-white rounded-xl font-bold text-xs cursor-pointer"
                >
                  Hoàn tất
                </button>
              </div>
            ) : (
              <>
                {/* Bước 1: Tra cứu Serial */}
                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">
                    Số Serial trên thân máy <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={serialInput}
                      onChange={(e) => setSerialInput(e.target.value.toUpperCase())}
                      placeholder="Nhập số Serial (VD: TL2026...)"
                      className="flex-1 px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:border-[#00A3FF]"
                    />
                    <button
                      type="button"
                      onClick={() => handleCheckSerial()}
                      disabled={checkingSerial}
                      className="px-4 min-h-[44px] bg-[#00A3FF] hover:bg-[#0284C7] text-white rounded-xl font-bold flex items-center gap-1.5 disabled:opacity-60 cursor-pointer shrink-0"
                    >
                      {checkingSerial ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                      <span>Tra cứu</span>
                    </button>
                  </div>
                  {checkError && (
                    <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-1.5">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{checkError}</span>
                    </div>
                  )}
                </div>

                {/* Kết quả tra cứu */}
                {serialInfo && (
                  isAlreadyActivated ? (
                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                      <div className="flex items-center gap-2 font-extrabold text-emerald-800 text-sm">
                        <CheckCircle2 size={18} />
                        <span>Thiết bị đã kích hoạt bảo hành</span>
                      </div>
                      <div className="space-y-1 text-emerald-900">
                        <div>Model: <strong>{serialInfo.model || serialInfo.productLine || 'Máy lọc nước Truliva'}</strong></div>
                        <div>Số Serial: <strong className="font-mono">{serialInfo.serialNumber}</strong></div>
                        {serialInfo.activationDate && (
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            <span>Ngày kích hoạt: <strong>{new Date(serialInfo.activationDate).toLocaleDateString('vi-VN')}</strong></span>
                          </div>
                        )}
                        {serialInfo.warrantyExpiryDate && (
                          <div className="flex items-center gap-1">
                            <ShieldCheck size={12} />
                            <span>Hạn bảo hành: <strong>{new Date(serialInfo.warrantyExpiryDate).toLocaleDateString('vi-VN')}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleActivateWarranty} className="space-y-3 pt-1 border-t border-slate-100">
                      <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900">
                        <div className="font-bold">{serialInfo.model || serialInfo.productLine || 'Máy lọc nước Truliva'}</div>
                        <div className="text-[11px] text-sky-700 mt-0.5">
                          Serial <span className="font-mono font-bold">{serialInfo.serialNumber}</span> — Chưa kích hoạt bảo hành
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Họ và tên *</label>
                          <input
                            type="text"
                            required
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Nguyễn Văn A"
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-[#00A3FF]"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Số điện thoại (10 số) *</label>
                          <input
                            type="tel"
                            required
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="09xxxxxxxx"
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-[#00A3FF]"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Tỉnh / Thành phố *</label>
                          <select
                            value={province}
                            onChange={(e) => setProvince(e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-[#00A3FF]"
                          >
                            {COMMON_PROVINCES.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Địa chỉ lắp đặt *</label>
                          <input
                            type="text"
                            required
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Số nhà, tên đường, phường/xã..."
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-[#00A3FF]"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Ảnh hóa đơn mua hàng *</label>
                          {invoiceImageUrl ? (
                            <div className="flex items-center gap-3 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                              <img src={invoiceImageUrl} alt="Hóa đơn" className="w-14 h-14 rounded-lg object-cover border border-emerald-200" />
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-emerald-700">Đã tải ảnh hóa đơn</div>
                                <button
                                  type="button"
                                  onClick={() => setInvoiceImageUrl('')}
                                  className="text-[11px] text-red-600 underline mt-0.5 cursor-pointer"
                                >
                                  Chọn ảnh khác
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className={`flex items-center justify-center gap-2 min-h-[48px] px-3 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-slate-600 font-semibold cursor-pointer hover:border-[#00A3FF] ${uploadingInvoice ? 'opacity-60 pointer-events-none' : ''}`}>
                              {uploadingInvoice ? (
                                <>
                                  <Loader2 size={16} className="animate-spin text-[#00A3FF]" />
                                  <span>Đang tải ảnh hóa đơn...</span>
                                </>
                              ) : (
                                <>
                                  <UploadCloud size={16} className="text-[#00A3FF]" />
                                  <span>Tải ảnh hóa đơn / phiếu mua hàng</span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploadingInvoice}
                                onChange={handleUploadInvoice}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {activateError && (
                        <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700">
                          {activateError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={activating || uploadingInvoice}
                        className="w-full min-h-[44px] bg-[#1B3A6B] hover:bg-[#142d55] text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                      >
                        {activating ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                        <span>Xác nhận kích hoạt bảo hành</span>
                      </button>
                    </form>
                  )
                )}
              </>
            )
          ) : supportTicketCode ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={30} />
              </div>
              <h4 className="font-extrabold text-base text-slate-900">Đã tiếp nhận yêu cầu!</h4>
              <p className="text-slate-600 leading-relaxed">
                Mã phiếu hỗ trợ của bạn: <strong className="font-mono text-[#1B3A6B]">{supportTicketCode}</strong>.<br />
                Tổng đài kỹ thuật Truliva sẽ liên hệ xác nhận lịch hẹn trong thời gian sớm nhất.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[44px] bg-[#1B3A6B] text-white rounded-xl font-bold text-xs cursor-pointer"
              >
                Đóng
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmitSupport} className="space-y-2.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-[#00A3FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Số điện thoại (10 số) *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="09xxxxxxxx"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-[#00A3FF]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dòng máy *</label>
                  <input
                    type="text"
                    required
                    value={supportModel}
                    onChange={(e) => setSupportModel(e.target.value)}
                    placeholder="VD: UR5676"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-[#00A3FF]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số Serial</label>
                  <input
                    type="text"
                    value={supportSerial}
                    onChange={(e) => setSupportSerial(e.target.value.toUpperCase())}
                    placeholder="Không bắt buộc"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl font-mono outline-none focus:border-[#00A3FF]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loại yêu cầu *</label>
                <select
                  value={supportType}
                  onChange={(e) => setSupportType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-[#00A3FF]"
                >
                  {SUPPORT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tỉnh / Thành phố *</label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-[#00A3FF]"
                >
                  {COMMON_PROVINCES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Địa chỉ *</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Số nhà, tên đường, phường/xã..."
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-[#00A3FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mô tả chi tiết yêu cầu *</label>
                <textarea
                  rows={3}
                  required
                  value={supportDetail}
                  onChange={(e) => setSupportDetail(e.target.value)}
                  placeholder="VD: Cần thay bộ lõi lọc định kỳ / máy báo đèn đỏ..."
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl outline-none focus:border-[#00A3FF] resize-none"
                />
              </div>

              {supportError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700">
                  {supportError}
                </div>
              )}

              <button
                type="submit"
                disabled={submittingSupport}
                className="w-full min-h-[44px] bg-[#1B3A6B] hover:bg-[#142d55] text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {submittingSupport ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
                <span>Gửi yêu cầu Kỹ thuật viên</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
