import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Check, MapPin } from 'lucide-react';
import { removeVietnameseTones } from '../utils/text';

export interface SalesKtvItem {
  id: string;
  fullName: string;
  phoneNumber?: string;
  techStation?: {
    name: string;
  } | null;
  [key: string]: any;
}

interface SalesKtvSelectProps {
  value: string;
  onChange: (ktvId: string) => void;
  ktvs: SalesKtvItem[];
  disabled?: boolean;
  className?: string;
}

export const SalesKtvSelect: React.FC<SalesKtvSelectProps> = ({
  value,
  onChange,
  ktvs,
  disabled = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tìm KTV hiện đang được chọn
  const selectedKtv = useMemo(() => {
    return ktvs.find(k => k.id === value) || null;
  }, [ktvs, value]);

  // Click outside để đóng menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Autofocus vào input search khi mở dropdown
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Lọc danh sách KTV theo search query (hỗ trợ không dấu, số điện thoại, tên trạm)
  const filteredKtvs = useMemo(() => {
    if (!searchQuery.trim()) return ktvs;
    const cleanQ = removeVietnameseTones(searchQuery.trim().toLowerCase());
    const digitsQ = searchQuery.replace(/\D/g, '');

    return ktvs.filter(k => {
      const cleanName = removeVietnameseTones((k.fullName || '').toLowerCase());
      const cleanPhone = (k.phoneNumber || '').replace(/\D/g, '');
      const cleanStation = removeVietnameseTones((k.techStation?.name || '').toLowerCase());

      const matchName = cleanName.includes(cleanQ);
      const matchPhone = digitsQ ? cleanPhone.includes(digitsQ) : false;
      const matchStation = cleanStation.includes(cleanQ);

      return matchName || matchPhone || matchStation;
    });
  }, [ktvs, searchQuery]);

  const handleSelect = (ktvId: string) => {
    onChange(ktvId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Box kích hoạt (Trigger Button) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full text-left transition-all duration-150 flex items-center justify-between gap-2 p-2.5 rounded-xl border-2 border-solid bg-white cursor-pointer shadow-xs ${
          isOpen
            ? 'border-emerald-600 ring-2 ring-emerald-500/20'
            : 'border-emerald-300 hover:border-emerald-500'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}`}
      >
        {selectedKtv ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
              {selectedKtv.fullName ? selectedKtv.fullName.charAt(0).toUpperCase() : 'K'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900 text-xs truncate">
                  {selectedKtv.fullName}
                </span>
                {selectedKtv.phoneNumber && (
                  <span className="inline-flex items-center font-mono text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/70">
                    {selectedKtv.phoneNumber}
                  </span>
                )}
              </div>
              {selectedKtv.techStation?.name && (
                <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 text-gray-400" />
                  <span>Trạm: {selectedKtv.techStation.name}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <Search className="h-4 w-4 text-emerald-600/70" />
            <span className="font-medium text-gray-500">
              -- Chọn hoặc gõ tìm KTV bán hàng --
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {selectedKtv && !disabled && (
            <span
              onClick={handleClear}
              title="Bỏ chọn"
              className="p-1 hover:bg-gray-100 rounded-md text-gray-400 hover:text-gray-600 transition"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-emerald-600' : ''
            }`}
          />
        </div>
      </button>

      {/* Floating Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-emerald-200/90 z-50 overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-150">
          {/* Ô gõ tìm kiếm tức thì */}
          <div className="p-2 bg-emerald-50/40 border-b border-gray-100 sticky top-0 z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-700" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Gõ tên, SĐT hoặc trạm KTV để lọc..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-gray-800 placeholder-gray-400 font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="text-[10px] text-emerald-800/80 font-medium mt-1 px-1 flex items-center justify-between">
              <span>Hỗ trợ tìm theo tên, số điện thoại hoặc trạm</span>
              <span className="font-bold">{filteredKtvs.length} KTV</span>
            </div>
          </div>

          {/* Danh sách KTV cuộn */}
          <div className="overflow-y-auto flex-1 p-1 divide-y divide-gray-50">
            {/* Lựa chọn không chọn / chưa xác định */}
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`w-full text-left p-2 rounded-lg text-xs transition flex items-center justify-between cursor-pointer ${
                !value
                  ? 'bg-emerald-50 text-emerald-900 font-bold'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className="italic">-- Không có / Chưa xác định --</span>
              {!value && <Check className="h-3.5 w-3.5 text-emerald-600" />}
            </button>

            {filteredKtvs.length === 0 ? (
              <div className="py-6 px-4 text-center text-gray-400 text-xs">
                Không tìm thấy KTV nào khớp với "<strong>{searchQuery}</strong>"
              </div>
            ) : (
              filteredKtvs.map((k: SalesKtvItem) => {
                const isSelected = k.id === value;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => handleSelect(k.id)}
                    className={`w-full text-left p-2 rounded-lg text-xs transition flex items-center justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/90 text-emerald-950 font-bold border border-emerald-200/80'
                        : 'hover:bg-emerald-50/40 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {k.fullName ? k.fullName.charAt(0).toUpperCase() : 'K'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-gray-900 text-xs truncate">
                          {k.fullName}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                          {k.phoneNumber && (
                            <span className="font-mono text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded font-medium">
                              {k.phoneNumber}
                            </span>
                          )}
                          {k.techStation?.name && (
                            <span className="truncate">Trạm {k.techStation.name}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="p-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
