import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Search, X, Check, Package, ImageOff, Warehouse, BarChart3 } from 'lucide-react';
import { matchesSearchTerm } from '../utils/text';

// ── Bảng ánh xạ danh mục POS → tiếng Việt ──
const CATEGORY_VI_MAP: Record<string, string> = {
  'Device': 'Thiết bị',
  'Filter': 'Lõi lọc',
  'Prefilter': 'Lõi lọc thô',
  'Spare part': 'Linh kiện phụ',
  'Service': 'Dịch vụ',
  'Uncategorized': 'Khác / Chưa phân loại',
  'Air CT Device': 'Máy lọc không khí CT',
  'Water CT Device': 'Máy lọc nước CT',
  'Water UTS Device': 'Máy lọc nước UTS',
  'Water WM Device': 'Máy lọc nước WM',
  'Water CT Filter': 'Lõi lọc nước CT',
  'Water UTS Filter': 'Lõi lọc nước UTS',
  'Water UTS Spare part': 'Linh kiện UTS',
  'Water WM Spare part': 'Linh kiện WM',
};

function translateLabel(label: string): string {
  return CATEGORY_VI_MAP[label] || label;
}

// ── Interfaces ──
export interface ProductStockItem {
  name: string;
  category: string | null;
  sku?: string;
  imageUrl?: string | null;
  sellingPrice?: number | null;
  availableStock?: number;
  totalStock?: number;
  stocks?: Record<string, number>;
  actualStocks?: Record<string, number>;
  pancakeProductId?: string;
}

interface Warehouse {
  id: string;
  name: string;
}

interface TreeNode {
  id: string;
  label: string;
  isParent: boolean;
  children: TreeNode[];
  product?: ProductStockItem; // Attached product data for leaf nodes
}

interface ProductTreeSelectProps {
  categories: string[];
  products: ProductStockItem[];
  selected: string[];
  onChange: (selected: string[]) => void;
  selectedWarehouseId?: string;
  warehouses?: Warehouse[];
  placeholder?: string;
  onOpenChange?: (isOpen: boolean) => void;
}

// ── Format helpers ──
function formatPrice(price: number | null | undefined): string {
  if (!price && price !== 0) return '';
  return price.toLocaleString('vi-VN') + ' đ';
}

// ── Component ──
export default function ProductTreeSelect({
  categories,
  products,
  selected,
  onChange,
  selectedWarehouseId = '',
  warehouses = [],
  placeholder = '-- Chọn sản phẩm --',
  onOpenChange
}: ProductTreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Notify parent component when dropdown opens or closes (for modal auto-expansion)
  useEffect(() => {
    onOpenChange?.(isOpen);
    return () => {
      onOpenChange?.(false);
    };
  }, [isOpen, onOpenChange]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setExpandedProductId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Get stock values for a product at the selected warehouse ──
  function getStockValues(product: ProductStockItem) {
    if (selectedWarehouseId && product.stocks) {
      return {
        available: product.stocks[selectedWarehouseId] ?? 0,
        actual: product.actualStocks?.[selectedWarehouseId] ?? 0
      };
    }
    return {
      available: product.availableStock ?? 0,
      actual: product.totalStock ?? 0
    };
  }

  // ── Build tree ──
  const tree = (() => {
    const KNOWN_PARENTS = ['Device', 'Filter', 'Spare part'];
    const parentCandidates = new Set<string>(KNOWN_PARENTS);
    for (const cat of categories) {
      for (const other of categories) {
        if (other !== cat && other.endsWith(' ' + cat)) {
          parentCandidates.add(cat);
        }
      }
    }

    const childrenMap = new Map<string, string[]>();
    const childSet = new Set<string>();
    for (const cat of categories) {
      if (parentCandidates.has(cat)) continue;
      for (const parent of parentCandidates) {
        if (cat.endsWith(' ' + parent)) {
          if (!childrenMap.has(parent)) childrenMap.set(parent, []);
          childrenMap.get(parent)!.push(cat);
          childSet.add(cat);
          break;
        }
      }
    }

    const roots: TreeNode[] = [];

    for (const parent of parentCandidates) {
      const children = childrenMap.get(parent) || [];
      if (children.length > 0 || categories.includes(parent)) {
        roots.push({
          id: parent,
          label: parent,
          isParent: true,
          children: children.map(child => ({
            id: child,
            label: child,
            isParent: true,
            children: []
          }))
        });
      }
    }

    for (const cat of categories) {
      if (!parentCandidates.has(cat) && !childSet.has(cat)) {
        roots.push({ id: cat, label: cat, isParent: true, children: [] });
      }
    }

    // Populate products as leaf nodes
    const placedProductNames = new Set<string>();
    const populateProducts = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.isParent) {
          const matchedProducts = products.filter(p => p.category === node.id);
          matchedProducts.forEach(p => placedProductNames.add(p.name));

          // Filter by stock if enabled
          const filteredMatched = onlyInStock
            ? matchedProducts.filter(p => {
                const { available } = getStockValues(p);
                return available > 0;
              })
            : matchedProducts;

          node.children = [
            ...node.children.map(c => {
              populateProducts([c]);
              return c;
            }),
            ...filteredMatched.map(p => ({
              id: `PROD:${p.name}`,
              label: p.sku ? `${p.name} (${p.sku})` : p.name,
              isParent: false,
              children: [],
              product: p
            }))
          ];

          node.isParent = node.children.length > 0;
        }
      });
    };
    populateProducts(roots);

    // Unplaced products → "Khác / Chưa phân loại"
    let unplaced = products.filter(p => !placedProductNames.has(p.name));
    if (onlyInStock) {
      unplaced = unplaced.filter(p => {
        const { available } = getStockValues(p);
        return available > 0;
      });
    }
    if (unplaced.length > 0) {
      roots.push({
        id: 'Uncategorized',
        label: 'Uncategorized',
        isParent: true,
        children: unplaced.map(p => ({
          id: `PROD:${p.name}`,
          label: p.sku ? `${p.name} (${p.sku})` : p.name,
          isParent: false,
          children: [],
          product: p
        }))
      });
    }

    roots.sort((a, b) => a.label.localeCompare(b.label));
    roots.forEach(r => r.children.sort((a, b) => a.label.localeCompare(b.label)));
    return roots;
  })();

  // ── Auto-expand parents on search ──
  useEffect(() => {
    if (searchTerm.trim() === '') return;
    const nextExpanded: Record<string, boolean> = {};
    const checkNode = (node: TreeNode): boolean => {
      let childMatches = false;
      node.children.forEach(c => {
        if (matchesSearchTerm(c.label, searchTerm)) childMatches = true;
        if (checkNode(c)) childMatches = true;
      });
      if (matchesSearchTerm(node.label, searchTerm) || childMatches) {
        nextExpanded[node.id] = true;
      }
      return childMatches || matchesSearchTerm(node.label, searchTerm);
    };
    tree.forEach(checkNode);
    setExpandedIds(prev => ({ ...prev, ...nextExpanded }));
  }, [searchTerm]);

  // ── Toggle ──
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleProduct = (node: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (node.isParent) {
      // Folder click → toggle expand
      setExpandedIds(prev => ({ ...prev, [node.id]: !prev[node.id] }));
      return;
    }

    // Leaf (product) → toggle selection
    let nextSelected = [...selected];
    if (nextSelected.includes(node.id)) {
      nextSelected = nextSelected.filter(id => id !== node.id);
    } else {
      nextSelected.push(node.id);
    }
    onChange(nextSelected);
  };

  const handleClearAll = () => onChange([]);

  // ── Filter tree by search ──
  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    if (searchTerm.trim() === '') return nodes;
    return nodes
      .map(node => {
        const matchesSelf = matchesSearchTerm(node.label, searchTerm);
        const filteredChildren = filterTree(node.children);
        if (matchesSelf || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      })
      .filter(Boolean) as TreeNode[];
  };

  const visibleTree = filterTree(tree);

  // ── Toggle inline stock detail panel ──
  const toggleProductDetail = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedProductId(prev => prev === productId ? null : productId);
  };

  // ── Stock badge ──
  function getStockBadge(available: number) {
    if (available === 0) {
      return { bg: 'bg-red-100 text-red-700 border-red-200', text: 'Hết hàng' };
    }
    if (available <= 2) {
      return { bg: 'bg-amber-100 text-amber-800 border-amber-200', text: 'Sắp hết' };
    }
    return { bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', text: 'Còn hàng' };
  }

  // ── Render product card (leaf node) ──
  const renderProductCard = (node: TreeNode, depth: number) => {
    const product = node.product!;
    const isSelected = selected.includes(node.id);
    const { available, actual } = getStockValues(product);
    const badge = getStockBadge(available);
    const warehouseName = selectedWarehouseId
      ? warehouses.find(w => String(w.id) === String(selectedWarehouseId))?.name || 'Kho đã chọn'
      : 'Tất cả kho';
    const isDetailExpanded = expandedProductId === node.id;

    return (
      <div
        key={node.id}
        className={`rounded-xl transition-all select-none text-[13px] border overflow-hidden
          ${depth > 0 ? 'ml-6' : ''}
          ${isSelected
            ? 'bg-blue-50/70 border-blue-200 shadow-sm'
            : 'bg-white border-slate-100 hover:border-slate-200'
          }`}
        style={{ marginBottom: '4px' }}
      >
        {/* Main clickable row */}
        <div
          onClick={(e) => toggleProduct(node, e)}
          className="flex items-start gap-2.5 px-2.5 py-2 cursor-pointer hover:bg-slate-50/50 transition-colors"
        >
          {/* Checkbox */}
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 mt-1
            ${isSelected
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'border-slate-300 bg-white'
            }`}
          >
            {isSelected && <Check size={11} strokeWidth={3} />}
          </div>

          {/* Product Image */}
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.classList.add('img-fallback');
                }}
              />
            ) : (
              <ImageOff size={18} className="text-slate-300" />
            )}
          </div>

          {/* Product Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-slate-800 truncate leading-tight" title={product.name}>
                {product.name}
              </div>
              {product.sellingPrice ? (
                <span className="text-emerald-600 font-semibold text-[12px] shrink-0 whitespace-nowrap">
                  {formatPrice(product.sellingPrice)}
                </span>
              ) : null}
            </div>

            {/* SKU Badge */}
            {product.sku && (
              <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-pink-50 text-pink-700 border border-pink-200 text-[10px] font-semibold rounded">
                {product.sku}
              </span>
            )}

            {/* Stock info + Detail toggle */}
            <div className="flex items-center justify-between gap-1 mt-1 flex-wrap sm:flex-nowrap">
              <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                <span className={`px-1.5 py-0.5 rounded border font-bold ${badge.bg}`}>
                  {badge.text}
                </span>
                <span className="text-slate-500 whitespace-nowrap">
                  {warehouseName}: <span className="font-semibold text-blue-700">{available}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  Tồn TT: <span className="font-semibold text-purple-700">{actual}</span>
                </span>
              </div>

              {/* Detail toggle button */}
              {warehouses.length > 0 && (
                <button
                  onClick={(e) => toggleProductDetail(node.id, e)}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors shrink-0
                    ${isDetailExpanded
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 border border-transparent'
                    }`}
                  title="Xem chi tiết từng kho"
                >
                  <BarChart3 size={11} />
                  {isDetailExpanded ? 'Ẩn' : 'Kho'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Inline Stock Detail Panel — hiển thị ngay bên dưới sản phẩm */}
        {isDetailExpanded && warehouses.length > 0 && (
          <div className="bg-gradient-to-b from-slate-50 to-white border-t border-slate-200 px-3 py-2.5 animate-in slide-in-from-top-1 duration-200">
            <div className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
              <Warehouse size={12} className="text-blue-500" />
              Chi tiết tồn kho từng kho
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-12 gap-1 text-[10px] text-slate-400 font-semibold mb-1 px-1">
              <div className="col-span-6">Kho hàng</div>
              <div className="col-span-3 text-center text-blue-500">CTB</div>
              <div className="col-span-3 text-center text-purple-500">TT</div>
            </div>

            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {warehouses.map((wh, idx) => {
                const whAvailable = product.stocks?.[wh.id] ?? 0;
                const whActual = product.actualStocks?.[wh.id] ?? 0;
                const isCurrentWh = String(wh.id) === String(selectedWarehouseId);
                return (
                  <div
                    key={wh.id}
                    className={`grid grid-cols-12 gap-1 items-center px-1.5 py-1 rounded-lg text-[11px] transition-colors
                      ${isCurrentWh
                        ? 'bg-blue-50 border border-blue-200 font-semibold'
                        : 'bg-white border border-slate-100 hover:bg-slate-50'
                      }`}
                  >
                    <div className="col-span-6 min-w-0">
                      <span className={`${isCurrentWh ? 'text-blue-800' : 'text-slate-700'} truncate block text-[10.5px]`}>
                        {idx + 1}. {wh.name}
                      </span>
                      {isCurrentWh && (
                        <span className="text-[9px] text-blue-500 font-medium">● Đang chọn</span>
                      )}
                    </div>
                    <div className={`col-span-3 text-center font-bold ${whAvailable > 0 ? 'text-blue-700' : 'text-red-500'}`}>
                      {whAvailable}
                    </div>
                    <div className={`col-span-3 text-center font-bold ${whActual > 0 ? 'text-purple-700' : 'text-slate-400'}`}>
                      {whActual}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-slate-100 text-[9px] text-slate-400">
              <span><span className="text-blue-600 font-bold">CTB</span> = Có thể bán</span>
              <span><span className="text-purple-600 font-bold">TT</span> = Tồn thực tế</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render folder node ──
  const renderFolderNode = (node: TreeNode, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const isNodeExpanded = expandedIds[node.id] ?? false;

    const selectedChildCount = node.children.filter(c => selected.includes(c.id)).length;
    const totalProductChildren = node.children.filter(c => !c.isParent).length;

    return (
      <div key={node.id} className="flex flex-col">
        <div
          onClick={(e) => toggleProduct(node, e)}
          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors select-none text-[13px]
            ${depth > 0 ? 'ml-6' : ''}
            hover:bg-amber-50/60`}
        >
          {/* Chevron */}
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpand(node.id, e)}
              className="p-1 rounded hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600"
            >
              {isNodeExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Folder icon */}
          <span className="text-amber-500 shrink-0">
            {isNodeExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
          </span>

          {/* Label */}
          <span className="font-semibold text-slate-800 flex-1">
            {translateLabel(node.label)}
          </span>

          {/* Selected count badge */}
          {selectedChildCount > 0 && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full shrink-0">
              {selectedChildCount}
            </span>
          )}
          {/* Total count */}
          {totalProductChildren > 0 && (
            <span className="text-[10px] text-slate-400 shrink-0">
              ({totalProductChildren})
            </span>
          )}
        </div>

        {/* Children */}
        {hasChildren && isNodeExpanded && (
          <div className="flex flex-col border-l border-slate-100 ml-5 pl-1 my-0.5">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ── Render dispatcher ──
  const renderNode = (node: TreeNode, depth = 0) => {
    if (!node.isParent && node.product) {
      return renderProductCard(node, depth);
    }
    return renderFolderNode(node, depth);
  };

  // ── Display text ──
  const selectedDisplay = () => {
    if (selected.length === 0) return placeholder;
    const productCount = selected.filter(id => id.startsWith('PROD:')).length;
    return `${productCount} sản phẩm đã chọn`;
  };

  return (
    <div className="flex flex-col gap-1 relative w-full text-left" ref={containerRef}>
      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 cursor-pointer flex justify-between items-center hover:border-blue-400 focus:border-blue-500 transition-colors shadow-sm h-[38px]"
      >
        <span className="truncate font-medium">{selectedDisplay()}</span>
        <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
          {selected.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClearAll();
              }}
              className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Xóa tất cả lựa chọn"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-[100%] left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 flex flex-col gap-2.5 w-full"
        >
          {/* Search Bar + In-stock toggle */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                placeholder="Tìm kiếm sản phẩm hoặc mã SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* In-stock toggle */}
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer whitespace-nowrap select-none shrink-0">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={() => setOnlyInStock(!onlyInStock)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Còn hàng
            </label>
          </div>

          {/* Quick actions */}
          <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-xs font-semibold">
            <span className="text-slate-400 italic flex items-center gap-1">
              <Package size={12} />
              Chọn từng sản phẩm bên dưới
            </span>
            <button
              onClick={handleClearAll}
              className="text-slate-500 hover:underline"
            >
              Hủy chọn
            </button>
          </div>

          {/* Tree Scrollable Area */}
          <div className="max-h-72 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 pr-1 relative">
            {visibleTree.map(node => renderNode(node))}
            {visibleTree.length === 0 && (
              <span className="text-xs text-slate-400 italic p-3 text-center">
                Không tìm thấy sản phẩm
              </span>
            )}
          </div>


        </div>
      )}
    </div>
  );
}
