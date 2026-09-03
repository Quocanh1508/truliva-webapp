import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Sparkles, 
  ShieldCheck, 
  ShoppingCart, 
  Plus, 
  Check, 
  ChevronRight, 
  Award, 
  Truck, 
  RotateCcw,
  SlidersHorizontal,
  Flame,
  Info
} from 'lucide-react';
import { fetchZaloApi } from '../../api/client';
import { useCart } from '../../context/CartContext';
import LegalPagesModal, { LegalDocType } from '../../components/LegalPagesModal';

interface ProductCatalogProps {
  onSelectProduct: (product: any) => void;
  onGoToCart: () => void;
}

const CATEGORIES = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'WATER_PURIFIER', label: 'Máy lọc nước' },
  { key: 'FILTER_CARTRIDGE', label: 'Bộ lõi lọc' },
  { key: 'FAUCET_FILTER', label: 'Lọc tại vòi' }
];

export default function ProductCatalog({ onSelectProduct, onGoToCart }: ProductCatalogProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [addedSku, setAddedSku] = useState<string | null>(null);

  // Legal modal
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalDocType, setLegalDocType] = useState<LegalDocType>('TERMS');

  const { addToCart, totalItemsCount } = useCart();

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetchZaloApi(`/zalo-miniapp/shop/products?category=${category}&search=${encodeURIComponent(search)}`);
      if (res && res.success) {
        setProducts(res.products || []);
      }
    } catch (err) {
      console.error('Error loading shop products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [category]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadProducts();
  };

  const handleQuickAddToCart = (e: React.MouseEvent, product: any) => {
    e.stopPropagation();
    addToCart(product, 1);
    setAddedSku(product.sku);
    setTimeout(() => setAddedSku(null), 1200);
  };

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-sans text-gray-800 animate-fade-in">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-br from-[#1B3A6B] via-[#152e55] to-[#0B1E36] text-white pt-6 pb-6 px-4 relative overflow-hidden rounded-b-3xl shadow-md">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#00A3FF]/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
        
        <div className="relative z-10 flex items-center justify-between mb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-cyan-300 text-[11px] font-semibold backdrop-blur-xs mb-1">
              <Sparkles className="w-3 h-3" />
              <span>Gian hàng chính hãng Truliva</span>
            </div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Cửa Hàng Máy Lọc Nước
            </h1>
          </div>

          {/* Cart Icon Badge */}
          <button 
            onClick={onGoToCart}
            className="relative w-11 h-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white backdrop-blur-md active:scale-95 transition"
          >
            <ShoppingCart className="w-5 h-5" />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center shadow-xs border border-white">
                {totalItemsCount > 99 ? '99+' : totalItemsCount}
              </span>
            )}
          </button>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSearchSubmit} className="relative mt-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm máy lọc nước, lõi lọc, phụ kiện..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-white text-gray-900 placeholder-gray-400 text-sm shadow-inner focus:outline-none focus:ring-2 focus:ring-[#00A3FF]"
          />
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </form>

        {/* Trust Badges Strip */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-white/10 text-[11px] text-blue-100">
          <div className="flex items-center gap-1.5 justify-center">
            <Truck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
            <span>Miễn phí giao lắp</span>
          </div>
          <div className="flex items-center gap-1.5 justify-center">
            <Award className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>Bảo hành 1-2 năm</span>
          </div>
          <div className="flex items-center gap-1.5 justify-center">
            <RotateCcw className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>Đổi mới 7 ngày</span>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto no-scrollbar sticky top-0 bg-[#F8FAFC]/95 backdrop-blur-md z-20 border-b border-gray-100">
        {CATEGORIES.map(cat => {
          const isSelected = category === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-[#1B3A6B] text-white shadow-sm shadow-[#1B3A6B]/20 scale-102'
                  : 'bg-white text-gray-600 border border-gray-200/80 hover:bg-gray-50'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Legal Compliance Fast-Notice Bar */}
      <div className="mx-4 my-2 p-2.5 rounded-xl bg-blue-50/80 border border-blue-100 text-[11px] text-blue-900 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Sản phẩm chính hãng • Đầy đủ hoá đơn VAT & Bảo hành điện tử</span>
        </div>
        <button 
          onClick={() => { setLegalDocType('TERMS'); setShowLegalModal(true); }}
          className="font-bold text-[#1B3A6B] hover:underline flex items-center shrink-0 ml-1"
        >
          Chính sách TMĐT <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* Product List Grid */}
      <div className="px-4 py-2">
        {loading ? (
          <div className="py-20 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-[#1B3A6B] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-medium text-gray-500">Đang tải sản phẩm Truliva...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-gray-200 p-6">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <h4 className="font-bold text-gray-700 text-sm">Không tìm thấy sản phẩm phù hợp</h4>
            <p className="text-xs text-gray-500 mt-1">Vui lòng thử tìm với từ khoá khác hoặc chọn lại danh mục.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map(product => {
              const discountPercent = product.originalPrice && product.originalPrice > product.price
                ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
                : 0;

              return (
                <div
                  key={product.id}
                  onClick={() => onSelectProduct(product)}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs hover:shadow-md transition-all active:scale-[0.98] flex flex-col relative group cursor-pointer"
                >
                  {/* Badge */}
                  {product.badge && (
                    <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-extrabold shadow-xs">
                      {product.badge}
                    </span>
                  )}

                  {discountPercent > 0 && (
                    <span className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold shadow-xs">
                      -{discountPercent}%
                    </span>
                  )}

                  {/* Product Image */}
                  <div className="aspect-square w-full bg-gray-50 overflow-hidden relative">
                    <img
                      src={product.images?.[0] || 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&auto=format&fit=crop&q=80'}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>

                  {/* Info Box */}
                  <div className="p-3 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">
                        {product.sku}
                      </div>
                      <h3 className="font-bold text-gray-900 text-xs line-clamp-2 leading-snug mb-1.5 min-h-[32px]">
                        {product.name}
                      </h3>

                      {/* Warranty Badge */}
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-100 mb-2">
                        <Award className="w-3 h-3 text-emerald-600" />
                        <span>BH {product.warrantyMonths || 12}T chính hãng</span>
                      </div>
                    </div>

                    {/* Pricing and Action */}
                    <div className="pt-2 border-t border-gray-50 flex items-center justify-between gap-1">
                      <div>
                        <div className="text-rose-600 font-extrabold text-sm leading-tight">
                          {formatVND(product.price)}
                        </div>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <div className="text-[11px] text-gray-400 line-through">
                            {formatVND(product.originalPrice)}
                          </div>
                        )}
                      </div>

                      {/* Quick Add Button */}
                      <button
                        onClick={(e) => handleQuickAddToCart(e, product)}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
                          addedSku === product.sku
                            ? 'bg-emerald-600 text-white scale-110'
                            : 'bg-[#1B3A6B] text-white hover:bg-[#152e55] active:scale-90 shadow-xs'
                        }`}
                        title="Thêm vào giỏ hàng"
                      >
                        {addedSku === product.sku ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar (if cart has items) */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 p-3 z-30 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              onClick={onGoToCart}
              className="w-full bg-[#1B3A6B] text-white py-3 px-4 rounded-2xl shadow-xl flex items-center justify-between active:scale-[0.99] transition-transform border border-blue-400/20"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold text-xs">
                  {totalItemsCount}
                </div>
                <div className="text-left text-xs">
                  <div className="font-bold">Giỏ hàng của bạn</div>
                  <div className="text-[11px] text-blue-200">Đã chọn {totalItemsCount} món hàng</div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-extrabold text-cyan-300">
                <span>Xem giỏ hàng</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          </div>
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
