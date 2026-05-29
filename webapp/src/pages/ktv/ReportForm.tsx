import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi, getOrders } from '../../api/client';
import LabeledImageUploader from '../../components/LabeledImageUploader';
import { CheckCircle, ChevronLeft, Send, AlertCircle, Camera, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

import { getImageSlots, WARRANTY_SERVICE_GROUPS, REPAIR_SERVICE_GROUPS } from '../../utils/workTypes';

// ── Cấu trúc linh kiện phân loại theo dòng máy ──
const SPARE_PARTS_GROUPS = [
  {
    name: 'Linh kiện chung / Khác',
    parts: ['Bơm tăng áp', 'Van giảm áp', 'Van chia']
  },
  {
    name: 'Dòng máy UR3626',
    parts: [
      'Cụm van (2) Truliva UR3626',
      'Bơm RO Truliva UR3626',
      'Mạch điều khiển Truliva UR3626',
      'Mạch đèn Truliva UR3626',
      'Biến áp Truliva UR3626',
      'Bộ vòi Truliva UR3626/UR5640/UR5440'
    ]
  },
  {
    name: 'Dòng máy UR5676',
    parts: [
      'Cụm van Truliva UR5676/UR5640/UR5440',
      'Bơm RO Truliva UR5676/UR5640',
      'Mạch điều khiển Truliva UR5676/UR5640/UR5440',
      'Mạch đèn Truliva UR5676',
      'Biến áp Truliva UR5676/UR5640/UR5440',
      'Cảm biến TDS Truliva UR5676/UR61096H',
      'Bộ vòi điện tử Truliva UR5676/UR5840'
    ]
  },
  {
    name: 'Dòng máy UR5840',
    parts: [
      'Cụm van Truliva UR5840',
      'Bơm RO Truliva UR5840',
      'Mạch điều khiển Truliva UR5840',
      'Mạch đèn Truliva UR5840',
      'Biến áp Truliva UR5840',
      'Cảm biến TDS Truliva UR5840',
      'Bộ vòi điện tử Truliva UR5676/UR5840'
    ]
  },
  {
    name: 'Dòng máy UR61096H',
    parts: [
      'Cụm van Truliva UR61096H',
      'Bơm RO Truliva UR61096H',
      'Mạch điều khiển Truliva UR61096H',
      'Mạch đèn Truliva UR61096H',
      'Biến áp Truliva UR61096H',
      'Bộ vòi điện tử Truliva UR61096H',
      'Cảm biến TDS Truliva UR5676/UR61096H'
    ]
  },
  {
    name: 'Dòng máy W6412',
    parts: [
      'Khay hứng nước Truliva W6412',
      'Nắp khay hứng nước Truliva W6412',
      'Ống silicon Truliva W6412',
      'Vỏ trước Truliva W6412',
      'Bộ gia nhiệt Truliva W6412',
      'Mạch điều khiển Truliva W6412',
      'Van điện từ nước vào Truliva W6412',
      'Mạch màn hình Truliva W6412',
      'Túi đá điện tử Truliva W6412',
      'Bơm đường nước lạnh Truliva W6412',
      'Bơm đường nước nóng Truliva W6412',
      'Bình chứa Truliva W6412'
    ]
  }
];

// ── Nguồn nước options ──
const WATER_SOURCES = [
  'Nước máy trực tiếp',
  'Nước máy bồn',
  'Nước giếng',
  'Nước mưa',
];

// ── Nguyên nhân sự cố và Cách xử lý options ──
const ISSUE_TYPES = [
  'Rò rỉ nước',
  'Lỗi nguồn / Mạch điện',
  'Nước không nóng',
  'Nước không lạnh',
  'Bơm kêu to / Không hoạt động',
  'Chất lượng nước đầu ra không đạt (TDS cao)',
  'Khác (Nhập chi tiết phía dưới)',
];

const HANDLING_METHODS = [
  'Thay thế linh kiện phát sinh',
  'Sửa chữa mạch / Đường nước',
  'Căn chỉnh áp suất / Vệ sinh máy',
  'Hướng dẫn khách hàng sử dụng',
  'Khác (Nhập chi tiết phía dưới)',
];

// ── Kiểm tra workType có cần trường kỹ thuật không ──
function needsTechnicalFields(workType: string): boolean {
  return ['Thay lọc', 'Lắp đặt', 'Giao hàng và Lắp đặt', 'Bảo hành', 'Sửa chữa'].includes(workType);
}

// ── Kiểm tra workType có cần linh kiện phát sinh không ──
function needsSpareParts(workType: string): boolean {
  return ['Thay lọc', 'Bảo hành', 'Sửa chữa', 'Lắp đặt', 'Giao hàng và Lắp đặt'].includes(workType);
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
  const [orderNote, setOrderNote] = useState('');

  // ── Step 2: Trường kỹ thuật (dynamic) ──
  const [serialNumber, setSerialNumber] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [tdsIn, setTdsIn] = useState('');
  const [tdsOut, setTdsOut] = useState('');
  const [waterPressure, setWaterPressure] = useState('');
  const [spareParts, setSpareParts] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Linh kiện chung / Khác']);
  const [issueType, setIssueType] = useState('');
  const [customIssueType, setCustomIssueType] = useState('');
  const [handlingMethod, setHandlingMethod] = useState('');
  const [customHandlingMethod, setCustomHandlingMethod] = useState('');

  // ── Thống kê kiểm tra Serial ──
  const [serialChecking, setSerialChecking] = useState(false);
  const [serialInfo, setSerialInfo] = useState<any>(null);
  const [serialWarning, setSerialWarning] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  // ── Step 3: Ảnh ──
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  // ── Step 4: Ghi chú & Submit ──
  const [notes, setNotes] = useState('');

  // Định dạng hiển thị Số Serial dạng: XXXX XXX XXX XXXXX
  const formatSerialNumber = (value: string): string => {
    const clean = value.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
    let formatted = '';
    if (clean.length > 0) {
      formatted += clean.substring(0, 4);
    }
    if (clean.length > 4) {
      formatted += ' ' + clean.substring(4, 7);
    }
    if (clean.length > 7) {
      formatted += ' ' + clean.substring(7, 10);
    }
    if (clean.length > 10) {
      formatted += ' ' + clean.substring(10, 15);
    }
    return formatted.trim();
  };

  const checkSerial = async (serial: string) => {
    const clean = serial.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length < 5) {
      setSerialInfo(null);
      setSerialWarning('');
      return;
    }

    setSerialChecking(true);
    setSerialWarning('');
    try {
      const res = await fetchApi(`/reports/check-serial?serialNumber=${encodeURIComponent(clean)}`);
      if (res && res.exists) {
        setSerialInfo(res);
        setSerialWarning('');
        if (res.products && res.products.length > 0 && !products) {
          const matchedProd = res.products[0].split('x')[0].trim();
          setProducts(matchedProd);
        }
      } else {
        setSerialInfo(null);
        if (['Bảo hành', 'Sửa chữa'].includes(workType)) {
          setSerialWarning('⚠️ Số Serial này chưa được ghi nhận lắp đặt trong hệ thống. Vui lòng kiểm tra kỹ lại tem máy xem có gõ sai không.');
        }
      }
    } catch (err) {
      console.error('Lỗi kiểm tra Serial', err);
    } finally {
      setSerialChecking(false);
    }
  };

  // Quét mã vạch Camera Effect
  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    if (showScanner) {
      html5QrCode = new Html5Qrcode("reader");
      html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 100 }
        },
        (decodedText) => {
          const formatted = formatSerialNumber(decodedText);
          setSerialNumber(formatted);
          checkSerial(formatted);
          setShowScanner(false);
          if (html5QrCode) {
            html5QrCode.stop().catch(err => console.error("Lỗi đóng camera quét", err));
          }
        },
        () => {}
      ).catch(err => {
        console.error("Lỗi khởi chạy camera", err);
      });
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Lỗi đóng camera quét dọn dẹp", err));
      }
    };
  }, [showScanner]);

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
      setOrderNote('');
      return;
    }
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setCustomerName(order.billFullName || order.customer?.fullName || '');
      setCustomerPhone(order.billPhoneNumber || order.customer?.phoneNumber || '');
      setProvince(order.shippingAddress?.province_name || order.customer?.provinceName || '');
      const fullAddr = order.shippingAddress?.full_address || order.customer?.fullAddress || '';
      setAddress(fullAddr);
      if (order.workType) {
        setWorkType(order.workType);
        const noServiceTypes = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'];
        if (noServiceTypes.includes(order.workType) && !order.serviceType) {
          setServiceType('Công việc đã bao gồm dịch vụ');
        } else {
          setServiceType(order.serviceType || '');
        }
      } else {
        setServiceType(order.serviceType || '');
      }

      // ── Mapping sản phẩm x số lượng từ items ──
      let prodStr = '';
      if (order.items && order.items.length > 0) {
        prodStr = order.items.map((item: any) => {
          // Lấy tên đầy đủ nhất có thể
          const name = item.productName
            || item.variationInfo?.name
            || (item.sku ? `Sản phẩm (${item.sku})` : 'Sản phẩm không tên');
          const qty = item.quantity || 1;
          return `${name} x${qty}`;
        }).join(', ');
        setProducts(prodStr);
      }

      // Tự động mở rộng nhóm linh kiện tương ứng dựa trên tên dòng máy
      const matchingGroups: string[] = ['Linh kiện chung / Khác'];
      const pStrLower = prodStr.toLowerCase();
      if (pStrLower.includes('3626')) matchingGroups.push('Dòng máy UR3626');
      if (pStrLower.includes('5676') || pStrLower.includes('5640') || pStrLower.includes('5440')) matchingGroups.push('Dòng máy UR5676');
      if (pStrLower.includes('5840')) matchingGroups.push('Dòng máy UR5840');
      if (pStrLower.includes('61096')) matchingGroups.push('Dòng máy UR61096H');
      if (pStrLower.includes('6412') || pStrLower.includes('w6412')) matchingGroups.push('Dòng máy W6412');
      setExpandedGroups(matchingGroups);

      // ── Mapping tiền thu thực tế (moneyToCollect hoặc totalPrice) ──
      const amount = order.moneyToCollect || order.totalPrice || 0;
      if (amount > 0) {
        setActualAmount(String(amount));
      }
      setOrderNote(order.note || '');
    }
  };

  const handleUploadSuccess = (urls: string[]) => {
    setImageUrls(urls);
    setStep(3);
  };

  // Validate Step 1 trước khi tiếp
  const canProceedStep1 = (): boolean => {
    if (!serialNumber) return false;
    if (needsTechnicalFields(workType)) {
      if (!waterSource || !tdsIn || !tdsOut || !waterPressure) return false;
    }
    if (['Bảo hành', 'Sửa chữa'].includes(workType)) {
      if (!issueType) return false;
      if (issueType === 'Khác (Nhập chi tiết phía dưới)' && !customIssueType) return false;
      if (!handlingMethod) return false;
      if (handlingMethod === 'Khác (Nhập chi tiết phía dưới)' && !customHandlingMethod) return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const finalIssueType = ['Bảo hành', 'Sửa chữa'].includes(workType)
      ? (issueType === 'Khác (Nhập chi tiết phía dưới)' ? customIssueType : issueType)
      : null;

    const finalHandlingMethod = ['Bảo hành', 'Sửa chữa'].includes(workType)
      ? (handlingMethod === 'Khác (Nhập chi tiết phía dưới)' ? customHandlingMethod : handlingMethod)
      : null;

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
          spareParts: needsSpareParts(workType) ? spareParts : [],
          issueType: finalIssueType,
          handlingMethod: finalHandlingMethod,
          notes,
          imageUrls,
          orderId: selectedOrderId,
        })
      });
      navigate('/ktv/my-reports');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const totalSteps = 3;

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
          { num: 1, label: 'Thông tin & Kỹ thuật' },
          { num: 2, label: 'Hình ảnh' },
          { num: 3, label: 'Xác nhận' },
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
        {/* Step 1: Thông tin chung & Kỹ thuật */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-4 text-lg">1. Thông tin chung & Kỹ thuật</h3>

            {/* Auto-fill từ đơn hàng */}
            <div className="form-group bg-blue-50/50 p-4 rounded-lg border border-blue-100 mb-6">
              <label className="form-label text-blue-800 font-semibold mb-2 flex items-center gap-2">
                📦 Chọn đơn hàng để báo cáo *
              </label>
              <select
                className="form-select bg-white border-blue-200 focus:border-blue-500 focus:ring-blue-500 text-sm"
                value={selectedOrderId}
                onChange={(e) => handleOrderSelect(e.target.value)}
                required
              >
                <option value="">-- Vui lòng chọn đơn hàng --</option>
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
              {!selectedOrderId && (
                <p className="text-xs text-red-500 mt-1">⚠ Bắt buộc phải chọn đơn hàng để Admin có thể tracking.</p>
              )}
            </div>

            {/* Khung thông tin tự động mapping */}
            {selectedOrderId && (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px 16px',
                fontSize: '13px'
              }}>
                <div style={{ gridColumn: 'span 2', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', marginBottom: '4px', fontWeight: 700, color: '#1e293b' }}>
                  📋 Thông tin khách hàng & công việc
                </div>
                
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Khách hàng</span>
                  <strong style={{ color: '#0f172a' }}>{customerName || 'N/A'}</strong>
                </div>

                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Số điện thoại</span>
                  <strong style={{ color: '#0f172a' }}>{customerPhone || 'N/A'}</strong>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Địa chỉ</span>
                  <strong style={{ color: '#0f172a' }}>{address || 'N/A'} {province ? `(${province})` : ''}</strong>
                </div>

                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Loại công việc</span>
                  <div>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      marginTop: '2px'
                    }}>{workType || 'N/A'}</span>
                  </div>
                </div>

                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Dịch vụ</span>
                  <strong style={{ color: '#0f172a' }}>{serviceType || 'N/A'}</strong>
                </div>

                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Sản phẩm thực tế</span>
                  <strong style={{ color: '#0f172a' }}>{products || 'N/A'}</strong>
                </div>

                {actualAmount && (
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Tiền thu thực tế</span>
                    <strong style={{ color: '#e11d48' }}>{Number(actualAmount).toLocaleString('vi-VN')} VNĐ</strong>
                  </div>
                )}
              </div>
            )}

            {orderNote && (
              <div className="form-group bg-amber-50/70 p-3.5 rounded-lg border border-amber-200 mb-4">
                <label className="form-label text-amber-800 font-bold mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                  📝 Ghi chú đơn hàng (Từ Admin/Pancake)
                </label>
                <div className="text-gray-700 text-[13px] whitespace-pre-wrap font-medium">{orderNote}</div>
              </div>
            )}

            {/* Nhập thông tin kỹ thuật */}
            {selectedOrderId && (
              <div style={{ borderTop: '1px solid #e2e8f0', margin: '20px 0', paddingTop: '16px' }}>
                <h3 className="font-bold mb-4 text-md text-[#1B3A6B]">🛠️ Nhập thông tin kỹ thuật</h3>
                
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
                    {/* Linh kiện phát sinh */}
                    {needsSpareParts(workType) && (
                      <div className="form-group">
                        <label className="form-label">Linh kiện phát sinh (nếu có)</label>
                        <div className="flex flex-col gap-2">
                          {SPARE_PARTS_GROUPS.map((group) => {
                            const isExpanded = expandedGroups.includes(group.name);
                            const selectedCount = spareParts.filter(p => group.parts.includes(p)).length;
                            
                            return (
                              <div key={group.name} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xs">
                                {/* Group Header */}
                                <button
                                  type="button"
                                  className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between transition-colors border-b border-gray-150"
                                  onClick={() => {
                                    if (isExpanded) {
                                      setExpandedGroups(expandedGroups.filter(g => g !== group.name));
                                    } else {
                                      setExpandedGroups([...expandedGroups, group.name]);
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-[13px] text-gray-800">{group.name}</span>
                                    {selectedCount > 0 && (
                                      <span className="px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-full">
                                        Đã chọn {selectedCount}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-400">
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </div>
                                </button>

                                {/* Group Body (Parts Checklist) */}
                                {isExpanded && (
                                  <div className="p-3 bg-white flex flex-col gap-2 max-h-[180px] overflow-y-auto animate-fade-in">
                                    {group.parts.map((part) => (
                                      <label key={part} className="flex items-center gap-2.5 py-1 text-[13px] text-gray-700 cursor-pointer hover:text-gray-900 select-none">
                                        <input
                                          type="checkbox"
                                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                          checked={spareParts.includes(part)}
                                          onChange={e => {
                                            if (e.target.checked) {
                                              setSpareParts([...spareParts, part]);
                                            } else {
                                              setSpareParts(spareParts.filter(p => p !== part));
                                            }
                                          }}
                                        />
                                        <span>{part}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {spareParts.length > 0 && (
                          <p className="text-xs text-blue-600 mt-2.5 font-semibold flex items-center gap-1">
                            <CheckCircle size={14} className="text-emerald-500" /> Tổng cộng đã chọn {spareParts.length} linh kiện
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Nguyên nhân sự cố và Cách xử lý — chỉ dành cho Bảo hành / Sửa chữa */}
                {['Bảo hành', 'Sửa chữa'].includes(workType) && (
                  <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: '16px', paddingTop: '16px' }}>
                    <div className="form-group">
                      <label className="form-label">Nguyên nhân / Loại sự cố *</label>
                      <select 
                        className="form-select" 
                        value={issueType} 
                        onChange={e => {
                          setIssueType(e.target.value);
                          if (e.target.value !== 'Khác (Nhập chi tiết phía dưới)') {
                            setCustomIssueType('');
                          }
                        }} 
                        required
                      >
                        <option value="">-- Chọn Nguyên nhân / Loại sự cố --</option>
                        {ISSUE_TYPES.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </div>
                    {issueType === 'Khác (Nhập chi tiết phía dưới)' && (
                      <div className="form-group">
                        <label className="form-label">Chi tiết nguyên nhân sự cố *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Mô tả nguyên nhân lỗi..." 
                          value={customIssueType} 
                          onChange={e => setCustomIssueType(e.target.value)} 
                          required 
                        />
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">Cách xử lý của KTV *</label>
                      <select 
                        className="form-select" 
                        value={handlingMethod} 
                        onChange={e => {
                          setHandlingMethod(e.target.value);
                          if (e.target.value !== 'Khác (Nhập chi tiết phía dưới)') {
                            setCustomHandlingMethod('');
                          }
                        }} 
                        required
                      >
                        <option value="">-- Chọn Cách xử lý --</option>
                        {HANDLING_METHODS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    {handlingMethod === 'Khác (Nhập chi tiết phía dưới)' && (
                      <div className="form-group">
                        <label className="form-label">Chi tiết cách xử lý *</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Mô tả cách xử lý lỗi..." 
                          value={customHandlingMethod} 
                          onChange={e => setCustomHandlingMethod(e.target.value)} 
                          required 
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Seri sản phẩm — tất cả loại */}
                <div className="form-group" style={{ borderTop: ['Bảo hành', 'Sửa chữa'].includes(workType) ? 'none' : '1px dashed #cbd5e1', marginTop: ['Bảo hành', 'Sửa chữa'].includes(workType) ? '0' : '16px', paddingTop: ['Bảo hành', 'Sửa chữa'].includes(workType) ? '0' : '16px' }}>
                  <label className="form-label flex justify-between items-center">
                    <span>Seri sản phẩm *</span>
                    <button
                      type="button"
                      className="text-blue-600 hover:text-blue-700 text-xs font-semibold flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 transition-colors"
                      onClick={() => setShowScanner(true)}
                    >
                      <Camera size={13} /> Quét mã vạch
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className={`form-input pr-10 font-mono tracking-wider ${serialWarning ? 'border-amber-400 bg-amber-50/20' : ''}`}
                      placeholder="Mẫu: 1858 260 207 00059"
                      value={serialNumber}
                      onChange={e => {
                        const formatted = formatSerialNumber(e.target.value);
                        setSerialNumber(formatted);
                        const clean = formatted.replace(/[^a-zA-Z0-9]/g, '');
                        if (clean.length === 15) {
                          checkSerial(formatted);
                        } else {
                          setSerialInfo(null);
                          setSerialWarning('');
                        }
                      }}
                      onBlur={() => checkSerial(serialNumber)}
                      required
                    />
                    {serialChecking && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-500 animate-spin">
                        <Loader2 size={16} />
                      </div>
                    )}
                  </div>

                  {serialWarning && (
                    <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-lg flex items-start gap-1.5 leading-normal">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      <span>{serialWarning}</span>
                    </div>
                  )}

                  {serialInfo && (
                    <div className="mt-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg leading-normal shadow-xs">
                      <div className="font-bold flex items-center gap-1 mb-1">
                        <CheckCircle size={14} /> Đã khớp thiết bị lắp đặt gốc:
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-emerald-800">
                        <li>Dòng máy: <strong>{serialInfo.products?.join(', ') || 'Chưa rõ'}</strong></li>
                        <li>Khách hàng gốc: <strong>{serialInfo.customerName || 'Chưa rõ'}</strong></li>
                        <li>Ngày lắp đặt: <strong>{new Date(serialInfo.installDate).toLocaleDateString('vi-VN')}</strong></li>
                      </ul>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Khoảng cách di chuyển (km)</label>
                  <input type="number" className="form-input" placeholder="Nhập khoảng cách" value={distanceKm} onChange={e => setDistanceKm(e.target.value)} />
                </div>
                
                <button
                  type="button"
                  className="btn btn-primary w-full mt-6"
                  onClick={() => setStep(2)}
                  disabled={!selectedOrderId || !customerName || !customerPhone || !workType || !canProceedStep1()}
                >
                  Tiếp tục
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* Step 2: Upload ảnh theo slot labels */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-2 text-lg">2. Hình ảnh xác nhận</h3>
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
                  <button type="button" className="btn btn-primary flex-1" onClick={() => setStep(3)}>
                    Tiếp tục
                  </button>
                </div>
              </div>
            ) : (
              <>
                <LabeledImageUploader
                  imageSlots={getImageSlots(workType)}
                  workType={workType}
                  onUploadSuccess={handleUploadSuccess}
                />
                <div className="mt-6 flex gap-4">
                  <button type="button" className="btn btn-outline flex-1 flex items-center justify-center gap-2" onClick={() => setStep(1)}>
                    <ChevronLeft size={16} /> Quay lại
                  </button>
                  <button type="button" className="btn btn-outline text-gray-500 flex-1" onClick={() => setStep(3)}>
                    Bỏ qua ảnh
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════ */}
        {/* Step 3: Ghi chú & Submit */}
        {/* ═══════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h3 className="font-bold mb-4 text-lg">3. Xác nhận & Ghi chú</h3>

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
                {['Bảo hành', 'Sửa chữa'].includes(workType) && (
                  <>
                    <span className="text-gray-500">Nguyên nhân sự cố:</span>
                    <span className="font-medium">
                      {issueType === 'Khác (Nhập chi tiết phía dưới)' ? customIssueType : issueType}
                    </span>
                    <span className="text-gray-500">Cách xử lý:</span>
                    <span className="font-medium">
                      {handlingMethod === 'Khác (Nhập chi tiết phía dưới)' ? customHandlingMethod : handlingMethod}
                    </span>
                  </>
                )}
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
              <button type="button" className="btn btn-outline flex-1 flex items-center justify-center gap-2" onClick={() => setStep(2)}>
                <ChevronLeft size={16} /> Quay lại
              </button>
              <button type="submit" className="btn btn-primary flex-1 flex justify-center items-center gap-2" disabled={loading}>
                {loading ? <span className="spinner"></span> : <><Send size={16} /> Hoàn thành công việc</>}
              </button>
            </div>
          </div>
        )}

        {/* Modal Quét Mã Vạch */}
        {showScanner && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            onClick={() => setShowScanner(false)}
          >
            <div 
              className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-gray-800 text-sm">Quét mã vạch sản phẩm</h3>
                <button 
                  type="button" 
                  className="text-gray-400 hover:text-gray-600 text-xs font-bold"
                  onClick={() => setShowScanner(false)}
                >
                  Đóng
                </button>
              </div>
              <div className="p-4 flex flex-col items-center justify-center bg-white">
                <div 
                  id="reader" 
                  className="w-full bg-black rounded-lg overflow-hidden border border-gray-100"
                  style={{ minHeight: '220px' }}
                ></div>
                <p className="text-[11px] text-gray-500 mt-3 text-center leading-relaxed">
                  Đưa camera điện thoại song song và căn chỉnh mã vạch vào ô quét hình chữ nhật.
                </p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
