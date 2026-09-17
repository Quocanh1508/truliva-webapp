import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, RotateCcw, Package, Sparkles, X } from 'lucide-react';
import { removeVietnameseTones } from '../utils/text';

export interface ProductVisualItem {
  name: string;
  category?: string;
  sku?: string;
  imageUrl?: string | null;
}

interface ProductVisualSelectProps {
  products: ProductVisualItem[];
  value: string;
  onChange: (value: string) => void;
  customValue: string;
  onCustomChange: (val: string) => void;
  isDark?: boolean;
  className?: string;
}

export const ProductVisualSelect: React.FC<ProductVisualSelectProps> = ({
  products,
  value,
  onChange,
  customValue,
  onCustomChange,
  isDark = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Find currently selected product object
  const selectedProduct = useMemo(() => {
    if (!value || value === 'Sản phẩm khác' || value === 'Thiết bị khác') return null;
    return products.find(p => p.name.trim().toLowerCase() === value.trim().toLowerCase()) || null;
  }, [products, value]);

  // Filter categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.category && p.name !== 'Thiết bị khác') cats.add(p.category);
    });
    return Array.from(cats);
  }, [products]);

  // Filtered products based on search term & category
  const filteredProducts = useMemo(() => {
    const cleanSearch = removeVietnameseTones(searchTerm || '').toLowerCase().trim();
    return products.filter(p => {
      if (p.name === 'Thiết bị khác') return false; // Handled separately at bottom
      if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
      if (!cleanSearch) return true;
      const cleanName = removeVietnameseTones(p.name || '').toLowerCase();
      const cleanSku = (p.sku || '').toLowerCase();
      const cleanCat = removeVietnameseTones(p.category || '').toLowerCase();
      return cleanName.includes(cleanSearch) || cleanSku.includes(cleanSearch) || cleanCat.includes(cleanSearch);
    });
  }, [products, searchTerm, selectedCategory]);

  const isCustomOther = value === 'Sản phẩm khác' || value === 'Thiết bị khác';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* ── TRIGGER / SELECTED PRODUCT PREVIEW ── */}
      {selectedProduct && !isOpen ? (
        <div
          className={`p-3 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 shadow-sm ${
            isDark
              ? 'bg-[#0D2444]/90 border-cyan-500/30 text-white hover:border-cyan-400'
              : 'bg-gradient-to-r from-blue-50/70 via-white to-sky-50/50 border-blue-200 text-slate-800 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Thumbnail Image */}
            <div className={`w-12 h-12 rounded-xl shrink-0 p-1 flex items-center justify-center overflow-hidden border ${
              isDark ? 'bg-white/10 border-white/10' : 'bg-white border-blue-100 shadow-2xs'
            }`}>
              {selectedProduct.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <Package className={`w-6 h-6 ${isDark ? 'text-cyan-400' : 'text-blue-600'}`} />
              )}
            </div>

            {/* Product Meta */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                  isDark ? 'bg-cyan-500/20 text-cyan-300' : 'bg-blue-100 text-blue-700'
                }`}>
                  {selectedProduct.category || 'Thiết bị'}
                </span>
                <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-0.5">
                  <Check size={12} className="stroke-[3]" /> Đã chọn
                </span>
              </div>
              <div className={`text-sm font-bold leading-snug break-words whitespace-normal mt-0.5 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`} title={selectedProduct.name}>
                {selectedProduct.name}
              </div>
            </div>
          </div>

          {/* Change Product Button */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs ${
              isDark
                ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/40'
                : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'
            }`}
          >
            <RotateCcw size={13} />
            <span>Đổi máy</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none transition flex items-center justify-between text-left font-medium shadow-xs cursor-pointer ${
            isDark
              ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-400'
              : 'bg-white border-gray-300 text-slate-800 focus:ring-2 focus:ring-blue-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Package size={17} className={isDark ? 'text-cyan-400' : 'text-blue-600'} />
            <span className={value ? (isDark ? 'text-white font-semibold' : 'text-slate-900 font-semibold') : (isDark ? 'text-slate-400' : 'text-gray-400')}>
              {value || '-- Bấm để chọn Thiết bị / Máy lọc --'}
            </span>
          </div>
          <ChevronDown size={18} className={`transition-transform duration-200 shrink-0 ml-2 ${
            isOpen ? 'rotate-180 text-blue-500' : isDark ? 'text-slate-400' : 'text-gray-400'
          }`} />
        </button>
      )}

      {/* ── DROPDOWN POPUP ── */}
      {isOpen && (
        <div
          className={`absolute left-0 right-0 top-full mt-1.5 rounded-2xl shadow-2xl z-50 overflow-hidden text-left border flex flex-col max-h-[380px] animate-in fade-in zoom-in-95 duration-150 ${
            isDark
              ? 'bg-[#091B33] border-cyan-500/30 text-white divide-y divide-white/10'
              : 'bg-white border-slate-200 text-slate-800 divide-y divide-gray-100'
          }`}
        >
          {/* Search Header */}
          <div className={`p-2.5 sticky top-0 z-10 flex items-center gap-2 ${
            isDark ? 'bg-[#091B33]/95 backdrop-blur-md' : 'bg-slate-50/95 backdrop-blur-md'
          }`}>
            <Search size={16} className={isDark ? 'text-cyan-400 shrink-0 ml-1' : 'text-slate-400 shrink-0 ml-1'} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Tìm theo tên máy, model (VD: Delica, Lavita, UR5840...)"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`w-full text-xs outline-none bg-transparent py-1 font-medium ${
                isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-800 placeholder:text-slate-400'
              }`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Category Filter Pills (if any) */}
          {categories.length > 1 && (
            <div className={`px-2.5 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 text-[11px] ${
              isDark ? 'bg-black/20' : 'bg-slate-100/60'
            }`}>
              <button
                type="button"
                onClick={() => setSelectedCategory('ALL')}
                className={`px-2 py-0.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
                  selectedCategory === 'ALL'
                    ? (isDark ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-[#1B3A6B] text-white')
                    : (isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                }`}
              >
                Tất cả ({products.filter(p => p.name !== 'Thiết bị khác').length})
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
                    selectedCategory === cat
                      ? (isDark ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-[#1B3A6B] text-white')
                      : (isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Product Items List */}
          <div className="overflow-y-auto max-h-64 p-2 space-y-1 custom-scrollbar">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((p) => {
                const isSelected = value === p.name;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      onChange(p.name);
                      onCustomChange('');
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-2 rounded-xl transition flex items-center justify-between gap-2.5 group cursor-pointer ${
                      isSelected
                        ? isDark
                          ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                          : 'bg-blue-50 text-[#1B3A6B] font-bold border border-blue-200'
                        : isDark
                          ? 'hover:bg-white/10 text-slate-200'
                          : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1 py-0.5">
                      {/* Product Thumbnail */}
                      <div className={`w-12 h-12 rounded-xl shrink-0 p-1 flex items-center justify-center overflow-hidden border ${
                        isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-2xs'
                      }`}>
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Package className={`w-5 h-5 ${isDark ? 'text-cyan-400' : 'text-blue-500'}`} />
                        )}
                      </div>

                      {/* Product Text */}
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs sm:text-sm font-bold leading-snug break-words whitespace-normal ${
                          isDark ? 'text-white' : 'text-slate-800'
                        }`}>
                          {p.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {p.category && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                              isDark ? 'bg-white/10 text-cyan-300' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {p.category}
                            </span>
                          )}
                          {p.sku && (
                            <span className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>
                              • SKU: {p.sku}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div className={`p-1 rounded-full shrink-0 ${isDark ? 'bg-cyan-500 text-slate-950' : 'bg-blue-600 text-white'}`}>
                        <Check size={12} className="stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-400 italic">
                Không tìm thấy sản phẩm khớp với từ khóa "{searchTerm}"
              </div>
            )}

            {/* Option: Sản phẩm khác */}
            <div className={`pt-1 border-t ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
              <button
                type="button"
                onClick={() => {
                  onChange('Sản phẩm khác');
                  onCustomChange('');
                  setIsOpen(false);
                }}
                className={`w-full text-left p-2 rounded-xl transition flex items-center gap-2.5 font-bold text-xs cursor-pointer ${
                  isCustomOther
                    ? isDark
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                    : isDark
                      ? 'text-cyan-400 hover:bg-white/10'
                      : 'text-blue-600 hover:bg-blue-50'
                }`}
              >
                <div className={`w-11 h-11 rounded-lg shrink-0 flex items-center justify-center border border-dashed ${
                  isDark ? 'bg-white/5 border-cyan-400/40 text-cyan-300' : 'bg-blue-50/50 border-blue-300 text-blue-600'
                }`}>
                  <Sparkles size={18} />
                </div>
                <div className="flex-1">
                  <div>+ Sản phẩm / Thiết bị khác</div>
                  <div className="text-[10px] font-normal opacity-75">Tự nhập tên thiết bị nếu không có trong danh sách</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INPUT FOR CUSTOM PRODUCT IF "SẢN PHẨM KHÁC" SELECTED ── */}
      {isCustomOther && (
        <div className="mt-2 space-y-1 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <label className={`text-[11px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Tên sản phẩm cụ thể:
            </label>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="text-[11px] text-blue-500 hover:underline cursor-pointer"
            >
              Chọn lại từ danh sách
            </button>
          </div>
          <input
            type="text"
            placeholder="Nhập tên sản phẩm cụ thể (VD: Máy lọc không khí Sharp, Máy lọc tổng...)"
            value={customValue}
            onChange={e => onCustomChange(e.target.value)}
            className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-200 ${
              isDark ? 'bg-white/10 border-white/20 text-white placeholder:text-slate-400' : 'bg-white border-gray-300 text-slate-800'
            }`}
            required
            autoFocus
          />
        </div>
      )}
    </div>
  );
};
