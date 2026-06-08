import { useEffect, useState, useMemo } from 'react';
import { fetchApi } from '../../api/client';
import { Warehouse, Search, AlertTriangle, CheckSquare, Square, Download } from 'lucide-react';
import CategoryTreeSelect from '../../components/CategoryTreeSelect';
import PullToRefresh from '../../components/PullToRefresh';
import { matchesSearchTerm } from '../../utils/text';

export default function KtvInventory() {
  const [warehouse, setWarehouse] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters & Settings
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(2);
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(false);
  const [showOnlyInStock, setShowOnlyInStock] = useState(false);

  const loadMyStock = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await fetchApi('/inventory/my-stock');
      const wh = data.warehouse;
      setWarehouse(wh);

      // Transform products to have stocks and actualStocks like admin UI
      const transformedProducts = (data.products || []).map((p: any) => ({
        ...p,
        isActive: true,
        stocks: {
          [wh.id]: p.availableStock
        },
        actualStocks: {
          [wh.id]: p.actualStock
        }
      }));

      setProducts(transformedProducts);
      setError('');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Lỗi tải thông tin tồn kho');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadMyStock();
  }, []);

  // Lấy danh sách Categories duy nhất để lọc
  const rawCategories = useMemo(() => {
    const list = products.map(p => p.category).filter(Boolean);
    return [...new Set(list)];
  }, [products]);

  // Filter Products
  const filteredProducts = useMemo(() => {
    if (!warehouse) return [];

    return products.filter(p => {
      // 1. Lọc theo tìm kiếm Tên / SKU
      const matchSearch = searchTerm.trim() === '' || 
        matchesSearchTerm(p.name, searchTerm) ||
        (p.sku && matchesSearchTerm(p.sku, searchTerm));

      // 2. Lọc theo Danh mục
      const matchCategory = selectedCategories.length === 0 || (p.category && selectedCategories.includes(p.category));

      // 3. Lọc theo trạng thái Sắp hết hàng
      let matchLowStock = true;
      if (showOnlyLowStock) {
        const qty = p.stocks[warehouse.id] ?? 0;
        matchLowStock = qty <= lowStockThreshold;
      }

      // 4. Lọc theo trạng thái Còn hàng
      let matchInStock = true;
      if (showOnlyInStock) {
        const qty = p.stocks[warehouse.id] ?? 0;
        matchInStock = qty > lowStockThreshold;
      }

      return matchSearch && matchCategory && matchLowStock && matchInStock;
    });
  }, [products, warehouse, searchTerm, selectedCategories, lowStockThreshold, showOnlyLowStock, showOnlyInStock]);

  const handleExportExcel = () => {
    const query = new URLSearchParams();
    if (searchTerm.trim()) query.append('search', searchTerm.trim());
    if (selectedCategories.length > 0) query.append('categories', selectedCategories.join(','));
    query.append('lowStockThreshold', String(lowStockThreshold));
    if (showOnlyLowStock) query.append('showOnlyLowStock', 'true');
    if (showOnlyInStock) query.append('showOnlyInStock', 'true');

    window.open(`/api/inventory/export?${query.toString()}`, '_blank');
  };

  return (
    <div className="container-fluid p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 text-left">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Warehouse className="text-[#1B3A6B]" size={28} />
            Tồn kho của tôi
          </h1>
          {warehouse && (
            <p className="text-slate-500 text-sm mt-1">
              Xem lượng tồn kho thực tế của sản phẩm tại kho hàng được gán cho bạn.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleExportExcel}
            className="btn btn-outline flex items-center justify-center gap-2 px-4 py-2 border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors font-semibold"
            title="Xuất file Excel tồn kho theo bộ lọc đang chọn"
          >
            <Download size={18} />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex flex-col items-center gap-2 text-center font-semibold">
          <AlertTriangle size={24} className="text-red-500 shrink-0" />
          <p>{error}</p>
          <button 
            onClick={() => loadMyStock()} 
            className="mt-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded text-xs transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}

      {!error && (
        <>
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6 flex flex-col gap-4 text-left">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              
              {/* Ô Tìm kiếm sản phẩm */}
              <div className="md:col-span-4 form-group mb-0">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                  <Search size={14} /> Tìm sản phẩm
                </label>
                <input
                  type="text"
                  className="form-input text-sm h-[38px] py-1.5 px-3 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nhập tên sản phẩm hoặc mã SKU..."
                />
              </div>

              {/* Ô Lọc danh mục */}
              <div className="md:col-span-4 form-group mb-0">
                <CategoryTreeSelect
                  label="Danh mục"
                  categories={rawCategories}
                  selected={selectedCategories}
                  onChange={setSelectedCategories}
                  placeholder="Tất cả danh mục"
                />
              </div>

              {/* Thông tin Kho hàng */}
              <div className="md:col-span-4 form-group mb-0">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Kho hàng của tôi
                </label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm flex items-center h-[38px] text-slate-700 font-bold">
                  <span className="truncate" title={warehouse?.name}>{warehouse?.name || 'Đang tải kho...'}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Ô Nhập ngưỡng cảnh báo sắp hết hàng */}
              <div className="md:col-span-12 form-group mb-0">
                <label className="form-label text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
                  <span className="text-red-600 flex items-center gap-1 font-bold">
                    <AlertTriangle size={14} /> Ngưỡng báo hết hàng
                  </span>
                </label>
                <div className="flex gap-2 flex-wrap md:flex-nowrap">
                  <input
                    type="number"
                    min="0"
                    className="form-input text-sm text-center font-bold shrink-0 px-2"
                    style={{ width: '70px' }}
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                  />
                  <button
                    onClick={() => {
                      setShowOnlyLowStock(!showOnlyLowStock);
                      if (!showOnlyLowStock) setShowOnlyInStock(false);
                    }}
                    className={`flex-1 text-[11px] font-bold rounded-lg border px-2 py-1.5 flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                      showOnlyLowStock 
                        ? 'bg-red-50 border-red-300 text-red-700' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {showOnlyLowStock ? <CheckSquare size={14} /> : <Square size={14} />}
                    Chỉ SP hết hàng
                  </button>
                  <button
                    onClick={() => {
                      setShowOnlyInStock(!showOnlyInStock);
                      if (!showOnlyInStock) setShowOnlyLowStock(false);
                    }}
                    className={`flex-1 text-[11px] font-bold rounded-lg border px-2 py-1.5 flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                      showOnlyInStock 
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {showOnlyInStock ? <CheckSquare size={14} /> : <Square size={14} />}
                    Chỉ SP còn hàng
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
              <div className="flex flex-col md:flex-row md:items-center gap-x-6 gap-y-1 text-[11px] text-slate-400 mt-1 border-t border-slate-55 pt-2">
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-left">
            {loading && products.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16">
                <span className="spinner mb-3" style={{ borderColor: 'rgba(27, 58, 107, 0.2)', borderTopColor: '#1B3A6B' }}></span>
                <span className="text-slate-500 text-sm font-semibold">Đang tải bảng tồn kho...</span>
              </div>
            ) : (
              <PullToRefresh onRefresh={() => loadMyStock(true)}>
                <div className="overflow-x-auto min-h-[300px]">
                  <table className="w-full text-left border-collapse table-auto">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                        <th className="px-6 py-4 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)]" style={{ minWidth: '240px' }}>
                          Sản phẩm
                        </th>
                        <th className="px-4 py-4 text-center border-r border-slate-200" style={{ width: '120px' }}>SKU / Danh mục</th>
                        
                        {warehouse && (
                          <th className="px-4 py-4 text-center border-r border-slate-100" style={{ minWidth: '130px', maxWidth: '200px' }}>
                            <div className="truncate font-semibold text-slate-700" title={warehouse.name}>{warehouse.name}</div>
                            {warehouse.address && <div className="text-[10px] text-slate-400 normal-case font-normal mt-0.5 truncate" title={warehouse.address}>{warehouse.address}</div>}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {filteredProducts.map((p) => {
                        const stockQty = warehouse ? (p.stocks[warehouse.id] ?? 0) : 0;
                        const actualStockQty = warehouse ? (p.actualStocks[warehouse.id] ?? 0) : 0;
                        const isLowStock = stockQty <= lowStockThreshold;
                        
                        return (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            {/* Tên sản phẩm */}
                            <td className="px-6 py-3.5 font-semibold text-slate-900 sticky left-0 bg-white group-hover:bg-slate-50 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.03)] z-10">
                              <div className="flex flex-col">
                                <span className="line-clamp-2" title={p.name}>{p.name}</span>
                              </div>
                            </td>
       
                            {/* Mã SKU & Danh mục */}
                            <td className="px-4 py-3.5 text-center border-r border-slate-200 whitespace-nowrap">
                              <div className="font-bold text-xs text-slate-600">{p.sku || '-'}</div>
                              <div className="text-[11px] text-slate-400 mt-0.5">{p.category || '-'}</div>
                            </td>
       
                            {/* Cột tồn kho */}
                            {warehouse && (
                              <td 
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
                            )}
                          </tr>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={warehouse ? 3 : 2} className="px-6 py-12 text-center text-slate-400 italic">
                            Không tìm thấy sản phẩm phù hợp
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </PullToRefresh>
            )}
          </div>
        </>
      )}
    </div>
  );
}
