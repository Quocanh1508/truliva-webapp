import { useEffect, useState, useMemo } from 'react';
import { fetchApi } from '../../api/client';
import { Warehouse, Search, AlertTriangle, Download, Info, ChevronDown, ChevronUp, X, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import CategoryTreeSelect from '../../components/CategoryTreeSelect';
import PullToRefresh from '../../components/PullToRefresh';
import { matchesSearchTerm } from '../../utils/text';

export default function KtvInventory() {
  const [warehouse, setWarehouse] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Filters & Settings
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(2);
  const [activeTab, setActiveTab] = useState<'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [showGuide, setShowGuide] = useState(false);

  const loadMyStock = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
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
      setRefreshing(false);
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

  // Thống kê nhanh số lượng
  const stats = useMemo(() => {
    if (!warehouse) return { total: 0, inStock: 0, outOfStock: 0 };
    let inStock = 0;
    let outOfStock = 0;
    products.forEach(p => {
      const qty = p.stocks?.[warehouse.id] ?? 0;
      if (qty > 0) {
        inStock++;
      } else {
        outOfStock++;
      }
    });
    return {
      total: products.length,
      inStock,
      outOfStock
    };
  }, [products, warehouse]);

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

      // 3. Lọc theo Tab trạng thái: Còn hàng (qty > 0) hoặc Hết hàng (qty <= 0)
      const qty = p.stocks?.[warehouse.id] ?? 0;
      let matchTab = true;
      if (activeTab === 'IN_STOCK') {
        matchTab = qty > 0;
      } else if (activeTab === 'OUT_OF_STOCK') {
        matchTab = qty <= 0;
      }

      return matchSearch && matchCategory && matchTab;
    });
  }, [products, warehouse, searchTerm, selectedCategories, activeTab]);

  const handleExportExcel = () => {
    const query = new URLSearchParams();
    if (searchTerm.trim()) query.append('search', searchTerm.trim());
    if (selectedCategories.length > 0) query.append('categories', selectedCategories.join(','));
    query.append('lowStockThreshold', String(lowStockThreshold));
    if (activeTab === 'IN_STOCK') query.append('showOnlyInStock', 'true');
    if (activeTab === 'OUT_OF_STOCK') query.append('showOnlyOutOfStock', 'true');

    window.open(`/api/inventory/export?${query.toString()}`, '_blank');
  };

  return (
    <div className="container-fluid p-3 md:p-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 text-left">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Warehouse className="text-[#1B3A6B] shrink-0" size={26} />
            Tồn kho của tôi
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-0.5">
            Lượng tồn kho thực tế của KTV được đồng bộ từ Pancake POS.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => loadMyStock(true)}
            disabled={refreshing || loading}
            className="btn btn-outline flex items-center justify-center gap-1.5 px-3 py-2 text-xs md:text-sm border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors font-semibold"
            title="Tải lại dữ liệu"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="btn btn-primary flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs md:text-sm bg-[#1B3A6B] hover:bg-[#152e55] text-white rounded-lg transition-colors font-semibold shadow-xs"
            title="Xuất file Excel tồn kho"
          >
            <Download size={15} />
            <span>Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Warehouse Info Banner */}
      {warehouse && (
        <div className="bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white p-3 md:p-4 rounded-xl shadow-sm mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-white/15 backdrop-blur-xs flex items-center justify-center shrink-0">
              <Warehouse size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-blue-200 font-semibold uppercase tracking-wider">Kho hàng phụ trách</div>
              <div className="font-bold text-sm md:text-base tracking-wide truncate" title={warehouse.name}>
                {warehouse.name}
              </div>
              {warehouse.address && (
                <div className="text-[11px] text-blue-100/80 truncate mt-0.5" title={warehouse.address}>
                  📍 {warehouse.address}
                </div>
              )}
            </div>
          </div>
          {warehouse.phone && (
            <div className="hidden sm:block shrink-0 text-right">
              <span className="text-xs text-blue-100 bg-white/10 px-3 py-1 rounded-full font-medium">
                ☎️ {warehouse.phone}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={20} className="text-red-500 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button 
            onClick={() => loadMyStock()} 
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs transition-colors shrink-0"
          >
            Thử lại
          </button>
        </div>
      )}

      {!error && (
        <>
          {/* Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl mb-3 overflow-x-auto text-xs font-semibold">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`flex-1 min-w-[90px] py-2 px-3 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                activeTab === 'ALL'
                  ? 'bg-white text-[#1B3A6B] shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Tất cả</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === 'ALL' ? 'bg-blue-100 text-[#1B3A6B]' : 'bg-slate-200 text-slate-600'
              }`}>
                {stats.total}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('IN_STOCK')}
              className={`flex-1 min-w-[95px] py-2 px-3 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                activeTab === 'IN_STOCK'
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-1">
                <CheckCircle2 size={13} className="text-emerald-600" />
                Còn hàng
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'IN_STOCK' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {stats.inStock}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('OUT_OF_STOCK')}
              className={`flex-1 min-w-[95px] py-2 px-3 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                activeTab === 'OUT_OF_STOCK'
                  ? 'bg-white text-rose-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-1">
                <XCircle size={13} className="text-rose-500" />
                Hết hàng
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                stats.outOfStock > 0 
                  ? 'bg-rose-100 text-rose-700' 
                  : 'bg-slate-200 text-slate-500'
              }`}>
                {stats.outOfStock}
              </span>
            </button>
          </div>

          {/* Search & Category Filter Bar */}
          <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 shadow-xs mb-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 md:gap-4 items-center">
              {/* Search input */}
              <div className="md:col-span-7 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  className="form-input text-sm h-[40px] pl-9 pr-8 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-slate-50/50 hover:bg-white focus:bg-white w-full transition-colors"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm tên sản phẩm, mã SKU..."
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category Tree Dropdown */}
              <div className="md:col-span-5">
                <CategoryTreeSelect
                  label=""
                  categories={rawCategories}
                  selected={selectedCategories}
                  onChange={setSelectedCategories}
                  placeholder="Tất cả danh mục"
                />
              </div>
            </div>

            {/* Collapsible Guide & Threshold Setting */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center justify-between w-full font-medium"
              >
                <span className="flex items-center gap-1.5">
                  <Info size={13} className="text-blue-500" />
                  Chú thích & Ngưỡng cảnh báo tồn kho
                </span>
                {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showGuide && (
                <div className="mt-2.5 p-3 bg-slate-50 rounded-lg space-y-2.5 text-xs text-slate-600 border border-slate-100 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700">Ngưỡng cảnh báo sắp hết:</span>
                    <input
                      type="number"
                      min="1"
                      className="w-16 h-7 text-center font-bold text-sm border border-slate-200 rounded bg-white"
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <span className="text-slate-400 text-[11px]">(Đánh dấu thẻ màu cam khi số lượng ≤ mức này)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11.5px] pt-2 border-t border-slate-200/60">
                    <div className="p-2 bg-white rounded border border-slate-200/60">
                      <strong className="text-emerald-700">Còn hàng</strong>: Sản phẩm có lượng tồn có thể bán &gt; 0.
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200/60">
                      <strong className="text-rose-700">Hết hàng</strong>: Sản phẩm có lượng tồn có thể bán = 0.
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200/60">
                      <strong className="text-[#1B3A6B]">Có thể bán</strong>: Số lượng khả dụng để tạo đơn mới (đã trừ hàng giữ trong các đơn đang xử lý).
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200/60">
                      <strong className="text-slate-700">Tồn thực tế</strong>: Số lượng máy/linh kiện vật lý đang có trong kho của bạn.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Stock Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-xs">
              <span className="spinner mb-3" style={{ borderColor: 'rgba(27, 58, 107, 0.2)', borderTopColor: '#1B3A6B' }}></span>
              <span className="text-slate-500 text-sm font-semibold">Đang tải bảng tồn kho...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-xs">
              <Warehouse size={36} className="mb-2 opacity-40 text-slate-400" />
              <span className="text-sm font-semibold">Không tìm thấy sản phẩm phù hợp</span>
              {(searchTerm || selectedCategories.length > 0 || activeTab !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategories([]);
                    setActiveTab('ALL');
                  }}
                  className="mt-3 text-xs text-blue-600 hover:underline font-medium"
                >
                  Xóa tất cả bộ lọc
                </button>
              )}
            </div>
          ) : (
            <PullToRefresh onRefresh={() => loadMyStock(true)}>
              <div>
                {/* 📱 MOBILE CARD VIEW (Hiển thị cho màn hình điện thoại < 768px) */}
                <div className="block md:hidden space-y-2.5 pb-6">
                  {filteredProducts.map((p) => {
                    const stockQty = warehouse ? (p.stocks?.[warehouse.id] ?? 0) : 0;
                    const actualStockQty = warehouse ? (p.actualStocks?.[warehouse.id] ?? 0) : 0;
                    const isOutOfStock = stockQty <= 0;
                    const isLowStock = stockQty > 0 && stockQty <= lowStockThreshold;

                    return (
                      <div 
                        key={p.id} 
                        className={`bg-white rounded-xl border p-3.5 shadow-xs transition-shadow ${
                          isOutOfStock 
                            ? 'border-rose-200 bg-rose-50/15' 
                            : isLowStock 
                            ? 'border-amber-200 bg-amber-50/15' 
                            : 'border-slate-200'
                        }`}
                      >
                        {/* Header của thẻ: Tên sản phẩm & Badge trạng thái */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-slate-900 text-sm leading-snug break-words" title={p.name}>
                              {p.name}
                            </h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {p.sku && (
                                <span className="bg-slate-100 text-slate-700 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-200">
                                  SKU: {p.sku}
                                </span>
                              )}
                              {p.category && (
                                <span className="bg-blue-50 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-blue-100">
                                  {p.category}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Badge trạng thái */}
                          {isOutOfStock ? (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                              <AlertTriangle size={11} />
                              Hết hàng
                            </span>
                          ) : isLowStock ? (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                              <AlertTriangle size={11} />
                              Sắp hết
                            </span>
                          ) : (
                            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Còn hàng
                            </span>
                          )}
                        </div>

                        {/* 2 Khối số liệu tồn kho nổi bật */}
                        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-100">
                          {/* Có thể bán */}
                          <div className={`p-2 rounded-lg border text-center ${
                            isOutOfStock 
                              ? 'bg-rose-50/80 border-rose-200 text-rose-700' 
                              : isLowStock 
                              ? 'bg-amber-50/80 border-amber-200 text-amber-700' 
                              : 'bg-blue-50/60 border-blue-100 text-slate-800'
                          }`}>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Có thể bán
                            </div>
                            <div className={`text-xl font-extrabold mt-0.5 ${
                              isOutOfStock ? 'text-rose-700' : isLowStock ? 'text-amber-700' : 'text-[#1B3A6B]'
                            }`}>
                              {stockQty}
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">Khả dụng tạo đơn</div>
                          </div>

                          {/* Tồn thực tế */}
                          <div className="p-2 rounded-lg border border-slate-200 bg-slate-50/70 text-slate-800 text-center">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Tồn thực tế
                            </div>
                            <div className="text-xl font-bold mt-0.5 text-slate-700">
                              {actualStockQty}
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">Vật lý trong kho</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 💻 DESKTOP TABLE VIEW (Hiển thị cho màn hình máy tính >= 768px) */}
                <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 shadow-xs bg-white">
                  <table className="w-full text-left border-collapse table-auto">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                        <th className="px-5 py-3.5 border-r border-slate-200">Sản phẩm</th>
                        <th className="px-4 py-3.5 text-center border-r border-slate-200" style={{ width: '130px' }}>SKU</th>
                        <th className="px-4 py-3.5 text-center border-r border-slate-200" style={{ width: '150px' }}>Danh mục</th>
                        <th className="px-4 py-3.5 text-center border-r border-slate-200 bg-slate-100/70" style={{ width: '140px' }}>
                          Có thể bán
                        </th>
                        <th className="px-4 py-3.5 text-center border-r border-slate-200" style={{ width: '140px' }}>
                          Tồn thực tế
                        </th>
                        <th className="px-4 py-3.5 text-center" style={{ width: '130px' }}>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                      {filteredProducts.map((p) => {
                        const stockQty = warehouse ? (p.stocks?.[warehouse.id] ?? 0) : 0;
                        const actualStockQty = warehouse ? (p.actualStocks?.[warehouse.id] ?? 0) : 0;
                        const isOutOfStock = stockQty <= 0;
                        const isLowStock = stockQty > 0 && stockQty <= lowStockThreshold;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                            {/* Tên sản phẩm */}
                            <td className="px-5 py-3.5 font-semibold text-slate-900 border-r border-slate-200">
                              <span className="line-clamp-2" title={p.name}>{p.name}</span>
                            </td>

                            {/* Mã SKU */}
                            <td className="px-4 py-3.5 text-center border-r border-slate-200 whitespace-nowrap font-mono text-xs font-bold text-slate-600">
                              {p.sku || '-'}
                            </td>

                            {/* Danh mục */}
                            <td className="px-4 py-3.5 text-center border-r border-slate-200 text-xs text-slate-500">
                              {p.category || '-'}
                            </td>

                            {/* Có thể bán */}
                            <td className={`px-4 py-3.5 text-center font-extrabold border-r border-slate-200 text-base ${
                              isOutOfStock 
                                ? 'bg-rose-50 text-rose-700' 
                                : isLowStock 
                                ? 'bg-amber-50 text-amber-700' 
                                : 'bg-slate-100/60 text-slate-900'
                            }`}>
                              {stockQty}
                            </td>

                            {/* Tồn thực tế */}
                            <td className="px-4 py-3.5 text-center font-bold text-slate-700 border-r border-slate-200 text-base">
                              {actualStockQty}
                            </td>

                            {/* Trạng thái badge */}
                            <td className="px-4 py-3.5 text-center">
                              {isOutOfStock ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                                  <AlertTriangle size={11} /> Hết hàng
                                </span>
                              ) : isLowStock ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                  <AlertTriangle size={11} /> Sắp hết
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Còn hàng
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </PullToRefresh>
          )}
        </>
      )}
    </div>
  );
}
