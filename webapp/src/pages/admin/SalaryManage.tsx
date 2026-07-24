import React, { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '../../api/client';
import { 
  Calculator, 
  Save, 
  Lock, 
  MapPin, 
  CheckCircle, 
  RefreshCw, 
  Eye, 
  AlertCircle, 
  FileSpreadsheet,
  X,
  TrendingUp,
  UserCheck,
  ChevronDown,
  Layers,
  ListFilter
} from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';

interface CaseDetail {
  reportId: string;
  orderId: string | null;
  pancakeOrderId: number | null;
  customerName: string;
  customerPhone?: string;
  province?: string;
  address?: string;
  notes?: string;
  workType: string;
  isSunday: boolean;
  baseCost: number;
  distance: number;
  distanceCost: number;
  totalCost: number;
  rateType?: string;
  baoHanhCost?: number;
  giaoHangCost?: number;
  lapDatCost?: number;
  giaoLapCost?: number;
  thayLocCost?: number;
  createdAt: string;
  appointmentTime?: string | null;
  ktvCalledAt?: string | null;
  products?: string[] | null;
}

interface SalaryData {
  userId: string;
  fullName: string;
  username: string;
  phoneNumber: string;
  stationName: string;
  mainStationName: string;
  isStationPaid: boolean;
  stationRateInfo: {
    stationName: string;
    role: string;
  } | null;
  casesCount: number;
  calculatedCost: number;
  adjustedCost: number;
  adjustmentNote: string;
  status: 'DRAFT' | 'FINAL';
  cases: CaseDetail[];
}

export default function SalaryManage() {
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // Generate last 12 months for selector
  const generateMonths = () => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      list.push(`${mm}/${yyyy}`);
    }
    return list;
  };

  const months = generateMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [salaries, setSalaries] = useState<SalaryData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // View Mode: 'summary' (Tổng hợp KTV) or 'detail' (Chi tiết từng ca)
  const [viewMode, setViewMode] = useState<'summary' | 'detail'>('summary');

  // Detail Modal State (For Summary View)
  const [selectedKtv, setSelectedKtv] = useState<SalaryData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // States for inline unit price editing and row expansion
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editingBaseCost, setEditingBaseCost] = useState<string>('');
  const [expandedReportIds, setExpandedReportIds] = useState<Set<string>>(new Set());

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKtvFilter, setSelectedKtvFilter] = useState('');
  const [selectedStationFilter, setSelectedStationFilter] = useState('');
  const [selectedWorkTypeFilter, setSelectedWorkTypeFilter] = useState('');

  // Function to toggle row expansion
  const toggleRowExpand = (reportId: string) => {
    setExpandedReportIds(prev => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };

  // Function to save base cost changes
  const saveBaseCostChange = async (reportId: string, value: string) => {
    const cost = value === '' ? null : Number(value.replace(/\D/g, ''));
    if (cost !== null && isNaN(cost)) return;
    
    try {
      await fetchApi('/salaries/update-base-cost', {
        method: 'POST',
        body: JSON.stringify({ reportId, baseCost: cost })
      });
      // Fetch latest salaries to sync everything
      const data = await fetchApi(`/salaries/calculate?month=${selectedMonth}`);
      setSalaries(data.salaries || []);
      
      // Update selected KTV in modal if open
      if (selectedKtv) {
        const updatedKtv = (data.salaries || []).find((s: any) => s.userId === selectedKtv.userId);
        if (updatedKtv) {
          setSelectedKtv(updatedKtv);
        }
      }
      setEditingReportId(null);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật đơn giá ca');
    }
  };

  const fetchSalaries = async (silent = false) => {
    if (!silent) setLoading(true);
    setMessage(null);
    try {
      const data = await fetchApi(`/salaries/calculate?month=${selectedMonth}`);
      setSalaries(data.salaries || []);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi tải dữ liệu tính thù lao' });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaries();
  }, [selectedMonth]);

  // Handle manual adjustment input
  const handleAdjustCostChange = (userId: string, val: string) => {
    const numericVal = val === '' ? 0 : Number(val.replace(/\D/g, ''));
    if (isNaN(numericVal)) return;

    setSalaries(prev => prev.map(s => {
      if (s.userId === userId) {
        return { ...s, adjustedCost: numericVal };
      }
      return s;
    }));
  };

  const handleAdjustmentNoteChange = (userId: string, val: string) => {
    setSalaries(prev => prev.map(s => {
      if (s.userId === userId) {
        return { ...s, adjustmentNote: val };
      }
      return s;
    }));
  };

  // Save Draft
  const handleSaveDraft = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        month: selectedMonth,
        salaries: salaries.map(s => ({
          userId: s.userId,
          calculatedCost: s.calculatedCost,
          adjustedCost: s.adjustedCost,
          adjustmentNote: s.adjustmentNote
        }))
      };
      await fetchApi('/salaries/save', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setMessage({ type: 'success', text: 'Đã lưu nháp bảng thù lao thành công!' });
      fetchSalaries(true);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi lưu nháp' });
    } finally {
      setSaving(false);
    }
  };

  // Lock Month
  const handleLockSalary = async () => {
    const isConfirmed = await confirm({
      title: 'Chốt và khóa bảng thù lao',
      message: `Bạn có chắc chắn muốn chốt bảng thù lao tháng ${selectedMonth}? Sau khi chốt, dữ liệu sẽ được khóa và KHÔNG thể chỉnh sửa được nữa.`,
      confirmText: 'Đồng ý chốt',
      cancelText: 'Hủy'
    });

    if (!isConfirmed) return;

    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        month: selectedMonth,
        salaries: salaries.map(s => ({
          userId: s.userId,
          calculatedCost: s.calculatedCost,
          adjustedCost: s.adjustedCost,
          adjustmentNote: s.adjustmentNote
        }))
      };
      await fetchApi('/salaries/save', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      await fetchApi('/salaries/lock', {
        method: 'POST',
        body: JSON.stringify({ month: selectedMonth })
      });
      setMessage({ type: 'success', text: `Đã chốt và khóa thù lao tháng ${selectedMonth} thành công!` });
      fetchSalaries();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi chốt thù lao' });
      setLoading(false);
    }
  };

  // Export to Excel (With filters support)
  const handleExportExcel = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('session_token');
      let url = `/api/salaries/export?month=${encodeURIComponent(selectedMonth)}`;
      if (selectedKtvFilter) url += `&ktvId=${encodeURIComponent(selectedKtvFilter)}`;
      if (selectedStationFilter) url += `&stationId=${encodeURIComponent(selectedStationFilter)}`;
      if (selectedWorkTypeFilter) url += `&workType=${encodeURIComponent(selectedWorkTypeFilter)}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Lỗi xuất file Excel');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `Bang_chi_phi_dich_vu_Truliva_${selectedMonth.replace('/', '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất bảng thù lao Excel' });
    } finally {
      setExporting(false);
    }
  };

  // Unique Lists for Dropdown Filters
  const uniqueStations = useMemo(() => {
    const set = new Set<string>();
    salaries.forEach(s => {
      if (s.stationName && s.stationName !== 'Không có') set.add(s.stationName);
    });
    return Array.from(set).sort();
  }, [salaries]);

  // Flattened Cases Array for Detailed View Mode
  const allCases = useMemo(() => {
    const list: Array<CaseDetail & { ktvName: string; ktvPhone: string; stationName: string; userId: string }> = [];
    for (const s of salaries) {
      for (const c of s.cases) {
        list.push({
          ...c,
          userId: s.userId,
          ktvName: s.fullName,
          ktvPhone: s.phoneNumber,
          stationName: s.stationName
        });
      }
    }
    return list;
  }, [salaries]);

  // Filtered Summary View
  const filteredSalaries = useMemo(() => {
    return salaries.filter(s => {
      const matchKtv = !selectedKtvFilter || s.userId === selectedKtvFilter;
      const matchStation = !selectedStationFilter || s.stationName === selectedStationFilter;
      const matchQuery = !searchQuery || 
        s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.phoneNumber.includes(searchQuery);
      return matchKtv && matchStation && matchQuery;
    });
  }, [salaries, selectedKtvFilter, selectedStationFilter, searchQuery]);

  // Filtered Detailed Cases View
  const filteredCases = useMemo(() => {
    return allCases.filter(c => {
      const matchKtv = !selectedKtvFilter || c.userId === selectedKtvFilter;
      const matchStation = !selectedStationFilter || c.stationName === selectedStationFilter;
      const matchWorkType = !selectedWorkTypeFilter || c.workType.toLowerCase().includes(selectedWorkTypeFilter.toLowerCase());
      const matchQuery = !searchQuery ||
        c.ktvName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customerPhone && c.customerPhone.includes(searchQuery)) ||
        (c.province && c.province.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.notes && c.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.products && c.products.some(p => p.toLowerCase().includes(searchQuery.toLowerCase())));

      return matchKtv && matchStation && matchWorkType && matchQuery;
    });
  }, [allCases, selectedKtvFilter, selectedStationFilter, selectedWorkTypeFilter, searchQuery]);

  const formatMoney = (val: number) => {
    return val.toLocaleString('vi-VN') + ' đ';
  };

  // Quick stats
  const totalCalculated = salaries.reduce((acc, curr) => acc + curr.calculatedCost, 0);
  const totalAdjusted = salaries.reduce((acc, curr) => acc + curr.adjustedCost, 0);
  const totalCasesCount = salaries.reduce((acc, curr) => acc + curr.casesCount, 0);
  const isMonthLocked = salaries.some(s => s.status === 'FINAL');

  return (
    <div className="p-4 lg:p-6 max-w-[1700px] mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1B3A6B] via-[#1E3A8A] to-[#2563EB] rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-2xl"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="h-7 w-7 text-blue-200" />
              Quản lý Chi Phí & Thù Lao Ca Dịch Vụ
            </h1>
            <p className="text-blue-100 text-sm mt-1 max-w-[750px]">
              Tự động tính thù lao ca dịch vụ theo chuẩn thương hiệu Pure Vita / Truliva. Hỗ trợ xem tổng hợp KTV và bảng chi tiết từng ca dịch vụ.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white/10 p-2 rounded-xl border border-white/20 backdrop-blur-md self-start md:self-auto">
            <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider pl-2">Kỳ tính thù lao</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white text-gray-900 font-semibold rounded-lg px-3 py-1.5 text-sm focus:outline-none border-0 ring-2 ring-blue-400 focus:ring-blue-500 cursor-pointer"
            >
              {months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Alert message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-3 border shadow-sm ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <AlertCircle className={`h-5 w-5 mt-0.5 ${message.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`} />
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Tổng số ca duyệt</span>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{totalCasesCount} ca</h3>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
            <UserCheck className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Thù lao tính tự động</span>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{formatMoney(totalCalculated)}</h3>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg text-orange-600">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Thực nhận sau điều chỉnh</span>
            <h3 className="text-2xl font-bold text-blue-800 mt-1">{formatMoney(totalAdjusted)}</h3>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Trạng thái bảng thù lao</span>
            <h3 className={`text-lg font-bold mt-1.5 flex items-center gap-1 ${isMonthLocked ? 'text-emerald-600' : 'text-amber-500'}`}>
              <Lock className="h-4 w-4" />
              {isMonthLocked ? 'Đã chốt & Khóa' : 'Nháp (Đang mở)'}
            </h3>
          </div>
          <div className={`p-3 rounded-lg ${isMonthLocked ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <Lock className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Mode Switcher Tabs & Action Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
        
        {/* Top bar: Mode Tabs + Action buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-gray-100 pb-3">
          
          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-gray-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setViewMode('summary')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                viewMode === 'summary' 
                  ? 'bg-white text-[#1B3A6B] shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>📊 Tổng Hợp Theo KTV ({filteredSalaries.length})</span>
            </button>

            <button
              onClick={() => setViewMode('detail')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                viewMode === 'detail' 
                  ? 'bg-white text-[#1B3A6B] shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <ListFilter className="h-4 w-4" />
              <span>📋 Chi Tiết Tất Cả Ca Dịch Vụ ({filteredCases.length})</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => fetchSalaries()}
              disabled={loading}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Tính lại
            </button>
            
            <button
              onClick={handleExportExcel}
              disabled={exporting || salaries.length === 0}
              className="px-4 py-2 bg-[#107C41] hover:bg-[#0E6C38] text-white font-medium rounded-lg text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {exporting ? 'Đang xuất...' : 'Xuất File Excel Pure Vita (2 Sheet)'}
            </button>

            {isAdmin && !isMonthLocked && (
              <>
                <button
                  onClick={handleSaveDraft}
                  disabled={saving || salaries.length === 0}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Đang lưu...' : 'Lưu nháp'}
                </button>
                
                <button
                  onClick={handleLockSalary}
                  disabled={loading || salaries.length === 0}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-xs flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm cursor-pointer"
                >
                  <Lock className="h-4 w-4" />
                  Chốt thù lao
                </button>
              </>
            )}
          </div>
        </div>

        {/* Multi-Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          
          {/* 1. Lọc theo KTV */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Kỹ thuật viên</label>
            <select
              value={selectedKtvFilter}
              onChange={(e) => setSelectedKtvFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Tất cả KTV ({salaries.length})</option>
              {salaries.map(s => (
                <option key={s.userId} value={s.userId}>{s.fullName} ({s.phoneNumber})</option>
              ))}
            </select>
          </div>

          {/* 2. Lọc theo Trạm */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Trạm quản lý</label>
            <select
              value={selectedStationFilter}
              onChange={(e) => setSelectedStationFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Tất cả Trạm</option>
              {uniqueStations.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* 3. Lọc theo Loại dịch vụ */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Loại dịch vụ</label>
            <select
              value={selectedWorkTypeFilter}
              onChange={(e) => setSelectedWorkTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Tất cả loại dịch vụ</option>
              <option value="Bảo hành">Bảo hành</option>
              <option value="Giao hàng và lắp đặt">Giao hàng & Lắp đặt</option>
              <option value="Lắp đặt">Lắp đặt</option>
              <option value="Thay lọc">Thay lọc</option>
              <option value="Giao hàng">Giao hàng</option>
            </select>
          </div>

          {/* 4. Tìm kiếm từ khóa */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tìm kiếm từ khóa</label>
            <input
              type="text"
              placeholder="Nhập tên KH, SĐT, Tỉnh/TP, Ghi chú..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

        </div>

      </div>

      {/* ========================================================================= */}
      {/* VIEW MODE 1: TỔNG HỢP THEO KTV (SUMMARY VIEW)                             */}
      {/* ========================================================================= */}
      {viewMode === 'summary' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              <span className="text-gray-400 text-xs font-semibold">Đang tải và tính toán thù lao...</span>
            </div>
          ) : filteredSalaries.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-xs">
              Không tìm thấy thông tin KTV nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1B3A6B] text-white font-bold">
                    <th className="px-5 py-3.5 w-12 text-center">STT</th>
                    <th className="px-5 py-3.5">Họ tên KTV</th>
                    <th className="px-5 py-3.5 w-36">Số điện thoại</th>
                    <th className="px-5 py-3.5 w-44">Trạm quản lý</th>
                    <th className="px-5 py-3.5 w-28 text-center">Số ca hoàn thành</th>
                    <th className="px-5 py-3.5 w-44 text-right">Thù lao tự động (VND)</th>
                    <th className="px-5 py-3.5 w-48 text-right">Thực nhận (VND)</th>
                    <th className="px-5 py-3.5 min-w-[200px]">Ghi chú điều chỉnh</th>
                    <th className="px-5 py-3.5 w-28 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSalaries.map((item, idx) => {
                    const isModified = item.adjustedCost !== item.calculatedCost;

                    return (
                      <tr key={item.userId} className="hover:bg-gray-50/60 transition">
                        <td className="px-5 py-3.5 text-center text-gray-400 font-bold">{idx + 1}</td>
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-gray-800">{item.fullName}</div>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-gray-600">
                          {item.phoneNumber}
                        </td>
                        <td className="px-5 py-3.5 text-gray-700 font-semibold">
                          {item.stationName}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 font-extrabold bg-blue-50 text-blue-700 rounded-md text-xs">
                            {item.casesCount} ca
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-gray-700">
                          {formatMoney(item.calculatedCost)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="relative">
                            <input
                              type="text"
                              value={item.adjustedCost.toLocaleString('vi-VN')}
                              onChange={(e) => handleAdjustCostChange(item.userId, e.target.value)}
                              disabled={isMonthLocked || !isAdmin}
                              className={`w-full px-3 py-1.5 text-right font-extrabold text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                isModified 
                                  ? 'border-amber-400 bg-amber-50/50 text-amber-800' 
                                  : 'border-gray-200 bg-white text-gray-800'
                              } disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200`}
                            />
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <input
                            type="text"
                            placeholder="Nhập lý do điều chỉnh..."
                            value={item.adjustmentNote}
                            onChange={(e) => handleAdjustmentNoteChange(item.userId, e.target.value)}
                            disabled={isMonthLocked || !isAdmin}
                            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                          />
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <button
                            onClick={() => {
                              setSelectedKtv(item);
                              setShowDetailModal(true);
                            }}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg flex items-center gap-1 mx-auto text-xs font-bold transition border border-blue-200 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Xem ca
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 2: BẢNG CHI TIẾT TẤT CẢ CA DỊCH VỤ (DETAILED CASES VIEW)       */}
      {/* ========================================================================= */}
      {viewMode === 'detail' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
              <span className="text-gray-400 text-xs font-semibold">Đang tải và tính toán chi tiết từng ca...</span>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-xs">
              Không tìm thấy ca dịch vụ nào phù hợp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1600px] w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1B3A6B] text-white font-bold">
                    <th className="px-3 py-3 w-10 text-center">STT</th>
                    <th className="px-3 py-3 w-32 text-center">Ngày hoàn thành</th>
                    <th className="px-3 py-3 w-36">KTV</th>
                    <th className="px-3 py-3 w-32">Trạm</th>
                    <th className="px-3 py-3 w-36">Tên KH</th>
                    <th className="px-3 py-3 w-28 text-center">SĐT KH</th>
                    <th className="px-3 py-3 w-28">Tỉnh/TP</th>
                    <th className="px-3 py-3 min-w-[160px]">Sản phẩm</th>
                    <th className="px-3 py-3 w-36">Loại dịch vụ</th>
                    <th className="px-3 py-3 min-w-[160px]">Ghi chú</th>
                    <th className="px-3 py-3 w-24 text-right">Bán kính (km)</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/60">Bảo Hành</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/60">Giao hàng</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/60">Lắp đặt</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/60">Giao lắp</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/60">Thay lọc</th>
                    <th className="px-3 py-3 w-24 text-right bg-amber-900/60">Phí KC</th>
                    <th className="px-3 py-3 w-28 text-right font-extrabold bg-blue-950">Tổng (VND)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCases.map((c, index) => {
                    const d = new Date(c.createdAt);
                    const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

                    const isBaoHanh = c.baoHanhCost && c.baoHanhCost > 0;
                    const isGiaoHang = c.giaoHangCost && c.giaoHangCost > 0;
                    const isLapDat = c.lapDatCost && c.lapDatCost > 0;
                    const isGiaoLap = c.giaoLapCost && c.giaoLapCost > 0;
                    const isThayLoc = c.thayLocCost && c.thayLocCost > 0;

                    return (
                      <tr key={c.reportId} className="hover:bg-gray-50/70 transition">
                        <td className="px-3 py-2.5 text-center text-gray-400 font-bold">{index + 1}</td>
                        <td className="px-3 py-2.5 text-center text-gray-600 font-mono text-[11px]">{formattedDate}</td>
                        <td className="px-3 py-2.5 font-bold text-gray-800">{c.ktvName}</td>
                        <td className="px-3 py-2.5 text-gray-600 font-medium">{c.stationName}</td>
                        <td className="px-3 py-2.5 font-medium text-gray-800">{c.customerName}</td>
                        <td className="px-3 py-2.5 text-center font-mono text-gray-600">{c.customerPhone || '-'}</td>
                        <td className="px-3 py-2.5 text-gray-600">{c.province || '-'}</td>
                        <td className="px-3 py-2.5 text-gray-700 text-[11px]">
                          {c.products && c.products.length > 0 ? c.products.join(', ') : '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-800 border border-blue-100">
                            {c.workType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-[11px] truncate max-w-[200px]" title={c.notes}>
                          {c.notes || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium text-gray-600">
                          {c.distance > 0 ? `${c.distance} km` : '-'}
                        </td>

                        {/* Money Categories Columns */}
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-700 bg-blue-50/20">
                          {isBaoHanh ? c.baseCost.toLocaleString('vi-VN') : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-700 bg-blue-50/20">
                          {isGiaoHang ? c.baseCost.toLocaleString('vi-VN') : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-700 bg-blue-50/20">
                          {isLapDat ? c.baseCost.toLocaleString('vi-VN') : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-700 bg-blue-50/20">
                          {isGiaoLap ? c.baseCost.toLocaleString('vi-VN') : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-700 bg-blue-50/20">
                          {isThayLoc ? c.baseCost.toLocaleString('vi-VN') : '-'}
                        </td>

                        {/* Distance Cost */}
                        <td className="px-3 py-2.5 text-right font-semibold text-amber-700 bg-amber-50/20">
                          {c.distanceCost > 0 ? c.distanceCost.toLocaleString('vi-VN') : '-'}
                        </td>

                        {/* Total Cost Column (Editable) */}
                        <td className="px-3 py-2.5 text-right font-extrabold text-blue-900 bg-blue-50/40">
                          {editingReportId === c.reportId ? (
                            <input
                              type="text"
                              className="w-24 text-right px-1.5 py-0.5 border border-blue-500 rounded focus:ring-1 focus:ring-blue-500 text-xs font-bold"
                              value={editingBaseCost}
                              onChange={(e) => setEditingBaseCost(e.target.value)}
                              onBlur={() => saveBaseCostChange(c.reportId, editingBaseCost)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveBaseCostChange(c.reportId, editingBaseCost);
                                else if (e.key === 'Escape') setEditingReportId(null);
                              }}
                              autoFocus
                            />
                          ) : (
                            <div 
                              onClick={() => {
                                if (!isMonthLocked && isAdmin) {
                                  setEditingReportId(c.reportId);
                                  setEditingBaseCost(c.baseCost.toLocaleString('vi-VN'));
                                }
                              }}
                              className={`cursor-pointer px-1 py-0.5 rounded transition ${
                                !isMonthLocked && isAdmin ? 'hover:bg-blue-100 hover:text-blue-700 border border-dashed border-transparent hover:border-blue-300' : ''
                              }`}
                              title={!isMonthLocked && isAdmin ? 'Nhấp để chỉnh sửa đơn giá ca' : ''}
                            >
                              {c.totalCost.toLocaleString('vi-VN')} đ
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 font-extrabold border-t-2 border-slate-300 text-xs">
                  <tr>
                    <td colSpan={11} className="px-3 py-3 text-center text-slate-800 uppercase tracking-wider font-extrabold">
                      TỔNG CỘNG ({filteredCases.length} CA DỊCH VỤ)
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {formatMoney(filteredCases.reduce((acc, c) => acc + (c.baoHanhCost || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {formatMoney(filteredCases.reduce((acc, c) => acc + (c.giaoHangCost || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {formatMoney(filteredCases.reduce((acc, c) => acc + (c.lapDatCost || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {formatMoney(filteredCases.reduce((acc, c) => acc + (c.giaoLapCost || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {formatMoney(filteredCases.reduce((acc, c) => acc + (c.thayLocCost || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right text-amber-800 font-extrabold bg-amber-100/50">
                      {formatMoney(filteredCases.reduce((acc, c) => acc + (c.distanceCost || 0), 0))}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-950 font-black bg-blue-200 text-xs">
                      {formatMoney(filteredCases.reduce((acc, c) => acc + c.totalCost, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Case Details Modal (Summary View) */}
      {showDetailModal && selectedKtv && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="bg-[#1B3A6B] text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Danh sách ca dịch vụ hoàn thành</h3>
                <p className="text-xs text-blue-200 mt-1">
                  Kỹ thuật viên: <strong className="text-white">{selectedKtv.fullName}</strong> | Số điện thoại: <strong className="text-white">{selectedKtv.phoneNumber}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4 flex flex-wrap gap-4 items-center justify-between text-xs text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100 font-semibold">
                <div>Trạm quản lý: <span className="text-gray-900">{selectedKtv.stationName}</span></div>
                <div>Kỳ tính thù lao: <span className="text-gray-900">{selectedMonth}</span></div>
                <div>Tổng ca: <span className="text-blue-700 font-bold">{selectedKtv.casesCount} ca</span></div>
              </div>

              {selectedKtv.cases.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-xs">
                  Không tìm thấy ca dịch vụ nào của KTV này trong tháng.
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold">
                        <th className="px-4 py-3 text-center w-12">STT</th>
                        <th className="px-4 py-3 w-28">Mã ca</th>
                        <th className="px-4 py-3">Khách hàng</th>
                        <th className="px-4 py-3 w-40">Loại công việc</th>
                        <th className="px-4 py-3 text-center w-24">Ngày cuối tuần</th>
                        <th className="px-4 py-3 text-right w-32">Đơn giá ca (VND)</th>
                        <th className="px-4 py-3 w-28 text-center">Quãng đường</th>
                        <th className="px-4 py-3 text-right w-32">Phụ cấp km (VND)</th>
                        <th className="px-4 py-3 text-right w-32 font-bold text-gray-700">Tổng cộng (VND)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedKtv.cases.map((c, index) => {
                        const formattedId = c.pancakeOrderId 
                          ? (c.pancakeOrderId < 0 ? `M${Math.abs(c.pancakeOrderId)}` : `#${c.pancakeOrderId}`)
                          : 'Báo cáo';

                        return (
                          <React.Fragment key={c.reportId}>
                            <tr className="hover:bg-gray-50/50 transition">
                              <td className="px-4 py-3 text-center text-gray-400">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => toggleRowExpand(c.reportId)}
                                    className="p-0.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition cursor-pointer"
                                    title="Xem thêm thông tin"
                                  >
                                    <ChevronDown 
                                      size={14} 
                                      className={`transform transition-transform duration-250 ${
                                        expandedReportIds.has(c.reportId) ? 'rotate-180 text-blue-600' : ''
                                      }`} 
                                    />
                                  </button>
                                  <span>{index + 1}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-semibold text-blue-600">{formattedId}</td>
                              <td className="px-4 py-3 font-medium text-gray-800">{c.customerName}</td>
                              <td className="px-4 py-3 text-gray-600">{c.workType}</td>
                              <td className="px-4 py-3 text-center">
                                {c.isSunday ? (
                                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 rounded-md">
                                    Chủ Nhật
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-700">
                                {editingReportId === c.reportId ? (
                                  <input
                                    type="text"
                                    className="w-24 text-right px-1 py-0.5 border border-blue-400 rounded focus:ring-1 focus:ring-blue-400 focus:outline-none text-xs"
                                    value={editingBaseCost}
                                    onChange={(e) => setEditingBaseCost(e.target.value)}
                                    onBlur={() => saveBaseCostChange(c.reportId, editingBaseCost)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveBaseCostChange(c.reportId, editingBaseCost);
                                      else if (e.key === 'Escape') setEditingReportId(null);
                                    }}
                                    autoFocus
                                  />
                                ) : (
                                  <div 
                                    onClick={() => {
                                      setEditingReportId(c.reportId);
                                      setEditingBaseCost(c.baseCost.toLocaleString('vi-VN'));
                                    }}
                                    className="cursor-pointer hover:bg-gray-100/80 px-1 py-0.5 rounded border border-dashed border-transparent hover:border-gray-300 inline-block w-full text-right font-semibold text-blue-700"
                                    title="Nhấp để chỉnh sửa đơn giá"
                                  >
                                    {c.baseCost.toLocaleString('vi-VN')}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center text-gray-600">
                                {c.distance > 0 ? (
                                  <span className="flex items-center justify-center gap-0.5">
                                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                    {c.distance} km
                                  </span>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600">
                                {c.distanceCost > 0 ? c.distanceCost.toLocaleString('vi-VN') : '-'}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">
                                {c.totalCost.toLocaleString('vi-VN')}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-5 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Đóng lại
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
