import { useEffect, useState } from 'react';
import { fetchApi, getDashboardStats, getStations, getDispatchAnalysis, getKtvUsers, getProductQualityAnalysis } from '../../api/client';
import { 
  FileText, CheckCircle, Clock, Building, MapPin, 
  AlertTriangle, Info, Filter, AlertCircle, RefreshCw, TrendingUp,
  ClipboardList, UserCheck, XCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, 
  ResponsiveContainer, CartesianGrid, AreaChart, Area,
  LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { scaleQuantile } from 'd3-scale';

function removeVietnameseTones(str: string) {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
    str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
    str = str.replace(/đ/g,"d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str;
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

const WORK_TYPE_OPTIONS = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc', 'Bảo hành', 'Sửa chữa'];
const STATUS_OPTIONS = [
  { value: 'chờ xử lý', label: 'Chờ xử lý' },
  { value: 'đang thực hiện', label: 'Đang thực hiện' },
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
        className={`border rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 text-gray-700 bg-white flex justify-between items-center cursor-pointer min-h-[32px] text-left select-none transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 font-medium' : 'hover:border-gray-400 font-medium'
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
  const [activeTab, setActiveTab] = useState<'summary' | 'ontime' | 'late' | 'workload' | 'stationComp' | 'productQuality'>('summary');
  
  // Data States
  const [stats, setStats] = useState<any>(null);
  const [dashStats, setDashStats] = useState<any>(null);
  const [stationsList, setStationsList] = useState<any[]>([]);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [qualityData, setQualityData] = useState<any>(null);
  const [loadingQuality, setLoadingQuality] = useState(false);
  
  // Loading & Tooltip States
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingAnalysis, setLoadingAnalysis] = useState(true);
  const [tooltipContent, setTooltipContent] = useState<React.ReactNode>('');
  const [chartType, setChartType] = useState<'stackedBar' | 'line'>('stackedBar');
  const [lateChartScale, setLateChartScale] = useState<'day' | 'week' | 'month'>('day');
  const [selectedLateProvince, setSelectedLateProvince] = useState<string>('');

  // Filter States
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    // Default to January 1st of current year to load rich multi-month data by default
    return new Date(d.getFullYear(), 0, 1).toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    // Default to last day of current month
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
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
    setStartDate(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
    setEndDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
    setSelectedProvinces([]);
    setSelectedMainStations([]);
    setSelectedTechStations([]);
    setSelectedWorkTypes([]);
    setSelectedAdminStatuses([]);
    setSelectedKtvIds([]);
    setSelectedProducts([]);
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
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
          {/* Start Date */}
          <div className="flex flex-col">
            <label className="text-[11px] font-semibold text-gray-500 mb-1 uppercase">Hẹn từ ngày</label>
            <input 
              type="date" 
              className="border rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 text-gray-700 bg-white" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)} 
            />
          </div>

          {/* End Date */}
          <div className="flex flex-col">
            <label className="text-[11px] font-semibold text-gray-500 mb-1 uppercase">Hẹn đến ngày</label>
            <input 
              type="date" 
              className="border rounded px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 text-gray-700 bg-white" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)} 
            />
          </div>

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

      {/* TAB NAVIGATION */}
      <div className="flex border-b border-gray-200 bg-gray-50/50 p-1 rounded-lg space-x-1">
        <button 
          onClick={() => setActiveTab('summary')}
          className={`flex-1 md:flex-initial px-6 py-2.5 rounded-md text-sm font-semibold transition-all ${activeTab === 'summary' ? 'bg-white text-blue-600 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          Tổng quan & Mật độ
        </button>
        <button 
          onClick={() => setActiveTab('ontime')}
          className={`flex-1 md:flex-initial px-6 py-2.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center space-x-1.5 ${activeTab === 'ontime' ? 'bg-white text-emerald-600 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <CheckCircle size={15} />
          <span>Báo cáo Đúng Hẹn</span>
        </button>
        <button 
          onClick={() => setActiveTab('late')}
          className={`flex-1 md:flex-initial px-6 py-2.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center space-x-1.5 ${activeTab === 'late' ? 'bg-white text-rose-600 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <AlertTriangle size={15} />
          <span>Báo cáo Trễ Hẹn</span>
        </button>
        <button 
          onClick={() => setActiveTab('workload')}
          className={`flex-1 md:flex-initial px-6 py-2.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center space-x-1.5 ${activeTab === 'workload' ? 'bg-white text-blue-800 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <TrendingUp size={15} />
          <span>Phân tích Công việc</span>
        </button>
        <button 
          onClick={() => setActiveTab('stationComp')}
          className={`flex-1 md:flex-initial px-6 py-2.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center space-x-1.5 ${activeTab === 'stationComp' ? 'bg-white text-purple-600 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <Building size={15} />
          <span>Đối tác & Trạm chính</span>
        </button>
        <button 
          onClick={() => setActiveTab('productQuality')}
          className={`flex-1 md:flex-initial px-6 py-2.5 rounded-md text-sm font-semibold transition-all flex items-center justify-center space-x-1.5 ${activeTab === 'productQuality' ? 'bg-white text-orange-600 shadow-sm border border-gray-200' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <AlertCircle size={15} />
          <span>Chất lượng sản phẩm</span>
        </button>
      </div>

      {/* TAB CONTENT 1: SUMMARY & MAP */}
      {activeTab === 'summary' && (
        <div className="space-y-6 animate-fade-in">
          {/* KPI Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-blue-500 flex flex-col justify-between animate-fade-in hover:shadow-md transition-shadow">
              <div className="text-blue-600 font-semibold text-xs flex items-center gap-1.5 uppercase"><ClipboardList size={15}/> Tổng số đơn</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.total ?? 0}</div>
            </div>
            
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-amber-500 flex flex-col justify-between animate-fade-in hover:shadow-md transition-shadow">
              <div className="text-amber-600 font-semibold text-xs flex items-center gap-1.5 uppercase"><Clock size={15}/> Đơn chờ xử lý</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.pending ?? 0}</div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-indigo-500 flex flex-col justify-between animate-fade-in hover:shadow-md transition-shadow">
              <div className="text-indigo-600 font-semibold text-xs flex items-center gap-1.5 uppercase"><UserCheck size={15}/> Đơn đã phân công</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.assigned ?? 0}</div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-emerald-500 flex flex-col justify-between animate-fade-in hover:shadow-md transition-shadow">
              <div className="text-emerald-600 font-semibold text-xs flex items-center gap-1.5 uppercase"><CheckCircle size={15}/> Đơn hoàn thành</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.completed ?? 0}</div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-rose-500 flex flex-col justify-between animate-fade-in hover:shadow-md transition-shadow">
              <div className="text-rose-600 font-semibold text-xs flex items-center gap-1.5 uppercase"><XCircle size={15}/> Đơn bị hủy</div>
              <div className="text-3xl font-bold text-gray-900 mt-2">{dashStats.orderStats?.cancelled ?? 0}</div>
            </div>
          </div>

          {loadingAnalysis || !analysisData ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 text-xs">Đang tải dữ liệu bản đồ & khu vực...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cột 1: Bản đồ Mật độ Đơn hàng (Việt Nam) */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[460px] relative">
                <h3 className="font-bold text-base text-gray-800">Bản đồ Mật độ Đơn hàng</h3>
                <p className="text-xs text-gray-500 mb-4">Di chuột vào bản đồ để xem chi tiết từng tỉnh/thành</p>
                <div className="flex-1 w-full bg-blue-50/40 rounded-lg overflow-hidden flex items-center justify-center relative border border-blue-100/50">
                  <ComposableMap
                    projection="geoMercator"
                    projectionConfig={{
                      scale: 2200,
                      center: [106.3, 16.2]
                    }}
                    style={{ width: "100%", height: "100%" }}
                  >
                    <Geographies geography={geoUrl}>
                      {({ geographies }) => {
                        const mapProvinceData = analysisData.provinceStats || [];
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
                          if (geoName) {
                            const cleanGeoName = removeVietnameseTones(geoName)
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

                          return (
                            <Geography
                              key={geo.rsmKey}
                              geography={geo}
                              fill={matchedValue ? colorScale(matchedValue) : "#f8fafc"}
                              stroke="#cbd5e1"
                              strokeWidth={0.5}
                              onMouseEnter={() => {
                                setTooltipContent(`${geoName || 'Không rõ'}: ${matchedValue} đơn hàng`);
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
                  </ComposableMap>

                  {tooltipContent && (
                    <div className="absolute top-4 right-4 bg-gray-900/80 text-white px-3 py-1.5 rounded text-xs font-semibold shadow-lg pointer-events-none z-10 backdrop-blur-sm">
                      {tooltipContent}
                    </div>
                  )}
                  
                  <div className="absolute bottom-3 left-3 text-[10px] text-gray-400 bg-white/80 px-2 py-0.5 rounded border border-gray-100">
                    * Phân tích dựa trên thông tin địa chỉ đơn hàng
                  </div>
                </div>
              </div>

              {/* Cột 2: Biểu đồ tròn/donut cơ cấu Tỉnh/Thành Top 10 */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[460px]">
                <h3 className="font-bold text-base text-gray-800">Cơ cấu Công việc theo Tỉnh/TP</h3>
                <p className="text-xs text-gray-500 mb-4">Tỷ lệ phần trăm Top 10 khu vực nhiều công việc nhất</p>
                <div className="flex-1 flex flex-col justify-center items-center relative">
                  <div className="w-full h-[220px]">
                    {(!analysisData.provinceStats || analysisData.provinceStats.length === 0) ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[...analysisData.provinceStats].sort((a, b) => b.total - a.total).slice(0, 10)}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="total"
                            nameKey="name"
                          >
                            {[...analysisData.provinceStats].sort((a, b) => b.total - a.total).slice(0, 10).map((_entry: any, index: number) => {
                              const colorsPalette = ['#0ea5e9', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f43f5e', '#6366f1', '#a855f7'];
                              return <Cell key={`cell-${index}`} fill={colorsPalette[index % colorsPalette.length]} />;
                            })}
                          </Pie>
                          <RechartsTooltip formatter={(value, name) => [`${value} đơn`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  
                  {/* Bảng chú thích Top 5 tỉnh/thành nhiều nhất */}
                  <div className="w-full mt-4 max-h-[140px] overflow-y-auto space-y-1.5 text-xs text-gray-600 px-2">
                    {[...analysisData.provinceStats]
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 5)
                      .map((entry: any, index: number) => {
                        const colorsPalette = ['#0ea5e9', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
                        const totalOrders = analysisData.summary.totalWithAppointments || 1;
                        const percentage = Math.round((entry.total / totalOrders) * 100);
                        return (
                          <div key={index} className="flex justify-between items-center border-b border-gray-50 pb-1">
                            <div className="flex items-center space-x-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorsPalette[index % colorsPalette.length] }}></span>
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

              {/* Cột 3: Bảng thống kê số ca theo Tỉnh/Thành */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[460px]">
                <h3 className="font-bold text-base text-gray-800">Danh sách Thống kê Chi tiết</h3>
                <p className="text-xs text-gray-500 mb-4">Số lượng ca công việc phân bố theo từng Tỉnh/Thành phố</p>
                <div className="flex-1 overflow-y-auto max-h-[310px] border border-gray-100 rounded-lg">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-[#f8f9fa] text-gray-600 font-semibold sticky top-0 z-10 border-b border-gray-150">
                      <tr>
                        <th className="px-4 py-3">Tỉnh / Thành phố</th>
                        <th className="px-4 py-3 text-right">Số Ca</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {[...analysisData.provinceStats]
                        .sort((a, b) => b.total - a.total)
                        .map((entry: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-900">{entry.name}</td>
                            <td className="px-4 py-3 text-right font-bold text-gray-700">{entry.total}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Tổng số ở cuối bảng */}
                <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                  <span className="font-bold text-gray-800">Tổng cộng</span>
                  <span className="font-extrabold text-blue-600 text-base">
                    {[...analysisData.provinceStats].reduce((sum, item) => sum + item.total, 0)} ca
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT 2: ON-TIME REPORT */}
      {activeTab === 'ontime' && (
        <div className="space-y-6 animate-fade-in">
          {loadingAnalysis ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 text-xs">Đang truy vấn dữ liệu hiệu suất...</p>
            </div>
          ) : !analysisData ? (
            <div className="alert alert-error">Lỗi khi phân tích dữ liệu hiệu suất</div>
          ) : (
            <>
              {/* Info Definition Alert */}
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-start space-x-3">
                <Info className="text-emerald-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-[13px]">Quy định Đúng Hẹn (On-Time KPI)</div>
                  <p>Ca công việc được tính là <b>Đúng hẹn</b> khi: Đơn hàng đã hoàn thành và có <b>Ngày nghiệm thu thực tế</b> (KTV nộp báo cáo ca) ≤ <b>Ngày hẹn khách hàng</b> (tính theo ngày, không xét giờ).</p>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-blue-600">
                  <div className="text-gray-500 font-semibold text-xs">TỔNG ĐƠN HÀNG CÓ LỊCH HẸN</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">{analysisData.summary.totalWithAppointments}</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-emerald-600">
                  <div className="text-emerald-600 font-semibold text-xs">SỐ CA ĐÚNG HẸN</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">{analysisData.summary.totalOnTime}</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-teal-500">
                  <div className="text-teal-600 font-semibold text-xs">TỶ LỆ ĐÚNG HẸN TRUNG BÌNH</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">{analysisData.summary.onTimeRate}%</div>
                </div>
              </div>

              {/* Chart: Daily On-Time Counts */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[380px]">
                <h3 className="font-bold text-base text-gray-800 border-b pb-3 mb-4">Số ca Đúng hẹn mỗi ngày trong tháng</h3>
                <div className="flex-1 w-full h-[260px]">
                  {analysisData.dailyStats.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu lịch hẹn trong khoảng thời gian này</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analysisData.dailyStats} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorOnTime" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Area type="monotone" dataKey="onTime" name="Ca Đúng Hẹn" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorOnTime)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Charts grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. Đúng hẹn theo loại công việc */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Số ca đúng hẹn theo Loại công việc</h3>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.workTypeStats} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          interval={0}
                          tick={{fill: '#6b7280', fontSize: 10}}
                          tickFormatter={(value) => value === 'Giao hàng và Lắp đặt' ? 'Giao hàng & Lắp đặt' : value}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
                        <Bar dataKey="onTime" name="Đúng hẹn" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. Đúng hẹn theo Kỹ thuật viên */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Số ca đúng hẹn theo Kỹ thuật viên</h3>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.ktvStats.slice(0, 10)} margin={{ top: 5, right: 10, left: -25, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          interval={0}
                          height={45}
                          tick={{fill: '#6b7280', fontSize: 9, angle: -25, textAnchor: 'end'}} 
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
                        <Bar dataKey="onTime" name="Đúng hẹn" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. Đúng hẹn theo Tỉnh/Thành phố */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Số ca đúng hẹn theo Tỉnh / Thành phố</h3>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.provinceStats.slice(0, 8)} margin={{ top: 5, right: 10, left: -25, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          interval={0}
                          height={45}
                          tick={{fill: '#6b7280', fontSize: 9, angle: -25, textAnchor: 'end'}} 
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
                        <Bar dataKey="onTime" name="Đúng hẹn" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 4. Thời gian hoàn thành trung bình (Lead Time) */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Chênh lệch Ngày hoàn thành thực tế so với Ngày hẹn (trung bình ngày)</h3>
                  <p className="text-[11px] text-gray-500 mb-2">* Giá trị ≤ 0 thể hiện làm xong trước hoặc đúng hẹn, giá trị &gt; 0 thể hiện trễ hẹn trung bình.</p>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.workTypeStats} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          interval={0}
                          tick={{fill: '#6b7280', fontSize: 10}}
                          tickFormatter={(value) => value === 'Giao hàng và Lắp đặt' ? 'Giao hàng & Lắp đặt' : value}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
                        <Bar dataKey="avgLeadTimeDays" name="Chênh lệch ngày trung bình" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      )}

      {/* TAB CONTENT 3: LATE REPORT */}
      {activeTab === 'late' && (
        <div className="space-y-6 animate-fade-in">
          {loadingAnalysis ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 text-xs">Đang truy vấn dữ liệu hiệu suất...</p>
            </div>
          ) : !analysisData ? (
            <div className="alert alert-error">Lỗi khi phân tích dữ liệu trễ hẹn</div>
          ) : (
            <>
              {/* Info Definition Alert */}
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start space-x-3">
                <AlertCircle className="text-rose-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-[13px]">Quy định Trễ Hẹn (Late KPI)</div>
                  <p>Ca công việc được tính là <b>Trễ hẹn</b> khi: Ngày hoàn thành thực tế (hoặc ngày hiện tại nếu chưa hoàn thành) &gt; Ngày hẹn khách hàng. (Tính theo ngày, không xét giờ).</p>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-blue-600">
                  <div className="text-gray-500 font-semibold text-xs">TỔNG ĐƠN HÀNG CÓ LỊCH HẸN</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">{analysisData.summary.totalWithAppointments}</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-rose-600">
                  <div className="text-rose-600 font-semibold text-xs">SỐ CA TRỄ HẸN</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">{analysisData.summary.totalLate}</div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-rose-500">
                  <div className="text-rose-600 font-semibold text-xs">TỶ LỆ TRỄ HẸN TRÊN TỔNG LỊCH HẸN</div>
                  <div className="text-3xl font-bold text-gray-900 mt-2">
                    {analysisData.summary.totalWithAppointments > 0 ? Math.round((analysisData.summary.totalLate / analysisData.summary.totalWithAppointments) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* Chart: Daily On-Time vs Late percentages */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[380px]">
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                  <div>
                    <h3 className="font-bold text-base text-gray-800">Xu hướng Tỷ lệ Trễ hẹn</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Tỷ lệ % số ca bị trễ hẹn trên tổng số ca có lịch hẹn theo thời gian</p>
                  </div>
                  
                  {/* Selector for scale */}
                  <div className="flex bg-gray-100 p-1 rounded-lg space-x-1 border border-gray-200">
                    <button 
                      onClick={() => setLateChartScale('day')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${lateChartScale === 'day' ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Ngày
                    </button>
                    <button 
                      onClick={() => setLateChartScale('week')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${lateChartScale === 'week' ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Tuần
                    </button>
                    <button 
                      onClick={() => setLateChartScale('month')}
                      className={`px-3 py-1 rounded text-xs font-semibold transition-all ${lateChartScale === 'month' ? 'bg-white text-rose-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      Tháng
                    </button>
                  </div>
                </div>

                <div className="flex-1 w-full h-[260px]">
                  {analysisData.dailyStats.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu trong khoảng thời gian này</div>
                  ) : (
                    (() => {
                      const chartData = getGroupedStats(analysisData.dailyStats, lateChartScale);
                      if (chartData.length === 0) {
                        return <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu trong khoảng thời gian này</div>;
                      }
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                            <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(val) => `${val}%`} tick={{fill: '#6b7280', fontSize: 11}} />
                            <RechartsTooltip 
                              contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} 
                              formatter={(value: any, _name: any, entry: any) => [
                                `${value}% (Trễ ${entry.payload.late}/${entry.payload.total} ca)`, 
                                'Tỷ lệ trễ hẹn'
                              ]}
                            />
                            <Legend wrapperStyle={{fontSize: 11}} />
                            <Line type="monotone" dataKey="latePercent" name="Tỷ lệ trễ hẹn" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, stroke: '#f43f5e', strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6, fill: '#f43f5e' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      );
                    })()
                  )}
                </div>
              </div>

              {/* Side-by-side dimensions comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Trễ hẹn vs Chưa hoàn thành theo Loại CV */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Số ca trễ hẹn so với Số ca chưa hoàn thành (Chờ xử lý/Đang làm) theo Loại công việc</h3>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.workTypeStats} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          interval={0}
                          tick={{fill: '#6b7280', fontSize: 10}}
                          tickFormatter={(value) => value === 'Giao hàng và Lắp đặt' ? 'Giao hàng & Lắp đặt' : value}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
                        <Legend wrapperStyle={{fontSize: 11}} />
                        <Bar dataKey="late" name="Số ca trễ" fill="#f43f5e" />
                        <Bar dataKey="total" name="Tổng ca có hẹn" fill="#cbd5e1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 2. Trễ hẹn vs Chưa hoàn thành theo Trạm kỹ thuật */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Số ca trễ hẹn so với Tổng số ca theo Trạm kỹ thuật</h3>
                  <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisData.techStationStats.slice(0, 8)} margin={{ top: 5, right: 10, left: -25, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          interval={0}
                          height={45}
                          tick={{fill: '#6b7280', fontSize: 9, angle: -25, textAnchor: 'end'}} 
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
                        <Legend wrapperStyle={{fontSize: 11}} />
                        <Bar dataKey="late" name="Số ca trễ" fill="#f43f5e" />
                        <Bar dataKey="total" name="Tổng ca có hẹn" fill="#cbd5e1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* BẢNG DANH SÁCH CA TRỄ HẸN */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center flex-wrap gap-3">
                  <h3 className="font-bold text-base text-rose-600 flex items-center gap-1.5">
                    <AlertTriangle size={17} />
                    Danh sách các ca đang trễ hẹn
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

                    <span className="bg-rose-100 text-rose-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                      {filteredLateOrders.length} ca trễ
                    </span>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  {filteredLateOrders.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 text-sm">Tuyệt vời! Không có ca nào bị trễ hẹn trong khoảng lọc này.</div>
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
                          <tr key={index} className="hover:bg-rose-50/20 transition-colors">
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
                              <span className="inline-block bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[11px] min-w-8">
                                {o.delayDays} ngày
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
                        <XAxis dataKey="month" tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Legend wrapperStyle={{fontSize: 11, paddingTop: 10}} />
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
                        <XAxis dataKey="month" tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                        <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Legend wrapperStyle={{fontSize: 11, paddingTop: 10}} />
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

      {/* TAB CONTENT 5: STATION COMPARISON */}
      {activeTab === 'stationComp' && (
        <div className="space-y-6 animate-fade-in">
          {loadingAnalysis ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-500 text-xs">Đang truy vấn dữ liệu trạm đối tác...</p>
            </div>
          ) : !analysisData ? (
            <div className="alert alert-error">Lỗi khi phân tích dữ liệu đối tác</div>
          ) : (
            <>
              {/* Info Definition Alert */}
              <div className="bg-purple-50 border border-purple-200 text-purple-800 p-4 rounded-xl flex items-start space-x-3">
                <Info className="text-purple-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-[13px]">Phân tích & So sánh các Đối tác/Trạm chính</div>
                  <p>Các chỉ số so sánh thị phần và mức độ phủ sóng địa lý giữa các Đối tác chính **không bao gồm** các ca có loại công việc là **Giao hàng** để phản ánh đúng năng lực triển khai dịch vụ kỹ thuật.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Cột trái: Bản đồ phủ sóng Việt Nam (chiếm 2/3) */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[520px] lg:col-span-2 relative">
                  <div className="flex justify-between items-center border-b pb-3 mb-4">
                    <div>
                      <h3 className="font-bold text-base text-gray-800">
                        Bản đồ Phủ sóng Địa lý của các Đối tác chính
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">Tỉnh thành được tô màu theo Đối tác chính chiếm ưu thế nhất (nhiều ca nhất)</p>
                    </div>
                    
                    {/* Bảng chú giải màu sắc bản đồ */}
                    <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-semibold text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100 max-w-lg justify-end">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-3 h-3 rounded bg-[#dc2626]"></span>
                        <span>Truliva</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-3 h-3 rounded bg-[#a855f7]"></span>
                        <span>Vinadu</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-3 h-3 rounded bg-[#10b981]"></span>
                        <span>Hưng Thịnh</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-3 h-3 rounded bg-[#f59e0b]"></span>
                        <span>KSC</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-3 h-3 rounded bg-[#6366f1]"></span>
                        <span>PNN Home</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-3 h-3 rounded bg-[#e2e8f0]"></span>
                        <span>Lack (Không có đơn)</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 w-full bg-blue-50/20 rounded-lg overflow-hidden flex items-center justify-center relative border border-blue-100/30">
                    <ComposableMap
                      projection="geoMercator"
                      projectionConfig={{
                        scale: 2200,
                        center: [106.3, 16.2]
                      }}
                      style={{ width: "100%", height: "100%" }}
                    >
                      <Geographies geography={geoUrl}>
                        {({ geographies }) => {
                          const coverage = analysisData.mainStationCoverage || {};
                          const getStationColor = (stationName: string) => {
                            if (!stationName || stationName === 'Lack') return '#e2e8f0'; // Gray
                            if (stationName.includes('Truliva')) return '#dc2626'; // Red
                            if (stationName.includes('Vinadu')) return '#a855f7'; // Purple
                            if (stationName.includes('Hưng Thịnh')) return '#10b981'; // Green
                            if (stationName.includes('KSC')) return '#f59e0b'; // Amber
                            if (stationName.includes('PNN Home')) return '#6366f1'; // Blue/Indigo
                            return '#94a3b8'; // Slate for others
                          };

                          return geographies.map(geo => {
                            const geoName = geo.properties.Name || geo.properties.name || geo.properties.ten_tinh;
                            
                            let dominantStation = 'Lack';
                            let coverageDetail: any = null;
                            if (geoName) {
                              const cleanGeoName = removeVietnameseTones(geoName)
                                .replace(/ Province| City/gi, '')
                                .trim()
                                .toLowerCase();
                              
                              const foundKey = Object.keys(coverage).find(k => {
                                const cleanDbKey = removeVietnameseTones(k)
                                  .replace(/^(Tỉnh |Thành phố |TP |TP\. )/i, '')
                                  .trim()
                                  .toLowerCase();
                                return cleanGeoName === cleanDbKey || cleanGeoName.includes(cleanDbKey) || cleanDbKey.includes(cleanGeoName);
                              });
                              if (foundKey) {
                                coverageDetail = coverage[foundKey];
                                dominantStation = coverageDetail.mainStationName;
                              }
                            }

                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={getStationColor(dominantStation)}
                                stroke="#ffffff"
                                strokeWidth={0.5}
                                onMouseEnter={() => {
                                  if (!coverageDetail || dominantStation === 'Lack') {
                                    setTooltipContent(`${geoName || 'Không rõ'}: Chưa có đơn`);
                                  } else {
                                    const sortedBreakdown = Object.entries(coverageDetail.breakdown || {})
                                      .sort((a: any, b: any) => b[1] - a[1]);
                                    setTooltipContent(
                                      <div className="space-y-1.5 p-0.5 text-left font-medium min-w-[140px]">
                                        <div className="font-bold text-[12px] border-b border-white/20 pb-1 mb-1 flex justify-between items-center gap-3">
                                          <span>{geoName || 'Không rõ'}</span>
                                          <span className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] text-white">Tổng: {coverageDetail.total} ca</span>
                                        </div>
                                        <div className="space-y-1">
                                          {sortedBreakdown.map(([station, count]) => (
                                            <div key={station} className="flex justify-between items-center gap-4 text-[11px]">
                                              <span className="flex items-center gap-1.5 text-gray-200">
                                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getStationColor(station) }}></span>
                                                <span>{station}</span>
                                              </span>
                                              <span className="font-bold text-white">{(count as any)} ca</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  }
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
                    </ComposableMap>

                    {tooltipContent && (
                      <div className="absolute top-4 right-4 bg-gray-900/80 text-white px-3 py-1.5 rounded text-xs font-semibold shadow-lg pointer-events-none z-10 backdrop-blur-sm">
                        {tooltipContent}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cột phải: Biểu đồ tròn đóng góp của các trạm chính (chiếm 1/3) */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[520px]">
                  <h3 className="font-bold text-base text-gray-800 border-b pb-3 mb-4">
                    Thị phần Công việc của Đối tác
                  </h3>
                  <div className="flex-1 flex flex-col justify-center items-center relative">
                    <div className="w-full h-[220px]">
                      {(!analysisData.mainStationWorkloadStats || analysisData.mainStationWorkloadStats.length === 0) ? (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">Không có dữ liệu</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analysisData.mainStationWorkloadStats}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={3}
                              dataKey="total"
                              nameKey="name"
                            >
                              {analysisData.mainStationWorkloadStats.map((entry: any, index: number) => {
                                const getStationColor = (stationName: string) => {
                                  if (!stationName || stationName === 'Lack') return '#e2e8f0';
                                  if (stationName.includes('Truliva')) return '#dc2626';
                                  if (stationName.includes('Vinadu')) return '#a855f7';
                                  if (stationName.includes('Hưng Thịnh')) return '#10b981';
                                  if (stationName.includes('KSC')) return '#f59e0b';
                                  if (stationName.includes('PNN Home')) return '#6366f1';
                                  return '#94a3b8';
                                };
                                return <Cell key={`cell-${index}`} fill={getStationColor(entry.name)} />;
                              })}
                            </Pie>
                            <RechartsTooltip formatter={(value, name) => [`${value} ca`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    
                    {/* Bảng tóm tắt thị phần bên dưới */}
                    <div className="w-full mt-4 max-h-[200px] overflow-y-auto space-y-2 text-xs text-gray-600 px-2">
                      {analysisData.mainStationWorkloadStats.map((entry: any, index: number) => {
                        const getStationColor = (stationName: string) => {
                          if (!stationName || stationName === 'Lack') return '#e2e8f0';
                          if (stationName.includes('Truliva')) return '#dc2626';
                          if (stationName.includes('Vinadu')) return '#a855f7';
                          if (stationName.includes('Hưng Thịnh')) return '#10b981';
                          if (stationName.includes('KSC')) return '#f59e0b';
                          if (stationName.includes('PNN Home')) return '#6366f1';
                          return '#94a3b8';
                        };
                        const color = getStationColor(entry.name);
                        return (
                          <div key={index} className="flex justify-between items-center border-b border-gray-50 pb-1.5">
                            <div className="flex items-center space-x-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></span>
                              <span className="font-semibold text-gray-700">{entry.name}</span>
                            </div>
                            <div className="text-right space-x-2">
                              <span className="font-bold text-gray-800">{entry.total} ca</span>
                              <span className="text-gray-400">({entry.percentage}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">Dòng máy thường gặp sự cố (Số ca Bảo hành/Sửa chữa)</h3>
                  <div className="flex-1 w-full">
                    {qualityData.productIssues.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu sự cố dòng máy</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart 
                          layout="vertical"
                          data={qualityData.productIssues.slice(0, 10).map((item: any) => ({
                            ...item,
                            displayName: item.name
                              .replace(/^(Máy lọc nước |Máy nóng lạnh treo tường |Máy lọc không khí |Bộ lọc nước tại vòi )/i, '')
                              .trim()
                          }))} 
                          margin={{ top: 5, right: 15, left: -10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                          <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                          <YAxis 
                            type="category" 
                            dataKey="displayName" 
                            axisLine={false} 
                            tickLine={false} 
                            width={110}
                            tick={{fill: '#6b7280', fontSize: 10}}
                          />
                          <RechartsTooltip 
                            contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                            formatter={(value, _name, props) => [`${value} ca lỗi`, props.payload.name]}
                          />
                          <Bar dataKey="total" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* 2. Khu vực thường gặp sự cố */}
                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[350px]">
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
                            tick={{fill: '#6b7280', fontSize: 9, angle: -35, textAnchor: 'end'}}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                          <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
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
                          <XAxis dataKey="month" tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 11}} />
                          <RechartsTooltip contentStyle={{borderRadius: '8px', border: 'none'}} />
                          <Legend wrapperStyle={{fontSize: 11, paddingTop: 10}} />
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
    </div>
  );
}
