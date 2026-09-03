import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Share2, 
  ShoppingCart, 
  ShieldCheck, 
  Truck, 
  RotateCcw, 
  Award, 
  Check, 
  ChevronRight,
  Plus,
  Minus,
  Sparkles,
  PhoneCall,
  Info
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import LegalPagesModal, { LegalDocType } from '../../components/LegalPagesModal';

interface ProductDetailProps {
  product: any;
  onBack: () => void;
  onGoToCart: () => void;
  onBuyNow: (product: any, quantity: number) => void;
}

export default function ProductDetail({ product, onBack, onGoToCart, onBuyNow }: ProductDetailProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Legal Modal
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalDocType, setLegalDocType] = useState<LegalDocType>('WARRANTY');

  const { addToCart, totalItemsCount } = useCart();

  if (!product) return null;

  const images = product.images && product.images.length > 0
    ? product.images
    : ['https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&auto=format&fit=crop&q=80'];

  const discountPercent = product.originalPrice && product.originalPrice > product.price
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 2000);
  };

  const specs = product.specifications || {};

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 font-sans text-gray-800 animate-fade-in">
      {/* Sticky Header Nav */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-gray-100 flex items-center justify-between shadow-2xs">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 active:scale-95 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <span className="font-bold text-sm text-gray-800 line-clamp-1 max-w-[200px]">
          {product.name}
        </span>

        {/* Cart Icon Badge */}
        <button
          onClick={onGoToCart}
          className="relative w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 active:scale-95 transition"
        >
          <ShoppingCart className="w-4 h-4" />
          {totalItemsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border border-white">
              {totalItemsCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Image Slider */}
      <div className="bg-white p-4 border-b border-gray-100">
        <div className="aspect-square w-full max-w-sm mx-auto rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 relative shadow-inner">
          <img
            src={images[selectedImgIdx]}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          {product.badge && (
            <span className="absolute top-3 left-3 px-3 py-1 rounded-xl bg-rose-600 text-white text-xs font-extrabold shadow-md">
              {product.badge}
            </span>
          )}
        </div>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="flex items-center justify-center gap-2 mt-3">
            {images.map((img: string, idx: number) => (
              <button
                key={idx}
                onClick={() => setSelectedImgIdx(idx)}
                className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition ${
                  selectedImgIdx === idx ? 'border-[#1B3A6B] scale-105 shadow-xs' : 'border-gray-200 opacity-60'
                }`}
              >
                <img src={img} alt="thumb" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pricing & Title Box */}
      <div className="bg-white p-4 mt-2 border-y border-gray-100 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#1B3A6B] border border-blue-200 uppercase tracking-wider">
            Mã: {product.sku}
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <Award className="w-3 h-3 text-emerald-600" />
            Bảo hành {product.warrantyMonths || 12} tháng
          </span>
        </div>

        <h1 className="text-lg font-extrabold text-gray-900 leading-snug">
          {product.name}
        </h1>

        <div className="flex items-baseline gap-3 pt-1">
          <span className="text-2xl font-black text-rose-600">
            {formatVND(product.price)}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400 line-through">
                {formatVND(product.originalPrice)}
              </span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                Tiết kiệm {discountPercent}%
              </span>
            </div>
          )}
        </div>

        {product.shortDesc && (
          <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
            {product.shortDesc}
          </p>
        )}
      </div>

      {/* Commitments & Warranties 3-Box Strip */}
      <div className="bg-white p-4 mt-2 border-y border-gray-100">
        <div className="font-bold text-xs text-gray-900 uppercase tracking-wider mb-3">
          Cam kết & Quyền lợi chính hãng Truliva
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div 
            onClick={() => { setLegalDocType('SHIPPING'); setShowLegalModal(true); }}
            className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100/80 cursor-pointer hover:bg-blue-50 transition"
          >
            <Truck className="w-5 h-5 text-[#1B3A6B] mx-auto mb-1" />
            <div className="font-bold text-gray-900 text-[11px]">Giao & Lắp Đặt</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Miễn phí tại nhà</div>
          </div>

          <div 
            onClick={() => { setLegalDocType('WARRANTY'); setShowLegalModal(true); }}
            className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100/80 cursor-pointer hover:bg-emerald-50 transition"
          >
            <ShieldCheck className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <div className="font-bold text-gray-900 text-[11px]">Bảo Hành Điện Tử</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Qua Zalo ZNS</div>
          </div>

          <div 
            onClick={() => { setLegalDocType('RETURN'); setShowLegalModal(true); }}
            className="p-3 rounded-2xl bg-amber-50/60 border border-amber-100/80 cursor-pointer hover:bg-amber-50 transition"
          >
            <RotateCcw className="w-5 h-5 text-amber-600 mx-auto mb-1" />
            <div className="font-bold text-gray-900 text-[11px]">Đổi Mới 7 Ngày</div>
            <div className="text-[10px] text-gray-500 mt-0.5">Nếu lỗi kỹ thuật</div>
          </div>
        </div>
      </div>

      {/* Specifications Table */}
      {Object.keys(specs).length > 0 && (
        <div className="bg-white p-4 mt-2 border-y border-gray-100">
          <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-[#1B3A6B]" />
            Thông Số Kỹ Thuật Chi Tiết
          </h3>
          <div className="rounded-2xl border border-gray-100 overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <tbody>
                {specs.technology && (
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <td className="p-2.5 font-semibold text-gray-500 w-1/3">Công nghệ lọc</td>
                    <td className="p-2.5 font-bold text-gray-800">{specs.technology}</td>
                  </tr>
                )}
                {specs.stages && (
                  <tr className="border-b border-gray-50">
                    <td className="p-2.5 font-semibold text-gray-500">Cấp lọc</td>
                    <td className="p-2.5 font-bold text-gray-800">{specs.stages}</td>
                  </tr>
                )}
                {specs.flowRate && (
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <td className="p-2.5 font-semibold text-gray-500">Lưu lượng nước</td>
                    <td className="p-2.5 font-bold text-gray-800">{specs.flowRate}</td>
                  </tr>
                )}
                {specs.recoveryRate && (
                  <tr className="border-b border-gray-50">
                    <td className="p-2.5 font-semibold text-gray-500">Tỷ lệ thu hồi</td>
                    <td className="p-2.5 font-bold text-emerald-700">{specs.recoveryRate}</td>
                  </tr>
                )}
                {specs.power && (
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <td className="p-2.5 font-semibold text-gray-500">Công suất điện</td>
                    <td className="p-2.5 font-bold text-gray-800">{specs.power}</td>
                  </tr>
                )}
                {specs.dimensions && (
                  <tr className="border-b border-gray-50">
                    <td className="p-2.5 font-semibold text-gray-500">Kích thước</td>
                    <td className="p-2.5 font-bold text-gray-800">{specs.dimensions}</td>
                  </tr>
                )}
                {specs.origin && (
                  <tr className="bg-gray-50/50">
                    <td className="p-2.5 font-semibold text-gray-500">Xuất xứ</td>
                    <td className="p-2.5 font-bold text-gray-800">{specs.origin}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Description */}
      {product.description && (
        <div className="bg-white p-4 mt-2 border-y border-gray-100 space-y-2">
          <h3 className="font-bold text-sm text-gray-900">Mô Tả Sản Phẩm</h3>
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
            {product.description}
          </p>
        </div>
      )}

      {/* Bottom Sticky Purchase Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3 shadow-2xl flex items-center gap-3">
        {/* Quantity Controls */}
        <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 p-1">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-600 shadow-2xs active:scale-95 transition"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-8 text-center text-xs font-extrabold text-gray-800">
            {quantity}
          </span>
          <button
            onClick={() => setQuantity(quantity + 1)}
            className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-600 shadow-2xs active:scale-95 transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={handleAddToCart}
          className="flex-1 h-11 rounded-xl bg-blue-50 text-[#1B3A6B] border border-blue-200 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition shadow-xs"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Thêm vào giỏ</span>
        </button>

        {/* Buy Now Button */}
        <button
          onClick={() => onBuyNow(product, quantity)}
          className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#1B3A6B] to-[#00A3FF] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition shadow-md shadow-blue-900/20"
        >
          <span>Mua ngay</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Success Toast Notification */}
      {showSuccessToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-gray-900/90 text-white text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-2 animate-slide-down">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Đã thêm vào giỏ hàng thành công!</span>
        </div>
      )}

      {/* Legal Modal */}
      <LegalPagesModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        initialType={legalDocType}
      />
    </div>
  );
}
