import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi, getDashboardStats, getStations, getDispatchAnalysis, getKtvUsers, getProductQualityAnalysis, getRevenueAnalysis } from '../../api/client';
import {
  FileText, CheckCircle, Clock, Building, MapPin,
  AlertTriangle, Info, Filter, AlertCircle, RefreshCw, TrendingUp,
  ClipboardList, UserCheck, XCircle, DollarSign, ArrowUpRight, ArrowDownRight, Award,
  Compass
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend,
  ResponsiveContainer, CartesianGrid, AreaChart, Area,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { ComposableMap, Geographies, Geography, ZoomableGroup, Marker } from 'react-simple-maps';
import { scaleQuantile } from 'd3-scale';
import DateRangePicker from '../../components/DateRangePicker';

function removeVietnameseTones(str: string) {
  if (!str) return '';
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
  str = str.replace(/đ/g, "d");
  str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
  str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
  str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
  str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
  str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
  str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
  str = str.replace(/Đ/g, "D");
  return str;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateVN(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${y}`;
}

const getGroupedStats = (dailyStats: any[], mode: 'day' | 'week' | 'month') => {
  if (!dailyStats || dailyStats.length === 0) return [];

  if (mode === 'day') {
    return dailyStats.map(item => {
      const total = (item.onTime || 0) + (item.late || 0);
      return {
        key: item.date,
        label: item.date,
        onTime: item.onTime,
        late: item.late,
        total,
        latePercent: total > 0 ? Math.round((item.late / total) * 100) : 0
      };
    });
  }

  const map: Record<string, { onTime: number; late: number; total: number }> = {};

  dailyStats.forEach(item => {
    let key = '';
    if (mode === 'week') {
      const date = new Date(item.date);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date.setDate(diff));
      key = monday.toISOString().slice(0, 10);
    } else if (mode === 'month') {
      key = item.date.slice(0, 7); // YYYY-MM
    }

    if (!map[key]) {
      map[key] = { onTime: 0, late: 0, total: 0 };
    }
    map[key].onTime += item.onTime || 0;
    map[key].late += item.late || 0;
    map[key].total += (item.onTime || 0) + (item.late || 0);
  });

  return Object.entries(map).map(([key, data]) => {
    let label = key;
    if (mode === 'week') {
      const d = new Date(key);
      label = `Tuần ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    } else if (mode === 'month') {
      const [year, month] = key.split('-');
      label = `Tháng ${month}/${year}`;
    }

    return {
      key,
      label,
      onTime: data.onTime,
      late: data.late,
      total: data.total,
      latePercent: data.total > 0 ? Math.round((data.late / data.total) * 100) : 0
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
};

const geoUrl = '/vn-provinces.json';

const REGION_PRESETS = [
  { id: 'all', label: 'Toàn quốc', center: [106.3, 16.2] as [number, number], zoom: 1 },
  { id: 'north', label: 'Miền Bắc', center: [105.85, 20.95] as [number, number], zoom: 2.7 },
  { id: 'central', label: 'Miền Trung', center: [108.2, 15.9] as [number, number], zoom: 2.7 },
  { id: 'south', label: 'Miền Nam', center: [106.7, 10.75] as [number, number], zoom: 2.7 },
];

const TRULIVA_STATION_COORDS = [
  { name: 'Trạm TP. Hồ Chí Minh', shortName: 'TP.HCM', keywords: ['tp.ho chi minh', 'ho chi minh', 'hcm'], coords: [106.6602, 10.7626] as [number, number], region: 'south' },
  { name: 'Trạm Hà Nội', shortName: 'Hà Nội', keywords: ['ha noi', 'hn'], coords: [105.8048, 21.0285] as [number, number], region: 'north' },
  { name: 'Trạm Đà Nẵng', shortName: 'Đà Nẵng', keywords: ['da nang', 'dn'], coords: [108.2022, 16.0544] as [number, number], region: 'central' },
  { name: 'Trạm Đồng Nai', shortName: 'Đồng Nai', keywords: ['dong nai', 'bien hoa', 'long khanh', 'dinh quan', 'tran bien'], coords: [106.8427, 10.9574] as [number, number], region: 'south' },
  { name: 'Trạm Bình Dương', shortName: 'Bình Dương', keywords: ['binh duong', 'thu dau mot', 'thuan an'], coords: [106.6519, 10.9804] as [number, number], region: 'south' },
  { name: 'Trạm Bà Rịa - Vũng Tàu', shortName: 'Vũng Tàu', keywords: ['ba ria', 'vung tau'], coords: [107.0843, 10.3460] as [number, number], region: 'south' },
  { name: 'Trạm Hải Phòng', shortName: 'Hải Phòng', keywords: ['hai phong'], coords: [106.6881, 20.8449] as [number, number], region: 'north' },
  { name: 'Trạm Bắc Ninh', shortName: 'Bắc Ninh', keywords: ['bac ninh'], coords: [106.0763, 21.1861] as [number, number], region: 'north' },
  { name: 'Trạm Cần Thơ', shortName: 'Cần Thơ', keywords: ['can tho'], coords: [105.7469, 10.0452] as [number, number], region: 'south' },
  { name: 'Trạm Khánh Hòa', shortName: 'Khánh Hòa', keywords: ['khanh hoa', 'nha trang'], coords: [109.1967, 12.2388] as [number, number], region: 'central' },
  { name: 'Trạm Nghệ An', shortName: 'Nghệ An', keywords: ['nghe an', 'vinh'], coords: [105.6667, 18.6667] as [number, number], region: 'central' },
  { name: 'Trạm Đắk Lắk', shortName: 'Đắk Lắk', keywords: ['dak lak', 'dac lac', 'buon ma thuot'], coords: [108.0383, 12.6675] as [number, number], region: 'central' }
];

const WORK_TYPE_OPTIONS = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc', 'Bảo hành', 'Sửa chữa'];
const STATUS_OPTIONS = [
  { value: 'chờ xử lý', label: 'Chờ xử lý' },
  { value: 'đang thực hiện', label: 'Đã phân công' },
  { value: 'hoàn thành', label: 'Hoàn thành' },
  { value: 'hủy đơn', label: 'Hủy đơn' }
];

function MultiSelect({
  label,
  options,
  selectedValues,
  onChange,
  isOpen,
  onToggle,
  disabled = false,
  placeholder = 'Tất cả'
}: {
  label: string;
  options: (string | { value: string; label: string })[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const normalizedOptions = options.map(opt => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  const handleSelectAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(normalizedOptions.map(o => o.value));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const handleToggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length <= 2) {
      return selectedValues
        .map(v => normalizedOptions.find(o => o.value === v)?.label || v)
        .join(', ');
    }
    return `Đã chọn (${selectedValues.length})`;
  };

  return (
    <div className="flex flex-col relative" onClick={(e) => e.stopPropagation()}>
      {label && <label className="text-[11px] font-semibold text-gray-500 mb-1 uppercase">{label}</label>}
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`border rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 text-gray-700 bg-white flex justify-between items-center cursor-pointer min-h-[32px] text-left select-none transition-all ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 font-medium' : 'hover:border-gray-400 font-medium'
          }`}
      >
        <span className="truncate pr-1">{getDisplayText()}</span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && !disabled && (
        <div className="absolute top-[52px] left-0 min-w-[200px] w-full bg-white border border-gray-200 rounded-lg shadow-xl py-2 z-50 animate-fade-in flex flex-col max-h-64">
          <div className="flex justify-between items-center px-3 pb-2 border-b border-gray-100 text-[10px] font-bold text-blue-600">
            <button
              type="button"
              onClick={handleSelectAll}
              className="hover:underline cursor-pointer"
            >
              Chọn tất cả
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="hover:underline text-gray-500 cursor-pointer"
            >
              Bỏ chọn
            </button>
          </div>
          <div className="overflow-y-auto flex-1 py-1 max-h-48 custom-scrollbar">
            {normalizedOptions.length === 0 ? (
              <div className="text-gray-400 text-center py-4 text-xs font-medium">Không có tùy chọn</div>
            ) : (
              normalizedOptions.map(opt => {
                const isChecked = selectedValues.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center px-3 py-1.5 hover:bg-blue-50 cursor-pointer select-none text-xs text-gray-700 font-medium transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleOption(opt.value)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 mr-2 cursor-pointer transition-all"
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'summary' | 'ontime' | 'late' | 'workload' | 'stationComp' | 'productQuality' | 'revenue'>('summary');

  const navigateToOrdersWithStatus = (statuses?: string[], customStart?: string, customEnd?: string) => {
    try {
      const existing = sessionStorage.getItem('truliva_order_filters');
      const parsed = existing ? JSON.parse(existing) : {};
      parsed.filterAdminStatuses = statuses || [];
      parsed.customStartDate = customStart !== undefined ? customStart : startDate;
      parsed.customEndDate = customEnd !== undefined ? customEnd : endDate;
      parsed.page = 1;
      sessionStorage.setItem('truliva_order_filters', JSON.stringify(parsed));
    } catch (e) {
      console.error(e);
    }
    navigate('/admin/orders');
  };

  // Data States
  const [stats, setStats] = useState<any>(null);
  const [dashStats, setDashStats] = useState<any>(null);
  const [stationsList, setStationsList] = useState<any[]>([]);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [qualityData, setQualityData] = useState<any>(null);
  const [revenueData, setRevenueData] = useState<any>(null);
  const [loadingQuality, setLoadingQuality] = useState(false);
  const [loadingRevenue, setLoadingRevenue] = useState(false);

  // Loading & Tooltip States
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const [tooltipContent, setTooltipContent] = useState<React.ReactNode>('');
  const [chartType, setChartType] = useState<'stackedBar' | 'line'>('stackedBar');
  const [lateChartScale, setLateChartScale] = useState<'day' | 'week' | 'month'>('day');
  const [selectedLateProvince, setSelectedLateProvince] = useState<string>('');

  // Map Navigation & Interaction States
  const [mapCenter, setMapCenter] = useState<[number, number]>([106.3, 16.2]);
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [hoveredStation, setHoveredStation] = useState<string | null>(null);
  const [stationViewMode, setStationViewMode] = useState<'tech' | 'main'>('tech');

  // Filter States
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return formatLocalDate(new Date(d.getFullYear(), 0, 1));
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return formatLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  });
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([]);
  const [selectedMainStations, setSelectedMainStations] = useState<string[]>([]);
  const [selectedTechStations, setSelectedTechStations] = useState<string[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([]);
  const [selectedAdminStatuses, setSelectedAdminStatuses] = useState<string[]>([]);
  const [selectedKtvIds, setSelectedKtvIds] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [ktvList, setKtvList] = useState<any[]>([]);

  // Revenue comparison filter states
  const [compareMode, setCompareMode] = useState<'auto' | 'yoy' | 'custom'>('auto');
  const [prevStartDate, setPrevStartDate] = useState<string>('');
  const [prevEndDate, setPrevEndDate] = useState<string>('');
  const [revenueScope, setRevenueScope] = useState<'all' | 'service'>('all');
  const [revenueMetricType, setRevenueMetricType] = useState<'moneyToCollect' | 'totalPrice'>('moneyToCollect');

  // Fetch static data (stations, overview stats) once on mount
  useEffect(() => {
    setLoadingOverview(true);
    Promise.all([
      fetchApi('/reports/stats'),
      getDashboardStats(),
      getStations()
    ]).then(([reportsData, dashData, stationsData]) => {
      setStats(reportsData);
      setDashStats(dashData);
      setStationsList(stationsData);
    }).catch(console.error)
      .finally(() => setLoadingOverview(false));
  }, []);

  // Click outside to close active dropdown
  useEffect(() => {
    const handleOutsideClick = () => {
      setOpenDropdown(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Update tech stations selection based on selected main stations
  useEffect(() => {
    if (selectedMainStations.length === 0) {
      setSelectedTechStations([]);
    } else {
      const allowedIds = new Set(
        stationsList
          .filter(s => selectedMainStations.includes(s.id))
          .flatMap(s => s.techStations || [])
          .map((t: any) => t.id)
      );
      setSelectedTechStations(prev => prev.filter(id => allowedIds.has(id)));
    }
  }, [selectedMainStations, stationsList]);

  // Fetch KTVs dynamically based on selectedTechStations
  useEffect(() => {
    getKtvUsers({ techStationId: selectedTechStations.join(',') })
      .then(data => {
        setKtvList(data);
      })
      .catch(console.error);
  }, [selectedTechStations]);

  // Fetch dynamic analysis data whenever filters change
  useEffect(() => {
    setLoadingAnalysis(true);

    getDashboardStats({
      startDate,
      endDate,
      province: selectedProvinces,
      mainStationId: selectedMainStations,
      techStationId: selectedTechStations,
      workType: selectedWorkTypes,
      assignedKtvId: selectedKtvIds
    })
      .then(data => {
        setDashStats(data);
      })
      .catch(console.error);

    getDispatchAnalysis({
      startDate,
      endDate,
      province: selectedProvinces,
      mainStationId: selectedMainStations,
      techStationId: selectedTechStations,
      workType: selectedWorkTypes,
      adminStatus: selectedAdminStatuses,
      assignedKtvId: selectedKtvIds
    })
      .then(data => {
        setAnalysisData(data);
      })
      .catch(console.error)
      .finally(() => setLoadingAnalysis(false));
  }, [startDate, endDate, selectedProvinces, selectedMainStations, selectedTechStations, selectedWorkTypes, selectedAdminStatuses, selectedKtvIds]);

  // Fetch quality analysis data
  useEffect(() => {
    if (activeTab !== 'productQuality') return;
    setLoadingQuality(true);
    getProductQualityAnalysis({
      startDate,
      endDate,
      province: selectedProvinces,
      mainStationId: selectedMainStations,
      techStationId: selectedTechStations,
      product: selectedProducts
    })
      .then(data => {
        setQualityData(data);
      })
      .catch(console.error)
      .finally(() => setLoadingQuality(false));
  }, [activeTab, startDate, endDate, selectedProvinces, selectedMainStations, selectedTechStations, selectedProducts]);

  // Flatten tech stations from dashStats.stationStats and analysisData.techStationStats
  const allTechStations = useMemo(() => {
    const map: Record<string, { name: string; orders: number; mainStationName: string }> = {};
    if (dashStats?.stationStats) {
      dashStats.stationStats.forEach((main: any) => {
        (main.techStations || []).forEach((ts: any) => {
          const cleanName = ts.name.trim();
          if (!map[cleanName]) {
            map[cleanName] = { name: cleanName, orders: 0, mainStationName: main.name };
          }
          map[cleanName].orders += (ts.orders || 0);
        });
      });
    }
    if (analysisData?.techStationStats) {
      analysisData.techStationStats.forEach((ts: any) => {
        if (!map[ts.name]) {
          map[ts.name] = { name: ts.name, orders: ts.total, mainStationName: 'Hệ thống' };
        }
      });
    }
    return Object.values(map).sort((a, b) => b.orders - a.orders);
  }, [dashStats, analysisData]);

  const totalTechStationOrders = useMemo(() => {
    return allTechStations.reduce((sum, ts) => sum + ts.orders, 0) || 1;
  }, [allTechStations]);

  const getTechStationOrders = (keywords: string[]) => {
    let count = 0;
    keywords.forEach(kw => {
      const cleanKw = removeVietnameseTones(kw).toLowerCase();
      allTechStations.forEach(ts => {
        const cleanTs = removeVietnameseTones(ts.name).toLowerCase();
        if (cleanTs === cleanKw || cleanTs.includes(cleanKw) || cleanKw.includes(cleanTs)) {
          count += ts.orders;
        }
      });
    });
    return count;
  };

  useEffect(() => {
    if (activeTab !== 'revenue') return;
    setLoadingRevenue(true);
    getRevenueAnalysis({
      startDate,
      endDate,
      province: selectedProvinces,
      mainStationId: selectedMainStations,
      techStationId: selectedTechStations,
      workType: selectedWorkTypes,
      assignedKtvId: selectedKtvIds,
      compareMode,
      prevStartDate: compareMode === 'custom' ? prevStartDate : undefined,
      prevEndDate: compareMode === 'custom' ? prevEndDate : undefined,
      revenueScope,
      metricType: revenueMetricType
    })
      .then((data: any) => {
        setRevenueData(data);
      })
      .catch(console.error)
      .finally(() => setLoadingRevenue(false));
  }, [activeTab, startDate, endDate, selectedProvinces, selectedMainStations, selectedTechStations, selectedWorkTypes, selectedKtvIds, compareMode, prevStartDate, prevEndDate, revenueScope, revenueMetricType]);

  useEffect(() => {
    setSelectedLateProvince('');
  }, [analysisData]);

  if (loadingOverview) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        <p className="text-gray-500 font-medium text-sm">Đang tải dữ liệu tổng quan...</p>
      </div>
    );
  }

  if (!stats || !dashStats) return <div className="alert alert-error">Lỗi tải dữ liệu hệ thống</div>;



  // Expose province options dynamically from tech stations to clean up filter inputs
  const availableProvinces = Array.from(new Set(
    stationsList.flatMap(m => (m.techStations || []).map((t: any) => t.name.split('(')[0].trim()))
  )).sort((a, b) => a.localeCompare(b, 'vi'));

  const availableTechStations = selectedMainStations.length > 0
    ? stationsList
      .filter(s => selectedMainStations.includes(s.id))
      .flatMap(s => s.techStations || [])
    : [];

  // Expose unique provinces currently present in the late orders list
  const lateProvinces = analysisData?.lateOrders
    ? Array.from(new Set(analysisData.lateOrders.map((o: any) => o.province).filter(Boolean) as string[]))
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .sort((a, b) => a.localeCompare(b, 'vi'))
    : [];

  const filteredLateOrders = selectedLateProvince && analysisData?.lateOrders
    ? analysisData.lateOrders.filter((o: any) => o.province === selectedLateProvince)
    : (analysisData?.lateOrders || []);

  const resetFilters = () => {
    const d = new Date();
    setStartDate(formatLocalDate(new Date(d.getFullYear(), 0, 1)));
    setEndDate(formatLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    setSelectedProvinces([]);
    setSelectedMainStations([]);
    setSelectedTechStations([]);
    setSelectedWorkTypes([]);
    setSelectedAdminStatuses([]);
    setSelectedKtvIds([]);
    setSelectedProducts([]);
    setCompareMode('auto');
    setPrevStartDate('');
    setPrevEndDate('');
  };

  return (
    <div className="animate-fade-in relative font-sans space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h2 className="font-bold text-2xl text-[#1B3A6B]">Bảng Phân Tích & Điều Phối Dịch Vụ</h2>
          <p className="text-gray-500 text-sm mt-0.5">Thống kê mật độ đơn hàng, tiến độ hoàn thành ca và hiệu suất đúng hẹn của KTV</p>
        </div>

        {/* KPI Definitions Tooltip */}
        <div className="relative group">
          <button className="flex items-center space-x-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-2 rounded-lg transition-all font-semibold shadow-sm cursor-pointer">
            <Info size={14} />
            <span>Định nghĩa Đúng/Trễ hẹn</span>
          </button>
          <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4 hidden group-hover:block z-50 text-xs text-gray-600 space-y-3 animate-fade-in pointer-events-none">
            <h4 className="font-bold text-gray-900 border-b pb-1.5 flex items-center gap-1.5 text-[13px]">
              <Info size={15} className="text-blue-600" />
              Quy chuẩn đánh giá KPI
            </h4>
            <div className="space-y-2">
              <div>
                <span className="font-bold text-emerald-600">✓ Đúng hẹn (On-time):</span>
                <p className="mt-0.5 text-gray-500 leading-relaxed">Ca đã hoàn thành có <b>Ngày nghiệm thu thực tế</b> (KTV nộp báo cáo ca) <b>≤ Ngày hẹn khách hàng</b> (so khớp theo ngày YYYY-MM-DD, không xét giờ).</p>
              </div>
              <div className="border-t pt-2">
                <span className="font-bold text-rose-600">⚠ Trễ hẹn (Late):</span>
                <p className="mt-0.5 text-gray-500 leading-relaxed">Ca đã hoàn thành có ngày nghiệm thu &gt; ngày hẹn, HOẶC ca chưa hoàn thành (chờ xử lý/đang thực hiện) đã quá ngày hẹn khách.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GLOBAL FILTER BAR */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center space-x-1.5 text-[#1B3A6B] font-semibold text-sm">
          <Filter size={16} />
          <span>Bộ lọc dữ liệu phân tích</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Khoảng ngày phân tích */}
          <div className="flex flex-col sm:col-span-2">
            <label className="text-[11px] font-semibold text-gray-500 mb-1 uppercase">Khoảng ngày phân tích</label>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(start, end) => {
                setStartDate(start);
                setEndDate(end);
              }}
              placeholder="Bắt đầu - kết thúc"
              align="left"
            />
          </div>

          {/* Khi ở tab Doanh thu: Khoảng ngày đối chiếu */}
          {activeTab === 'revenue' && (
            <div className="flex flex-col sm:col-span-2">
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-semibold text-emerald-700 uppercase">Khoảng ngày đối chiếu</label>
                <div className="flex space-x-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      setCompareMode('auto');
                      setPrevStartDate('');
                      setPrevEndDate('');
                    }}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${compareMode === 'auto' && !prevStartDate
                        ? 'bg-emerald-100 text-emerald-800 font-bold'
                        : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    title="Tự động lùi cùng số ngày liền trước"
                  >
                    Tự động
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareMode('yoy');
                      setPrevStartDate('');
                      setPrevEndDate('');
                    }}
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors ${compareMode === 'yoy'
                        ? 'bg-emerald-100 text-emerald-800 font-bold'
                        : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    title="So sánh với cùng kỳ năm trước"
                  >
                    YoY
                  </button>
                </div>
              </div>
              <DateRangePicker
                startDate={
                  prevStartDate || (compareMode !== 'custom' ? (revenueData?.periodInfo?.previous?.start || '') : '')
                }
                endDate={
                  prevEndDate || (compareMode !== 'custom' ? (revenueData?.periodInfo?.previous?.end || '') : '')
                }
                onChange={(start, end) => {
                  if (start || end) {
                    setCompareMode('custom');
                    setPrevStartDate(start);
                    setPrevEndDate(end);
                  } else {
                    setCompareMode('auto');
                    setPrevStartDate('');
                    setPrevEndDate('');
                  }
                }}
                placeholder="Chọn khoảng ngày đối chiếu"
              />
            </div>
          )}

          {/* Province */}
          <MultiSelect
            label="Tỉnh/Thành phố"
            options={availableProvinces}
            selectedValues={selectedProvinces}
            onChange={setSelectedProvinces}
            isOpen={openDropdown === 'province'}
            onToggle={() => setOpenDropdown(openDropdown === 'province' ? null : 'province')}
          />

          {/* Main Station */}
          <MultiSelect
            label="Trạm chính"
            options={stationsList.map(s => ({ value: s.id, label: s.name }))}
            selectedValues={selectedMainStations}
            onChange={setSelectedMainStations}
            isOpen={openDropdown === 'mainStation'}
            onToggle={() => setOpenDropdown(openDropdown === 'mainStation' ? null : 'mainStation')}
          />

          {/* Tech Station */}
          <MultiSelect
            label="Trạm kỹ thuật"
            options={availableTechStations.map((t: any) => ({ value: t.id, label: t.name }))}
            selectedValues={selectedTechStations}
            onChange={setSelectedTechStations}
            isOpen={openDropdown === 'techStation'}
            onToggle={() => setOpenDropdown(openDropdown === 'techStation' ? null : 'techStation')}
            disabled={selectedMainStations.length === 0}
            placeholder={selectedMainStations.length === 0 ? 'Chọn trạm chính...' : 'Tất cả'}
          />

          {/* Work Type */}
          <MultiSelect
            label="Loại công việc"
            options={WORK_TYPE_OPTIONS}
            selectedValues={selectedWorkTypes}
            onChange={setSelectedWorkTypes}
            isOpen={openDropdown === 'workType'}
            onToggle={() => setOpenDropdown(openDropdown === 'workType' ? null : 'workType')}
          />

          {/* Admin Status */}
          <MultiSelect
            label="Trạng thái đơn"
            options={STATUS_OPTIONS}
            selectedValues={selectedAdminStatuses}
            onChange={setSelectedAdminStatuses}
            isOpen={openDropdown === 'adminStatus'}
            onToggle={() => setOpenDropdown(openDropdown === 'adminStatus' ? null : 'adminStatus')}
          />

          {/* Kỹ thuật viên */}
          <MultiSelect
            label="Kỹ thuật viên"
            options={ktvList.map(k => ({ value: k.id, label: k.fullName }))}
            selectedValues={selectedKtvIds}
            onChange={setSelectedKtvIds}
            isOpen={openDropdown === 'ktv'}
            onToggle={() => setOpenDropdown(openDropdown === 'ktv' ? null : 'ktv')}
          />

          {/* Buttons */}
          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="w-full border border-gray-300 hover:bg-gray-50 text-gray-600 text-xs py-2 px-3 rounded font-medium flex items-center justify-center space-x-1.5"
            >
              <RefreshCw size={13} />
              <span>Xóa bộ lọc</span>
            </button>
          </div>
        </div>
      </div>

      {/* DATA SOURCE EXPLANATION BANNER */}
      <div className="bg-blue-50/60 border border-blue-100 text-[#1B3A6B] px-4 py-3.5 rounded-xl flex items-start space-x-3 shadow-sm animate-fade-in">
        <Info className="text-blue-600 mt-0.5 flex-shrink-0" size={16} />
        <div className="text-xs space-y-1">
          <p className="font-bold text-[13px] text-[#1B3A6B]">Thông tin nguồn dữ liệu & bộ lọc:</p>
          <p className="text-gray-600 leading-relaxed font-medium">
            Bộ lọc thời gian trên Dashboard được áp dụng theo <b>Ngày tạo đơn hàng trên Pancake</b>.
            Các chỉ số hiệu suất, tỷ lệ Đúng/Trễ hẹn và các biểu đồ phân tích liên quan được tính toán dựa trên <b>Ngày hẹn khách hàng</b> (hệ thống tự động thiết lập hoặc điều phối viên gán).
          </p>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex items-center overflow-x-auto border-b border-gray-200 bg-gray-50/70 p-1.5 rounded-xl gap-1.5 scrollbar-none select-none">
        <button
          onClick={() => setActiveTab('summary')}
          className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'summary' 
              ? 'bg-white text-blue-600 shadow-sm border border-gray-200/80 font-bold' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <span>Tổng quan & Mật độ</span>
        </button>

        <button
          onClick={() => setActiveTab('ontime')}
          className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'ontime' 
              ? 'bg-white text-[#1B3A6B] shadow-sm border border-gray-200/80 font-bold' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <Clock size={15} className={activeTab === 'ontime' ? 'text-indigo-600' : 'text-gray-500'} />
          <span>Báo cáo Đúng / Trễ Hẹn</span>
        </button>

        <button
          onClick={() => setActiveTab('workload')}
          className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'workload' 
              ? 'bg-white text-blue-800 shadow-sm border border-gray-200/80 font-bold' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <TrendingUp size={15} className={activeTab === 'workload' ? 'text-blue-600' : 'text-gray-500'} />
          <span>Phân tích Công việc</span>
        </button>

        <button
          onClick={() => setActiveTab('stationComp')}
          className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'stationComp' 
              ? 'bg-white text-purple-700 shadow-sm border border-gray-200/80 font-bold' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <Building size={15} className={activeTab === 'stationComp' ? 'text-purple-600' : 'text-gray-500'} />
          <span>Đối tác & Trạm chính</span>
        </button>

        <button
          onClick={() => setActiveTab('productQuality')}
          className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'productQuality' 
              ? 'bg-white text-orange-600 shadow-sm border border-gray-200/80 font-bold' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <AlertCircle size={15} className={activeTab === 'productQuality' ? 'text-orange-500' : 'text-gray-500'} />
          <span>Chất lượng sản phẩm</span>
        </button>

        <button
          onClick={() => setActiveTab('revenue')}
          className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center space-x-1.5 ${
            activeTab === 'revenue' 
              ? 'bg-white text-emerald-600 shadow-sm border border-gray-200/80 font-bold' 
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
          }`}
        >
          <DollarSign size={15} className={activeTab === 'revenue' ? 'text-emerald-600' : 'text-gray-500'} />
          <span>Doanh Thu</span>
        </button>
      </div>

      {/* TAB CONTENT 1: SUMMARY & MAP */}
      {activeTab === 'summary' && (
        <div className="space-y-6 animate-fade-in">
          {/* KPI Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div
              onClick={() => navigateToOrdersWithStatus([], startDate, endDate)}
              className="bg-white p-5 rounded-xl border border-gray-200 border-l-4 border-l-blue-500 shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
              title="Nhấp để xem danh sách tất cả đơn hàng theo khoảng ngày đang chọn"
            >
              <div className="text-blue-600 font-semibold text-xs flex items-center justify-between uppercase">
                <span className="flex items-center gap-1.5"><ClipboardList size={15} /> Tổng số đơn</span>
                <span className="text-[10px] text-gray-400 group-hover:text-blue-600 transition-colors">Xem ngay →</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.total ?? 0}</div>
            </div>

            <div
              onClick={() => navigateToOrdersWithStatus(['chờ xử lý'], startDate, endDate)}
              className="bg-white p-5 rounded-xl border border-gray-200 border-l-4 border-l-amber-500 shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
              title="Nhấp để xem danh sách đơn chờ xử lý theo khoảng ngày đang chọn"
            >
              <div className="text-amber-600 font-semibold text-xs flex items-center justify-between uppercase">
                <span className="flex items-center gap-1.5"><Clock size={15} /> Đơn chờ xử lý</span>
                <span className="text-[10px] text-gray-400 group-hover:text-amber-600 transition-colors">Xem ngay →</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.pending ?? 0}</div>
            </div>

            <div
              onClick={() => navigateToOrdersWithStatus(['đang thực hiện'], startDate, endDate)}
              className="bg-white p-5 rounded-xl border border-gray-200 border-l-4 border-l-indigo-500 shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
              title="Nhấp để xem danh sách đơn đã phân công theo khoảng ngày đang chọn"
            >
              <div className="text-indigo-600 font-semibold text-xs flex items-center justify-between uppercase">
                <span className="flex items-center gap-1.5"><UserCheck size={15} /> Đơn đã phân công</span>
                <span className="text-[10px] text-gray-400 group-hover:text-indigo-600 transition-colors">Xem ngay →</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.assigned ?? 0}</div>
            </div>

            <div
              onClick={() => navigateToOrdersWithStatus(['hoàn thành'], startDate, endDate)}
              className="bg-white p-5 rounded-xl border border-gray-200 border-l-4 border-l-emerald-500 shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
              title="Nhấp để xem danh sách đơn đã hoàn thành theo khoảng ngày đang chọn"
            >
              <div className="text-emerald-600 font-semibold text-xs flex items-center justify-between uppercase">
                <span className="flex items-center gap-1.5"><CheckCircle size={15} /> Đơn hoàn thành</span>
                <span className="text-[10px] text-gray-400 group-hover:text-emerald-600 transition-colors">Xem ngay →</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.completed ?? 0}</div>
            </div>

            <div
              onClick={() => navigateToOrdersWithStatus(['hủy đơn'], startDate, endDate)}
              className="bg-white p-5 rounded-xl border border-gray-200 border-l-4 border-l-rose-500 shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group"
              title="Nhấp để xem danh sách đơn bị hủy theo khoảng ngày đang chọn"
            >
              <div className="text-rose-600 font-semibold text-xs flex items-center justify-between uppercase">
                <span className="flex items-center gap-1.5"><XCircle size={15} /> Đơn bị hủy</span>
                <span className="text-[10px] text-gray-400 group-hover:text-rose-600 transition-colors">Xem ngay →</span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.cancelled ?? 0}</div>
            </div>
          </div>

          {loadingAnalysis || !analysisData ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 text-xs">Đang tải dữ liệu bản đồ & khu vực...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* CỘT TRÁI (7 CỘT): BẢN ĐỒ MẬT ĐỘ & TRẠM KỸ THUẬT TƯƠNG TÁC */}
              <div className="xl:col-span-7 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col min-h-[580px] relative">
                {/* Header bản đồ & Bộ điều hướng vùng */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#1B3A6B] flex items-center justify-center font-bold">
                        <MapPin size={16} />
                      </div>
                      <h3 className="font-bold text-base text-gray-800">Bản đồ Mật độ & Mạng lưới Trạm</h3>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Phân bố đơn hàng và trạm kỹ thuật Truliva toàn quốc</p>
                  </div>

                  {/* 4 Nút Zoom Vùng trọng điểm */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 self-start sm:self-auto">
                    {REGION_PRESETS.map(reg => {
                      const isActive = selectedRegion === reg.id;
                      return (
                        <button
                          key={reg.id}
                          type="button"
                          onClick={() => {
                            setSelectedRegion(reg.id);
                            setMapCenter(reg.center);
                            setMapZoom(reg.zoom);
                          }}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                            isActive
                              ? 'bg-[#1B3A6B] text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                          }`}
                        >
                          {reg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Khung chứa Bản đồ */}
                <div className="flex-1 w-full bg-gradient-to-b from-blue-50/40 to-slate-50/50 rounded-xl overflow-hidden flex items-center justify-center relative border border-blue-100/60 min-h-[440px]">
                  <ComposableMap
                    projection="geoMercator"
                    projectionConfig={{
                      scale: 2200,
                      center: [106.3, 16.2]
                    }}
                    style={{ width: "100%", height: "100%" }}
                  >
                    <ZoomableGroup
                      center={mapCenter}
                      zoom={mapZoom}
                      minZoom={0.8}
                      maxZoom={5}
                      onMoveEnd={({ coordinates, zoom }) => {
                        setMapCenter(coordinates);
                        setMapZoom(zoom);
                      }}
                    >
                      <Geographies geography={geoUrl}>
                        {({ geographies }) => {
                          const densityMap = dashStats.mapDensity || {};
                          const mapProvinceData = Object.entries(densityMap).map(([name, total]) => ({ name, total: total as number }));
                          const totalOrdersAll = mapProvinceData.reduce((acc, curr) => acc + curr.total, 0) || 1;

                          const colorScale = scaleQuantile<string>()
                            .domain(mapProvinceData.map((d: any) => d.total).length > 0 ? mapProvinceData.map((d: any) => d.total) : [0, 1])
                            .range([
                              "#e0f2fe",
                              "#bae6fd",
                              "#7dd3fc",
                              "#38bdf8",
                              "#0ea5e9",
                              "#0284c7",
                              "#0369a1",
                              "#075985"
                            ]);

                          return geographies.map(geo => {
                            const geoName = geo.properties.Name || geo.properties.name || geo.properties.ten_tinh;

                            let matchedValue = 0;
                            let cleanGeoName = '';
                            if (geoName) {
                              cleanGeoName = removeVietnameseTones(geoName)
                                .replace(/ Province| City/gi, '')
                                .trim()
                                .toLowerCase();

                              const found = mapProvinceData.find((d: any) => {
                                const cleanDbName = removeVietnameseTones(d.name)
                                  .replace(/^(Tỉnh |Thành phố |TP |TP\. )/i, '')
                                  .trim()
                                  .toLowerCase();
                                return cleanGeoName === cleanDbName || cleanGeoName.includes(cleanDbName) || cleanDbName.includes(cleanGeoName);
                              });
                              if (found) matchedValue = found.total;
                            }

                            // Match on-time performance from analysisData.provinceStats if available
                            const provStat = analysisData?.provinceStats?.find((p: any) => {
                              const cleanP = removeVietnameseTones(p.name).replace(/^(Tỉnh |Thành phố |TP |TP\. )/i, '').trim().toLowerCase();
                              return cleanGeoName === cleanP || cleanGeoName.includes(cleanP) || cleanP.includes(cleanGeoName);
                            });

                            const onTimeRate = provStat && provStat.total > 0
                              ? Math.round((provStat.onTime / provStat.total) * 100)
                              : undefined;

                            const percentShare = totalOrdersAll > 0
                              ? ((matchedValue / totalOrdersAll) * 100).toFixed(1)
                              : '0';

                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={matchedValue ? colorScale(matchedValue) : "#f8fafc"}
                                stroke="#cbd5e1"
                                strokeWidth={0.5}
                                onMouseEnter={() => {
                                  setTooltipContent(
                                    <div className="space-y-1">
                                      <div className="font-bold text-sm text-white flex items-center justify-between gap-3 border-b border-gray-700/60 pb-1">
                                        <span>{geoName || 'Không rõ'}</span>
                                        <span className="text-amber-400 font-extrabold">{matchedValue} ca</span>
                                      </div>
                                      <div className="text-[11px] text-gray-300 flex justify-between gap-4">
                                        <span>Tỷ trọng toàn quốc:</span>
                                        <span className="font-semibold text-white">{percentShare}%</span>
                                      </div>
                                      {onTimeRate !== undefined && (
                                        <div className="text-[11px] text-gray-300 flex justify-between gap-4">
                                          <span>Tỷ lệ đúng hẹn:</span>
                                          <span className={`font-semibold ${onTimeRate >= 90 ? 'text-emerald-400' : onTimeRate >= 80 ? 'text-amber-400' : 'text-rose-400'}`}>
                                            {onTimeRate}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }}
                                onMouseLeave={() => {
                                  setTooltipContent("");
                                }}
                                style={{
                                  default: { outline: "none" },
                                  hover: { fill: "#f59e0b", outline: "none", cursor: "pointer", transition: "all 0.2s" },
                                  pressed: { fill: "#d97706", outline: "none" }
                                }}
                              />
                            );
                          });
                        }}
                      </Geographies>

                      {/* GHIM CÁC TRẠM KỸ THUẬT CỦA TRULIVA */}
                      {TRULIVA_STATION_COORDS.map(st => {
                        const orderCount = getTechStationOrders(st.keywords);
                        const isHovered = hoveredStation === st.name;
                        // Dynamic scale factor: inverse to mapZoom so size remains constant on screen
                        const scaleFactor = Math.max(0.35, 1 / mapZoom);

                        return (
                          <Marker key={st.name} coordinates={st.coords}>
                            <g
                              transform={`scale(${scaleFactor})`}
                              className="cursor-pointer"
                              onMouseEnter={() => {
                                setHoveredStation(st.name);
                                setTooltipContent(
                                  <div className="text-xs">
                                    <div className="font-bold text-amber-300 flex items-center gap-1">
                                      <Building size={12} /> {st.name}
                                    </div>
                                    <div className="text-gray-200 mt-0.5">
                                      Trạm kỹ thuật phụ trách: <strong className="text-white font-bold">{orderCount}</strong> đơn hàng
                                    </div>
                                  </div>
                                );
                              }}
                              onMouseLeave={() => {
                                setHoveredStation(null);
                                setTooltipContent("");
                              }}
                            >
                              {/* Pulse Effect */}
                              <circle r={isHovered ? 12 : 7} fill="#00A3FF" fillOpacity={0.35} className="animate-ping" />
                              <circle r={isHovered ? 7 : 5} fill="#1B3A6B" stroke="#ffffff" strokeWidth={1.4} />
                              <circle r={2} fill="#00A3FF" />

                              {/* Label Pill */}
                              <g transform="translate(0, -11)">
                                <rect
                                  x="-26"
                                  y="-11"
                                  width="52"
                                  height="12"
                                  rx="6"
                                  fill="#1B3A6B"
                                  fillOpacity={0.92}
                                  stroke="#ffffff"
                                  strokeWidth={0.6}
                                />
                                <text
                                  textAnchor="middle"
                                  y="-2.5"
                                  fill="#ffffff"
                                  fontSize="6"
                                  fontWeight="bold"
                                  fontFamily="sans-serif"
                                >
                                  {st.shortName} {orderCount > 0 ? `(${orderCount})` : ''}
                                </text>
                              </g>
                            </g>
                          </Marker>
                        );
                      })}
                    </ZoomableGroup>
                  </ComposableMap>

                  {/* Tooltip Kính mờ nổi bật */}
                  {tooltipContent && (
                    <div className="absolute top-4 right-4 bg-gray-900/90 text-white p-3 rounded-xl shadow-xl pointer-events-none z-20 backdrop-blur-md border border-gray-700/50 animate-fade-in min-w-[180px]">
                      {tooltipContent}
                    </div>
                  )}

                  {/* THƯỚC ĐO DẢI MÀU (COLOR SCALE LEGEND) */}
                  <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-xl border border-slate-200/80 shadow-sm text-xs z-10 select-none">
                    <div className="text-[11px] font-semibold text-slate-700 mb-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#00A3FF]"></span>
                        Mật độ đơn hàng
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-2 rounded-sm bg-[#f8fafc] border border-slate-300"></div>
                        <span className="text-[9px] text-slate-500 mt-0.5">0</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-2 rounded-sm bg-[#bae6fd]"></div>
                        <span className="text-[9px] text-slate-500 mt-0.5">1-50</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-2 rounded-sm bg-[#38bdf8]"></div>
                        <span className="text-[9px] text-slate-500 mt-0.5">51-200</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-2 rounded-sm bg-[#0284c7]"></div>
                        <span className="text-[9px] text-slate-500 mt-0.5">201-500</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-2 rounded-sm bg-[#075985]"></div>
                        <span className="text-[9px] text-slate-500 mt-0.5">&gt;500</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-1.5 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-[#1B3A6B] border border-white"></span>
                      <span>Chấm tròn: Trạm kỹ thuật Truliva</span>
                    </div>
                  </div>

                  {/* Nút Reset Zoom */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRegion('all');
                      setMapCenter([106.3, 16.2]);
                      setMapZoom(1);
                    }}
                    className="absolute bottom-3 right-3 text-[11px] text-slate-600 bg-white/95 hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm flex items-center gap-1 font-medium transition-colors"
                  >
                    <Compass size={13} className="text-[#00A3FF]" />
                    <span>Mặc định (100%)</span>
                  </button>
                </div>

                {/* Footer thông số bao quát */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Độ phủ: <strong className="text-gray-800">{Object.keys(dashStats.mapDensity || {}).length}</strong> Tỉnh/Thành phố</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Mạng lưới trạm: <strong className="text-gray-800">{TRULIVA_STATION_COORDS.length}</strong> Trạm kỹ thuật</span>
                  </div>
                  <div className="text-[11px] text-gray-400 italic">
                    * Dữ liệu phân tích dựa trên thông tin địa chỉ đơn hàng
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI (5 CỘT): TRUNG TÂM GIÁM SÁT TẢI TRỌNG & NĂNG LỰC TRẠM */}
              <div className="xl:col-span-5 flex flex-col space-y-4">
                {/* Card 1: Năng lực & Tải trọng theo Trạm (Hỗ trợ chuyển đổi Trạm Kỹ thuật vs Trạm Chính) */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                        <Building size={16} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-gray-800">
                          {stationViewMode === 'tech' ? 'Tải trọng theo Trạm Kỹ thuật' : 'Tải trọng theo Trạm Chính (Đối tác)'}
                        </h3>
                        <p className="text-[11px] text-gray-400">
                          {stationViewMode === 'tech' ? 'Khối lượng đơn theo địa bàn KTV trực tiếp thi công' : 'Khối lượng đơn theo đơn vị đối tác quản lý'}
                        </p>
                      </div>
                    </div>

                    {/* Bộ chuyển đổi Trạm Kỹ thuật vs Trạm Chính */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setStationViewMode('tech')}
                        className={`px-2 py-1 rounded-md font-semibold transition-all ${
                          stationViewMode === 'tech'
                            ? 'bg-[#1B3A6B] text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        📍 Trạm Kỹ thuật
                      </button>
                      <button
                        type="button"
                        onClick={() => setStationViewMode('main')}
                        className={`px-2 py-1 rounded-md font-semibold transition-all ${
                          stationViewMode === 'main'
                            ? 'bg-[#1B3A6B] text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        🏢 Trạm Chính
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-[230px] overflow-y-auto pr-1 custom-scrollbar">
                    {stationViewMode === 'tech' ? (
                      /* DANH SÁCH THEO TRẠM KỸ THUẬT (ĐỊA BÀN) */
                      allTechStations.length === 0 ? (
                        <div className="py-8 text-center text-gray-400 text-xs">Chưa có dữ liệu trạm kỹ thuật</div>
                      ) : (
                        allTechStations.map((ts, idx) => {
                          const pct = Math.round((ts.orders / totalTechStationOrders) * 100);
                          return (
                            <div key={idx} className="p-2.5 rounded-xl border border-gray-100 bg-gray-50/60 hover:bg-blue-50/40 transition-colors">
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1B3A6B] font-bold text-[10px] flex items-center justify-center">
                                    {idx + 1}
                                  </span>
                                  <span className="font-bold text-gray-800">{ts.name}</span>
                                </div>
                                <div className="space-x-1.5">
                                  <strong className="text-[#1B3A6B]">{ts.orders} đơn</strong>
                                  <span className="text-gray-400 text-[11px]">({pct}%)</span>
                                </div>
                              </div>
                              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#1B3A6B] to-[#00A3FF] transition-all duration-500"
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          );
                        })
                      )
                    ) : (
                      /* DANH SÁCH THEO TRẠM CHÍNH (ĐỐI TÁC) */
                      (!dashStats.stationStats || dashStats.stationStats.length === 0) ? (
                        <div className="py-8 text-center text-gray-400 text-xs">Chưa có dữ liệu trạm chính</div>
                      ) : (
                        dashStats.stationStats.map((st: any, idx: number) => {
                          const totalOrdersAll = dashStats.stationStats.reduce((sum: number, item: any) => sum + item.totalOrders, 0) || 1;
                          const pct = Math.round((st.totalOrders / totalOrdersAll) * 100);

                          return (
                            <div key={idx} className="p-2.5 rounded-xl border border-gray-100 bg-gray-50/60 hover:bg-blue-50/40 transition-colors">
                              <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="font-bold text-gray-800 flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#1B3A6B]"></span>
                                  {st.name}
                                </span>
                                <div className="space-x-1.5">
                                  <span className="font-bold text-[#1B3A6B]">{st.totalOrders} đơn</span>
                                  <span className="text-gray-400 text-[11px]">({pct}%)</span>
                                </div>
                              </div>

                              <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#1B3A6B] to-[#00A3FF] transition-all duration-500"
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                ></div>
                              </div>

                              {st.techStations && st.techStations.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2 pt-1.5 border-t border-gray-200/60">
                                  {st.techStations.map((tech: any, tIdx: number) => (
                                    <span key={tIdx} className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-600">
                                      {tech.name}: <strong className="text-gray-800">{tech.orders}</strong>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )
                    )}
                  </div>
                </div>

                {/* Card 2: Top 5 Điểm nóng & Tỷ lệ Đúng hẹn */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-700 flex items-center justify-center font-bold">
                        <TrendingUp size={16} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-gray-800">Top Khu vực & Tỷ lệ Đúng hẹn</h3>
                        <p className="text-[11px] text-gray-400">Hiệu suất thực hiện ca theo từng tỉnh thành trọng điểm</p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-y-auto max-h-[220px] pr-1 custom-scrollbar">
                    {(!analysisData.provinceStats || analysisData.provinceStats.length === 0) ? (
                      <div className="py-8 text-center text-gray-400 text-xs">Chưa có dữ liệu thống kê</div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-100 pb-1 text-[11px]">
                            <th className="font-medium pb-2">Tỉnh / Thành</th>
                            <th className="font-medium pb-2 text-right">Số ca</th>
                            <th className="font-medium pb-2 text-right">Đúng hẹn</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {[...analysisData.provinceStats]
                            .sort((a, b) => b.total - a.total)
                            .slice(0, 5)
                            .map((entry: any, index: number, arr: any[]) => {
                              const displayedTotal = arr.reduce((sum: number, e: any) => sum + e.total, 0) || 1;
                              const pct = Math.round((entry.total / displayedTotal) * 100);
                              const onTimeRate = entry.total > 0
                                ? Math.round((entry.onTime / entry.total) * 100)
                                : 100;

                              return (
                                <tr key={index} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2.5 font-medium text-gray-800 flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-blue-50 text-[#1B3A6B] text-[10px] font-bold flex items-center justify-center">
                                      {index + 1}
                                    </span>
                                    <span>{entry.name}</span>
                                  </td>
                                  <td className="py-2.5 text-right font-bold text-gray-900">
                                    {entry.total}
                                    <span className="text-[10px] text-gray-400 font-normal ml-1">({pct}%)</span>
                                  </td>
                                  <td className="py-2.5 text-right">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                        onTimeRate >= 90
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : onTimeRate >= 80
                                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}
                                    >
                                      {onTimeRate}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Tổng kết cuối cột */}
                  <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-500 font-medium">Tổng ca trong phân tích</span>
                    <span className="font-extrabold text-[#1B3A6B] text-sm">
                      {[...analysisData.provinceStats].reduce((sum, item) => sum + item.total, 0)} ca
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: COMBINED ON-TIME & LATE SLA PERFORMANCE REPORT */}
      {activeTab === 'ontime' && (
        <div className="space-y-6 animate-fade-in">
          {loadingAnalysis ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 text-xs">Đang truy vấn dữ liệu hiệu suất SLA...</p>
            </div>
          ) : !analysisData ? (
            <div className="alert alert-error">Lỗi khi phân tích dữ liệu hiệu suất SLA</div>
          ) : (
            <>
              {/* Info Definition Alert - 2 Columns */}
              <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-rose-50/70 border border-blue-200/80 p-4 rounded-xl shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-start space-x-2.5">
                  <div className="p-1 bg-emerald-100 text-emerald-700 rounded-md mt-0.5 shrink-0">
                    <CheckCircle size={15} />
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-emerald-800 text-[13px]">✓ Quy chuẩn Đúng Hẹn (On-Time KPI)</div>
                    <p className="text-gray-600 leading-relaxed">
                      Đơn hàng đã hoàn thành có <b>Ngày nghiệm thu thực tế</b> (KTV nộp báo cáo ca) <b>≤ Ngày hẹn khách hàng</b> (tính theo ngày, không xét giờ).
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-2.5 md:border-l md:border-gray-200 md:pl-4">
                  <div className="p-1 bg-rose-100 text-rose-700 rounded-md mt-0.5 shrink-0">
                    <AlertTriangle size={15} />
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-rose-800 text-[13px]">⚠ Quy chuẩn Trễ Hẹn (Late KPI)</div>
                    <p className="text-gray-600 leading-relaxed">
                      Ca đã hoàn thành nhưng ngày nghiệm thu &gt; ngày hẹn, HOẶC ca chưa hoàn thành (chờ xử lý / đã phân công) đã quá ngày hẹn khách.
                    </p>
                  </div>
                </div>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Tổng đơn có lịch hẹn */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-blue-600 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 font-semibold text-xs uppercase tracking-wider">Tổng Đơn Có Lịch Hẹn</span>
                    <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><Clock size={16} /></span>
                  </div>
                  <div className="text-3xl font-extrabold text-[#1B3A6B] mt-2">{analysisData.summary.totalWithAppointments.toLocaleString('vi-VN')}</div>
                  <div className="text-[11px] text-gray-400 mt-1">Đơn có ngày hẹn trong kỳ lọc</div>
                </div>

                {/* Card 2: Số ca đúng hẹn */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-emerald-500 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <span className="text-emerald-700 font-semibold text-xs uppercase tracking-wider">Số Ca Đúng Hẹn</span>
                    <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg"><CheckCircle size={16} /></span>
                  </div>
                  <div className="text-3xl font-extrabold text-emerald-600 mt-2">{analysisData.summary.totalOnTime.toLocaleString('vi-VN')}</div>
                  <div className="text-[11px] text-emerald-700 font-medium mt-1">
                    Đạt {analysisData.summary.totalWithAppointments > 0 ? Math.round((analysisData.summary.totalOnTime / analysisData.summary.totalWithAppointments) * 100) : 0}% tổng lịch hẹn
                  </div>
                </div>

                {/* Card 3: Số ca trễ hẹn */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-rose-500 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700 font-semibold text-xs uppercase tracking-wider">Số Ca Trễ Hẹn</span>
                    <span className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><AlertTriangle size={16} /></span>
                  </div>
                  <div className="text-3xl font-extrabold text-rose-600 mt-2">{analysisData.summary.totalLate.toLocaleString('vi-VN')}</div>
                  <div className="text-[11px] text-rose-700 font-medium mt-1">
                    Chiếm {analysisData.summary.totalWithAppointments > 0 ? Math.round((analysisData.summary.totalLate / analysisData.summary.totalWithAppointments) * 100) : 0}% tổng lịch hẹn
                  </div>
                </div>

                {/* Card 4: Tỷ lệ Đúng Hẹn SLA */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-indigo-600 hover:shadow-md transition-shadow flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-900 font-semibold text-xs uppercase tracking-wider">Tỷ Lệ Đúng Hẹn SLA</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${analysisData.summary.onTimeRate >= 90 ? 'bg-emerald-100 text-emerald-700' : analysisData.summary.onTimeRate >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                      {analysisData.summary.onTimeRate >= 90 ? 'Xuất sắc' : analysisData.summary.onTimeRate >= 75 ? 'Đạt' : 'Cần cải thiện'}
                    </span>
                  </div>
                  <div className="text-3xl font-extrabold text-indigo-950 mt-1">{analysisData.summary.onTimeRate}%</div>
                  <div className="w-full bg-rose-200 h-2 rounded-full mt-2 overflow-hidden flex" title={`Đúng: ${analysisData.summary.onTimeRate}%, Trễ: ${100 - analysisData.summary.onTimeRate}%`}>
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(0, analysisData.summary.onTimeRate))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Chart: Stacked Bar Xu hướng Tiến độ Đúng / Trễ theo Thời gian */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 mb-4 gap-3">
                  <div>
                    <h3 className="font-bold text-base text-[#1B3A6B] flex items-center gap-2">
                      <TrendingUp size={18} className="text-indigo-600" />
                      Xu hướng Tiến độ Hoàn thành Đúng Hẹn vs Trễ Hẹn
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      So sánh số lượng ca đạt chuẩn đúng hạn và các ca bị quá hạn theo tiến trình thời gian
                    </p>
                  </div>

                  {/* Selector for scale: Day / Week / Month */}
                  <div className="flex bg-gray-100 p-1 rounded-lg space-x-1 border border-gray-200 self-start sm:self-auto">
                    <button
                      onClick={() => setLateChartScale('day')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${lateChartScale === 'day' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Theo Ngày
                    </button>
                    <button
                      onClick={() => setLateChartScale('week')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${lateChartScale === 'week' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Theo Tuần
                    </button>
                    <button
                      onClick={() => setLateChartScale('month')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${lateChartScale === 'month' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Theo Tháng
                    </button>
                  </div>
                </div>

                <div className="w-full h-[320px]">
                  {analysisData.dailyStats.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                      Không có dữ liệu lịch hẹn trong khoảng thời gian này
                    </div>
                  ) : (
                    (() => {
                      const chartData = getGroupedStats(analysisData.dailyStats, lateChartScale);
                      if (chartData.length === 0) {
                        return <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu trong khoảng thời gian này</div>;
                      }
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                            <RechartsTooltip
                              contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                              formatter={(value: any, name: any, entry: any) => {
                                if (name === 'Đúng hẹn') return [`${value} ca (${entry.payload.total > 0 ? Math.round((entry.payload.onTime / entry.payload.total) * 100) : 0}%)`, 'Đúng hẹn'];
                                if (name === 'Trễ hẹn') return [`${value} ca (${entry.payload.latePercent}%)`, 'Trễ hẹn'];
                                return [value, name || ''];
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12, paddingTop: '10px' }} />
                            <Bar dataKey="onTime" name="Đúng hẹn" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="late" name="Trễ hẹn" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      );
                    })()
                  )}
                </div>
              </div>

              {/* Multi-dimensional Breakdown Grid (2x2) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* 1. Đúng hẹn vs Trễ hẹn theo Loại công việc */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <div className="border-b pb-3 mb-4">
                    <h3 className="font-bold text-sm text-[#1B3A6B]">Tương quan Đúng / Trễ theo Loại công việc</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Xếp chồng số ca hoàn thành đúng hạn vs số ca trễ theo dịch vụ</p>
                  </div>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.workTypeStats} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          tickFormatter={(value) => value === 'Giao hàng và Lắp đặt' ? 'Giao hàng & Lắp đặt' : value}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="onTime" name="Đúng hẹn" stackId="wt" fill="#10b981" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="late" name="Trễ hẹn" stackId="wt" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. Đúng hẹn vs Trễ hẹn theo Trạm kỹ thuật */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <div className="border-b pb-3 mb-4">
                    <h3 className="font-bold text-sm text-[#1B3A6B]">Tương quan Đúng / Trễ theo Trạm kỹ thuật (Top trạm)</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">So sánh hiệu suất thực hiện lịch hẹn tại các trạm địa bàn</p>
                  </div>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...analysisData.techStationStats].sort((a: any, b: any) => b.total - a.total).slice(0, 8)}
                        margin={{ top: 5, right: 10, left: -25, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                          height={45}
                          tick={{ fill: '#64748b', fontSize: 9, angle: -25, textAnchor: 'end' }}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="onTime" name="Đúng hẹn" stackId="ts" fill="#10b981" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="late" name="Trễ hẹn" stackId="ts" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. Đúng hẹn vs Trễ hẹn theo Kỹ thuật viên */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <div className="border-b pb-3 mb-4">
                    <h3 className="font-bold text-sm text-[#1B3A6B]">Tương quan Đúng / Trễ theo Kỹ thuật viên (Top KTV)</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Xếp hạng năng lực xử lý đúng hạn của các thợ có nhiều ca nhất</p>
                  </div>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[...analysisData.ktvStats].sort((a: any, b: any) => b.total - a.total).slice(0, 10)}
                        margin={{ top: 5, right: 10, left: -25, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                          height={45}
                          tick={{ fill: '#64748b', fontSize: 9, angle: -25, textAnchor: 'end' }}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="onTime" name="Đúng hẹn" stackId="ktv" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="late" name="Trễ hẹn" stackId="ktv" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 4. Thời gian hoàn thành trung bình (Lead Time) */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <div className="border-b pb-3 mb-4">
                    <h3 className="font-bold text-sm text-[#1B3A6B]">Chênh lệch Ngày nghiệm thu thực tế so với Ngày hẹn</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      * Giá trị ≤ 0 là làm trước/đúng hạn, giá trị &gt; 0 thể hiện số ngày trễ hẹn TB
                    </p>
                  </div>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.workTypeStats} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          tickFormatter={(value) => value === 'Giao hàng và Lắp đặt' ? 'Giao hàng & Lắp đặt' : value}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="avgLeadTimeDays" name="Chênh lệch ngày TB" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

              {/* BẢNG DANH SÁCH CÁC CA ĐANG TRỄ HẸN CẦN XỬ LÝ */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center flex-wrap gap-3">
                  <h3 className="font-bold text-base text-rose-600 flex items-center gap-1.5">
                    <AlertTriangle size={17} />
                    Danh sách các ca đang trễ hẹn cần xử lý
                  </h3>

                  <div className="flex items-center gap-3">
                    {/* Province Filter Dropdown for Late Orders */}
                    {lateProvinces.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-semibold text-gray-500 uppercase">Lọc theo Tỉnh/TP:</label>
                        <select
                          className="border border-gray-200 rounded px-2.5 py-1 text-xs outline-none focus:border-rose-500 text-gray-700 bg-white shadow-sm font-semibold"
                          value={selectedLateProvince}
                          onChange={e => setSelectedLateProvince(e.target.value)}
                        >
                          <option value="">-- Tất cả ({lateProvinces.length} khu vực) --</option>
                          {lateProvinces.map(p => (
                            <option key={p} value={p}>
                              {p} ({analysisData.lateOrders.filter((o: any) => o.province === p).length} ca)
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <span className="bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-1 rounded-full">
                      {filteredLateOrders.length} ca trễ
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {filteredLateOrders.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">
                      🎉 Tuyệt vời! Không có ca nào bị trễ hẹn trong khoảng thời gian và bộ lọc này.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs whitespace-nowrap divide-y divide-gray-100">
                      <thead className="bg-[#f8f9fa] text-gray-600 font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="px-5 py-3.5">Tên khách hàng</th>
                          <th className="px-5 py-3.5">Số điện thoại</th>
                          <th className="px-5 py-3.5">Khu vực (Tỉnh/Thành)</th>
                          <th className="px-5 py-3.5">Loại công việc / dịch vụ</th>
                          <th className="px-5 py-3.5">Ngày hẹn khách</th>
                          <th className="px-5 py-3.5 text-center">Số ngày trễ</th>
                          <th className="px-5 py-3.5 text-center">Trạng thái đơn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {filteredLateOrders.map((o: any, index: number) => (
                          <tr key={index} className="hover:bg-rose-50/30 transition-colors">
                            <td className="px-5 py-3.5 font-medium text-gray-900">{o.customerName}</td>
                            <td className="px-5 py-3.5 text-gray-500">{o.customerPhone || '-'}</td>
                            <td className="px-5 py-3.5 text-gray-700 flex items-center space-x-1">
                              <MapPin size={13} className="text-gray-400" />
                              <span>{o.province}</span>
                            </td>
                            <td className="px-5 py-3.5 text-gray-700 font-semibold">{o.workType}</td>
                            <td className="px-5 py-3.5 text-gray-500">
                              {new Date(o.appointmentDateStr).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className="inline-block bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 rounded text-[11px] min-w-8">
                                Trễ {o.delayDays} ngày
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                o.adminStatus === 'hoàn thành' ? 'bg-emerald-100 text-emerald-800' :
                                o.adminStatus === 'đang thực hiện' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {o.adminStatus === 'đang thực hiện' ? 'đã phân công' : o.adminStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB CONTENT 4: WORKLOAD TRENDS */}
      {activeTab === 'workload' && (
        <div className="space-y-6 animate-fade-in">
          {loadingAnalysis ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 text-xs">Đang truy vấn dữ liệu hiệu suất...</p>
            </div>
          ) : !analysisData ? (
            <div className="alert alert-error">Lỗi khi phân tích dữ liệu công việc</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cột trái: Biểu đồ xu hướng công việc (chiếm 2/3) */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[480px] lg:col-span-2">
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                  <h3 className="font-bold text-base text-gray-800 flex items-center gap-1.5">
                    <TrendingUp size={17} className="text-blue-600" />
                    Thống kê & Xu hướng công việc theo Tháng
                  </h3>

                  {/* Nút Toggle loại biểu đồ */}
                  <div className="flex bg-gray-100 p-1 rounded-lg space-x-1 border border-gray-200">
                    <button
                      onClick={() => setChartType('stackedBar')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${chartType === 'stackedBar' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Cột chồng
                    </button>
                    <button
                      onClick={() => setChartType('line')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${chartType === 'line' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Đường xu hướng
                    </button>
                  </div>
                </div>

                <div className="flex-1 w-full h-[360px]">
                  {(!analysisData.workTypeMonthlyStats || analysisData.workTypeMonthlyStats.length === 0) ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu trong khoảng thời gian này</div>
                  ) : chartType === 'stackedBar' ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.workTypeMonthlyStats} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="month" tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(val) => { const parts = val.split('-'); return parts.length === 2 ? `T${parts[1]}/${parts[0]}` : val; }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                        <Bar dataKey="Giao hàng và Lắp đặt" name="Giao hàng & Lắp đặt" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="Lắp đặt" name="Lắp đặt" stackId="a" fill="#0ea5e9" />
                        <Bar dataKey="Giao hàng" name="Giao hàng" stackId="a" fill="#10b981" />
                        <Bar dataKey="Thay lọc" name="Thay lọc" stackId="a" fill="#f59e0b" />
                        <Bar dataKey="Bảo hành" name="Bảo hành" stackId="a" fill="#8b5cf6" />
                        <Bar dataKey="Sửa chữa" name="Sửa chữa" stackId="a" fill="#ef4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analysisData.workTypeMonthlyStats} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="month" tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(val) => { const parts = val.split('-'); return parts.length === 2 ? `T${parts[1]}/${parts[0]}` : val; }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                        <Line type="monotone" dataKey="Giao hàng và Lắp đặt" name="Giao hàng & Lắp đặt" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="Lắp đặt" name="Lắp đặt" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="Giao hàng" name="Giao hàng" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="Thay lọc" name="Thay lọc" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="Bảo hành" name="Bảo hành" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="Sửa chữa" name="Sửa chữa" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Cột phải: Biểu đồ tròn/donut cơ cấu loại công việc (chiếm 1/3) */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[480px]">
                <h3 className="font-bold text-base text-gray-800 border-b pb-3 mb-4">
                  Cơ cấu loại công việc trong kì
                </h3>
                <div className="flex-1 flex flex-col justify-center items-center relative">
                  <div className="w-full h-[220px]">
                    {(!analysisData.workTypeStats || analysisData.workTypeStats.length === 0) ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analysisData.workTypeStats}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={85}
                            paddingAngle={3}
                            dataKey="total"
                            nameKey="name"
                          >
                            {analysisData.workTypeStats.map((entry: any, index: number) => {
                              const colors: Record<string, string> = {
                                'Giao hàng và Lắp đặt': '#3b82f6',
                                'Lắp đặt': '#0ea5e9',
                                'Giao hàng': '#10b981',
                                'Thay lọc': '#f59e0b',
                                'Bảo hành': '#8b5cf6',
                                'Sửa chữa': '#ef4444'
                              };
                              const color = colors[entry.name] || '#64748b';
                              return <Cell key={`cell-${index}`} fill={color} />;
                            })}
                          </Pie>
                          <RechartsTooltip formatter={(value, name) => [`${value} đơn`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Bảng tóm tắt phần trăm ở dưới Donut */}
                  <div className="w-full mt-4 max-h-[160px] overflow-y-auto space-y-1.5 text-xs text-gray-600 px-2">
                    {analysisData.workTypeStats.map((entry: any, index: number) => {
                      const colors: Record<string, string> = {
                        'Giao hàng và Lắp đặt': '#3b82f6',
                        'Lắp đặt': '#0ea5e9',
                        'Giao hàng': '#10b981',
                        'Thay lọc': '#f59e0b',
                        'Bảo hành': '#8b5cf6',
                        'Sửa chữa': '#ef4444'
                      };
                      const color = colors[entry.name] || '#64748b';
                      const totalOrders = analysisData.summary.totalWithAppointments || 1;
                      const percentage = Math.round((entry.total / totalOrders) * 100);
                      return (
                        <div key={index} className="flex justify-between items-center border-b border-gray-50 pb-1">
                          <div className="flex items-center space-x-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                            <span className="font-medium text-gray-700">{entry.name}</span>
                          </div>
                          <div className="text-right space-x-2">
                            <span className="font-bold text-gray-800">{entry.total} ca</span>
                            <span className="text-gray-400">({percentage}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 5: STATION COMPARISON & DISPATCH ANALYTICS */}
      {activeTab === 'stationComp' && (
        <div className="space-y-6 animate-fade-in">
          {loadingAnalysis ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <p className="text-gray-500 text-xs">Đang truy vấn dữ liệu trạm đối tác...</p>
            </div>
          ) : !analysisData ? (
            <div className="alert alert-error">Lỗi khi phân tích dữ liệu đối tác</div>
          ) : (
            <>
              {/* Info Definition Alert */}
              <div className="bg-purple-50 border border-purple-200 text-purple-800 p-4 rounded-xl flex items-start space-x-3 shadow-sm">
                <Building className="text-purple-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-[13px]">Báo cáo Điều phối & Năng suất Trạm chính</div>
                  <p className="text-gray-600 leading-relaxed font-medium">
                    Theo dõi tỷ lệ <b>Đơn chưa phân công Trạm</b> theo từng Tỉnh/Thành phố để ưu tiên điều phối, đồng thời đánh giá <b>Năng suất & Tỷ lệ đúng hẹn</b> thực tế của từng Trạm đối tác (không tính các ca chưa phân trạm).
                  </p>
                </div>
              </div>

              {/* PHẦN 1: BÁO CÁO ĐƠN CHƯA PHÂN TRẠM THEO TỈNH */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Biểu đồ cột chồng Tỉ lệ chưa phân trạm Top 10 tỉnh */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[440px] lg:col-span-2">
                  <div className="flex justify-between items-center border-b pb-3 mb-4">
                    <div>
                      <h3 className="font-bold text-base text-gray-800 flex items-center gap-2">
                        <AlertTriangle size={17} className="text-rose-500" />
                        Tình trạng Phân công Trạm theo Tỉnh / Thành phố
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">Top khu vực có số lượng đơn chờ phân trạm chính nhiều nhất</p>
                    </div>
                    <span className="bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-1 rounded-full">
                      {(analysisData.unassignedProvinceStats || []).reduce((acc: number, curr: any) => acc + curr.unassigned, 0)} ca chưa gán
                    </span>
                  </div>

                  <div className="flex-1 w-full h-[320px]">
                    {(!analysisData.unassignedProvinceStats || analysisData.unassignedProvinceStats.length === 0) ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu đơn hàng</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analysisData.unassignedProvinceStats.slice(0, 10)} margin={{ top: 5, right: 10, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis
                            dataKey="province"
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            height={40}
                            tick={{ fill: '#6b7280', fontSize: 10, angle: -25, textAnchor: 'end' }}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                          <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 5 }} />
                          <Bar dataKey="unassigned" name="Chưa phân trạm (Tồn đọng)" stackId="a" fill="#f43f5e" />
                          <Bar dataKey="assigned" name="Đã phân trạm" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Bảng Top Tỉnh tồn đọng đơn chưa gán trạm */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[440px]">
                  <h3 className="font-bold text-base text-gray-800 border-b pb-3 mb-4">
                    Top Tỉnh Tồn Đọng Chưa Gán Trạm
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                    {(analysisData.unassignedProvinceStats || [])
                      .slice(0, 8)
                      .map((item: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100/60 transition-colors">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-xs text-gray-800">{item.province}</span>
                            <span className="text-[11px] font-extrabold text-rose-600">
                              {item.unassigned} / {item.total} ca ({item.unassignedRate}%)
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden flex">
                            <div
                              className="bg-rose-500 h-full transition-all duration-300"
                              style={{ width: `${item.unassignedRate}%` }}
                            />
                            <div
                              className="bg-blue-500 h-full transition-all duration-300"
                              style={{ width: `${100 - item.unassignedRate}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* PHẦN 2: BÁO CÁO NĂNG SUẤT & TỶ LỆ ĐÚNG HẸN CỦA TRẠM ĐỐI TÁC */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Biểu đồ nhóm Năng suất vs Đúng hẹn của Trạm đối tác */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[420px] lg:col-span-2">
                  <div className="border-b pb-3 mb-4 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-base text-gray-800 flex items-center gap-2">
                        <Building size={17} className="text-purple-600" />
                        Năng suất & Tỷ lệ Đúng hẹn của Trạm Đối tác
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">So sánh tổng số ca tiếp nhận, số ca hoàn thành và ca trễ hẹn (đã loại bỏ chưa phân trạm)</p>
                    </div>
                  </div>

                  <div className="flex-1 w-full h-[300px]">
                    {(!analysisData.stationPerformanceStats || analysisData.stationPerformanceStats.length === 0) ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">Chưa ghi nhận dữ liệu phân công trạm</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analysisData.stationPerformanceStats} margin={{ top: 5, right: 10, left: -20, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            height={40}
                            tick={{ fill: '#6b7280', fontSize: 10, angle: -15, textAnchor: 'end' }}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                          <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 5 }} />
                          <Bar dataKey="total" name="Tổng ca tiếp nhận" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="onTime" name="Hoàn thành đúng hẹn" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="late" name="Bị trễ hẹn" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Bảng xếp hạng KPI Trạm chính */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[420px]">
                  <h3 className="font-bold text-base text-gray-800 border-b pb-3 mb-4">
                    Bảng Xếp Hạng KPI Trạm
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {(!analysisData.stationPerformanceStats || analysisData.stationPerformanceStats.length === 0) ? (
                      <div className="text-center py-10 text-gray-400 text-sm">Chưa có dữ liệu</div>
                    ) : (
                      analysisData.stationPerformanceStats.map((st: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg border border-gray-100 bg-white hover:bg-purple-50/40 transition-colors flex justify-between items-center">
                          <div className="space-y-0.5">
                            <div className="font-bold text-xs text-gray-900">{st.name}</div>
                            <div className="text-[11px] text-gray-500">
                              Tổng: <b className="text-gray-800">{st.total} ca</b> | Đúng hẹn: <b className="text-emerald-600">{st.onTime} ca</b>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${st.onTimeRate >= 80 ? 'bg-emerald-100 text-emerald-800' :
                                st.onTimeRate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                              Đúng hẹn {st.onTimeRate}%
                            </span>
                            {st.late > 0 && (
                              <div className="text-[10px] text-rose-500 font-semibold mt-0.5">
                                Trễ: {st.late} ca
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB CONTENT 6: PRODUCT QUALITY */}
      {activeTab === 'productQuality' && (
        <div className="space-y-6 animate-fade-in">
          {loadingQuality ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
              <p className="text-gray-500 text-xs">Đang phân tích chất lượng sản phẩm...</p>
            </div>
          ) : !qualityData ? (
            <div className="alert alert-error">Lỗi khi tải phân tích chất lượng sản phẩm</div>
          ) : (
            <>
              {/* Product Filter Dropdown */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-4 flex-wrap hover:shadow-md transition-shadow">
                <div className="flex items-center space-x-2 text-orange-600 font-semibold text-sm">
                  <Filter size={16} />
                  <span>Bộ lọc dòng sản phẩm</span>
                </div>
                <div className="flex items-center gap-2 relative min-w-[240px]">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Chọn dòng máy:</span>
                  <div className="w-64">
                    <MultiSelect
                      label=""
                      options={qualityData.allProducts || []}
                      selectedValues={selectedProducts}
                      onChange={setSelectedProducts}
                      isOpen={openDropdown === 'product'}
                      onToggle={() => setOpenDropdown(openDropdown === 'product' ? null : 'product')}
                      placeholder={`Tất cả sản phẩm (${qualityData.allProducts?.length || 0})`}
                    />
                  </div>
                </div>
              </div>

              {/* Quality KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-blue-500 flex flex-col justify-between">
                  <div className="text-gray-500 font-semibold text-xs flex items-center gap-1.5"><FileText size={14} /> TỔNG CA LẮP ĐẶT</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">{qualityData.summary.totalInstalls}</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-red-500 flex flex-col justify-between">
                  <div className="text-red-600 font-semibold text-xs flex items-center gap-1.5"><AlertCircle size={14} /> TỔNG CA SỰ CỐ / LỖI</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">{qualityData.summary.totalIssues}</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-orange-500 flex flex-col justify-between">
                  <div className="text-orange-600 font-semibold text-xs flex items-center gap-1.5"><AlertTriangle size={14} /> MÁY GẶP SỰ CỐ SAU LẮP</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">{qualityData.summary.machinesWithIssues}</div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-emerald-500 flex flex-col justify-between col-span-2">
                  <div className="text-emerald-600 font-semibold text-xs flex items-center gap-1.5"><Clock size={14} /> THỜI GIAN TB HỎNG SAU LẮP</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">
                    {qualityData.summary.avgDaysToFailure > 0 ? `${qualityData.summary.avgDaysToFailure} ngày` : 'Chưa ghi nhận'}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">* Tính từ lúc lắp máy đến khi phát sinh ca bảo hành/sửa chữa đầu tiên</p>
                </div>
              </div>

              {/* Charts Row 1: Product & Area Issues */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Dòng máy thường gặp sự cố */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[420px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Dòng máy / Sản phẩm thường gặp sự cố</h3>
                  <div className="flex-1 w-full">
                    {qualityData.productIssues.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu sự cố dòng máy</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={qualityData.productIssues.slice(0, 10).map((item: any) => {
                            let clean = item.name
                              .replace(/^(Máy lọc nước |Máy nóng lạnh treo tường |Máy lọc không khí |Bộ lọc nước tại vòi |\([A-Z]\)\s*)/gi, '')
                              .trim();
                            if (clean.length > 25) {
                              clean = clean.slice(0, 24) + '…';
                            }
                            return {
                              ...item,
                              displayName: clean
                            };
                          })}
                          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="displayName"
                            axisLine={false}
                            tickLine={false}
                            width={160}
                            tick={{ fill: '#4b5563', fontSize: 11, fontWeight: 500 }}
                          />
                          <RechartsTooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value, _name, props) => [`${value} ca lỗi`, props.payload.name]}
                          />
                          <Bar dataKey="total" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* 2. Khu vực thường gặp sự cố */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[420px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Khu vực thường gặp sự cố (Tỉnh / Thành phố)</h3>
                  <div className="flex-1 w-full">
                    {qualityData.provinceIssues.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu sự cố theo khu vực</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={qualityData.provinceIssues.slice(0, 10)} margin={{ top: 5, right: 10, left: -25, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            height={40}
                            tick={{ fill: '#6b7280', fontSize: 9, angle: -35, textAnchor: 'end' }}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                          <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none' }} />
                          <Bar dataKey="total" name="Số ca lỗi" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Charts Row 2: Monthly trend of issue types & Lifecycle distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 3. Tỷ lệ loại sự cố theo tháng */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[400px] lg:col-span-2">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Cơ cấu & Xu hướng loại sự cố theo Tháng</h3>
                  <div className="flex-1 w-full">
                    {qualityData.monthlyIssuesTrend.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu sự cố hàng tháng</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={qualityData.monthlyIssuesTrend.map((item: any) => ({
                            month: item.month,
                            ...item.issues
                          }))}
                          margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                          <XAxis dataKey="month" tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(val) => { const parts = val.split('-'); return parts.length === 2 ? `T${parts[1]}/${parts[0]}` : val; }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                          <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none' }} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                          {(() => {
                            const issueKeys = Array.from(new Set(
                              qualityData.monthlyIssuesTrend.flatMap((item: any) => Object.keys(item.issues))
                            ));
                            const colors = ['#0ea5e9', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f43f5e', '#6366f1'];
                            return issueKeys.map((key: any, idx: number) => (
                              <Bar key={key} dataKey={key} name={key} stackId="a" fill={colors[idx % colors.length]} />
                            ));
                          })()}
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* 4. Phân bổ thời gian hỏng sau lắp */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[400px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Khoảng thời gian hỏng sau khi lắp</h3>
                  <div className="flex-1 flex flex-col justify-center items-center relative">
                    <div className="w-full h-[200px]">
                      {qualityData.lifecycleList.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">Chưa ghi nhận ca lỗi liên kết lắp đặt</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={qualityData.durationDist}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={75}
                              paddingAngle={3}
                              dataKey="value"
                              nameKey="name"
                            >
                              {qualityData.durationDist.map((_: any, index: number) => {
                                const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
                                return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                              })}
                            </Pie>
                            <RechartsTooltip formatter={(value, name) => [`${value} ca`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Bảng chú thích */}
                    <div className="w-full mt-4 space-y-1.5 text-xs text-gray-600 px-2">
                      {qualityData.durationDist.map((entry: any, index: number) => {
                        const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
                        const total = qualityData.summary.machinesWithIssues || 1;
                        const pct = Math.round((entry.value / total) * 100);
                        return (
                          <div key={index} className="flex justify-between items-center border-b border-gray-50 pb-1">
                            <div className="flex items-center space-x-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }}></span>
                              <span className="font-medium text-gray-700">{entry.name}</span>
                            </div>
                            <div className="text-right space-x-2">
                              <span className="font-bold text-gray-800">{entry.value} ca</span>
                              <span className="text-gray-400">({pct}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* BẢNG CHI TIẾT SỰ CỐ & LINH KIỆN THAY THẾ */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
                  <h3 className="font-bold text-base text-gray-800 flex items-center gap-1.5">
                    <FileText size={17} className="text-orange-500" />
                    Báo cáo Chi tiết Sự cố & Linh kiện thay thế mỗi case
                  </h3>
                  <span className="bg-orange-100 text-orange-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                    {qualityData.cases.length} case ghi nhận
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[450px]">
                  {qualityData.cases.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">Chưa ghi nhận ca thay thế linh kiện hoặc báo cáo sự cố nào.</div>
                  ) : (
                    <table className="w-full text-left text-xs whitespace-nowrap divide-y divide-gray-100">
                      <thead className="bg-[#f8f9fa] text-gray-600 font-semibold uppercase tracking-wider sticky top-0">
                        <tr>
                          <th className="px-5 py-3">Mã đơn</th>
                          <th className="px-5 py-3">KTV Báo Cáo</th>
                          <th className="px-5 py-3">Số Serial Máy</th>
                          <th className="px-5 py-3">Dòng máy</th>
                          <th className="px-5 py-3">Khu vực</th>
                          <th className="px-5 py-3">Nguyên nhân / Sự cố</th>
                          <th className="px-5 py-3">Cách xử lý của KTV</th>
                          <th className="px-5 py-3">Linh kiện thay thế</th>
                          <th className="px-5 py-3">Thời gian tạo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {qualityData.cases.map((c: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3.5 font-bold text-blue-700">
                              {c.pancakeOrderId ? `#${c.pancakeOrderId}` : 'Khác'}
                            </td>
                            <td className="px-5 py-3.5 text-gray-900 font-medium">{c.ktvName}</td>
                            <td className="px-5 py-3.5 text-gray-700 font-mono">{c.serialNumber}</td>
                            <td className="px-5 py-3.5 text-gray-600 max-w-[200px] overflow-hidden text-ellipsis">
                              {c.products.join(', ')}
                            </td>
                            <td className="px-5 py-3.5 text-gray-500">{c.province}</td>
                            <td className="px-5 py-3.5">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-150">
                                {c.issueType}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-150">
                                {c.handlingMethod}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 max-w-[250px] overflow-hidden text-ellipsis">
                              <div className="flex flex-wrap gap-1">
                                {c.spareParts.length > 0 ? (
                                  c.spareParts.map((p: string, pIdx: number) => (
                                    <span key={pIdx} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 text-[10px] font-semibold">
                                      {p}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-gray-400 italic">Không có</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-gray-400">
                              {new Date(c.createdAt).toLocaleDateString('vi-VN')} {new Date(c.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB CONTENT 7: REVENUE ANALYSIS */}
      {activeTab === 'revenue' && (
        <div className="space-y-6 animate-fade-in">
          {loadingRevenue ? (
            <div className="bg-white p-12 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
              <p className="text-gray-500 text-sm font-medium">Đang tải và phân tích dữ liệu doanh thu...</p>
            </div>
          ) : !revenueData ? (
            <div className="bg-white p-8 rounded-xl border border-gray-200 text-center text-gray-500">
              Không có dữ liệu doanh thu cho khoảng thời gian và bộ lọc được chọn.
            </div>
          ) : (
            <>
              {/* SOURCE & METRIC CONTROL TOOLBAR */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-sm text-[#1B3A6B] flex items-center gap-2">
                    <Filter size={16} className="text-blue-600" />
                    Cấu hình Phạm vi & Chỉ số Báo cáo
                  </h3>
                  <p className="text-xs text-gray-500">Chuyển đổi góc nhìn giữa Doanh thu thực thu COD (đối chiếu POS) và Tổng doanh số niêm yết</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Metric Switcher */}
                  <div className="inline-flex bg-emerald-50/80 p-1 rounded-xl border border-emerald-200/80">
                    <button
                      onClick={() => setRevenueMetricType('moneyToCollect')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${revenueMetricType === 'moneyToCollect'
                          ? 'bg-emerald-700 text-white shadow-sm'
                          : 'text-emerald-800 hover:bg-white/60'
                        }`}
                    >
                      <DollarSign size={14} />
                      <span>Thực thu (COD / Thực nhận)</span>
                    </button>
                    <button
                      onClick={() => setRevenueMetricType('totalPrice')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${revenueMetricType === 'totalPrice'
                          ? 'bg-emerald-700 text-white shadow-sm'
                          : 'text-emerald-800 hover:bg-white/60'
                        }`}
                    >
                      <TrendingUp size={14} />
                      <span>Doanh số (Giá niêm yết)</span>
                    </button>
                  </div>

                  {/* Scope Switcher */}
                  <div className="inline-flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                    <button
                      onClick={() => setRevenueScope('all')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${revenueScope === 'all'
                          ? 'bg-[#1B3A6B] text-white shadow-sm'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                        }`}
                    >
                      <span>🌐 Toàn công ty (Gồm eCom)</span>
                    </button>
                    <button
                      onClick={() => setRevenueScope('service')}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${revenueScope === 'service'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                        }`}
                    >
                      <span>🛠️ Chỉ Dịch vụ / KTV</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Tổng Doanh Thu / Doanh Số */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-emerald-500 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-700 font-bold text-xs flex items-center gap-1.5 uppercase">
                      <DollarSign size={16} />
                      {revenueMetricType === 'moneyToCollect' ? 'Doanh thu thực thu COD' : 'Tổng doanh số niêm yết'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-0.5 ${revenueData.summary.percentChange >= 0
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                      {revenueData.summary.percentChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {revenueData.summary.percentChange >= 0 ? `+${revenueData.summary.percentChange}%` : `${revenueData.summary.percentChange}%`}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-bold text-gray-900 tracking-tight">
                      {revenueData.summary.totalRevenue.toLocaleString('vi-VN')} <span className="text-sm font-semibold text-gray-500">VNĐ</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 font-medium">
                      {revenueMetricType === 'moneyToCollect'
                        ? 'Số tiền COD thực nhận về (Khớp với Doanh Thu POS)'
                        : 'Tổng giá trị đơn hàng chốt (Khớp với Doanh Số POS)'}
                    </p>
                  </div>
                </div>

                {/* Tổng Số Đơn Hoàn Thành */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-blue-500 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="text-blue-700 font-bold text-xs flex items-center gap-1.5 uppercase">
                    <CheckCircle size={16} /> Số đơn đã hoàn thành
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-bold text-gray-900 tracking-tight">
                      {revenueData.summary.ordersCount} <span className="text-sm font-semibold text-gray-500">đơn</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 font-medium">
                      {revenueScope === 'all'
                        ? 'Bao gồm tất cả đơn POS eCom + Ca thủ công & dịch vụ'
                        : 'Bao gồm ca tạo thủ công, không tính đơn eCom sàn'}
                    </p>
                  </div>
                </div>

                {/* Giá Trị Trung Bình / Đơn */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-indigo-500 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="text-indigo-700 font-bold text-xs flex items-center gap-1.5 uppercase">
                    <TrendingUp size={16} /> Doanh thu TB / Đơn
                  </div>
                  <div className="mt-3">
                    <div className="text-3xl font-bold text-gray-900 tracking-tight">
                      {revenueData.summary.avgOrderValue.toLocaleString('vi-VN')} <span className="text-sm font-semibold text-gray-500">VNĐ</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1 font-medium">
                      Giá trị trung bình thu được trên mỗi đơn
                    </p>
                  </div>
                </div>

                {/* Kỳ Đối Chiếu */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-purple-500 flex flex-col justify-between hover:shadow-md transition-shadow">
                  <div className="text-purple-700 font-bold text-xs flex items-center gap-1.5 uppercase">
                    <Clock size={16} /> Khoảng thời gian đối chiếu
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-gray-700">
                      <span className="text-gray-500 font-medium">Kỳ này:</span>
                      <strong className="font-semibold text-gray-900">{formatDateVN(revenueData.periodInfo.current.start)} → {formatDateVN(revenueData.periodInfo.current.end)}</strong>
                    </div>
                    <div className="flex justify-between text-gray-700 border-t pt-1">
                      <span className="text-gray-500 font-medium">Kỳ trước:</span>
                      <strong className="font-semibold text-purple-700">{formatDateVN(revenueData.periodInfo.previous.start)} → {formatDateVN(revenueData.periodInfo.previous.end)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* DATA SOURCE NOTE BANNER */}
              <div className="bg-blue-50/70 border border-blue-200/80 p-3.5 rounded-xl text-xs text-blue-900 flex items-start gap-2.5 shadow-2xs">
                <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold text-blue-950">Nguồn dữ liệu & Quy tắc tính toán:</span>
                  <p className="text-blue-800 leading-relaxed">
                    {revenueMetricType === 'moneyToCollect' ? (
                      <>💵 <b>Đang tính theo Doanh Thu Thực Thu Thông Minh (Smart Net Revenue)</b>: Bao gồm tiền COD POS thực nhận + các đơn POS chuyển khoản trước (`totalPrice`) + tiền thu hộ từ các Ca thủ công/kỹ thuật. Dữ liệu này <b>cao hơn POS (~2.980 tỷ) đúng bằng phần doanh thu gia tăng từ ca thủ công (đạt ~3.017 tỷ cho tháng 07/2026)</b>.</>
                    ) : (
                      <>📊 <b>Đang tính theo Tổng Doanh Số Niêm Yết (`totalPrice`)</b>: Tính tổng tiền giá trị đơn hàng niêm yết của tất cả đơn POS và ca dịch vụ. Dữ liệu này dùng để <b>đối chiếu với Tổng Hàng Chốt trên Pancake POS</b> (Khoảng ~6.21 tỷ cho tháng 07/2026).</>
                    )}
                  </p>
                </div>
              </div>

              {/* 1. Biểu đồ Doanh thu theo Thời gian */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <div>
                    <h3 className="font-bold text-base text-[#1B3A6B]">1. Xu hướng Doanh thu theo Ngày</h3>
                    <p className="text-xs text-gray-500">Tổng tiền thu được theo ngày trong khoảng thời gian đã chọn</p>
                  </div>
                </div>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueData.timeTrend} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="colorPrevRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(val) => formatDateVN(val)} />
                      <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`} />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 600 }} />
                      <RechartsTooltip
                        formatter={(val: any, name: any) => [`${Number(val).toLocaleString('vi-VN')} VNĐ`, name]}
                        labelFormatter={(lbl, items) => {
                          const item = items && items[0] ? items[0].payload : null;
                          if (item && item.prevDate) {
                            return `Kỳ này: ${formatDateVN(lbl)} | Kỳ trước: ${formatDateVN(item.prevDate)}`;
                          }
                          return `Ngày: ${formatDateVN(lbl)}`;
                        }}
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '12px' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#10B981"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                        name={`Kỳ này (${formatDateVN(revenueData.periodInfo.current.start)} - ${formatDateVN(revenueData.periodInfo.current.end)})`}
                      />
                      <Area
                        type="monotone"
                        dataKey="prevRevenue"
                        stroke="#8B5CF6"
                        strokeWidth={2.5}
                        strokeDasharray="5 5"
                        fillOpacity={1}
                        fill="url(#colorPrevRevenue)"
                        name={`Kỳ trước (${formatDateVN(revenueData.periodInfo.previous.start)} - ${formatDateVN(revenueData.periodInfo.previous.end)})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 2 & 3. Grid: Doanh Thu Theo Trạm & Theo Loại Công Việc */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 2. Doanh thu theo Trạm Chính */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-base text-[#1B3A6B]">2. Doanh thu theo Trạm Quản lý</h3>
                    <p className="text-xs text-gray-500 mb-4">Tổng thu nhập tạo ra bởi từng Trạm chính</p>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueData.byStation} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                          <XAxis type="number" tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#374151' }} width={110} />
                          <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '11px' }} />
                          <RechartsTooltip formatter={(val: any, name: any) => [`${Number(val).toLocaleString('vi-VN')} VNĐ`, name]} />
                          <Bar dataKey="revenue" fill="#10B981" radius={[0, 4, 4, 0]} name="Kỳ này" />
                          <Bar dataKey="prevRevenue" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="Kỳ trước" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Bảng chi tiết Trạm */}
                  <div className="border-t pt-3">
                    <div className="max-h-40 overflow-y-auto text-xs">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-gray-500 font-semibold border-b text-[11px] uppercase">
                            <th className="pb-1.5">Trạm</th>
                            <th className="pb-1.5 text-right">Kỳ này</th>
                            <th className="pb-1.5 text-right">Kỳ trước</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {revenueData.byStation.map((st: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="py-1.5 font-medium text-gray-800">{st.name}</td>
                              <td className="py-1.5 text-right font-bold text-emerald-700">{st.revenue.toLocaleString('vi-VN')} đ</td>
                              <td className="py-1.5 text-right font-medium text-purple-700">{(st.prevRevenue || 0).toLocaleString('vi-VN')} đ</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* 3. Doanh thu theo Loại Công Việc */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-base text-[#1B3A6B]">3. Doanh thu theo Loại Công việc</h3>
                    <p className="text-xs text-gray-500 mb-4">Cơ cấu doanh thu theo từng dịch vụ thi công</p>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueData.byWorkType} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#374151' }} interval={0} angle={-15} textAnchor="end" />
                          <YAxis tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                          <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '11px' }} />
                          <RechartsTooltip formatter={(val: any, name: any) => [`${Number(val).toLocaleString('vi-VN')} VNĐ`, name]} />
                          <Bar dataKey="revenue" fill="#00A3FF" radius={[4, 4, 0, 0]} name="Kỳ này" />
                          <Bar dataKey="prevRevenue" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Kỳ trước" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Bảng chi tiết Loại công việc */}
                  <div className="border-t pt-3">
                    <div className="max-h-40 overflow-y-auto text-xs">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-gray-500 font-semibold border-b text-[11px] uppercase">
                            <th className="pb-1.5">Loại công việc</th>
                            <th className="pb-1.5 text-right">Số đơn</th>
                            <th className="pb-1.5 text-right">Doanh thu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {revenueData.byWorkType.map((wt: any, idx: number) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="py-1.5 font-medium text-gray-800">{wt.name}</td>
                              <td className="py-1.5 text-right text-gray-600">{wt.ordersCount} đơn</td>
                              <td className="py-1.5 text-right font-bold text-blue-700">{wt.revenue.toLocaleString('vi-VN')} đ</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Top Kỹ Thuật Viên Doanh Thu Cao Nhất */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <div>
                    <h3 className="font-bold text-base text-[#1B3A6B] flex items-center gap-2">
                      <Award className="text-amber-500" size={18} />
                      4. Top Kỹ thuật viên Đóng góp Doanh thu Cao nhất
                    </h3>
                    <p className="text-xs text-gray-500">Bảng xếp hạng KTV hoàn thành ca đạt tổng giá trị thu hộ cao nhất</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  <div className="lg:col-span-2 h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueData.byKtv.slice(0, 10)} margin={{ top: 10, right: 30, left: 10, bottom: 25 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} interval={0} angle={-20} textAnchor="end" />
                        <YAxis tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                        <RechartsTooltip formatter={(val: any) => [`${Number(val).toLocaleString('vi-VN')} VNĐ`, 'Doanh thu']} />
                        <Bar dataKey="revenue" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Doanh thu" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Top 5 Highlight List */}
                  <div className="bg-purple-50/50 border border-purple-100 p-4 rounded-xl space-y-3">
                    <h4 className="font-bold text-xs text-purple-900 uppercase tracking-wider">Xếp hạng Top 5 KTV</h4>
                    <div className="space-y-2 text-xs">
                      {revenueData.byKtv.slice(0, 5).map((ktv: any, idx: number) => (
                        <div key={ktv.id} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-purple-100 shadow-2xs">
                          <div className="flex items-center space-x-2.5">
                            <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-gray-800' : idx === 2 ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'
                              }`}>
                              {idx + 1}
                            </span>
                            <div>
                              <strong className="block text-gray-800 font-semibold">{ktv.name}</strong>
                              <span className="text-[10px] text-gray-500">{ktv.ordersCount} ca hoàn thành</span>
                            </div>
                          </div>
                          <strong className="text-purple-700 font-bold">{ktv.revenue.toLocaleString('vi-VN')} đ</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. Doanh thu theo Tỉnh/Thành phố */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <div>
                    <h3 className="font-bold text-base text-[#1B3A6B] flex items-center gap-2">
                      <MapPin className="text-rose-500" size={18} />
                      5. Doanh thu theo Tỉnh / Thành phố
                    </h3>
                    <p className="text-xs text-gray-500">Phân bổ doanh thu thị trường theo vị trí địa lý</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                  <div className="lg:col-span-2 h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueData.byProvince.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                        <XAxis type="number" tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#374151' }} width={100} />
                        <RechartsTooltip formatter={(val: any) => [`${Number(val).toLocaleString('vi-VN')} VNĐ`, 'Doanh thu']} />
                        <Bar dataKey="revenue" fill="#F43F5E" radius={[0, 4, 4, 0]} name="Doanh thu" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                    <div className="bg-gray-50 p-3 font-bold text-gray-700 border-b flex justify-between">
                      <span>Tỉnh thành</span>
                      <span>Doanh thu</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                      {revenueData.byProvince.map((prov: any, idx: number) => (
                        <div key={idx} className="p-2.5 flex justify-between items-center hover:bg-gray-50">
                          <span className="font-medium text-gray-800">{prov.name}</span>
                          <div className="text-right">
                            <strong className="block text-rose-600 font-bold">{prov.revenue.toLocaleString('vi-VN')} đ</strong>
                            <span className="text-[10px] text-gray-400">{prov.ordersCount} đơn</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
