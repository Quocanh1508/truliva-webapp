import React, { useState, useEffect } from 'react';
import { 
  Search, 
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
  Info,
  BookOpen
} from 'lucide-react';
import { fetchZaloApi } from '../../api/client';
import { useCart } from '../../context/CartContext';
import LegalPagesModal, { LegalDocType } from '../../components/LegalPagesModal';
import P3ROceanHeader from '../../components/P3ROceanHeader';
import { FEATURES } from '../../config/features';

interface ProductCatalogProps {
  onSelectProduct: (product: any) => void;
  onGoToCart: () => void;
}

const CATEGORIES = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'WATER_PURIFIER', label: 'Máy lọc nước' },
  { key: 'FILTER_CARTRIDGE', label: 'Lõi lọc nước' },
  { key: 'FAUCET_FILTER', label: 'Lọc tại vòi' },
  { key: 'ACCESSORY', label: 'Thiết bị khác' }
];

export default function ProductCatalog({ onSelectProduct, onGoToCart }: ProductCatalogProps) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(FEATURES.ENABLE_ECOMMERCE ? 'ALL' : 'WATER_PURIFIER');
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
      {/* Top Banner Header with Persona 3 Reload Ocean Waves */}
      <P3ROceanHeader className="p-5 pt-6 pb-6">
        <div className="max-w-md mx-auto space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-cyan-300 text-[10px] font-bold border border-white/15 backdrop-blur-xs mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00D2FF]"></span>
                <span className="truncate">{FEATURES.ENABLE_ECOMMERCE ? 'Gian hàng chính hãng Truliva' : 'Thiết bị & Hướng dẫn sử dụng'}</span>
              </div>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
                {FEATURES.ENABLE_ECOMMERCE ? 'Cửa Hàng Máy Lọc Nước' : 'Máy Lọc Nước Truliva'}
              </h1>
            </div>

            {/* Cart Icon Badge (chỉ hiện khi bật Ecommerce) */}
            {FEATURES.ENABLE_ECOMMERCE ? (
              <button 
                onClick={onGoToCart}
                className="relative w-11 h-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-white backdrop-blur-md active:scale-95 transition cursor-pointer shrink-0"
              >
                <ShoppingCart className="w-5 h-5" />
                {totalItemsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center shadow-xs border border-white">
                    {totalItemsCount > 99 ? '99+' : totalItemsCount}
                  </span>
                )}
              </button>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-cyan-300 backdrop-blur-md shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
            )}
          </div>

          {/* Search Input Bar */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={FEATURES.ENABLE_ECOMMERCE ? 'Tìm kiếm máy lọc nước, lõi lọc, phụ kiện...' : 'Tìm kiếm dòng máy lọc nước, model...'}
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-white text-slate-800 placeholder-slate-400 text-xs shadow-xs focus:outline-none focus:ring-2 focus:ring-[#00D2FF]"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </form>

          {/* Trust Badges Strip (1 Hàng ngang ngăn nắp, không bị rớt dòng) */}
          <div className="flex items-center justify-between text-[11px] text-sky-200/90 pt-2 border-t border-white/10 font-medium whitespace-nowrap">
            <div className="flex items-center gap-1">
              <Truck size={13} className="text-cyan-300" />
              <span>Miễn phí giao lắp</span>
            </div>
            <span className="text-white/20">•</span>
            <div className="flex items-center gap-1">
              <Award size={13} className="text-amber-300" />
              <span>Bảo hành 1-2 năm</span>
            </div>
            <span className="text-white/20">•</span>
            <div className="flex items-center gap-1">
              <RotateCcw size={13} className="text-emerald-300" />
              <span>Đổi mới 7 ngày</span>
            </div>
          </div>
        </div>
      </P3ROceanHeader>

      {/* Category Tabs (Chỉ hiển thị khi bật bán hàng, hoặc chỉ hiện tab Máy lọc nước) */}
      {FEATURES.ENABLE_ECOMMERCE && (
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
      )}

      {/* Legal Compliance Fast-Notice Bar (chỉ hiện khi bật Ecommerce) */}
      {FEATURES.ENABLE_ECOMMERCE && (
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
      )}

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
                  {/* Badge (bỏ tag chính hãng nếu có) */}
                  {product.badge && !product.badge.toLowerCase().includes('chính hãng') && (
                    <span className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-extrabold shadow-xs">
                      {product.badge}
                    </span>
                  )}

                  {discountPercent > 0 && FEATURES.ENABLE_ECOMMERCE && (
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
                      <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-0.5">
                        {product.sku}
                      </div>
                      <h3 className="font-bold text-slate-900 text-xs line-clamp-2 leading-snug min-h-[32px]">
                        {product.name}
                      </h3>
                    </div>

                    {/* Pricing and Action */}
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      {FEATURES.ENABLE_ECOMMERCE ? (
                        <div className="flex items-center justify-between gap-1">
                          <div>
                            <div className="text-rose-600 font-extrabold text-sm leading-tight">
                              {formatVND(product.price)}
                            </div>
                            {product.originalPrice && product.originalPrice > product.price && (
                              <div className="text-[11px] text-slate-400 line-through">
                                {formatVND(product.originalPrice)}
                              </div>
                            )}
                          </div>
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
                      ) : (
                        <div className="w-full py-1.5 px-2.5 bg-sky-50 group-hover:bg-[#1B3A6B] text-[#0284C7] group-hover:text-white rounded-xl text-[11px] font-bold flex items-center justify-between border border-sky-100/70 transition-all cursor-pointer">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <BookOpen size={12} className="shrink-0" />
                            <span className="whitespace-nowrap">Thông số & HDSD</span>
                          </div>
                          <ChevronRight size={13} className="shrink-0 text-[#0284C7] group-hover:text-white transition-colors" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar (chỉ hiện khi bật Ecommerce và giỏ có hàng) */}
      {FEATURES.ENABLE_ECOMMERCE && totalItemsCount > 0 && (
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
