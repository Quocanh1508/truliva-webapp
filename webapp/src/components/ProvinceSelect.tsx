import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { PANCAKE_PROVINCES, PRIORITY_PROVINCES, normalizeProvince } from '../utils/provinces';
import { removeVietnameseTones } from '../utils/text';

interface ProvinceSelectProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  error?: string;
}

export const ProvinceSelect: React.FC<ProvinceSelectProps> = ({
  value,
  onChange,
  placeholder = 'Chọn hoặc gõ tỉnh thành...',
  required = false,
  disabled = false,
  className = '',
  error
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Đồng bộ query hiển thị với value khi không gõ
  useEffect(() => {
    if (!isFocused) {
      setQuery(value || '');
    }
  }, [value, isFocused]);

  // Click ngoài container -> Đóng dropdown & Reset/Normalize kết quả gõ
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleBlur();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [query, value]);

  // Xử lý khi rời khỏi ô nhập (Blur / Click ngoài) -> "Không cho lưu kq typing"
  const handleBlur = () => {
    setIsFocused(false);
    setIsOpen(false);

    if (!query || !query.trim()) {
      onChange('');
      setQuery('');
      return;
    }

    // Thử chuẩn hóa chuỗi người dùng đã nhập
    const normalized = normalizeProvince(query);
    if (normalized) {
      onChange(normalized);
      setQuery(normalized);
    } else {
      // Nếu không khớp với bất kỳ Tỉnh/TP nào trong danh sách Pancake POS -> Huỷ kết quả typing, trả về value cũ hợp lệ
      setQuery(value || '');
    }
  };

  // Filter danh sách theo query (bỏ qua dấu tiếng Việt)
  const filteredProvinces = useMemo(() => {
    if (!query || !query.trim() || query === value) {
      return PANCAKE_PROVINCES;
    }
    const cleanQ = removeVietnameseTones(query.trim().toLowerCase());
    return PANCAKE_PROVINCES.filter(p => 
      removeVietnameseTones(p.toLowerCase()).includes(cleanQ)
    );
  }, [query, value]);

  const handleSelect = (prov: string) => {
    onChange(prov);
    setQuery(prov);
    setIsOpen(false);
    setIsFocused(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          required={required}
          value={isFocused ? query : (value || '')}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(true);
            setQuery(value || '');
          }}
          placeholder={placeholder}
          className={className || `w-full border rounded-lg p-2 pr-14 text-sm outline-none transition-all ${
            error ? 'border-red-500 focus:ring-1 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
          } ${disabled ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'bg-white text-gray-800'}`}
        />

        <div className="absolute right-2 flex items-center gap-1 text-gray-400">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              title="Xóa lựa chọn"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (disabled) return;
              if (isOpen) {
                handleBlur();
              } else {
                setIsOpen(true);
                setIsFocused(true);
                if (inputRef.current) inputRef.current.focus();
              }
            }}
            className="p-1 hover:text-gray-600 transition-colors"
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      {/* Dropdown Menu List */}
      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto p-1 text-sm space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {filteredProvinces.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-gray-400 font-medium">
              Không tìm thấy tỉnh thành phù hợp với từ khóa "{query}"
            </div>
          ) : (
            <>
              {filteredProvinces.map((prov) => {
                const isSelected = value === prov;
                const isPriority = PRIORITY_PROVINCES.includes(prov) && (!query || query === value);

                return (
                  <button
                    key={prov}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // Ngăn input blur trước khi nhận event click
                      handleSelect(prov);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : isPriority
                        ? 'hover:bg-blue-50/60 text-gray-900 font-semibold bg-gray-50/50'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {prov}
                      {isPriority && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.2 rounded">
                          Ưu tiên
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProvinceSelect;
