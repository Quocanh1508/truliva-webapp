import { useState, useEffect } from 'react';
import { fetchApi } from '../../api/client';
import { Warehouse, RefreshCw, Search, Filter, AlertTriangle, CheckSquare, Square, Info } from 'lucide-react';

interface WarehouseData {
  id: string;
  name: string;
  address?: string;
  fullAddress?: string;
  phone?: string;
}

interface ProductStock {
  id: string;
  pancakeProductId: string | null;
  sku: string | null;
  name: string;
  category: string | null;
  imageUrl: string | null;
  costPrice: number;
  sellingPrice: number;
  availableStock: number;
  totalStock: number;
  isActive: boolean;
  stocks: Record<string, number>;
  actualStocks: Record<string, number>;
}

export default function InventoryManage() {
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([]);
  const [products, setProducts] = useState<ProductStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters & Settings
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(2); // Ngưỡng mặc định bằng 2 theo yêu cầu
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(false);

  // UI Dropdowns
  const [showWarehouseFilterDropdown, setShowWarehouseFilterDropdown] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchApi('/inventory/stock');
      setWarehouses(data.warehouses || []);
      setProducts(data.products || []);
      
      // Mặc định tích chọn tất cả các kho khi tải trang lần đầu
      if (selectedWarehouses.length === 0 && data.warehouses) {
        setSelectedWarehouses(data.warehouses.map((w: any) => w.id));
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải thông tin kho hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncPancake = async () => {
    setSyncing(true);
    setError('');
    setSuccessMsg('');
    try {
      await fetchApi('/inventory/sync', { method: 'POST' });
      setSuccessMsg('Đang kích hoạt tiến trình đồng bộ sản phẩm từ Pancake POS trong nền. Vui lòng đợi 5-10 giây rồi tải lại trang.');
      setTimeout(() => {
        loadData();
      }, 5000);
    } catch (err: any) {
      setError(err.message || 'Lỗi đồng bộ sản phẩm');
    } finally {
      setSyncing(false);
    }
  };

  // Lấy danh sách Categories duy nhất để lọc
  const categories = ['ALL', ...Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[]];

  // Toggle chọn/hủy chọn kho hàng trong bộ lọc
  const toggleWarehouseSelection = (id: string) => {
    if (selectedWarehouses.includes(id)) {
      setSelectedWarehouses(selectedWarehouses.filter(wId => wId !== id));
    } else {
      setSelectedWarehouses([...selectedWarehouses, id]);
    }
  };

  const selectAllWarehouses = () => {
    setSelectedWarehouses(warehouses.map(w => w.id));
  };

  const clearAllWarehouses = () => {
    setSelectedWarehouses([]);
  };

  // Filter Products
  const filteredProducts = products.filter(p => {
    // 1. Lọc theo tìm kiếm Tên / SKU
    const matchSearch = searchTerm.trim() === '' || 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));

    // 2. Lọc theo Danh mục
    const matchCategory = selectedCategory === 'ALL' || p.category === selectedCategory;

    // 3. Lọc theo trạng thái Sắp hết hàng (tồn tại ít nhất 1 kho đang xem có tồn kho <= ngưỡng)
    let matchLowStock = true;
    if (showOnlyLowStock) {
      matchLowStock = selectedWarehouses.some(wId => {
        const qty = p.stocks[wId] ?? 0;
        return qty <= lowStockThreshold;
      });
    }

    return matchSearch && matchCategory && matchLowStock;
  });

  return (
    <div className="container-fluid p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Warehouse className="text-[#1B3A6B]" size={28} />
            Quản lý Kho & Tồn kho sản phẩm
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Tổng hợp lượng hàng tồn kho thực tế của KTV và các trạm dịch vụ từ Pancake POS.
          </p>
        </div>
        
        <button
          onClick={handleSyncPancake}
          disabled={syncing || loading}
          className="btn btn-primary flex items-center justify-center gap-2 px-4 py-2 bg-[#1B3A6B] hover:bg-[#152e55] text-white rounded-lg transition-colors font-semibold"
        >
          <RefreshCw className={syncing ? 'animate-spin' : ''} size={18} />
          {syncing ? 'Đang đồng bộ...' : 'Đồng bộ từ Pancake'}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3">
          <AlertTriangle className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-3">
          <Info className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          
          {/* Ô Tìm kiếm sản phẩm */}
          <div className="md:col-span-4 form-group mb-0">
            <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Search size={14} /> Tìm sản phẩm
            </label>
            <input
              type="text"
              className="form-input text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nhập tên sản phẩm hoặc mã SKU..."
            />
          </div>

          {/* Ô Lọc danh mục */}
          <div className="md:col-span-2 form-group mb-0">
            <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
              <Filter size={14} /> Danh mục
            </label>
            <select
              className="form-input text-sm"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'ALL' ? 'Tất cả danh mục' : cat}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown Bộ lọc Kho hàng */}
          <div className="md:col-span-3 form-group mb-0 relative">
            <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
              <span>Hiển thị kho ({selectedWarehouses.length}/{warehouses.length})</span>
            </label>
            <button
              onClick={() => setShowWarehouseFilterDropdown(!showWarehouseFilterDropdown)}
              className="w-full text-left form-input text-sm flex justify-between items-center bg-white border border-slate-200 rounded-lg p-2.5"
            >
              <span className="truncate">
                {selectedWarehouses.length === warehouses.length 
                  ? 'Tất cả kho hàng' 
                  : selectedWarehouses.length === 0 
                    ? 'Không chọn kho nào' 
                    : `${selectedWarehouses.length} kho được chọn`}
              </span>
              <span className="text-slate-400">▼</span>
            </button>

            {showWarehouseFilterDropdown && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-72 overflow-y-auto p-3 flex flex-col gap-2">
                <div className="flex justify-between border-b border-slate-100 pb-2 mb-1">
                  <button onClick={selectAllWarehouses} className="text-xs font-semibold text-[#1B3A6B] hover:underline">Chọn tất cả</button>
                  <button onClick={clearAllWarehouses} className="text-xs font-semibold text-slate-500 hover:underline">Hủy chọn</button>
                </div>
                {warehouses.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 text-sm text-slate-700 hover:bg-slate-50 p-1.5 rounded cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedWarehouses.includes(w.id)}
                      onChange={() => toggleWarehouseSelection(w.id)}
                      className="rounded border-slate-300 text-[#1B3A6B] focus:ring-[#1B3A6B]"
                    />
                    <span className="truncate" title={w.name}>{w.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Ô Nhập ngưỡng cảnh báo sắp hết hàng */}
          <div className="md:col-span-3 form-group mb-0">
            <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
              <span className="text-red-600 flex items-center gap-1 font-bold">
                <AlertTriangle size={14} /> Ngưỡng báo hết hàng
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                className="form-input text-sm text-center font-bold"
                style={{ width: '80px' }}
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(Math.max(0, parseInt(e.target.value) || 0))}
              />
              <button
                onClick={() => setShowOnlyLowStock(!showOnlyLowStock)}
                className={`flex-1 text-xs font-bold rounded-lg border px-3 flex items-center justify-center gap-1 transition-all ${
                  showOnlyLowStock 
                    ? 'bg-red-50 border-red-300 text-red-700' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {showOnlyLowStock ? <CheckSquare size={16} /> : <Square size={16} />}
                Chỉ hiện SP hết hàng
              </button>
            </div>
          </div>
        </div>

        {/* Legend chú thích */}
        <div className="text-xs text-slate-500 flex flex-col gap-2 mt-1 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold text-slate-700">Trạng thái:</span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-3.5 bg-red-100 border border-red-200 rounded"></span>
              Có thể bán ≤ {lowStockThreshold} sản phẩm (Sắp hết hàng)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-3.5 bg-white border border-slate-200 rounded"></span>
              Còn hàng (&gt; {lowStockThreshold} sản phẩm)
            </span>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-x-6 gap-y-1 text-[11px] text-slate-400 mt-1 border-t border-slate-50 pt-2">
            <span>
              <strong className="text-slate-600">Có thể bán (Số bên trên)</strong>: Số lượng hàng khả dụng để bán/tạo đơn (đã trừ đi lượng giữ hàng trong đơn chưa giao).
            </span>
            <span>
              <strong className="text-slate-600">Tồn thực tế (Số bên dưới, màu nhạt)</strong>: Số lượng hàng vật lý thực tế trong kho (chỉ bị trừ khi đơn giao thành công).
            </span>
          </div>
        </div>
      </div>

      {/* Main Stock Matrix Grid */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16">
            <span className="spinner mb-3" style={{ borderColor: 'rgba(27, 58, 107, 0.2)', borderTopColor: '#1B3A6B' }}></span>
            <span className="text-slate-500 text-sm font-semibold">Đang tải bảng tồn kho...</span>
          </div>
                  <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="px-6 py-4 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)]" style={{ minWidth: '240px' }}>
                    Sản phẩm
                  </th>
                  <th className="px-4 py-4 text-center border-r border-slate-200" style={{ width: '120px' }}>SKU / Danh mục</th>
                  
                  {/* Cột hiển thị của từng kho hàng được chọn */}
                  {warehouses.filter(w => selectedWarehouses.includes(w.id)).map((w) => (
                    <th key={w.id} className="px-4 py-4 text-center border-r border-slate-100" style={{ minWidth: '130px', maxWidth: '200px' }}>
                      <div className="truncate font-semibold text-slate-700" title={w.name}>{w.name}</div>
                      {w.phone && <div className="text-[10px] text-slate-400 normal-case font-normal mt-0.5">{w.phone}</div>}
                    </th>
                  ))}
                  
                  <th className="px-4 py-4 text-center bg-slate-100 font-bold text-slate-800 border-l border-slate-200" style={{ width: '120px' }}>
                    Tổng có thể bán
                  </th>
                  <th className="px-4 py-4 text-center bg-slate-50 font-bold text-slate-700 border-l border-slate-200" style={{ width: '120px' }}>
                    Tổng tồn thực tế
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredProducts.map((p) => {
                  const systemTotal = p.availableStock;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      {/* Tên sản phẩm - Cố định ở cột đầu để dễ track khi scroll ngang */}
                      <td className="px-6 py-3.5 font-semibold text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)] z-10">
                        <div className="flex flex-col">
                          <span className="line-clamp-2" title={p.name}>{p.name}</span>
                          {!p.isActive && (
                            <span className="inline-block self-start text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 mt-1 font-bold">Ẩn trên POS</span>
                          )}
                        </div>
                      </td>
 
                      {/* Mã SKU & Danh mục */}
                      <td className="px-4 py-3.5 text-center border-r border-slate-200 whitespace-nowrap">
                        <div className="font-bold text-xs text-slate-600">{p.sku || '-'}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{p.category || '-'}</div>
                      </td>
 
                      {/* Các cột kho hàng hiển thị tồn kho tương ứng */}
                      {warehouses.filter(w => selectedWarehouses.includes(w.id)).map((w) => {
                        const stockQty = p.stocks[w.id] ?? 0;
                        const actualStockQty = p.actualStocks ? (p.actualStocks[w.id] ?? stockQty) : stockQty;
                        const isLowStock = stockQty <= lowStockThreshold;
                        return (
                          <td 
                            key={w.id} 
                            className={`px-4 py-2 text-center border-r border-slate-100 font-bold transition-all ${
                              isLowStock 
                                ? 'bg-red-50 text-red-600 border-red-200/50 shadow-inner' 
                                : 'text-slate-800'
                            }`}
                          >
                            <div className="flex flex-col items-center">
                              <span className={isLowStock ? 'text-base font-extrabold' : ''}>
                                {stockQty}
                              </span>
                              <span className="text-xs text-slate-400 font-normal mt-0.5 border-t border-slate-100 w-full pt-0.5">
                                {actualStockQty}
                              </span>
                            </div>
                            {isLowStock && (
                              <div className="text-[9px] text-red-500 font-bold uppercase tracking-wide mt-0.5">Sắp hết</div>
                            )}
                          </td>
                        );
                      })}
 
                      {/* Cột Tổng có thể bán */}
                      <td className={`px-4 py-3.5 text-center font-extrabold border-l border-slate-200 text-sm transition-all ${
                        systemTotal <= lowStockThreshold
                          ? 'bg-red-100 text-red-700 border-red-200/50 shadow-inner'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        <span>{systemTotal}</span>
                        {systemTotal <= lowStockThreshold && (
                          <div className="text-[9px] text-red-600 font-bold uppercase tracking-wide mt-0.5">Sắp hết</div>
                        )}
                      </td>

                      {/* Cột Tổng tồn thực tế */}
                      <td className="px-4 py-3.5 text-center font-bold text-slate-700 bg-slate-50 border-l border-slate-200 text-sm">
                        <span>{p.totalStock ?? 0}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
