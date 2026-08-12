import { useState, useEffect, useCallback } from 'react';
import { fetchApi } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Search, Plus, UserPlus, ArrowRightCircle, ShoppingCart, Phone, MapPin, User, Clock, Loader2, ChevronLeft, ChevronRight, X, Wrench, Package, ShieldCheck, PhoneCall } from 'lucide-react';
import HotlineTicketModal from './HotlineTicketModal';

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
  targetTeam: string;
  createdBy?: { id: string; fullName: string; email?: string; role: string };
  handlerUser?: { id: string; fullName: string; email?: string; role: string } | null;
  convertedOrder?: { id: string; pancakeOrderId: number; billFullName?: string; adminStatus?: string } | null;
  customerSupportDetail?: string;
  serviceRequestType?: string;
}

interface BadgeCounts {
  [key: string]: number;
}

// ═══════════════════════════════════════════════════
//  Status Pill Config
// ═══════════════════════════════════════════════════

const STATUS_PILLS: { key: string; label: string; color: string; bgColor: string; borderColor: string }[] = [
  { key: 'ALL', label: 'TỔNG YÊU CẦU', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  { key: 'ĐANG CHỜ NHÓM 2 PHẢN HỒI', label: 'ĐANG CHỜ NHÓM 2 PHẢN HỒI', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  { key: 'KHÁCH HẸN GỌI LẠI SAU', label: 'KHÁCH HẸN GỌI LẠI SAU', color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  { key: 'CHƯA LIÊN HỆ ĐƯỢC KHÁCH', label: 'CHƯA LIÊN HỆ ĐƯỢC KHÁCH', color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
  { key: 'ĐÃ HỦY', label: 'ĐÃ HỦY', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  { key: 'ĐÃ HOÀN THÀNH', label: 'ĐÃ HOÀN THÀNH', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  { key: 'ĐÃ CHUYỂN YÊU CẦU', label: 'ĐÃ CHUYỂN YÊU CẦU', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { key: 'CHƯA THỰC HIỆN', label: 'CHƯA THỰC HIỆN', color: 'text-white', bgColor: 'bg-red-500', borderColor: 'border-red-500' },
];

const getServiceOrderStatusBadge = (adminStatus: string | undefined, hasKtv: boolean) => {
  const status = (adminStatus || 'chờ xử lý').toLowerCase();

  if (status === 'hoàn thành' || status === 'đã hoàn thành') {
    return { label: 'Hoàn thành', bg: 'bg-emerald-100', text: 'text-emerald-700' };
  }
  if (status === 'hủy đơn' || status === 'đã hủy') {
    return { label: 'Hủy đơn', bg: 'bg-red-100', text: 'text-red-700' };
  }
  if (status.includes('hoàn') || status.includes('đổi')) {
    return { label: 'Hoàn / Đổi', bg: 'bg-purple-100', text: 'text-purple-700' };
  }
  if (status === 'đang thực hiện' || status === 'đã phân công' || hasKtv) {
    return { label: 'Đã phân công', bg: 'bg-blue-100', text: 'text-blue-700' };
  }
  return { label: 'Chờ xử lý', bg: 'bg-amber-100', text: 'text-amber-700' };
};

const STATUS_BADGE_MAP: Record<string, { bg: string; text: string }> = {
  'CHỜ XÁC THỰC': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  'CHƯA THỰC HIỆN': { bg: 'bg-red-100', text: 'text-red-700' },
  'ĐANG CHỜ NHÓM 2 PHẢN HỒI': { bg: 'bg-amber-100', text: 'text-amber-700' },
  'KHÁCH HẸN GỌI LẠI SAU': { bg: 'bg-purple-100', text: 'text-purple-700' },
  'CHƯA LIÊN HỆ ĐƯỢC KHÁCH': { bg: 'bg-gray-100', text: 'text-gray-700' },
  'ĐÃ CHUYỂN YÊU CẦU': { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  'ĐÃ HOÀN THÀNH': { bg: 'bg-blue-100', text: 'text-blue-700' },
  'ĐÃ HỦY': { bg: 'bg-red-100', text: 'text-red-700' },
};

// ═══════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════

export default function HotlineManage() {
  const { user } = useAuth();
  
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

  // Assign modal states
  const [assignTeam, setAssignTeam] = useState('');
  const [assignHandlerId, setAssignHandlerId] = useState('');
  const [handlers, setHandlers] = useState<any[]>([]);
  const [assigning, setAssigning] = useState(false);

  // ── Fetch tickets ──
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeStatus !== 'ALL') params.set('status', activeStatus);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
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
      setLoading(false);
    }
  }, [activeStatus, searchQuery, page]);

  useEffect(() => {
    if (activeMainTab === 'tickets') {
      fetchTickets();
    }
  }, [fetchTickets, activeMainTab]);

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

  // ── Actions ──
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
      setAssignTeam('');
      setAssignHandlerId('');
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Lỗi phân bổ');
    } finally {
      setAssigning(false);
    }
  };

  const handleConvertToOrder = async (ticket: HotlineTicket) => {
    if (ticket.status === 'ĐÃ CHUYỂN YÊU CẦU') {
      alert('Phiếu này đã được chuyển thành ca dịch vụ trước đó.');
      return;
    }
    if (!confirm(`Bạn có muốn chuyển phiếu ${ticket.ticketCode} thành Ca dịch vụ không?`)) return;
    try {
      await fetchApi(`/hotlines/${ticket.id}/convert-to-order`, { method: 'POST' });
      fetchTickets();
    } catch (err: any) {
      alert(err.message || 'Lỗi chuyển đơn');
    }
  };

  const handlePOSNotice = () => {
    alert('Vui lòng tạo đơn mới bên POS');
  };

  const formatDateTime = (dt: string) => {
    if (!dt) return '';
    const d = new Date(dt);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  };

  // ═══════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════

  return (
    <div className="space-y-4">
      {/* ── Main Tab Navigation ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveMainTab('history')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeMainTab === 'history'
                ? 'bg-[#1B3A6B] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Search size={17} /> Tìm kiếm lịch sử khách hàng
          </button>
          <button
            onClick={() => setActiveMainTab('tickets')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeMainTab === 'tickets'
                ? 'bg-[#1B3A6B] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <PhoneCall size={17} /> Yêu cầu Hotline
          </button>
        </div>

        {activeMainTab === 'tickets' && (
          <button
            onClick={() => { setSelectedTicket(null); setShowCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#00A3FF] hover:bg-[#0090E0] text-white rounded-xl font-semibold text-sm shadow-sm transition-all"
          >
            <Plus size={18} /> Thêm mới Ticket
          </button>
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
                      <thead className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-600">
                        <tr>
                          <th className="px-3 py-2">Mã Serial</th>
                          <th className="px-3 py-2">Sản phẩm / Dòng máy</th>
                          <th className="px-3 py-2">Chủ sở hữu</th>
                          <th className="px-3 py-2">Địa chỉ</th>
                          <th className="px-3 py-2">Trạng thái bảo hành</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyResults.serials.map((s: any) => (
                          <tr key={s.id} className="hover:bg-purple-50/40">
                            <td className="px-3 py-2.5 font-mono text-purple-700 font-bold">{s.serialNumber}</td>
                            <td className="px-3 py-2.5 font-medium text-gray-800">{s.model || s.productLine}</td>
                            <td className="px-3 py-2.5">{s.customerName} ({s.customerPhone})</td>
                            <td className="px-3 py-2.5 text-gray-500">{s.address || s.province || '-'}</td>
                            <td className="px-3 py-2.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-green-100 text-green-700">
                                <ShieldCheck size={12} /> {s.status || 'Đã kích hoạt'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. Các Đơn Yêu Cầu Dịch Vụ */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Wrench className="text-amber-600" size={18} />
                  <h4 className="font-bold text-gray-800 text-sm">3. Đơn yêu cầu Dịch vụ Kỹ thuật ({historyResults.serviceOrders?.length || 0})</h4>
                </div>

                {historyResults.serviceOrders?.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3 italic">Không có đơn yêu cầu dịch vụ nào</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-gray-50 border-b border-gray-200 font-semibold text-gray-600">
                        <tr>
                          <th className="px-3 py-2">Mã đơn</th>
                          <th className="px-3 py-2">Khách hàng</th>
                          <th className="px-3 py-2">Loại công việc</th>
                          <th className="px-3 py-2">Sản phẩm / Items</th>
                          <th className="px-3 py-2">KTV phụ trách</th>
                          <th className="px-3 py-2">Trạng thái</th>
                          <th className="px-3 py-2">Ngày tạo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyResults.serviceOrders.map((o: any) => {
                          const hasKtv = !!(o.assignedKtv?.fullName || o.assignedKtvName);
                          const badge = getServiceOrderStatusBadge(o.adminStatus, hasKtv);
                          return (
                            <tr key={o.id} className="hover:bg-amber-50/40">
                              <td className="px-3 py-2.5 font-mono text-amber-700 font-bold">#{o.pancakeOrderId || o.id.substring(0, 8)}</td>
                              <td className="px-3 py-2.5 font-medium text-gray-800">{o.billFullName} ({o.billPhoneNumber})</td>
                              <td className="px-3 py-2.5 font-semibold text-blue-600">{o.workType || 'Sửa chữa'}</td>
                              <td className="px-3 py-2.5 text-gray-700">
                                {o.items?.map((it: any) => it.productName).join(', ') || 'Thiết bị Truliva'}
                              </td>
                              <td className="px-3 py-2.5 text-gray-600">{o.assignedKtv?.fullName || o.assignedKtvName || 'Chưa phân công'}</td>
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${badge.bg} ${badge.text}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-500">{formatDateTime(o.createdAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 4. Các Yêu Cầu Hotline */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <PhoneCall className="text-emerald-600" size={18} />
                  <h4 className="font-bold text-gray-800 text-sm">4. Các Yêu cầu Hotline ({historyResults.hotlineTickets?.length || 0})</h4>
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
                                <div>{t.productName}</div>
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
          {/* ── Search Bar ── */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Mã yêu cầu, tên khách hàng, sđt, địa chỉ, serial, ghi chú"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                onKeyDown={(e) => e.key === 'Enter' && fetchTickets()}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              />
            </div>
            <button
              onClick={() => { setPage(1); fetchTickets(); }}
              className="px-5 py-2.5 bg-[#00A3FF] text-white rounded-lg text-sm font-medium hover:bg-[#0090E0] transition-all"
            >
              Tìm kiếm
            </button>
          </div>

          {/* ── Status Pills ── */}
          <div className="flex flex-wrap gap-2">
            {STATUS_PILLS.map(pill => {
              const count = pill.key === 'ALL'
                ? (badgeCounts['TỔNG YÊU CẦU'] || 0)
                : (badgeCounts[pill.key] || 0);
              const isActive = activeStatus === pill.key;
              return (
                <button
                  key={pill.key}
                  onClick={() => { setActiveStatus(pill.key); setPage(1); }}
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
          <div className="text-right text-sm text-gray-500">
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
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12"><Loader2 className="mx-auto animate-spin text-blue-500" size={28} /></td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">Không có yêu cầu hotline nào</td></tr>
                ) : tickets.map(ticket => {
                  const statusBadge = STATUS_BADGE_MAP[ticket.status] || { bg: 'bg-gray-100', text: 'text-gray-700' };
                  return (
                    <tr
                      key={ticket.id}
                      className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors cursor-pointer"
                      onClick={() => { setSelectedTicket(ticket); setShowDetailModal(true); }}
                    >
                      {/* Mã yêu cầu */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-blue-600 font-medium text-[13px]">{ticket.ticketCode}</span>
                          {ticket.source?.includes('Hỗ trợ kỹ thuật') && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-cyan-100 text-cyan-800 border border-cyan-300 w-fit">
                              🛠️ HỖ TRỢ KỸ THUẬT
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Khách hàng */}
                      <td className="px-4 py-3 min-w-[220px]">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <User size={13} className="text-gray-400" />
                            <span className="font-medium text-gray-800">{ticket.customerName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone size={13} className="text-gray-400" />
                            <span className="text-gray-600">{ticket.customerPhone}</span>
                          </div>
                          {ticket.secondaryPhones && (
                            <div className="flex items-center gap-1.5">
                              <Phone size={13} className="text-emerald-400" />
                              <span className="text-gray-500 text-xs">{ticket.secondaryPhones}</span>
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

                      {/* Thao tác */}
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          {/* Icon 1: Phân bổ */}
                          <button
                            title="Phân bổ"
                            onClick={(e) => { e.stopPropagation(); setSelectedTicket(ticket); setAssignTeam(ticket.targetTeam || ''); setShowAssignModal(true); }}
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-100 transition-all"
                          >
                            <UserPlus size={18} />
                          </button>
                          {/* Icon 2: Thêm mới yêu cầu KH (Chuyển sang Ca DV) */}
                          <button
                            title="Thêm mới yêu cầu KH (Chuyển sang Ca dịch vụ)"
                            onClick={(e) => { e.stopPropagation(); handleConvertToOrder(ticket); }}
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-100 transition-all"
                          >
                            <ArrowRightCircle size={18} />
                          </button>
                          {/* Icon 3: Thêm mới đơn hàng (POS) */}
                          <button
                            title="Thêm mới đơn hàng (POS)"
                            onClick={(e) => { e.stopPropagation(); handlePOSNotice(); }}
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-100 transition-all"
                          >
                            <ShoppingCart size={18} />
                          </button>
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold ${statusBadge.bg} ${statusBadge.text}`}>
                          {ticket.status}
                        </span>
                      </td>

                      {/* Thông tin gửi yêu cầu */}
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

                      {/* Thông tin xử lý */}
                      <td className="px-4 py-3 min-w-[180px]">
                        <div className="space-y-0.5 text-xs text-gray-600">
                          <div>{ticket.targetTeam || 'Chưa có dữ liệu'}</div>
                          {ticket.handlerUser ? (
                            <>
                              <div className="text-gray-500">{ticket.handlerUser.fullName}</div>
                              {ticket.handlerUser.email && (
                                <div className="text-gray-400 text-[11px]">({ticket.handlerUser.email})</div>
                              )}
                            </>
                          ) : (
                            <div className="text-gray-400 italic">Chưa có dữ liệu</div>
                          )}
                        </div>
                      </td>

                      {/* Sản phẩm */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-700 font-medium">{ticket.productName}</div>
                        {ticket.serialNumber && (
                          <div className="text-xs text-gray-500 font-mono">{ticket.serialNumber}</div>
                        )}
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
      {showAssignModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
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
              {/* Người nhận */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Người nhận yêu cầu</label>
                <select
                  value={assignHandlerId}
                  onChange={(e) => setAssignHandlerId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                  disabled={!assignTeam}
                >
                  <option value="">Chọn người nhận...</option>
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
        </div>
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
    </div>
  );
}
