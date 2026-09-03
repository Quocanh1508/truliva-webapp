import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  Phone, 
  User, 
  FileText, 
  CreditCard, 
  Truck, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ChevronRight,
  QrCode,
  Banknote
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { fetchZaloApi } from '../../api/client';
import LegalPagesModal, { LegalDocType } from '../../components/LegalPagesModal';

interface CheckoutPageProps {
  user: any;
  voucherCode?: string;
  onBack: () => void;
  onOrderSuccess: (orderData: any, vietQrInfo?: any) => void;
}

export default function CheckoutPage({ user, voucherCode, onBack, onOrderSuccess }: CheckoutPageProps) {
  const { cartItems, totalAmount, clearCart } = useCart();

  // Form State
  const [customerName, setCustomerName] = useState(user?.fullName || user?.name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phoneNumber || '');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('Hồ Chí Minh');
  const [district, setDistrict] = useState('');
  const [ward, setWard] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'VIETQR'>('COD');

  // Legal Consent Checkbox State (BẮT BUỘC THEO LUẬT TMĐT 2025)
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [privacyAccepted, setPrivacyAccepted] = useState(true);

  // Legal Modal
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalDocType, setLegalDocType] = useState<LegalDocType>('TERMS');

  // Loading & Error
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      if (user.fullName || user.name) setCustomerName(user.fullName || user.name);
      if (user.phoneNumber) setCustomerPhone(user.phoneNumber);
    }
  }, [user]);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  let discountAmount = 0;
  if (voucherCode === 'TRULIVA500' && totalAmount >= 10000000) discountAmount = 500000;
  else if (voucherCode === 'GIAM100K' && totalAmount >= 1000000) discountAmount = 100000;

  const shippingFee = 0; // Miễn phí 100%
  const finalAmount = Math.max(0, totalAmount - discountAmount + shippingFee);

  const handleOpenLegalDoc = (type: LegalDocType) => {
    setLegalDocType(type);
    setShowLegalModal(true);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      setErrorMsg('Vui lòng nhập Họ và tên người nhận hàng');
      return;
    }
    if (!customerPhone.trim() || customerPhone.trim().length < 9) {
      setErrorMsg('Vui lòng nhập Số điện thoại liên hệ hợp lệ');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('Vui lòng nhập Địa chỉ giao hàng chi tiết (Số nhà, tên đường)');
      return;
    }

    if (!termsAccepted || !privacyAccepted) {
      setErrorMsg('Quý khách vui lòng đồng ý với Điều khoản giao dịch và Chính sách bảo mật');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);

    try {
      const payload = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        address: address.trim(),
        province: province.trim(),
        district: district.trim(),
        ward: ward.trim(),
        note: note.trim(),
        voucherCode: voucherCode || null,
        paymentMethod,
        consents: {
          termsAccepted: true,
          privacyAccepted: true
        },
        items: cartItems.map(item => ({
          productId: item.productId,
          productName: item.name,
          quantity: item.quantity
        }))
      };

      const res = await fetchZaloApi('/zalo-miniapp/shop/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        clearCart();
        onOrderSuccess(res.order, res.vietQrInfo);
      } else {
        throw new Error(res?.error || 'Không thể tạo đơn hàng. Vui lòng thử lại.');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setErrorMsg(err.message || 'Đã xảy ra lỗi khi gửi đơn hàng');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 font-sans text-gray-800 animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-gray-100 flex items-center justify-between shadow-2xs">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-sm text-gray-900">
          Xác Nhận & Đặt Hàng
        </h1>
        <div className="w-9"></div>
      </div>

      <form onSubmit={handlePlaceOrder} className="p-4 space-y-4">
        {/* Customer Information Card */}
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <User className="w-4 h-4 text-[#1B3A6B]" />
            <h2 className="font-bold text-xs text-gray-900 uppercase tracking-wider">
              Thông Tin Người Nhận
            </h2>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-gray-600 mb-1">Họ và tên *</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Nguyễn Văn A"
                required
                className="w-full h-10 px-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-600 mb-1">Số điện thoại nhận hàng *</label>
              <input
                type="tel"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="0912 345 678"
                required
                className="w-full h-10 px-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
              />
            </div>

            <div>
              <label className="block font-semibold text-gray-600 mb-1">Địa chỉ chi tiết (Số nhà, tên đường) *</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Số 107/52/19 Nguyễn Văn Khối..."
                required
                className="w-full h-10 px-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Tỉnh / Thành phố</label>
                <input
                  type="text"
                  value={province}
                  onChange={e => setProvince(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Quận / Huyện</label>
                <input
                  type="text"
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  placeholder="Quận Gò Vấp"
                  className="w-full h-10 px-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-gray-600 mb-1">Ghi chú cho Kỹ thuật viên (Khung giờ lắp, vị trí lắp...)</label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Lắp đặt dưới gầm bồn rửa bát..."
                className="w-full h-10 px-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
              />
            </div>
          </div>
        </div>

        {/* Payment Method Selector Card */}
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <CreditCard className="w-4 h-4 text-[#1B3A6B]" />
            <h2 className="font-bold text-xs text-gray-900 uppercase tracking-wider">
              Phương Thức Thanh Toán
            </h2>
          </div>

          <div className="space-y-2 text-xs">
            {/* COD Option */}
            <label
              onClick={() => setPaymentMethod('COD')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                paymentMethod === 'COD'
                  ? 'bg-blue-50/70 border-[#1B3A6B] text-[#1B3A6B]'
                  : 'bg-gray-50/50 border-gray-200 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">Thanh toán khi nhận hàng & lắp đặt (COD)</div>
                  <div className="text-[11px] text-gray-500">KTV lắp đặt xong, nghiệm thu chất lượng nước mới thu tiền</div>
                </div>
              </div>
              <input
                type="radio"
                name="paymentMethod"
                checked={paymentMethod === 'COD'}
                onChange={() => setPaymentMethod('COD')}
                className="w-4 h-4 text-[#1B3A6B]"
              />
            </label>

            {/* VietQR Option */}
            <label
              onClick={() => setPaymentMethod('VIETQR')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition ${
                paymentMethod === 'VIETQR'
                  ? 'bg-blue-50/70 border-[#1B3A6B] text-[#1B3A6B]'
                  : 'bg-gray-50/50 border-gray-200 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-xs">Chuyển khoản ngân hàng VietQR</div>
                  <div className="text-[11px] text-gray-500">Quét mã QR tự động qua mọi ứng dụng ngân hàng</div>
                </div>
              </div>
              <input
                type="radio"
                name="paymentMethod"
                checked={paymentMethod === 'VIETQR'}
                onChange={() => setPaymentMethod('VIETQR')}
                className="w-4 h-4 text-[#1B3A6B]"
              />
            </label>
          </div>
        </div>

        {/* Order Items Preview Card */}
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-xs">
            <span className="font-bold text-gray-900 uppercase tracking-wider">
              Danh Sách Món Hàng ({cartItems.length})
            </span>
            <span className="text-gray-400 font-semibold">Miễn phí giao lắp</span>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {cartItems.map(item => (
              <div key={item.productId} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span className="font-bold text-gray-800 line-clamp-1">{item.name}</span>
                  <span className="text-gray-400 shrink-0">x{item.quantity}</span>
                </div>
                <span className="font-bold text-gray-900 shrink-0">
                  {formatVND(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-500">
              <span>Tạm tính:</span>
              <span className="font-semibold text-gray-800">{formatVND(totalAmount)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Giảm giá ({voucherCode}):</span>
                <span>-{formatVND(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500">
              <span>Vận chuyển & Lắp đặt:</span>
              <span className="text-emerald-600 font-bold">0đ (Miễn phí)</span>
            </div>
            <div className="pt-2 border-t border-gray-100 flex justify-between items-baseline">
              <span className="font-extrabold text-gray-900 text-sm">Tổng thanh toán:</span>
              <span className="font-black text-rose-600 text-lg">{formatVND(finalAmount)}</span>
            </div>
          </div>
        </div>

        {/* ⚖️ LEGAL COMPLIANCE CONSENT BOX (LUẬT TMĐT 2025 & NGHỊ ĐỊNH 248/2026/NĐ-CP) */}
        <div className="bg-blue-50/70 p-4 rounded-3xl border border-blue-200/80 shadow-xs space-y-2.5 text-xs text-gray-700">
          <div className="flex items-center gap-2 text-[#1B3A6B] font-bold pb-1 border-b border-blue-200/60">
            <ShieldCheck className="w-4 h-4 text-[#1B3A6B]" />
            <span>Cam Kết Pháp Lý & Bảo Vệ Quyền Lợi Khách Hàng</span>
          </div>

          {/* Checkbox 1: Điều khoản giao dịch */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={e => setTermsAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-[#1B3A6B] focus:ring-[#00A3FF]"
            />
            <span className="text-[11px] leading-relaxed">
              Tôi đã đọc, hiểu rõ và đồng ý với{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); handleOpenLegalDoc('TERMS'); }}
                className="font-bold text-[#1B3A6B] underline hover:text-blue-800"
              >
                Điều khoản giao dịch mua bán hàng hóa
              </button>{' '}
              của Truliva.
            </span>
          </label>

          {/* Checkbox 2: Chính sách bảo mật */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={e => setPrivacyAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-[#1B3A6B] focus:ring-[#00A3FF]"
            />
            <span className="text-[11px] leading-relaxed">
              Tôi xác nhận đồng ý cho Truliva thu thập và xử lý thông tin giao hàng theo{' '}
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); handleOpenLegalDoc('PRIVACY'); }}
                className="font-bold text-[#1B3A6B] underline hover:text-blue-800"
              >
                Chính sách bảo mật dữ liệu cá nhân
              </button>.
            </span>
          </label>

          <div className="pt-1 text-[10px] text-gray-500 italic">
            * Bằng việc nhấn "Xác nhận Đặt hàng", Quý khách giao kết hợp đồng điện tử theo quy định tại Luật TMĐT 2025 và Nghị định 248/2026/NĐ-CP.
          </div>
        </div>

        {/* Error Notice */}
        {errorMsg && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Sticky Submit Button */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 shadow-2xl flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] text-gray-400 font-medium">Tổng tiền:</div>
            <div className="text-base font-black text-rose-600 leading-tight">
              {formatVND(finalAmount)}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !termsAccepted || !privacyAccepted}
            className={`h-11 px-6 rounded-xl font-extrabold text-xs flex items-center gap-2 transition shadow-md ${
              submitting || !termsAccepted || !privacyAccepted
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#1B3A6B] to-[#00A3FF] text-white shadow-blue-900/20 active:scale-98'
            }`}
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <span>Xác nhận Đặt hàng</span>
                <CheckCircle2 className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Legal Modal */}
      <LegalPagesModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        initialType={legalDocType}
      />
    </div>
  );
}
