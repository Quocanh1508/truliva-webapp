import { useEffect, useState, useMemo } from 'react';
import { fetchApi } from '../../api/client';
import { Search, Warehouse, Package, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import PullToRefresh from '../../components/PullToRefresh';

export default function KtvInventory() {
  const [warehouse, setWarehouse] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showOnlyLowStock, setShowOnlyLowStock] = useState(false);

  const loadMyStock = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await fetchApi('/inventory/my-stock');
      setWarehouse(data.warehouse);
      setProducts(data.products || []);
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

  // Get unique categories for dropdown filter
  const categories = useMemo(() => {
    const list = products.map(p => p.category).filter(Boolean);
    return [...new Set(list)];
  }, [products]);

  // Filter products based on search term, category, and low stock status
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) || 
        (p.sku && p.sku.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory) {
      result = result.filter(p => p.category === selectedCategory);
    }

    // Low stock filter (threshold <= 3)
    if (showOnlyLowStock) {
      result = result.filter(p => p.availableStock <= 3);
    }

    return result;
  }, [products, searchTerm, selectedCategory, showOnlyLowStock]);

  const getStockStatusBadge = (available: number) => {
    if (available === 0) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
          <XCircle size={10} /> Hết hàng
        </span>
      );
    }
    if (available <= 3) {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded animate-pulse">
          <AlertTriangle size={10} /> Sắp hết hàng
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
        <CheckCircle size={10} /> Còn hàng
      </span>
    );
  };

  if (loading && products.length === 0) {
    return (
      <div className="text-center py-12">
        <span className="spinner border-t-[#1B3A6B]"></span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-2xl mx-auto px-2 pb-10 font-sans text-left">
      
      {/* Mapped Warehouse Header */}
      {warehouse && (
        <div className="bg-gradient-to-r from-blue-900 to-[#1B3A6B] text-white p-4 rounded-2xl shadow-md mb-5 flex items-start gap-3">
          <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 shrink-0">
            <Warehouse size={22} className="text-blue-300" />
          </div>
          <div>
            <h3 className="font-bold text-base leading-tight">Tồn kho của tôi</h3>
            <p className="text-xs text-blue-200 mt-1 font-semibold">{warehouse.name}</p>
            {warehouse.address && (
              <p className="text-[10px] text-blue-300/80 mt-0.5 leading-tight">{warehouse.address}</p>
            )}
          </div>
        </div>
      )}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center text-sm font-semibold text-red-700 flex flex-col items-center gap-2">
          <AlertTriangle size={24} className="text-red-500" />
          <p>{error}</p>
          <button 
            onClick={() => loadMyStock()} 
            className="mt-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded text-xs transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
          {/* Filters Bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm mb-4 flex flex-col gap-2.5">
            <div className="flex gap-2">
              {/* Search input */}
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm sản phẩm, SKU..."
                  className="w-full pl-9 pr-3 py-2 text-[12px] border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Category selector */}
              <select
                className="px-2 py-2 text-[12px] border border-gray-300 rounded-lg bg-white text-gray-700 outline-none max-w-[130px]"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
              >
                <option value="">Tất cả danh mục</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Checkbox filter for low stock */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-[12px]">
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-600 font-medium select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-350 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                  checked={showOnlyLowStock}
                  onChange={e => setShowOnlyLowStock(e.target.checked)}
                />
                <span>Sản phẩm sắp hết hàng (tồn ≤ 3)</span>
              </label>

              <span className="text-[11px] text-gray-400">
                Hiển thị: <strong>{filteredProducts.length}</strong> / {products.length} SP
              </span>
            </div>
          </div>

          {/* Products List Area */}
          <div className="min-h-[300px]">
            <PullToRefresh onRefresh={() => loadMyStock(true)}>
              {filteredProducts.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-gray-400 flex flex-col items-center justify-center gap-2.5">
                  <Package size={36} className="text-gray-300" />
                  <span className="text-xs">Không tìm thấy sản phẩm phù hợp</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {filteredProducts.map(p => (
                    <div 
                      key={p.id} 
                      className="bg-white border border-gray-150 rounded-xl p-3 shadow-xs flex items-center justify-between hover:shadow-sm transition-shadow gap-3"
                    >
                      {/* Product image and basic details */}
                      <div className="flex items-center gap-3 min-w-0">
                        {p.imageUrl ? (
                          <img 
                            src={p.imageUrl} 
                            alt={p.name} 
                            className="w-12 h-12 object-cover rounded-lg border border-gray-100 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-50 border border-gray-150 rounded-lg flex items-center justify-center text-gray-400 shrink-0">
                            <Package size={20} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-bold text-[13px] text-gray-800 truncate leading-snug" title={p.name}>
                            {p.name}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {p.sku && (
                              <span className="text-[10px] font-mono font-semibold text-gray-500 bg-gray-100 px-1 py-0.2 rounded border border-gray-200">
                                {p.sku}
                              </span>
                            )}
                            {p.category && (
                              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50/50 border border-blue-100 px-1 py-0.2 rounded">
                                {p.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stock levels and status */}
                      <div className="flex flex-col items-end shrink-0 gap-1">
                        {getStockStatusBadge(p.availableStock)}
                        <div className="flex flex-col text-right mt-0.5">
                          <span className="text-[11px] text-gray-600 font-medium">
                            Có thể bán: <strong className={p.availableStock <= 3 ? "text-amber-600 font-bold" : "text-gray-900 font-bold"}>{p.availableStock}</strong>
                          </span>
                          <span className="text-[10px] text-gray-400 mt-0.5">
                            Tồn thực tế: <strong className="text-gray-600 font-semibold">{p.actualStock}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PullToRefresh>
          </div>
        </>
      )}
    </div>
  );
}
