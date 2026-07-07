import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchApi, deleteReportWithReason, updateReport, uploadImages, approveReport, rejectReport, getFiltersData } from '../../api/client';
import { Download, X, ExternalLink, Image as ImageIcon, Loader, Search, Edit3, Save, Plus, Trash2, SlidersHorizontal, RotateCcw, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import CategoryTreeSelect from '../../components/CategoryTreeSelect';
import { formatOrderId } from '../../utils/text';
import { useAuth } from '../../context/AuthContext';

function copyToClipboard(text: string): boolean {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
    return true;
  }
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy failed', err);
    return false;
  }
}

// Check if a URL points to a directly viewable image
function isDirectImage(url: string): boolean {
  if (url.includes('cloudinary.com') || url.includes('res.cloudinary.com')) return true;
  if (url.includes('/uploads/')) return true; // Local uploads
  if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i)) return true;
  return false;
}

// Single image item component with loading/error states
function ImageItem({ url, index }: { url: string; index: number }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  if (!isDirectImage(url)) {
    // External link (Drive, etc.)
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2"
        style={{
          padding: '8px 10px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          color: '#1a56db',
          fontSize: '13px',
          textDecoration: 'none',
        }}
      >
        <ExternalLink size={14} style={{ flexShrink: 0 }} />
        Ảnh {index + 1} (mở link)
      </a>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {status === 'loading' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '6px'
        }}>
          <Loader size={18} className="animate-spin" style={{ marginRight: '8px' }} />
          <span style={{ fontSize: '13px', color: '#64748b' }}>Đang tải ảnh {index + 1}...</span>
        </div>
      )}
      {status === 'error' && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2"
          style={{
            padding: '8px 10px',
            backgroundColor: '#fef2f2',
            borderRadius: '6px',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '13px',
            textDecoration: 'none',
          }}
        >
          <ImageIcon size={14} style={{ flexShrink: 0 }} />
          Ảnh {index + 1} — nhấn để mở
        </a>
      )}
      <img
        src={url}
        alt={`Ảnh ${index + 1}`}
        style={{
          width: '100%',
          borderRadius: '6px',
          cursor: 'pointer',
          display: status === 'loaded' ? 'block' : 'none',
        }}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        onClick={() => window.open(url, '_blank')}
      />
    </div>
  );
}

interface FilterOptionsState {
  workTypes: string[];
  serviceTypes: string[];
  products: string[];
  productsDetailed?: { name: string; category: string | null }[];
  categories: string[];
  mainStations: { id: string; name: string }[];
  techStations: { id: string; name: string; mainStationId: string }[];
  ktvs: { id: string; name: string; techStationId: string }[];
  provinces: string[];
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder = "Tất cả"
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(item => item !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className="flex flex-col gap-1 relative w-full text-left" ref={containerRef}>
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[13px] text-gray-700 cursor-pointer flex justify-between items-center hover:border-blue-400 focus:border-blue-500 transition-colors"
      >
        <span className="truncate">
          {selected.length === 0 
            ? placeholder 
            : `${selected.length} đã chọn (${selected.slice(0, 2).join(', ')}${selected.length > 2 ? '...' : ''})`}
        </span>
        <span className="text-[10px] text-gray-400">▼</span>
      </div>
      {isOpen && (
        <div className="absolute top-[100%] left-0 right-0 z-30 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto p-2 flex flex-col gap-1.5">
          {options.map(opt => {
            const isChecked = selected.includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer select-none text-[13px]">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOption(opt)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-gray-750 font-medium">{opt}</span>
              </label>
            );
          })}
          {options.length === 0 && (
            <span className="text-xs text-gray-400 italic p-2 text-center">Không có lựa chọn</span>
          )}
        </div>
      )}
    </div>
  );
}

function MultiSelectObjectDropdown({
  label,
  options,
  selectedIds,
  onChange,
  placeholder = "Tất cả",
  onBeforeOpen
}: {
  label: string;
  options: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  onBeforeOpen?: () => boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(item => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const getSelectedNames = () => {
    return options
      .filter(opt => selectedIds.includes(opt.id))
      .map(opt => opt.name);
  };

  const selectedNames = getSelectedNames();

  return (
    <div className="flex flex-col gap-1 relative w-full text-left" ref={containerRef}>
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
      <div 
        onClick={() => {
          if (!isOpen && onBeforeOpen) {
            const allowed = onBeforeOpen();
            if (!allowed) return;
          }
          setIsOpen(!isOpen);
        }}
        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[13px] text-gray-700 cursor-pointer flex justify-between items-center hover:border-blue-400 focus:border-blue-500 transition-colors"
      >
        <span className="truncate">
          {selectedIds.length === 0 
            ? placeholder 
            : `${selectedIds.length} đã chọn (${selectedNames.slice(0, 2).join(', ')}${selectedNames.length > 2 ? '...' : ''})`}
        </span>
        <span className="text-[10px] text-gray-400">▼</span>
      </div>
      {isOpen && (
        <div className="absolute top-[100%] left-0 right-0 z-30 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto p-2 flex flex-col gap-1.5">
          {options.map(opt => {
            const isChecked = selectedIds.includes(opt.id);
            return (
              <label key={opt.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer select-none text-[13px]">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOption(opt.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span className="text-gray-750 font-medium">{opt.name}</span>
              </label>
            );
          })}
          {options.length === 0 && (
            <span className="text-xs text-gray-400 italic p-2 text-center">Không có lựa chọn</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportList() {
  const { user: currentUser } = useAuth();
  const canExportExcel = currentUser?.role === 'ADMIN' || currentUser?.role === 'DEV' || currentUser?.role === 'COORDINATOR' || (currentUser?.role === 'STAFF' && currentUser?.group === 'Service');
  const canEditOrDelete = currentUser?.role === 'ADMIN' || currentUser?.role === 'DEV' || currentUser?.role === 'COORDINATOR';
  const canApproveOrReject = currentUser?.role === 'ADMIN' || currentUser?.role === 'DEV' || currentUser?.role === 'COORDINATOR' || currentUser?.role === 'STAFF';

  const [searchParams, setSearchParams] = useSearchParams();
  const searchParam = searchParams.get('search') || '';

  const formatDate = (dateVal: any) => {
    if (!dateVal) return '---';
    return new Date(dateVal).toLocaleDateString('vi-VN');
  };

  const formatDateTime = (dateVal: any) => {
    if (!dateVal) return '---';
    const date = new Date(dateVal);
    const dateStr = date.toLocaleDateString('vi-VN');
    const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return `${timeStr} - ${dateStr}`;
  };

  const getRoleLabel = (role: string) => {
    if (!role) return 'Văn phòng';
    const r = role.toUpperCase();
    if (r === 'ADMIN') return 'Admin';
    if (r === 'COORDINATOR') return 'Điều phối';
    if (r === 'SALER') return 'Saler';
    if (r === 'DEV') return 'Dev';
    if (r === 'KTV') return 'KTV';
    return role;
  };

  const getStatusBadge = (status: string) => {
    const s = (status || 'hoàn thành').toLowerCase();
    if (s === 'hoàn thành') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Hoàn thành</span>;
    }
    if (s === 'đang thực hiện' || s === 'đang làm') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Đã phân công</span>;
    }
    if (s === 'chưa làm' || s === 'chờ xử lý') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Chưa làm</span>;
    }
    if (s === 'hủy đơn' || s === 'hủy') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-750 border border-red-200">Hủy đơn</span>;
    }
    if (s === 'đang hoàn') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Đang hoàn</span>;
    }
    if (s === 'đã hoàn') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-pink-50 text-pink-700 border border-pink-200">Đã hoàn</span>;
    }
    if (s === 'hoàn một phần') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">Hoàn một phần</span>;
    }
    if (s === 'đang đổi') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Đang đổi</span>;
    }
    if (s === 'đã đổi') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">Đã đổi</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-700 border border-gray-200 capitalize">{status}</span>;
  };

  const getApprovalStatusBadge = (status: string) => {
    const s = (status || 'APPROVED').toUpperCase();
    if (s === 'PENDING') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">Chờ duyệt</span>;
    }
    if (s === 'APPROVED') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Đã duyệt</span>;
    }
    if (s === 'REJECTED') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">Đã từ chối</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-750 border border-gray-200 capitalize">{status}</span>;
  };

  const [reports, setReports] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [totalPages, setTotalPages] = useState(1);
  const [selectedDetailReport, setSelectedDetailReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalActionLoading, setModalActionLoading] = useState(false);

  // States for Admin report approval adjustment
  const [dbProducts, setDbProducts] = useState<any[]>([]);
  const [adjustedItems, setAdjustedItems] = useState<{ productName: string; quantity: number; price?: number | null }[]>([]);
  const [adjustedDiscount, setAdjustedDiscount] = useState<number>(0);
  const [isAdjusting, setIsAdjusting] = useState<boolean>(false);

  // Fetch products for adjustment dropdown on mount
  useEffect(() => {
    getFiltersData().then(data => {
      if (data && data.products) {
        setDbProducts(data.products);
      }
    }).catch(err => console.error('Error fetching products for report approval:', err));
  }, []);

  // Parse items when selectedDetailReport changes
  useEffect(() => {
    if (selectedDetailReport) {
      const items: any[] = [];
      const origProducts = selectedDetailReport.products || [];
      const origSpareParts = selectedDetailReport.spareParts || [];
      const allStrings = [...origProducts, ...origSpareParts];

      for (const str of allStrings) {
        const match = str.match(/^(.+?)\s*x\s*(\d+)$/);
        let name = str.trim();
        let qty = 1;
        if (match) {
          name = match[1].trim();
          qty = parseInt(match[2], 10) || 1;
        }
        if (name) {
          items.push({ productName: name, quantity: qty, price: null });
        }
      }
      
      setAdjustedItems(items);
      setAdjustedDiscount(selectedDetailReport.order?.totalDiscount || 0);
      setIsAdjusting(false);
    }
  }, [selectedDetailReport]);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const handleModalApprove = async (reportId: string) => {
    if (!reportId || modalActionLoading) return;
    if (!window.confirm('Bạn có chắc chắn muốn duyệt báo cáo này?')) return;

    try {
      setModalActionLoading(true);
      const payload = isAdjusting ? {
        items: adjustedItems.map(item => ({
          productName: item.productName,
          quantity: item.quantity,
          price: item.price
        })),
        discount: adjustedDiscount
      } : undefined;

      const res = await approveReport(reportId, payload);
      alert(res.message || 'Phê duyệt báo cáo thành công');
      setSelectedDetailReport(null);
      loadReports();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi phê duyệt báo cáo');
    } finally {
      setModalActionLoading(false);
    }
  };

  const handleModalReject = async (reportId: string) => {
    if (!reportId || modalActionLoading) return;

    const reason = window.prompt('Nhập lý do từ chối báo cáo (bắt buộc):');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Vui lòng nhập lý do từ chối');
      return;
    }

    try {
      setModalActionLoading(true);
      const res = await rejectReport(reportId, reason.trim());
      alert(res.message || 'Từ chối báo cáo thành công');
      setSelectedDetailReport(null);
      loadReports();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi từ chối báo cáo');
    } finally {
      setModalActionLoading(false);
    }
  };
  const [filterMonth, setFilterMonth] = useState('');
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParam);
  const [datePreset, setDatePreset] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; reportId: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ── Advanced Filters State ──
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptionsState | null>(null);

  // Temporary filter selections in panel
  const [tempWorkTypes, setTempWorkTypes] = useState<string[]>([]);
  const [tempServiceTypes, setTempServiceTypes] = useState<string[]>([]);
  const [tempCategories, setTempCategories] = useState<string[]>([]);
  const [tempMainStationId, setTempMainStationId] = useState('');
  const [tempTechStations, setTempTechStations] = useState<string[]>([]);
  const [tempKtvs, setTempKtvs] = useState<string[]>([]);
  const [tempProvince, setTempProvince] = useState('');
  const [tempCompletedStart, setTempCompletedStart] = useState('');
  const [tempCompletedEnd, setTempCompletedEnd] = useState('');
  const [tempCreatedStart, setTempCreatedStart] = useState('');
  const [tempCreatedEnd, setTempCreatedEnd] = useState('');
  const [tempUpdatedStart, setTempUpdatedStart] = useState('');
  const [tempUpdatedEnd, setTempUpdatedEnd] = useState('');

  // Applied filter parameters sent to API
  const [appliedFilters, setAppliedFilters] = useState({
    workTypes: [] as string[],
    serviceTypes: [] as string[],
    categories: [] as string[],
    products: [] as string[],
    mainStationId: '',
    techStations: [] as string[],
    ktvs: [] as string[],
    province: '',
    completedStart: '',
    completedEnd: '',
    createdStart: '',
    createdEnd: '',
    updatedStart: '',
    updatedEnd: ''
  });

  // ── Edit mode state ──
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editImageFiles, setEditImageFiles] = useState<File[]>([]);
  const [editImagePreviews, setEditImagePreviews] = useState<string[]>([]);
  const [editUploadingImages, setEditUploadingImages] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const getDateRange = () => {
    if (!datePreset) return { startDate: '', endDate: '' };
    const now = new Date();
    if (datePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
    }
    if (datePreset === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
    }
    if (datePreset === 'week') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
    }
    if (datePreset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 0, 0, 0, 0);
      return { startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
    }
    if (datePreset === 'year') {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
    }
    if (datePreset === 'custom') {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    return { startDate: '', endDate: '' };
  };

  useEffect(() => {
    setSearch(searchParam);
  }, [searchParam]);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const data = await fetchApi('/reports/filter-options');
        setFilterOptions(data);
      } catch (err) {
        console.error('Lỗi lấy danh mục bộ lọc:', err);
      }
    };
    loadFilters();
  }, []);

  useEffect(() => {
    loadReports(searchParam);
  }, [filterMonth, datePreset, customStartDate, customEndDate, searchParam, appliedFilters, page]);

  const loadReports = async (overrideSearch?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '100');
      params.append('page', String(page));
      if (filterMonth) params.append('month', filterMonth);
      
      const currentSearch = overrideSearch !== undefined ? overrideSearch : search;
      if (currentSearch) params.append('search', currentSearch);
      
      const { startDate, endDate } = getDateRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      // Append advanced filters
      if (appliedFilters.workTypes.length > 0) {
        params.append('workTypes', appliedFilters.workTypes.join(','));
      }
      if (appliedFilters.serviceTypes.length > 0) {
        params.append('serviceTypes', appliedFilters.serviceTypes.join(','));
      }
      if (appliedFilters.categories.length > 0) {
        params.append('productCategories', appliedFilters.categories.join(','));
      }
      if (appliedFilters.products.length > 0) {
        params.append('products', appliedFilters.products.join(','));
      }
      if (appliedFilters.mainStationId) {
        params.append('mainStationId', appliedFilters.mainStationId);
      }
      if (appliedFilters.techStations.length > 0) {
        params.append('techStationIds', appliedFilters.techStations.join(','));
      }
      if (appliedFilters.ktvs.length > 0) {
        params.append('ktvIds', appliedFilters.ktvs.join(','));
      }
      if (appliedFilters.province) {
        params.append('province', appliedFilters.province);
      }
      if (appliedFilters.completedStart) {
        params.append('completedStart', appliedFilters.completedStart);
      }
      if (appliedFilters.completedEnd) {
        params.append('completedEnd', appliedFilters.completedEnd);
      }
      if (appliedFilters.createdStart) {
        params.append('createdStart', appliedFilters.createdStart);
      }
      if (appliedFilters.createdEnd) {
        params.append('createdEnd', appliedFilters.createdEnd);
      }
      if (appliedFilters.updatedStart) {
        params.append('updatedStart', appliedFilters.updatedStart);
      }
      if (appliedFilters.updatedEnd) {
        params.append('updatedEnd', appliedFilters.updatedEnd);
      }

      const data = await fetchApi(`/reports?${params.toString()}`);
      setReports(data.reports);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(search ? { search } : {});
    setPage(1);
  };

  const handleMainStationChange = (id: string) => {
    setTempMainStationId(id);
    setTempTechStations([]);
    setTempKtvs([]);
  };

  const handleTechStationsChange = (ids: string[]) => {
    setTempTechStations(ids);
    if (ids.length > 0 && filterOptions?.ktvs) {
      // Keep only KTVs that belong to one of the selected tech stations
      const validKtvs = tempKtvs.filter(ktvId => {
        const ktv = filterOptions.ktvs.find(k => k.id === ktvId);
        return ktv && ids.includes(ktv.techStationId);
      });
      setTempKtvs(validKtvs);
    }
  };

  const applyFilters = () => {
    const selectedCategories = tempCategories.filter(id => !id.startsWith('PROD:'));
    const selectedProducts = tempCategories.filter(id => id.startsWith('PROD:')).map(id => id.substring(5));

    setAppliedFilters({
      workTypes: tempWorkTypes,
      serviceTypes: tempServiceTypes,
      categories: selectedCategories,
      products: selectedProducts,
      mainStationId: tempMainStationId,
      techStations: tempTechStations,
      ktvs: tempKtvs,
      province: tempProvince,
      completedStart: tempCompletedStart,
      completedEnd: tempCompletedEnd,
      createdStart: tempCreatedStart,
      createdEnd: tempCreatedEnd,
      updatedStart: tempUpdatedStart,
      updatedEnd: tempUpdatedEnd
    });
    setPage(1);
  };

  const resetFilters = () => {
    setTempWorkTypes([]);
    setTempServiceTypes([]);
    setTempCategories([]);
    setTempMainStationId('');
    setTempTechStations([]);
    setTempKtvs([]);
    setTempProvince('');
    setTempCompletedStart('');
    setTempCompletedEnd('');
    setTempCreatedStart('');
    setTempCreatedEnd('');
    setTempUpdatedStart('');
    setTempUpdatedEnd('');

    setAppliedFilters({
      workTypes: [],
      serviceTypes: [],
      categories: [],
      products: [],
      mainStationId: '',
      techStations: [],
      ktvs: [],
      province: '',
      completedStart: '',
      completedEnd: '',
      createdStart: '',
      createdEnd: '',
      updatedStart: '',
      updatedEnd: ''
    });
    setPage(1);
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterMonth) params.append('month', filterMonth);
    if (search) params.append('search', search);
    
    const { startDate, endDate } = getDateRange();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    // Advanced filters
    if (appliedFilters.workTypes.length > 0) {
      params.append('workTypes', appliedFilters.workTypes.join(','));
    }
    if (appliedFilters.serviceTypes.length > 0) {
      params.append('serviceTypes', appliedFilters.serviceTypes.join(','));
    }
    if (appliedFilters.categories.length > 0) {
      params.append('productCategories', appliedFilters.categories.join(','));
    }
    if (appliedFilters.products.length > 0) {
      params.append('products', appliedFilters.products.join(','));
    }
    if (appliedFilters.mainStationId) {
      params.append('mainStationId', appliedFilters.mainStationId);
    }
    if (appliedFilters.techStations.length > 0) {
      params.append('techStationIds', appliedFilters.techStations.join(','));
    }
    if (appliedFilters.ktvs.length > 0) {
      params.append('ktvIds', appliedFilters.ktvs.join(','));
    }
    if (appliedFilters.province) {
      params.append('province', appliedFilters.province);
    }
    if (appliedFilters.completedStart) {
      params.append('completedStart', appliedFilters.completedStart);
    }
    if (appliedFilters.completedEnd) {
      params.append('completedEnd', appliedFilters.completedEnd);
    }
    if (appliedFilters.createdStart) {
      params.append('createdStart', appliedFilters.createdStart);
    }
    if (appliedFilters.createdEnd) {
      params.append('createdEnd', appliedFilters.createdEnd);
    }
    if (appliedFilters.updatedStart) {
      params.append('updatedStart', appliedFilters.updatedStart);
    }
    if (appliedFilters.updatedEnd) {
      params.append('updatedEnd', appliedFilters.updatedEnd);
    }

    const url = `/api/reports/export?${params.toString()}`;
    window.open(url, '_blank');
  };



  const confirmDeleteReport = async () => {
    if (!deleteModal) return;
    if (!deleteReason.trim()) {
      alert('Vui lòng nhập lý do xóa báo cáo');
      return;
    }
    
    setDeleting(true);
    try {
      await deleteReportWithReason(deleteModal.reportId, deleteReason);
      alert('Đã xóa báo cáo thành công');
      setDeleteModal(null);
      setDeleteReason('');
      loadReports();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi xóa báo cáo');
    } finally {
      setDeleting(false);
    }
  };

  // ── Edit mode helpers ──
  const startEditing = () => {
    const r = selectedDetailReport;
    if (!r) return;
    setEditData({
      customerName: r.customerName || '',
      customerPhone: r.customerPhone || '',
      address: r.address || '',
      province: r.province || '',
      workType: r.workType || '',
      serviceType: r.serviceType || '',
      products: r.products?.join(', ') || '',
      actualAmount: r.actualAmount ?? '',
      serialNumber: r.serialNumber || '',
      distanceKm: r.distanceKm ?? '',
      waterSource: r.waterSource || '',
      tdsIn: r.tdsIn ?? '',
      tdsOut: r.tdsOut ?? '',
      waterPressure: r.waterPressure ?? '',
      spareParts: r.spareParts || [],
      issueType: r.issueType || '',
      handlingMethod: r.handlingMethod || '',
      notes: r.notes || '',
      imageUrls: r.imageUrls ? [...r.imageUrls] : [],
    });
    setEditImageFiles([]);
    setEditImagePreviews([]);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditData({});
    editImagePreviews.forEach(p => URL.revokeObjectURL(p));
    setEditImageFiles([]);
    setEditImagePreviews([]);
  };

  const handleEditField = (field: string, value: any) => {
    setEditData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleRemoveExistingImage = (idx: number) => {
    setEditData((prev: any) => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_: string, i: number) => i !== idx),
    }));
  };

  const handleAddNewImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    setEditImageFiles(prev => [...prev, ...newFiles]);
    setEditImagePreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))]);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const handleRemoveNewImage = (idx: number) => {
    URL.revokeObjectURL(editImagePreviews[idx]);
    setEditImageFiles(prev => prev.filter((_, i) => i !== idx));
    setEditImagePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveEdit = async () => {
    if (!selectedDetailReport) return;
    setEditSaving(true);
    try {
      let finalImageUrls = [...editData.imageUrls];

      // Upload ảnh mới nếu có
      if (editImageFiles.length > 0) {
        setEditUploadingImages(true);
        try {
          const newUrls = await uploadImages(editImageFiles);
          finalImageUrls = [...finalImageUrls, ...newUrls];
        } finally {
          setEditUploadingImages(false);
        }
      }

      const payload: any = {
        customerName: editData.customerName,
        customerPhone: editData.customerPhone,
        address: editData.address,
        province: editData.province,
        workType: editData.workType,
        serviceType: editData.serviceType,
        products: editData.products ? editData.products.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
        actualAmount: editData.actualAmount,
        serialNumber: editData.serialNumber,
        distanceKm: editData.distanceKm,
        waterSource: editData.waterSource,
        tdsIn: editData.tdsIn,
        tdsOut: editData.tdsOut,
        waterPressure: editData.waterPressure,
        spareParts: editData.spareParts,
        issueType: editData.issueType,
        handlingMethod: editData.handlingMethod,
        notes: editData.notes,
        imageUrls: finalImageUrls,
      };

      await updateReport(selectedDetailReport.id, payload);
      alert('Đã cập nhật báo cáo thành công!');
      cancelEditing();
      setSelectedDetailReport(null);
      loadReports();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi cập nhật báo cáo');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <>
      <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-2xl text-[#1B3A6B]">Danh sách báo cáo</h2>
        {canExportExcel && (
          <button className="btn btn-outline flex items-center gap-2" onClick={handleExport}>
            <Download size={18} /> Xuất Excel
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200 mb-6 shadow-sm">
        <form onSubmit={handleSearch} className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm theo Mã đơn, KTV, Khách hàng, SĐT..."
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="flex flex-wrap items-center gap-3">
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                className="px-3 py-1.5 text-[13px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                value={customStartDate}
                onChange={(e) => { setCustomStartDate(e.target.value); setPage(1); }}
              />
              <span className="text-gray-400 text-sm">đến</span>
              <input 
                type="date" 
                className="px-3 py-1.5 text-[13px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                value={customEndDate}
                onChange={(e) => { setCustomEndDate(e.target.value); setPage(1); }}
              />
            </div>
          )}
          <select 
            className="px-3 py-2 text-[13px] border border-gray-300 rounded-md bg-white text-gray-700 outline-none"
            value={datePreset}
            onChange={(e) => { setDatePreset(e.target.value); setPage(1); }}
          >
            <option value="">Tất cả thời gian</option>
            <option value="today">Hôm nay</option>
            <option value="yesterday">Hôm qua</option>
            <option value="week">1 tuần qua</option>
            <option value="month">1 tháng qua</option>
            <option value="year">1 năm qua</option>
            <option value="custom">Tự chọn khoảng...</option>
          </select>

          <input 
            type="text" 
            className="px-3 py-1.5 text-[13px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
            style={{ width: '130px' }} 
            placeholder="Tháng (vd: 5/2026)" 
            value={filterMonth}
            onChange={e => { setFilterMonth(e.target.value); setPage(1); }}
          />

          <button 
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 text-[13px] border rounded-md font-medium transition-colors ${
              showFilters 
                ? 'bg-blue-50 text-blue-750 border-blue-300 hover:bg-blue-100' 
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={14} />
            Bộ lọc nâng cao
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-5 rounded-lg border border-gray-200 mb-6 shadow-sm flex flex-col gap-5 animate-fade-in text-left">
          {/* Row 1: Công việc & Sản phẩm */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MultiSelectDropdown
              label="Loại công việc"
              options={filterOptions?.workTypes || []}
              selected={tempWorkTypes}
              onChange={setTempWorkTypes}
            />
            <MultiSelectDropdown
              label="Loại dịch vụ"
              options={filterOptions?.serviceTypes || []}
              selected={tempServiceTypes}
              onChange={setTempServiceTypes}
            />
            <CategoryTreeSelect
              label="Danh mục & Sản phẩm"
              categories={filterOptions?.categories || []}
              products={filterOptions?.productsDetailed || []}
              selected={tempCategories}
              onChange={setTempCategories}
            />
          </div>

          {/* Row 2: Trạm & KTV & Tỉnh */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Trạm chính (Single Select) */}
            <div className="flex flex-col gap-1 relative w-full text-left">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Trạm chính</label>
              <select
                value={tempMainStationId}
                onChange={(e) => handleMainStationChange(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[13px] text-gray-700 outline-none hover:border-blue-400 focus:border-blue-500 transition-colors"
              >
                <option value="">Tất cả</option>
                {filterOptions?.mainStations.map(station => (
                  <option key={station.id} value={station.id}>{station.name}</option>
                ))}
              </select>
            </div>

             {/* Trạm kỹ thuật (Multi Select cascading) */}
            <MultiSelectObjectDropdown
              label="Trạm kỹ thuật"
              options={
                tempMainStationId
                  ? (filterOptions?.techStations.filter(t => t.mainStationId === tempMainStationId) || [])
                  : (filterOptions?.techStations || [])
              }
              selectedIds={tempTechStations}
              onChange={handleTechStationsChange}
              onBeforeOpen={() => {
                if (!tempMainStationId) {
                  alert('Vui lòng chọn Trạm chính trước khi chọn Trạm kỹ thuật.');
                  return false;
                }
                return true;
              }}
            />

            {/* KTV (Multi Select cascading) */}
            <MultiSelectObjectDropdown
              label="Kỹ thuật viên (KTV)"
              options={
                (tempTechStations.length > 0
                  ? (filterOptions?.ktvs.filter(k => tempTechStations.includes(k.techStationId)) || [])
                  : (tempMainStationId
                      ? (filterOptions?.ktvs.filter(k => {
                          const ts = filterOptions?.techStations.find(t => t.id === k.techStationId);
                          return ts && ts.mainStationId === tempMainStationId;
                        }) || [])
                      : (filterOptions?.ktvs || [])
                    )
                ).map((k: any) => ({ id: k.id, name: k.fullName || k.name || '' }))
              }
              selectedIds={tempKtvs}
              onChange={setTempKtvs}
              onBeforeOpen={() => {
                if (!tempMainStationId) {
                  alert('Vui lòng chọn Trạm chính trước khi chọn Kỹ thuật viên.');
                  return false;
                }
                if (tempTechStations.length === 0) {
                  alert('Vui lòng chọn Trạm kỹ thuật trước khi chọn Kỹ thuật viên.');
                  return false;
                }
                return true;
              }}
            />

            {/* Tỉnh / Thành phố */}
            <div className="flex flex-col gap-1 relative w-full text-left">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tỉnh / Thành phố</label>
              <select
                value={tempProvince}
                onChange={(e) => setTempProvince(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-[13px] text-gray-700 outline-none hover:border-blue-400 focus:border-blue-500 transition-colors"
              >
                <option value="">Tất cả</option>
                {filterOptions?.provinces.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Các mốc thời gian */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Thời gian hoàn thành */}
            <div className="bg-gray-50 p-3 rounded-md border border-gray-100 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={12} className="text-gray-400" />
                Thời gian hoàn thành
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                  value={tempCompletedStart}
                  onChange={(e) => setTempCompletedStart(e.target.value)}
                />
                <span className="text-gray-400 text-xs">đến</span>
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                  value={tempCompletedEnd}
                  onChange={(e) => setTempCompletedEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Thời gian tạo đơn */}
            <div className="bg-gray-50 p-3 rounded-md border border-gray-100 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={12} className="text-gray-400" />
                Thời gian tạo đơn
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                  value={tempCreatedStart}
                  onChange={(e) => setTempCreatedStart(e.target.value)}
                />
                <span className="text-gray-400 text-xs">đến</span>
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                  value={tempCreatedEnd}
                  onChange={(e) => setTempCreatedEnd(e.target.value)}
                />
              </div>
            </div>

            {/* Thời gian cập nhật */}
            <div className="bg-gray-50 p-3 rounded-md border border-gray-100 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={12} className="text-gray-400" />
                Thời gian cập nhật
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                  value={tempUpdatedStart}
                  onChange={(e) => setTempUpdatedStart(e.target.value)}
                />
                <span className="text-gray-400 text-xs">đến</span>
                <input
                  type="date"
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                  value={tempUpdatedEnd}
                  onChange={(e) => setTempUpdatedEnd(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Buttons: Apply / Reset */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-150">
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors font-medium cursor-pointer"
            >
              <RotateCcw size={14} />
              Đặt lại
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="flex items-center gap-1.5 px-5 py-2 text-[13px] text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors font-semibold cursor-pointer"
            >
              Áp dụng
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10"><span className="spinner border-t-[#1B3A6B]"></span></div>
      ) : (
        <>
          <div className="card table-container" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', minWidth: '80px' }}>Mã đơn</th>
                <th style={{ padding: '12px 16px', minWidth: '150px' }}>Khách hàng</th>
                <th style={{ padding: '12px 16px', minWidth: '220px' }}>Công việc</th>
                <th style={{ padding: '12px 16px', minWidth: '110px' }}>Thao tác</th>
                <th style={{ padding: '12px 16px', minWidth: '180px' }}>Trạm-KTV</th>
                <th style={{ padding: '12px 16px', minWidth: '140px' }}>Tạo bởi - lúc</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const urls: string[] = r.imageUrls && r.imageUrls.length > 0 ? [...new Set(r.imageUrls)] as string[] : [];
                const isPopupOpen = openPopupId === r.id;

                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: '1px solid var(--border-color)' }}
                    className={`hover:bg-gray-50 transition-colors ${r.mainStationId ? 'bg-purple-50/30' : ''}`}
                  >
                    {/* Mã đơn */}
                    <td style={{ padding: '12px 16px' }}>
                      {r.order?.pancakeOrderId ? (
                        <div className="flex flex-col gap-0.5 items-start">
                          <span
                            onClick={() => {
                              const idStr = formatOrderId(r.order.pancakeOrderId);
                              copyToClipboard(idStr);
                              alert(`Đã sao chép mã đơn: ${idStr}`);
                            }}
                            className="font-bold text-blue-700 cursor-pointer hover:underline"
                            title="Click để sao chép mã đơn"
                          >
                            {formatOrderId(r.order.pancakeOrderId)}
                          </span>
                          {r.order.orderSource && /shopee|lazada|tiktok|tiki/i.test(r.order.orderSource) && (() => {
                            try {
                              const raw = typeof r.order.rawData === 'string' ? JSON.parse(r.order.rawData) : r.order.rawData;
                              const originalId = raw?.id;
                              if (originalId) {
                                return (
                                  <span
                                    onClick={() => {
                                      copyToClipboard(String(originalId));
                                      alert(`Đã sao chép mã đơn gốc: ${originalId}`);
                                    }}
                                    className="text-[9px] text-gray-500 font-mono bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 mt-0.5 cursor-pointer hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors inline-block break-all max-w-[85px] leading-tight select-all"
                                    title="Click để sao chép mã đơn gốc từ POS"
                                  >
                                    {originalId}
                                  </span>
                                );
                              }
                            } catch (e) {}
                            return null;
                          })()}
                        </div>
                      ) : (
                        <span className="text-gray-400 font-semibold text-[10px] bg-gray-100 px-2 py-0.5 rounded">Đơn lẻ</span>
                      )}
                    </td>

                    {/* Khách hàng */}
                    <td style={{ padding: '12px 16px' }}>
                      <div className="font-bold text-gray-800">{r.customerName}</div>
                      <div 
                        onClick={() => {
                          if (r.customerPhone) {
                            copyToClipboard(r.customerPhone);
                            alert(`Đã sao chép SĐT: ${r.customerPhone}`);
                          }
                        }}
                        className="text-xs text-blue-600 font-semibold mt-0.5 cursor-pointer hover:text-blue-850 hover:underline inline-block"
                        title="Click để sao chép số điện thoại"
                      >
                        {r.customerPhone}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 max-w-[150px] leading-relaxed truncate" title={r.address}>{r.address || '---'}</div>
                    </td>

                    {/* Công việc */}
                    <td style={{ padding: '12px 16px' }} className="text-xs leading-relaxed text-gray-700">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {getStatusBadge(r.order?.adminStatus)}
                        {getApprovalStatusBadge(r.approvalStatus)}
                      </div>
                      <div><span className="text-gray-400">Hẹn khách:</span> <span className="font-medium">{formatDate(r.order?.appointmentTime)}</span></div>
                      <div><span className="text-gray-400">Hoàn thành:</span> <span className="font-semibold text-gray-800">{formatDateTime(r.createdAt)}</span></div>
                      {r.workType && <div><span className="text-gray-400">Công việc:</span> <span className="font-semibold text-purple-750 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 inline-block mt-0.5">{r.workType}</span></div>}
                      {r.serviceType && <div><span className="text-gray-400">Dịch vụ:</span> <span className="font-medium text-gray-800">{r.serviceType}</span></div>}
                      {r.products && r.products.length > 0 && (
                        <div className="max-w-[200px] truncate" title={r.products.join(', ')}>
                          <span className="text-gray-400">Sản phẩm:</span> <span className="font-medium text-gray-600">{r.products.join(', ')}</span>
                        </div>
                      )}
                      <div className="mt-0.5"><span className="text-gray-400">Thu:</span> <span className="font-extrabold text-emerald-600">{(r.actualAmount || 0).toLocaleString('vi-VN')} đ</span></div>
                    </td>


                    {/* Thao tác */}
                    <td style={{ padding: '12px 16px', position: 'relative' }}>
                      <div className="flex flex-col gap-1.5 text-xs font-semibold">
                        <button 
                          onClick={() => setSelectedDetailReport(r)}
                          className="text-left text-blue-600 hover:text-blue-800 hover:underline"
                          style={{ background: 'none', cursor: 'pointer' }}
                        >
                          • Chi tiết
                        </button>
                        
                        {urls.length > 0 && (
                          <button 
                            onClick={() => setOpenPopupId(isPopupOpen ? null : r.id)}
                            className="text-left text-blue-800 hover:text-blue-950 hover:underline"
                            style={{ background: 'none', cursor: 'pointer' }}
                          >
                            • Xem ảnh
                          </button>
                        )}
                        
                        {canEditOrDelete && (
                          <button
                            onClick={() => setDeleteModal({ isOpen: true, reportId: r.id })}
                            className="text-left text-red-655 hover:text-red-805 hover:underline"
                            style={{ background: 'none', cursor: 'pointer' }}
                          >
                            • Xóa
                          </button>
                        )}
                      </div>
                      
                      {isPopupOpen && urls.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          zIndex: 50,
                          backgroundColor: '#fff',
                          borderRadius: '8px',
                          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                          border: '1px solid var(--border-color)',
                          padding: '12px',
                          width: '340px',
                          maxHeight: '500px',
                          overflowY: 'auto'
                        }}>
                          <div className="flex justify-between items-center" style={{ marginBottom: '10px' }}>
                            <span className="text-sm font-bold">Hình ảnh báo cáo ({urls.length})</span>
                            <button onClick={() => setOpenPopupId(null)} style={{ background: 'none', padding: '4px', cursor: 'pointer' }}>
                              <X size={16} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {urls.map((url: string, idx: number) => (
                              <ImageItem key={idx} url={url} index={idx} />
                            ))}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Trạm-KTV */}
                    <td style={{ padding: '12px 16px' }} className="text-xs leading-relaxed text-gray-700">
                      <div>
                        <span className="text-gray-400">Trạm chính:</span>{' '}
                        <span className="font-semibold text-gray-800">
                          {r.mainStation?.name || r.order?.mainStation?.name || r.ktvUser?.techStation?.mainStation?.name || '---'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Trạm Kỹ thuật:</span>{' '}
                        <span className="font-semibold text-gray-800">
                          {r.order?.techStation?.name || r.ktvUser?.techStation?.name || '---'}
                        </span>
                      </div>
                      <div className="mt-1 font-bold text-blue-750">
                        {r.mainStationId ? 'Người báo cáo:' : 'KTV:'} {r.ktvUser.fullName}
                      </div>
                      {r.mainStationId && (
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                            Báo cáo từ {getRoleLabel(r.ktvUser?.role)}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Tạo bởi - lúc */}
                    <td style={{ padding: '12px 16px' }} className="text-xs leading-relaxed text-gray-600 whitespace-normal">
                      {r.order?.pancakeCreatedAt ? (() => {
                        const date = new Date(r.order.pancakeCreatedAt);
                        return (
                          <div className="font-bold text-gray-800">
                            {date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {date.toLocaleDateString('vi-VN')}
                          </div>
                        );
                      })() : <div className="text-gray-400 font-medium">-</div>}

                      <div className="mt-0.5 text-gray-400 text-[10px]">
                        Tạo bởi:{' '}
                        {(() => {
                          let raw = r.order?.rawData;
                          if (typeof raw === 'string') {
                            try {
                              raw = JSON.parse(raw);
                            } catch (e) {
                              raw = null;
                            }
                          }
                          const creatorName = raw?.creator?.name;
                          if (creatorName) {
                            return <span className="font-semibold text-gray-700">{creatorName}</span>;
                          }
                          const source = (r.order?.orderSource || raw?.order_sources_name || '').toLowerCase();
                          const isEcom = source.includes('shopee') || source.includes('lazada') || source.includes('tiktok') || source.includes('tiki');
                          if (isEcom) {
                            return <span className="text-blue-600 bg-blue-50 px-1 py-0.2 rounded text-[10px] font-semibold">Hệ thống</span>;
                          }
                          return <span className="text-gray-500">-</span>;
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">Không có dữ liệu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200 text-[13px] text-gray-600 bg-white rounded-b-xl">
            <div className="flex items-center gap-1.5">
              <span>Trang</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pageInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d+$/.test(val)) {
                    setPageInput(val);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt(pageInput, 10);
                    if (!isNaN(val) && val >= 1 && val <= totalPages) {
                      setPage(val);
                    } else {
                      setPageInput(String(page));
                    }
                  }
                }}
                onBlur={() => {
                  const val = parseInt(pageInput, 10);
                  if (!isNaN(val) && val >= 1 && val <= totalPages) {
                    setPage(val);
                  } else {
                    setPageInput(String(page));
                  }
                }}
                className="w-12 text-center border border-gray-300 rounded px-1.5 py-0.5 text-gray-900 font-medium focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              />
              <span>/ <span className="font-medium text-gray-900">{totalPages}</span></span>
            </div>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 border rounded cursor-pointer disabled:opacity-50"><ChevronLeft size={16} /></button>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 border rounded cursor-pointer disabled:opacity-50"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </>
      )}
      </div>

      {selectedDetailReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-100">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-lg text-[#1B3A6B]">
                {isEditing ? 'Sửa' : 'Chi tiết'} báo cáo {selectedDetailReport.order?.pancakeOrderId ? formatOrderId(selectedDetailReport.order.pancakeOrderId) : ''}
              </h3>
              <button 
                onClick={() => { cancelEditing(); setSelectedDetailReport(null); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 space-y-6 text-left">

              {/* ═══════════ VIEW MODE ═══════════ */}
              {!isEditing ? (
                <>
                  {/* Step 1: Thông tin chung */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 border-l-4 border-blue-600 pl-2 mb-3 uppercase tracking-wider">
                      Bước 1: Thông tin chung
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                      <div>
                        <span className="text-gray-500 block text-xs">Khách hàng</span>
                        <span className="font-semibold text-gray-800">{selectedDetailReport.customerName}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Số điện thoại</span>
                        <span 
                          onClick={() => {
                            if (selectedDetailReport.customerPhone) {
                              copyToClipboard(selectedDetailReport.customerPhone);
                              alert(`Đã sao chép SĐT: ${selectedDetailReport.customerPhone}`);
                            }
                          }}
                          className="font-semibold text-gray-800 cursor-pointer hover:text-blue-600 hover:underline"
                          title="Click để sao chép số điện thoại"
                        >
                          {selectedDetailReport.customerPhone}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-500 block text-xs">Địa chỉ chi tiết</span>
                        <span className="font-medium text-gray-800">{selectedDetailReport.address || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Tỉnh / Thành phố</span>
                        <span className="font-medium text-gray-800">{selectedDetailReport.province}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Kỹ thuật viên</span>
                        <span className="font-medium text-gray-800">{selectedDetailReport.ktvUser?.fullName}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Loại công việc</span>
                        <span className="font-semibold text-[#1B3A6B]">{selectedDetailReport.workType || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Loại dịch vụ</span>
                        <span className="font-medium text-gray-800">{selectedDetailReport.serviceType}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-500 block text-xs">Sản phẩm thực tế</span>
                        <span className="font-medium text-gray-800">{selectedDetailReport.products?.join(', ') || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Số tiền thu thực tế</span>
                        <span className="font-bold text-emerald-600 text-base">
                          {(selectedDetailReport.actualAmount || 0).toLocaleString('vi-VN')} đ
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Tháng báo cáo</span>
                        <span className="font-medium text-gray-800">{selectedDetailReport.month}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Trạng thái phê duyệt</span>
                        <span className="mt-0.5 inline-block">{getApprovalStatusBadge(selectedDetailReport.approvalStatus)}</span>
                      </div>
                      {selectedDetailReport.rejectReason && (
                        <div className="col-span-2">
                          <span className="text-gray-500 block text-xs font-semibold text-red-650">Lý do từ chối</span>
                          <span className="font-medium text-red-750 bg-red-50 border border-red-100 px-2 py-1 rounded block mt-0.5">{selectedDetailReport.rejectReason}</span>
                        </div>
                      )}
                      {selectedDetailReport.order?.ktvCalledAt && (
                        <div className="col-span-2">
                          <span className="text-gray-500 block text-xs">Thời gian KTV gọi khách</span>
                          <span className="font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md mt-1 w-max flex items-center gap-1 text-[13px]">
                            📞 Đã gọi lúc {new Date(selectedDetailReport.order.ktvCalledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(selectedDetailReport.order.ktvCalledAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Step 2: Thông tin kỹ thuật */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 border-l-4 border-blue-600 pl-2 mb-3 uppercase tracking-wider">
                      Bước 2: Thông tin kỹ thuật
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                      <div>
                        <span className="text-gray-500 block text-xs">Seri sản phẩm</span>
                        <span className="font-semibold text-gray-800">{selectedDetailReport.serialNumber || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Khoảng cách di chuyển</span>
                        <span className="font-medium text-gray-800">
                          {selectedDetailReport.distanceKm ? `${selectedDetailReport.distanceKm} km` : '-'}
                        </span>
                      </div>
                      
                      {selectedDetailReport.waterSource && (
                        <>
                          <div>
                            <span className="text-gray-500 block text-xs">Nguồn nước</span>
                            <span className="font-medium text-gray-800">{selectedDetailReport.waterSource}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-xs">Áp suất nước đầu vào</span>
                            <span className="font-medium text-gray-800">
                              {selectedDetailReport.waterPressure ? `${selectedDetailReport.waterPressure} psi` : '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-xs">Chỉ số TDS vào</span>
                            <span className="font-semibold text-gray-800">{selectedDetailReport.tdsIn || 0} ppm</span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-xs">Chỉ số TDS ra</span>
                            <span className="font-semibold text-gray-800">{selectedDetailReport.tdsOut || 0} ppm</span>
                          </div>
                        </>
                      )}
                      
                      {selectedDetailReport.issueType && (
                        <div>
                          <span className="text-gray-500 block text-xs">Nguyên nhân / Sự cố</span>
                          <span className="font-medium text-gray-800">{selectedDetailReport.issueType}</span>
                        </div>
                      )}
                      {selectedDetailReport.handlingMethod && (
                        <div>
                          <span className="text-gray-500 block text-xs">Cách xử lý</span>
                          <span className="font-medium text-gray-800">{selectedDetailReport.handlingMethod}</span>
                        </div>
                      )}
                      
                      <div className="col-span-2">
                        <span className="text-gray-500 block text-xs">Linh kiện phát sinh</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {selectedDetailReport.spareParts && selectedDetailReport.spareParts.length > 0 ? (
                            selectedDetailReport.spareParts.map((part: string, index: number) => (
                              <span key={index} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded border border-blue-100">
                                {part}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-500 italic">Không có linh kiện phát sinh</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Step 3: Hình ảnh xác nhận */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 border-l-4 border-blue-600 pl-2 mb-3 uppercase tracking-wider">
                      Bước 3: Hình ảnh xác nhận
                    </h4>
                    {selectedDetailReport.imageUrls && selectedDetailReport.imageUrls.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {selectedDetailReport.imageUrls.map((url: string, index: number) => (
                          <div key={index} className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
                            <img 
                              src={url} 
                              alt={`Báo cáo ảnh ${index + 1}`} 
                              className="w-full h-40 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                              onClick={() => window.open(url, '_blank')}
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-65 text-white text-xs px-2 py-1 font-medium text-center">
                              Ảnh {index + 1} (Click để mở rộng)
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-gray-50 text-gray-500 text-sm p-4 rounded-lg italic text-center">
                        Không có hình ảnh xác nhận
                      </div>
                    )}
                  </div>
                  
                  {/* Step 4: Ghi chú */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 border-l-4 border-blue-600 pl-2 mb-3 uppercase tracking-wider">
                      Bước 4: Xác nhận & Ghi chú của KTV
                    </h4>
                    <div className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap italic text-gray-700 border-l-2 border-gray-300">
                      {selectedDetailReport.notes || 'Kỹ thuật viên không để lại ghi chú nào.'}
                    </div>
                  </div>

                  {/* Step 5: Điều chỉnh của Admin (Chỉ hiện khi PENDING) */}
                  {selectedDetailReport.approvalStatus === 'PENDING' && canApproveOrReject && (
                    <div className="mt-6 border-t border-gray-200 pt-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-sm text-gray-800 border-l-4 border-emerald-600 pl-2 uppercase tracking-wider">
                          Điều chỉnh linh kiện & Chiết khấu (Admin)
                        </h4>
                        <label className="flex items-center gap-2 text-sm font-semibold text-emerald-700 cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                            checked={isAdjusting}
                            onChange={(e) => setIsAdjusting(e.target.checked)}
                          />
                          Kích hoạt điều chỉnh
                        </label>
                      </div>

                      {isAdjusting && (
                        <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-4 text-sm">
                          {/* List of items */}
                          <div className="space-y-3 mb-4">
                            {adjustedItems.map((item, idx) => (
                              <div key={idx} className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-lg shadow-sm border border-gray-155">
                                <div className="flex-1 min-w-[200px]">
                                  <span className="font-semibold text-gray-800">{item.productName}</span>
                                </div>
                                <div className="w-24">
                                  <label className="block text-[10px] text-gray-500 font-bold uppercase mb-0.5">Số lượng</label>
                                  <input
                                    type="number"
                                    min="1"
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10) || 1;
                                      const updated = [...adjustedItems];
                                      updated[idx].quantity = val;
                                      setAdjustedItems(updated);
                                    }}
                                  />
                                </div>
                                <div className="w-32">
                                  <label className="block text-[10px] text-gray-500 font-bold uppercase mb-0.5">Đơn giá tùy chỉnh</label>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Giá niêm yết"
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                    value={item.price !== null && item.price !== undefined ? item.price : ''}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? null : parseFloat(e.target.value);
                                      const updated = [...adjustedItems];
                                      updated[idx].price = val;
                                      setAdjustedItems(updated);
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdjustedItems(adjustedItems.filter((_, i) => i !== idx));
                                  }}
                                  className="mt-4 text-red-600 hover:text-red-800 font-semibold text-xs cursor-pointer"
                                >
                                  Xóa
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Add item dropdown */}
                          <div className="flex gap-2 mb-4 max-w-md">
                            <select
                              id="add-item-select"
                              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
                              defaultValue=""
                              onChange={(e) => {
                                const selectedName = e.target.value;
                                if (!selectedName) return;
                                if (adjustedItems.some(i => i.productName === selectedName)) {
                                  alert('Sản phẩm này đã có trong danh sách');
                                  e.target.value = '';
                                  return;
                                }
                                setAdjustedItems([...adjustedItems, { productName: selectedName, quantity: 1, price: null }]);
                                e.target.value = '';
                              }}
                            >
                              <option value="">-- Thêm linh kiện mới --</option>
                              {dbProducts.map((p, pidx) => (
                                <option key={pidx} value={p.name}>
                                  {p.name} - {(p.sellingPrice || 0).toLocaleString('vi-VN')}đ
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* General discount */}
                          <div className="max-w-xs border-t border-emerald-100 pt-3">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Số tiền chiết khấu / giảm giá (VNĐ):
                            </label>
                            <input
                              type="number"
                              min="0"
                              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
                              value={adjustedDiscount}
                              onChange={(e) => setAdjustedDiscount(parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* ═══════════ EDIT MODE ═══════════ */
                <>
                  {/* Thông tin chung */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 border-l-4 border-amber-500 pl-2 mb-3 uppercase tracking-wider">
                      Thông tin chung
                    </h4>
                    <div className="bg-amber-50 rounded-lg p-4 grid grid-cols-2 gap-y-4 gap-x-6 text-sm border border-amber-200">
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Khách hàng</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.customerName} onChange={e => handleEditField('customerName', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Số điện thoại</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.customerPhone} onChange={e => handleEditField('customerPhone', e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Địa chỉ chi tiết</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.address} onChange={e => handleEditField('address', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Tỉnh / Thành phố</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.province} onChange={e => handleEditField('province', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Loại công việc</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.workType} onChange={e => handleEditField('workType', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Loại dịch vụ</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.serviceType} onChange={e => handleEditField('serviceType', e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Sản phẩm (phân cách bằng dấu phẩy)</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.products} onChange={e => handleEditField('products', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Số tiền thu thực tế (đ)</label>
                        <input type="number" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.actualAmount} onChange={e => handleEditField('actualAmount', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* Thông tin kỹ thuật */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 border-l-4 border-amber-500 pl-2 mb-3 uppercase tracking-wider">
                      Thông tin kỹ thuật
                    </h4>
                    <div className="bg-amber-50 rounded-lg p-4 grid grid-cols-2 gap-y-4 gap-x-6 text-sm border border-amber-200">
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Seri sản phẩm</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.serialNumber} onChange={e => handleEditField('serialNumber', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Khoảng cách (km)</label>
                        <input type="number" step="0.1" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.distanceKm} onChange={e => handleEditField('distanceKm', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Nguồn nước</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.waterSource} onChange={e => handleEditField('waterSource', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Áp suất nước (psi)</label>
                        <input type="number" step="0.1" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.waterPressure} onChange={e => handleEditField('waterPressure', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">TDS đầu vào (ppm)</label>
                        <input type="number" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.tdsIn} onChange={e => handleEditField('tdsIn', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">TDS đầu ra (ppm)</label>
                        <input type="number" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.tdsOut} onChange={e => handleEditField('tdsOut', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Nguyên nhân / Sự cố</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.issueType} onChange={e => handleEditField('issueType', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Cách xử lý</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.handlingMethod} onChange={e => handleEditField('handlingMethod', e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-gray-600 block text-xs font-semibold mb-1">Linh kiện phát sinh (phân cách bằng dấu phẩy)</label>
                        <input type="text" className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          value={editData.spareParts?.join(', ') || ''}
                          onChange={e => handleEditField('spareParts', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))} />
                      </div>
                    </div>
                  </div>

                  {/* Hình ảnh */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 border-l-4 border-amber-500 pl-2 mb-3 uppercase tracking-wider">
                      Hình ảnh xác nhận
                    </h4>
                    <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                      {/* Ảnh hiện tại */}
                      {editData.imageUrls && editData.imageUrls.length > 0 && (
                        <div className="mb-3">
                          <span className="text-xs font-semibold text-gray-600 block mb-2">Ảnh hiện tại ({editData.imageUrls.length})</span>
                          <div className="grid grid-cols-3 gap-2">
                            {editData.imageUrls.map((url: string, idx: number) => (
                              <div key={idx} className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
                                <img src={url} alt={`Ảnh ${idx + 1}`} className="w-full h-24 object-cover" />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExistingImage(idx)}
                                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Xóa ảnh này"
                                >
                                  <Trash2 size={12} />
                                </button>
                                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white text-[10px] px-1 py-0.5 text-center">
                                  Ảnh {idx + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ảnh mới thêm */}
                      {editImagePreviews.length > 0 && (
                        <div className="mb-3">
                          <span className="text-xs font-semibold text-green-700 block mb-2">Ảnh mới thêm ({editImagePreviews.length})</span>
                          <div className="grid grid-cols-3 gap-2">
                            {editImagePreviews.map((preview, idx) => (
                              <div key={idx} className="relative group border-2 border-green-400 rounded-lg overflow-hidden bg-green-50">
                                <img src={preview} alt={`Ảnh mới ${idx + 1}`} className="w-full h-24 object-cover" />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveNewImage(idx)}
                                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Xóa ảnh mới này"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Nút thêm ảnh */}
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        disabled={editSaving}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Plus size={16} /> Thêm ảnh mới
                      </button>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        ref={editFileInputRef}
                        onChange={handleAddNewImages}
                      />
                    </div>
                  </div>

                  {/* Ghi chú */}
                  <div>
                    <h4 className="font-bold text-sm text-gray-800 border-l-4 border-amber-500 pl-2 mb-3 uppercase tracking-wider">
                      Ghi chú của KTV
                    </h4>
                    <textarea
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-800 bg-white min-h-[80px]"
                      value={editData.notes}
                      onChange={e => handleEditField('notes', e.target.value)}
                      placeholder="Ghi chú..."
                    />
                  </div>
                </>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              {!isEditing ? (
                <>
                  {canApproveOrReject && selectedDetailReport.approvalStatus === 'PENDING' && (
                    <>
                      <button 
                        onClick={() => handleModalApprove(selectedDetailReport.id)}
                        disabled={modalActionLoading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        {modalActionLoading ? 'Đang duyệt...' : 'Duyệt báo cáo'}
                      </button>
                      <button 
                        onClick={() => handleModalReject(selectedDetailReport.id)}
                        disabled={modalActionLoading}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        {modalActionLoading ? 'Đang từ chối...' : 'Từ chối'}
                      </button>
                    </>
                  )}
                  {canEditOrDelete && (
                    <button 
                      onClick={startEditing}
                      disabled={modalActionLoading}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <Edit3 size={15} /> Sửa báo cáo
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedDetailReport(null)}
                    disabled={modalActionLoading}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    Đóng
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={cancelEditing}
                    disabled={editSaving}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg text-sm transition-colors"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleSaveEdit}
                    disabled={editSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editSaving ? (
                      <>{editUploadingImages ? 'Đang upload ảnh...' : 'Đang lưu...'}</>  
                    ) : (
                      <><Save size={15} /> Lưu thay đổi</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteModal && deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-100 p-6 text-left">
            <h3 className="font-bold text-lg text-red-600 mb-4 flex items-center gap-2">
              Xác nhận xóa báo cáo
            </h3>
            
            <p className="text-sm text-gray-600 mb-4">
              Bạn có chắc chắn muốn xóa báo cáo này? Hành động này không thể hoàn tác. Vui lòng nhập lý do xóa báo cáo để thông báo cho Kỹ thuật viên:
            </p>
            
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none text-gray-800 bg-white min-h-[100px]"
              placeholder="Nhập lý do xóa báo cáo (ví dụ: Thiếu ảnh serial sản phẩm, thông tin khách hàng không chính xác...)"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
            
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => {
                  setDeleteModal(null);
                  setDeleteReason('');
                }}
                disabled={deleting}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-sm transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={confirmDeleteReport}
                disabled={deleting || !deleteReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
