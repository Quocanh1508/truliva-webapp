import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchApi } from '../../api/client';
import { isValidPhone, PHONE_ERROR_MSG } from '../../utils/phone';
import { 
  Calculator, 
  Save, 
  Lock, 
  RefreshCw, 
  FileSpreadsheet,
  X,
  UserCheck,
  ChevronDown,
  Sliders,
  Loader2,
  Search,
  Building2
} from 'lucide-react';

interface KtvRateItem {
  rate: number;
  isCustom: boolean;
}

interface KtvRateRow {
  userId: string;
  fullName: string;
  username: string;
  phoneNumber: string;
  stationName: string;
  mainStationName: string;
  rates: Record<string, any>;
}

interface CaseDetail {
  reportId: string;
  orderId: string | null;
  pancakeOrderId: number | null;
  customerName: string;
  customerPhone?: string;
  province?: string;
  address?: string;
  orderNote?: string;
  reportNote?: string;
  notes?: string;
  workType: string;
  isSunday: boolean;
  baseCost: number;
  distance: number;
  distanceCost: number;
  otherCost?: number;
  totalCost: number;
  rateType?: string;
  baoHanhCost?: number;
  suaChuaCost?: number;
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

  // Khôi phục bộ lọc từ sessionStorage khi điều hướng quay lại trang Quản lý lương (Item 8)
  const getInitialFilters = () => {
    try {
      const saved = sessionStorage.getItem('salary_manage_filters');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return null;
  };
  const initial = getInitialFilters();

  const months = generateMonths();
  const [selectedMonth, setSelectedMonth] = useState(initial?.selectedMonth || months[0]);
  const [salaries, setSalaries] = useState<SalaryData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // View Mode: 'summary' (Tổng hợp KTV), 'detail' (Chi tiết từng ca) or 'rates' (Ma trận đơn giá KTV)
  const [viewMode, setViewMode] = useState<'summary' | 'detail' | 'rates'>(initial?.viewMode || 'summary');

  // Rates Matrix State
  const [rateMatrix, setRateMatrix] = useState<KtvRateRow[]>([]);
  const [defaultRates, setDefaultRates] = useState<Record<string, number>>({
    giaoHang: 20000,
    baoHanh: 60000,
    suaChua: 60000,
    thayLoc: 40000,
    lapDat: 100000,
    giaoHangLapDat: 120000,
    thaoLapLai: 160000,
    kmRate: 3000,
    freeKmThreshold: 20,
    freeKmThresholdTLSC: 50
  });
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [editedRates, setEditedRates] = useState<Record<string, Record<string, number>>>({});

  const getRateVal = (item: any, fallback: number): number => {
    if (item === null || item === undefined) return fallback;
    if (typeof item === 'number') return item;
    if (typeof item === 'object' && typeof item.rate === 'number') return item.rate;
    if (typeof item === 'object' && item.rate !== undefined) {
      const num = Number(item.rate);
      return isNaN(num) ? fallback : num;
    }
    const num = Number(item);
    return isNaN(num) ? fallback : num;
  };

  const fetchRateMatrix = async () => {
    setRatesLoading(true);
    try {
      const data = await fetchApi('/salaries/rates');
      if (data.success) {
        setRateMatrix(data.matrix || []);
        if (data.defaultRates) setDefaultRates(data.defaultRates);
        const map: Record<string, Record<string, number>> = {};
        (data.matrix || []).forEach((row: KtvRateRow) => {
          const rates = row.rates || {};
          const def = data.defaultRates || defaultRates;
          map[row.userId] = {
            giaoHang: getRateVal(rates.giaoHang, def.giaoHang ?? 20000),
            baoHanh: getRateVal(rates.baoHanh, def.baoHanh ?? 60000),
            suaChua: getRateVal(rates.suaChua, def.suaChua ?? 60000),
            thayLoc: getRateVal(rates.thayLoc, def.thayLoc ?? 40000),
            lapDat: getRateVal(rates.lapDat, def.lapDat ?? 100000),
            giaoHangLapDat: getRateVal(rates.giaoHangLapDat, def.giaoHangLapDat ?? 120000),
            thaoLapLai: getRateVal(rates.thaoLapLai, def.thaoLapLai ?? 160000),
            kmRate: getRateVal(rates.kmRate, def.kmRate ?? 3000),
            freeKmThreshold: getRateVal(rates.freeKmThreshold, def.freeKmThreshold ?? 20),
            freeKmThresholdTLSC: getRateVal(rates.freeKmThresholdTLSC, def.freeKmThresholdTLSC ?? 50),
          };
        });
        setEditedRates(map);
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi tải ma trận đơn giá KTV' });
    } finally {
      setRatesLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'rates') {
      fetchRateMatrix();
    }
  }, [viewMode]);

  const handleRateCellChange = (userId: string, workType: string, val: string) => {
    const num = val === '' ? 0 : Number(val.replace(/\D/g, ''));
    if (isNaN(num)) return;
    setEditedRates(prev => ({
      ...prev,
      [userId]: {
        ...(prev[userId] || {}),
        [workType]: num
      }
    }));
  };

  const handleResetKtvRates = async (userId: string) => {
    try {
      await fetchApi(`/salaries/rates/${userId}`, { method: 'DELETE' });
      setEditedRates(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      fetchRateMatrix();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi khôi phục đơn giá');
    }
  };

  const handleSaveRateMatrix = async () => {
    setRatesSaving(true);
    setMessage(null);
    try {
      const ratesList: Array<{ userId: string; workType: string; rate: number }> = [];
      Object.entries(editedRates).forEach(([userId, workTypes]) => {
        Object.entries(workTypes).forEach(([workType, rate]) => {
          ratesList.push({ userId, workType, rate });
        });
      });

      const res = await fetchApi('/salaries/rates', {
        method: 'POST',
        body: JSON.stringify({ rates: ratesList })
      });

      if (res.success) {
        setMessage({ type: 'success', text: res.message || 'Cập nhật ma trận đơn giá KTV thành công!' });
        fetchRateMatrix();
        fetchSalaries(true);
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi lưu đơn giá KTV' });
    } finally {
      setRatesSaving(false);
    }
  };

  // Detail Modal State (For Summary View)
  const [selectedKtv, setSelectedKtv] = useState<SalaryData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // States cho phép Admin chỉnh sửa trực tiếp từng cột chi phí (Item 5)
  const [editingCostCell, setEditingCostCell] = useState<{ reportId: string; fieldName: string } | null>(null);
  const [editingCostValue, setEditingCostValue] = useState<string>('');
  const [expandedReportIds, setExpandedReportIds] = useState<Set<string>>(new Set());

  // Search & Filter states (Item 8: lưu duy trì trong sessionStorage)
  const [searchQuery, setSearchQuery] = useState(initial?.searchQuery || '');
  const [selectedKtvsFilter, setSelectedKtvsFilter] = useState<string[]>(initial?.selectedKtvsFilter || []);
  const [selectedStationsFilter, setSelectedStationsFilter] = useState<string[]>(initial?.selectedStationsFilter || []);
  const [selectedWorkTypeFilter, setSelectedWorkTypeFilter] = useState(initial?.selectedWorkTypeFilter || '');
  const [selectedCompletedDateFilter, setSelectedCompletedDateFilter] = useState(initial?.selectedCompletedDateFilter || '');

  // Modal State cho Admin tự thêm ca / mục phí bổ sung (Item 7)
  const [showAddCaseModal, setShowAddCaseModal] = useState(false);
  const [addCaseForm, setAddCaseForm] = useState({
    ktvUserId: '',
    customerName: '',
    customerPhone: '',
    province: '',
    workType: 'Bảo hành',
    amount: '',
    otherCost: '',
    notes: ''
  });
  const [addingCase, setAddingCase] = useState(false);

  // Dropdown States & Refs for Multi-Select Filters (KTV & Station)
  const [isKtvDropdownOpen, setIsKtvDropdownOpen] = useState(false);
  const [ktvSearchQuery, setKtvSearchQuery] = useState('');
  const ktvDropdownRef = useRef<HTMLDivElement>(null);

  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const stationDropdownRef = useRef<HTMLDivElement>(null);

  // Dropdown cho Modal Chọn KTV (Sắp xếp A-Z + Tìm kiếm gợi ý)
  const [isModalKtvDropdownOpen, setIsModalKtvDropdownOpen] = useState(false);
  const [modalKtvSearchQuery, setModalKtvSearchQuery] = useState('');
  const modalKtvDropdownRef = useRef<HTMLDivElement>(null);

  // Tự động lưu bộ lọc vào sessionStorage mỗi khi có thay đổi (Item 8)
  useEffect(() => {
    sessionStorage.setItem('salary_manage_filters', JSON.stringify({
      selectedMonth,
      viewMode,
      selectedKtvsFilter,
      selectedStationsFilter,
      selectedWorkTypeFilter,
      selectedCompletedDateFilter,
      searchQuery
    }));
  }, [selectedMonth, viewMode, selectedKtvsFilter, selectedStationsFilter, selectedWorkTypeFilter, selectedCompletedDateFilter, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ktvDropdownRef.current && !ktvDropdownRef.current.contains(event.target as Node)) {
        setIsKtvDropdownOpen(false);
      }
      if (stationDropdownRef.current && !stationDropdownRef.current.contains(event.target as Node)) {
        setIsStationDropdownOpen(false);
      }
      if (modalKtvDropdownRef.current && !modalKtvDropdownRef.current.contains(event.target as Node)) {
        setIsModalKtvDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Danh sách KTV trong Modal Thêm Ca Bổ Sung (sắp xếp Alphabet A-Z theo Họ tên)
  const modalSortedKtvs = useMemo(() => {
    return [...salaries].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  }, [salaries]);

  const filteredModalKtvs = useMemo(() => {
    if (!modalKtvSearchQuery.trim()) return modalSortedKtvs;
    const q = modalKtvSearchQuery.toLowerCase();
    return modalSortedKtvs.filter(s =>
      s.fullName.toLowerCase().includes(q) ||
      s.phoneNumber.includes(q) ||
      s.username.toLowerCase().includes(q) ||
      (s.stationName && s.stationName.toLowerCase().includes(q))
    );
  }, [modalSortedKtvs, modalKtvSearchQuery]);

  const selectedModalKtvObj = useMemo(() => {
    return salaries.find(s => s.userId === addCaseForm.ktvUserId);
  }, [salaries, addCaseForm.ktvUserId]);

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

  // Function to save specific cost category cell changes (Item 5)
  const saveCostCellChange = async (reportId: string, fieldName: string, value: string) => {
    const cost = value === '' ? 0 : Number(value.replace(/\D/g, ''));
    if (isNaN(cost)) return;
    
    try {
      await fetchApi('/salaries/update-base-cost', {
        method: 'POST',
        body: JSON.stringify({ reportId, fieldName, fieldValue: cost })
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
      setEditingCostCell(null);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật chi phí ca');
    }
  };

  // Function cho Admin tự thêm ca / mục phí bổ sung vào bảng lương (Item 7)
  const handleAddCustomCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCaseForm.ktvUserId || !addCaseForm.customerName) {
      alert('Vui lòng chọn KTV và nhập Tên ca / mục phí bổ sung');
      return;
    }
    if (addCaseForm.customerPhone && !isValidPhone(addCaseForm.customerPhone, true)) {
      alert(PHONE_ERROR_MSG);
      return;
    }
    setAddingCase(true);
    try {
      const res = await fetchApi('/salaries/add-custom-case', {
        method: 'POST',
        body: JSON.stringify({
          month: selectedMonth,
          ...addCaseForm
        })
      });
      if (res.success) {
        setMessage({ type: 'success', text: 'Đã thêm ca / mục phí dịch vụ bổ sung thành công!' });
        setShowAddCaseModal(false);
        setAddCaseForm({
          ktvUserId: '',
          customerName: '',
          customerPhone: '',
          province: '',
          workType: 'Bảo hành',
          amount: '',
          otherCost: '',
          notes: ''
        });
        setModalKtvSearchQuery('');
        fetchSalaries();
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi khi thêm ca bổ sung');
    } finally {
      setAddingCase(false);
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

  // Track initial mount để tránh reset filter khi khôi phục từ sessionStorage
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      // Lần mount đầu tiên: chỉ fetch data, KHÔNG reset filters (đã khôi phục từ sessionStorage)
      isInitialMount.current = false;
      fetchSalaries();
      return;
    }
    // User chủ động đổi tháng → reset tất cả filters
    setSelectedKtvsFilter([]);
    setKtvSearchQuery('');
    setSelectedStationsFilter([]);
    setSelectedWorkTypeFilter('');
    setSelectedCompletedDateFilter('');
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
      if (selectedKtvsFilter.length > 0) url += `&ktvId=${encodeURIComponent(selectedKtvsFilter.join(','))}`;
      if (selectedStationsFilter.length > 0) url += `&stationId=${encodeURIComponent(selectedStationsFilter.join(','))}`;
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

  // Danh sách KTV có đóng ca trong tháng tương ứng, sắp xếp Họ tên theo alphabet (A-Z)
  const activeKtvsInMonth = useMemo(() => {
    return salaries
      .filter(s => s.casesCount > 0)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  }, [salaries]);

  // Tìm kiếm KTV trong Dropdown chọn nhiều KTV
  const filteredKtvsInDropdown = useMemo(() => {
    if (!ktvSearchQuery.trim()) return activeKtvsInMonth;
    const q = ktvSearchQuery.toLowerCase();
    return activeKtvsInMonth.filter(s => 
      s.fullName.toLowerCase().includes(q) ||
      s.phoneNumber.includes(q) ||
      s.username.toLowerCase().includes(q)
    );
  }, [activeKtvsInMonth, ktvSearchQuery]);

  // Toggle chọn 1 KTV trong bộ lọc
  const toggleKtv = (userId: string) => {
    setSelectedKtvsFilter(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // Toggle chọn tất cả / bỏ tất cả KTV trong bộ lọc
  const toggleAllKtvs = () => {
    if (selectedKtvsFilter.length === activeKtvsInMonth.length) {
      setSelectedKtvsFilter([]);
    } else {
      setSelectedKtvsFilter(activeKtvsInMonth.map(s => s.userId));
    }
  };

  // Cấu trúc Cây Trạm: Trạm Chính (Parent Group) -> Trạm Kỹ Thuật (Child Sub-stations)
  // Mỗi trạm kỹ thuật được gán Unique Key = "MainStationName::TechStationName" để không bị trùng lặp khi các Trạm chính cùng có tên trạm "Hà Nội"
  const stationTree = useMemo(() => {
    const map = new Map<string, Map<string, { key: string; name: string }>>();

    activeKtvsInMonth.forEach(s => {
      const main = s.mainStationName && s.mainStationName !== 'Không có' ? s.mainStationName : 'Trực thuộc Truliva';
      const tech = s.stationName && s.stationName !== 'Không có' ? s.stationName : 'Khác';
      const key = `${main}::${tech}`;

      if (!map.has(main)) {
        map.set(main, new Map());
      }
      map.get(main)!.set(key, { key, name: tech });
    });

    const list: Array<{ mainStationName: string; stations: Array<{ key: string; name: string }> }> = [];
    map.forEach((stationsMap, mainStationName) => {
      const sortedStations = Array.from(stationsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      list.push({
        mainStationName,
        stations: sortedStations
      });
    });

    return list.sort((a, b) => a.mainStationName.localeCompare(b.mainStationName, 'vi'));
  }, [activeKtvsInMonth]);

  // Toggle single technical station selection using unique station key
  const toggleStation = (stationKey: string) => {
    setSelectedStationsFilter(prev => {
      if (prev.includes(stationKey)) {
        return prev.filter(s => s !== stationKey);
      } else {
        return [...prev, stationKey];
      }
    });
  };

  // Toggle all technical stations under a main station group using unique station keys
  const toggleMainStationGroup = (groupKeys: string[]) => {
    const allSelected = groupKeys.every(k => selectedStationsFilter.includes(k));
    setSelectedStationsFilter(prev => {
      if (allSelected) {
        return prev.filter(k => !groupKeys.includes(k));
      } else {
        const next = new Set([...prev, ...groupKeys]);
        return Array.from(next);
      }
    });
  };

  // Flattened Cases Array for Detailed View Mode
  const allCases = useMemo(() => {
    const list: Array<CaseDetail & { ktvName: string; ktvPhone: string; stationName: string; mainStationName: string; userId: string }> = [];
    for (const s of salaries) {
      for (const c of s.cases) {
        list.push({
          ...c,
          userId: s.userId,
          ktvName: s.fullName,
          ktvPhone: s.phoneNumber,
          stationName: s.stationName,
          mainStationName: s.mainStationName
        });
      }
    }
    return list;
  }, [salaries]);

  // Filtered Summary View
  const filteredSalaries = useMemo(() => {
    return salaries.filter(s => {
      const hasActivity = s.casesCount > 0 || (s.adjustedCost !== s.calculatedCost) || !!s.adjustmentNote;
      const matchKtv = selectedKtvsFilter.length === 0 ? hasActivity : selectedKtvsFilter.includes(s.userId);

      const sMain = s.mainStationName && s.mainStationName !== 'Không có' ? s.mainStationName : 'Trực thuộc Truliva';
      const sTech = s.stationName && s.stationName !== 'Không có' ? s.stationName : 'Khác';
      const sKey = `${sMain}::${sTech}`;

      const matchStation = selectedStationsFilter.length === 0 || 
        selectedStationsFilter.includes(sKey) || 
        selectedStationsFilter.includes(s.stationName);

      const matchCompletedDate = !selectedCompletedDateFilter || (s.cases && s.cases.some(c => {
        if (!c.createdAt) return false;
        const cDate = new Date(c.createdAt).toLocaleDateString('sv-SE');
        return cDate === selectedCompletedDateFilter;
      }));

      const matchQuery = !searchQuery || 
        s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.phoneNumber.includes(searchQuery);
      return matchKtv && matchStation && matchCompletedDate && matchQuery;
    });
  }, [salaries, selectedKtvsFilter, selectedStationsFilter, selectedCompletedDateFilter, searchQuery]);

  // Filtered Detailed Cases View
  const filteredCases = useMemo(() => {
    return allCases.filter(c => {
      const matchKtv = selectedKtvsFilter.length === 0 || selectedKtvsFilter.includes(c.userId);

      const cMain = c.mainStationName && c.mainStationName !== 'Không có' ? c.mainStationName : 'Trực thuộc Truliva';
      const cTech = c.stationName && c.stationName !== 'Không có' ? c.stationName : 'Khác';
      const cKey = `${cMain}::${cTech}`;

      const matchStation = selectedStationsFilter.length === 0 || 
        selectedStationsFilter.includes(cKey) || 
        selectedStationsFilter.includes(c.stationName);

      const matchWorkType = !selectedWorkTypeFilter || c.workType.toLowerCase().includes(selectedWorkTypeFilter.toLowerCase());

      const cDate = c.createdAt ? new Date(c.createdAt).toLocaleDateString('sv-SE') : '';
      const matchCompletedDate = !selectedCompletedDateFilter || cDate === selectedCompletedDateFilter;

      const matchQuery = !searchQuery ||
        c.ktvName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.customerPhone && c.customerPhone.includes(searchQuery)) ||
        (c.province && c.province.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.notes && c.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.products && c.products.some(p => p.toLowerCase().includes(searchQuery.toLowerCase())));

      return matchKtv && matchStation && matchWorkType && matchCompletedDate && matchQuery;
    });
  }, [allCases, selectedKtvsFilter, selectedStationsFilter, selectedWorkTypeFilter, selectedCompletedDateFilter, searchQuery]);

  const formatMoney = (val: number) => {
    return val.toLocaleString('vi-VN') + ' đ';
  };

  // Quick stats
  const totalCalculated = salaries.reduce((acc, curr) => acc + curr.calculatedCost, 0);
  const totalAdjusted = salaries.reduce((acc, curr) => acc + curr.adjustedCost, 0);
  const totalCasesCount = salaries.reduce((acc, curr) => acc + curr.casesCount, 0);
  const isMonthLocked = salaries.some(s => s.status === 'FINAL');

  // Helper render ô chi phí có thể chỉnh sửa trực tiếp (Item 5)
  const renderCostCell = (c: CaseDetail, fieldName: string, currentVal: number, bgClass: string = 'bg-blue-50/20') => {
    const isEditing = editingCostCell?.reportId === c.reportId && editingCostCell?.fieldName === fieldName;
    const canEdit = !isMonthLocked && isAdmin;

    if (isEditing) {
      return (
        <td className={`px-2 py-2 text-right ${bgClass}`}>
          <input
            type="text"
            className="w-20 text-right px-1.5 py-0.5 border border-blue-500 rounded focus:ring-1 focus:ring-blue-500 text-xs font-bold bg-white"
            value={editingCostValue}
            onChange={(e) => setEditingCostValue(e.target.value)}
            onBlur={() => saveCostCellChange(c.reportId, fieldName, editingCostValue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCostCellChange(c.reportId, fieldName, editingCostValue);
              else if (e.key === 'Escape') setEditingCostCell(null);
            }}
            autoFocus
          />
        </td>
      );
    }

    return (
      <td className={`px-3 py-2.5 text-right font-semibold text-gray-700 ${bgClass}`}>
        <div
          onClick={() => {
            if (canEdit) {
              setEditingCostCell({ reportId: c.reportId, fieldName });
              setEditingCostValue(currentVal ? currentVal.toLocaleString('vi-VN') : '0');
            }
          }}
          className={`px-1 py-0.5 rounded transition ${
            canEdit ? 'cursor-pointer hover:bg-blue-100 hover:text-blue-800 border border-dashed border-transparent hover:border-blue-300' : ''
          }`}
          title={canEdit ? `Nhấp để chỉnh sửa ${fieldName}` : ''}
        >
          {currentVal > 0 ? currentVal.toLocaleString('vi-VN') : '-'}
        </div>
      </td>
    );
  };

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

            {isAdmin && (
              <button
                onClick={() => setViewMode('rates')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  viewMode === 'rates' 
                    ? 'bg-white text-[#1B3A6B] shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Sliders className="h-4 w-4 text-[#00A3FF]" />
                <span>⚙️ Ma Trận Đơn Giá KTV</span>
              </button>
            )}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          
          {/* 1. Lọc theo KTV (Cho phép chọn nhiều, chọn tất cả / bỏ tất cả, sắp xếp A-Z) */}
          <div className="relative" ref={ktvDropdownRef}>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              Kỹ thuật viên {selectedKtvsFilter.length > 0 && selectedKtvsFilter.length !== activeKtvsInMonth.length && `(${selectedKtvsFilter.length}/${activeKtvsInMonth.length})`}
            </label>
            <button
              type="button"
              onClick={() => setIsKtvDropdownOpen(!isKtvDropdownOpen)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center justify-between gap-2 shadow-sm text-gray-800 cursor-pointer hover:border-gray-300"
            >
              <div className="flex items-center gap-1.5 truncate">
                <UserCheck className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                <span className="truncate">
                  {selectedKtvsFilter.length === 0 || selectedKtvsFilter.length === activeKtvsInMonth.length
                    ? `Tất cả KTV có ca (${activeKtvsInMonth.length})`
                    : `Đã chọn ${selectedKtvsFilter.length} KTV`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {selectedKtvsFilter.length > 0 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedKtvsFilter([]);
                    }}
                    className="p-0.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 cursor-pointer"
                    title="Bỏ chọn tất cả"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isKtvDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {/* KTV Multi-Select Dropdown Panel */}
            {isKtvDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 p-3 text-xs space-y-2 max-h-80 overflow-y-auto">
                {/* Header Select All / Deselect All */}
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 font-bold text-gray-700">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-blue-900">
                    <input
                      type="checkbox"
                      checked={activeKtvsInMonth.length > 0 && selectedKtvsFilter.length === activeKtvsInMonth.length}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = selectedKtvsFilter.length > 0 && selectedKtvsFilter.length < activeKtvsInMonth.length;
                        }
                      }}
                      onChange={toggleAllKtvs}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-3.5 w-3.5"
                    />
                    <span>Tất cả KTV có ca ({activeKtvsInMonth.length})</span>
                  </label>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSelectedKtvsFilter(activeKtvsInMonth.map(s => s.userId))}
                      className="text-blue-600 hover:underline font-semibold cursor-pointer"
                    >
                      Chọn hết
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedKtvsFilter([])}
                      className="text-gray-500 hover:underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                {/* Quick Search inside KTV Dropdown */}
                {activeKtvsInMonth.length > 6 && (
                  <div className="relative my-1">
                    <Search className="h-3 w-3 text-gray-400 absolute left-2.5 top-2" />
                    <input
                      type="text"
                      placeholder="Tìm theo tên KTV, SĐT..."
                      value={ktvSearchQuery}
                      onChange={(e) => setKtvSearchQuery(e.target.value)}
                      className="w-full pl-7 pr-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* KTV Items List (Alphabetical A-Z) */}
                <div className="space-y-1 pt-1">
                  {filteredKtvsInDropdown.length === 0 ? (
                    <div className="text-center py-3 text-gray-400 italic text-[11px]">
                      Không tìm thấy KTV phù hợp
                    </div>
                  ) : (
                    filteredKtvsInDropdown.map((s) => {
                      const isSelected = selectedKtvsFilter.includes(s.userId);
                      return (
                        <label
                          key={s.userId}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-lg border transition cursor-pointer ${
                            isSelected 
                              ? 'bg-blue-50/70 border-blue-200 text-blue-950 font-medium' 
                              : 'border-transparent hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleKtv(s.userId)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-3.5 w-3.5 flex-shrink-0"
                            />
                            <span className="truncate">{s.fullName} ({s.phoneNumber})</span>
                          </div>
                          <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {s.casesCount} ca
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Lọc theo Trạm (Cây Phân Cấp: Trạm Chính -> Trạm Kỹ Thuật, Cho Chọn Nhiều) */}
          <div className="relative" ref={stationDropdownRef}>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              Trạm quản lý {selectedStationsFilter.length > 0 && `(${selectedStationsFilter.length} trạm)`}
            </label>
            <button
              type="button"
              onClick={() => setIsStationDropdownOpen(!isStationDropdownOpen)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center justify-between gap-2 shadow-sm text-gray-800 cursor-pointer hover:border-gray-300"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Building2 className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                <span className="truncate">
                  {selectedStationsFilter.length === 0
                    ? 'Tất cả Trạm'
                    : `Đã chọn ${selectedStationsFilter.length} trạm`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {selectedStationsFilter.length > 0 && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStationsFilter([]);
                    }}
                    className="p-0.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 cursor-pointer"
                    title="Xóa lọc trạm"
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isStationDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {/* Tree Multi-Select Panel */}
            {isStationDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 p-3 text-xs space-y-2 max-h-80 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 font-bold text-gray-700">
                  <span className="text-[11px] uppercase tracking-wider text-gray-400">Danh mục Trạm</span>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const allTechKeys = stationTree.flatMap(g => g.stations.map(st => st.key));
                        setSelectedStationsFilter(allTechKeys);
                      }}
                      className="text-blue-600 hover:underline font-semibold cursor-pointer"
                    >
                      Chọn hết
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedStationsFilter([])}
                      className="text-gray-500 hover:underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  {stationTree.map((group) => {
                    const groupKeys = group.stations.map(st => st.key);
                    const isGroupAllSelected = groupKeys.every(k => selectedStationsFilter.includes(k));
                    const isGroupSomeSelected = groupKeys.some(k => selectedStationsFilter.includes(k)) && !isGroupAllSelected;

                    return (
                      <div key={group.mainStationName} className="space-y-1">
                        {/* Header: Trạm Chính (Parent Group) */}
                        <div className="flex items-center gap-2 bg-blue-50/70 px-2 py-1.5 rounded-lg border border-blue-100 font-bold text-blue-950">
                          <input
                            type="checkbox"
                            checked={isGroupAllSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = isGroupSomeSelected;
                            }}
                            onChange={() => toggleMainStationGroup(groupKeys)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer h-3.5 w-3.5"
                          />
                          <span className="truncate flex-1 text-[11px] font-extrabold text-[#1B3A6B]">
                            🏢 {group.mainStationName}
                          </span>
                          <span className="text-[10px] bg-blue-200/60 text-blue-800 px-1.5 py-0.2 rounded-full font-bold">
                            {group.stations.length}
                          </span>
                        </div>

                        {/* Sub-items: Trạm Kỹ Thuật (Child Stations) */}
                        <div className="pl-4 space-y-0.5">
                          {group.stations.map((st) => {
                            const isChecked = selectedStationsFilter.includes(st.key);

                            return (
                              <label
                                key={st.key}
                                className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs transition cursor-pointer hover:bg-gray-50 ${
                                  isChecked ? 'bg-cyan-50/80 font-bold text-cyan-900' : 'text-gray-700 font-medium'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleStation(st.key)}
                                  className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer h-3.5 w-3.5"
                                />
                                <span className="truncate text-[11px] flex-1">
                                  📍 {st.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 3. Lọc theo Loại công việc */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Loại công việc</label>
            <select
              value={selectedWorkTypeFilter}
              onChange={(e) => setSelectedWorkTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Tất cả loại công việc</option>
              <option value="Bảo hành">Bảo hành</option>
              <option value="Sửa chữa">Sửa chữa</option>
              <option value="Giao hàng và lắp đặt">Giao hàng & Lắp đặt</option>
              <option value="Lắp đặt">Lắp đặt</option>
              <option value="Thay lọc">Thay lọc</option>
              <option value="Giao hàng">Giao hàng</option>
            </select>
          </div>

          {/* 4. Lọc theo Ngày hoàn thành */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              Ngày hoàn thành {selectedCompletedDateFilter && '(Đang lọc)'}
            </label>
            <div className="relative">
              <input
                type="date"
                value={selectedCompletedDateFilter}
                onChange={(e) => setSelectedCompletedDateFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              {selectedCompletedDateFilter && (
                <button
                  type="button"
                  onClick={() => setSelectedCompletedDateFilter('')}
                  className="absolute right-2 top-2 p-0.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 cursor-pointer"
                  title="Xóa lọc ngày"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* 5. Tìm kiếm từ khóa */}
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
            <div className="overflow-x-auto max-h-[calc(100vh-230px)] overflow-y-auto relative rounded-xl border border-gray-100 shadow-sm">
              <table className="min-w-[1100px] w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-20 shadow-sm">
                  <tr className="bg-[#1B3A6B] text-white font-bold">
                    <th className="px-5 py-3.5 w-12 text-center bg-[#1B3A6B] sticky top-0 z-20">STT</th>
                    <th className="px-5 py-3.5 bg-[#1B3A6B] sticky top-0 z-20">Họ tên KTV</th>
                    <th className="px-5 py-3.5 w-36 bg-[#1B3A6B] sticky top-0 z-20">Số điện thoại</th>
                    <th className="px-5 py-3.5 w-44 bg-[#1B3A6B] sticky top-0 z-20">Trạm quản lý</th>
                    <th className="px-5 py-3.5 w-28 text-center bg-[#1B3A6B] sticky top-0 z-20">Số ca hoàn thành</th>
                    <th className="px-5 py-3.5 w-44 text-right bg-[#1B3A6B] sticky top-0 z-20">Thù lao tự động (VND)</th>
                    <th className="px-5 py-3.5 w-48 text-right bg-[#1B3A6B] sticky top-0 z-20">Thực nhận (VND)</th>
                    <th className="px-5 py-3.5 min-w-[200px] bg-[#1B3A6B] sticky top-0 z-20">Ghi chú điều chỉnh</th>
                    <th className="px-5 py-3.5 w-28 text-center bg-[#1B3A6B] sticky top-0 z-20">Thao tác</th>
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
          {/* Action Toolbar trên bảng chi tiết (Item 7) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50/80 border-b border-gray-100">
            <div className="text-xs text-gray-600 font-medium">
              Hiển thị <strong className="text-blue-900 font-bold">{filteredCases.length}</strong> ca dịch vụ chi tiết trong tháng {selectedMonth}
            </div>
            {isAdmin && !isMonthLocked && (
              <button
                onClick={() => setShowAddCaseModal(true)}
                className="px-3.5 py-2 bg-[#1B3A6B] hover:bg-[#152e55] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer self-start sm:self-auto min-h-[38px]"
              >
                <Save className="h-4 w-4 text-blue-200" />
                + Thêm ca / Chi phí bổ sung
              </button>
            )}
          </div>

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
            <div className="overflow-x-auto max-h-[calc(100vh-230px)] overflow-y-auto relative rounded-xl border border-gray-100 shadow-sm">
              <table className="min-w-[1950px] w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-20 shadow-sm">
                  <tr className="bg-[#1B3A6B] text-white font-bold">
                    <th className="px-3 py-3 w-10 text-center bg-[#1B3A6B] sticky top-0 z-20">STT</th>
                    <th className="px-3 py-3 w-32 text-center bg-[#1B3A6B] sticky top-0 z-20">Ngày hoàn thành</th>
                    <th className="px-3 py-3 w-36 bg-[#1B3A6B] sticky top-0 z-20">KTV</th>
                    <th className="px-3 py-3 w-32 bg-[#1B3A6B] sticky top-0 z-20">Trạm</th>
                    <th className="px-3 py-3 w-36 bg-[#1B3A6B] sticky top-0 z-20">Tên KH</th>
                    <th className="px-3 py-3 w-28 text-center bg-[#1B3A6B] sticky top-0 z-20">SĐT KH</th>
                    <th className="px-3 py-3 w-28 bg-[#1B3A6B] sticky top-0 z-20">Tỉnh/TP</th>
                    <th className="px-3 py-3 min-w-[160px] bg-[#1B3A6B] sticky top-0 z-20">Sản phẩm</th>
                    <th className="px-3 py-3 w-36 bg-[#1B3A6B] sticky top-0 z-20">Loại công việc</th>
                    {/* Item 1: Tách 2 loại ghi chú */}
                    <th className="px-3 py-3 min-w-[140px] bg-[#1B3A6B] sticky top-0 z-20" title="Ghi chú đơn hàng do Sale lên">Ghi chú (Sale)</th>
                    <th className="px-3 py-3 min-w-[160px] bg-[#1B3A6B] sticky top-0 z-20" title="Ghi chú do KTV nhập khi làm báo cáo">Ghi chú KTV</th>
                    {/* Item 2: Đổi Bán kính -> KC di chuyển (km) */}
                    <th className="px-3 py-3 w-28 text-right bg-[#1B3A6B] sticky top-0 z-20">KC di chuyển (km)</th>
                    {/* Tách riêng 2 cột Bảo hành & Sửa chữa */}
                    <th className="px-3 py-3 w-28 text-right bg-blue-950/90 sticky top-0 z-20 border-l border-blue-800" title="Nhấp vào ô bên dưới để chỉnh sửa">Bảo hành</th>
                    <th className="px-3 py-3 w-28 text-right bg-indigo-950/90 sticky top-0 z-20 border-l border-indigo-800" title="Nhấp vào ô bên dưới để chỉnh sửa">Sửa chữa</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/90 sticky top-0 z-20" title="Nhấp vào ô bên dưới để chỉnh sửa">Giao hàng</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/90 sticky top-0 z-20" title="Nhấp vào ô bên dưới để chỉnh sửa">Lắp đặt</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/90 sticky top-0 z-20" title="Nhấp vào ô bên dưới để chỉnh sửa">Giao lắp</th>
                    <th className="px-3 py-3 w-28 text-right bg-blue-900/90 sticky top-0 z-20" title="Nhấp vào ô bên dưới để chỉnh sửa">Thay lọc</th>
                    <th className="px-3 py-3 w-24 text-right bg-amber-900/90 sticky top-0 z-20" title="Nhấp vào ô bên dưới để chỉnh sửa">Phí KC</th>
                    {/* Item 4: Thêm cột Phí khác */}
                    <th className="px-3 py-3 w-28 text-right bg-purple-900/90 sticky top-0 z-20" title="Nhấp vào ô bên dưới để chỉnh sửa">Phí khác</th>
                    {/* Item 6: Bỏ đơn vị 'đ' ở cột tổng */}
                    <th className="px-3 py-3 w-28 text-right font-extrabold bg-blue-950 sticky top-0 z-20">Tổng (VND)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCases.map((c, index) => {
                    const d = new Date(c.createdAt);
                    const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

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
                        
                        {/* Item 1: Ghi chú Sale (rê chuột thấy full) */}
                        <td className="px-3 py-2.5 text-gray-500 text-[11px]">
                          <span className="truncate max-w-[140px] block" title={c.orderNote || ''}>
                            {c.orderNote || '-'}
                          </span>
                        </td>

                        {/* Item 1: Ghi chú KTV (hiển thị full) */}
                        <td className="px-3 py-2.5 text-gray-700 text-[11px] font-medium min-w-[160px]">
                          {c.reportNote || '-'}
                        </td>

                        {/* Item 2: KC di chuyển (km) */}
                        <td className="px-3 py-2.5 text-right font-medium text-gray-600">
                          {c.distance > 0 ? `${c.distance} km` : '-'}
                        </td>

                        {/* Item 5: Admin điều chỉnh trực tiếp tất cả các cột chi phí */}
                        {renderCostCell(c, 'baoHanhCost', c.baoHanhCost || 0)}
                        {renderCostCell(c, 'suaChuaCost', c.suaChuaCost || 0, 'bg-indigo-50/30')}
                        {renderCostCell(c, 'giaoHangCost', c.giaoHangCost || 0)}
                        {renderCostCell(c, 'lapDatCost', c.lapDatCost || 0)}
                        {renderCostCell(c, 'giaoLapCost', c.giaoLapCost || 0)}
                        {renderCostCell(c, 'thayLocCost', c.thayLocCost || 0)}
                        {renderCostCell(c, 'distanceCost', c.distanceCost || 0, 'bg-amber-50/20')}
                        {/* Item 4: Cột Phí khác */}
                        {renderCostCell(c, 'otherCost', c.otherCost || 0, 'bg-purple-50/20')}

                        {/* Item 6: Cột Tổng (Bỏ chữ 'đ') */}
                        <td className="px-3 py-2.5 text-right font-extrabold text-blue-900 bg-blue-50/40">
                          {c.totalCost.toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 font-extrabold border-t-2 border-slate-300 text-xs">
                  <tr>
                    <td colSpan={12} className="px-3 py-3 text-center text-slate-800 uppercase tracking-wider font-extrabold">
                      TỔNG CỘNG ({filteredCases.length} CA DỊCH VỤ)
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {filteredCases.reduce((acc, c) => acc + (c.baoHanhCost || 0), 0).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right text-indigo-900 font-extrabold bg-indigo-100/50">
                      {filteredCases.reduce((acc, c) => acc + (c.suaChuaCost || 0), 0).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {filteredCases.reduce((acc, c) => acc + (c.giaoHangCost || 0), 0).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {filteredCases.reduce((acc, c) => acc + (c.lapDatCost || 0), 0).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {filteredCases.reduce((acc, c) => acc + (c.giaoLapCost || 0), 0).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-900 font-extrabold bg-blue-100/50">
                      {filteredCases.reduce((acc, c) => acc + (c.thayLocCost || 0), 0).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right text-amber-800 font-extrabold bg-amber-100/50">
                      {filteredCases.reduce((acc, c) => acc + (c.distanceCost || 0), 0).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right text-purple-900 font-extrabold bg-purple-100/50">
                      {filteredCases.reduce((acc, c) => acc + (c.otherCost || 0), 0).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-3 text-right text-blue-950 font-black bg-blue-200 text-xs">
                      {filteredCases.reduce((acc, c) => acc + c.totalCost, 0).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Thêm Ca / Phí Bổ Sung (Item 7) */}
      {showAddCaseModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <Calculator className="h-5 w-5 text-blue-600" />
                Thêm ca / Chi phí dịch vụ bổ sung
              </h3>
              <button
                onClick={() => setShowAddCaseModal(false)}
                className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomCase} className="space-y-3 text-xs">
              {/* Chọn KTV với Tìm kiếm gợi ý & Sắp xếp Alphabet A-Z */}
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Chọn Kỹ thuật viên <span className="text-red-500">*</span>
                </label>
                <div className="relative" ref={modalKtvDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsModalKtvDropdownOpen(!isModalKtvDropdownOpen)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white flex items-center justify-between gap-2 text-left cursor-pointer hover:border-gray-300 shadow-sm"
                  >
                    <span className={selectedModalKtvObj ? 'font-bold text-gray-900 truncate' : 'text-gray-400 truncate'}>
                      {selectedModalKtvObj
                        ? `${selectedModalKtvObj.fullName} (${selectedModalKtvObj.phoneNumber}) - ${selectedModalKtvObj.stationName}`
                        : '-- Chọn KTV nhận thù lao --'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${isModalKtvDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isModalKtvDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-full bg-white border border-gray-200 rounded-xl shadow-2xl z-50 p-2 text-xs space-y-2 max-h-64 overflow-y-auto">
                      <div className="relative sticky top-0 bg-white pb-1 border-b border-gray-100 z-10">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Gõ tên, SĐT để tìm nhanh KTV..."
                          value={modalKtvSearchQuery}
                          onChange={(e) => setModalKtvSearchQuery(e.target.value)}
                          autoFocus
                          className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="space-y-0.5 max-h-48 overflow-y-auto">
                        {filteredModalKtvs.length === 0 ? (
                          <div className="p-3 text-center text-gray-400 font-medium text-[11px]">
                            Không tìm thấy KTV nào phù hợp
                          </div>
                        ) : (
                          filteredModalKtvs.map((s) => {
                            const isSelected = s.userId === addCaseForm.ktvUserId;

                            return (
                              <div
                                key={s.userId}
                                onClick={() => {
                                  setAddCaseForm(prev => ({ ...prev, ktvUserId: s.userId }));
                                  setIsModalKtvDropdownOpen(false);
                                }}
                                className={`px-3 py-2 rounded-lg cursor-pointer transition flex items-center justify-between text-xs ${
                                  isSelected
                                    ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                                    : 'hover:bg-gray-50 text-gray-700 font-medium'
                                }`}
                              >
                                <div>
                                  <div className="font-bold text-gray-900">{s.fullName} <span className="text-gray-500 font-normal text-[11px]">({s.phoneNumber})</span></div>
                                  <div className="text-[10px] text-gray-500">📍 {s.stationName}</div>
                                </div>
                                {isSelected && <UserCheck className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Tên ca / Khách hàng / Nội dung <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="VD: Ca hỗ trợ ngoài / KH Nguyễn Văn A..."
                  value={addCaseForm.customerName}
                  onChange={(e) => setAddCaseForm(prev => ({ ...prev, customerName: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Loại công việc</label>
                  <select
                    value={addCaseForm.workType}
                    onChange={(e) => setAddCaseForm(prev => ({ ...prev, workType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 bg-white text-xs"
                  >
                    <option value="Bảo hành">Bảo hành</option>
                    <option value="Sửa chữa">Sửa chữa</option>
                    <option value="Giao hàng">Giao hàng</option>
                    <option value="Lắp đặt">Lắp đặt</option>
                    <option value="Giao hàng và lắp đặt">Giao hàng và lắp đặt</option>
                    <option value="Thay lọc">Thay lọc</option>
                    <option value="Phí khác">Phí khác</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Đơn giá ca (VND)</label>
                  <input
                    type="text"
                    placeholder="VD: 190.000"
                    value={addCaseForm.amount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setAddCaseForm(prev => ({ ...prev, amount: val ? Number(val).toLocaleString('vi-VN') : '' }));
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 text-xs text-right"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Phí khác bổ sung (VND)</label>
                  <input
                    type="text"
                    placeholder="VD: 50.000"
                    value={addCaseForm.otherCost}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setAddCaseForm(prev => ({ ...prev, otherCost: val ? Number(val).toLocaleString('vi-VN') : '' }));
                    }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-purple-500 text-xs text-right"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tỉnh/TP</label>
                  <input
                    type="text"
                    placeholder="VD: Hà Nội..."
                    value={addCaseForm.province}
                    onChange={(e) => setAddCaseForm(prev => ({ ...prev, province: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Ghi chú giải trình</label>
                <textarea
                  rows={2}
                  placeholder="Nhập ghi chú lý do thêm ca/phí bổ sung..."
                  value={addCaseForm.notes}
                  onChange={(e) => setAddCaseForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddCaseModal(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={addingCase}
                  className="px-5 py-2 bg-[#1B3A6B] hover:bg-[#152e55] text-white font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50 shadow-md cursor-pointer"
                >
                  {addingCase ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu Ca Bổ Sung
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 3: MA TRẬN ĐƠN GIÁ DỊCH VỤ THEO KTV                              */}
      {/* ========================================================================= */}
      {viewMode === 'rates' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden space-y-4 p-5">
          {/* Header & Controls bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                <Sliders className="h-5 w-5 text-[#00A3FF]" />
                Ma Trận Đơn Giá Cố Định Cho Từng Kỹ Thuật Viên
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Tùy chỉnh đơn giá riêng cho từng KTV theo hợp đồng/thỏa thuận. Các KTV không cài riêng sẽ tự động áp dụng <strong>Đơn giá chuẩn của Truliva</strong>.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm KTV, trạm..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 md:w-64"
                />
              </div>

              <button
                onClick={handleSaveRateMatrix}
                disabled={ratesSaving}
                className="px-5 py-2.5 bg-[#1B3A6B] hover:bg-[#152e55] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-md cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {ratesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Lưu Thay Đổi Đơn Giá
              </button>
            </div>
          </div>

          {/* Quick Legend / Info Bar */}
          <div className="flex flex-wrap items-center justify-between bg-blue-50/60 p-3 rounded-xl border border-blue-100 text-xs text-blue-900 gap-2">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-blue-950">Chú thích đơn giá:</span>
              <span className="inline-flex items-center gap-1.5 bg-cyan-100 border border-cyan-300 text-cyan-900 px-2 py-0.5 rounded-full font-bold text-[11px]">
                Tùy chỉnh KTV
              </span>
              <span className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-300 text-gray-700 px-2 py-0.5 rounded-full font-medium text-[11px]">
                Mặc định hệ thống
              </span>
            </div>
            <div className="text-[11px] text-gray-500">
              * Thay đổi đơn giá ở đây sẽ ngay lập tức được áp dụng khi tính toán thù lao thợ.
            </div>
          </div>

          {/* Rate Matrix Table */}
          {ratesLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#00A3FF]" />
              <span className="text-gray-400 text-xs font-semibold">Đang tải danh sách đơn giá KTV...</span>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[calc(100vh-250px)] overflow-y-auto relative rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-20 shadow-sm">
                  <tr className="bg-[#1B3A6B] text-white text-xs uppercase font-bold tracking-wider">
                    <th className="px-4 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 min-w-[180px]">Kỹ thuật viên</th>
                    <th className="px-4 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 min-w-[140px]">Trạm quản lý</th>
                    <th className="px-3 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 text-center min-w-[120px]">
                      Giao hàng<br/>
                      <span className="text-[10px] font-normal opacity-80">(Chuẩn: {(defaultRates.giaoHang || 20000).toLocaleString('vi-VN')}đ)</span>
                    </th>
                    <th className="px-3 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 text-center min-w-[130px]">
                      Bảo hành<br/>
                      <span className="text-[10px] font-normal opacity-80">(Chuẩn: {(defaultRates.baoHanh || 60000).toLocaleString('vi-VN')}đ)</span>
                    </th>
                    <th className="px-3 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 text-center min-w-[130px]">
                      Sửa chữa<br/>
                      <span className="text-[10px] font-normal opacity-80">(Chuẩn: {(defaultRates.suaChua || 60000).toLocaleString('vi-VN')}đ)</span>
                    </th>
                    <th className="px-3 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 text-center min-w-[120px]">
                      Thay lọc<br/>
                      <span className="text-[10px] font-normal opacity-80">(Chuẩn: {(defaultRates.thayLoc || 40000).toLocaleString('vi-VN')}đ)</span>
                    </th>
                    <th className="px-3 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 text-center min-w-[120px]">
                      Lắp đặt<br/>
                      <span className="text-[10px] font-normal opacity-80">(Chuẩn: {(defaultRates.lapDat || 100000).toLocaleString('vi-VN')}đ)</span>
                    </th>
                    <th className="px-3 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 text-center min-w-[130px]">
                      Giao + Lắp<br/>
                      <span className="text-[10px] font-normal opacity-80">(Chuẩn: {(defaultRates.giaoHangLapDat || 120000).toLocaleString('vi-VN')}đ)</span>
                    </th>
                    <th className="px-3 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 text-center min-w-[160px]">
                      Di chuyển (Thông thường)<br/>
                      <span className="text-[10px] font-normal opacity-80">(Chuẩn: 3.000đ/km &gt;20km)</span>
                    </th>
                    <th className="px-3 py-3 bg-indigo-950 sticky top-0 z-20 border-b border-indigo-900 text-center min-w-[170px]">
                      Di chuyển (Thay lọc & Sửa chữa)<br/>
                      <span className="text-[10px] font-normal opacity-80">(Chuẩn: 3.000đ/km &gt;50km)</span>
                    </th>
                    <th className="px-3 py-3 bg-[#1B3A6B] sticky top-0 z-20 border-b border-blue-900 text-center min-w-[100px]">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {rateMatrix
                    .filter(ktv => {
                      const matchKtv = selectedKtvsFilter.length === 0 || selectedKtvsFilter.includes(ktv.userId);

                      const kMain = ktv.mainStationName && ktv.mainStationName !== 'Không có' ? ktv.mainStationName : 'Trực thuộc Truliva';
                      const kTech = ktv.stationName && ktv.stationName !== 'Không có' ? ktv.stationName : 'Khác';
                      const kKey = `${kMain}::${kTech}`;

                      const matchStation = selectedStationsFilter.length === 0 || 
                        selectedStationsFilter.includes(kKey) || 
                        selectedStationsFilter.includes(ktv.stationName);

                      const q = searchQuery.trim().toLowerCase();
                      const matchQuery = !q || (
                        ktv.fullName.toLowerCase().includes(q) ||
                        ktv.username.toLowerCase().includes(q) ||
                        ktv.phoneNumber.includes(q) ||
                        (ktv.stationName && ktv.stationName.toLowerCase().includes(q)) ||
                        (ktv.mainStationName && ktv.mainStationName.toLowerCase().includes(q))
                      );

                      return matchKtv && matchStation && matchQuery;
                    })
                    .map((ktv) => {
                      const userEdited = editedRates[ktv.userId] || {};
                      
                      const renderCell = (workType: string, defaultVal: number) => {
                        const currentVal = userEdited[workType] !== undefined ? userEdited[workType] : defaultVal;
                        const isModified = currentVal !== defaultVal;

                        return (
                          <div className="flex flex-col items-center gap-1">
                            <input
                              type="text"
                              value={currentVal === 0 ? '' : currentVal.toLocaleString('vi-VN')}
                              onChange={(e) => handleRateCellChange(ktv.userId, workType, e.target.value)}
                              className={`w-28 text-right px-2.5 py-1.5 rounded-lg border text-xs font-bold transition focus:outline-none focus:ring-2 ${
                                isModified
                                  ? 'bg-cyan-50 border-cyan-400 text-cyan-900 focus:ring-cyan-500 font-extrabold shadow-sm'
                                  : 'bg-gray-50 border-gray-200 text-gray-800 focus:ring-blue-500'
                              }`}
                            />
                            {isModified ? (
                              <span className="text-[9px] font-extrabold text-cyan-700 bg-cyan-100 px-1.5 py-0.2 rounded">Tùy chỉnh</span>
                            ) : (
                              <span className="text-[9px] font-medium text-gray-400">Chuẩn</span>
                            )}
                          </div>
                        );
                      };

                      const renderTravelCell = (thresholdKey: 'freeKmThreshold' | 'freeKmThresholdTLSC' = 'freeKmThreshold', defaultThresh: number = 20) => {
                        const defaultKmRate = getRateVal(ktv.rates?.kmRate, defaultRates.kmRate || 3000);
                        const defaultThreshold = getRateVal(ktv.rates?.[thresholdKey], defaultRates[thresholdKey] || defaultThresh);

                        const currentKmRate = userEdited['kmRate'] !== undefined ? userEdited['kmRate'] : defaultKmRate;
                        const currentThreshold = userEdited[thresholdKey] !== undefined ? userEdited[thresholdKey] : defaultThreshold;

                        const isKmRateModified = currentKmRate !== defaultKmRate;
                        const isThresholdModified = currentThreshold !== defaultThreshold;
                        const isModified = isKmRateModified || isThresholdModified;

                        return (
                          <div className="flex flex-col items-center gap-1 min-w-[140px]">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={currentKmRate === 0 ? '' : currentKmRate.toLocaleString('vi-VN')}
                                onChange={(e) => handleRateCellChange(ktv.userId, 'kmRate', e.target.value)}
                                placeholder="3.000"
                                className={`w-20 text-right px-2 py-1 rounded-lg border text-xs font-bold transition focus:outline-none focus:ring-2 ${
                                  isKmRateModified
                                    ? 'bg-cyan-50 border-cyan-400 text-cyan-900 font-extrabold shadow-sm'
                                    : 'bg-gray-50 border-gray-200 text-gray-800 focus:ring-blue-500'
                                }`}
                                title="Đơn giá phụ cấp di chuyển (VND/km)"
                              />
                              <span className="text-[10px] text-gray-500 font-medium">đ/km</span>
                            </div>

                            <div className="flex items-center gap-1 text-[11px] text-gray-600">
                              <span className="text-[10px] text-gray-400">Từ</span>
                              <input
                                type="number"
                                value={currentThreshold}
                                onChange={(e) => handleRateCellChange(ktv.userId, thresholdKey, e.target.value)}
                                placeholder={String(defaultThresh)}
                                className={`w-12 text-center px-1 py-0.5 rounded border text-xs font-bold transition focus:outline-none focus:ring-2 ${
                                  isThresholdModified
                                    ? 'bg-cyan-50 border-cyan-400 text-cyan-900 font-extrabold shadow-sm'
                                    : 'bg-gray-50 border-gray-200 text-gray-800 focus:ring-blue-500'
                                }`}
                                title="Ngưỡng km bắt đầu tính phụ cấp di chuyển"
                              />
                              <span className="text-[10px] text-gray-400">km</span>
                            </div>

                            {isModified ? (
                              <span className="text-[9px] font-extrabold text-cyan-700 bg-cyan-100 px-1.5 py-0.2 rounded">Tùy chỉnh</span>
                            ) : (
                              <span className="text-[9px] font-medium text-gray-400">Chuẩn</span>
                            )}
                          </div>
                        );
                      };

                      return (
                        <tr key={ktv.userId} className="hover:bg-blue-50/30 transition">
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            <div className="font-bold text-gray-900">{ktv.fullName}</div>
                            <div className="text-[11px] text-gray-400 font-normal">{ktv.phoneNumber || ktv.username}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 font-medium">
                            <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md text-xs">
                              <MapPin className="h-3 w-3 text-gray-400" />
                              {ktv.stationName || 'Chưa gán trạm'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {renderCell('giaoHang', defaultRates.giaoHang || 20000)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {renderCell('baoHanh', defaultRates.baoHanh || 60000)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {renderCell('suaChua', defaultRates.suaChua || 60000)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {renderCell('thayLoc', defaultRates.thayLoc || 40000)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {renderCell('lapDat', defaultRates.lapDat || 100000)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {renderCell('giaoHangLapDat', defaultRates.giaoHangLapDat || 120000)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {renderTravelCell('freeKmThreshold', 20)}
                          </td>
                          <td className="px-3 py-3 text-center bg-indigo-50/20">
                            {renderTravelCell('freeKmThresholdTLSC', 50)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => handleResetKtvRates(ktv.userId)}
                              className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer mx-auto"
                              title="Khôi phục đơn giá chuẩn cho KTV này"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Khôi phục
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
                <div className="overflow-x-auto max-h-[55vh] overflow-y-auto relative border border-gray-100 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-20 shadow-sm">
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-700 font-bold">
                        <th className="px-4 py-3 text-center w-12 bg-gray-50 sticky top-0 z-20">STT</th>
                        <th className="px-4 py-3 w-28 bg-gray-50 sticky top-0 z-20">Mã ca</th>
                        <th className="px-4 py-3 bg-gray-50 sticky top-0 z-20">Khách hàng</th>
                        <th className="px-4 py-3 w-32 bg-gray-50 sticky top-0 z-20">Loại công việc</th>
                        <th className="px-4 py-3 min-w-[130px] bg-gray-50 sticky top-0 z-20">Ghi chú (Sale)</th>
                        <th className="px-4 py-3 min-w-[150px] bg-gray-50 sticky top-0 z-20">Ghi chú KTV</th>
                        <th className="px-4 py-3 text-center w-24 bg-gray-50 sticky top-0 z-20">Ngày cuối tuần</th>
                        <th className="px-4 py-3 text-right w-32 bg-gray-50 sticky top-0 z-20">Đơn giá ca (VND)</th>
                        <th className="px-4 py-3 w-28 text-center bg-gray-50 sticky top-0 z-20">Quãng đường</th>
                        <th className="px-4 py-3 text-right w-32 bg-gray-50 sticky top-0 z-20">Phụ cấp km (VND)</th>
                        <th className="px-4 py-3 text-right w-28 bg-gray-50 sticky top-0 z-20">Phí khác (VND)</th>
                        <th className="px-4 py-3 text-right w-32 font-bold text-gray-800 bg-gray-50 sticky top-0 z-20">Tổng cộng (VND)</th>
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
                              
                              {/* Ghi chú Sale */}
                              <td className="px-4 py-3 text-gray-500 text-[11px]">
                                <span className="truncate max-w-[130px] block" title={c.orderNote || ''}>
                                  {c.orderNote || '-'}
                                </span>
                              </td>

                              {/* Ghi chú KTV báo cáo */}
                              <td className="px-4 py-3 text-gray-800 text-[11px] font-medium min-w-[150px]">
                                {c.reportNote || '-'}
                              </td>

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
                              <td className="px-4 py-3 text-right text-purple-800 font-semibold">
                                {c.otherCost && c.otherCost > 0 ? c.otherCost.toLocaleString('vi-VN') : '-'}
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
