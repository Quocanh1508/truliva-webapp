import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePermission } from '../../context/PermissionContext';
import {
  Search, Plus, UserPlus, ArrowRightCircle, ShoppingCart, Phone, MapPin, User,
  Clock, Loader2, ChevronLeft, ChevronRight, X, Wrench, Package,
  PhoneCall, Copy, CheckCircle2, Filter, Layers, Settings, Building2, Users,
  Calendar, XCircle, Download
} from 'lucide-react';
import HotlineTicketModal from './HotlineTicketModal';
import DateRangePicker from '../DateRangePicker';

// ═══════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════

interface HotlineTicket {
  id: string;
  ticketCode: string;
  customerName: string;
  customerPhone: string;
  secondaryPhones?: string;
  address?: string;
  provinceName: string;
  productName: string;
  serialNumber?: string;
  status: string;
  source?: string;
  channel?: string;
  requestTime: string;
  createdAt: string;
  updatedAt?: string;
  contactTime?: string;
  targetTeam: string;
  createdBy?: { id: string; fullName: string; email?: string; role: string };
  handlerUser?: { id: string; fullName: string; email?: string; role: string } | null;
  convertedOrder?: { id: string; pancakeOrderId: number; billFullName?: string; adminStatus?: string } | null;
  customerSupportDetail?: string;
  serviceRequestType?: string;
  phase3RequestType?: string;
  phase3ServiceType?: string;
  sparePartName?: string;
  consultationNote?: string;
  phase3Feedback?: string;
}

interface BadgeCounts {
  [key: string]: number;
}

interface FilterOptions {
  statuses: string[];
  serviceRequestTypes: string[];
  productNames: string[];
  phase3RequestTypes: string[];
  phase3ServiceTypes: string[];
  targetTeams: string[];
  creators: Array<{ id: string; fullName: string; email?: string; role: string }>;
  handlers: Array<{ id: string; fullName: string; email?: string; role: string }>;
}

// ═══════════════════════════════════════════════════
//  Status Pill Config
// ═══════════════════════════════════════════════════

const STATUS_PILLS: { key: string; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { key: 'ALL', label: 'TỔNG YÊU CẦU', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  { key: 'Chưa thực hiện', label: 'Chưa thực hiện', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  { key: 'Chưa liên hệ được khách', label: 'Chưa liên hệ được khách', color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
  { key: 'Khách hẹn gọi lại sau', label: 'Khách hẹn gọi lại sau', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  { key: 'Đã chuyển yêu cầu', label: 'Đã chuyển yêu cầu', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { key: 'Đã hoàn thành', label: 'Đã hoàn thành', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  { key: 'Đã hủy', label: 'Đã hủy', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
];

const STATUS_BADGE_MAP: Record<string, { bg: string; text: string }> = {
  'Chưa thực hiện': { bg: 'bg-red-100', text: 'text-red-700' },
  'Chưa liên hệ được khách': { bg: 'bg-gray-100', text: 'text-gray-700' },
  'Khách hẹn gọi lại sau': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'Đang chờ nhóm 2 phản hồi': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'Đã chuyển yêu cầu': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'Đã hoàn thành': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'Đã hủy': { bg: 'bg-red-100', text: 'text-red-700' },
  'Chờ xác thực': { bg: 'bg-red-100', text: 'text-red-700' },
  'CHỜ XÁC THỰC': { bg: 'bg-red-100', text: 'text-red-700' },
  'CHƯA THỰC HIỆN': { bg: 'bg-red-100', text: 'text-red-700' },
  'ĐANG CHỜ NHÓM 2 PHẢN HỒI': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'KHÁCH HẸN GỌI LẠI SAU': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'CHƯA LIÊN HỆ ĐƯỢC KHÁCH': { bg: 'bg-gray-100', text: 'text-gray-700' },
  'ĐÃ CHUYỂN YÊU CẦU': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'ĐÃ HOÀN THÀNH': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'ĐÃ HỦY': { bg: 'bg-red-100', text: 'text-red-700' },
};

function removeAccents(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// ═══════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════

export default function HotlineManage() {
  const { user } = useAuth();
  const { hasPermission } = usePermission();
  const navigate = useNavigate();
  
  // Tab chính: 'tickets' (Yêu cầu Hotline) hoặc 'history' (Tìm kiếm lịch sử KH)
  const [activeMainTab, setActiveMainTab] = useState<'tickets' | 'history'>('tickets');

  // Hotline tickets state
  const [tickets, setTickets] = useState<HotlineTicket[]>([]);
  const [badgeCounts, setBadgeCounts] = useState<BadgeCounts>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStatus, setActiveStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ═══════════════════════════════════════════════════
  //  10 Filter Criteria States
  // ═══════════════════════════════════════════════════
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    statuses: [],
    serviceRequestTypes: [],
    productNames: [],
    phase3RequestTypes: [],
    phase3ServiceTypes: [],
    targetTeams: [],
    creators: [],
    handlers: []
  });

  // Applied Filters
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterServiceRequestTypes, setFilterServiceRequestTypes] = useState<string[]>([]);
  const [filterProductNames, setFilterProductNames] = useState<string[]>([]);
  const [filterPhase3RequestTypes, setFilterPhase3RequestTypes] = useState<string[]>([]);
  const [filterPhase3ServiceTypes, setFilterPhase3ServiceTypes] = useState<string[]>([]);
  const [filterCreatorIds, setFilterCreatorIds] = useState<string[]>([]);
  const [filterTargetTeams, setFilterTargetTeams] = useState<string[]>([]);
  const [filterHandlerUserIds, setFilterHandlerUserIds] = useState<string[]>([]);
  const [requestStartDate, setRequestStartDate] = useState('');
  const [requestEndDate, setRequestEndDate] = useState('');
  const [handledStartDate, setHandledStartDate] = useState('');
  const [handledEndDate, setHandledEndDate] = useState('');

  // Dropdown Popover States
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Temporary Sub-menu Selection States
  const [tempStatuses, setTempStatuses] = useState<string[]>([]);
  const [tempServiceRequestTypes, setTempServiceRequestTypes] = useState<string[]>([]);
  const [tempProductNames, setTempProductNames] = useState<string[]>([]);
  const [tempPhase3RequestTypes, setTempPhase3RequestTypes] = useState<string[]>([]);
  const [tempPhase3ServiceTypes, setTempPhase3ServiceTypes] = useState<string[]>([]);
  const [tempCreatorIds, setTempCreatorIds] = useState<string[]>([]);
  const [tempTargetTeams, setTempTargetTeams] = useState<string[]>([]);
  const [tempHandlerUserIds, setTempHandlerUserIds] = useState<string[]>([]);

  // Sub-menu search filters
  const [statusSearch, setStatusSearch] = useState('');
  const [serviceReqSearch, setServiceReqSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [phase3ReqSearch, setPhase3ReqSearch] = useState('');
  const [phase3ServiceSearch, setPhase3ServiceSearch] = useState('');
  const [creatorSearch, setCreatorSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [handlerSearch, setHandlerSearch] = useState('');

  // Customer History Search tab states
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResults, setHistoryResults] = useState<{
    query: string;
    customers: any[];
    serials: any[];
    serviceOrders: any[];
    hotlineTickets: any[];
  } | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<HotlineTicket | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Fetch Filter Options on Mount
  useEffect(() => {
    fetchApi('/hotlines/filter-options')
      .then((data: FilterOptions) => {
        if (data) setFilterOptions(data);
      })
      .catch((err) => console.error('Lỗi tải danh mục bộ lọc hotline:', err));
  }, []);

  // Click outside to close dropdown popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ESC Key listener for Assign Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAssignModal) {
          setShowAssignModal(false);
          setSelectedTicket(null);
        }
        if (activeDropdown) {
          setActiveDropdown(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAssignModal, activeDropdown]);

  const handleCopyPhone = (phoneStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!phoneStr) return;
    const cleanPhone = phoneStr.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cleanPhone).catch(() => {
        fallbackCopyText(cleanPhone);
      });
    } else {
      fallbackCopyText(cleanPhone);
    }
    setCopiedPhone(cleanPhone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const fallbackCopyText = (text: string) => {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  };

  // Assign modal states
  const [assignTeam, setAssignTeam] = useState('');
  const [assignHandlerId, setAssignHandlerId] = useState('');
  const [handlers, setHandlers] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);

  // ── Fetch tickets ──
  const fetchTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeStatus !== 'ALL' && filterStatuses.length === 0) {
        params.set('status', activeStatus);
      } else if (filterStatuses.length > 0) {
        params.set('statuses', filterStatuses.join(','));
      }
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (filterServiceRequestTypes.length > 0) params.set('serviceRequestTypes', filterServiceRequestTypes.join(','));
      if (filterProductNames.length > 0) params.set('productNames', filterProductNames.join(','));
      if (filterPhase3RequestTypes.length > 0) params.set('phase3RequestTypes', filterPhase3RequestTypes.join(','));
      if (filterPhase3ServiceTypes.length > 0) params.set('phase3ServiceTypes', filterPhase3ServiceTypes.join(','));
      if (filterCreatorIds.length > 0) params.set('creatorIds', filterCreatorIds.join(','));
      if (filterTargetTeams.length > 0) params.set('targetTeams', filterTargetTeams.join(','));
      if (filterHandlerUserIds.length > 0) params.set('handlerUserIds', filterHandlerUserIds.join(','));
      if (requestStartDate) params.set('requestStartDate', requestStartDate);
      if (requestEndDate) params.set('requestEndDate', requestEndDate);
      if (handledStartDate) params.set('handledStartDate', handledStartDate);
      if (handledEndDate) params.set('handledEndDate', handledEndDate);

      params.set('page', String(page));
      params.set('limit', '20');

      const data = await fetchApi(`/hotlines?${params.toString()}`);
      setTickets(data.tickets || []);
      setBadgeCounts(data.badgeCounts || {});
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      console.error('Lỗi tải danh sách hotline:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [
    activeStatus,
    filterStatuses,
    searchQuery,
    filterServiceRequestTypes,
    filterProductNames,
    filterPhase3RequestTypes,
    filterPhase3ServiceTypes,
    filterCreatorIds,
    filterTargetTeams,
    filterHandlerUserIds,
    requestStartDate,
    requestEndDate,
    handledStartDate,
    handledEndDate,
    page
  ]);

  // ── Xuất Excel theo bộ lọc hiện tại ──
  const handleExportExcel = () => {
    const params = new URLSearchParams();
    if (activeStatus !== 'ALL' && filterStatuses.length === 0) {
      params.set('status', activeStatus);
    } else if (filterStatuses.length > 0) {
      params.set('statuses', filterStatuses.join(','));
    }
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    if (filterServiceRequestTypes.length > 0) params.set('serviceRequestTypes', filterServiceRequestTypes.join(','));
    if (filterProductNames.length > 0) params.set('productNames', filterProductNames.join(','));
    if (filterPhase3RequestTypes.length > 0) params.set('phase3RequestTypes', filterPhase3RequestTypes.join(','));
    if (filterPhase3ServiceTypes.length > 0) params.set('phase3ServiceTypes', filterPhase3ServiceTypes.join(','));
    if (filterCreatorIds.length > 0) params.set('creatorIds', filterCreatorIds.join(','));
    if (filterTargetTeams.length > 0) params.set('targetTeams', filterTargetTeams.join(','));
    if (filterHandlerUserIds.length > 0) params.set('handlerUserIds', filterHandlerUserIds.join(','));
    if (requestStartDate) params.set('requestStartDate', requestStartDate);
    if (requestEndDate) params.set('requestEndDate', requestEndDate);
    if (handledStartDate) params.set('handledStartDate', handledStartDate);
    if (handledEndDate) params.set('handledEndDate', handledEndDate);

    window.open(`/api/hotlines/export?${params.toString()}`, '_blank');
  };

  useEffect(() => {
    if (activeMainTab === 'tickets') {
      fetchTickets();
    }
  }, [fetchTickets, activeMainTab]);

  // Keep reference updated to avoid closure stale state in WebSocket listener
  const fetchTicketsRef = useRef(fetchTickets);
  useEffect(() => {
    fetchTicketsRef.current = fetchTickets;
  }, [fetchTickets]);

  const [wsConnected, setWsConnected] = useState(false);

  // ── WebSocket real-time sync ──
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: any = null;
    let isSubscribed = true;

    const connectWs = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          if (isSubscribed) setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (
              data.type === 'HOTLINE_TICKET_CREATED' ||
              data.type === 'HOTLINE_TICKET_UPDATED' ||
              data.type === 'HOTLINE_TICKET_DELETED'
            ) {
              fetchTicketsRef.current(true); // Silent real-time update
            }
          } catch (err) {
            console.error('Error parsing WebSocket message in Hotline:', err);
          }
        };

        socket.onclose = () => {
          if (isSubscribed) {
            setWsConnected(false);
            reconnectTimer = setTimeout(connectWs, 5000);
          }
        };

        socket.onerror = () => {
          if (socket) socket.close();
        };
      } catch (err) {
        if (isSubscribed) {
          reconnectTimer = setTimeout(connectWs, 5000);
        }
      }
    };

    connectWs();

    return () => {
      isSubscribed = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []);

  // Polling fallback every 10s if WebSocket is not connected
  useEffect(() => {
    if (wsConnected) return;
    const interval = setInterval(() => {
      if (activeMainTab === 'tickets') {
        fetchTicketsRef.current(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [wsConnected, activeMainTab]);

  // ── History Search Handler ──
  const handleHistorySearch = async () => {
    if (!historyQuery.trim()) return;
    setHistoryLoading(true);
    try {
      const data = await fetchApi(`/hotlines/search-customer?q=${encodeURIComponent(historyQuery.trim())}`);
      setHistoryResults(data);
    } catch (err) {
      console.error('Lỗi tra cứu lịch sử KH:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Fetch handlers for assign modal ──
  const fetchHandlers = async (team: string) => {
    try {
      const data = await fetchApi(`/hotlines/handlers?team=${encodeURIComponent(team)}`);
      setHandlers(data || []);
    } catch (err) {
      console.error('Lỗi tải DS handlers:', err);
      setHandlers([]);
    }
  };

  // ── Quick Action: Phân bổ ──
  const handleAssign = async () => {
    if (!selectedTicket || !assignTeam) return;
    setAssigning(true);
    try {
      await fetchApi(`/hotlines/${selectedTicket.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          targetTeam: assignTeam,
          handlerUserId: assignHandlerId || null
        })
      });
      setShowAssignModal(false);
      setSelectedTicket(null);
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi phân bổ');
    } finally {
      setAssigning(false);
    }
  };

  // ── Quick Action: Chuyển sang Ca dịch vụ ──
  const handleConvertToOrder = (ticket: HotlineTicket) => {
    navigate('/admin/orders', {
      state: {
        autoOpenCreateModal: true,
        hotlineTicket: {
          id: ticket.id,
          ticketCode: ticket.ticketCode,
          customerName: ticket.customerName,
          customerPhone: ticket.customerPhone,
          address: ticket.address,
          provinceName: ticket.provinceName,
          productName: ticket.productName,
          serialNumber: ticket.serialNumber,
          customerSupportDetail: ticket.customerSupportDetail,
          workType: ticket.serviceRequestType || 'Sửa chữa',
          serviceType: ticket.customerSupportDetail || '',
          note: `[Tạo từ Ticket Hotline ${ticket.ticketCode}] ${ticket.customerSupportDetail || ''}`
        }
      }
    });
  };

  // ── Quick Action: Tạo đơn POS ──
  const handlePOSNotice = () => {
    alert('Vui lòng tạo đơn hàng trực tiếp trên hệ thống Pancake POS. Hệ thống Truliva sẽ tự động đồng bộ đơn hàng về sau vài giây.');
  };

  // ── Helper: Format DateTime ──
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${d.toLocaleDateString('vi-VN')}`;
    } catch {
      return dateStr;
    }
  };

  // ── Filter Dropdown Helpers ──
  const toggleDropdown = (name: string) => {
    if (activeDropdown === name) {
      setActiveDropdown(null);
    } else {
      setActiveDropdown(name);
      if (name === 'statuses') setTempStatuses([...filterStatuses]);
      if (name === 'serviceRequestTypes') setTempServiceRequestTypes([...filterServiceRequestTypes]);
      if (name === 'productNames') setTempProductNames([...filterProductNames]);
      if (name === 'phase3RequestTypes') setTempPhase3RequestTypes([...filterPhase3RequestTypes]);
      if (name === 'phase3ServiceTypes') setTempPhase3ServiceTypes([...filterPhase3ServiceTypes]);
      if (name === 'creatorIds') setTempCreatorIds([...filterCreatorIds]);
      if (name === 'targetTeams') setTempTargetTeams([...filterTargetTeams]);
      if (name === 'handlerUserIds') setTempHandlerUserIds([...filterHandlerUserIds]);
    }
  };

  const applyFilter = (type: string) => {
    setPage(1);
    if (type === 'statuses') setFilterStatuses([...tempStatuses]);
    if (type === 'serviceRequestTypes') setFilterServiceRequestTypes([...tempServiceRequestTypes]);
    if (type === 'productNames') setFilterProductNames([...tempProductNames]);
    if (type === 'phase3RequestTypes') setFilterPhase3RequestTypes([...tempPhase3RequestTypes]);
    if (type === 'phase3ServiceTypes') setFilterPhase3ServiceTypes([...tempPhase3ServiceTypes]);
    if (type === 'creatorIds') setFilterCreatorIds([...tempCreatorIds]);
    if (type === 'targetTeams') setFilterTargetTeams([...tempTargetTeams]);
    if (type === 'handlerUserIds') setFilterHandlerUserIds([...tempHandlerUserIds]);
    setActiveDropdown(null);
  };

  const clearAllFilters = () => {
    setFilterStatuses([]);
    setFilterServiceRequestTypes([]);
    setFilterProductNames([]);
    setFilterPhase3RequestTypes([]);
    setFilterPhase3ServiceTypes([]);
    setFilterCreatorIds([]);
    setFilterTargetTeams([]);
    setFilterHandlerUserIds([]);
    setRequestStartDate('');
    setRequestEndDate('');
    setHandledStartDate('');
    setHandledEndDate('');
    setActiveStatus('ALL');
    setSearchQuery('');
    setPage(1);
  };

  const activeFiltersCount = [
    filterStatuses.length > 0,
    filterServiceRequestTypes.length > 0,
    filterProductNames.length > 0,
    filterPhase3RequestTypes.length > 0,
    filterPhase3ServiceTypes.length > 0,
    filterCreatorIds.length > 0,
    filterTargetTeams.length > 0,
    filterHandlerUserIds.length > 0,
    !!(requestStartDate || requestEndDate),
    !!(handledStartDate || handledEndDate)
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* ── Top Navigation Tabs & Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveMainTab('tickets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeMainTab === 'tickets'
                ? 'bg-white text-[#1B3A6B] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <PhoneCall size={16} /> Danh sách Yêu cầu Hotline
          </button>
          <button
            onClick={() => setActiveMainTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeMainTab === 'history'
                ? 'bg-white text-[#1B3A6B] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Search size={16} /> Tra cứu Lịch sử Khách hàng
          </button>
        </div>

        {activeMainTab === 'tickets' && (
          <div className="flex items-center gap-2">
            {hasPermission('HOTLINE_EXPORT_EXCEL') && (
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-semibold text-sm shadow-xs transition-all cursor-pointer"
                title="Xuất file Excel danh sách hotline theo bộ lọc hiện tại"
              >
                <Download size={17} className="text-[#1B3A6B]" />
                <span>Xuất Excel</span>
              </button>
            )}
            <button
              onClick={() => { setSelectedTicket(null); setShowCreateModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#00A3FF] hover:bg-[#0090E0] text-white rounded-xl font-semibold text-sm shadow-sm transition-all cursor-pointer"
            >
              <Plus size={18} /> Thêm mới Ticket
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
           TAB 1: TÌM KIẾM LỊCH SỬ KHÁCH HÀNG
         ═══════════════════════════════════════════════════ */}
      {activeMainTab === 'history' && (
        <div className="space-y-6">
          {/* Header & Search Bar */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-[#00A3FF] rounded-xl">
                <Search size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1B3A6B]">Tra cứu toàn bộ lịch sử tương tác Khách hàng</h3>
                <p className="text-xs text-gray-500">Tìm kiếm nhanh theo Tên khách hàng, Số điện thoại (chính/phụ) hoặc Số Serial máy / ID Sản phẩm.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Nhập Tên khách hàng, Số điện thoại hoặc Số Serial / Model / ID Sản phẩm..."
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHistorySearch()}
                  className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-200 outline-none"
                />
                {historyQuery && (
                  <button onClick={() => { setHistoryQuery(''); setHistoryResults(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                onClick={handleHistorySearch}
                disabled={historyLoading || !historyQuery.trim()}
                className="px-6 py-3 bg-[#00A3FF] text-white rounded-xl text-sm font-semibold hover:bg-[#0090E0] disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {historyLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Tra cứu lịch sử
              </button>
            </div>
          </div>

          {/* Prompt banner if search is empty */}
          {!historyResults && !historyLoading && (
            <div className="bg-blue-50/60 border border-blue-200 p-8 rounded-2xl text-center space-y-3">
              <div className="inline-flex p-4 bg-white rounded-full text-blue-600 shadow-sm">
                <User size={32} />
              </div>
              <h4 className="font-bold text-[#1B3A6B]">Vui lòng nhập từ khóa tra cứu ở trên</h4>
              <p className="text-xs text-gray-600 max-w-lg mx-auto">
                Hệ thống sẽ tổng hợp toàn bộ Thông tin khách hàng, danh sách Thiết bị/Serial kích hoạt bảo hành, Các đơn dịch vụ kỹ thuật và Các phiếu Hotline tương tác liên quan.
              </p>
            </div>
          )}

          {/* Results section */}
          {historyResults && (
            <div className="space-y-6">
              {/* Summary Stats Bar */}
              <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm text-xs font-semibold">
                <span className="text-gray-500">Kết quả tra cứu cho: <b className="text-gray-800 font-mono">"{historyResults.query}"</b></span>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full">
                  👤 Khách hàng: <b>{historyResults.customers?.length || 0}</b>
                </span>
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full">
                  📦 Thiết bị / Serial: <b>{historyResults.serials?.length || 0}</b>
                </span>
                <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
                  🛠️ Đơn yêu cầu dịch vụ: <b>{historyResults.serviceOrders?.length || 0}</b>
                </span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                  📞 Phiếu Hotline: <b>{historyResults.hotlineTickets?.length || 0}</b>
                </span>
              </div>

              {/* 1. Thông tin Khách hàng */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <User className="text-blue-600" size={18} />
                  <h4 className="font-bold text-gray-800 text-sm">1. Thông tin Khách hàng ({historyResults.customers?.length || 0})</h4>
                </div>

                {historyResults.customers?.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 italic">Không có hồ sơ khách hàng khớp trực tiếp</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {historyResults.customers.map((cust: any) => (
                      <div key={cust.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-gray-800">{cust.fullName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Khách hàng</span>
                        </div>
                        <div className="space-y-1 text-gray-600">
                          <div className="flex items-center gap-2">
                            <Phone size={12} className="text-gray-400" />
                            <span>SĐT chính: <b>{cust.phoneNumber}</b></span>
                          </div>
                          {cust.secondaryPhones && (
                            <div className="flex items-center gap-2">
                              <Phone size={12} className="text-emerald-500" />
                              <span>SĐT phụ: <b className="text-emerald-700">{cust.secondaryPhones}</b></span>
                            </div>
                          )}
                          {cust.fullAddress && (
                            <div className="flex items-start gap-2">
                              <MapPin size={12} className="text-gray-400 mt-0.5" />
                              <span>{cust.fullAddress}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Danh sách Thiết bị / Serial sở hữu */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Package className="text-purple-600" size={18} />
                  <h4 className="font-bold text-gray-800 text-sm">2. Thiết bị & Serial sở hữu ({historyResults.serials?.length || 0})</h4>
                </div>

                {historyResults.serials?.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 italic">Không có thiết bị/serial nào</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50/80 border-b border-gray-200 font-bold text-gray-600">
                        <tr>
                          <th className="px-3 py-2.5 whitespace-nowrap">Mã Serial</th>
                          <th className="px-3 py-2.5 whitespace-nowrap">Sản phẩm / Dòng máy</th>
                          <th className="px-3 py-2.5 whitespace-nowrap">Chủ sở hữu</th>
                          <th className="px-3 py-2.5 whitespace-nowrap">Địa chỉ</th>
                          <th className="px-3 py-2.5 whitespace-nowrap">Trạng thái bảo hành</th>
                          <th className="px-3 py-2.5 whitespace-nowrap">Thời điểm KHBH</th>
                          <th className="px-3 py-2.5 whitespace-nowrap">Hạn bảo hành (Hết BH)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyResults.serials.map((s: any) => {
                          const isActivated = s.status === 'Đã kích hoạt' || !!s.activationDate;
                          const isExpired = s.warrantyExpiryDate && new Date(s.warrantyExpiryDate).getTime() < Date.now();

                          let statusBadge = { bg: 'bg-gray-100', text: 'text-gray-700', label: s.status || 'Chưa kích hoạt' };
                          if (isExpired) {
                            statusBadge = { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700', label: 'Đã hết hạn' };
                          } else if (s.status === 'Đã kích hoạt' || isActivated) {
                            statusBadge = { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', label: 'Đã kích hoạt' };
                          } else if (s.status === 'Chờ duyệt') {
                            statusBadge = { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-700', label: 'Chờ duyệt' };
                          } else if (s.status === 'KH xác nhận') {
                            statusBadge = { bg: 'bg-blue-50 border border-blue-200', text: 'text-blue-700', label: 'KH xác nhận' };
                          }

                          return (
                            <tr key={s.id} className="hover:bg-purple-50/30 transition-colors">
                              {/* 1. Mã Serial */}
                              <td className="px-3 py-2.5 font-mono text-purple-700 font-bold whitespace-nowrap">
                                {s.serialNumber}
                              </td>

                              {/* 2. Sản phẩm / Dòng máy */}
                              <td className="px-3 py-2.5 font-medium text-gray-800">
                                <span className="font-semibold text-gray-900">{s.productLine || s.model || '—'}</span>
                                {s.model && s.productLine && s.model !== s.productLine && (
                                  <span className="block text-[11px] text-gray-400 font-normal">{s.model}</span>
                                )}
                              </td>

                              {/* 3. Chủ sở hữu */}
                              <td className="px-3 py-2.5 text-gray-700">
                                {s.customerName || s.customerPhone ? (
                                  <div>
                                    <span className="font-medium text-gray-900">{s.customerName || 'Khách hàng'}</span>
                                    {s.customerPhone && (
                                      <span className="text-gray-500 text-[11px] ml-1">({s.customerPhone})</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">—</span>
                                )}
                              </td>

                              {/* 4. Địa chỉ */}
                              <td className="px-3 py-2.5 text-gray-600 max-w-xs truncate" title={[s.address, s.province].filter(Boolean).join(', ')}>
                                {[s.address, s.province].filter(Boolean).join(', ') || <span className="text-gray-400 italic">—</span>}
                              </td>

                              {/* 5. Trạng thái bảo hành */}
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                                  {isActivated && !isExpired && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                                  {isExpired && <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>}
                                  {statusBadge.label}
                                </span>
                              </td>

                              {/* 6. Thời điểm KHBH (Kích hoạt bảo hành) */}
                              <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                                {s.activationDate ? (
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-gray-800">{formatDateTime(s.activationDate)}</span>
                                    {s.activatedBy && (
                                      <span className="text-[10px] text-gray-400">qua {s.activatedBy}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">Chưa KHBH</span>
                                )}
                              </td>

                              {/* 7. Thời điểm Hết hạn BH */}
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {s.warrantyExpiryDate ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-bold ${isExpired ? 'text-rose-600' : 'text-emerald-700'}`}>
                                      {formatDateTime(s.warrantyExpiryDate)}
                                    </span>
                                    {isExpired && (
                                      <span className="px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded text-[9px] font-bold">Hết hạn</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. Các Yêu Cầu Hotline */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <PhoneCall className="text-emerald-600" size={18} />
                  <h4 className="font-bold text-gray-800 text-sm">3. Các Yêu cầu Hotline ({historyResults.hotlineTickets?.length || 0})</h4>
                </div>

                {historyResults.hotlineTickets?.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 italic">Không có phiếu hotline nào</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-600">
                        <tr>
                          <th className="px-3 py-2">Mã Ticket</th>
                          <th className="px-3 py-2">Khách hàng</th>
                          <th className="px-3 py-2">Loại yêu cầu</th>
                          <th className="px-3 py-2">Sản phẩm & Serial</th>
                          <th className="px-3 py-2">Trạng thái</th>
                          <th className="px-3 py-2">Người xử lý</th>
                          <th className="px-3 py-2">Thời gian</th>
                          <th className="px-3 py-2 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyResults.hotlineTickets.map((t: any) => {
                          const statusBadge = STATUS_BADGE_MAP[t.status] || { bg: 'bg-gray-100', text: 'text-gray-700' };
                          return (
                            <tr key={t.id} className="hover:bg-emerald-50/40">
                              <td className="px-3 py-2.5 font-mono text-emerald-700 font-bold">
                                {t.ticketCode}
                                {t.source?.includes('Hỗ trợ kỹ thuật') && (
                                  <span className="block text-[10px] text-cyan-700 font-bold mt-0.5">🛠️ Hỗ trợ kỹ thuật</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-gray-800">{t.customerName} ({t.customerPhone})</td>
                              <td className="px-3 py-2.5 text-blue-600 font-medium">{t.serviceRequestType || 'Sửa chữa'}</td>
                              <td className="px-3 py-2.5 text-gray-700">
                                <div>{(t.productName || '').replace(/^PROD:\s*/i, '')}</div>
                                {t.serialNumber && <div className="text-[11px] font-mono text-gray-400">{t.serialNumber}</div>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                                  {t.status}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-600">{t.handlerUser?.fullName || t.targetTeam || 'Chưa nhận'}</td>
                              <td className="px-3 py-2.5 text-gray-500">{formatDateTime(t.requestTime || t.createdAt)}</td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  onClick={() => { setSelectedTicket(t); setShowDetailModal(true); }}
                                  className="px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-semibold transition-all"
                                >
                                  Chi tiết
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
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
           TAB 2: YÊU CẦU HOTLINE
         ═══════════════════════════════════════════════════ */}
      {activeMainTab === 'tickets' && (
        <div className="space-y-4">
          {/* ── Toolbar: Search & Filter Button ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
              <input
                type="text"
                placeholder="Tìm mã ticket, tên khách, SĐT, địa chỉ, serial, ghi chú..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                onKeyDown={(e) => e.key === 'Enter' && fetchTickets()}
                className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setPage(1); }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setPage(1); fetchTickets(); }}
                className="px-4 py-2 bg-[#00A3FF] text-white rounded-lg text-xs font-semibold hover:bg-[#0090E0] transition-all shadow-sm cursor-pointer"
              >
                Tìm kiếm
              </button>

              {hasPermission('HOTLINE_EXPORT_EXCEL') && (
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg transition-all shadow-xs cursor-pointer"
                  title="Xuất file Excel danh sách hotline theo bộ lọc hiện tại"
                >
                  <Download size={14} className="text-[#1B3A6B]" />
                  <span>Xuất Excel</span>
                </button>
              )}

              {/* ── BỘ LỌC BUTTON & POPOVER ── */}
              <div className="relative z-50" ref={dropdownRef}>
                <button
                  onClick={() => toggleDropdown('main')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border rounded-lg transition-all ${
                    activeFiltersCount > 0
                      ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Filter size={14} className={activeFiltersCount > 0 ? 'text-blue-600' : 'text-gray-500'} />
                  <span>Bộ lọc</span>
                  {activeFiltersCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>

                {/* Popover Dropdown Card */}
                {activeDropdown && (
                  <div className="fixed md:absolute top-1/2 left-1/2 md:top-auto md:left-auto md:right-0 -translate-x-1/2 -translate-y-1/2 md:translate-x-0 md:translate-y-0 md:mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 text-left min-w-[260px] animate-in fade-in zoom-in-95">
                    {/* Main Category Menu */}
                    {activeDropdown === 'main' && (
                      <div className="w-64 py-1.5 text-xs text-gray-700 max-h-96 overflow-y-auto">
                        <div className="px-3.5 py-2 text-[11px] font-bold text-gray-400 border-b border-gray-100 uppercase tracking-wider">
                          Điều kiện lọc ({activeFiltersCount})
                        </div>
                        
                        {/* 1. Trạng thái */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-indigo-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('statuses')}
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-indigo-500" />
                            <span>1. Trạng thái</span>
                          </div>
                          {filterStatuses.length > 0 && (
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold">
                              {filterStatuses.length}
                            </span>
                          )}
                        </button>

                        {/* 2. Yêu cầu dịch vụ */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-amber-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('serviceRequestTypes')}
                        >
                          <div className="flex items-center gap-2">
                            <Wrench size={14} className="text-amber-500" />
                            <span>2. Yêu cầu dịch vụ</span>
                          </div>
                          {filterServiceRequestTypes.length > 0 && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                              {filterServiceRequestTypes.length}
                            </span>
                          )}
                        </button>

                        {/* 3. Sản phẩm */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-purple-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('productNames')}
                        >
                          <div className="flex items-center gap-2">
                            <Package size={14} className="text-purple-500" />
                            <span>3. Sản phẩm</span>
                          </div>
                          {filterProductNames.length > 0 && (
                            <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold">
                              {filterProductNames.length}
                            </span>
                          )}
                        </button>

                        {/* 4. Loại yêu cầu */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-sky-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('phase3RequestTypes')}
                        >
                          <div className="flex items-center gap-2">
                            <Layers size={14} className="text-sky-500" />
                            <span>4. Loại yêu cầu</span>
                          </div>
                          {filterPhase3RequestTypes.length > 0 && (
                            <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-bold">
                              {filterPhase3RequestTypes.length}
                            </span>
                          )}
                        </button>

                        {/* 5. Loại dịch vụ */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-teal-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('phase3ServiceTypes')}
                        >
                          <div className="flex items-center gap-2">
                            <Settings size={14} className="text-teal-500" />
                            <span>5. Loại dịch vụ</span>
                          </div>
                          {filterPhase3ServiceTypes.length > 0 && (
                            <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-bold">
                              {filterPhase3ServiceTypes.length}
                            </span>
                          )}
                        </button>

                        {/* 6. Người gửi yêu cầu */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-rose-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('creatorIds')}
                        >
                          <div className="flex items-center gap-2">
                            <User size={14} className="text-rose-500" />
                            <span>6. Người gửi yêu cầu</span>
                          </div>
                          {filterCreatorIds.length > 0 && (
                            <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-bold">
                              {filterCreatorIds.length}
                            </span>
                          )}
                        </button>

                        {/* 7. Thời gian gửi yêu cầu */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-blue-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('requestTimeFilter')}
                        >
                          <div className="flex items-center gap-2">
                            <Calendar size={14} className="text-blue-500" />
                            <span>7. Thời gian gửi yêu cầu</span>
                          </div>
                          {(requestStartDate || requestEndDate) && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                              1
                            </span>
                          )}
                        </button>

                        {/* 8. Team xử lý yêu cầu */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-emerald-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('targetTeams')}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 size={14} className="text-emerald-500" />
                            <span>8. Team xử lý yêu cầu</span>
                          </div>
                          {filterTargetTeams.length > 0 && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                              {filterTargetTeams.length}
                            </span>
                          )}
                        </button>

                        {/* 9. Người xử lý yêu cầu */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-cyan-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('handlerUserIds')}
                        >
                          <div className="flex items-center gap-2">
                            <Users size={14} className="text-cyan-500" />
                            <span>9. Người xử lý yêu cầu</span>
                          </div>
                          {filterHandlerUserIds.length > 0 && (
                            <span className="text-[10px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded-full font-bold">
                              {filterHandlerUserIds.length}
                            </span>
                          )}
                        </button>

                        {/* 10. Thời gian xử lý yêu cầu */}
                        <button
                          className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 text-orange-700 font-medium transition-colors text-xs"
                          onClick={() => toggleDropdown('handledTimeFilter')}
                        >
                          <div className="flex items-center gap-2">
                            <Clock size={14} className="text-orange-500" />
                            <span>10. Thời gian xử lý yêu cầu</span>
                          </div>
                          {(handledStartDate || handledEndDate) && (
                            <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                              1
                            </span>
                          )}
                        </button>

                        {/* Clear all footer */}
                        {activeFiltersCount > 0 && (
                          <div className="p-2 border-t border-gray-100 mt-1">
                            <button
                              onClick={clearAllFilters}
                              className="w-full py-1.5 text-center text-red-600 hover:bg-red-50 rounded font-bold text-[11px] transition-colors"
                            >
                              Xóa tất cả điều kiện lọc
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Submenu 1: Trạng thái */}
                    {activeDropdown === 'statuses' && (
                      <div className="p-4 w-72 space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="text-indigo-600" /> Lọc theo Trạng thái
                        </h4>
                        <input
                          type="text"
                          placeholder="Tìm trạng thái..."
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500"
                          value={statusSearch}
                          onChange={(e) => setStatusSearch(e.target.value)}
                        />
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {filterOptions.statuses
                            .filter(s => removeAccents(s).includes(removeAccents(statusSearch)))
                            .map(st => (
                              <label key={st} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-blue-600">
                                <input
                                  type="checkbox"
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                  checked={tempStatuses.includes(st)}
                                  onChange={e => {
                                    if (e.target.checked) setTempStatuses([...tempStatuses, st]);
                                    else setTempStatuses(tempStatuses.filter(v => v !== st));
                                  }}
                                />
                                <span>{st}</span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button className="text-red-500 px-2 py-1 hover:bg-red-50 rounded" onClick={() => setTempStatuses([])}>Bỏ chọn</button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('statuses')}>Áp dụng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 2: Yêu cầu dịch vụ */}
                    {activeDropdown === 'serviceRequestTypes' && (
                      <div className="p-4 w-72 space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <Wrench size={14} className="text-amber-600" /> Lọc theo Yêu cầu dịch vụ
                        </h4>
                        <input
                          type="text"
                          placeholder="Tìm yêu cầu dịch vụ..."
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500"
                          value={serviceReqSearch}
                          onChange={(e) => setServiceReqSearch(e.target.value)}
                        />
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {filterOptions.serviceRequestTypes
                            .filter(t => removeAccents(t).includes(removeAccents(serviceReqSearch)))
                            .map(srt => (
                              <label key={srt} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-blue-600">
                                <input
                                  type="checkbox"
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                  checked={tempServiceRequestTypes.includes(srt)}
                                  onChange={e => {
                                    if (e.target.checked) setTempServiceRequestTypes([...tempServiceRequestTypes, srt]);
                                    else setTempServiceRequestTypes(tempServiceRequestTypes.filter(v => v !== srt));
                                  }}
                                />
                                <span>{srt}</span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button className="text-red-500 px-2 py-1 hover:bg-red-50 rounded" onClick={() => setTempServiceRequestTypes([])}>Bỏ chọn</button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('serviceRequestTypes')}>Áp dụng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 3: Sản phẩm */}
                    {activeDropdown === 'productNames' && (
                      <div className="p-4 w-72 space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <Package size={14} className="text-purple-600" /> Lọc theo Sản phẩm
                        </h4>
                        <input
                          type="text"
                          placeholder="Tìm sản phẩm..."
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                        />
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {filterOptions.productNames
                            .filter(p => removeAccents(p).includes(removeAccents(productSearch)))
                            .map(prod => (
                              <label key={prod} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-blue-600">
                                <input
                                  type="checkbox"
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                  checked={tempProductNames.includes(prod)}
                                  onChange={e => {
                                    if (e.target.checked) setTempProductNames([...tempProductNames, prod]);
                                    else setTempProductNames(tempProductNames.filter(v => v !== prod));
                                  }}
                                />
                                <span>{prod}</span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button className="text-red-500 px-2 py-1 hover:bg-red-50 rounded" onClick={() => setTempProductNames([])}>Bỏ chọn</button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('productNames')}>Áp dụng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 4: Loại yêu cầu */}
                    {activeDropdown === 'phase3RequestTypes' && (
                      <div className="p-4 w-72 space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <Layers size={14} className="text-sky-600" /> Lọc theo Loại yêu cầu
                        </h4>
                        <input
                          type="text"
                          placeholder="Tìm loại yêu cầu..."
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500"
                          value={phase3ReqSearch}
                          onChange={(e) => setPhase3ReqSearch(e.target.value)}
                        />
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {filterOptions.phase3RequestTypes
                            .filter(r => removeAccents(r).includes(removeAccents(phase3ReqSearch)))
                            .map(prt => (
                              <label key={prt} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-blue-600">
                                <input
                                  type="checkbox"
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                  checked={tempPhase3RequestTypes.includes(prt)}
                                  onChange={e => {
                                    if (e.target.checked) setTempPhase3RequestTypes([...tempPhase3RequestTypes, prt]);
                                    else setTempPhase3RequestTypes(tempPhase3RequestTypes.filter(v => v !== prt));
                                  }}
                                />
                                <span>{prt}</span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button className="text-red-500 px-2 py-1 hover:bg-red-50 rounded" onClick={() => setTempPhase3RequestTypes([])}>Bỏ chọn</button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('phase3RequestTypes')}>Áp dụng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 5: Loại dịch vụ */}
                    {activeDropdown === 'phase3ServiceTypes' && (
                      <div className="p-4 w-72 space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <Settings size={14} className="text-teal-600" /> Lọc theo Loại dịch vụ
                        </h4>
                        <input
                          type="text"
                          placeholder="Tìm loại dịch vụ..."
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500"
                          value={phase3ServiceSearch}
                          onChange={(e) => setPhase3ServiceSearch(e.target.value)}
                        />
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {filterOptions.phase3ServiceTypes
                            .filter(s => removeAccents(s).includes(removeAccents(phase3ServiceSearch)))
                            .map(pst => (
                              <label key={pst} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-blue-600">
                                <input
                                  type="checkbox"
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                  checked={tempPhase3ServiceTypes.includes(pst)}
                                  onChange={e => {
                                    if (e.target.checked) setTempPhase3ServiceTypes([...tempPhase3ServiceTypes, pst]);
                                    else setTempPhase3ServiceTypes(tempPhase3ServiceTypes.filter(v => v !== pst));
                                  }}
                                />
                                <span>{pst}</span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button className="text-red-500 px-2 py-1 hover:bg-red-50 rounded" onClick={() => setTempPhase3ServiceTypes([])}>Bỏ chọn</button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('phase3ServiceTypes')}>Áp dụng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 6: Người gửi yêu cầu */}
                    {activeDropdown === 'creatorIds' && (
                      <div className="p-4 w-72 space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <User size={14} className="text-rose-600" /> Lọc theo Người gửi yêu cầu
                        </h4>
                        <input
                          type="text"
                          placeholder="Tìm nhân viên tạo ticket..."
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500"
                          value={creatorSearch}
                          onChange={(e) => setCreatorSearch(e.target.value)}
                        />
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {filterOptions.creators
                            .filter(c => removeAccents(c.fullName).includes(removeAccents(creatorSearch)))
                            .map(c => (
                              <label key={c.id} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-blue-600">
                                <input
                                  type="checkbox"
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                  checked={tempCreatorIds.includes(c.id)}
                                  onChange={e => {
                                    if (e.target.checked) setTempCreatorIds([...tempCreatorIds, c.id]);
                                    else setTempCreatorIds(tempCreatorIds.filter(v => v !== c.id));
                                  }}
                                />
                                <span>{c.fullName} <span className="text-[10px] text-gray-400 font-mono">({c.role})</span></span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button className="text-red-500 px-2 py-1 hover:bg-red-50 rounded" onClick={() => setTempCreatorIds([])}>Bỏ chọn</button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('creatorIds')}>Áp dụng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 7: Thời gian gửi yêu cầu */}
                    {activeDropdown === 'requestTimeFilter' && (
                      <div className="p-4 w-[290px] space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <Calendar size={14} className="text-blue-600" /> Thời gian gửi yêu cầu
                        </h4>
                        <DateRangePicker
                          startDate={requestStartDate}
                          endDate={requestEndDate}
                          align="right"
                          onChange={(start, end) => {
                            setRequestStartDate(start);
                            setRequestEndDate(end);
                            setPage(1);
                          }}
                        />
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button
                            className="text-red-500 px-2 py-1 hover:bg-red-50 rounded"
                            onClick={() => { setRequestStartDate(''); setRequestEndDate(''); setPage(1); }}
                          >
                            Xóa ngày
                          </button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => setActiveDropdown(null)}>Đóng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 8: Team xử lý yêu cầu */}
                    {activeDropdown === 'targetTeams' && (
                      <div className="p-4 w-72 space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <Building2 size={14} className="text-emerald-600" /> Team xử lý yêu cầu
                        </h4>
                        <input
                          type="text"
                          placeholder="Tìm team..."
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500"
                          value={teamSearch}
                          onChange={(e) => setTeamSearch(e.target.value)}
                        />
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {filterOptions.targetTeams
                            .filter(t => removeAccents(t).includes(removeAccents(teamSearch)))
                            .map(team => (
                              <label key={team} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-blue-600">
                                <input
                                  type="checkbox"
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                  checked={tempTargetTeams.includes(team)}
                                  onChange={e => {
                                    if (e.target.checked) setTempTargetTeams([...tempTargetTeams, team]);
                                    else setTempTargetTeams(tempTargetTeams.filter(v => v !== team));
                                  }}
                                />
                                <span>{team}</span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button className="text-red-500 px-2 py-1 hover:bg-red-50 rounded" onClick={() => setTempTargetTeams([])}>Bỏ chọn</button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('targetTeams')}>Áp dụng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 9: Người xử lý yêu cầu */}
                    {activeDropdown === 'handlerUserIds' && (
                      <div className="p-4 w-72 space-y-3">
                        <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                          <Users size={14} className="text-cyan-600" /> Người xử lý yêu cầu
                        </h4>
                        <input
                          type="text"
                          placeholder="Tìm người xử lý..."
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500"
                          value={handlerSearch}
                          onChange={(e) => setHandlerSearch(e.target.value)}
                        />
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          <label className="flex items-center space-x-2 text-xs font-semibold text-amber-600 border-b border-gray-100 pb-1.5 mb-1 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded text-blue-600 focus:ring-blue-500"
                              checked={tempHandlerUserIds.includes('null')}
                              onChange={e => {
                                if (e.target.checked) setTempHandlerUserIds([...tempHandlerUserIds, 'null']);
                                else setTempHandlerUserIds(tempHandlerUserIds.filter(v => v !== 'null'));
                              }}
                            />
                            <span>Chưa có người xử lý / Chưa nhận</span>
                          </label>
                          {filterOptions.handlers
                            .filter(h => removeAccents(h.fullName).includes(removeAccents(handlerSearch)))
                            .map(h => (
                              <label key={h.id} className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-blue-600">
                                <input
                                  type="checkbox"
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                  checked={tempHandlerUserIds.includes(h.id)}
                                  onChange={e => {
                                    if (e.target.checked) setTempHandlerUserIds([...tempHandlerUserIds, h.id]);
                                    else setTempHandlerUserIds(tempHandlerUserIds.filter(v => v !== h.id));
                                  }}
                                />
                                <span>{h.fullName} <span className="text-[10px] text-gray-400 font-mono">({h.role})</span></span>
                              </label>
                            ))}
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button className="text-red-500 px-2 py-1 hover:bg-red-50 rounded" onClick={() => setTempHandlerUserIds([])}>Bỏ chọn</button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('handlerUserIds')}>Áp dụng</button>
                        </div>
                      </div>
                    )}

                    {/* Submenu 10: Thời gian xử lý yêu cầu */}
                    {activeDropdown === 'handledTimeFilter' && (
                      <div className="p-4 w-[290px] space-y-3">
                        <div>
                          <h4 className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                            <Clock size={14} className="text-orange-600" /> Thời gian xử lý yêu cầu
                          </h4>
                          <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                            Thời điểm chuyển trạng thái "Đã chuyển yêu cầu" hoặc thời điểm Lưu lại.
                          </p>
                        </div>
                        <DateRangePicker
                          startDate={handledStartDate}
                          endDate={handledEndDate}
                          align="right"
                          onChange={(start, end) => {
                            setHandledStartDate(start);
                            setHandledEndDate(end);
                            setPage(1);
                          }}
                        />
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-xs">
                          <button className="text-gray-500 px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                          <button
                            className="text-red-500 px-2 py-1 hover:bg-red-50 rounded"
                            onClick={() => { setHandledStartDate(''); setHandledEndDate(''); setPage(1); }}
                          >
                            Xóa ngày
                          </button>
                          <button className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => setActiveDropdown(null)}>Đóng</button>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Active Filter Badges / Chips Row ── */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Đang lọc:</span>

              {/* 1. Trạng thái */}
              {filterStatuses.length > 0 && (
                <span className="inline-flex items-center bg-indigo-50 text-indigo-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-indigo-200">
                  Trạng thái: {filterStatuses.join(', ')}
                  <button type="button" className="ml-1.5 text-indigo-400 hover:text-indigo-600" onClick={() => { setFilterStatuses([]); setPage(1); }}>
                    <XCircle size={13} className="fill-indigo-100 text-indigo-600" />
                  </button>
                </span>
              )}

              {/* 2. Yêu cầu dịch vụ */}
              {filterServiceRequestTypes.length > 0 && (
                <span className="inline-flex items-center bg-amber-50 text-amber-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-amber-200">
                  Yêu cầu DV: {filterServiceRequestTypes.join(', ')}
                  <button type="button" className="ml-1.5 text-amber-400 hover:text-amber-600" onClick={() => { setFilterServiceRequestTypes([]); setPage(1); }}>
                    <XCircle size={13} className="fill-amber-100 text-amber-600" />
                  </button>
                </span>
              )}

              {/* 3. Sản phẩm */}
              {filterProductNames.length > 0 && (
                <span className="inline-flex items-center bg-purple-50 text-purple-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-purple-200">
                  Sản phẩm: {filterProductNames.join(', ')}
                  <button type="button" className="ml-1.5 text-purple-400 hover:text-purple-600" onClick={() => { setFilterProductNames([]); setPage(1); }}>
                    <XCircle size={13} className="fill-purple-100 text-purple-600" />
                  </button>
                </span>
              )}

              {/* 4. Loại yêu cầu */}
              {filterPhase3RequestTypes.length > 0 && (
                <span className="inline-flex items-center bg-sky-50 text-sky-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-sky-200">
                  Loại YC: {filterPhase3RequestTypes.join(', ')}
                  <button type="button" className="ml-1.5 text-sky-400 hover:text-sky-600" onClick={() => { setFilterPhase3RequestTypes([]); setPage(1); }}>
                    <XCircle size={13} className="fill-sky-100 text-sky-600" />
                  </button>
                </span>
              )}

              {/* 5. Loại dịch vụ */}
              {filterPhase3ServiceTypes.length > 0 && (
                <span className="inline-flex items-center bg-teal-50 text-teal-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-teal-200">
                  Loại DV: {filterPhase3ServiceTypes.join(', ')}
                  <button type="button" className="ml-1.5 text-teal-400 hover:text-teal-600" onClick={() => { setFilterPhase3ServiceTypes([]); setPage(1); }}>
                    <XCircle size={13} className="fill-teal-100 text-teal-600" />
                  </button>
                </span>
              )}

              {/* 6. Người gửi yêu cầu */}
              {filterCreatorIds.length > 0 && (
                <span className="inline-flex items-center bg-rose-50 text-rose-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-rose-200">
                  Người gửi: {filterCreatorIds.map(id => filterOptions.creators.find(c => c.id === id)?.fullName || id).join(', ')}
                  <button type="button" className="ml-1.5 text-rose-400 hover:text-rose-600" onClick={() => { setFilterCreatorIds([]); setPage(1); }}>
                    <XCircle size={13} className="fill-rose-100 text-rose-600" />
                  </button>
                </span>
              )}

              {/* 7. Thời gian gửi yêu cầu */}
              {(requestStartDate || requestEndDate) && (
                <span className="inline-flex items-center bg-blue-50 text-blue-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-blue-200">
                  TG gửi: {formatDateDisplay(requestStartDate)} - {formatDateDisplay(requestEndDate)}
                  <button type="button" className="ml-1.5 text-blue-400 hover:text-blue-600" onClick={() => { setRequestStartDate(''); setRequestEndDate(''); setPage(1); }}>
                    <XCircle size={13} className="fill-blue-100 text-blue-600" />
                  </button>
                </span>
              )}

              {/* 8. Team xử lý yêu cầu */}
              {filterTargetTeams.length > 0 && (
                <span className="inline-flex items-center bg-emerald-50 text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-emerald-200">
                  Team xử lý: {filterTargetTeams.join(', ')}
                  <button type="button" className="ml-1.5 text-emerald-400 hover:text-emerald-600" onClick={() => { setFilterTargetTeams([]); setPage(1); }}>
                    <XCircle size={13} className="fill-emerald-100 text-emerald-600" />
                  </button>
                </span>
              )}

              {/* 9. Người xử lý yêu cầu */}
              {filterHandlerUserIds.length > 0 && (
                <span className="inline-flex items-center bg-cyan-50 text-cyan-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-cyan-200">
                  Người xử lý: {filterHandlerUserIds.map(id => id === 'null' ? 'Chưa nhận' : (filterOptions.handlers.find(h => h.id === id)?.fullName || id)).join(', ')}
                  <button type="button" className="ml-1.5 text-cyan-400 hover:text-cyan-600" onClick={() => { setFilterHandlerUserIds([]); setPage(1); }}>
                    <XCircle size={13} className="fill-cyan-100 text-cyan-600" />
                  </button>
                </span>
              )}

              {/* 10. Thời gian xử lý yêu cầu */}
              {(handledStartDate || handledEndDate) && (
                <span className="inline-flex items-center bg-orange-50 text-orange-800 text-xs font-semibold px-2.5 py-1 rounded-md border border-orange-200">
                  TG xử lý: {formatDateDisplay(handledStartDate)} - {formatDateDisplay(handledEndDate)}
                  <button type="button" className="ml-1.5 text-orange-400 hover:text-orange-600" onClick={() => { setHandledStartDate(''); setHandledEndDate(''); setPage(1); }}>
                    <XCircle size={13} className="fill-orange-100 text-orange-600" />
                  </button>
                </span>
              )}

              {/* Clear All Button */}
              <button
                onClick={clearAllFilters}
                className="text-xs text-red-600 hover:text-red-700 font-bold hover:underline ml-1"
              >
                Xóa tất cả bộ lọc
              </button>
            </div>
          )}

          {/* ── Status Pills ── */}
          <div className="flex flex-wrap gap-2">
            {STATUS_PILLS.map(pill => {
              const count = pill.key === 'ALL'
                ? (badgeCounts['TỔNG YÊU CẦU'] || 0)
                : (badgeCounts[pill.key] || 0);
              const isActive = (filterStatuses.length === 0 && activeStatus === pill.key) || (filterStatuses.length === 1 && filterStatuses[0] === pill.key);
              return (
                <button
                  key={pill.key}
                  onClick={() => {
                    if (pill.key === 'ALL') {
                      setActiveStatus('ALL');
                      setFilterStatuses([]);
                    } else {
                      setActiveStatus(pill.key);
                      setFilterStatuses([pill.key]);
                    }
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${
                    isActive
                      ? `${pill.bgColor} ${pill.color} ${pill.borderColor} ring-2 ring-offset-1 ring-blue-300`
                      : `${pill.bgColor} ${pill.color} ${pill.borderColor} hover:opacity-80`
                  }`}
                >
                  {pill.label}: {count.toLocaleString()}
                </button>
              );
            })}
          </div>

          {/* ── Total count ── */}
          <div className="text-right text-xs text-gray-500">
            Có <span className="font-semibold text-gray-700">{totalCount.toLocaleString()}</span> dòng
          </div>

          {/* ── Data Table ── */}
          <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Mã yêu cầu hotline</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Khách hàng</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600 whitespace-nowrap">Thao tác</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Trạng thái</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Thông tin gửi yêu cầu</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Thông tin xử lý yêu cầu</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Sản phẩm</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Thông tin nội dung yêu cầu</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Thông tin nội dung xử lý</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Ghi chú nội dung tư vấn</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="text-center py-12"><Loader2 className="mx-auto animate-spin text-blue-500" size={28} /></td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">Không có yêu cầu hotline nào khớp với bộ lọc</td></tr>
                ) : tickets.map(ticket => {
                  const statusBadge = STATUS_BADGE_MAP[ticket.status] || { bg: 'bg-gray-100', text: 'text-gray-700' };
                  return (
                    <tr
                      key={ticket.id}
                      className="border-b border-gray-100 hover:bg-gray-50/70 transition-colors"
                    >
                      {/* 1. Mã yêu cầu hotline */}
                      <td
                        className="px-4 py-3 whitespace-nowrap cursor-pointer hover:bg-blue-50/80 transition-colors group"
                        onClick={() => { setSelectedTicket(ticket); setShowDetailModal(true); }}
                        title="Bấm vào mã đơn để mở chi tiết & chỉnh sửa phiếu"
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-blue-600 font-bold text-[13px] group-hover:underline group-hover:text-blue-800">
                            {ticket.ticketCode}
                          </span>
                          {ticket.source?.includes('Hỗ trợ kỹ thuật') && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-cyan-100 text-cyan-800 border border-cyan-300 w-fit">
                              🛠️ HỖ TRỢ KỸ THUẬT
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Khách hàng (Click vào SĐT để sao chép) */}
                      <td className="px-4 py-3 min-w-[220px]">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <User size={13} className="text-gray-400" />
                            <span className="font-medium text-gray-800">{ticket.customerName}</span>
                          </div>
                          {/* SĐT chính */}
                          <div
                            onClick={(e) => handleCopyPhone(ticket.customerPhone, e)}
                            className="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 group/phone w-fit py-0.5 px-1 -ml-1 rounded hover:bg-blue-50 transition-colors"
                            title="Bấm để sao chép số điện thoại"
                          >
                            <Phone size={13} className="text-gray-400 group-hover/phone:text-blue-500" />
                            <span className="text-gray-700 font-medium group-hover/phone:text-blue-600">
                              {ticket.customerPhone}
                            </span>
                            <Copy size={11} className="text-gray-400 opacity-0 group-hover/phone:opacity-100 transition-opacity" />
                          </div>
                          {/* SĐT phụ (nếu có) */}
                          {ticket.secondaryPhones && (
                            <div
                              onClick={(e) => handleCopyPhone(ticket.secondaryPhones!, e)}
                              className="flex items-center gap-1.5 cursor-pointer hover:text-emerald-600 group/secphone w-fit py-0.5 px-1 -ml-1 rounded hover:bg-emerald-50 transition-colors"
                              title="Bấm để sao chép SĐT phụ"
                            >
                              <Phone size={13} className="text-emerald-400 group-hover/secphone:text-emerald-600" />
                              <span className="text-gray-500 text-xs group-hover/secphone:text-emerald-700">
                                {ticket.secondaryPhones}
                              </span>
                              <Copy size={11} className="text-emerald-400 opacity-0 group-hover/secphone:opacity-100 transition-opacity" />
                            </div>
                          )}
                          {ticket.address && (
                            <div className="flex items-start gap-1.5">
                              <MapPin size={13} className="text-gray-400 mt-0.5" />
                              <span className="text-gray-500 text-xs leading-tight">{ticket.address}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <MapPin size={13} className="text-blue-400" />
                            <span className="text-blue-600 text-xs font-medium">{ticket.provinceName}</span>
                          </div>
                        </div>
                      </td>

                      {/* 3. Thao tác */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            title="Phân bổ"
                            onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); setAssignTeam(ticket.targetTeam || ''); setShowAssignModal(true); }}
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-100 transition-all"
                          >
                            <UserPlus size={18} />
                          </button>
                          <button
                            title="Thêm mới yêu cầu KH (Chuyển sang Ca dịch vụ)"
                            onClick={(e) => { e.stopPropagation(); handleConvertToOrder(ticket); }}
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-100 transition-all"
                          >
                            <ArrowRightCircle size={18} />
                          </button>
                          <button
                            title="Thêm mới đơn hàng (POS)"
                            onClick={(e) => { e.stopPropagation(); handlePOSNotice(); }}
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-100 transition-all"
                          >
                            <ShoppingCart size={18} />
                          </button>
                        </div>
                      </td>

                      {/* 4. Trạng thái */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                          {ticket.status}
                        </span>
                      </td>

                      {/* 5. Thông tin gửi yêu cầu */}
                      <td className="px-4 py-3 min-w-[180px]">
                        <div className="space-y-0.5 text-xs text-gray-600">
                          <div className="flex items-center gap-1">
                            <Clock size={12} className="text-gray-400" />
                            <span>{formatDateTime(ticket.requestTime)}</span>
                          </div>
                          {ticket.source?.includes('Hỗ trợ kỹ thuật') ? (
                            <div className="text-cyan-700 font-semibold text-[11px]">🌐 Từ Webapp Hỗ trợ kỹ thuật</div>
                          ) : ticket.createdBy ? (
                            <>
                              <div className="text-gray-500">{ticket.createdBy.fullName}</div>
                              {ticket.createdBy.email && (
                                <div className="text-gray-400 text-[11px]">({ticket.createdBy.email})</div>
                              )}
                            </>
                          ) : (
                            <div className="text-gray-400 italic">Tự động</div>
                          )}
                        </div>
                      </td>

                      {/* 6. Thông tin xử lý yêu cầu */}
                      <td className="px-4 py-3 min-w-[180px]">
                        <div className="space-y-0.5 text-xs text-gray-600">
                          <div className="font-semibold text-gray-800">{ticket.targetTeam || 'Chưa có dữ liệu'}</div>
                          {ticket.handlerUser ? (
                            <>
                              <div className="text-gray-500">{ticket.handlerUser.fullName}</div>
                              {ticket.handlerUser.email && (
                                <div className="text-gray-400 text-[11px]">({ticket.handlerUser.email})</div>
                              )}
                            </>
                          ) : (
                            <div className="text-gray-400 italic">Chưa có người xử lý</div>
                          )}
                        </div>
                      </td>

                      {/* 7. Sản phẩm */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-700 font-medium">{(ticket.productName || '').replace(/^PROD:\s*/i, '')}</div>
                        {ticket.serialNumber && (
                          <div className="text-xs text-gray-500 font-mono">{ticket.serialNumber}</div>
                        )}
                      </td>

                      {/* 8. Thông tin nội dung yêu cầu */}
                      <td className="px-4 py-3 min-w-[200px] max-w-[280px]">
                        <div className="space-y-1 text-xs">
                          {ticket.serviceRequestType && (
                            <span className="inline-block font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                              {ticket.serviceRequestType}
                            </span>
                          )}
                          {ticket.customerSupportDetail ? (
                            <div className="text-gray-700 whitespace-pre-line line-clamp-3 leading-relaxed">
                              {ticket.customerSupportDetail}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Chưa có nội dung</span>
                          )}
                        </div>
                      </td>

                      {/* 9. Thông tin nội dung xử lý */}
                      <td className="px-4 py-3 min-w-[180px] max-w-[250px]">
                        <div className="space-y-1 text-xs text-gray-600">
                          {(ticket.phase3RequestType || ticket.phase3ServiceType) && (
                            <div className="font-semibold text-amber-700">
                              {[ticket.phase3RequestType, ticket.phase3ServiceType].filter(Boolean).join(' • ')}
                            </div>
                          )}
                          {ticket.sparePartName && (
                            <div className="text-gray-500">🔧 Linh kiện: {ticket.sparePartName}</div>
                          )}
                          {ticket.phase3Feedback ? (
                            <div className="text-gray-700 whitespace-pre-line line-clamp-3">
                              {ticket.phase3Feedback}
                            </div>
                          ) : (!ticket.phase3RequestType && !ticket.phase3ServiceType && !ticket.sparePartName) ? (
                            <span className="text-gray-400 italic">Chưa có dữ liệu</span>
                          ) : null}
                        </div>
                      </td>

                      {/* 10. Ghi chú nội dung tư vấn */}
                      <td className="px-4 py-3 min-w-[180px] max-w-[250px]">
                        <div className="text-xs text-gray-700">
                          {ticket.consultationNote ? (
                            <div className="whitespace-pre-line line-clamp-3 leading-relaxed">
                              {ticket.consultationNote}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Chưa có ghi chú</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-600">
                Trang <span className="font-semibold">{page}</span> / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
           ASSIGN MODAL (Phân bổ)
         ══════════════════════════════════════════════════ */}
      {showAssignModal && selectedTicket && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-[#00A3FF] px-6 py-4">
              <h3 className="text-white font-bold text-lg">Phân bổ</h3>
            </div>
            <div className="p-6 space-y-5">
              {/* Team */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Team nhận yêu cầu *</label>
                <select
                  value={assignTeam}
                  onChange={(e) => { setAssignTeam(e.target.value); setAssignHandlerId(''); if (e.target.value) fetchHandlers(e.target.value); }}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                >
                  <option value="">Chọn team...</option>
                  <option value="Hotline">Hotline</option>
                  <option value="Coordinator">Coordinator</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
              {/* Người xử lý yêu cầu */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Người xử lý yêu cầu</label>
                <select
                  value={assignHandlerId}
                  onChange={(e) => setAssignHandlerId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                  disabled={!assignTeam}
                >
                  <option value="">Chọn người xử lý...</option>
                  {handlers.map(h => (
                    <option key={h.id} value={h.id}>{h.fullName} | {h.email || h.phoneNumber || ''}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => { setShowAssignModal(false); setSelectedTicket(null); }}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition-all"
              >
                Đóng lại
              </button>
              <button
                onClick={handleAssign}
                disabled={!assignTeam || assigning}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#00A3FF] rounded-lg hover:bg-[#0090E0] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {assigning && <Loader2 size={14} className="animate-spin" />}
                Phân bổ
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════════════════
           CREATE / DETAIL MODAL
         ══════════════════════════════════════════════════ */}
      {(showCreateModal || showDetailModal) && (
        <HotlineTicketModal
          ticket={showDetailModal ? selectedTicket : null}
          isOpen={showCreateModal || showDetailModal}
          onClose={() => { setShowCreateModal(false); setShowDetailModal(false); setSelectedTicket(null); }}
          onSaved={() => { setShowCreateModal(false); setShowDetailModal(false); setSelectedTicket(null); fetchTickets(); }}
          userRole={user?.role || ''}
        />
      )}

      {/* ══════════════════════════════════════════════════
           COPIED PHONE TOAST
         ══════════════════════════════════════════════════ */}
      {copiedPhone && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900/90 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-medium backdrop-blur-sm border border-gray-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span>Đã sao chép SĐT: <strong className="text-emerald-300 font-mono text-xs">{copiedPhone}</strong></span>
        </div>
      )}
    </div>
  );
}
