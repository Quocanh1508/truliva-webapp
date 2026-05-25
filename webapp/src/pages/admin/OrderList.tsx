import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrders, updateOrder, getKtvUsers, getStations, getOrderAuditLog, syncOrders } from '../../api/client';
import { Search, ChevronLeft, ChevronRight, History, Edit, XCircle, Filter, RefreshCw, FileText } from 'lucide-react';

function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const ROW_STATUS_OPTIONS = [
  { value: 'chờ xử lý', label: 'Chờ xử lý' },
  { value: 'đang thực hiện', label: 'Đã phân công' },
  { value: 'hoàn thành', label: 'Hoàn thành' },
  { value: 'hủy đơn', label: 'Hủy đơn' },
];

export default function OrderList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [_error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [sortBy] = useState('createdAt');
  const [sortOrder] = useState('desc');
  
  // Date Filters
  const [datePreset, setDatePreset] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [_totalItems, setTotalItems] = useState(0);

  // Advanced Filtering States
  const [filterPancakeOrderId, setFilterPancakeOrderId] = useState('');
  const [filterAdminStatuses, setFilterAdminStatuses] = useState<string[]>([]);
  const [filterKtvIds, setFilterKtvIds] = useState<string[]>([]);
  const [filterWorkTypes, setFilterWorkTypes] = useState<string[]>([]);
  const [filterMainStationIds, setFilterMainStationIds] = useState<string[]>([]);
  const [filterCustomerName, setFilterCustomerName] = useState('');
  const [filterCustomerPhone, setFilterCustomerPhone] = useState('');

  // Dropdown / Popover states
  const [activeDropdown, setActiveDropdown] = useState<'main' | 'pancakeOrderId' | 'adminStatuses' | 'ktvIds' | 'workTypes' | 'mainStationIds' | 'customerName' | 'customerPhone' | null>(null);

  // Temporary filter states for the popover/modal
  const [tempPancakeOrderId, setTempPancakeOrderId] = useState('');
  const [tempAdminStatuses, setTempAdminStatuses] = useState<string[]>([]);
  const [tempKtvIds, setTempKtvIds] = useState<string[]>([]);
  const [tempWorkTypes, setTempWorkTypes] = useState<string[]>([]);
  const [tempMainStationIds, setTempMainStationIds] = useState<string[]>([]);
  const [tempCustomerName, setTempCustomerName] = useState('');
  const [tempCustomerPhone, setTempCustomerPhone] = useState('');

  // Assignment Modal
  const [assignModal, setAssignModal] = useState<{isOpen: boolean; orderId: string; order: any} | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [ktvs, setKtvs] = useState<any[]>([]);
  const [allKtvs, setAllKtvs] = useState<any[]>([]);
  
  const [selectedMain, setSelectedMain] = useState('');
  const [selectedTech, setSelectedTech] = useState('');
  const [selectedKtv, setSelectedKtv] = useState('');
  const [appointment, setAppointment] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [workType, setWorkType] = useState('');
  const [serviceType, setServiceType] = useState('');

  // Smart Dispatching Suggestions
  const [suggestedMain, setSuggestedMain] = useState<any>(null);
  const [suggestedTech, setSuggestedTech] = useState<any>(null);
  const [suggestedKtv, setSuggestedKtv] = useState<any>(null);

  // Audit Log Modal
  const [auditModal, setAuditModal] = useState<{isOpen: boolean; orderId: string} | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Cancel Modal
  const [cancelModal, setCancelModal] = useState<{isOpen: boolean; orderId: string} | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const getDateRange = () => {
    if (!datePreset) return { startDate: '', endDate: '' };
    
    const now = new Date();
    
    if (datePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    
    if (datePreset === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    
    if (datePreset === 'week') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    
    if (datePreset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 0, 0, 0, 0);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    
    if (datePreset === 'year') {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    
    if (datePreset === 'custom') {
      const start = customStartDate ? new Date(customStartDate + 'T00:00:00').toISOString() : '';
      const end = customEndDate ? new Date(customEndDate + 'T23:59:59').toISOString() : '';
      return { startDate: start, endDate: end };
    }
    
    return { startDate: '', endDate: '' };
  };

  const fetchOrdersData = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      const res = await getOrders({
        page, 
        limit: 20, 
        search, 
        sortBy, 
        sortOrder,
        startDate,
        endDate,
        pancakeOrderId: filterPancakeOrderId,
        adminStatuses: filterAdminStatuses,
        assignedKtvIds: filterKtvIds,
        workTypes: filterWorkTypes,
        mainStationIds: filterMainStationIds,
        customerName: filterCustomerName,
        customerPhone: filterCustomerPhone
      });
      setOrders(res.orders);
      setTotalPages(res.pagination.totalPages);
      setTotalItems(res.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Lỗi tải danh sách');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersData();
  }, [
    page, 
    sortBy, 
    sortOrder, 
    datePreset, 
    customStartDate, 
    customEndDate,
    filterPancakeOrderId,
    filterAdminStatuses,
    filterKtvIds,
    filterWorkTypes,
    filterMainStationIds,
    filterCustomerName,
    filterCustomerPhone
  ]);

  useEffect(() => {
    getStations().then(data => setStations(data)).catch(console.error);
    getKtvUsers().then(data => setAllKtvs(data)).catch(console.error);
  }, []);

  // Filter KTVs based on tech station
  useEffect(() => {
    if (selectedTech) {
      getKtvUsers({ 
        techStationId: selectedTech, 
        excludeOrderId: assignModal?.orderId 
      }).then(data => setKtvs(data)).catch(console.error);
    } else {
      setKtvs([]);
    }
  }, [selectedTech, assignModal?.orderId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrdersData();
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (newStatus === 'hủy đơn') {
      setCancelModal({ isOpen: true, orderId });
      return;
    }
    try {
      await updateOrder(orderId, { adminStatus: newStatus });
      fetchOrdersData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const submitCancel = async () => {
    if (!cancelModal) return;
    try {
      await updateOrder(cancelModal.orderId, { adminStatus: 'hủy đơn', cancelReason });
      setCancelModal(null);
      setCancelReason('');
      fetchOrdersData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openAssignModal = (order: any) => {
    setSelectedMain(order.mainStationId || '');
    setSelectedTech(order.techStationId || '');
    setSelectedKtv(order.assignedKtvId || '');
    
    // Convert UTC to local input format
    let appTime = '';
    if (order.appointmentTime) {
      appTime = new Date(new Date(order.appointmentTime).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16);
    }
    setAppointment(appTime);
    setRescheduleReason(order.rescheduleReason || '');
    setWorkType(order.workType || '');
    setServiceType(order.serviceType || '');

    // --- Smart Dispatching Logic (Cải tiến) ---
    let matchedMain: any = null;
    let matchedTech: any = null;
    let bestKtv: any = null;

    const province = order.shippingAddress?.province_name || order.customer?.provinceName || '';
    const district = order.shippingAddress?.district_name || order.customer?.districtName || '';
    const fullAddress = order.shippingAddress?.full_address || order.customer?.fullAddress || '';

    // Hàm chuẩn hóa chuỗi địa phương loại bỏ tiền tố tp., tinh, quan, huyen ở đầu chuỗi
    const cleanLoc = (str: string) => {
      if (!str) return '';
      let clean = removeAccents(str);
      return clean
        .replace(/^(tp\.?|thanh pho|tinh|quan|huyen|phuong|xa)\b/g, '')
        .replace(/[().-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const cleanProvince = cleanLoc(province);
    const cleanDistrict = cleanLoc(district);
    const cleanFullAddress = cleanLoc(fullAddress);

    // Duyệt qua tất cả các trạm kỹ thuật để tìm trạm khớp nhất với địa chỉ đơn hàng
    let bestScore = 0;

    for (const main of stations) {
      if (main.techStations) {
        for (const tech of main.techStations) {
          // Lấy tên gốc của trạm (bỏ phần chú thích trong ngoặc đơn như "(Thủ Dầu Một)")
          const baseTechName = tech.name.split('(')[0].trim();
          const cleanTech = cleanLoc(baseTechName);

          if (!cleanTech) continue;

          let score = 0;
          // Nếu địa chỉ đầy đủ chứa tên trạm kỹ thuật (độ ưu tiên cao nhất)
          if (cleanFullAddress && cleanFullAddress.includes(cleanTech)) {
            score = 10;
          } 
          // Hoặc nếu tỉnh/thành phố trùng khớp với tên trạm kỹ thuật
          else if (cleanProvince && (cleanProvince.includes(cleanTech) || cleanTech.includes(cleanProvince))) {
            score = 8;
          }
          // Hoặc quận/huyện trùng khớp
          else if (cleanDistrict && (cleanDistrict.includes(cleanTech) || cleanTech.includes(cleanDistrict))) {
            score = 6;
          }

          if (score > bestScore) {
            bestScore = score;
            matchedTech = tech;
            matchedMain = main;
          }
        }
      }
    }

    // 3. Find suggested KTV (freest KTV in matching tech station)
    if (matchedTech) {
      const techKtvs = allKtvs.filter(k => k.techStationId === matchedTech.id);
      if (techKtvs.length > 0) {
        // Exclude current order from counts for suggestion logic
        const isCurrentOrderPending = order.adminStatus !== 'hủy đơn' && order.adminStatus !== 'hoàn thành' && (!order.serviceReports || order.serviceReports.length === 0);
        const adjustedKtvs = techKtvs.map(k => {
          let count = k.pendingOrderCount || 0;
          if (isCurrentOrderPending && k.id === order.assignedKtvId && count > 0) {
            count -= 1;
          }
          return { ...k, pendingOrderCount: count };
        });
        const sorted = adjustedKtvs.sort((a, b) => (a.pendingOrderCount || 0) - (b.pendingOrderCount || 0));
        bestKtv = sorted[0];
      }
    }

    setSuggestedMain(matchedMain);
    setSuggestedTech(matchedTech);
    setSuggestedKtv(bestKtv);
    
    setAssignModal({ isOpen: true, orderId: order.id, order });
  };

  const submitAssign = async () => {
    if (!assignModal) return;
    try {
      await updateOrder(assignModal.orderId, {
        mainStationId: selectedMain || null,
        techStationId: selectedTech || null,
        assignedKtvId: selectedKtv || null,
        appointmentTime: appointment ? new Date(appointment).toISOString() : null,
        rescheduleReason: rescheduleReason || null,
        workType: workType || null,
        serviceType: serviceType || null,
        adminStatus: selectedKtv ? 'đang thực hiện' : 'chờ xử lý' // auto update status
      });
      setAssignModal(null);
      fetchOrdersData();
    } catch (err: any) {
      alert(err.message);
    }
  };
  const toggleDropdown = (type: 'main' | 'pancakeOrderId' | 'adminStatuses' | 'ktvIds' | 'workTypes' | 'mainStationIds' | 'customerName' | 'customerPhone') => {
    if (activeDropdown === type) {
      setActiveDropdown(null);
    } else {
      setActiveDropdown(type);
      // Initialize temp values from current active filters
      if (type === 'pancakeOrderId') setTempPancakeOrderId(filterPancakeOrderId);
      if (type === 'adminStatuses') setTempAdminStatuses(filterAdminStatuses);
      if (type === 'ktvIds') setTempKtvIds(filterKtvIds);
      if (type === 'workTypes') setTempWorkTypes(filterWorkTypes);
      if (type === 'mainStationIds') setTempMainStationIds(filterMainStationIds);
      if (type === 'customerName') setTempCustomerName(filterCustomerName);
      if (type === 'customerPhone') setTempCustomerPhone(filterCustomerPhone);
    }
  };

  const applyFilter = (type: 'pancakeOrderId' | 'adminStatuses' | 'ktvIds' | 'workTypes' | 'mainStationIds' | 'customerName' | 'customerPhone') => {
    setPage(1);
    if (type === 'pancakeOrderId') setFilterPancakeOrderId(tempPancakeOrderId);
    if (type === 'adminStatuses') setFilterAdminStatuses(tempAdminStatuses);
    if (type === 'ktvIds') setFilterKtvIds(tempKtvIds);
    if (type === 'workTypes') setFilterWorkTypes(tempWorkTypes);
    if (type === 'mainStationIds') setFilterMainStationIds(tempMainStationIds);
    if (type === 'customerName') setFilterCustomerName(tempCustomerName);
    if (type === 'customerPhone') setFilterCustomerPhone(tempCustomerPhone);
    setActiveDropdown(null);
  };

  const clearAllFilters = () => {
    setPage(1);
    setFilterPancakeOrderId('');
    setFilterAdminStatuses([]);
    setFilterKtvIds([]);
    setFilterWorkTypes([]);
    setFilterMainStationIds([]);
    setFilterCustomerName('');
    setFilterCustomerPhone('');
  };

  const openAuditModal = async (orderId: string) => {
    setAuditModal({ isOpen: true, orderId });
    setLoadingAudit(true);
    try {
      const logs = await getOrderAuditLog(orderId);
      setAuditLogs(logs);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'chờ xử lý': return 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500';
      case 'đang thực hiện': return 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500';
      case 'hoàn thành': return 'bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-500';
      case 'hủy đơn': return 'bg-red-500 hover:bg-red-600 focus:ring-red-500';
      default: return 'bg-gray-500 hover:bg-gray-600 focus:ring-gray-500';
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const res = await syncOrders();
      alert(res.message || 'Đồng bộ thành công.');
      fetchOrdersData();
    } catch (err: any) {
      alert(err.message || 'Lỗi đồng bộ.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-[calc(100vh-120px)] font-sans">
      
      {/* Top Tabs */}
      <div className="flex justify-between border-b border-gray-200 bg-gray-50 px-4 pt-1">
        <div className="flex space-x-1">
          <button className="px-5 py-2.5 text-[14px] font-medium text-blue-600 border-b-2 border-blue-600 bg-white -mb-[1px]">Đơn hàng</button>
        </div>
      </div>

      {/* Advanced Filter Popover Backdrop overlay */}
      {activeDropdown && (
        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActiveDropdown(null)} />
      )}

      {/* Toolbar */}
      <div className="flex flex-col bg-white border-b border-gray-200">
        <div className="flex justify-between items-center px-4 py-3">
          <form onSubmit={handleSearch} className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Tìm theo ID, Khách hàng, SĐT..."
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          <div className="flex items-center space-x-3">
            {/* Đồng bộ từ Pancake button */}
            <button 
              onClick={handleSync}
              disabled={syncing}
              className={`flex items-center space-x-1.5 px-3 py-2 text-[13px] border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none font-medium transition-colors ${syncing ? 'opacity-60 cursor-not-allowed' : ''}`}
              title="Đồng bộ thủ công các đơn hàng mới nhất từ Pancake POS"
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin text-blue-600' : 'text-gray-500'} />
              <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ Pancake'}</span>
            </button>

            {/* Bộ lọc button & popover container */}
            <div className="relative z-50">
              <button 
                onClick={() => toggleDropdown('main')}
                className="flex items-center space-x-1.5 px-3 py-2 text-[13px] border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none font-medium"
              >
                <Filter size={15} />
                <span>Bộ lọc</span>
              </button>

              {/* Popover Card */}
              {activeDropdown && (
                <div className="absolute right-0 mt-2 bg-white border rounded-lg shadow-xl z-50 overflow-hidden text-left min-w-[220px]">
                  {activeDropdown === 'main' && (
                    <div className="w-56 py-1 text-sm text-gray-700">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b uppercase">Thêm điều kiện lọc</div>
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => toggleDropdown('pancakeOrderId')}>Mã đơn hàng</button>
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => toggleDropdown('adminStatuses')}>Trạng thái đơn</button>
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => toggleDropdown('ktvIds')}>Kỹ thuật viên</button>
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => toggleDropdown('workTypes')}>Loại công việc</button>
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => toggleDropdown('mainStationIds')}>Trạm chính</button>
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => toggleDropdown('customerName')}>Tên khách hàng</button>
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => toggleDropdown('customerPhone')}>Số điện thoại</button>
                    </div>
                  )}

                  {activeDropdown === 'pancakeOrderId' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Mã đơn hàng</h4>
                      <input 
                        type="text" 
                        className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500 text-gray-800 bg-white" 
                        placeholder="Nhập mã đơn Pancake..." 
                        value={tempPancakeOrderId} 
                        onChange={e => setTempPancakeOrderId(e.target.value)} 
                      />
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('pancakeOrderId')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'adminStatuses' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Trạng thái đơn</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {ROW_STATUS_OPTIONS.map(opt => (
                          <label key={opt.value} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="rounded text-blue-600 focus:ring-blue-500" 
                              checked={tempAdminStatuses.includes(opt.value)} 
                              onChange={e => {
                                if (e.target.checked) {
                                  setTempAdminStatuses([...tempAdminStatuses, opt.value]);
                                } else {
                                  setTempAdminStatuses(tempAdminStatuses.filter(v => v !== opt.value));
                                }
                              }} 
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('adminStatuses')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'ktvIds' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Kỹ thuật viên</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        <label className="flex items-center space-x-2 text-sm font-medium cursor-pointer text-amber-600 border-b pb-1.5 mb-1.5">
                          <input 
                            type="checkbox" 
                            className="rounded text-blue-600 focus:ring-blue-500" 
                            checked={tempKtvIds.includes('null')} 
                            onChange={e => {
                              if (e.target.checked) {
                                setTempKtvIds([...tempKtvIds, 'null']);
                              } else {
                                setTempKtvIds(tempKtvIds.filter(v => v !== 'null'));
                              }
                            }} 
                          />
                          <span>Chưa gán KTV (Trống)</span>
                        </label>
                        {allKtvs.map(k => (
                          <label key={k.id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="rounded text-blue-600 focus:ring-blue-500" 
                              checked={tempKtvIds.includes(k.id)} 
                              onChange={e => {
                                if (e.target.checked) {
                                  setTempKtvIds([...tempKtvIds, k.id]);
                                } else {
                                  setTempKtvIds(tempKtvIds.filter(v => v !== k.id));
                                }
                              }} 
                            />
                            <span>{k.fullName}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('ktvIds')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'workTypes' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Loại công việc</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        <label className="flex items-center space-x-2 text-sm font-medium cursor-pointer text-amber-600 border-b pb-1.5 mb-1.5">
                          <input 
                            type="checkbox" 
                            className="rounded text-blue-600 focus:ring-blue-500" 
                            checked={tempWorkTypes.includes('null')} 
                            onChange={e => {
                              if (e.target.checked) {
                                setTempWorkTypes([...tempWorkTypes, 'null']);
                              } else {
                                setTempWorkTypes(tempWorkTypes.filter(v => v !== 'null'));
                              }
                            }} 
                          />
                          <span>Chưa xác định (Trống)</span>
                        </label>
                        {['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc', 'Bảo hành', 'Sửa chữa'].map(wt => (
                          <label key={wt} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="rounded text-blue-600 focus:ring-blue-500" 
                              checked={tempWorkTypes.includes(wt)} 
                              onChange={e => {
                                if (e.target.checked) {
                                  setTempWorkTypes([...tempWorkTypes, wt]);
                                } else {
                                  setTempWorkTypes(tempWorkTypes.filter(v => v !== wt));
                                }
                              }} 
                            />
                            <span>{wt}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('workTypes')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'mainStationIds' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Trạm chính</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        <label className="flex items-center space-x-2 text-sm font-medium cursor-pointer text-amber-600 border-b pb-1.5 mb-1.5">
                          <input 
                            type="checkbox" 
                            className="rounded text-blue-600 focus:ring-blue-500" 
                            checked={tempMainStationIds.includes('null')} 
                            onChange={e => {
                              if (e.target.checked) {
                                setTempMainStationIds([...tempMainStationIds, 'null']);
                              } else {
                                setTempMainStationIds(tempMainStationIds.filter(v => v !== 'null'));
                              }
                            }} 
                          />
                          <span>Chưa phân trạm (Trống)</span>
                        </label>
                        {stations.map(st => (
                          <label key={st.id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="rounded text-blue-600 focus:ring-blue-500" 
                              checked={tempMainStationIds.includes(st.id)} 
                              onChange={e => {
                                if (e.target.checked) {
                                  setTempMainStationIds([...tempMainStationIds, st.id]);
                                } else {
                                  setTempMainStationIds(tempMainStationIds.filter(v => v !== st.id));
                                }
                              }} 
                            />
                            <span>{st.name}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('mainStationIds')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'customerName' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Tên khách hàng</h4>
                      <input 
                        type="text" 
                        className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500 text-gray-800 bg-white" 
                        placeholder="Nhập tên khách..." 
                        value={tempCustomerName} 
                        onChange={e => setTempCustomerName(e.target.value)} 
                      />
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('customerName')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'customerPhone' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Số điện thoại</h4>
                      <input 
                        type="text" 
                        className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500 text-gray-800 bg-white" 
                        placeholder="Nhập SĐT..." 
                        value={tempCustomerPhone} 
                        onChange={e => setTempCustomerPhone(e.target.value)} 
                      />
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('customerPhone')}>Áp dụng</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Existing Date Range Picker logic */}
            {datePreset === 'custom' && (
              <div className="flex items-center space-x-2">
                <input 
                  type="date" 
                  className="px-3 py-1.5 text-[13px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                  value={customStartDate}
                  onChange={(e) => { setCustomStartDate(e.target.value); setPage(1); }}
                />
                <span className="text-gray-400">đến</span>
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
          </div>
        </div>

        {/* Selected Filter Badges / Tags row */}
        {(filterPancakeOrderId || filterAdminStatuses.length > 0 || filterKtvIds.length > 0 || filterWorkTypes.length > 0 || filterMainStationIds.length > 0 || filterCustomerName || filterCustomerPhone) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase">Đang lọc:</span>

            {filterPancakeOrderId && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Mã đơn: {filterPancakeOrderId}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterPancakeOrderId(''); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterAdminStatuses.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Trạng thái: {filterAdminStatuses.map(s => ROW_STATUS_OPTIONS.find(o => o.value === s)?.label || s).join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterAdminStatuses([]); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterKtvIds.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                KTV: {filterKtvIds.map(id => id === 'null' ? 'Chưa gán KTV' : (allKtvs.find(k => k.id === id)?.fullName || id)).join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterKtvIds([]); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterWorkTypes.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Loại CV: {filterWorkTypes.map(w => w === 'null' ? 'Chưa xác định' : w).join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterWorkTypes([]); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterMainStationIds.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Trạm chính: {filterMainStationIds.map(id => id === 'null' ? 'Chưa phân trạm' : (stations.find(s => s.id === id)?.name || id)).join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterMainStationIds([]); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterCustomerName && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Tên khách: {filterCustomerName}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterCustomerName(''); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterCustomerPhone && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                SĐT khách: {filterCustomerPhone}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterCustomerPhone(''); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            <button 
              onClick={clearAllFilters}
              className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1.5 rounded hover:bg-red-50 transition-colors"
            >
              Xóa tất cả bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-white">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Không tìm thấy yêu cầu nào</div>
        ) : (
          <table className="w-full text-left text-[13px] whitespace-nowrap">
            <thead className="sticky top-0 bg-[#f8f9fa] text-gray-600 font-semibold border-b border-gray-200 z-10">
              <tr>
                <th className="px-4 py-3 w-[80px]">Mã đơn</th>
                <th className="px-4 py-3 w-[250px]">Khách hàng & Địa chỉ</th>
                <th className="px-4 py-3 w-[250px]">Sản phẩm & Tiền thu</th>
                <th className="px-4 py-3 w-[320px]">Ghi chú</th>
                <th className="px-4 py-3">Loại CV</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3">Ngày hẹn</th>
                <th className="px-4 py-3">Trạm - KTV</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
                <th className="px-4 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order, idx) => {
                 const customerName = order.billFullName || order.customer?.fullName || 'Khách lẻ';
                 const phone = order.billPhoneNumber || order.customer?.phoneNumber || '';
                 const ktvName = order.assignedKtv?.fullName || 'Chưa gán';
                 const mainStationName = order.mainStation?.name 
                    || order.assignedKtv?.techStation?.mainStation?.name 
                    || '';
                 
                 return (
                  <tr key={order.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-blue-50/50 transition-colors`}>
                    <td className="px-4 py-3 font-medium">{order.pancakeOrderId}</td>
                    <td className="px-4 py-3 whitespace-normal">
                      <div className="font-medium text-gray-900">{customerName}</div>
                      <div className="text-gray-500 font-medium mb-1">{phone}</div>
                      <div className="text-gray-500 text-[12px] leading-tight">{order.shippingAddress?.full_address || order.customer?.fullAddress || 'Không có địa chỉ'}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-normal">
                      <div className="text-gray-900 text-[12px] mb-1 leading-tight">
                        {order.items && order.items.length > 0 ? (
                          <ul className="list-disc pl-4">
                            {order.items.map((item: any, i: number) => {
                              const pName = item.productName || item.rawData?.variation_info?.name || item.rawData?.name || 'Sản phẩm không tên';
                              return (
                                <li key={i}>{pName} <span className="font-semibold">x{item.quantity}</span></li>
                              )
                            })}
                          </ul>
                        ) : 'Chưa có SP'}
                      </div>
                      <div className="text-blue-700 font-semibold mt-1">Thu: {(order.moneyToCollect || 0).toLocaleString('vi-VN')} đ</div>
                    </td>
                    <td className="px-4 py-3 whitespace-normal">
                      <div className="text-gray-700 text-[13px] italic max-h-32 overflow-y-auto pr-1 whitespace-pre-wrap">
                        {order.note || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{order.workType || '-'}</div>
                      <div className="text-gray-500">{order.serviceType || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {order.pancakeCreatedAt ? (() => {
                        const date = new Date(order.pancakeCreatedAt);
                        return (
                          <>
                            <div className="font-medium text-gray-800">
                              {date.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                            </div>
                            <div className="text-gray-500">
                              {date.toLocaleDateString('vi-VN')}
                            </div>
                          </>
                        );
                      })() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {order.appointmentTime ? (() => {
                        const isOverdue = new Date(order.appointmentTime) < new Date() && order.adminStatus !== 'hoàn thành' && order.adminStatus !== 'hủy đơn';
                        return (
                        <>
                          <div className={`font-medium ${isOverdue ? 'text-red-600' : 'text-blue-700'}`}>
                            {new Date(order.appointmentTime).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}
                          </div>
                          <div className={isOverdue ? 'text-red-500' : 'text-gray-500'}>
                            {new Date(order.appointmentTime).toLocaleDateString('vi-VN')}
                          </div>
                        </>
                        );
                      })() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{mainStationName || 'Chưa phân trạm'}</div>
                      <div className="text-gray-500">KTV: {ktvName}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select
                        className={`appearance-none text-white font-medium rounded px-3 py-1 text-[12px] outline-none cursor-pointer ${getStatusStyle(order.adminStatus || 'chờ xử lý')}`}
                        value={order.adminStatus || 'chờ xử lý'}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      >
                        {ROW_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value} className="text-black bg-white">{opt.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {order.serviceReports && order.serviceReports.length > 0 && (
                          <button onClick={() => navigate(`/admin/reports?search=${order.pancakeOrderId}`)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="Xem báo cáo dịch vụ">
                            <FileText size={16} />
                          </button>
                        )}
                        <button onClick={() => openAssignModal(order)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Phân bổ / Chỉnh sửa">
                          <Edit size={16} />
                        </button>
                        <button onClick={() => openAuditModal(order.id)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Lịch sử">
                          <History size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200">
           <span>Trang {page} / {totalPages}</span>
           <div className="flex gap-2">
             <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 border rounded"><ChevronLeft size={16}/></button>
             <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 border rounded"><ChevronRight size={16}/></button>
           </div>
        </div>
      )}

      {/* ASSIGN MODAL (Truliva Flow) */}
      {assignModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Chi tiết & Phân bổ Yêu cầu #{assignModal.order.pancakeOrderId}</h3>
              <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600"><XCircle size={24}/></button>
            </div>
            
            <div className="p-6 overflow-auto flex-1 grid grid-cols-2 gap-6">
              {/* Cột trái: Phân loại */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 border-b pb-2">1. Phân loại Yêu cầu</h4>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Loại công việc</label>
                  <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={workType} onChange={e => {
                    const wt = e.target.value;
                    setWorkType(wt);
                    // Auto-fill serviceType for single-service work types
                    const noServiceTypes = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'];
                    if (noServiceTypes.includes(wt)) {
                      setServiceType('Công việc đã bao gồm dịch vụ');
                    } else {
                      setServiceType('');
                    }
                  }}>
                    <option value="">-- Chọn loại --</option>
                    <option value="Giao hàng và Lắp đặt">Giao hàng và Lắp đặt</option>
                    <option value="Lắp đặt">Lắp đặt</option>
                    <option value="Giao hàng">Giao hàng</option>
                    <option value="Thay lọc">Thay lọc</option>
                    <option value="Bảo hành">Bảo hành</option>
                    <option value="Sửa chữa">Sửa chữa</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Loại dịch vụ chi tiết</label>
                  {['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'].includes(workType) ? (
                    <input type="text" className="w-full border rounded p-2 text-sm outline-none bg-gray-50 text-gray-500" value="Công việc đã bao gồm dịch vụ" readOnly />
                  ) : workType === 'Bảo hành' ? (
                    <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={serviceType} onChange={e => setServiceType(e.target.value)}>
                      <option value="">-- Chọn dịch vụ --</option>
                      {[
                        'Áp lực nước yếu', 'Bơm không hoạt động', 'Chất lượng nước sau lọc',
                        'Hỏng vòi nước', 'Lỗi biến áp', 'Lỗi cảm biến rò rỉ', 'Lỗi mạch điện',
                        'Lỗi màn hình hiển thị', 'Lỗi vòi nước', 'Lỏng vòi nước',
                        'Máy báo đỏ các đèn', 'Máy báo lỗi TDS', 'Nước thải không ngừng',
                        'Rò rỉ bên trong máy', 'Rò rỉ đường ống', 'Rò rỉ lọc thô', 'Rò rỉ từ vòi',
                        'Rò rỉ van cấp nước', 'Thiết bị hoạt động không ổn định',
                        'Thiết bị hoạt động liên tục', 'Thiết bị không hoạt động',
                        'Thiết bị lọc chậm', 'Tiếng ồn khi vận hành',
                        'Khác (phát sinh theo thực tế)',
                      ].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : workType === 'Sửa chữa' ? (
                    <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={serviceType} onChange={e => setServiceType(e.target.value)}>
                      <option value="">-- Chọn dịch vụ --</option>
                      {[
                        'Áp lực nước yếu', 'Bơm không hoạt động', 'Chất lượng nước sau lọc',
                        'Đo chỉ số TDS', 'Hỏng vòi nước', 'Khảo sát vị trí', 'Lắp đặt lại máy',
                        'Lấy mẫu test nước', 'Lỗi biến áp', 'Lỗi cảm biến rò rỉ', 'Lỗi mạch điện',
                        'Lỗi màn hình hiển thị', 'Lỗi vòi nước', 'Lỏng vòi nước',
                        'Máy báo đỏ các đèn', 'Máy báo lỗi TDS', 'Nước thải không ngừng',
                        'Rò rỉ bên trong máy', 'Rò rỉ đường ống', 'Rò rỉ lọc thô', 'Rò rỉ từ vòi',
                        'Rò rỉ van cấp nước', 'Tháo máy', 'Thay đổi vị trí lắp đặt', 'Thay linh kiện',
                        'Thiết bị hoạt động không ổn định', 'Thiết bị hoạt động liên tục',
                        'Thiết bị không hoạt động', 'Thiết bị lọc chậm',
                        'Thu hồi/Đổi/Trả', 'Tiếng ồn khi vận hành',
                        'Khác (phát sinh theo thực tế)',
                      ].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={serviceType} onChange={e => setServiceType(e.target.value)} disabled={!workType}>
                      <option value="">-- Chọn loại công việc trước --</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Thời gian hẹn khách</label>
                  <input type="datetime-local" className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={appointment} onChange={e => setAppointment(e.target.value)} />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Lý do hẹn lại (nếu có)</label>
                  <textarea rows={2} className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} placeholder="Khách bận, KTV kẹt lịch..."></textarea>
                </div>
              </div>

              {/* Cột phải: Phân bổ */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 border-b pb-2">2. Phân bổ Kỹ thuật viên</h4>

                {/* Gợi ý phân bổ thông minh */}
                {(suggestedMain || suggestedTech) && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm space-y-2 col-span-2">
                    <div className="flex items-center space-x-1 text-blue-800 font-semibold">
                      <span>💡 Gợi ý phân bổ thông minh:</span>
                    </div>
                    <div className="text-gray-700 text-xs leading-relaxed">
                      {suggestedMain && (
                        <div>
                          • Trạm chính gợi ý: <b>{suggestedMain.name}</b>
                        </div>
                      )}
                      {suggestedTech && (
                        <div>
                          • Trạm kỹ thuật gợi ý: <b>{suggestedTech.name}</b>
                        </div>
                      )}
                      {suggestedKtv && (
                        <div>
                          • KTV rảnh nhất khu vực: <b>{suggestedKtv.fullName}</b> ({suggestedKtv.pendingOrderCount || 0} đơn đang xử lý)
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (suggestedMain) setSelectedMain(suggestedMain.id);
                        if (suggestedTech) {
                          setSelectedTech(suggestedTech.id);
                          if (suggestedKtv) {
                            setKtvs([suggestedKtv]);
                            setSelectedKtv(suggestedKtv.id);
                          }
                        }
                      }}
                      className="w-full mt-1 bg-blue-600 text-white text-xs py-1.5 px-3 rounded hover:bg-blue-700 font-semibold transition-colors focus:outline-none"
                    >
                      Áp dụng gợi ý trạm & KTV
                    </button>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Trạm chính</label>
                  <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={selectedMain} onChange={e => {setSelectedMain(e.target.value); setSelectedTech(''); setSelectedKtv('');}}>
                    <option value="">-- Chọn Trạm chính --</option>
                    {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Trạm kỹ thuật</label>
                  <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={selectedTech} onChange={e => {setSelectedTech(e.target.value); setSelectedKtv('');}} disabled={!selectedMain}>
                    <option value="">-- Chọn Trạm Kỹ thuật --</option>
                    {(() => {
                      const currentMain = stations.find(s => s.id === selectedMain);
                      if (!currentMain || !currentMain.techStations) return null;
                      const isTruliva = currentMain.name?.toLowerCase() === 'truliva';
                      const sortedTechStations = [...currentMain.techStations].sort((a, b) => {
                        if (isTruliva) {
                          const getPriority = (name: string) => {
                            const n = name.toLowerCase();
                            if (n.includes('hồ chí minh') || n.includes('hcm')) return 1;
                            if (n.includes('hà nội')) return 2;
                            if (n.includes('đà nẵng')) return 3;
                            return 999;
                          };
                          const pA = getPriority(a.name);
                          const pB = getPriority(b.name);
                          if (pA !== pB) return pA - pB;
                        }
                        return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
                      });
                      return sortedTechStations.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ));
                    })()}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Kỹ thuật viên</label>
                  <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={selectedKtv} onChange={e => setSelectedKtv(e.target.value)} disabled={!selectedTech}>
                    <option value="">-- Chọn KTV --</option>
                    {(() => {
                      const sortedKtvsForSelection = [...ktvs].sort((a: any, b: any) => {
                        if (suggestedKtv && a.id === suggestedKtv.id) return -1;
                        if (suggestedKtv && b.id === suggestedKtv.id) return 1;
                        return (a.pendingOrderCount || 0) - (b.pendingOrderCount || 0);
                      });
                      return sortedKtvsForSelection.map((k: any) => {
                        const isSuggested = suggestedKtv && k.id === suggestedKtv.id;
                        return (
                          <option key={k.id} value={k.id}>
                            {isSuggested ? '⭐ Đề xuất: ' : ''}{k.fullName} — {k.pendingOrderCount || 0} đơn đang xử lý
                          </option>
                        );
                      });
                    })()}
                  </select>
                </div>

                {/* Workload indicator */}
                {selectedKtv && (() => {
                  const ktv = ktvs.find((k: any) => k.id === selectedKtv);
                  const count = ktv?.pendingOrderCount || 0;
                  const isHigh = count >= 5;
                  const isMedium = count >= 3 && count < 5;
                  return (
                    <div className={`p-3 rounded text-sm mt-2 border ${isHigh ? 'bg-red-50 border-red-200 text-red-700' : isMedium ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                      <div className="font-semibold mb-1">
                        {isHigh ? '⚠️ Tải cao' : isMedium ? '⚡ Tải trung bình' : '✅ Tải nhẹ'}
                      </div>
                      <div>
                        <b>{ktv?.fullName}</b> hiện đang có <b>{count}</b> đơn chưa hoàn thành.
                        {isHigh && ' Cân nhắc giao cho KTV khác.'}
                      </div>
                    </div>
                  );
                })()}

                {selectedKtv && (
                  <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded text-sm mt-2">
                    Đơn sẽ được chuyển sang trạng thái <b>"Đang thực hiện"</b> khi lưu.
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setAssignModal(null)} className="px-4 py-2 bg-white border rounded text-gray-700 hover:bg-gray-100">Hủy</button>
              <button onClick={submitAssign} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Lưu thông tin & Phân bổ</button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {cancelModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-[400px]">
            <h3 className="text-lg font-bold text-red-600 mb-4">Hủy yêu cầu dịch vụ</h3>
            <label className="block text-sm mb-2 text-gray-700">Lý do hủy (bắt buộc)</label>
            <textarea className="w-full border p-2 rounded mb-4 outline-none focus:border-red-500" rows={3} value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="Nhập lý do..."></textarea>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCancelModal(null)} className="px-4 py-2 border rounded">Đóng</button>
              <button onClick={submitCancel} disabled={!cancelReason.trim()} className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50">Xác nhận hủy</button>
            </div>
          </div>
        </div>
      )}

      {/* AUDIT LOG MODAL */}
      {auditModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Lịch sử thay đổi yêu cầu</h3>
              <button onClick={() => setAuditModal(null)}><XCircle size={20} className="text-gray-500"/></button>
            </div>
            
            <div className="flex-1 overflow-auto bg-gray-50 p-4 rounded border">
              {loadingAudit ? (
                <div className="text-center py-8">Đang tải...</div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Chưa có thay đổi nào.</div>
              ) : (
                <div className="space-y-4">
                  {auditLogs.map(log => (
                    <div key={log.id} className="bg-white p-3 rounded shadow-sm border text-sm">
                      <div className="flex justify-between text-gray-500 mb-2">
                        <span className="font-semibold text-gray-700">{log.userName}</span>
                        <span>{new Date(log.createdAt).toLocaleString('vi-VN')}</span>
                      </div>
                      <div className="text-blue-600 font-medium mb-1">Hành động: {log.action}</div>
                      {log.changes && log.changes.map((c: any, i: number) => (
                        <div key={i} className="text-gray-600">
                          - <span className="font-medium text-gray-800">{c.field}</span>: <span className="line-through text-red-400">{String(c.from || 'Trống')}</span> &rarr; <span className="text-green-600 font-medium">{String(c.to || 'Trống')}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
