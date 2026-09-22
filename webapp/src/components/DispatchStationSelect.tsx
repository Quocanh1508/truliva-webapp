import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Building2, MapPin, User, Search, X, ChevronDown, Check, Sparkles, AlertTriangle, Clock } from 'lucide-react';
import { matchesSearchTerm } from '../utils/text';

export interface MainStationItem {
  id: string;
  name: string;
  techStations?: TechStationItem[];
  [key: string]: any;
}

export interface TechStationItem {
  id: string;
  name: string;
  mainStationId?: string;
  [key: string]: any;
}

export interface KtvDispatchItem {
  id: string;
  fullName: string;
  phoneNumber?: string;
  pendingOrderCount?: number;
  [key: string]: any;
}

interface DispatchStationSelectProps {
  stations: MainStationItem[];
  selectedMainId: string;
  onMainChange: (mainId: string) => void;
  selectedTechId: string;
  onTechChange: (techId: string) => void;
  ktvs: KtvDispatchItem[];
  selectedKtvId: string;
  onKtvChange: (ktvId: string) => void;
  suggestedMain?: any;
  suggestedTech?: any;
  suggestedKtv?: any;
  onApplySuggestions?: () => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const DispatchStationSelect: React.FC<DispatchStationSelectProps> = ({
  stations,
  selectedMainId,
  onMainChange,
  selectedTechId,
  onTechChange,
  ktvs,
  selectedKtvId,
  onKtvChange,
  suggestedMain,
  suggestedTech,
  suggestedKtv,
  onApplySuggestions,
  disabled = false,
  className = '',
  children
}) => {
  // Dropdown Open States
  const [isMainOpen, setIsMainOpen] = useState(false);
  const [isTechOpen, setIsTechOpen] = useState(false);
  const [isKtvOpen, setIsKtvOpen] = useState(false);

  // Search Queries
  const [mainSearch, setMainSearch] = useState('');
  const [techSearch, setTechSearch] = useState('');
  const [ktvSearch, setKtvSearch] = useState('');

  // Refs
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const techContainerRef = useRef<HTMLDivElement>(null);
  const ktvContainerRef = useRef<HTMLDivElement>(null);

  const mainInputRef = useRef<HTMLInputElement>(null);
  const techInputRef = useRef<HTMLInputElement>(null);
  const ktvInputRef = useRef<HTMLInputElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (mainContainerRef.current && !mainContainerRef.current.contains(e.target as Node)) {
        setIsMainOpen(false);
      }
      if (techContainerRef.current && !techContainerRef.current.contains(e.target as Node)) {
        setIsTechOpen(false);
      }
      if (ktvContainerRef.current && !ktvContainerRef.current.contains(e.target as Node)) {
        setIsKtvOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Autofocus search inputs
  useEffect(() => {
    if (isMainOpen) setTimeout(() => mainInputRef.current?.focus(), 50);
    else setMainSearch('');
  }, [isMainOpen]);

  useEffect(() => {
    if (isTechOpen) setTimeout(() => techInputRef.current?.focus(), 50);
    else setTechSearch('');
  }, [isTechOpen]);

  useEffect(() => {
    if (isKtvOpen) setTimeout(() => ktvInputRef.current?.focus(), 50);
    else setKtvSearch('');
  }, [isKtvOpen]);

  // Selected Objects
  const currentMain = useMemo(() => {
    return stations.find(s => s.id === selectedMainId) || null;
  }, [stations, selectedMainId]);

  const currentTech = useMemo(() => {
    if (!currentMain || !currentMain.techStations) return null;
    return currentMain.techStations.find(t => t.id === selectedTechId) || null;
  }, [currentMain, selectedTechId]);

  const currentKtv = useMemo(() => {
    return ktvs.find(k => k.id === selectedKtvId) || null;
  }, [ktvs, selectedKtvId]);

  // Filtered Main Stations (Đưa Truliva lên đầu tiên)
  const filteredMainStations = useMemo(() => {
    let list = [...stations];
    if (mainSearch.trim()) {
      list = list.filter(s => matchesSearchTerm(s.name, mainSearch));
    }
    return list.sort((a, b) => {
      const isATruliva = a.name?.trim().toLowerCase().includes('truliva');
      const isBTruliva = b.name?.trim().toLowerCase().includes('truliva');
      if (isATruliva && !isBTruliva) return -1;
      if (!isATruliva && isBTruliva) return 1;
      return 0;
    });
  }, [stations, mainSearch]);

  // Process Tech Stations (Priority Hubs first + Alphabetical, uniform styling)
  const sortedTechStations = useMemo(() => {
    if (!currentMain || !currentMain.techStations) return [];

    const allTech = [...currentMain.techStations];

    if (techSearch.trim()) {
      return allTech.filter(t => matchesSearchTerm(t.name, techSearch));
    }

    const isTruliva = currentMain.name?.toLowerCase() === 'truliva';
    if (!isTruliva) {
      return allTech.sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
    }

    const hubs: TechStationItem[] = [];
    const others: TechStationItem[] = [];

    allTech.forEach(t => {
      const n = t.name.toLowerCase();
      if (n.includes('hồ chí minh') || n.includes('hcm') || n.includes('hà nội') || n.includes('đà nẵng')) {
        hubs.push(t);
      } else {
        others.push(t);
      }
    });

    // Sort hubs by priority: HCM, HN, DN
    hubs.sort((a, b) => {
      const getPriority = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes('hồ chí minh') || n.includes('hcm')) return 1;
        if (n.includes('hà nội')) return 2;
        if (n.includes('đà nẵng')) return 3;
        return 99;
      };
      return getPriority(a.name) - getPriority(b.name);
    });

    others.sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));

    return [...hubs, ...others];
  }, [currentMain, techSearch]);

  // Sorted & Filtered KTVs (least busy first, suggested KTV on top)
  const filteredKtvs = useMemo(() => {
    const list = [...ktvs];
    list.sort((a, b) => {
      if (suggestedKtv && a.id === suggestedKtv.id) return -1;
      if (suggestedKtv && b.id === suggestedKtv.id) return 1;
      return (a.pendingOrderCount || 0) - (b.pendingOrderCount || 0);
    });

    if (!ktvSearch.trim()) return list;
    return list.filter(k => 
      matchesSearchTerm(k.fullName, ktvSearch) || 
      (k.phoneNumber && k.phoneNumber.includes(ktvSearch.replace(/\D/g, '')))
    );
  }, [ktvs, ktvSearch, suggestedKtv]);

  // Workload Helper
  const getWorkloadInfo = (count: number = 0) => {
    if (count === 0) {
      return {
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        text: 'Sẵn sàng'
      };
    }
    if (count <= 2) {
      return {
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
        dot: 'bg-blue-500',
        text: `Tải nhẹ (${count})`
      };
    }
    if (count <= 4) {
      return {
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
        text: `Tải TB (${count})`
      };
    }
    return {
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
      dot: 'bg-rose-500',
      text: `Tải cao (${count})`
    };
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 💡 SMART DISPATCH SUGGESTION BANNER (Nếu có gợi ý trạm/KTV) */}
      {(suggestedMain || suggestedTech || suggestedKtv) && (
        <div className="bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-sky-50/70 border border-blue-200/90 rounded-2xl p-3.5 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
              <Sparkles className="h-4 w-4 text-blue-600 animate-pulse" />
              <span>Gợi ý phân bổ thông minh theo địa chỉ khách:</span>
            </div>
            {onApplySuggestions && (
              <button
                type="button"
                onClick={onApplySuggestions}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer hover:shadow"
              >
                <span>Áp dụng ngay</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {suggestedMain && (
              <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-blue-200 shadow-2xs text-slate-800" title={`Trạm chính: ${suggestedMain.name}`}>
                <Building2 className="h-4 w-4 text-blue-600 shrink-0" />
                <span>Trạm: <strong className="font-bold text-slate-900">{suggestedMain.name}</strong></span>
              </div>
            )}
            {suggestedTech && (
              <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs text-slate-800" title={`Trạm kỹ thuật / Khu vực: ${suggestedTech.name}`}>
                <MapPin className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Khu vực: <strong className="font-bold text-slate-900">{suggestedTech.name}</strong></span>
              </div>
            )}
            {suggestedKtv && (
              <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs text-slate-800" title={`Kỹ thuật viên: ${suggestedKtv.fullName} (${suggestedKtv.pendingOrderCount || 0} đơn)`}>
                <User className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>KTV: <strong className="font-bold text-slate-900">{suggestedKtv.fullName}</strong> <span className="text-slate-500 font-normal">({suggestedKtv.pendingOrderCount || 0} đơn)</span></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Optional Slot (e.g. KTV Bán Hàng) */}
      {children}

      {/* ── 1. CHỌN TRẠM CHÍNH ── */}
      <div className={`relative ${isMainOpen ? 'z-30' : 'z-20'}`} ref={mainContainerRef}>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#1B3A6B]" />
            <span>Trạm chính *</span>
          </label>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsMainOpen(!isMainOpen);
              setIsTechOpen(false);
              setIsKtvOpen(false);
            }
          }}
          className={`w-full text-left transition-all duration-150 flex items-center justify-between gap-2 p-2.5 rounded-xl border-2 border-solid bg-white cursor-pointer shadow-xs ${
            isMainOpen
              ? 'border-blue-600 ring-2 ring-blue-500/20'
              : 'border-slate-300 hover:border-blue-500'
          } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
        >
          {currentMain ? (
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 text-[#1B3A6B] flex items-center justify-center font-bold text-xs shrink-0">
                <Building2 size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 text-xs truncate">
                  {currentMain.name}
                </div>
                {currentMain.techStations && currentMain.techStations.length > 0 && (
                  <div className="text-[10px] text-slate-500">
                    Bao gồm {currentMain.techStations.length} trạm kỹ thuật
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-500">-- Chọn Trạm chính --</span>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {currentMain && !disabled && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onMainChange('');
                  onTechChange('');
                  onKtvChange('');
                }}
                title="Bỏ chọn"
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isMainOpen ? 'rotate-180 text-blue-600' : ''}`} />
          </div>
        </button>

        {/* Dropdown Menu Trạm chính */}
        {isMainOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-150">
            {stations.length > 5 && (
              <div className="p-2 bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    ref={mainInputRef}
                    type="text"
                    value={mainSearch}
                    onChange={e => setMainSearch(e.target.value)}
                    placeholder="Tìm trạm chính..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-slate-800"
                  />
                  {mainSearch && (
                    <button type="button" onClick={() => setMainSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-y-auto p-1.5 space-y-0.5">
              {filteredMainStations.map(s => {
                const isSelected = s.id === selectedMainId;
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      onMainChange(s.id);
                      onTechChange('');
                      onKtvChange('');
                      setIsMainOpen(false);
                    }}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                      isSelected
                        ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                        : 'hover:bg-slate-50 text-slate-800 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 bg-slate-100 text-slate-600">
                        <Building2 size={13} />
                      </div>
                      <span className="truncate">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.techStations && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          {s.techStations.length} trạm KT
                        </span>
                      )}
                      {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                    </div>
                  </div>
                );
              })}
              {filteredMainStations.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                  Không tìm thấy trạm chính nào
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 2. CHỌN TRẠM KỸ THUẬT (SEARCHABLE & GROUPED) ── */}
      <div className={`relative ${isTechOpen ? 'z-30' : 'z-15'}`} ref={techContainerRef}>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-indigo-600" />
            <span>Trạm kỹ thuật *</span>
          </label>
          {currentTech && (
            <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
              Khu vực hoạt động
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={disabled || !selectedMainId}
          onClick={() => {
            if (!disabled && selectedMainId) {
              setIsTechOpen(!isTechOpen);
              setIsMainOpen(false);
              setIsKtvOpen(false);
            }
          }}
          className={`w-full text-left transition-all duration-150 flex items-center justify-between gap-2 p-2.5 rounded-xl border-2 border-solid bg-white cursor-pointer shadow-xs ${
            isTechOpen
              ? 'border-indigo-600 ring-2 ring-indigo-500/20'
              : 'border-slate-300 hover:border-indigo-500'
          } ${disabled || !selectedMainId ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
        >
          {currentTech ? (
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0">
                <MapPin size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 text-xs truncate">
                  {currentTech.name}
                </div>
                <div className="text-[10px] text-slate-500">
                  Thuộc: {currentMain?.name || 'Trạm chính'}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <MapPin className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-500">
                {selectedMainId ? '-- Chọn hoặc gõ tìm Trạm Kỹ thuật --' : 'Vui lòng chọn Trạm chính trước'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {currentTech && !disabled && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onTechChange('');
                  onKtvChange('');
                }}
                title="Bỏ chọn"
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isTechOpen ? 'rotate-180 text-indigo-600' : ''}`} />
          </div>
        </button>

        {/* Dropdown Menu Trạm Kỹ thuật (Hỗ trợ Search tức thì) */}
        {isTechOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-150">
            {/* Search input */}
            <div className="p-2 bg-indigo-50/40 border-b border-slate-100 sticky top-0 z-10">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-indigo-600" />
                <input
                  ref={techInputRef}
                  type="text"
                  value={techSearch}
                  onChange={e => setTechSearch(e.target.value)}
                  placeholder="Gõ tên trạm (VD: HCM, Hà Nội, Bình Thuận, Đà Nẵng...)..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 font-medium"
                />
                {techSearch && (
                  <button type="button" onClick={() => setTechSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="text-[10px] text-indigo-800/80 font-medium mt-1 px-1 flex justify-between">
                <span>{currentMain?.name} có {currentMain?.techStations?.length || 0} trạm</span>
                <span>Gõ để lọc nhanh</span>
              </div>
            </div>

            <div className="overflow-y-auto p-1.5 space-y-0.5">
              {sortedTechStations.map(t => {
                const isSelected = t.id === selectedTechId;
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      onTechChange(t.id);
                      onKtvChange('');
                      setIsTechOpen(false);
                    }}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-900 font-bold border border-indigo-200'
                        : 'hover:bg-slate-50 text-slate-800 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <MapPin size={13} className={isSelected ? 'text-indigo-600' : 'text-slate-400'} />
                      <span className="truncate">{t.name}</span>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
                  </div>
                );
              })}
              {sortedTechStations.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                  Không tìm thấy trạm nào khớp với "{techSearch}"
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 3. CHỌN KỸ THUẬT VIÊN (CÓ CHỈ SỐ TẢI & TÌM KIẾM) ── */}
      <div className={`relative ${isKtvOpen ? 'z-30' : 'z-10'}`} ref={ktvContainerRef}>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-emerald-700" />
            <span>Kỹ thuật viên thực hiện *</span>
          </label>
          {currentKtv && (() => {
            const w = getWorkloadInfo(currentKtv.pendingOrderCount || 0);
            return (
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${w.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${w.dot}`} />
                <span>{w.text}</span>
              </span>
            );
          })()}
        </div>

        <button
          type="button"
          disabled={disabled || !selectedTechId}
          onClick={() => {
            if (!disabled && selectedTechId) {
              setIsKtvOpen(!isKtvOpen);
              setIsMainOpen(false);
              setIsTechOpen(false);
            }
          }}
          className={`w-full text-left transition-all duration-150 flex items-center justify-between gap-2 p-2.5 rounded-xl border-2 border-solid bg-white cursor-pointer shadow-xs ${
            isKtvOpen
              ? 'border-emerald-600 ring-2 ring-emerald-500/20'
              : 'border-slate-300 hover:border-emerald-500'
          } ${disabled || !selectedTechId ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}`}
        >
          {currentKtv ? (
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                {currentKtv.fullName ? currentKtv.fullName.charAt(0).toUpperCase() : 'K'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 text-xs truncate">
                    {currentKtv.fullName}
                  </span>
                  {currentKtv.phoneNumber && (
                    <span className="font-mono text-[10px] text-slate-500">
                      {currentKtv.phoneNumber}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                  <Clock size={11} className="text-slate-400" />
                  <span>Đang phụ trách: <b>{currentKtv.pendingOrderCount || 0}</b> đơn</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <User className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-500">
                {selectedTechId ? '-- Chọn Kỹ thuật viên --' : 'Vui lòng chọn Trạm kỹ thuật trước'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {currentKtv && !disabled && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onKtvChange('');
                }}
                title="Bỏ chọn"
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isKtvOpen ? 'rotate-180 text-emerald-600' : ''}`} />
          </div>
        </button>

        {/* Dropdown Menu Kỹ thuật viên */}
        {isKtvOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-150">
            {ktvs.length > 4 && (
              <div className="p-2 bg-emerald-50/40 border-b border-slate-100 sticky top-0 z-10">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-700" />
                  <input
                    ref={ktvInputRef}
                    type="text"
                    value={ktvSearch}
                    onChange={e => setKtvSearch(e.target.value)}
                    placeholder="Tìm theo tên hoặc SĐT KTV..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800"
                  />
                  {ktvSearch && (
                    <button type="button" onClick={() => setKtvSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-y-auto p-1.5 space-y-1">
              {filteredKtvs.map(k => {
                const isSelected = k.id === selectedKtvId;
                const w = getWorkloadInfo(k.pendingOrderCount || 0);

                return (
                  <div
                    key={k.id}
                    onClick={() => {
                      onKtvChange(k.id);
                      setIsKtvOpen(false);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors text-xs select-none border ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-bold border-emerald-200 shadow-2xs'
                        : 'hover:bg-slate-50 text-slate-800 border-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        isSelected 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {k.fullName ? k.fullName.charAt(0).toUpperCase() : 'K'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-xs truncate" title={k.fullName}>
                          {k.fullName}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">
                          {k.phoneNumber && <span className="font-mono">{k.phoneNumber}</span>}
                          {k.phoneNumber && <span>•</span>}
                          <span className="font-medium text-slate-600">
                            {(k.pendingOrderCount || 0) === 0 ? '0 đơn' : `${k.pendingOrderCount} đơn`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${w.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.dot}`} />
                        <span>{w.text}</span>
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                    </div>
                  </div>
                );
              })}

              {filteredKtvs.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                  <User className="h-6 w-6 text-slate-300 mx-auto" />
                  <div>Trạm này hiện chưa có Kỹ thuật viên nào kích hoạt.</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ⚠️ CẢNH BÁO TẢI CAO (Nếu KTV được chọn đang có >= 5 đơn) */}
      {currentKtv && (currentKtv.pendingOrderCount || 0) >= 5 && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 animate-in fade-in duration-200">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <b>Cảnh báo tải cao:</b> KTV <b>{currentKtv.fullName}</b> hiện đang có <b>{currentKtv.pendingOrderCount}</b> đơn chưa hoàn thành. Cân nhắc giao cho KTV khác nếu đây là ca gấp.
          </div>
        </div>
      )}

      {/* 📌 TRẠNG THÁI PHÂN CÔNG */}
      {currentKtv && (
        <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>Đơn sẽ tự động chuyển sang trạng thái <b>"Đã phân công"</b> khi bạn bấm Lưu.</span>
        </div>
      )}
    </div>
  );
};
