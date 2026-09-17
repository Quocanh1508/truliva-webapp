import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Wrench, Settings, Calendar, Clock, Tag, Search, X, ChevronDown, Check, Truck, Package, RefreshCw, Shield, AlertCircle } from 'lucide-react';
import { WARRANTY_SERVICE_GROUPS, REPAIR_SERVICE_GROUPS } from '../utils/workTypes';
import { matchesSearchTerm, removeVietnameseTones } from '../utils/text';

export interface PromoItem {
  id: string;
  code: string;
  promoMonths: number;
  isLocked?: boolean;
  [key: string]: any;
}

interface OrderClassificationSectionProps {
  workType: string;
  onWorkTypeChange: (workType: string) => void;
  serviceType: string;
  onServiceTypeChange: (serviceType: string) => void;
  appointmentDate: string;
  onAppointmentDateChange: (date: string) => void;
  appointmentTime: string;
  onAppointmentTimeChange: (time: string) => void;
  todayStr?: string;
  rescheduleReason: string;
  onRescheduleReasonChange: (reason: string) => void;
  assignPromoCode: string;
  onAssignPromoCodeChange: (code: string) => void;
  promosList?: PromoItem[];
  className?: string;
}

const WORK_TYPE_CONFIGS: Record<string, { label: string; icon: React.FC<any>; color: string; desc: string }> = {
  'Giao hàng và Lắp đặt': {
    label: 'Giao hàng và Lắp đặt',
    icon: Truck,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    desc: 'Vận chuyển máy & lắp đặt hoàn thiện'
  },
  'Lắp đặt': {
    label: 'Lắp đặt',
    icon: Wrench,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    desc: 'Lắp đặt thiết bị máy lọc, phụ kiện'
  },
  'Giao hàng': {
    label: 'Giao hàng',
    icon: Package,
    color: 'text-sky-600 bg-sky-50 border-sky-200',
    desc: 'Giao kiện hàng tới tận nơi'
  },
  'Thay lọc': {
    label: 'Thay lọc',
    icon: RefreshCw,
    color: 'text-teal-600 bg-teal-50 border-teal-200',
    desc: 'Bảo dưỡng định kỳ, thay thế lõi lọc'
  },
  'Bảo hành': {
    label: 'Bảo hành',
    icon: Shield,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    desc: 'Kiểm tra & xử lý bảo hành chính hãng'
  },
  'Sửa chữa': {
    label: 'Sửa chữa',
    icon: Settings,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    desc: 'Sửa chữa, thay linh kiện có tính phí'
  }
};


const TIME_PRESETS = [
  { label: '08:30 (Sáng)', time: '08:30' },
  { label: '10:00 (Trưa)', time: '10:00' },
  { label: '14:00 (Chiều)', time: '14:00' },
  { label: '16:30 (Cuối ngày)', time: '16:30' }
];

export const OrderClassificationSection: React.FC<OrderClassificationSectionProps> = ({
  workType,
  onWorkTypeChange,
  serviceType,
  onServiceTypeChange,
  appointmentDate,
  onAppointmentDateChange,
  appointmentTime,
  onAppointmentTimeChange,
  todayStr = new Date().toISOString().split('T')[0],
  rescheduleReason,
  onRescheduleReasonChange,
  assignPromoCode,
  onAssignPromoCodeChange,
  promosList = [],
  className = ''
}) => {
  // Dropdown states
  const [isWorkTypeOpen, setIsWorkTypeOpen] = useState(false);
  const [isServiceDropdownOpen, setIsServiceDropdownOpen] = useState(false);
  const [isPromoOpen, setIsPromoOpen] = useState(false);

  // Refs for click outside
  const workTypeRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<HTMLDivElement>(null);
  const promoRef = useRef<HTMLDivElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (workTypeRef.current && !workTypeRef.current.contains(e.target as Node)) {
        setIsWorkTypeOpen(false);
      }
      if (serviceRef.current && !serviceRef.current.contains(e.target as Node)) {
        setIsServiceDropdownOpen(false);
      }
      if (promoRef.current && !promoRef.current.contains(e.target as Node)) {
        setIsPromoOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isSingleService = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'].includes(workType);
  const isComplexService = workType === 'Bảo hành' || workType === 'Sửa chữa';

  // Filtered services for warranty / repair
  const filteredServiceGroups = useMemo(() => {
    if (!isComplexService) return [];
    const groups = workType === 'Bảo hành' ? WARRANTY_SERVICE_GROUPS : REPAIR_SERVICE_GROUPS;
    const query = removeVietnameseTones(serviceType || '').toLowerCase().trim();

    const result: { groupName: string; services: string[] }[] = [];
    Object.entries(groups).forEach(([groupName, services]) => {
      const matched = services.filter(s => {
        if (!query) return true;
        return matchesSearchTerm(s, query);
      });
      if (matched.length > 0) {
        result.push({ groupName, services: matched });
      }
    });
    return result;
  }, [workType, serviceType, isComplexService]);

  const currentWorkTypeConfig = WORK_TYPE_CONFIGS[workType];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── 1. LOẠI CÔNG VIỆC ── */}
      <div className={`relative ${isWorkTypeOpen ? 'z-40' : 'z-20'}`} ref={workTypeRef}>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-[#1B3A6B]" />
            <span>Loại công việc *</span>
          </label>
          {workType && (
            <span className="text-[10px] text-slate-500 font-medium">
              Đã chọn
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setIsWorkTypeOpen(!isWorkTypeOpen);
            setIsServiceDropdownOpen(false);
            setIsPromoOpen(false);
          }}
          className={`w-full text-left transition-all duration-150 flex items-center justify-between gap-2 p-2.5 rounded-xl border-2 border-solid bg-white cursor-pointer shadow-xs ${
            isWorkTypeOpen
              ? 'border-blue-600 ring-2 ring-blue-500/20'
              : 'border-slate-300 hover:border-blue-500'
          }`}
        >
          {currentWorkTypeConfig ? (
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${currentWorkTypeConfig.color}`}>
                <currentWorkTypeConfig.icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-900 text-xs truncate">
                  {currentWorkTypeConfig.label}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {currentWorkTypeConfig.desc}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Wrench className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-500">-- Chọn Loại công việc --</span>
            </div>
          )}

          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isWorkTypeOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </button>

        {/* Dropdown Menu Loại công việc */}
        {isWorkTypeOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150">
            {Object.entries(WORK_TYPE_CONFIGS).map(([key, config]) => {
              const isSelected = workType === key;
              const Icon = config.icon;
              return (
                <div
                  key={key}
                  onClick={() => {
                    onWorkTypeChange(key);
                    const noService = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'].includes(key);
                    if (noService) {
                      onServiceTypeChange('Công việc đã bao gồm dịch vụ');
                    } else {
                      onServiceTypeChange('');
                    }
                    setIsWorkTypeOpen(false);
                  }}
                  className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors text-xs select-none border ${
                    isSelected
                      ? 'bg-blue-50 text-blue-900 font-bold border-blue-200'
                      : 'hover:bg-slate-50 text-slate-800 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${config.color}`}>
                      <Icon size={14} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{config.label}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{config.desc}</div>
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 2. LOẠI DỊCH VỤ CHI TIẾT ── */}
      <div className={`relative ${isServiceDropdownOpen ? 'z-30' : 'z-15'}`} ref={serviceRef}>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Settings className="w-3.5 h-3.5 text-blue-600" />
            <span>Loại dịch vụ chi tiết *</span>
          </label>
        </div>

        {isSingleService ? (
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 shadow-2xs">
            <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-bold">
              <Check size={14} className="stroke-[3]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-900 text-xs">Công việc đã bao gồm dịch vụ</div>
              <div className="text-[10px] text-slate-500">Được tự động áp dụng theo loại công việc "{workType}"</div>
            </div>
          </div>
        ) : isComplexService ? (
          <div className="relative">
            <div className="relative">
              <input
                type="text"
                value={serviceType}
                onChange={e => {
                  onServiceTypeChange(e.target.value);
                  setIsServiceDropdownOpen(true);
                }}
                onFocus={() => setIsServiceDropdownOpen(true)}
                placeholder="Gõ để tìm kiếm & chọn dịch vụ..."
                className="w-full pl-8 pr-7 py-2.5 text-xs bg-white border-2 border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-slate-800 font-medium shadow-xs"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              {serviceType && (
                <button
                  type="button"
                  onClick={() => onServiceTypeChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {isServiceDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-64 animate-in fade-in zoom-in-95 duration-150">
                <div className="overflow-y-auto p-1.5 space-y-2">
                  {filteredServiceGroups.map(({ groupName, services }) => (
                    <div key={groupName} className="space-y-0.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 bg-slate-50 rounded-md">
                        {groupName}
                      </div>
                      {services.map(s => {
                        const isSelected = serviceType === s;
                        return (
                          <div
                            key={s}
                            onClick={() => {
                              onServiceTypeChange(s);
                              setIsServiceDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                              isSelected
                                ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                                : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <span className="truncate">{s}</span>
                            {isSelected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {filteredServiceGroups.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-400 italic">
                      Không tìm thấy dịch vụ nào khớp với "{serviceType}"
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 text-xs text-slate-400">
            <AlertCircle size={15} />
            <span>Vui lòng chọn loại công việc ở trên trước</span>
          </div>
        )}
      </div>

      {/* ── 3. THỜI GIAN HẸN KHÁCH ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>Thời gian hẹn khách *</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Ngày hẹn</label>
            <input
              type="date"
              value={appointmentDate}
              min={todayStr}
              onChange={e => {
                onAppointmentDateChange(e.target.value);
                if (!appointmentTime) onAppointmentTimeChange('08:30');
              }}
              className="w-full p-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Giờ hẹn</label>
            <input
              type="time"
              value={appointmentTime}
              onChange={e => onAppointmentTimeChange(e.target.value)}
              className="w-full p-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all cursor-pointer"
            />
          </div>
        </div>

        {/* Quick Time Preset Chips */}
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <span className="text-[10px] text-slate-400 font-medium">Khung giờ:</span>
          {TIME_PRESETS.map(preset => (
            <button
              key={preset.time}
              type="button"
              onClick={() => onAppointmentTimeChange(preset.time)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer ${
                appointmentTime === preset.time
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 4. LÝ DO HẸN LẠI (NẾU CÓ) ── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Lý do hẹn lại (nếu có)</span>
          </label>
          <span className="text-[10px] text-slate-400">Không bắt buộc</span>
        </div>

        <textarea
          rows={2}
          value={rescheduleReason}
          onChange={e => onRescheduleReasonChange(e.target.value)}
          placeholder="Khách bận, KTV kẹt lịch..."
          className="w-full p-2.5 bg-white border-2 border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 shadow-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all resize-none"
        />
      </div>

      {/* ── 5. CHƯƠNG TRÌNH KHUYẾN MÃI BẢO HÀNH ── */}
      <div className={`relative ${isPromoOpen ? 'z-20' : 'z-10'}`} ref={promoRef}>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-purple-600" />
            <span>Chương trình khuyến mãi bảo hành</span>
          </label>
          {assignPromoCode && (
            <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded">
              Đang áp dụng
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setIsPromoOpen(!isPromoOpen);
            setIsWorkTypeOpen(false);
            setIsServiceDropdownOpen(false);
          }}
          className={`w-full text-left transition-all duration-150 flex items-center justify-between gap-2 p-2.5 rounded-xl border-2 border-solid bg-white cursor-pointer shadow-xs ${
            isPromoOpen
              ? 'border-purple-600 ring-2 ring-purple-500/20'
              : 'border-slate-300 hover:border-purple-500'
          }`}
        >
          {assignPromoCode ? (
            (() => {
              const promo = promosList.find(p => p.code === assignPromoCode);
              return (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Tag className="h-4 w-4 text-purple-600 shrink-0" />
                  <span className="font-bold text-slate-900 text-xs truncate">
                    {assignPromoCode}
                  </span>
                  {promo && (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-1.5 py-0.2 rounded shrink-0">
                      +{promo.promoMonths} tháng BH
                    </span>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Tag className="h-4 w-4 text-slate-400" />
              <span className="font-medium text-slate-500">Không áp dụng khuyến mãi</span>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0">
            {assignPromoCode && (
              <span
                onClick={e => {
                  e.stopPropagation();
                  onAssignPromoCodeChange('');
                }}
                title="Bỏ chọn"
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isPromoOpen ? 'rotate-180 text-purple-600' : ''}`} />
          </div>
        </button>

        {isPromoOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden flex flex-col max-h-60 animate-in fade-in zoom-in-95 duration-150">
            <div className="overflow-y-auto p-1.5 space-y-0.5">
              <div
                onClick={() => {
                  onAssignPromoCodeChange('');
                  setIsPromoOpen(false);
                }}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                  !assignPromoCode ? 'bg-slate-100 font-semibold text-slate-900' : 'hover:bg-slate-50 text-slate-600'
                }`}
              >
                <span>Không áp dụng</span>
                {!assignPromoCode && <Check className="h-4 w-4 text-purple-600" />}
              </div>

              {promosList
                .filter(p => !p.isLocked || p.code === assignPromoCode)
                .map(p => {
                  const isSelected = assignPromoCode === p.code;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        onAssignPromoCodeChange(p.code);
                        setIsPromoOpen(false);
                      }}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                        isSelected
                          ? 'bg-purple-50 text-purple-900 font-bold border border-purple-200'
                          : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Tag size={13} className="text-purple-600 shrink-0" />
                        <span className="font-semibold truncate">{p.code}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                          +{p.promoMonths} tháng
                        </span>
                        {isSelected && <Check className="h-4 w-4 text-purple-600" />}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
