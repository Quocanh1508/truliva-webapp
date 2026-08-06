import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Search, X, Check, Minus } from 'lucide-react';
import { matchesSearchTerm } from '../utils/text';

/** Bảng ánh xạ tĩnh tên danh mục POS (tiếng Anh) → tiếng Việt */
const CATEGORY_VI_MAP: Record<string, string> = {
  // Danh mục gốc (Level 1)
  'Device': 'Thiết bị',
  'Filter': 'Lõi lọc',
  'Prefilter': 'Lõi lọc thô',
  'Spare part': 'Linh kiện phụ',
  'Service': 'Dịch vụ',
  'Uncategorized': 'Khác / Chưa phân loại',
  // Danh mục con Thiết bị (Level 2)
  'Air CT Device': 'Máy lọc không khí CT',
  'Water CT Device': 'Máy lọc nước CT',
  'Water UTS Device': 'Máy lọc nước UTS',
  'Water WM Device': 'Máy lọc nước WM',
  // Danh mục con Lõi lọc (Level 2)
  'Water CT Filter': 'Lõi lọc nước CT',
  'Water UTS Filter': 'Lõi lọc nước UTS',
  // Danh mục con Linh kiện phụ (Level 2)
  'Water UTS Spare part': 'Linh kiện UTS',
  'Water WM Spare part': 'Linh kiện WM',
};

/** Dịch tên label sang tiếng Việt (nếu có trong bảng). Giữ nguyên tên gốc nếu không tìm thấy. */
function translateLabel(label: string): string {
  if (CATEGORY_VI_MAP[label]) return CATEGORY_VI_MAP[label];
  // Thử match theo phần cuối (VD: "Water CT Device" → "Máy lọc CT")
  for (const [en, vi] of Object.entries(CATEGORY_VI_MAP)) {
    if (label.toLowerCase() === en.toLowerCase()) return vi;
  }
  return label;
}

interface TreeNode {
  id: string;
  label: string;
  isParent: boolean;
  children: TreeNode[];
}

interface ProductItem {
  name: string;
  category: string | null;
  sku?: string;
}

interface CategoryTreeSelectProps {
  categories: string[];
  products?: ProductItem[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: string;
  placeholder?: string;
  renderInline?: boolean;
}

export default function CategoryTreeSelect({
  categories,
  products = [],
  selected,
  onChange,
  label,
  placeholder = 'Tất cả danh mục',
  renderInline = false
}: CategoryTreeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tree = (() => {
    const KNOWN_PARENTS = ['Device', 'Filter', 'Spare part'];

    // 1. Identify parents
    const parentCandidates = new Set<string>(KNOWN_PARENTS);
    for (const cat of categories) {
      for (const other of categories) {
        if (other !== cat && other.endsWith(' ' + cat)) {
          parentCandidates.add(cat);
        }
      }
    }

    // 2. Map children (subcategories)
    const childrenMap = new Map<string, string[]>();
    const childSet = new Set<string>();

    for (const cat of categories) {
      if (parentCandidates.has(cat)) {
        continue;
      }
      for (const parent of parentCandidates) {
        if (cat.endsWith(' ' + parent)) {
          if (!childrenMap.has(parent)) {
            childrenMap.set(parent, []);
          }
          childrenMap.get(parent)!.push(cat);
          childSet.add(cat);
          break; // Assign to the first matching parent suffix
        }
      }
    }

    const roots: TreeNode[] = [];

    // Add parent roots
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
            isParent: products && products.length > 0 ? true : false,
            children: []
          }))
        });
      }
    }

    // Add standalone roots
    for (const cat of categories) {
      if (!parentCandidates.has(cat) && !childSet.has(cat)) {
        roots.push({
          id: cat,
          label: cat,
          isParent: products && products.length > 0 ? true : false,
          children: []
        });
      }
    }

    // Populate products as Level 3 nodes if provided
    if (products && products.length > 0) {
      const placedProductNames = new Set<string>();

      const populateProducts = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          if (node.isParent) {
            // Find products belonging to this category
            const matchedProducts = products.filter(p => p.category === node.id);
            matchedProducts.forEach(p => placedProductNames.add(p.name));

            node.children = [
              ...node.children.map(c => {
                // Recursively populate products for subcategories
                populateProducts([c]);
                return c;
              }),
              ...matchedProducts.map(p => ({
                id: `PROD:${p.name}`,
                label: p.sku ? `${p.name} (${p.sku})` : p.name,
                isParent: false,
                children: []
              }))
            ];
            
            // If the node has children products or children subcategories, mark it as parent
            if (node.children.length > 0) {
              node.isParent = true;
            } else {
              node.isParent = false;
            }
          }
        });
      };
      populateProducts(roots);

      // Any products whose category is null/unmatched are placed under "Khác / Chưa phân loại"
      const unplaced = products.filter(p => !placedProductNames.has(p.name));
      if (unplaced.length > 0) {
        roots.push({
          id: 'Uncategorized',
          label: translateLabel('Uncategorized'),
          isParent: true,
          children: unplaced.map(p => ({
            id: `PROD:${p.name}`,
            label: p.sku ? `${p.name} (${p.sku})` : p.name,
            isParent: false,
            children: []
          }))
        });
      }
    }

    // Sắp xếp roots theo thứ tự abc
    roots.sort((a, b) => a.label.localeCompare(b.label));
    // Sắp xếp các con của từng parent theo abc
    roots.forEach(r => {
      if (r.children) {
        r.children.sort((a, b) => a.label.localeCompare(b.label));
      }
    });

    return roots;
  })();

  // Auto-expand parents if there's a search term matching their children
  useEffect(() => {
    if (searchTerm.trim() === '') return;
    
    const nextExpanded: Record<string, boolean> = {};

    const checkNode = (node: TreeNode): boolean => {
      let childMatches = false;
      if (node.children) {
        node.children.forEach(c => {
          if (matchesSearchTerm(c.label, searchTerm)) {
            childMatches = true;
          }
        });
      }
      
      const selfMatches = matchesSearchTerm(node.label, searchTerm);
      
      if (childMatches) {
        nextExpanded[node.id] = true;
      }
      
      return selfMatches || childMatches;
    };

    tree.forEach(checkNode);
    setExpandedIds(prev => ({ ...prev, ...nextExpanded }));
  }, [searchTerm]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isChecked = (node: TreeNode): boolean => {
    if (node.isParent && node.children.length > 0) {
      return node.children.every(child => isChecked(child));
    }
    return selected.includes(node.id);
  };

  const isIndeterminate = (node: TreeNode): boolean => {
    if (!node.isParent || node.children.length === 0) return false;
    
    const childChecked = node.children.map(child => isChecked(child));
    const childIndeterminate = node.children.map(child => isIndeterminate(child));
    
    const anyChecked = childChecked.some(c => c) || childIndeterminate.some(i => i);
    const allChecked = childChecked.every(c => c);
    
    return anyChecked && !allChecked;
  };

  const toggleNode = (node: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Nếu là parent node có products: CHỈ toggle expand/collapse, KHÔNG chọn
    if (node.isParent && products && products.length > 0) {
      setExpandedIds(prev => ({ ...prev, [node.id]: !prev[node.id] }));
      return;
    }
    
    let nextSelected = [...selected];
    
    if (node.isParent) {
      // Mode danh mục (không có products) — giữ nguyên logic cũ
      const currentlyChecked = isChecked(node);
      const allNodeIds = [node.id, ...node.children.map(c => c.id)];
      
      if (currentlyChecked) {
        nextSelected = nextSelected.filter(id => !allNodeIds.includes(id));
      } else {
        allNodeIds.forEach(id => {
          if (!nextSelected.includes(id)) {
            nextSelected.push(id);
          }
        });
      }
    } else {
      // Leaf node (sản phẩm cụ thể)
      if (nextSelected.includes(node.id)) {
        nextSelected = nextSelected.filter(id => id !== node.id);
        
        // Auto uncheck parent
        const parent = tree.find(p => p.children.some(c => c.id === node.id));
        if (parent) {
          nextSelected = nextSelected.filter(id => id !== parent.id);
        }
      } else {
        nextSelected.push(node.id);
        
        // Auto check parent if all siblings checked
        const parent = tree.find(p => p.children.some(c => c.id === node.id));
        if (parent) {
          const allSiblingsChecked = parent.children.every(c => nextSelected.includes(c.id));
          if (allSiblingsChecked && !nextSelected.includes(parent.id)) {
            nextSelected.push(parent.id);
          }
        }
      }
    }
    
    onChange(nextSelected);
  };

  const handleSelectAll = () => {
    const allIds: string[] = [];
    tree.forEach(node => {
      allIds.push(node.id);
      node.children.forEach(c => allIds.push(c.id));
    });
    onChange(allIds);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  // Filter tree nodes based on search term
  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    if (searchTerm.trim() === '') return nodes;

    return nodes
      .map(node => {
        const matchesSelf = matchesSearchTerm(node.label, searchTerm);
        const filteredChildren = filterTree(node.children);
        
        if (matchesSelf || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren
          };
        }
        return null;
      })
      .filter(Boolean) as TreeNode[];
  };

  const visibleTree = filterTree(tree);

  // Kiểm tra xem component đang chạy ở chế độ chọn sản phẩm (có products) hay chế độ lọc danh mục
  const isProductMode = products && products.length > 0;

  // Render a node and recursively render children
  const renderNode = (node: TreeNode, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isNodeExpanded = expandedIds[node.id] ?? false;
    const checked = isChecked(node);
    const indeterminate = isIndeterminate(node);
    const isParentInProductMode = node.isParent && isProductMode;
    const displayLabel = isProductMode ? translateLabel(node.label) : node.label;

    // Đếm số sản phẩm con đã chọn trong thư mục này
    const selectedChildCount = isParentInProductMode
      ? node.children.filter(c => selected.includes(c.id)).length
      : 0;

    return (
      <div key={node.id} className="flex flex-col">
        <div 
          onClick={(e) => toggleNode(node, e)}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors select-none text-[13px] ${
            depth > 0 ? 'ml-6' : ''
          } ${
            isParentInProductMode
              ? 'hover:bg-amber-50/60'
              : 'hover:bg-slate-50'
          }`}
        >
          {/* Collapse/Expand chevron for parent */}
          {hasChildren ? (
            <button 
              onClick={(e) => toggleExpand(node.id, e)}
              className="p-1 rounded hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600"
            >
              {isNodeExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className="w-6" /> // spacer
          )}

          {/* Checkbox — ẨN đối với thư mục (parent) khi đang ở chế độ chọn sản phẩm */}
          {isParentInProductMode ? (
            // Thư mục: KHÔNG có checkbox, chỉ có icon thư mục
            <span className="text-amber-500 shrink-0">
              {isNodeExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
            </span>
          ) : (
            // Sản phẩm lá hoặc chế độ lọc danh mục: có checkbox
            <>
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                checked 
                  ? 'bg-blue-600 border-blue-600 text-white' 
                  : indeterminate 
                    ? 'bg-blue-100 border-blue-500 text-blue-600' 
                    : 'border-slate-300 bg-white'
              }`}>
                {checked && <Check size={11} strokeWidth={3} />}
                {indeterminate && <Minus size={11} strokeWidth={3} />}
              </div>

              {/* Node Icon */}
              <span className="text-slate-400">
                {node.isParent ? (
                  isNodeExpanded ? <FolderOpen size={14} className="text-amber-500" /> : <Folder size={14} className="text-amber-500" />
                ) : (
                  <FileText size={14} className="text-blue-400" />
                )}
              </span>
            </>
          )}

          {/* Label */}
          <span className={`text-slate-700 font-medium flex-1 ${
            isParentInProductMode ? 'font-semibold text-slate-800' : node.isParent ? 'font-semibold' : ''
          }`}>
            {displayLabel}
          </span>

          {/* Badge đếm số sản phẩm đã chọn trong thư mục */}
          {isParentInProductMode && selectedChildCount > 0 && (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full shrink-0">
              {selectedChildCount}
            </span>
          )}
          {/* Badge tổng số sản phẩm trong thư mục */}
          {isParentInProductMode && node.children.length > 0 && (
            <span className="text-[10px] text-slate-400 shrink-0">
              ({node.children.length})
            </span>
          )}
        </div>

        {/* Children nodes container */}
        {hasChildren && isNodeExpanded && (
          <div className="flex flex-col border-l border-slate-100 ml-5 pl-1 my-0.5">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const selectedDisplay = () => {
    if (selected.length === 0) return placeholder;
    if (products && products.length > 0) {
      const productCount = selected.filter(id => id.startsWith('PROD:')).length;
      return `${productCount} sản phẩm đã chọn`;
    }
    return `${selected.length} đã chọn (${selected.slice(0, 2).join(', ')}${selected.length > 2 ? '...' : ''})`;
  };

  if (renderInline) {
    return (
      <div className="flex flex-col gap-3 w-full text-left">
        {/* Quick Filter Search Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-250 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
            placeholder="Tìm kiếm danh mục..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button 
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Quick Actions — Ẩn "Chọn tất cả" khi ở chế độ sản phẩm để tránh chọn nhầm */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-xs font-semibold">
          {!isProductMode ? (
            <button 
              type="button"
              onClick={handleSelectAll} 
              className="text-[#1B3A6B] hover:underline"
            >
              Chọn tất cả
            </button>
          ) : (
            <span className="text-slate-400 italic">Chọn từng sản phẩm bên dưới</span>
          )}
          <button 
            type="button"
            onClick={handleClearAll} 
            className="text-slate-500 hover:underline"
          >
            Hủy chọn
          </button>
        </div>

        {/* Tree Scrollable Area */}
        <div className="max-h-48 overflow-y-auto flex flex-col gap-1 pr-1">
          {visibleTree.map(node => renderNode(node))}
          {visibleTree.length === 0 && (
            <span className="text-xs text-slate-400 italic p-3 text-center">
              Không tìm thấy danh mục
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 relative w-full text-left" ref={containerRef}>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
          {label}
        </label>
      )}

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
        <div className="absolute top-[100%] left-0 right-0 z-40 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col gap-3 min-w-[280px]">
          
          {/* Quick Filter Search Bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-250 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              placeholder="Tìm kiếm danh mục..."
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

          {/* Quick Actions — Ẩn "Chọn tất cả" khi ở chế độ sản phẩm */}
          <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-xs font-semibold">
            {!isProductMode ? (
              <button 
                onClick={handleSelectAll} 
                className="text-[#1B3A6B] hover:underline"
              >
                Chọn tất cả
              </button>
            ) : (
              <span className="text-slate-400 italic">Chọn từng sản phẩm bên dưới</span>
            )}
            <button 
              onClick={handleClearAll} 
              className="text-slate-500 hover:underline"
            >
              Hủy chọn
            </button>
          </div>

          {/* Tree Scrollable Area */}
          <div className="max-h-60 overflow-y-auto flex flex-col gap-1 pr-1">
            {visibleTree.map(node => renderNode(node))}
            {visibleTree.length === 0 && (
              <span className="text-xs text-slate-400 italic p-3 text-center">
                Không tìm thấy danh mục
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
