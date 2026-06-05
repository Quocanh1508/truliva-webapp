import { useState, useEffect, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  X 
} from 'lucide-react';

interface DateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onChange: (start: string, end: string) => void;
  placeholder?: string;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  placeholder = 'Bắt đầu - kết thúc'
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse strings to Date objects for calendar logic
  const parseDateString = (str: string): Date | null => {
    if (!str) return null;
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatDateString = (date: Date | null): string => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const start = parseDateString(startDate);
  const end = parseDateString(endDate);

  const [tempHoverDate, setTempHoverDate] = useState<Date | null>(null);

  // Month tracking state (Left month view)
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    return start || new Date();
  });

  // Right month view is always Left month + 1 month
  const getRightMonth = (leftMonthDate: Date): Date => {
    const y = leftMonthDate.getFullYear();
    const m = leftMonthDate.getMonth();
    return new Date(y, m + 1, 1);
  };

  const rightMonth = getRightMonth(currentMonth);

  // Helper date logic
  const isSameDay = (d1: Date | null, d2: Date | null): boolean => {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isBetween = (date: Date, s: Date | null, e: Date | null): boolean => {
    if (!s || !e) return false;
    const dTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const sTime = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
    const eTime = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
    return dTime > sTime && dTime < eTime;
  };

  const isHoveredBetween = (date: Date, s: Date | null, hover: Date | null): boolean => {
    if (!s || !hover || s >= hover) return false;
    const dTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const sTime = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
    const hTime = new Date(hover.getFullYear(), hover.getMonth(), hover.getDate()).getTime();
    return dTime > sTime && dTime < hTime;
  };

  // Generate 42 calendar grid cells (rows of 7 days)
  const generateMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    
    const days = [];
    
    // Previous Month padding
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(prevYear, prevMonth, daysInPrevMonth - i),
        isCurrentMonth: false,
      });
    }
    
    // Current Month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }
    
    // Next Month padding
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      days.push({
        date: new Date(nextYear, nextMonth, i),
        isCurrentMonth: false,
      });
    }
    
    return days;
  };

  // Navigation handlers
  const adjustMonths = (amount: number, unit: 'month' | 'year') => {
    const newMonth = new Date(currentMonth.getTime());
    if (unit === 'month') {
      newMonth.setMonth(newMonth.getMonth() + amount);
    } else {
      newMonth.setFullYear(newMonth.getFullYear() + amount);
    }
    setCurrentMonth(newMonth);
  };

  // Day cell click handler
  const handleDayClick = (dayDate: Date) => {
    if (!start || (start && end)) {
      // First click: select start date
      onChange(formatDateString(dayDate), '');
      setTempHoverDate(null);
    } else {
      // Second click: select end date
      if (start && dayDate < start) {
        // If clicked date is before start date, treat it as new start date
        onChange(formatDateString(dayDate), '');
        setTempHoverDate(null);
      } else {
        onChange(formatDateString(start), formatDateString(dayDate));
        setIsOpen(false);
      }
    }
  };

  // Presets trigger
  const applyPreset = (preset: string) => {
    const now = new Date();
    let startPreset = new Date();
    let endPreset = new Date();

    switch (preset) {
      case 'today':
        startPreset = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endPreset = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        startPreset = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        endPreset = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        break;
      case 'week':
        startPreset = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endPreset = now;
        break;
      case 'month':
        startPreset = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        endPreset = now;
        break;
      case 'thisMonth':
        startPreset = new Date(now.getFullYear(), now.getMonth(), 1);
        endPreset = now;
        break;
      case 'clear':
        onChange('', '');
        setIsOpen(false);
        return;
      default:
        return;
    }

    onChange(formatDateString(startPreset), formatDateString(endPreset));
    // Focus the month view to the start date of the preset
    setCurrentMonth(startPreset);
    setIsOpen(false);
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Format display string
  const getDisplayValue = () => {
    if (!startDate && !endDate) return placeholder;
    
    const formatDate = (str: string) => {
      if (!str) return '';
      const [y, m, d] = str.split('-');
      return `${d}/${m}/${y}`;
    };

    if (startDate && !endDate) {
      return `${formatDate(startDate)} - ...`;
    }
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  };

  const renderCalendar = (monthDate: Date) => {
    const days = generateMonthDays(monthDate);
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    return (
      <div className="w-72 p-2">
        {/* Month Header format: "2026 Năm Tháng 6" */}
        <div className="text-center font-bold text-gray-700 text-sm mb-3">
          {monthDate.getFullYear()} Năm Tháng {monthDate.getMonth() + 1}
        </div>
        
        {/* Weekdays */}
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-gray-400 mb-2">
          {weekdays.map((w, idx) => (
            <div key={idx} className="py-1">{w}</div>
          ))}
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-1 text-xs">
          {days.map((day, idx) => {
            const isSelectedStart = isSameDay(day.date, start);
            const isSelectedEnd = isSameDay(day.date, end);
            const inSelectedRange = isBetween(day.date, start, end);
            const inHoverRange = isHoveredBetween(day.date, start, tempHoverDate);
            const inRange = inSelectedRange || inHoverRange;

            const isToday = isSameDay(day.date, new Date());

            // Build styles dynamically
            let cellStyle = "relative py-2 text-center cursor-pointer transition-all hover:bg-gray-100 rounded-full font-medium ";
            
            if (!day.isCurrentMonth) {
              cellStyle += "text-gray-300 hover:text-gray-400 ";
            } else {
              cellStyle += "text-gray-700 ";
            }

            if (isToday) {
              cellStyle += "border border-blue-400 ";
            }

            // Highlighting style for selected / in-range days
            let rangeBgClass = "";
            if (isSelectedStart && !end && tempHoverDate && start && tempHoverDate > start) {
              rangeBgClass = "rounded-l-full bg-blue-50";
            } else if (isSelectedStart && end) {
              rangeBgClass = "rounded-l-full bg-blue-50";
            } else if (isSelectedEnd) {
              rangeBgClass = "rounded-r-full bg-blue-50";
            } else if (inRange) {
              rangeBgClass = "bg-blue-50";
            }

            const isSolidSelected = isSelectedStart || isSelectedEnd;

            return (
              <div 
                key={idx}
                className={`relative group ${rangeBgClass}`}
                onClick={() => handleDayClick(day.date)}
                onMouseEnter={() => {
                  if (start && !end) {
                    setTempHoverDate(day.date);
                  }
                }}
              >
                <div 
                  className={`w-8 h-8 flex items-center justify-center mx-auto rounded-full transition-colors ${
                    isSolidSelected 
                      ? 'bg-blue-600 text-white font-semibold hover:bg-blue-700 shadow-sm' 
                      : ''
                  }`}
                >
                  {day.date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Date Range input trigger */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 text-[13px] border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none cursor-pointer font-medium select-none shadow-xs min-w-[200px]"
      >
        <CalendarIcon size={15} className="text-gray-400 flex-shrink-0" />
        <span className={(!startDate && !endDate) ? 'text-gray-400' : 'text-gray-700'}>
          {getDisplayValue()}
        </span>
        {(startDate || endDate) && (
          <button 
            type="button"
            className="ml-auto text-gray-400 hover:text-gray-600 outline-none p-0.5 rounded-full hover:bg-gray-100"
            onClick={(e) => {
              e.stopPropagation();
              applyPreset('clear');
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Date Picker Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-xl z-50 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-gray-150 animate-in fade-in slide-in-from-top-1 duration-150">
          
          {/* Quick presets sidebar */}
          <div className="w-full md:w-36 flex md:flex-col p-3 bg-gray-50/50 justify-between md:justify-start gap-1">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2 hidden md:block">Nhanh</div>
            <button 
              type="button" 
              onClick={() => applyPreset('today')}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Hôm nay
            </button>
            <button 
              type="button" 
              onClick={() => applyPreset('yesterday')}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Hôm qua
            </button>
            <button 
              type="button" 
              onClick={() => applyPreset('week')}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              7 ngày qua
            </button>
            <button 
              type="button" 
              onClick={() => applyPreset('thisMonth')}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Tháng này
            </button>
            <button 
              type="button" 
              onClick={() => applyPreset('month')}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              30 ngày qua
            </button>
            <div className="h-px bg-gray-200 my-1 hidden md:block"></div>
            <button 
              type="button" 
              onClick={() => applyPreset('clear')}
              className="w-full text-left px-2 py-1.5 rounded-md text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
            >
              Xóa khoảng lọc
            </button>
          </div>

          {/* Calendar Views */}
          <div className="flex flex-col sm:flex-row p-2">
            
            {/* Left Month View */}
            <div className="relative">
              {/* Left Navigation Buttons */}
              <div className="absolute top-1 left-2 flex space-x-1 z-10">
                <button 
                  type="button" 
                  onClick={() => adjustMonths(-1, 'year')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors"
                  title="Năm trước"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button 
                  type="button" 
                  onClick={() => adjustMonths(-1, 'month')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors"
                  title="Tháng trước"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>

              {renderCalendar(currentMonth)}
            </div>

            {/* Right Month View */}
            <div className="relative border-t sm:border-t-0 sm:border-l border-gray-100">
              {/* Right Navigation Buttons */}
              <div className="absolute top-1 right-2 flex space-x-1 z-10">
                <button 
                  type="button" 
                  onClick={() => adjustMonths(1, 'month')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors"
                  title="Tháng sau"
                >
                  <ChevronRight size={16} />
                </button>
                <button 
                  type="button" 
                  onClick={() => adjustMonths(1, 'year')}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors"
                  title="Năm sau"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>

              {renderCalendar(rightMonth)}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
