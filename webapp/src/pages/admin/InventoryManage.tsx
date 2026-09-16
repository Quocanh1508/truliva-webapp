import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { fetchApi } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { 
  Warehouse, RefreshCw, Search, AlertTriangle, 
  ArrowDownLeft, ArrowUpRight, PackageCheck, Package, 
  Calendar, ChevronDown, ImageOff, X,
  FileSpreadsheet, CheckCircle2, Check
} from 'lucide-react';
import { matchesSearchTerm } from '../../utils/text';

interface WarehouseData {
  id: string;
  name: string;
  address?: string;
  fullAddress?: string;
}

interface AnalyticsSummary {
  begin_inventory: number;
  begin_inventory_value: number;
  total_import: number;
  total_import_value: number;
  purchase_import: number;
  transfer_import: number;
  return_import: number;
  stocktaking_import: number;
  total_export: number;
  total_export_value: number;
  sell_export: number;
  transfer_export: number;
  purchase_export: number;
  stocktaking_export: number;
  end_inventory: number;
  end_inventory_value: number;
}

interface AnalyticsProductItem {
  id: string;
  pancakeProductId: string;
  name: string;
  sku: string;
  category: string;
  imageUrl: string | null;
  sellingPrice: number;
  costPrice: number;
  begin_inventory: number;
  begin_inventory_value: number;
  total_import: number;
  total_import_value: number;
  purchase_import: number;
  transfer_import: number;
  return_import: number;
  stocktaking_import: number;
  total_export: number;
  total_export_value: number;
  sell_export: number;
  transfer_export: number;
  purchase_export: number;
  stocktaking_export: number;
  end_inventory: number;
  end_inventory_value: number;
}

// Format tiền tệ VNĐ
function formatCurrency(amount: number): string {
  if (!amount && amount !== 0) return '0 đ';
  return amount.toLocaleString('vi-VN') + ' đ';
}

// Format ngày sang chuỗi YYYY-MM-DD theo giờ địa phương (tránh lỗi timezone UTC)
function formatDateToLocalYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Preset ngày
type DatePreset = 'today' | '7days' | 'this_month' | 'last_month' | 'all' | 'custom';

export default function InventoryManage() {
  const { user } = useAuth();
  const isKTV = user?.role === 'KTV';
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [items, setItems] = useState<AnalyticsProductItem[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Bộ lọc Kho (Hỗ trợ chọn nhiều kho)
  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<string[]>([]);
  const [isWarehouseDropdownOpen, setIsWarehouseDropdownOpen] = useState(false);
  const [warehouseSearchTerm, setWarehouseSearchTerm] = useState('');
  const warehouseDropdownRef = useRef<HTMLDivElement>(null);

  // Bộ lọc Danh mục (Hỗ trợ chọn nhiều danh mục)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Bộ lọc Ngày (Mặc định: Hôm nay)
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [startDateStr, setStartDateStr] = useState<string>(() => formatDateToLocalYMD(new Date()));
  const [endDateStr, setEndDateStr] = useState<string>(() => formatDateToLocalYMD(new Date()));

  const [searchTerm, setSearchTerm] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('in_stock');

  // Accordion mở rộng xem chi tiết từng dòng
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (warehouseDropdownRef.current && !warehouseDropdownRef.current.contains(e.target as Node)) {
        setIsWarehouseDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Tính timestamps từ dates
  const { startTime, endTime } = useMemo(() => {
    if (datePreset === 'all') {
      return { startTime: undefined, endTime: undefined };
    }
    if (startDateStr && endDateStr) {
      const start = Math.floor(new Date(`${startDateStr}T00:00:00+07:00`).getTime() / 1000);
      const end = Math.floor(new Date(`${endDateStr}T23:59:59+07:00`).getTime() / 1000);
      return { startTime: start, endTime: end };
    }
    return { startTime: undefined, endTime: undefined };
  }, [datePreset, startDateStr, endDateStr]);

  // Xử lý đổi Preset ngày
  const handleSelectDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      const today = formatDateToLocalYMD(now);
      setStartDateStr(today);
      setEndDateStr(today);
    } else if (preset === '7days') {
      const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      setStartDateStr(formatDateToLocalYMD(sevenDaysAgo));
      setEndDateStr(formatDateToLocalYMD(now));
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDateStr(formatDateToLocalYMD(firstDay));
      setEndDateStr(formatDateToLocalYMD(now));
    } else if (preset === 'last_month') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDateStr(formatDateToLocalYMD(firstDayLastMonth));
      setEndDateStr(formatDateToLocalYMD(lastDayLastMonth));
    }
  };

  // Tải dữ liệu từ Backend
  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedWarehouseIds.length > 0) {
        params.append('warehouse_ids', selectedWarehouseIds.join(','));
      }
      if (startTime) {
        params.append('start_time', String(startTime));
        params.append('start_date', String(startTime));
      }
      if (endTime) {
        params.append('end_time', String(endTime));
        params.append('end_date', String(endTime));
      }

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const res = await fetchApi(`/inventory/analytics${queryStr}`);

      setWarehouses(res.warehouses || []);
      setItems(res.items || []);
      setSummary(res.summary || null);
      setCategories(res.categories || []);
    } catch (err: any) {
      setError(err.message || 'Lỗi tải báo cáo xuất nhập kho');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedWarehouseIds, startTime, endTime]);

  // Xử lý Xuất Excel
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedWarehouseIds.length > 0) {
        params.append('warehouse_ids', selectedWarehouseIds.join(','));
      }
      if (startTime) {
        params.append('start_time', String(startTime));
        params.append('start_date', String(startTime));
      }
      if (endTime) {
        params.append('end_time', String(endTime));
        params.append('end_date', String(endTime));
      }

      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/inventory/analytics/export${queryStr}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Xuất file thất bại');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bao_Cao_Xuat_Nhap_Ton_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Lỗi xuất file Excel');
    } finally {
      setExporting(false);
    }
  };

  // Toggle chọn Kho
  const toggleWarehouse = (id: string) => {
    if (selectedWarehouseIds.includes(id)) {
      setSelectedWarehouseIds(selectedWarehouseIds.filter(wId => wId !== id));
    } else {
      setSelectedWarehouseIds([...selectedWarehouseIds, id]);
    }
  };

  // Toggle chọn Danh mục
  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  // Danh sách kho sau tìm kiếm trong dropdown
  const filteredWarehousesInDropdown = useMemo(() => {
    if (!warehouseSearchTerm.trim()) return warehouses;
    return warehouses.filter(w => matchesSearchTerm(w.name, warehouseSearchTerm));
  }, [warehouses, warehouseSearchTerm]);

  // Danh sách sản phẩm sau lọc
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Tìm kiếm Tên / SKU
      if (searchTerm.trim()) {
        const matchesName = matchesSearchTerm(item.name, searchTerm);
        const matchesSku = matchesSearchTerm(item.sku, searchTerm);
        if (!matchesName && !matchesSku) return false;
      }

      // Lọc nhiều danh mục
      if (selectedCategories.length > 0 && !selectedCategories.includes(item.category)) {
        return false;
      }

      // Lọc trạng thái tồn
      if (stockStatusFilter === 'in_stock' && item.end_inventory <= 0) {
        return false;
      }
      if (stockStatusFilter === 'out_of_stock' && item.end_inventory > 0) {
        return false;
      }

      return true;
    });
  }, [items, searchTerm, selectedCategories, stockStatusFilter]);

  return (
    <div className="space-y-6 pb-12 animate-fade-in max-w-7xl mx-auto px-2 sm:px-4">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#1B3A6B]/10 text-[#1B3A6B] flex items-center justify-center font-bold">
              <Warehouse size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {isKTV ? 'Báo Cáo Xuất - Nhập - Tồn Kho Xe' : 'Báo Cáo Xuất - Nhập - Tồn Kho'}
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hidden sm:inline-block">
                  Pancake POS
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isKTV
                  ? 'Dữ liệu xuất nhập và số dư kho xe được đồng bộ tự động từ hệ thống Pancake POS'
                  : 'Dữ liệu chuẩn kế toán kho được cập nhật tự động từ hệ thống Pancake POS'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-all active:scale-95 disabled:opacity-60"
            title="Làm mới dữ liệu từ Pancake"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : ''} />
            <span>Làm mới</span>
          </button>

          {!isKTV && (
            <button
              onClick={handleExportExcel}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1B3A6B] hover:bg-[#2A518E] text-white text-xs font-semibold shadow-xs transition-all active:scale-95 disabled:opacity-60"
            >
              <FileSpreadsheet size={15} />
              <span>{exporting ? 'Đang xuất...' : 'Xuất Excel'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ═══ 4 Thẻ KPI Tổng Quan ═══ */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Tồn đầu kỳ */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Tồn đầu kỳ</span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <Warehouse size={16} />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.begin_inventory.toLocaleString('vi-VN')}
              </div>
              {!isKTV && summary.begin_inventory_value > 0 && (
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-medium">
                  Giá trị: <span className="font-semibold text-slate-700">{formatCurrency(summary.begin_inventory_value)}</span>
                </div>
              )}
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-400">
              Số dư chốt tại thời điểm bắt đầu
            </div>
          </div>

          {/* Card 2: Tổng Nhập kho */}
          <div className="bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-4 sm:p-5 border border-emerald-200/70 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-700 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Tổng Nhập Trong Kỳ</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <ArrowDownLeft size={18} />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 tracking-tight">
                {summary.total_import.toLocaleString('vi-VN')}
              </div>
              {!isKTV && summary.total_import_value > 0 && (
                <div className="text-[11px] text-emerald-800 mt-1 flex items-center gap-1 font-medium">
                  Giá trị: <span className="font-semibold text-emerald-900">{formatCurrency(summary.total_import_value)}</span>
                </div>
              )}
            </div>
            {!isKTV ? (
              <div className="mt-3 pt-2.5 border-t border-emerald-100 grid grid-cols-3 gap-1 text-[10px] text-slate-600 font-medium">
                <div>Mua NCC: <span className="font-bold text-emerald-700">{summary.purchase_import}</span></div>
                <div>Chuyển đến: <span className="font-bold text-emerald-700">{summary.transfer_import}</span></div>
                <div>Khách trả: <span className="font-bold text-emerald-700">{summary.return_import}</span></div>
              </div>
            ) : (
              <div className="mt-3 pt-2.5 border-t border-emerald-100 text-[11px] text-emerald-700 font-medium">
                Tổng số lượng hàng nhập vào kho xe
              </div>
            )}
          </div>

          {/* Card 3: Tổng Xuất kho */}
          <div className="bg-gradient-to-br from-white to-rose-50/40 rounded-2xl p-4 sm:p-5 border border-rose-200/70 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-700 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Tổng Xuất Trong Kỳ</span>
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">
                <ArrowUpRight size={18} />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-rose-700 tracking-tight">
                {summary.total_export.toLocaleString('vi-VN')}
              </div>
              {!isKTV && summary.total_export_value > 0 && (
                <div className="text-[11px] text-rose-800 mt-1 flex items-center gap-1 font-medium">
                  Giá trị: <span className="font-semibold text-rose-900">{formatCurrency(summary.total_export_value)}</span>
                </div>
              )}
            </div>
            {!isKTV ? (
              <div className="mt-3 pt-2.5 border-t border-rose-100 grid grid-cols-3 gap-1 text-[10px] text-slate-600 font-medium">
                <div>Xuất bán: <span className="font-bold text-rose-700">{summary.sell_export}</span></div>
                <div>Chuyển đi: <span className="font-bold text-rose-700">{summary.transfer_export}</span></div>
                <div>Trả NCC: <span className="font-bold text-rose-700">{summary.purchase_export}</span></div>
              </div>
            ) : (
              <div className="mt-3 pt-2.5 border-t border-rose-100 text-[11px] text-rose-700 font-medium">
                Tổng số lượng hàng đã lắp / xuất từ kho xe
              </div>
            )}
          </div>

          {/* Card 4: Tồn cuối kỳ */}
          <div className="bg-gradient-to-br from-white to-blue-50/40 rounded-2xl p-4 sm:p-5 border border-blue-200/70 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="flex items-center justify-between text-blue-700 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1B3A6B]">Tồn Cuối Kỳ</span>
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <PackageCheck size={18} />
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#1B3A6B] tracking-tight">
                {summary.end_inventory.toLocaleString('vi-VN')}
              </div>
              {!isKTV && summary.end_inventory_value > 0 && (
                <div className="text-[11px] text-blue-900 mt-1 flex items-center gap-1 font-medium">
                  Giá trị: <span className="font-semibold text-[#1B3A6B]">{formatCurrency(summary.end_inventory_value)}</span>
                </div>
              )}
            </div>
            <div className="mt-3 pt-2.5 border-t border-blue-100 text-[11px] text-slate-500 flex justify-between items-center">
              <span>Đang có sẵn trong kho</span>
              <span className="font-bold text-emerald-600">● Hoạt động</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Thanh Bộ Lọc & Tìm Kiếm ═══ */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        {/* Hàng 1: Multi-Select Kho & Chọn Khoảng thời gian */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Multi-Select Kho hàng */}
          <div className="lg:col-span-5 relative" ref={warehouseDropdownRef}>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Warehouse size={13} className="text-[#1B3A6B]" />
                {isKTV ? 'Kho xe phụ trách' : `Kho hàng (${warehouses.length} kho)`}
              </span>
              {!isKTV && selectedWarehouseIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedWarehouseIds([])}
                  className="text-[10px] text-blue-600 hover:underline normal-case font-semibold"
                >
                  Xóa lọc kho ({selectedWarehouseIds.length})
                </button>
              )}
            </label>

            {isKTV ? (
              <div className="w-full px-3.5 py-2.5 rounded-xl border border-blue-200 bg-blue-50/60 text-sm text-[#1B3A6B] font-semibold flex items-center gap-2">
                <Warehouse size={16} className="text-blue-600 shrink-0" />
                <span className="truncate">
                  {warehouses[0]?.name || 'Kho xe KTV'}
                </span>
                <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  Cố định
                </span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsWarehouseDropdownOpen(!isWarehouseDropdownOpen)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 font-medium flex items-center justify-between hover:border-blue-400 transition-all text-left"
                >
                  <span className="truncate">
                    {selectedWarehouseIds.length === 0
                      ? `🏢 Tất cả kho hàng (${warehouses.length} kho)`
                      : `📦 Đã chọn ${selectedWarehouseIds.length} kho`}
                  </span>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${isWarehouseDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown menu chọn nhiều kho */}
                {isWarehouseDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 max-h-72 flex flex-col">
                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tìm tên kho..."
                        value={warehouseSearchTerm}
                        onChange={(e) => setWarehouseSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                      <button
                        type="button"
                        onClick={() => setSelectedWarehouseIds([])}
                        className="hover:text-blue-600 font-bold text-blue-600"
                      >
                        Tất cả các kho
                      </button>
                      {selectedWarehouseIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedWarehouseIds([])}
                          className="hover:text-rose-600 text-rose-500"
                        >
                          Bỏ lọc ({selectedWarehouseIds.length})
                        </button>
                      )}
                    </div>

                    <div className="overflow-y-auto flex-1 divide-y divide-slate-50 mt-1">
                      {filteredWarehousesInDropdown.map(w => {
                        const isSelected = selectedWarehouseIds.includes(w.id);
                        return (
                          <div
                            key={w.id}
                            onClick={() => toggleWarehouse(w.id)}
                            className={`flex items-center gap-2 px-2.5 py-2 cursor-pointer rounded-lg text-xs transition-colors select-none ${
                              isSelected ? 'bg-blue-50/70 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {isSelected && <Check size={11} strokeWidth={3} />}
                            </div>
                            <span className="truncate">{w.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Chọn Khoảng thời gian */}
          <div className="lg:col-span-7">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar size={13} className="text-[#1B3A6B]" />
              Khoảng thời gian báo cáo
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'today', label: 'Hôm nay' },
                { id: '7days', label: '7 ngày' },
                { id: 'this_month', label: 'Tháng này' },
                { id: 'last_month', label: 'Tháng trước' },
                { id: 'all', label: 'Toàn bộ' },
                { id: 'custom', label: 'Tùy chọn' },
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectDatePreset(p.id as DatePreset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    datePreset === p.id
                      ? 'bg-[#1B3A6B] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}

              {/* Date pickers */}
              <div className="flex items-center gap-1.5 ml-auto text-xs">
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => {
                    setStartDateStr(e.target.value);
                    setDatePreset('custom');
                  }}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-slate-400 font-bold">-</span>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => {
                    setEndDateStr(e.target.value);
                    setDatePreset('custom');
                  }}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Hàng 2: Tìm kiếm, Multi-Select Danh mục & Lọc trạng thái tồn */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 border-t border-slate-100">
          {/* Ô tìm kiếm */}
          <div className="sm:col-span-6 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo tên sản phẩm hoặc mã SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Multi-Select Danh mục */}
          <div className="sm:col-span-3 relative" ref={categoryDropdownRef}>
            <button
              type="button"
              onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 font-medium flex items-center justify-between hover:border-blue-400 transition-all text-left"
            >
              <span className="truncate">
                {selectedCategories.length === 0
                  ? `📂 Tất cả danh mục (${categories.length})`
                  : `📁 Đã chọn ${selectedCategories.length} danh mục`}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown menu chọn nhiều danh mục */}
            {isCategoryDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 max-h-60 flex flex-col">
                <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  <button
                    type="button"
                    onClick={() => setSelectedCategories([])}
                    className="hover:text-blue-600 font-bold text-blue-600"
                  >
                    Tất cả danh mục
                  </button>
                  {selectedCategories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategories([])}
                      className="hover:text-rose-600 text-rose-500"
                    >
                      Bỏ chọn ({selectedCategories.length})
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1 divide-y divide-slate-50 mt-1">
                  {categories.map(cat => {
                    const isSelected = selectedCategories.includes(cat);
                    return (
                      <div
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-lg text-xs transition-colors select-none ${
                          isSelected ? 'bg-blue-50/70 text-blue-900 font-semibold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {isSelected && <Check size={10} strokeWidth={3} />}
                        </div>
                        <span className="truncate">{cat}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Lọc trạng thái tồn */}
          <div className="sm:col-span-3 flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'in_stock', label: 'Còn tồn' },
              { id: 'out_of_stock', label: 'Hết hàng' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStockStatusFilter(tab.id as any)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all text-center ${
                  stockStatusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Bảng Dữ Liệu Xuất - Nhập - Tồn ═══ */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-800">
              Danh Sách Chi Tiết ({filteredItems.length} sản phẩm)
            </span>
            {filteredItems.length !== items.length && (
              <span className="text-xs text-slate-400">/ tổng số {items.length}</span>
            )}
          </div>
          {!isKTV && (
            <span className="text-xs text-slate-400 italic hidden sm:inline">
              * Bấm vào dòng sản phẩm để xem chi tiết từng nguồn nhập & xuất
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw size={28} className="animate-spin text-blue-600" />
            <span className="text-sm font-medium">Đang tải số liệu xuất nhập kho từ Pancake POS...</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center text-rose-500 space-y-2">
            <AlertTriangle size={32} className="mx-auto text-rose-500" />
            <div className="font-bold text-base">{error}</div>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors"
            >
              Thử lại
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <Package size={36} className="mx-auto text-slate-300" />
            <div className="text-sm font-medium">Không tìm thấy sản phẩm nào phù hợp với bộ lọc.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3 w-12 text-center">STT</th>
                  <th className="py-3 px-4 min-w-[280px]">Sản phẩm</th>
                  <th className="py-3 px-3 text-center min-w-[90px]">Tồn đầu</th>
                  <th className="py-3 px-3 text-center min-w-[120px] bg-emerald-50/60 text-emerald-800">
                    Tổng Nhập
                  </th>
                  <th className="py-3 px-3 text-center min-w-[120px] bg-rose-50/60 text-rose-800">
                    Tổng Xuất
                  </th>
                  <th className="py-3 px-3 text-center min-w-[100px] bg-blue-50/60 text-blue-900">
                    Tồn cuối
                  </th>
                  <th className="py-3 px-3 text-center min-w-[110px]">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredItems.map((item, idx) => {
                  const isExpanded = expandedItemId === item.id;
                  const isOutOfStock = item.end_inventory <= 0;

                  return (
                    <Fragment key={item.id}>
                      {/* Dòng chính */}
                      <tr
                        onClick={() => !isKTV && setExpandedItemId(isExpanded ? null : item.id)}
                        className={`transition-colors ${
                          !isKTV ? 'hover:bg-slate-50/80 cursor-pointer' : ''
                        } ${isExpanded && !isKTV ? 'bg-blue-50/30' : ''}`}
                      >
                        {/* 1. STT */}
                        <td className="py-3 px-3 text-center text-slate-400 font-medium">
                          {idx + 1}
                        </td>

                        {/* 2. Sản phẩm */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <ImageOff size={16} className="text-slate-300" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 truncate leading-snug" title={item.name}>
                                {item.name}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {item.sku && (
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-pink-50 text-pink-700 border border-pink-200">
                                    {item.sku}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 truncate">
                                  {item.category}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. Tồn đầu */}
                        <td className="py-3 px-3 text-center font-semibold text-slate-700">
                          {item.begin_inventory.toLocaleString('vi-VN')}
                        </td>

                        {/* 4. Tổng Nhập */}
                        <td className="py-3 px-3 text-center bg-emerald-50/20">
                          <div className="font-bold text-emerald-700 text-sm">
                            {item.total_import.toLocaleString('vi-VN')}
                          </div>
                          {!isKTV && (item.purchase_import > 0 || item.transfer_import > 0 || item.return_import > 0) && (
                            <div className="text-[10px] text-emerald-600/90 mt-0.5 space-x-1 font-medium">
                              {item.purchase_import > 0 && <span>NCC:{item.purchase_import}</span>}
                              {item.transfer_import > 0 && <span>Kho:{item.transfer_import}</span>}
                              {item.return_import > 0 && <span>Trả:{item.return_import}</span>}
                            </div>
                          )}
                        </td>

                        {/* 5. Tổng Xuất (HIỂN THỊ SỐ DƯƠNG CHUẨN, KHÔNG DẤU TRỪ) */}
                        <td className="py-3 px-3 text-center bg-rose-50/20">
                          <div className="font-bold text-rose-700 text-sm">
                            {item.total_export.toLocaleString('vi-VN')}
                          </div>
                          {!isKTV && (item.sell_export > 0 || item.transfer_export > 0 || item.purchase_export > 0) && (
                            <div className="text-[10px] text-rose-600/90 mt-0.5 space-x-1 font-medium">
                              {item.sell_export > 0 && <span>Bán:{item.sell_export}</span>}
                              {item.transfer_export > 0 && <span>Kho:{item.transfer_export}</span>}
                              {item.purchase_export > 0 && <span>NCC:{item.purchase_export}</span>}
                            </div>
                          )}
                        </td>

                        {/* 6. Tồn cuối */}
                        <td className="py-3 px-3 text-center bg-blue-50/20">
                          <div className={`font-extrabold text-sm ${
                            isOutOfStock ? 'text-rose-600' : 'text-[#1B3A6B]'
                          }`}>
                            {item.end_inventory.toLocaleString('vi-VN')}
                          </div>
                          {!isKTV && item.sellingPrice > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                              {formatCurrency(item.sellingPrice)}
                            </div>
                          )}
                        </td>

                        {/* 7. Trạng thái badge */}
                        <td className="py-3 px-3 text-center">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertTriangle size={11} /> Hết hàng
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 size={11} /> Còn hàng
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Dòng Accordion mở rộng chi tiết khi bấm vào (Chỉ Quản lý / Admin) */}
                      {isExpanded && !isKTV && (
                        <tr className="bg-slate-50/90 border-y border-slate-200">
                          <td colSpan={7} className="py-3.5 px-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                              {/* Cột Chi tiết Nhập */}
                              <div className="space-y-1.5 text-xs">
                                <div className="font-bold text-emerald-700 flex items-center gap-1 border-b border-emerald-100 pb-1">
                                  <ArrowDownLeft size={14} /> Chi tiết nguồn Nhập kho
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Mua từ Nhà cung cấp:</span>
                                  <span className="font-bold text-emerald-800">{item.purchase_import}</span>
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Nhập chuyển từ kho khác:</span>
                                  <span className="font-bold text-emerald-800">{item.transfer_import}</span>
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Khách đổi / trả hàng:</span>
                                  <span className="font-bold text-emerald-800">{item.return_import}</span>
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Nhập kiểm kê cân bằng:</span>
                                  <span className="font-bold text-emerald-800">{item.stocktaking_import}</span>
                                </div>
                              </div>

                              {/* Cột Chi tiết Xuất */}
                              <div className="space-y-1.5 text-xs">
                                <div className="font-bold text-rose-700 flex items-center gap-1 border-b border-rose-100 pb-1">
                                  <ArrowUpRight size={14} /> Chi tiết nguồn Xuất kho
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Xuất bán (Đơn hàng / KTV dùng):</span>
                                  <span className="font-bold text-rose-800">{item.sell_export}</span>
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Xuất chuyển đi kho khác:</span>
                                  <span className="font-bold text-rose-800">{item.transfer_export}</span>
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Xuất trả lại NCC:</span>
                                  <span className="font-bold text-rose-800">{item.purchase_export}</span>
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Xuất kiểm kê cân bằng:</span>
                                  <span className="font-bold text-rose-800">{item.stocktaking_export}</span>
                                </div>
                              </div>

                              {/* Cột Giá trị tiền & Giá vốn */}
                              <div className="space-y-1.5 text-xs">
                                <div className="font-bold text-[#1B3A6B] flex items-center gap-1 border-b border-blue-100 pb-1">
                                  <Warehouse size={14} /> Định giá tồn kho
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Giá bán niêm yết:</span>
                                  <span className="font-semibold text-emerald-600">{formatCurrency(item.sellingPrice)}</span>
                                </div>
                                <div className="flex justify-between py-1 text-slate-600">
                                  <span>Giá vốn nhập gần nhất:</span>
                                  <span className="font-semibold text-slate-700">{formatCurrency(item.costPrice)}</span>
                                </div>
                                <div className="flex justify-between py-1 text-slate-600 border-t border-slate-100 pt-1 font-bold text-[#1B3A6B]">
                                  <span>Tổng giá trị tồn cuối:</span>
                                  <span>{formatCurrency(item.end_inventory_value)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              {summary && (
                <tfoot className="bg-slate-100/90 font-bold text-xs text-slate-800 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={2} className="py-3 px-4 text-center font-extrabold text-[#1B3A6B]">
                      TỔNG ({filteredItems.length} sản phẩm)
                    </td>
                    <td className="py-3 px-3 text-center text-slate-800">
                      <div>{summary.begin_inventory.toLocaleString('vi-VN')}</div>
                      {!isKTV && summary.begin_inventory_value > 0 && (
                        <div className="text-[10px] text-slate-500 font-normal">
                          {formatCurrency(summary.begin_inventory_value)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center bg-emerald-100/40 text-emerald-800">
                      <div>{summary.total_import.toLocaleString('vi-VN')}</div>
                      {!isKTV && summary.total_import_value > 0 && (
                        <div className="text-[10px] text-emerald-700 font-normal">
                          {formatCurrency(summary.total_import_value)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center bg-rose-100/40 text-rose-800">
                      <div>{summary.total_export.toLocaleString('vi-VN')}</div>
                      {!isKTV && summary.total_export_value > 0 && (
                        <div className="text-[10px] text-rose-700 font-normal">
                          {formatCurrency(summary.total_export_value)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center bg-blue-100/40 text-[#1B3A6B]">
                      <div>{summary.end_inventory.toLocaleString('vi-VN')}</div>
                      {!isKTV && summary.end_inventory_value > 0 && (
                        <div className="text-[10px] text-blue-800 font-normal">
                          {formatCurrency(summary.end_inventory_value)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-400 font-normal">
                      -
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
