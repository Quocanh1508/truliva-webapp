import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Search, X, Check, Minus } from 'lucide-react';

interface TreeNode {
  id: string;
  label: string;
  isParent: boolean;
  children: TreeNode[];
}

interface CategoryTreeSelectProps {
  categories: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  label?: string;
  placeholder?: string;
  renderInline?: boolean;
}

export default function CategoryTreeSelect({
  categories,
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

  // Parse tree from categories list
  const tree = (() => {
    // 1. Identify parents
    const parentCandidates = new Set<string>();
    for (const cat of categories) {
      for (const other of categories) {
        if (other !== cat && other.endsWith(' ' + cat)) {
          parentCandidates.add(cat);
        }
      }
    }

    // 2. Map children
    const childrenMap = new Map<string, string[]>();
    const childSet = new Set<string>();

    for (const cat of categories) {
      for (const parent of parentCandidates) {
        if (cat !== parent && cat.endsWith(' ' + parent)) {
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
    for (const cat of categories) {
      if (parentCandidates.has(cat) && !childSet.has(cat)) {
        const children = childrenMap.get(cat) || [];
        roots.push({
          id: cat,
          label: cat,
          isParent: true,
          children: children.map(child => ({
            id: child,
            label: child,
            isParent: false,
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
          isParent: false,
          children: []
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
    const lowerSearch = searchTerm.toLowerCase();

    const checkNode = (node: TreeNode): boolean => {
      let childMatches = false;
      if (node.children) {
        node.children.forEach(c => {
          if (c.label.toLowerCase().includes(lowerSearch)) {
            childMatches = true;
          }
        });
      }
      
      const selfMatches = node.label.toLowerCase().includes(lowerSearch);
      
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
      return selected.includes(node.id) && node.children.every(child => selected.includes(child.id));
    }
    return selected.includes(node.id);
  };

  const isIndeterminate = (node: TreeNode): boolean => {
    if (!node.isParent || node.children.length === 0) return false;
    
    const childCheckedCount = node.children.filter(child => selected.includes(child.id)).length;
    const parentChecked = selected.includes(node.id);
    
    const allChildrenChecked = childCheckedCount === node.children.length;
    const someChildrenChecked = childCheckedCount > 0;
    
    return (parentChecked && !allChildrenChecked) || (!parentChecked && someChildrenChecked);
  };

  const toggleNode = (node: TreeNode, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    let nextSelected = [...selected];
    
    if (node.isParent) {
      const currentlyChecked = isChecked(node);
      const allNodeIds = [node.id, ...node.children.map(c => c.id)];
      
      if (currentlyChecked) {
        // Uncheck parent and all children
        nextSelected = nextSelected.filter(id => !allNodeIds.includes(id));
      } else {
        // Check parent and all children
        allNodeIds.forEach(id => {
          if (!nextSelected.includes(id)) {
            nextSelected.push(id);
          }
        });
      }
    } else {
      // Leaf node or standalone node
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
    const lowerSearch = searchTerm.toLowerCase().trim();
    if (lowerSearch === '') return nodes;

    return nodes
      .map(node => {
        const matchesSelf = node.label.toLowerCase().includes(lowerSearch);
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

  // Render a node and recursively render children
  const renderNode = (node: TreeNode, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isNodeExpanded = expandedIds[node.id] ?? false;
    const checked = isChecked(node);
    const indeterminate = isIndeterminate(node);

    return (
      <div key={node.id} className="flex flex-col">
        <div 
          onClick={(e) => toggleNode(node, e)}
          className={`flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors select-none text-[13px] ${
            depth > 0 ? 'ml-6' : ''
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

          {/* Checkbox */}
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

          {/* Label */}
          <span className={`text-slate-700 font-medium ${node.isParent ? 'font-semibold' : ''}`}>
            {node.label}
          </span>
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

        {/* Quick Actions (Select All / Clear All) */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-xs font-semibold">
          <button 
            type="button"
            onClick={handleSelectAll} 
            className="text-[#1B3A6B] hover:underline"
          >
            Chọn tất cả
          </button>
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
        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[13px] text-gray-750 cursor-pointer flex justify-between items-center hover:border-blue-400 focus:border-blue-500 transition-colors shadow-sm"
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

          {/* Quick Actions (Select All / Clear All) */}
          <div className="flex justify-between items-center border-b border-slate-100 pb-2 text-xs font-semibold">
            <button 
              onClick={handleSelectAll} 
              className="text-[#1B3A6B] hover:underline"
            >
              Chọn tất cả
            </button>
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
