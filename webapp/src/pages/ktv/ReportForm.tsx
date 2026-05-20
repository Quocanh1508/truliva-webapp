import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi, getOrders } from '../../api/client';
import LabeledImageUploader from '../../components/LabeledImageUploader';
import { CheckCircle, ChevronLeft, Send, AlertCircle } from 'lucide-react';

// ── Danh sách loại công việc ──
// LabeledImageUploader is resolved correctly by tsc compiler
const WORK_TYPES = [
  'Giao hàng',
  'Lắp đặt',
  'Thay lõi lọc',
  'Giao hàng và lắp đặt',
  'Bảo hành',
  'Sửa chữa',
];

const SERVICE_TYPES = [
  'Giao hàng',
  'Lắp đặt',
  'Thay lõi lọc',
  'Giao hàng và lắp đặt',
  'Bảo hành',
  'Sửa chữa',
];

// ── Nguồn nước options ──
const WATER_SOURCES = [
  'Nước máy trực tiếp',
  'Nước máy bồn',
  'Nước giếng',
  'Nước mưa',
];

// ── Image slots theo loại công việc ──
function getImageSlots(workType: string): { label: string }[] {
  switch (workType) {
    case 'Giao hàng':
      return [
        { label: 'Ảnh giao hàng cho khách' },
        { label: 'Ảnh seri sản phẩm' },
        { label: 'Ảnh biên bản nghiệm thu' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Thay lõi lọc':
      return [
        { label: 'Ảnh trước khi thay lọc' },
        { label: 'Ảnh sau khi thay lọc' },
        { label: 'Ảnh đo TDS đầu vào' },
        { label: 'Ảnh đo TDS đầu ra' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh seri sản phẩm' },
        { label: 'Ảnh biên bản nghiệm thu' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Giao hàng và lắp đặt':
    case 'Lắp đặt':
      return [
        { label: 'Ảnh lắp đặt hoàn thiện' },
        { label: 'Ảnh treo biến áp/kết nối điện nước' },
        { label: 'Ảnh đo TDS đầu vào' },
        { label: 'Ảnh đo TDS đầu ra' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh seri sản phẩm' },
        { label: 'Ảnh biên bản nghiệm thu' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Bảo hành':
    case 'Sửa chữa':
      return [
        { label: 'Ảnh trước khi xử lý' },
        { label: 'Ảnh sau khi xử lý' },
        { label: 'Ảnh linh kiện thay thế' },
        { label: 'Ảnh đo TDS' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh seri sản phẩm' },
        { label: 'Ảnh biên bản nghiệm thu' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    default:
      return [
        { label: 'Ảnh xác nhận 1' },
        { label: 'Ảnh xác nhận 2' },
        { label: 'Ảnh xác nhận 3' },
        { label: 'Ảnh xác nhận 4' },
      ];
  }
}

// ── Kiểm tra workType có cần trường kỹ thuật không ──
function needsTechnicalFields(workType: string): boolean {
  return ['Thay lõi lọc', 'Lắp đặt', 'Giao hàng và lắp đặt', 'Bảo hành', 'Sửa chữa'].includes(workType);
}

export default function ReportForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Đơn hàng ──
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');

  // ── Step 1: Thông tin chung ──
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [workType, setWorkType] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [products, setProducts] = useState('');
  const [actualAmount, setActualAmount] = useState('');

  // ── Step 2: Trường kỹ thuật (dynamic) ──
  const [serialNumber, setSerialNumber] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [tdsIn, setTdsIn] = useState('');
  const [tdsOut, setTdsOut] = useState('');
  const [waterPressure, setWaterPressure] = useState('');

  // ── Step 3: Ảnh ──
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  // ── Step 4: Ghi chú & Submit ──
  const [notes, setNotes] = useState('');

  useEffect(() => {
    getOrders({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' })
      .then(res => setOrders(res.orders))
      .catch(err => console.error('Lỗi tải đơn hàng', err));
  }, []);

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    if (!orderId) {
      setCustomerName('');
      setCustomerPhone('');
      setAddress('');
      setProvince('');
      setWorkType('');
      setServiceType('');
      setProducts('');
      setActualAmount('');
      return;
    }
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setCustomerName(order.billFullName || order.customer?.fullName || '');
      setCustomerPhone(order.billPhoneNumber || order.customer?.phoneNumber || '');
      setProvince(order.shippingAddress?.province_name || order.customer?.provinceName || '');
      const fullAddr = order.shippingAddress?.full_address || order.customer?.fullAddress || '';
      setAddress(fullAddr);
      if (order.workType) setWorkType(order.workType);
      if (order.serviceType) setServiceType(order.serviceType);

      // ── Mapping sản phẩm x số lượng từ items ──
      if (order.items && order.items.length > 0) {
        const prodStr = order.items.map((item: any) => {
          // Lấy tên đầy đủ nhất có thể
          const name = item.productName
            || item.variationInfo?.name
            || (item.sku ? `Sản phẩm (${item.sku})` : 'Sản phẩm không tên');
          const qty = item.quantity || 1;
          return `${name} x${qty}`;
        }).join(', ');
        setProducts(prodStr);
      }

      // ── Mapping tiền thu thực tế (moneyToCollect hoặc totalPrice) ──
      const amount = order.moneyToCollect || order.totalPrice || 0;
      if (amount > 0) {
        setActualAmount(String(amount));
      }
    }
  };

  const handleUploadSuccess = (urls: string[]) => {
    setImageUrls(urls);
    setStep(4);
  };

  // Validate Step 2 trước khi tiếp
  const canProceedStep2 = (): boolean => {
    if (!serialNumber) return false;
    if (needsTechnicalFields(workType)) {
      if (!waterSource || !tdsIn || !tdsOut || !waterPressure) return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await fetchApi('/reports', {
        method: 'POST',
        body: JSON.stringify({
          customerName,
          customerPhone,
          province,
          address,
          products: products ? [products] : [],
          serviceType,
          workType,
          serialNumber,
          distanceKm,
          actualAmount,
          waterSource: needsTechnicalFields(workType) ? waterSource : null,
          tdsIn: needsTechnicalFields(workType) ? tdsIn : null,
          tdsOut: needsTechnicalFields(workType) ? tdsOut : null,
          waterPressure: needsTechnicalFields(workType) ? waterPressure : null,
          spareParts: [],
          notes,
          imageUrls,
          orderId: selectedOrderId || undefined,
        })
      });
      navigate('/ktv/my-reports');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const totalSteps = 4;

  return (
    <div className="card max-w-2xl mx-auto animate-fade-in">
      <h2 className="font-bold text-2xl mb-6 text-center text-[#1B3A6B]">Báo Cáo Hoàn Thành Công Việc</h2>

      {/* Steps indicator */}
      <div className="flex justify-between mb-8 relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 transform -translate-y-1/2"></div>
        <div
          className="absolute top-1/2 left-0 h-1 bg-[#1B3A6B] -z-10 transform -translate-y-1/2 transition-all duration-300"
          style={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
        ></div>

        {[
          { num: 1, label: 'Thông tin' },
          { num: 2, label: 'Kỹ thuật' },
          { num: 3, label: 'Hình ảnh' },
          { num: 4, label: 'Xác nhận' },
        ].map(({ num, label }) => (
          <div key={num} className="flex flex-col items-center">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-200 ${
                step > num
                  ? 'bg-green-500 text-white'
                  : step === num
                  ? 'bg-[#1B3A6B] text-white ring-4 ring-blue-100'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {step > num ? <CheckCircle size={16} /> : num}
            </div>
            <span className={`text-xs mt-1 ${step >= num ? 'text-[#1B3A6B] font-medium' : 'text-gray-400'}`}>{label}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="alert alert-error flex items-center gap-2 mb-4">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ═══════════════════════════════════════════════ */}
        {/* Step 1: Thông tin chung */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-4 text-lg">1. Thông tin chung</h3>

            {/* Auto-fill từ đơn hàng */}
            <div className="form-group bg-blue-50/50 p-4 rounded-lg border border-blue-100 mb-6">
              <label className="form-label text-blue-800 font-semibold mb-2 flex items-center gap-2">
                📦 Điền tự động từ đơn hàng được giao
              </label>
              <select
                className="form-select bg-white border-blue-200 focus:border-blue-500 focus:ring-blue-500 text-sm"
                value={selectedOrderId}
                onChange={(e) => handleOrderSelect(e.target.value)}
              >
                <option value="">-- Tự nhập thông tin (Không chọn đơn) --</option>
                {orders.map(o => {
                  const name = o.billFullName || o.customer?.fullName || 'Khách';
                  const addr = o.shippingAddress?.province_name || o.customer?.provinceName || '';
                  return (
                    <option key={o.id} value={o.id}>
                      Đơn #{o.pancakeOrderId} - {name} {addr ? `(${addr})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Tên khách hàng *</label>
              <input type="text" className="form-input" value={customerName} onChange={e => setCustomerName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Số điện thoại *</label>
              <input type="tel" className="form-input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Địa chỉ chi tiết *</label>
              <input type="text" className="form-input" placeholder="Số nhà, đường, phường/xã..." value={address} onChange={e => setAddress(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Tỉnh / Thành phố *</label>
              <input type="text" className="form-input" value={province} onChange={e => setProvince(e.target.value)} required />
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', margin: '20px 0', paddingTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">Loại công việc *</label>
                <select className="form-select" value={workType} onChange={e => setWorkType(e.target.value)} required>
                  <option value="">Chọn loại công việc...</option>
                  {WORK_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Loại dịch vụ *</label>
                <select className="form-select" value={serviceType} onChange={e => setServiceType(e.target.value)} required>
                  <option value="">Chọn loại dịch vụ...</option>
                  {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tên sản phẩm thực tế x Số lượng SP</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="VD: UR5440 x1, Lõi lọc PGP x2"
                  value={products}
                  onChange={e => setProducts(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Có thể điều chỉnh theo thực tế</p>
              </div>
              <div className="form-group">
                <label className="form-label">Tiền thu thực tế (VNĐ)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Nhập số tiền thu được"
                  value={actualAmount}
                  onChange={e => setActualAmount(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">Có thể điều chỉnh theo thực tế</p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => setStep(2)}
              disabled={!customerName || !customerPhone || !province || !address || !workType || !serviceType}
            >
              Tiếp tục
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* Step 2: Trường kỹ thuật (dynamic theo workType) */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-2 text-lg">2. Thông tin kỹ thuật</h3>
            <p className="text-sm text-gray-500 mb-4">
              Loại công việc: <span className="font-semibold text-[#1B3A6B]">{workType}</span>
            </p>

            {/* Nguồn nước — cho tất cả trừ Giao hàng */}
            {needsTechnicalFields(workType) && (
              <>
                <div className="form-group">
                  <label className="form-label">Nguồn nước *</label>
                  <select className="form-select" value={waterSource} onChange={e => setWaterSource(e.target.value)} required>
                    <option value="">Chọn nguồn nước...</option>
                    {WATER_SOURCES.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">TDS đầu vào (ppm) *</label>
                    <input type="number" className="form-input" placeholder="Nhập số ppm" value={tdsIn} onChange={e => setTdsIn(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">TDS đầu ra (ppm) *</label>
                    <input type="number" className="form-input" placeholder="Nhập số ppm" value={tdsOut} onChange={e => setTdsOut(e.target.value)} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Áp suất nước đầu vào (psi) *</label>
                  <input type="number" className="form-input" placeholder="Nhập số psi thực tế" value={waterPressure} onChange={e => setWaterPressure(e.target.value)} required />
                </div>
                {/* Linh kiện phát sinh — placeholder, sẽ update sau */}
                {/*
                <div className="form-group">
                  <label className="form-label">Linh kiện phát sinh (nếu có)</label>
                  <p className="text-xs text-gray-400">Sẽ cập nhật danh sách sau</p>
                </div>
                */}
              </>
            )}

            {/* Seri sản phẩm — tất cả loại */}
            <div className="form-group">
              <label className="form-label">Seri sản phẩm *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Mẫu: 1858250822xxxxx"
                value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Khoảng cách di chuyển (km)</label>
              <input type="number" className="form-input" placeholder="Nhập khoảng cách" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} />
            </div>

            <div className="flex gap-4 mt-6">
              <button type="button" className="btn btn-outline flex-1 flex items-center justify-center gap-2" onClick={() => setStep(1)}>
                <ChevronLeft size={16} /> Quay lại
              </button>
              <button
                type="button"
                className="btn btn-primary flex-1"
                onClick={() => setStep(3)}
                disabled={!canProceedStep2()}
              >
                Tiếp tục
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* Step 3: Upload ảnh theo slot labels */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-2 text-lg">3. Hình ảnh xác nhận</h3>
            <p className="text-sm text-gray-500 mb-4">
              Loại: <span className="font-semibold text-[#1B3A6B]">{workType}</span> — Cần {getImageSlots(workType).length} ảnh
            </p>

            {imageUrls.length > 0 ? (
              <div className="mb-4">
                <div className="alert alert-success flex items-center gap-2">
                  <CheckCircle size={20} /> Đã upload {imageUrls.length} ảnh thành công!
                </div>
                <div className="flex gap-4 mt-4">
                  <button type="button" className="btn btn-outline flex-1 flex items-center justify-center gap-2" onClick={() => { setImageUrls([]); }}>
                    Upload lại
                  </button>
                  <button type="button" className="btn btn-primary flex-1" onClick={() => setStep(4)}>
                    Tiếp tục
                  </button>
                </div>
              </div>
            ) : (
              <>
                <LabeledImageUploader
                  imageSlots={getImageSlots(workType)}
                  onUploadSuccess={handleUploadSuccess}
                />
                <div className="mt-6 flex gap-4">
                  <button type="button" className="btn btn-outline flex-1 flex items-center justify-center gap-2" onClick={() => setStep(2)}>
                    <ChevronLeft size={16} /> Quay lại
                  </button>
                  <button type="button" className="btn btn-outline text-gray-500 flex-1" onClick={() => setStep(4)}>
                    Bỏ qua ảnh
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* Step 4: Ghi chú & Submit */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 4 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-4 text-lg">4. Xác nhận & Ghi chú</h3>

            {/* Tóm tắt thông tin */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm space-y-2">
              <h4 className="font-semibold text-[#1B3A6B] mb-2">Tóm tắt báo cáo</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-gray-500">Khách hàng:</span>
                <span className="font-medium">{customerName}</span>
                <span className="text-gray-500">SĐT:</span>
                <span className="font-medium">{customerPhone}</span>
                <span className="text-gray-500">Địa chỉ:</span>
                <span className="font-medium">{address}, {province}</span>
                <span className="text-gray-500">Loại công việc:</span>
                <span className="font-medium">{workType}</span>
                <span className="text-gray-500">Loại dịch vụ:</span>
                <span className="font-medium">{serviceType}</span>
                {products && (
                  <>
                    <span className="text-gray-500">Sản phẩm:</span>
                    <span className="font-medium">{products}</span>
                  </>
                )}
                <span className="text-gray-500">Seri SP:</span>
                <span className="font-medium">{serialNumber}</span>
                {needsTechnicalFields(workType) && (
                  <>
                    <span className="text-gray-500">Nguồn nước:</span>
                    <span className="font-medium">{waterSource}</span>
                    <span className="text-gray-500">TDS vào/ra:</span>
                    <span className="font-medium">{tdsIn} / {tdsOut} ppm</span>
                    <span className="text-gray-500">Áp suất:</span>
                    <span className="font-medium">{waterPressure} psi</span>
                  </>
                )}
                {distanceKm && (
                  <>
                    <span className="text-gray-500">Khoảng cách:</span>
                    <span className="font-medium">{distanceKm} km</span>
                  </>
                )}
                {actualAmount && (
                  <>
                    <span className="text-gray-500">Tiền thu thực tế:</span>
                    <span className="font-medium">{Number(actualAmount).toLocaleString('vi-VN')} VNĐ</span>
                  </>
                )}
                <span className="text-gray-500">Số ảnh:</span>
                <span className="font-medium">{imageUrls.length} ảnh</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">KTV ghi chú (nếu có)</label>
              <textarea className="form-textarea" rows={3} placeholder="Ghi chú thêm..." value={notes} onChange={e => setNotes(e.target.value)}></textarea>
            </div>

            <div className="flex gap-4 mt-8">
              <button type="button" className="btn btn-outline flex-1 flex items-center justify-center gap-2" onClick={() => setStep(3)}>
                <ChevronLeft size={16} /> Quay lại
              </button>
              <button type="submit" className="btn btn-primary flex-1 flex justify-center items-center gap-2" disabled={loading}>
                {loading ? <span className="spinner"></span> : <><Send size={16} /> Hoàn thành công việc</>}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
