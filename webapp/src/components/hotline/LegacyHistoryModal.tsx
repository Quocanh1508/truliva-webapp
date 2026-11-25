import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Save, ClipboardList, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchApi, getFiltersData } from '../../api/client';
import ProvinceSelect from '../ProvinceSelect';
import CategoryTreeSelect from '../CategoryTreeSelect';
import { WORK_TYPES, WORK_TYPE_SERVICES } from '../../utils/workTypes';

interface LegacyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (record: any) => void;
  fallbackProductNames?: string[];
  initialPhone?: string;
}

const LEGACY_WORK_TYPE_OPTIONS = [
  ...WORK_TYPES,
  'Thay lọc'
];

const LEGACY_STATUS_OPTIONS = [
  'Hoàn thành',
  'Chờ xử lý',
  'Đang thực hiện',
  'Hủy đơn',
  'Đổi hoàn'
];

function getDefaultLocalDateTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function toIsoWithLocalOffset(localDateTimeStr: string): string | null {
  if (!localDateTimeStr) return null;
  const d = new Date(localDateTimeStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function LegacyHistoryModal({
  isOpen,
  onClose,
  onSaved,
  fallbackProductNames = [],
  initialPhone = ''
}: LegacyHistoryModalProps) {
  // Catalog options
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);

  // Form states — 7 required fields (*)
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [provinceName, setProvinceName] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [workType, setWorkType] = useState('');
  const [completedAt, setCompletedAt] = useState(getDefaultLocalDateTime);

  // Optional fields (theo file Excel quản lý dịch vụ)
  const [legacyOrderCode, setLegacyOrderCode] = useState('');
  const [status, setStatus] = useState('Hoàn thành');
  const [serviceType, setServiceType] = useState('');
  const [moneyToCollect, setMoneyToCollect] = useState('');
  const [mainStation, setMainStation] = useState('');
  const [techStation, setTechStation] = useState('');
  const [ktvName, setKtvName] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [requestedAt, setRequestedAt] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [parts, setParts] = useState('');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setSuccessMsg('');
    setCustomerName('');
    const cleanInitPhone = initialPhone.replace(/\D/g, '');
    setCustomerPhone(/^0\d{9}$/.test(cleanInitPhone) ? cleanInitPhone : '');
    setAddress('');
    setProvinceName('');
    setSelectedProducts([]);
    setWorkType('');
    setCompletedAt(getDefaultLocalDateTime());
    setLegacyOrderCode('');
    setStatus('Hoàn thành');
    setServiceType('');
    setMoneyToCollect('');
    setMainStation('');
    setTechStation('');
    setKtvName('');
    setAppointmentTime('');
    setRequestedAt('');
    setSerialNumber('');
    setParts('');
    setNote('');
  }, [isOpen, initialPhone]);

  // Load product catalog & stations when modal opens
  useEffect(() => {
    if (!isOpen) return;
    getFiltersData()
      .then((data) => {
        if (data?.products?.length) {
          setCategories(data.categories || []);
          setProducts(data.products || []);
        } else if (fallbackProductNames.length > 0) {
          setCategories(['Sản phẩm']);
          setProducts(fallbackProductNames.map((name) => ({ name, category: 'Sản phẩm' })));
        }
      })
      .catch(() => {
        if (fallbackProductNames.length > 0) {
          setCategories(['Sản phẩm']);
          setProducts(fallbackProductNames.map((name) => ({ name, category: 'Sản phẩm' })));
        }
      });

    fetchApi('/stations?status=active')
      .then((data) => {
        if (Array.isArray(data)) setStations(data);
        else if (Array.isArray(data?.mainStations)) setStations(data.mainStations);
      })
      .catch(() => setStations([]));
  }, [isOpen, fallbackProductNames]);

  // ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, onClose]);

  const serviceTypeSuggestions = useMemo(() => {
    return workType ? (WORK_TYPE_SERVICES[workType] || []) : [];
  }, [workType]);

  const techStationOptions = useMemo(() => {
    if (!mainStation) {
      return stations.flatMap((s: any) => s.techStations || []);
    }
    const matched = stations.find((s: any) => s.name === mainStation);
    return matched?.techStations || [];
  }, [stations, mainStation]);

  const ktvOptions = useMemo(() => {
    const list: string[] = [];
    const sourceTechs = techStation
      ? techStationOptions.filter((t: any) => t.name === techStation)
      : techStationOptions;
    sourceTechs.forEach((t: any) => {
      (t.users || []).forEach((u: any) => {
        if (u.fullName) list.push(u.fullName);
      });
    });
    return Array.from(new Set(list));
  }, [techStationOptions, techStation]);

  const handlePhoneChange = (raw: string) => {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('84') && digits.length === 11) {
      digits = '0' + digits.slice(2);
    }
    setCustomerPhone(digits.slice(0, 10));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const trimmedName = customerName.trim();
    const trimmedPhone = customerPhone.trim();
    const trimmedAddress = address.trim();
    const cleanProducts = selectedProducts
      .map((p) => p.replace(/^PROD:\s*/i, '').trim())
      .filter(Boolean);

    if (!trimmedName) {
      setErrorMsg('Vui lòng nhập Tên khách hàng');
      return;
    }
    if (!/^0\d{9}$/.test(trimmedPhone)) {
      setErrorMsg('Số điện thoại bắt buộc gồm đúng 10 ký tự số, bắt đầu bằng số 0');
      return;
    }
    if (!trimmedAddress) {
      setErrorMsg('Vui lòng nhập Địa chỉ chi tiết');
      return;
    }
    if (!provinceName) {
      setErrorMsg('Vui lòng chọn Tỉnh/thành phố');
      return;
    }
    if (cleanProducts.length === 0) {
      setErrorMsg('Vui lòng chọn Sản phẩm');
      return;
    }
    if (!workType) {
      setErrorMsg('Vui lòng chọn Loại công việc');
      return;
    }
    const completedIso = toIsoWithLocalOffset(completedAt);
    if (!completedIso) {
      setErrorMsg('Vui lòng nhập Thời gian hoàn thành hợp lệ');
      return;
    }

    if (moneyToCollect.trim() !== '') {
      const num = Number(moneyToCollect.replace(/[.,\s]/g, ''));
      if (!Number.isFinite(num) || num < 0 || num > 1_000_000_000) {
        setErrorMsg('Tiền cần thu (COD) phải là số hợp lệ từ 0 đến 1.000.000.000');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        customerName: trimmedName,
        customerPhone: trimmedPhone,
        address: trimmedAddress,
        provinceName,
        products: cleanProducts,
        workType,
        completedAt: completedIso,
        legacyOrderCode: legacyOrderCode.trim() || null,
        status: status || 'Hoàn thành',
        serviceType: serviceType.trim() || null,
        moneyToCollect: moneyToCollect.trim() !== '' ? Number(moneyToCollect.replace(/[.,\s]/g, '')) : null,
        mainStation: mainStation.trim() || null,
        techStation: techStation.trim() || null,
        ktvName: ktvName.trim() || null,
        appointmentTime: toIsoWithLocalOffset(appointmentTime),
        requestedAt: toIsoWithLocalOffset(requestedAt),
        serialNumber: serialNumber.trim() || null,
        parts: parts.trim() || null,
        note: note.trim() || null
      };

      const res = await fetchApi('/hotlines/legacy-history', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setSuccessMsg('Đã lưu lịch sử dịch vụ khách hàng thành công!');
      onSaved(res.record);
      setTimeout(() => {
        onClose();
      }, 350);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi lưu lịch sử dịch vụ khách hàng');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-xl">
              <ClipboardList size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold">Nhập thông tin Lịch sử Khách hàng</h3>
              <p className="text-xs text-blue-100">
                Lưu vào dữ liệu Tra cứu lịch sử khách hàng (không ảnh hưởng Quản lý dịch vụ / Lương KTV)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="p-1.5 hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Nhóm 1: Thông tin bắt buộc (*) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wide text-[#1B3A6B]">
                Thông tin bắt buộc
              </h4>
              <span className="text-[11px] text-rose-600 font-medium">* Bắt buộc nhập</span>
            </div>

            {/* Tên KH + SĐT */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tên khách hàng <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Nhập họ tên khách hàng..."
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Số điện thoại <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  required
                  maxLength={10}
                  placeholder="0xxxxxxxxx (đúng 10 số)"
                  value={customerPhone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 ${
                    customerPhone && !/^0\d{9}$/.test(customerPhone)
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
                      : 'border-gray-300 focus:border-[#00A3FF] focus:ring-blue-100'
                  }`}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Bắt buộc đúng 10 ký tự số, bắt đầu bằng số 0 ({customerPhone.length}/10)
                </p>
              </div>
            </div>

            {/* Địa chỉ chi tiết */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Địa chỉ chi tiết <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={500}
                placeholder="Số nhà, đường, phường/xã, quận/huyện..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF] focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Tỉnh/TP + Thời gian hoàn thành */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tỉnh/thành phố <span className="text-rose-500">*</span>
                </label>
                <ProvinceSelect
                  value={provinceName}
                  onChange={(val: string) => setProvinceName(val)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Thời gian hoàn thành <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={completedAt}
                  onChange={(e) => setCompletedAt(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF] focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* Sản phẩm + Loại công việc */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Sản phẩm <span className="text-rose-500">*</span>
                </label>
                <CategoryTreeSelect
                  categories={categories}
                  products={products}
                  selected={selectedProducts}
                  onChange={(next) => setSelectedProducts(next)}
                  placeholder="-- Chọn sản phẩm --"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Loại công việc <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={workType}
                  onChange={(e) => setWorkType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF] focus:ring-2 focus:ring-blue-100 bg-white"
                >
                  <option value="">-- Chọn loại công việc --</option>
                  {LEGACY_WORK_TYPE_OPTIONS.map((wt) => (
                    <option key={wt} value={wt}>
                      {wt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Nhóm 2: Các trường bổ sung theo file Excel quản lý dịch vụ */}
          <div className="space-y-4 pt-2 border-t border-gray-200">
            <h4 className="text-xs font-bold uppercase tracking-wide text-gray-600">
              Thông tin dịch vụ bổ sung (tùy chọn — theo file Excel Quản lý dịch vụ)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mã đơn (cũ / Pancake)</label>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="VD: ORD2610290001"
                  value={legacyOrderCode}
                  onChange={(e) => setLegacyOrderCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Trạng thái xử lý</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF] bg-white"
                >
                  {LEGACY_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tiền cần thu (COD - VNĐ)</label>
                <input
                  type="number"
                  min={0}
                  max={1000000000}
                  step={1000}
                  placeholder="0"
                  value={moneyToCollect}
                  onChange={(e) => setMoneyToCollect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Loại dịch vụ chi tiết</label>
                <input
                  type="text"
                  list="legacy-service-type-options"
                  maxLength={300}
                  placeholder="Chọn hoặc nhập chi tiết dịch vụ..."
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
                <datalist id="legacy-service-type-options">
                  {serviceTypeSuggestions.map((st) => (
                    <option key={st} value={st} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Số Serial</label>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="Nhập mã serial máy..."
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF] font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Trạm chính</label>
                <input
                  type="text"
                  list="legacy-main-station-options"
                  maxLength={200}
                  placeholder="Chọn hoặc nhập trạm chính..."
                  value={mainStation}
                  onChange={(e) => setMainStation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
                <datalist id="legacy-main-station-options">
                  {stations.map((s: any) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Trạm kỹ thuật</label>
                <input
                  type="text"
                  list="legacy-tech-station-options"
                  maxLength={200}
                  placeholder="Chọn hoặc nhập trạm KT..."
                  value={techStation}
                  onChange={(e) => setTechStation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
                <datalist id="legacy-tech-station-options">
                  {techStationOptions.map((t: any) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kỹ thuật viên gán</label>
                <input
                  type="text"
                  list="legacy-ktv-options"
                  maxLength={200}
                  placeholder="Chọn hoặc nhập tên KTV..."
                  value={ktvName}
                  onChange={(e) => setKtvName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
                <datalist id="legacy-ktv-options">
                  {ktvOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Ngày tạo / gửi yêu cầu</label>
                <input
                  type="datetime-local"
                  value={requestedAt}
                  onChange={(e) => setRequestedAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Thời gian hẹn khách</label>
                <input
                  type="datetime-local"
                  value={appointmentTime}
                  onChange={(e) => setAppointmentTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Linh kiện</label>
                <input
                  type="text"
                  maxLength={500}
                  placeholder="Linh kiện thay thế (nếu có)..."
                  value={parts}
                  onChange={(e) => setParts(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Ghi chú</label>
              <textarea
                rows={3}
                maxLength={2000}
                placeholder="Ghi chú chi tiết về ca dịch vụ..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm outline-none focus:border-[#00A3FF] resize-y"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-gray-200">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#00A3FF] hover:bg-[#0090E0] text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{submitting ? 'Đang lưu...' : 'Lưu lịch sử khách hàng'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
