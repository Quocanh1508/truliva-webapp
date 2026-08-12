import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronRight, Search, X, Check, Store } from 'lucide-react';
import { removeVietnameseTones } from '../utils/text';

export interface SourceGroup {
  name: string;
  items?: string[];
}

export const POS_SOURCE_HIERARCHY: SourceGroup[] = [
  {
    name: 'DT North',
    items: [
      'DT North - Phúc Thịnh',
      'DT North - Vinadu',
      'DT North - PNN HOME',
      'DT North - Hưng Thịnh',
      'DT North - TDH',
      'DT North - KSC'
    ]
  },
  {
    name: 'DT South',
    items: [
      'DT South - Tâm Anh',
      'DT South - 2B'
    ]
  },
  {
    name: 'Facebook',
    items: [
      'Facebook - Fanpage Truliva',
      'Facebook - Messenger'
    ]
  },
  {
    name: 'Trạm/KTV'
  },
  {
    name: 'DTC',
    items: [
      'CRM - Email',
      'CRM - Hotline',
      'CRM - Zalo cá nhân',
      'DTC - Internal',
      'DTC - Event',
      'DTC - Partner',
      'DTC - KOL',
      'DTC - Referral',
      'DTC - website'
    ]
  },
  {
    name: 'Lazada',
    items: [
      'Lazada - Truliva Flagship Store'
    ]
  },
  {
    name: 'B2B'
  },
  {
    name: 'MT',
    items: [
      'MT - Cao Phong',
      'MT - Nguyen Kim'
    ]
  },
  {
    name: 'TikTok',
    items: [
      'TikTok - Máy Lọc Nước Truliva',
      'TikTok - Truliva Việt Nam'
    ]
  },
  {
    name: 'Shopee',
    items: [
      'Shopee - Truliva Official Store'
    ]
  },
  {
    name: 'Instagram'
  },
  {
    name: 'Zalo',
    items: [
      'Zalo - Zalo OA Truliva'
    ]
  }
];

interface SourceTreeSelectProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
}

export default function SourceTreeSelect({
  value,
  onChange,
  placeholder = 'Chọn hoặc tìm nguồn đơn hàng...'
}: SourceTreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeParent, setActiveParent] = useState<string | null>(POS_SOURCE_HIERARCHY[0].name);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter items if searching
  const isSearching = searchTerm.trim().length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const cleanSearch = removeVietnameseTones(searchTerm.trim().toLowerCase());
    const results: { label: string; parent: string }[] = [];

    POS_SOURCE_HIERARCHY.forEach(group => {
      // Check group name
      if (removeVietnameseTones(group.name.toLowerCase()).includes(cleanSearch)) {
        results.push({ label: group.name, parent: group.name });
      }
      // Check items
      if (group.items) {
        group.items.forEach(item => {
          if (removeVietnameseTones(item.toLowerCase()).includes(cleanSearch)) {
            results.push({ label: item, parent: group.name });
          }
        });
      }
    });

    return results;
  }, [searchTerm, isSearching]);

  const activeGroup = useMemo(() => {
    return POS_SOURCE_HIERARCHY.find(g => g.name === activeParent);
  }, [activeParent]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2.5 bg-white border rounded-lg text-sm text-left flex items-center justify-between transition-all outline-none ${
          isOpen ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-300 hover:border-gray-400'
        } ${!value ? 'text-gray-400' : 'text-gray-800 font-medium'}`}
      >
        <span className="truncate flex items-center gap-2">
          <Store size={15} className="text-blue-600 shrink-0" />
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X size={14} />
            </span>
          )}
          <ChevronRight size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {/* Cascading Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden min-w-[340px] md:min-w-[460px]">
          {/* Search Bar */}
          <div className="p-2.5 border-b border-gray-100 bg-gray-50/80 flex items-center gap-2">
            <Search size={15} className="text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Tìm kiếm nguồn POS (VD: DTC, Phúc Thịnh, Hotline...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
              autoFocus
            />
            {searchTerm && (
              <button type="button" onClick={() => setSearchTerm('')} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search Mode Results */}
          {isSearching ? (
            <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
              {searchResults.length > 0 ? (
                searchResults.map((res, idx) => (
                  <div
                    key={`${res.label}-${idx}`}
                    onClick={() => handleSelect(res.label)}
                    className={`px-3 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                      value === res.label ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono text-[10px] uppercase bg-gray-100 px-1.5 py-0.5 rounded">{res.parent}</span>
                      <span>{res.label}</span>
                    </div>
                    {value === res.label && <Check size={14} className="text-blue-600" />}
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-gray-500">
                  Không tìm thấy nguồn khớp với "{searchTerm}".
                  <button
                    type="button"
                    onClick={() => handleSelect(searchTerm.trim())}
                    className="block mx-auto mt-2 text-blue-600 font-medium hover:underline"
                  >
                    + Dùng nguồn tự nhập "{searchTerm.trim()}"
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* POS Cascading 2-Column Layout (Matching POS UI exact layout) */
            <div className="flex divide-x divide-gray-100 max-h-72">
              {/* Left Column: Parents */}
              <div className="w-1/2 overflow-y-auto p-1 space-y-0.5 bg-gray-50/50">
                {POS_SOURCE_HIERARCHY.map((group) => {
                  const hasChildren = group.items && group.items.length > 0;
                  const isActive = activeParent === group.name;
                  const isSelected = value === group.name;

                  return (
                    <div
                      key={group.name}
                      onMouseEnter={() => setActiveParent(group.name)}
                      onClick={() => {
                        setActiveParent(group.name);
                        handleSelect(group.name);
                      }}
                      className={`px-3 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                        isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span className="truncate">{group.name}</span>
                      {hasChildren ? (
                        <ChevronRight size={14} className="text-gray-400 shrink-0" />
                      ) : isSelected ? (
                        <Check size={14} className="text-blue-600 shrink-0" />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Sub-items */}
              <div className="w-1/2 overflow-y-auto p-1.5 space-y-0.5 bg-white">
                {activeGroup && activeGroup.items && activeGroup.items.length > 0 ? (
                  activeGroup.items.map((subItem) => {
                    const isSelected = value === subItem;
                    return (
                      <div
                        key={subItem}
                        onClick={() => handleSelect(subItem)}
                        className={`px-3 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                          isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span className="truncate">{subItem}</span>
                        {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-4 text-center text-xs text-gray-400">
                    Bấm trực tiếp để chọn <br />
                    <b className="text-gray-600">{activeParent}</b>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
