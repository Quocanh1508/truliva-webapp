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
  Info,
  ExternalLink,
  X,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';
import { openWebview, openPhone, openChat } from 'zmp-sdk/apis';
import { useCart } from '../../context/CartContext';
import LegalPagesModal, { LegalDocType } from '../../components/LegalPagesModal';
import { FEATURES } from '../../config/features';

interface ProductDetailProps {
  product: any;
  onBack: () => void;
  onGoToCart: () => void;
  onBuyNow: (product: any, quantity: number) => void;
}

interface DescSection {
  title: string;
  theme: 'sky' | 'blue' | 'emerald' | 'amber' | 'slate';
  items: string[];
}

function detectSectionTheme(title: string): DescSection['theme'] {
  const upper = title.toUpperCase();
  if (/BẢO HÀNH|LẮP ĐẶT|AN TOÀN|HẬU MÃI/.test(upper)) return 'emerald';
  if (/CÔNG NGHỆ|ƯU ĐIỂM|CRYSTAL|LÀM LẠNH|LÀM ĐÁ|ĐIỀU KHIỂN|LÝ DO|TẠI SAO|VÌ SAO|TÙY CHỈNH|THIẾT KẾ/.test(upper)) return 'blue';
  if (/HƯỚNG DẪN|THAY THẾ|DIY|HẠN SỬ DỤNG|LƯU Ý/.test(upper)) return 'amber';
  if (/THƯƠNG HIỆU|CHỨNG NHẬN|CHẤT LƯỢNG/.test(upper)) return 'slate';
  return 'sky';
}

function parseProductDescription(raw: string): { sections: DescSection[]; footnotes: string[] } {
  if (!raw) return { sections: [], footnotes: [] };

  let text = raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .trim();

  // Remove duplicate "* Phân loại sản phẩm:" if raw unformatted text is passed
  const dupMarker = '* Phân loại sản phẩm:';
  const firstIdx = text.indexOf(dupMarker);
  if (firstIdx !== -1) {
    const secondIdx = text.indexOf(dupMarker, firstIdx + dupMarker.length);
    if (secondIdx !== -1) {
      const thIdx = text.indexOf('THÔNG TIN CHUNG', secondIdx);
      if (thIdx !== -1) {
        text = text.slice(0, secondIdx).trim() + '\n' + text.slice(thIdx).trim();
      }
    }
  }

  // If the text has very few newlines (unformatted blob), auto-insert breaks before headers & bullets
  if (text.split('\n').length < 4 && text.length > 220) {
    text = text
      .replace(/^\*\s*Phân loại sản phẩm:\s*/i, 'PHÂN LOẠI SẢN PHẨM\n')
      .replace(/\s+(THÔNG TIN CHUNG CỦA SẢN PHẨM|THÔNG TIN CHUNG VỀ SẢN PHẨM|ĐIỀU KIỆN LẮP ĐẶT & BẢO HÀNH|ƯU ĐIỂM NỔI BẬT|THÔNG TIN SẢN PHẨM|THÔNG TIN KỸ THUẬT|HƯỚNG DẪN THAY THẾ LÕI LỌC TẠI NHÀ\(DIY\)|HẠN SỬ DỤNG VÀ BẢO HÀNH)/g, '\n$1\n')
      .replace(/\s+(TRULIVA là thương hiệu với hơn 25 năm kinh nghiệm)/g, '\nTHƯƠNG HIỆU & CHỨNG NHẬN QUỐC TẾ\n- $1')
      .replace(/\s+-\s+/g, '\n- ')
      .replace(/\s*([✅✔⭐])\s*/g, '\n- ');
  }

  const rawLines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l !== '-' && l !== '*');

  const sections: DescSection[] = [];
  const footnotes: string[] = [];
  let currentSection: DescSection = {
    title: 'Đặc điểm nổi bật',
    theme: 'sky',
    items: []
  };

  const isHeaderLine = (line: string): boolean => {
    if (line.startsWith('-') || line.startsWith('•') || line.startsWith('(*')) return false;
    if (/^\*\s*Phân loại sản phẩm:?$/i.test(line)) return true;
    const clean = line.replace(/[:?🔥❄️🧊🚚⭐]/g, '').trim();
    if (clean.length < 4 || clean.length > 75) return false;
    // All-uppercase header check (Vietnamese aware)
    return clean === clean.toUpperCase() && /[A-ZÀ-Ỹ]/.test(clean);
  };

  for (const line of rawLines) {
    if (/^\(\*+\)/.test(line)) {
      footnotes.push(line);
      continue;
    }

    if (isHeaderLine(line)) {
      const cleanTitle = line
        .replace(/^\*\s*/, '')
        .replace(/:$/, '')
        .trim();
      if (currentSection.items.length > 0) {
        sections.push(currentSection);
      }
      currentSection = {
        title: cleanTitle,
        theme: detectSectionTheme(cleanTitle),
        items: []
      };
    } else {
      const cleanedItem = line.replace(/^[-•*]\s*/, '').trim();
      if (cleanedItem) {
        currentSection.items.push(cleanedItem);
      }
    }
  }

  if (currentSection.items.length > 0) {
    sections.push(currentSection);
  }

  return { sections, footnotes };
}

export default function ProductDetail({ product, onBack, onGoToCart, onBuyNow }: ProductDetailProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  // Legal Modal
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalDocType, setLegalDocType] = useState<LegalDocType>('WARRANTY');

  const { addToCart, totalItemsCount, totalAmount } = useCart();

  if (!product) return null;

  const specs = product.specifications || {};
  const variants: Array<{ title: string; price: number; compareAtPrice?: number | null }> =
    Array.isArray(specs.variants) && specs.variants.length > 1 ? specs.variants : [];
  const activeVariant = variants[selectedVariantIdx] || null;

  const displayPrice = activeVariant ? activeVariant.price : product.price;
  const displayOriginalPrice = activeVariant ? activeVariant.compareAtPrice : product.originalPrice;

  const images = product.images && product.images.length > 0
    ? product.images
    : ['https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&auto=format&fit=crop&q=80'];

  const discountPercent = displayOriginalPrice && displayOriginalPrice > displayPrice
    ? Math.round(((displayOriginalPrice - displayPrice) / displayOriginalPrice) * 100)
    : 0;

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setShowCartModal(true);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-28 font-sans text-gray-800 animate-fade-in">
      {/* Sticky Header Nav */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 pt-[calc(env(safe-area-inset-top,38px)+12px)] pb-3 border-b border-gray-100 flex items-center justify-between shadow-2xs">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 active:scale-95 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <span className="font-bold text-sm text-gray-800 line-clamp-1 max-w-[200px]">
          {product.name}
        </span>

        {/* Cart Icon Badge (chỉ hiện khi bật Ecommerce) */}
        {FEATURES.ENABLE_ECOMMERCE ? (
          <button
            onClick={onGoToCart}
            className="relative w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 active:scale-95 transition cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border border-white">
                {totalItemsCount}
              </span>
            )}
          </button>
        ) : (
          <div className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center text-[#0284C7] border border-sky-100">
            <BookOpen className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Main Image Slider */}
      <div className="bg-white p-4 border-b border-gray-100">
        <div className="aspect-square w-full max-w-sm mx-auto rounded-3xl overflow-hidden bg-gray-50 border border-gray-100 relative shadow-inner">
          <img
            src={images[selectedImgIdx]}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          {product.badge && !product.badge.toLowerCase().includes('chính hãng') && (
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
            Mã: {activeVariant?.sku || product.sku}
          </span>
          {product.warrantyMonths ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <Award className="w-3 h-3 text-emerald-600" />
              Bảo hành {product.warrantyMonths} tháng
            </span>
          ) : null}
        </div>

        <h1 className="text-lg font-extrabold text-gray-900 leading-snug">
          {product.name}
        </h1>

        {FEATURES.ENABLE_ECOMMERCE ? (
          <div className="flex items-baseline gap-3 pt-1">
            <span className="text-2xl font-black text-rose-600">
              {formatVND(displayPrice)}
            </span>
            {displayOriginalPrice && displayOriginalPrice > displayPrice && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 line-through">
                  {formatVND(displayOriginalPrice)}
                </span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                  Tiết kiệm {discountPercent}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-baseline gap-2 pt-1 flex-wrap">
            <span className="text-xs font-bold text-slate-400">Giá bán:</span>
            <span className="text-lg font-black text-rose-600">
              {formatVND(displayPrice)}
            </span>
            {displayOriginalPrice && displayOriginalPrice > displayPrice && (
              <>
                <span className="text-xs text-slate-400 line-through ml-1">
                  {formatVND(displayOriginalPrice)}
                </span>
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200">
                  -{discountPercent}%
                </span>
              </>
            )}
          </div>
        )}

        {/* Variant Selector (Chuẩn theo website cho sản phẩm có nhiều phân loại: ECO-600G, W6412) */}
        {variants.length > 1 && (
          <div className="pt-2 space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
              Phân loại sản phẩm:
            </div>
            <div className="flex flex-wrap gap-2">
              {variants.map((v, idx) => {
                const isSelected = idx === selectedVariantIdx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedVariantIdx(idx)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {v.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Commitments & Warranties 3-Box Strip (Chỉ hiển thị cho Máy lọc nước & Lõi lọc nước) */}
      {product.category === 'WATER_PURIFIER' && (
        <div className="bg-white p-4 mt-2 border-y border-gray-100">
          <div className="font-bold text-xs text-gray-900 uppercase tracking-wider mb-3">
            Cam kết & Quyền lợi Truliva
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
              <div className="font-bold text-gray-900 text-[11px]">Bảo Hành 1-2 Năm</div>
              <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
                {product.warrantyMonths ? `${product.warrantyMonths} Tháng điện tử` : 'Điện tử qua Zalo'}
              </div>
            </div>

            <div 
              onClick={() => { setLegalDocType('RETURN'); setShowLegalModal(true); }}
              className="p-3 rounded-2xl bg-amber-50/60 border border-amber-100/80 cursor-pointer hover:bg-amber-50 transition"
            >
              <RotateCcw className="w-5 h-5 text-amber-600 mx-auto mb-1" />
              <div className="font-bold text-gray-900 text-[11px]">Đổi Mới 30 Ngày</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Nếu lỗi kỹ thuật</div>
            </div>
          </div>
        </div>
      )}

      {product.category === 'FILTER_CARTRIDGE' && (
        <div className="bg-white p-4 mt-2 border-y border-gray-100">
          <div className="font-bold text-xs text-gray-900 uppercase tracking-wider mb-3">
            Cam kết & Quyền lợi Truliva
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div 
              onClick={() => { setLegalDocType('WARRANTY'); setShowLegalModal(true); }}
              className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100/80 cursor-pointer hover:bg-blue-50 transition"
            >
              <ShieldCheck className="w-5 h-5 text-[#1B3A6B] mx-auto mb-1" />
              <div className="font-bold text-gray-900 text-[11px]">Chính Hãng 100%</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Chuẩn nhà máy</div>
            </div>

            <div 
              onClick={() => { setLegalDocType('WARRANTY'); setShowLegalModal(true); }}
              className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100/80 cursor-pointer hover:bg-emerald-50 transition"
            >
              <Award className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
              <div className="font-bold text-gray-900 text-[11px]">Bảo Hành 3 Tháng</div>
              <div className="text-[10px] text-emerald-700 font-bold mt-0.5">1 đổi 1 lỗi KT</div>
            </div>

            <div 
              onClick={() => { setLegalDocType('TERMS'); setShowLegalModal(true); }}
              className="p-3 rounded-2xl bg-amber-50/60 border border-amber-100/80 cursor-pointer hover:bg-amber-50 transition"
            >
              <Sparkles className="w-5 h-5 text-amber-600 mx-auto mb-1" />
              <div className="font-bold text-gray-900 text-[11px]">Luôn Có Ưu Đãi</div>
              <div className="text-[10px] text-gray-500 mt-0.5">Ưu đãi thay lõi</div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Description — 100% Verbatim Website Content + Official Infographics */}
      {(() => {
        const { sections: descSections, footnotes: descFootnotes } = parseProductDescription(product.description || '');
        const descImages: string[] = Array.isArray(specs.descImages) ? specs.descImages : [];
        if (descSections.length === 0 && descImages.length === 0) return null;

        const totalBulletCount = descSections.reduce((acc, s) => acc + s.items.length, 0);
        const needsCollapse = descSections.length > 2 || totalBulletCount > 6 || descImages.length > 2;
        const visibleSections = (!needsCollapse || descExpanded)
          ? descSections
          : descSections.slice(0, 2).map((sec, idx) => ({
              ...sec,
              items: idx === 0 ? sec.items.slice(0, 4) : sec.items.slice(0, 3)
            }));
        const visibleDescImages = (!needsCollapse || descExpanded)
          ? descImages
          : (descSections.length === 0 ? descImages.slice(0, 2) : []);

        const themeStyles: Record<DescSection['theme'], {
          cardBg: string;
          cardBorder: string;
          headerBg: string;
          iconBg: string;
          iconText: string;
          titleText: string;
          dotColor: string;
        }> = {
          sky: {
            cardBg: 'bg-sky-50/45',
            cardBorder: 'border-sky-100/90',
            headerBg: 'border-sky-100/80',
            iconBg: 'bg-sky-100/90',
            iconText: 'text-[#00A3FF]',
            titleText: 'text-[#1B3A6B]',
            dotColor: 'bg-[#00A3FF]'
          },
          blue: {
            cardBg: 'bg-blue-50/45',
            cardBorder: 'border-blue-100/90',
            headerBg: 'border-blue-100/80',
            iconBg: 'bg-blue-100/90',
            iconText: 'text-[#2563EB]',
            titleText: 'text-[#1B3A6B]',
            dotColor: 'bg-[#2563EB]'
          },
          emerald: {
            cardBg: 'bg-emerald-50/45',
            cardBorder: 'border-emerald-100/90',
            headerBg: 'border-emerald-100/80',
            iconBg: 'bg-emerald-100/90',
            iconText: 'text-emerald-600',
            titleText: 'text-emerald-950',
            dotColor: 'bg-emerald-500'
          },
          amber: {
            cardBg: 'bg-amber-50/45',
            cardBorder: 'border-amber-100/90',
            headerBg: 'border-amber-100/80',
            iconBg: 'bg-amber-100/90',
            iconText: 'text-amber-600',
            titleText: 'text-amber-950',
            dotColor: 'bg-amber-500'
          },
          slate: {
            cardBg: 'bg-slate-50/75',
            cardBorder: 'border-slate-200/80',
            headerBg: 'border-slate-200/70',
            iconBg: 'bg-slate-200/80',
            iconText: 'text-[#1B3A6B]',
            titleText: 'text-slate-800',
            dotColor: 'bg-[#1B3A6B]'
          }
        };

        const renderSectionIcon = (theme: DescSection['theme']) => {
          switch (theme) {
            case 'emerald':
              return <ShieldCheck className="w-3.5 h-3.5" />;
            case 'blue':
              return <Sparkles className="w-3.5 h-3.5" />;
            case 'amber':
              return <BookOpen className="w-3.5 h-3.5" />;
            case 'slate':
              return <Award className="w-3.5 h-3.5" />;
            default:
              return <Layers className="w-3.5 h-3.5" />;
          }
        };

        const renderFormattedItem = (item: string) => {
          // Match "Bước 1: ..." or "Lưu ý: ..."
          const stepMatch = item.match(/^(Bước\s*\d+|Lưu ý)\s*:\s*(.+)$/i);
          if (stepMatch) {
            return (
              <div className="text-[12.5px] text-slate-700 leading-relaxed">
                <span className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded-md bg-[#1B3A6B] text-white text-[10px] font-bold uppercase tracking-wide">
                  {stepMatch[1]}
                </span>
                <span>{stepMatch[2]}</span>
              </div>
            );
          }

          // Match "Label: Value" where label is concise (<= 42 chars)
          const colonIdx = item.indexOf(':');
          if (colonIdx > 1 && colonIdx <= 42) {
            const label = item.slice(0, colonIdx).trim();
            const value = item.slice(colonIdx + 1).trim();
            if (value.length > 0) {
              return (
                <p className="text-[12.5px] text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-800">{label}:</span>{' '}
                  <span>{value}</span>
                </p>
              );
            }
          }

          return (
            <p className="text-[12.5px] text-slate-600 leading-relaxed">
              {item}
            </p>
          );
        };

        return (
          <div className="bg-white p-4 mt-2 border-y border-gray-100 space-y-3">
            {/* Section Title Header */}
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-sky-100/80 text-[#00A3FF] rounded-lg">
                  <Sparkles className="w-4 h-4 text-[#00A3FF]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-xs text-slate-800 tracking-tight uppercase">
                    Mô Tả Sản Phẩm
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Thông tin chính thức từ trulivavietnam.com
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold text-[#1B3A6B] bg-sky-50 border border-sky-200/70 px-2 py-0.5 rounded-full">
                Chính hãng
              </span>
            </div>

            {/* Structured Bento Cards + Website Infographic Images */}
            <div className="relative space-y-2.5">
              {visibleSections.map((sec, sIdx) => {
                const st = themeStyles[sec.theme];
                return (
                  <div
                    key={sIdx}
                    className={`rounded-2xl border ${st.cardBorder} ${st.cardBg} p-3 transition-all`}
                  >
                    <div className={`flex items-center gap-2 pb-2 mb-2 border-b ${st.headerBg}`}>
                      <div className={`w-6 h-6 rounded-lg ${st.iconBg} ${st.iconText} flex items-center justify-center shrink-0`}>
                        {renderSectionIcon(sec.theme)}
                      </div>
                      <h4 className={`text-[11.5px] font-extrabold uppercase tracking-tight leading-snug ${st.titleText}`}>
                        {sec.title}
                      </h4>
                    </div>

                    <ul className="space-y-2">
                      {sec.items.map((item, iIdx) => (
                        <li key={iIdx} className="flex items-start gap-2.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dotColor} mt-[7px] shrink-0`} />
                          <div className="flex-1 min-w-0">
                            {renderFormattedItem(item)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}

              {/* Footnotes Box (only when expanded or not needing collapse) */}
              {(!needsCollapse || descExpanded) && descFootnotes.length > 0 && (
                <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3 py-2 space-y-1">
                  {descFootnotes.map((fn, fIdx) => (
                    <p key={fIdx} className="text-[10.5px] text-slate-500 italic leading-snug">
                      {fn}
                    </p>
                  ))}
                </div>
              )}

              {/* Official Website Description Infographics */}
              {visibleDescImages.length > 0 && (
                <div className="space-y-2 pt-1">
                  {visibleDescImages.map((imgUrl, idx) => (
                    <img
                      key={idx}
                      src={imgUrl}
                      alt={`${product.name} - Infographic ${idx + 1}`}
                      loading="lazy"
                      className="w-full h-auto rounded-xl border border-slate-100 block"
                    />
                  ))}
                </div>
              )}

              {/* Bottom Fade Gradient when collapsed */}
              {needsCollapse && !descExpanded && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white via-white/80 to-transparent rounded-b-2xl" />
              )}
            </div>

            {/* Progressive Disclosure Expand / Collapse Button (min-h 44px per UI Design System) */}
            {needsCollapse && (
              <button
                type="button"
                onClick={() => setDescExpanded(prev => !prev)}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-sky-50/70 active:scale-[0.99] border border-slate-200/80 text-[#1B3A6B] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-2xs"
              >
                <span>
                  {descExpanded
                    ? 'Thu gọn mô tả sản phẩm'
                    : 'Xem đầy đủ mô tả & hình ảnh chi tiết'}
                </span>
                {descExpanded ? (
                  <ChevronUp className="w-4 h-4 text-[#00A3FF]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#00A3FF]" />
                )}
              </button>
            )}
          </div>
        );
      })()}

      {/* Official Website Link */}
      {specs?.productUrl && (
        <div className="bg-white p-4 mt-2 border-y border-gray-100">
          <button
            onClick={() => {
              try {
                openWebview({ url: specs.productUrl });
              } catch {
                window.open(specs.productUrl, '_blank');
              }
            }}
            className="w-full py-2.5 px-4 bg-sky-50 hover:bg-sky-100 text-[#0284C7] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition border border-sky-200 active:scale-98 cursor-pointer"
          >
            <ExternalLink className="w-4 h-4 text-[#0284C7]" />
            <span>Xem chi tiết trên website trulivavietnam.com</span>
          </button>
        </div>
      )}

      {/* Bottom Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/98 backdrop-blur-md border-t border-slate-200 px-4 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] shadow-[0_-6px_25px_rgba(0,0,0,0.08)] flex items-center gap-3">
        {FEATURES.ENABLE_ECOMMERCE ? (
          <>
            {/* Quantity Controls */}
            <div className="flex items-center border border-gray-200 rounded-xl bg-gray-50 p-1">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-600 shadow-2xs active:scale-95 transition cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-8 text-center text-xs font-extrabold text-gray-800">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-gray-600 shadow-2xs active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Add to Cart Button */}
            <button
              onClick={handleAddToCart}
              className="flex-1 h-12 rounded-xl bg-blue-50 text-[#1B3A6B] border border-blue-200 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 transition shadow-xs cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Thêm vào giỏ</span>
            </button>

            {/* Buy Now Button */}
            <button
              onClick={() => onBuyNow(product, quantity)}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#1B3A6B] to-[#00A3FF] text-white font-black text-xs flex items-center justify-center gap-1.5 active:scale-98 transition shadow-md shadow-blue-900/20 cursor-pointer"
            >
              <span>Mua ngay</span>
              <ChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </>
        ) : (
          <>
            {/* Hotline CSKH */}
            <button
              onClick={async () => {
                try {
                  await openPhone({ phoneNumber: '1900638463' });
                } catch {
                  window.location.href = 'tel:1900638463';
                }
              }}
              className="flex-1 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 border border-slate-200 active:scale-98 transition cursor-pointer"
            >
              <PhoneCall className="w-4 h-4 text-emerald-600" />
              <span>Hotline 1900 63 84 63</span>
            </button>

            {/* Chat Tư Vấn OA */}
            <button
              onClick={async () => {
                try {
                  await openChat({ type: 'oa', id: '3870382725035413507' });
                } catch {
                  window.location.href = 'https://zalo.me/3870382725035413507';
                }
              }}
              className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#1B3A6B] to-[#00A3FF] hover:from-[#152e55] hover:to-[#0284C7] text-white font-black text-xs flex items-center justify-center gap-2 active:scale-98 transition shadow-md shadow-blue-900/20 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Tư vấn qua Zalo OA</span>
            </button>
          </>
        )}
      </div>

      {/* Success Toast Notification */}
      {showSuccessToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-gray-900/90 text-white text-xs font-bold shadow-xl backdrop-blur-md flex items-center gap-2 animate-slide-down">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Đã thêm vào giỏ hàng thành công!</span>
        </div>
      )}

      {/* Added to Cart Success Bottom Sheet Modal */}
      {showCartModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-0 animate-fade-in"
          onClick={() => setShowCartModal(false)}
        >
          <div 
            className="w-full max-w-md bg-white rounded-t-3xl p-5 space-y-4 shadow-2xl animate-slide-up border-t border-sky-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-emerald-600 font-extrabold text-sm">
                <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center">
                  <Check className="w-4 h-4 text-emerald-600" />
                </div>
                <span>Đã thêm vào giỏ hàng thành công!</span>
              </div>
              <button 
                onClick={() => setShowCartModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Added Product Preview */}
            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-gray-100">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-gray-200 shrink-0">
                <img src={images[0]} alt={product.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-xs text-gray-900 truncate">{product.name}</h4>
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-gray-500 text-[11px]">Số lượng: x{quantity}</span>
                  <span className="font-extrabold text-rose-600">{formatVND(product.price * quantity)}</span>
                </div>
              </div>
            </div>

            {/* Cart Status Summary */}
            <div className="flex items-center justify-between text-xs px-1 text-gray-600">
              <span>Giỏ hàng hiện có: <strong className="text-gray-900">{totalItemsCount} sản phẩm</strong></span>
              <span>Tạm tính: <strong className="text-rose-600 font-bold">{formatVND(totalAmount)}</strong></span>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                onClick={() => {
                  setShowCartModal(false);
                  onGoToCart();
                }}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#1B3A6B] to-[#00A3FF] hover:from-[#152e55] hover:to-[#0284C7] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 active:scale-98 transition cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Xem Giỏ Hàng & Thanh Toán Ngay</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setShowCartModal(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition active:scale-98 cursor-pointer"
              >
                Tiếp tục xem sản phẩm
              </button>
            </div>
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
