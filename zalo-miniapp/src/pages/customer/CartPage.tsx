import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Trash2, 
  Plus, 
  Minus, 
  Tag, 
  ChevronRight, 
  ShieldCheck, 
  ShoppingCart,
  Sparkles,
  Check
} from 'lucide-react';
import { useCart } from '../../context/CartContext';

interface CartPageProps {
  onBack: () => void;
  onGoToCheckout: (voucherCode?: string) => void;
  onExploreProducts: () => void;
}

const AVAILABLE_VOUCHERS = [
  { code: 'TRULIVA500', label: 'Giảm 500.000đ', desc: 'Đơn máy lọc nước từ 10tr', minOrder: 10000000 },
  { code: 'GIAM100K', label: 'Giảm 100.000đ', desc: 'Đơn phụ kiện từ 1tr', minOrder: 1000000 },
  { code: '12THANGBH', label: 'Tặng 12T Bảo Hành', desc: 'Nhân đôi thời hạn bảo hành', minOrder: 0 }
];

export default function CartPage({ onBack, onGoToCheckout, onExploreProducts }: CartPageProps) {
  const { cartItems, updateQuantity, removeFromCart, totalAmount, totalItemsCount } = useCart();
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const handleApplyVoucher = (codeToApply: string) => {
    const code = codeToApply.trim().toUpperCase();
    if (!code) return;

    if (code === 'TRULIVA500') {
      if (totalAmount < 10000000) {
        setVoucherError('Mã TRULIVA500 chỉ áp dụng cho đơn hàng từ 10.000.000đ');
        return;
      }
    } else if (code === 'GIAM100K') {
      if (totalAmount < 1000000) {
        setVoucherError('Mã GIAM100K chỉ áp dụng cho đơn hàng từ 1.000.000đ');
        return;
      }
    } else if (code !== '12THANGBH') {
      setVoucherError('Mã giảm giá không hợp lệ hoặc đã hết hạn');
      return;
    }

    setAppliedVoucher(code);
    setVoucherCode(code);
    setVoucherError(null);
  };

  let discountAmount = 0;
  if (appliedVoucher === 'TRULIVA500') discountAmount = 500000;
  else if (appliedVoucher === 'GIAM100K') discountAmount = 100000;

  const finalAmount = Math.max(0, totalAmount - discountAmount);

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] font-sans text-gray-800 flex flex-col animate-fade-in">
        {/* Header */}
        <div className="bg-white px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h2 className="font-bold text-sm text-gray-900">Giỏ Hàng (0)</h2>
          <div className="w-9"></div>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-3xl bg-blue-50 flex items-center justify-center text-[#1B3A6B] mb-4">
            <ShoppingCart className="w-10 h-10" />
          </div>
          <h3 className="font-extrabold text-gray-900 text-base mb-1">Giỏ hàng của bạn đang trống</h3>
          <p className="text-xs text-gray-500 max-w-xs mb-6 leading-relaxed">
            Hãy khám phá các dòng máy lọc nước thông minh và linh kiện chính hãng Truliva để chăm sóc sức khoẻ cho gia đình bạn.
          </p>
          <button
            onClick={onExploreProducts}
            className="px-6 py-3 rounded-xl bg-[#1B3A6B] text-white text-xs font-bold shadow-md shadow-blue-900/20 active:scale-95 transition"
          >
            Khám phá sản phẩm ngay
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32 font-sans text-gray-800 animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-gray-100 flex items-center justify-between shadow-2xs">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-sm text-gray-900">
          Giỏ Hàng ({totalItemsCount})
        </h1>
        <div className="w-9"></div>
      </div>

      {/* Cart Items List */}
      <div className="p-4 space-y-3">
        {cartItems.map(item => (
          <div
            key={item.productId}
            className="bg-white rounded-2xl p-3 border border-gray-100 shadow-xs flex items-center gap-3 relative"
          >
            {/* Image */}
            <div className="w-18 h-18 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-xs text-gray-900 line-clamp-1 mb-0.5">
                {item.name}
              </h3>
              <div className="text-[10px] text-gray-400 font-semibold mb-1">
                SKU: {item.sku}
              </div>
              <div className="text-rose-600 font-extrabold text-xs">
                {formatVND(item.price)}
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col items-end justify-between h-18 shrink-0">
              <button
                onClick={() => removeFromCart(item.productId)}
                className="text-gray-400 hover:text-rose-600 p-1 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="flex items-center border border-gray-200 rounded-lg bg-gray-50 p-0.5">
                <button
                  onClick={() => updateQuantity(item.productId, -1)}
                  className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-gray-600 shadow-2xs"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-6 text-center text-xs font-bold text-gray-800">
                  {item.quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.productId, 1)}
                  className="w-6 h-6 rounded-md bg-white flex items-center justify-center text-gray-600 shadow-2xs"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Voucher Input Box */}
      <div className="px-4 py-2">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
            <Tag className="w-4 h-4 text-[#1B3A6B]" />
            <span>Mã Giảm Giá / Ưu Đãi Truliva</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={voucherCode}
              onChange={e => { setVoucherCode(e.target.value); setVoucherError(null); }}
              placeholder="Nhập mã voucher (VD: TRULIVA500)"
              className="flex-1 h-10 px-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs uppercase font-bold focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
            />
            <button
              onClick={() => handleApplyVoucher(voucherCode)}
              className="h-10 px-4 rounded-xl bg-[#1B3A6B] text-white text-xs font-bold shrink-0 hover:bg-[#152e55] transition"
            >
              Áp dụng
            </button>
          </div>

          {voucherError && (
            <p className="text-[11px] text-rose-500 font-medium">{voucherError}</p>
          )}

          {appliedVoucher && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                Đã áp dụng mã: <strong>{appliedVoucher}</strong>
              </span>
              <button onClick={() => { setAppliedVoucher(null); setVoucherCode(''); }} className="text-gray-400 hover:text-gray-600 text-xs">
                Gỡ bỏ
              </button>
            </div>
          )}

          {/* Quick Voucher Suggestion Chips */}
          <div className="pt-2 border-t border-gray-50 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {AVAILABLE_VOUCHERS.map(v => (
              <button
                key={v.code}
                onClick={() => handleApplyVoucher(v.code)}
                className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold shrink-0 transition ${
                  appliedVoucher === v.code
                    ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {v.code} ({v.label})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bill Summary Box */}
      <div className="px-4 py-2">
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs space-y-2 text-xs">
          <div className="flex items-center justify-between text-gray-500">
            <span>Tạm tính ({totalItemsCount} món):</span>
            <span className="font-bold text-gray-800">{formatVND(totalAmount)}</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex items-center justify-between text-emerald-600 font-semibold">
              <span>Giảm giá Voucher:</span>
              <span>-{formatVND(discountAmount)}</span>
            </div>
          )}

          {appliedVoucher === '12THANGBH' && (
            <div className="flex items-center justify-between text-blue-600 font-semibold">
              <span>Ưu đãi bảo hành:</span>
              <span>+12 tháng chính hãng</span>
            </div>
          )}

          <div className="flex items-center justify-between text-gray-500">
            <span>Phí vận chuyển & lắp đặt:</span>
            <span className="font-bold text-emerald-600">Miễn phí (0đ)</span>
          </div>

          <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between">
            <span className="font-bold text-gray-900 text-sm">Tổng thanh toán:</span>
            <span className="font-extrabold text-rose-600 text-base">{formatVND(finalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 shadow-2xl flex items-center justify-between">
        <div>
          <div className="text-[11px] text-gray-400 font-medium">Tổng thanh toán:</div>
          <div className="text-lg font-black text-rose-600 leading-tight">
            {formatVND(finalAmount)}
          </div>
        </div>

        <button
          onClick={() => onGoToCheckout(appliedVoucher || undefined)}
          className="h-11 px-6 rounded-xl bg-gradient-to-r from-[#1B3A6B] to-[#00A3FF] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-blue-900/20 active:scale-98 transition"
        >
          <span>Tiến hành Đặt hàng</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
