import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrders, updateOrder, getKtvUsers, getStations, getOrderAuditLog, syncOrders, getFiltersData, fetchApi } from '../../api/client';
import { Search, ChevronLeft, ChevronRight, History, XCircle, Filter, RefreshCw, FileText, CheckCircle2, RotateCcw, Copy, UserPlus, Download, Wrench, Settings, FolderOpen, Package, Building2, MapPin, Users, Calendar } from 'lucide-react';
import { WARRANTY_SERVICE_GROUPS, REPAIR_SERVICE_GROUPS, WORK_TYPE_SERVICES } from '../../utils/workTypes';
import { useConfirm } from '../../context/ConfirmContext';
import DateRangePicker from '../../components/DateRangePicker';
import CategoryTreeSelect from '../../components/CategoryTreeSelect';

const ALL_SERVICE_TYPES = Array.from(new Set(Object.values(WORK_TYPE_SERVICES).flat()));

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

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const ROW_STATUS_OPTIONS = [
  { value: 'chờ xử lý', label: 'Chờ xử lý' },
  { value: 'đang thực hiện', label: 'Đã phân công' },
  { value: 'hoàn thành', label: 'Hoàn thành' },
  { value: 'hủy đơn', label: 'Hủy đơn' },
];

export default function OrderList() {
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [_error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  // Date Filters
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

  // Added filters
  const [dateType, setDateType] = useState<string>('createdAt');
  const [ktvSearch, setKtvSearch] = useState('');
  const [techStationSearch, setTechStationSearch] = useState('');
  const [filterServiceTypes, setFilterServiceTypes] = useState<string[]>([]);
  const [filterProductCategories, setFilterProductCategories] = useState<string[]>([]);
  const [filterProductNames, setFilterProductNames] = useState<string[]>([]);
  const [filterTechStationIds, setFilterTechStationIds] = useState<string[]>([]);
  const [filterProvinces, setFilterProvinces] = useState<string[]>([]);

  // Dropdown / Popover states
  const [activeDropdown, setActiveDropdown] = useState<'main' | 'pancakeOrderId' | 'adminStatuses' | 'ktvIds' | 'workTypes' | 'mainStationIds' | 'customerName' | 'customerPhone' | 'serviceTypes' | 'productCategories' | 'productNames' | 'techStationIds' | 'provinces' | 'appointmentTimeFilter' | 'completedTimeFilter' | 'createdTimeFilter' | 'updatedTimeFilter' | null>(null);

  // Temporary filter states for the popover/modal
  const [tempPancakeOrderId, setTempPancakeOrderId] = useState('');
  const [tempAdminStatuses, setTempAdminStatuses] = useState<string[]>([]);
  const [tempKtvIds, setTempKtvIds] = useState<string[]>([]);
  const [tempWorkTypes, setTempWorkTypes] = useState<string[]>([]);
  const [tempMainStationIds, setTempMainStationIds] = useState<string[]>([]);
  const [tempCustomerName, setTempCustomerName] = useState('');
  const [tempCustomerPhone, setTempCustomerPhone] = useState('');

  const [tempServiceTypes, setTempServiceTypes] = useState<string[]>([]);
  const [tempProductCategories, setTempProductCategories] = useState<string[]>([]);
  const [tempProductNames, setTempProductNames] = useState<string[]>([]);
  const [tempTechStationIds, setTempTechStationIds] = useState<string[]>([]);
  const [tempProvinces, setTempProvinces] = useState<string[]>([]);

  const [dbFilterOptions, setDbFilterOptions] = useState<{
    categories: string[];
    productNames: string[];
    techStations: any[];
    provinces: string[];
  }>({
    categories: [],
    productNames: [],
    techStations: [],
    provinces: []
  });

  const [stats, setStats] = useState<{
    total: number;
    pending: number;
    assigned: number;
    completed: number;
    cancelled: number;
  }>({
    total: 0,
    pending: 0,
    assigned: 0,
    completed: 0,
    cancelled: 0
  });

  // Assignment Modal
  const [assignModal, setAssignModal] = useState<{ isOpen: boolean; orderId: string; order: any } | null>(null);
  const [stations, setStations] = useState<any[]>([]);
  const [ktvs, setKtvs] = useState<any[]>([]);
  const [allKtvs, setAllKtvs] = useState<any[]>([]);

  const [selectedMain, setSelectedMain] = useState('');
  const [selectedTech, setSelectedTech] = useState('');
  const [selectedKtv, setSelectedKtv] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('08:30');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [workType, setWorkType] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [productsStock, setProductsStock] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [loadingInventory, setLoadingInventory] = useState<boolean>(false);
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [showWarehouseDropdown, setShowWarehouseDropdown] = useState(false);
  const [tempItems, setTempItems] = useState<any[]>([]);

  useEffect(() => {
    const selectedWh = warehouses.find(w => w.id === selectedWarehouseId);
    setWarehouseSearch(selectedWh ? selectedWh.name : '');
  }, [selectedWarehouseId, warehouses]);

  // Smart Dispatching Suggestions
  const [suggestedMain, setSuggestedMain] = useState<any>(null);
  const [suggestedTech, setSuggestedTech] = useState<any>(null);
  const [suggestedKtv, setSuggestedKtv] = useState<any>(null);

  // Audit Log Modal
  const [auditModal, setAuditModal] = useState<{ isOpen: boolean; orderId: string } | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Cancel Modal
  const [cancelModal, setCancelModal] = useState<{ isOpen: boolean; orderId: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const getDateRange = () => {
    const start = customStartDate ? new Date(customStartDate + 'T00:00:00').toISOString() : '';
    const end = customEndDate ? new Date(customEndDate + 'T23:59:59').toISOString() : '';
    return { startDate: start, endDate: end };
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
        customerPhone: filterCustomerPhone,
        serviceTypes: filterServiceTypes,
        productCategories: filterProductCategories,
        productNames: filterProductNames,
        techStationIds: filterTechStationIds,
        provinces: filterProvinces,
        dateType: dateType
      });
      setOrders(res.orders);
      setTotalPages(res.pagination.totalPages);
      setTotalItems(res.pagination.total);
      if (res.stats) {
        setStats(res.stats);
      }
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
    customStartDate,
    customEndDate,
    filterPancakeOrderId,
    filterAdminStatuses,
    filterKtvIds,
    filterWorkTypes,
    filterMainStationIds,
    filterCustomerName,
    filterCustomerPhone,
    filterServiceTypes,
    filterProductCategories,
    filterProductNames,
    filterTechStationIds,
    filterProvinces,
    dateType
  ]);

  useEffect(() => {
    getStations().then(data => setStations(data)).catch(console.error);
    getKtvUsers().then(data => setAllKtvs(data)).catch(console.error);
    getFiltersData().then(data => setDbFilterOptions(data)).catch(console.error);
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

  useEffect(() => {
    setKtvSearch('');
    setTechStationSearch('');
  }, [activeDropdown]);

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

  const handleReopenOrder = async (order: any) => {
    const isConfirmed = await confirm({
      title: 'Mở lại đơn hàng',
      message: `Bạn có chắc chắn muốn mở lại đơn #${order.pancakeOrderId}? Hành động này sẽ chuyển trạng thái về "Chờ xử lý" và xóa thông tin phân bổ trạm/KTV hiện tại.`,
      confirmText: 'Mở lại',
      cancelText: 'Hủy bỏ',
      type: 'warning'
    });
    if (!isConfirmed) return;
    try {
      await updateOrder(order.id, {
        adminStatus: 'chờ xử lý',
        mainStationId: null,
        techStationId: null,
        assignedKtvId: null,
        appointmentTime: null,
        rescheduleReason: null
      });
      fetchOrdersData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi mở lại đơn');
    }
  };

  const handleCopyOrderInfo = (order: any) => {
    const customerName = order.billFullName || order.customer?.fullName || 'Khách lẻ';
    const phone = order.billPhoneNumber || order.customer?.phoneNumber || '';
    const address = order.shippingAddress?.full_address || order.customer?.fullAddress || 'Không có địa chỉ';
    const notes = order.note || 'Không có';

    let appTimeStr = 'Hẹn: Chưa hẹn lịch';
    if (order.appointmentTime) {
      const date = new Date(order.appointmentTime);
      const timePart = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const datePart = date.toLocaleDateString('vi-VN');
      appTimeStr = `Hẹn: ${timePart} - ${datePart}`;
    }

    const text = `Khách hàng: ${customerName}\nSĐT: ${phone}\nĐịa chỉ: ${address}\n${appTimeStr}\nGhi chú: ${notes}`;

    navigator.clipboard.writeText(text)
      .then(() => {
        alert(`Đã copy thông tin đơn #${order.pancakeOrderId} thành công!`);
      })
      .catch(err => {
        console.error('Không thể copy', err);
        alert('Có lỗi khi copy thông tin.');
      });
  };

  const openAssignModal = (order: any) => {
    let initialMain = order.mainStationId || '';
    let initialTech = order.techStationId || '';
    const initialKtv = order.assignedKtvId || '';

    if (initialKtv && (!initialMain || !initialTech)) {
      const ktvObj = allKtvs.find(k => k.id === initialKtv);
      if (ktvObj) {
        if (!initialTech && ktvObj.techStationId) {
          initialTech = ktvObj.techStationId;
        }
        if (initialTech && !initialMain) {
          const mainObj = stations.find(s =>
            s.techStations && s.techStations.some((ts: any) => ts.id === initialTech)
          );
          if (mainObj) {
            initialMain = mainObj.id;
          }
        }
      }
    }

    setSelectedMain(initialMain);
    setSelectedTech(initialTech);
    setSelectedKtv(initialKtv);

    // Convert UTC to local input format
    let appDateStr = '';
    let appTimeStr = '08:30';
    if (order.appointmentTime) {
      const d = new Date(order.appointmentTime);
      const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      const iso = localDate.toISOString();
      appDateStr = iso.slice(0, 10);
      appTimeStr = iso.slice(11, 16);
    }
    setAppointmentDate(appDateStr);
    setAppointmentTime(appTimeStr);
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

    // Kéo thông tin tồn kho
    setLoadingInventory(true);
    fetchApi('/inventory/stock')
      .then(invData => {
        const whs = invData.warehouses || [];
        const prods = invData.products || [];
        setWarehouses(whs);
        setProductsStock(prods);

        // Thiết lập kho mặc định
        let defaultWhId = '';
        if (order.warehouseId) {
          defaultWhId = order.warehouseId;
        } else if (order.warehouseInfo?.id) {
          defaultWhId = order.warehouseInfo.id;
        } else if (order.warehouseInfo?.name) {
          // Đối chiếu tìm kho bằng tên từ danh sách kho của Pancake
          const matchedWh = whs.find((w: any) => w.name === order.warehouseInfo.name);
          if (matchedWh) {
            defaultWhId = matchedWh.id;
          }
        }

        if (!defaultWhId) {
          // Tự động tìm kho khớp trạm gợi ý
          const targetSearchName = matchedTech ? matchedTech.name : (matchedMain ? matchedMain.name : '');
          if (targetSearchName) {
            const cleanStationName = removeAccents(targetSearchName);
            const foundWh = whs.find((w: any) => {
              const cleanWhName = removeAccents(w.name);
              return cleanWhName.includes(cleanStationName) || cleanStationName.includes(cleanWhName);
            });
            if (foundWh) {
              defaultWhId = foundWh.id;
            }
          }
        }
        setSelectedWarehouseId(defaultWhId);
      })
      .catch(err => {
        console.error('Failed to load inventory stock info', err);
      })
      .finally(() => {
        setLoadingInventory(false);
      });

    setTempItems(order.items ? order.items.map((it: any) => ({
      productName: it.productName || it.rawData?.variation_info?.name || it.rawData?.name || 'Sản phẩm',
      sku: it.sku || it.rawData?.sku || '',
      quantity: it.quantity || 1,
      price: it.price || 0,
      discount: it.discount || 0
    })) : []);

    setAssignModal({ isOpen: true, orderId: order.id, order });
  };

  const submitAssign = async () => {
    if (!assignModal) return;

    if (!workType) {
      alert('Vui lòng chọn loại công việc.');
      return;
    }
    if (!serviceType || !serviceType.trim()) {
      alert('Vui lòng chọn/nhập loại dịch vụ chi tiết.');
      return;
    }

    if (workType === 'Bảo hành') {
      const validWarrantyServices = Object.values(WARRANTY_SERVICE_GROUPS).flat();
      if (!validWarrantyServices.includes(serviceType)) {
        alert('Loại dịch vụ chi tiết không hợp lệ. Vui lòng chọn một gợi ý trong danh mục.');
        return;
      }
    } else if (workType === 'Sửa chữa') {
      const validRepairServices = Object.values(REPAIR_SERVICE_GROUPS).flat();
      if (!validRepairServices.includes(serviceType)) {
        alert('Loại dịch vụ chi tiết không hợp lệ. Vui lòng chọn một gợi ý trong danh mục.');
        return;
      }
    }

    if (!appointmentDate) {
      alert('Vui lòng chọn ngày hẹn khách.');
      return;
    }

    // Default time to 08:30 if not selected/specified
    const finalTime = appointmentTime ? appointmentTime.trim() : '08:30';

    const appointmentDateTimeStr = `${appointmentDate}T${finalTime}`;
    const appointmentDateObj = new Date(appointmentDateTimeStr);
    if (isNaN(appointmentDateObj.getTime())) {
      alert('Thời gian hẹn khách không hợp lệ.');
      return;
    }

    if (appointmentDateObj < new Date()) {
      alert('Thời gian hẹn khách không được ở trong quá khứ.');
      return;
    }

    try {
      await updateOrder(assignModal.orderId, {
        mainStationId: selectedMain || null,
        techStationId: selectedTech || null,
        assignedKtvId: selectedKtv || null,
        appointmentTime: appointmentDateObj.toISOString(),
        rescheduleReason: rescheduleReason || null,
        workType: workType || null,
        serviceType: serviceType || null,
        adminStatus: selectedKtv ? 'đang thực hiện' : 'chờ xử lý', // auto update status
        warehouseId: selectedWarehouseId || null,
        items: tempItems
      });
      setAssignModal(null);
      fetchOrdersData();
    } catch (err: any) {
      alert(err.message);
    }
  };
  const toggleDropdown = (type: 'main' | 'pancakeOrderId' | 'adminStatuses' | 'ktvIds' | 'workTypes' | 'mainStationIds' | 'customerName' | 'customerPhone' | 'serviceTypes' | 'productCategories' | 'productNames' | 'techStationIds' | 'provinces' | 'appointmentTimeFilter' | 'completedTimeFilter' | 'createdTimeFilter' | 'updatedTimeFilter') => {
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
      if (type === 'serviceTypes') setTempServiceTypes(filterServiceTypes);
      if (type === 'productCategories') setTempProductCategories(filterProductCategories);
      if (type === 'productNames') setTempProductNames(filterProductNames);
      if (type === 'techStationIds') setTempTechStationIds(filterTechStationIds);
      if (type === 'provinces') setTempProvinces(filterProvinces);
    }
  };

  const applyFilter = (type: 'pancakeOrderId' | 'adminStatuses' | 'ktvIds' | 'workTypes' | 'mainStationIds' | 'customerName' | 'customerPhone' | 'serviceTypes' | 'productCategories' | 'productNames' | 'techStationIds' | 'provinces') => {
    setPage(1);
    if (type === 'pancakeOrderId') setFilterPancakeOrderId(tempPancakeOrderId);
    if (type === 'adminStatuses') setFilterAdminStatuses(tempAdminStatuses);
    if (type === 'ktvIds') setFilterKtvIds(tempKtvIds);
    if (type === 'workTypes') setFilterWorkTypes(tempWorkTypes);
    if (type === 'mainStationIds') setFilterMainStationIds(tempMainStationIds);
    if (type === 'customerName') setFilterCustomerName(tempCustomerName);
    if (type === 'customerPhone') setFilterCustomerPhone(tempCustomerPhone);
    if (type === 'serviceTypes') setFilterServiceTypes(tempServiceTypes);
    if (type === 'productCategories') setFilterProductCategories(tempProductCategories);
    if (type === 'productNames') setFilterProductNames(tempProductNames);
    if (type === 'techStationIds') setFilterTechStationIds(tempTechStationIds);
    if (type === 'provinces') setFilterProvinces(tempProvinces);
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
    setFilterServiceTypes([]);
    setFilterProductCategories([]);
    setFilterProductNames([]);
    setFilterTechStationIds([]);
    setFilterProvinces([]);
    setCustomStartDate('');
    setCustomEndDate('');
    setDateType('createdAt');
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
    switch (status) {
      case 'chờ xử lý': return 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500';
      case 'đang thực hiện': return 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500';
      case 'hoàn thành': return 'bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-500';
      case 'hủy đơn': return 'bg-red-500 hover:bg-red-600 focus:ring-red-500';
      default: return 'bg-gray-500 hover:bg-gray-600 focus:ring-gray-500';
    }
  };

  const handleExportExcel = () => {
    const { startDate, endDate } = getDateRange();
    const query = new URLSearchParams();
    
    const params: Record<string, any> = {
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
      customerPhone: filterCustomerPhone,
      serviceTypes: filterServiceTypes,
      productCategories: filterProductCategories,
      productNames: filterProductNames,
      techStationIds: filterTechStationIds,
      provinces: filterProvinces,
      dateType: dateType
    };

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          if (value.length > 0) {
            query.append(key, value.join(','));
          }
        } else {
          query.append(key, String(value));
        }
      }
    }

    const url = `/api/orders/export?${query.toString()}`;
    window.open(url, '_blank');
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

  const todayStr = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  })();

  return (
    <div className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 font-sans">

      {/* Top Tabs */}
      <div className="flex justify-between border-b border-gray-200 bg-gray-50 px-4 pt-1">
        <div className="flex space-x-1">
          <button className="px-5 py-2.5 text-[14px] font-medium text-blue-600 border-b-2 border-blue-600 bg-white -mb-[1px]">Yêu cầu dịch vụ</button>
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

            {/* Xuất Excel button */}
            <button
              onClick={handleExportExcel}
              className="flex items-center space-x-1.5 px-3 py-2 text-[13px] border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none font-medium transition-colors"
              title="Xuất file Excel danh sách đơn hàng theo bộ lọc đang chọn"
            >
              <Download size={15} className="text-gray-500" />
              <span>Xuất Excel</span>
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
                <div className="absolute right-0 mt-2 bg-white border rounded-lg shadow-xl z-50 text-left min-w-[240px]">
                  {activeDropdown === 'main' && (
                    <div className="w-60 py-1 text-sm text-gray-700 max-h-96 overflow-y-auto">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 border-b uppercase">Thêm điều kiện lọc</div>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-indigo-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('adminStatuses')}>
                        <CheckCircle2 size={15} className="text-indigo-500" />
                        <span>Trạng thái đơn</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-amber-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('workTypes')}>
                        <Wrench size={15} className="text-amber-500" />
                        <span>Loại công việc</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-teal-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('serviceTypes')}>
                        <Settings size={15} className="text-teal-500" />
                        <span>Loại dịch vụ</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-purple-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('productCategories')}>
                        <FolderOpen size={15} className="text-purple-500" />
                        <span>Danh mục sản phẩm</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-pink-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('productNames')}>
                        <Package size={15} className="text-pink-500" />
                        <span>Sản phẩm</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-sky-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('mainStationIds')}>
                        <Building2 size={15} className="text-sky-500" />
                        <span>Trạm chính</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-cyan-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('techStationIds')}>
                        <Building2 size={15} className="text-cyan-500" />
                        <span>Trạm kỹ thuật</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-emerald-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('ktvIds')}>
                        <Users size={15} className="text-emerald-500" />
                        <span>Kỹ thuật viên</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-rose-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('provinces')}>
                        <MapPin size={15} className="text-rose-500" />
                        <span>Tỉnh/Thành phố</span>
                      </button>
                      <div className="h-px bg-gray-200 my-1"></div>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-blue-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('appointmentTimeFilter')}>
                        <Calendar size={15} className="text-blue-500" />
                        <span>Hẹn khách</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-blue-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('completedTimeFilter')}>
                        <Calendar size={15} className="text-blue-500" />
                        <span>Hoàn thành</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-blue-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('createdTimeFilter')}>
                        <Calendar size={15} className="text-blue-500" />
                        <span>Ngày tạo</span>
                      </button>
                      <button className="w-full flex items-center space-x-2.5 px-4 py-2 hover:bg-gray-50 text-blue-700 font-medium transition-colors text-[13px]" onClick={() => toggleDropdown('updatedTimeFilter')}>
                        <Calendar size={15} className="text-blue-500" />
                        <span>Cập nhật</span>
                      </button>
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
                      <input
                        type="text"
                        placeholder="Tìm KTV..."
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500 bg-white text-gray-800"
                        value={ktvSearch}
                        onChange={(e) => setKtvSearch(e.target.value)}
                      />
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
                        {allKtvs
                          .filter(k => removeAccents(k.fullName).includes(removeAccents(ktvSearch)))
                          .map(k => (
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

                  {activeDropdown === 'appointmentTimeFilter' && (
                    <div className="p-4 w-[280px] space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Hẹn khách</h4>
                      <DateRangePicker
                        startDate={dateType === 'appointmentTime' ? customStartDate : ''}
                        endDate={dateType === 'appointmentTime' ? customEndDate : ''}
                        onChange={(start, end) => {
                          setDateType('appointmentTime');
                          setCustomStartDate(start);
                          setCustomEndDate(end);
                        }}
                      />
                      <div className="space-y-1.5 pt-1 border-t">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Thứ tự sắp xếp</span>
                        <div className="flex space-x-2">
                          <button
                            className={`flex-1 py-1.5 px-2 text-xs border rounded-md font-medium transition-colors ${
                              sortBy === 'appointmentTime' && sortOrder === 'asc'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setDateType('appointmentTime');
                              setSortBy('appointmentTime');
                              setSortOrder('asc');
                            }}
                          >
                            Hẹn gần nhất
                          </button>
                          <button
                            className={`flex-1 py-1.5 px-2 text-xs border rounded-md font-medium transition-colors ${
                              sortBy === 'appointmentTime' && sortOrder === 'desc'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setDateType('appointmentTime');
                              setSortBy('appointmentTime');
                              setSortOrder('desc');
                            }}
                          >
                            Hẹn xa nhất
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => setActiveDropdown(null)}>Đóng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'completedTimeFilter' && (
                    <div className="p-4 w-[280px] space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Hoàn thành</h4>
                      <DateRangePicker
                        startDate={dateType === 'completedAt' ? customStartDate : ''}
                        endDate={dateType === 'completedAt' ? customEndDate : ''}
                        onChange={(start, end) => {
                          setDateType('completedAt');
                          setCustomStartDate(start);
                          setCustomEndDate(end);
                        }}
                      />
                      <div className="space-y-1.5 pt-1 border-t">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Thứ tự sắp xếp</span>
                        <div className="flex space-x-2">
                          <button
                            className={`flex-1 py-1.5 px-2 text-xs border rounded-md font-medium transition-colors ${
                              sortBy === 'updatedAt' && sortOrder === 'desc'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setDateType('completedAt');
                              setSortBy('updatedAt');
                              setSortOrder('desc');
                            }}
                          >
                            Hoàn thành mới nhất
                          </button>
                          <button
                            className={`flex-1 py-1.5 px-2 text-xs border rounded-md font-medium transition-colors ${
                              sortBy === 'updatedAt' && sortOrder === 'asc'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setDateType('completedAt');
                              setSortBy('updatedAt');
                              setSortOrder('asc');
                            }}
                          >
                            Hoàn thành cũ nhất
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => setActiveDropdown(null)}>Đóng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'createdTimeFilter' && (
                    <div className="p-4 w-[280px] space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Ngày tạo</h4>
                      <DateRangePicker
                        startDate={dateType === 'createdAt' ? customStartDate : ''}
                        endDate={dateType === 'createdAt' ? customEndDate : ''}
                        onChange={(start, end) => {
                          setDateType('createdAt');
                          setCustomStartDate(start);
                          setCustomEndDate(end);
                        }}
                      />
                      <div className="space-y-1.5 pt-1 border-t">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Thứ tự sắp xếp</span>
                        <div className="flex space-x-2">
                          <button
                            className={`flex-1 py-1.5 px-2 text-xs border rounded-md font-medium transition-colors ${
                              sortBy === 'createdAt' && sortOrder === 'desc'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setDateType('createdAt');
                              setSortBy('createdAt');
                              setSortOrder('desc');
                            }}
                          >
                            Tạo mới nhất
                          </button>
                          <button
                            className={`flex-1 py-1.5 px-2 text-xs border rounded-md font-medium transition-colors ${
                              sortBy === 'createdAt' && sortOrder === 'asc'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setDateType('createdAt');
                              setSortBy('createdAt');
                              setSortOrder('asc');
                            }}
                          >
                            Tạo cũ nhất
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => setActiveDropdown(null)}>Đóng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'updatedTimeFilter' && (
                    <div className="p-4 w-[280px] space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Cập nhật</h4>
                      <DateRangePicker
                        startDate={dateType === 'updatedAt' ? customStartDate : ''}
                        endDate={dateType === 'updatedAt' ? customEndDate : ''}
                        onChange={(start, end) => {
                          setDateType('updatedAt');
                          setCustomStartDate(start);
                          setCustomEndDate(end);
                        }}
                      />
                      <div className="space-y-1.5 pt-1 border-t">
                        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Thứ tự sắp xếp</span>
                        <div className="flex space-x-2">
                          <button
                            className={`flex-1 py-1.5 px-2 text-xs border rounded-md font-medium transition-colors ${
                              sortBy === 'updatedAt' && sortOrder === 'desc'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setDateType('updatedAt');
                              setSortBy('updatedAt');
                              setSortOrder('desc');
                            }}
                          >
                            Cập nhật mới nhất
                          </button>
                          <button
                            className={`flex-1 py-1.5 px-2 text-xs border rounded-md font-medium transition-colors ${
                              sortBy === 'updatedAt' && sortOrder === 'asc'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              setDateType('updatedAt');
                              setSortBy('updatedAt');
                              setSortOrder('asc');
                            }}
                          >
                            Cập nhật cũ nhất
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => setActiveDropdown(null)}>Đóng</button>
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

                  {/* Customer filters removed from popover (now handled via the main search bar) */}

                  {activeDropdown === 'serviceTypes' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Loại dịch vụ</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {ALL_SERVICE_TYPES.map(st => (
                          <label key={st} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded text-blue-600 focus:ring-blue-500"
                              checked={tempServiceTypes.includes(st)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setTempServiceTypes([...tempServiceTypes, st]);
                                } else {
                                  setTempServiceTypes(tempServiceTypes.filter(v => v !== st));
                                }
                              }}
                            />
                            <span>{st}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('serviceTypes')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'productCategories' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Danh mục sản phẩm</h4>
                      <CategoryTreeSelect
                        categories={dbFilterOptions.categories}
                        selected={tempProductCategories}
                        onChange={setTempProductCategories}
                        renderInline
                      />
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('productCategories')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'productNames' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Sản phẩm</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {dbFilterOptions.productNames.map(prod => (
                          <label key={prod} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded text-blue-600 focus:ring-blue-500"
                              checked={tempProductNames.includes(prod)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setTempProductNames([...tempProductNames, prod]);
                                } else {
                                  setTempProductNames(tempProductNames.filter(v => v !== prod));
                                }
                              }}
                            />
                            <span>{prod}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('productNames')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'techStationIds' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Trạm kỹ thuật</h4>
                      <input
                        type="text"
                        placeholder="Tìm trạm kỹ thuật..."
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md outline-none focus:border-blue-500 bg-white text-gray-800"
                        value={techStationSearch}
                        onChange={(e) => setTechStationSearch(e.target.value)}
                      />
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {dbFilterOptions.techStations
                          .filter(station => removeAccents(station.name).includes(removeAccents(techStationSearch)))
                          .map(station => (
                            <label key={station.id} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                className="rounded text-blue-600 focus:ring-blue-500"
                                checked={tempTechStationIds.includes(station.id)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setTempTechStationIds([...tempTechStationIds, station.id]);
                                  } else {
                                    setTempTechStationIds(tempTechStationIds.filter(v => v !== station.id));
                                  }
                                }}
                              />
                              <span>{station.name}</span>
                            </label>
                          ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('techStationIds')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                  {activeDropdown === 'provinces' && (
                    <div className="p-4 w-72 space-y-3">
                      <h4 className="font-semibold text-[14px] text-gray-800">Lọc theo Tỉnh/Thành phố</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {dbFilterOptions.provinces.map(prov => (
                          <label key={prov} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              className="rounded text-blue-600 focus:ring-blue-500"
                              checked={tempProvinces.includes(prov)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setTempProvinces([...tempProvinces, prov]);
                                } else {
                                  setTempProvinces(tempProvinces.filter(v => v !== prov));
                                }
                              }}
                            />
                            <span>{prov}</span>
                          </label>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t">
                        <button className="text-gray-500 text-xs px-2 py-1 hover:bg-gray-100 rounded" onClick={() => setActiveDropdown('main')}>Quay lại</button>
                        <button className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 font-semibold" onClick={() => applyFilter('provinces')}>Áp dụng</button>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selected Filter Badges / Tags row */}
        {(filterPancakeOrderId || filterAdminStatuses.length > 0 || filterKtvIds.length > 0 || filterWorkTypes.length > 0 || filterMainStationIds.length > 0 || filterCustomerName || filterCustomerPhone || filterServiceTypes.length > 0 || filterProductCategories.length > 0 || filterProductNames.length > 0 || filterTechStationIds.length > 0 || filterProvinces.length > 0 || customStartDate || customEndDate) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase">Đang lọc:</span>

            {(customStartDate || customEndDate) && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                {dateType === 'createdAt' && 'Ngày tạo'}
                {dateType === 'appointmentTime' && 'Hẹn khách'}
                {dateType === 'completedAt' && 'Hoàn thành'}
                {dateType === 'updatedAt' && 'Cập nhật'}
                : {formatDate(customStartDate)} - {formatDate(customEndDate)}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none p-0.5 rounded-full hover:bg-gray-200" onClick={() => { setCustomStartDate(''); setCustomEndDate(''); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

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

            {filterServiceTypes.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Dịch vụ: {filterServiceTypes.join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterServiceTypes([]); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterProductCategories.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Danh mục: {filterProductCategories.join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterProductCategories([]); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterProductNames.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Sản phẩm: {filterProductNames.join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterProductNames([]); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterTechStationIds.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Trạm KT: {filterTechStationIds.map(id => dbFilterOptions.techStations.find(ts => ts.id === id)?.name || id).join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterTechStationIds([]); setPage(1); }}>
                  <XCircle size={14} className="fill-gray-200 hover:fill-gray-300 text-gray-500" />
                </button>
              </span>
            )}

            {filterProvinces.length > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200">
                Tỉnh/TP: {filterProvinces.join(', ')}
                <button type="button" className="ml-1.5 text-gray-400 hover:text-gray-600 outline-none" onClick={() => { setFilterProvinces([]); setPage(1); }}>
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

      {/* Quick Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 px-4 py-1.5 bg-gray-50 border-b border-gray-200">
        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm flex flex-row items-center justify-between">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Tổng số đơn</span>
          <span className="text-[17px] font-bold text-gray-900">{stats.total}</span>
        </div>
        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm flex flex-row items-center justify-between border-l-4 border-l-amber-500">
          <span className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider">Chờ xử lý</span>
          <span className="text-[17px] font-bold text-gray-900">{stats.pending}</span>
        </div>
        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm flex flex-row items-center justify-between border-l-4 border-l-blue-500">
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">Đã phân công</span>
          <span className="text-[17px] font-bold text-gray-900">{stats.assigned}</span>
        </div>
        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm flex flex-row items-center justify-between border-l-4 border-l-emerald-500">
          <span className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Hoàn thành</span>
          <span className="text-[17px] font-bold text-gray-900">{stats.completed}</span>
        </div>
        <div className="bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm flex flex-row items-center justify-between border-l-4 border-l-red-500">
          <span className="text-[11px] font-semibold text-red-600 uppercase tracking-wider">Hủy đơn</span>
          <span className="text-[17px] font-bold text-gray-900">{stats.cancelled}</span>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 bg-white">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Không tìm thấy yêu cầu nào</div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-[64px] lg:top-0 bg-[#f8f9fa] text-gray-600 font-semibold border-b border-gray-200 z-20">
              <tr>
                <th className="px-4 py-2 w-[70px]">Mã đơn</th>
                <th className="px-4 py-2 w-[180px]">Khách hàng</th>
                <th className="px-4 py-2 w-[220px]">Công việc</th>
                <th className="px-4 py-2 min-w-[320px]">Ghi chú</th>
                <th className="px-4 py-2 text-center w-[140px]">Thao tác</th>
                <th className="px-4 py-2 w-[160px]">Trạm - KTV</th>
                <th className="px-4 py-2 w-[130px]">Tạo bởi - lúc</th>
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
                const techStationName = order.techStation?.name
                  || order.assignedKtv?.techStation?.name
                  || '';

                return (
                  <tr key={order.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-blue-50/50 transition-colors`}>
                    {/* 1. Mã đơn */}
                    <td className="px-4 py-2 font-medium align-top">
                      <div>#{order.pancakeOrderId}</div>
                      {order.orderSource && /shopee|lazada|tiktok|tiki/i.test(order.orderSource) && (
                        <div className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 mt-0.5 inline-block cursor-help" title={`Nguồn: ${order.orderSource}`}>
                          Đơn Ecom
                        </div>
                      )}
                    </td>

                    {/* 2. Khách hàng */}
                    <td className="px-4 py-2 whitespace-normal align-top">
                      <div className="font-bold text-gray-900 text-[13px]">{customerName}</div>
                      <div className="text-gray-700 font-semibold text-[12px] my-0.5">{phone}</div>
                      <div className="text-gray-500 text-[11px] leading-tight line-clamp-2" title={order.shippingAddress?.full_address || order.customer?.fullAddress || ''}>
                        {order.shippingAddress?.full_address || order.customer?.fullAddress || 'Không có địa chỉ'}
                      </div>
                    </td>

                    {/* 3. Công việc */}
                    <td className="px-4 py-2 whitespace-normal align-top">
                      {/* Trạng thái & Hẹn khách inline */}
                      <div className="flex items-center flex-wrap gap-1.5 mb-1">
                        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded text-white capitalize ${getStatusStyle(order.adminStatus || 'chờ xử lý')}`}>
                          {order.adminStatus === 'đang thực hiện' ? 'đã phân công' : (order.adminStatus || 'chờ xử lý')}
                        </span>
                        {order.appointmentTime ? (() => {
                          const isOverdue = new Date(order.appointmentTime) < new Date() && order.adminStatus !== 'hoàn thành' && order.adminStatus !== 'hủy đơn';
                          return (
                            <span className={`text-[11px] font-bold ${isOverdue ? 'text-red-600' : 'text-blue-700'}`} title={order.rescheduleReason ? `Lý do hẹn lại: ${order.rescheduleReason}` : ''}>
                              📅 {new Date(order.appointmentTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} {new Date(order.appointmentTime).toLocaleDateString('vi-VN')}
                              {order.rescheduleReason && <span className="text-red-500 font-normal"> (Hẹn lại)</span>}
                            </span>
                          );
                        })() : (
                          <span className="text-[11px] text-gray-400 italic">Chưa hẹn lịch</span>
                        )}
                      </div>

                      {/* Loại công việc & dịch vụ */}
                      <div className="text-[11px] font-medium text-gray-800 leading-tight">
                        <span>CV: </span>
                        <span className="font-semibold text-blue-800">{order.workType || 'Chưa xác định'}</span>
                        {order.serviceType && order.serviceType !== 'Công việc đã bao gồm dịch vụ' && (
                          <span className="text-gray-500 font-normal"> ({order.serviceType})</span>
                        )}
                      </div>

                      {/* Sản phẩm inline */}
                      <div className="text-gray-600 text-[11px] my-1 leading-normal">
                        {order.items && order.items.length > 0 ? (
                          <span>
                            <span className="text-gray-400">📦 </span>
                            {order.items.map((item: any) => {
                              const pName = item.productName || item.rawData?.variation_info?.name || item.rawData?.name || 'Sản phẩm';
                              return `${pName} (x${item.quantity})`;
                            }).join(', ')}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Chưa có sản phẩm</span>
                        )}
                      </div>

                      {/* Tiền thu */}
                      {order.moneyToCollect > 0 && (
                        <div className="text-emerald-700 font-bold text-[11px] mt-0.5">
                          Thu: {(order.moneyToCollect).toLocaleString('vi-VN')} đ
                        </div>
                      )}
                    </td>

                    {/* 4. Ghi chú (Hiển thị đầy đủ như yêu cầu) */}
                    <td className="px-4 py-2 whitespace-normal align-top">
                      <div className="text-gray-700 text-[12px] italic whitespace-pre-wrap leading-relaxed">
                        {order.note || '-'}
                      </div>
                    </td>

                    {/* 5. Thao tác */}
                    <td className="px-4 py-2 align-top">
                      <div className="flex items-center justify-center flex-wrap gap-1.5">
                        {/* Phân công */}
                        <button
                          onClick={() => openAssignModal(order)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 transition-colors"
                          title="Phân loại & Phân công"
                        >
                          <UserPlus size={15} />
                        </button>

                        {/* Hoàn thành (chỉ hiện khi chưa hoàn thành/hủy) */}
                        {order.adminStatus !== 'hoàn thành' && order.adminStatus !== 'hủy đơn' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'hoàn thành')}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded border border-transparent hover:border-emerald-100 transition-colors"
                            title="Xác nhận Hoàn thành"
                          >
                            <CheckCircle2 size={15} />
                          </button>
                        )}

                        {/* Hủy đơn (chỉ hiện khi chưa hoàn thành/hủy) */}
                        {order.adminStatus !== 'hoàn thành' && order.adminStatus !== 'hủy đơn' && (
                          <button
                            onClick={() => handleStatusChange(order.id, 'hủy đơn')}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded border border-transparent hover:border-red-100 transition-colors"
                            title="Hủy đơn hàng"
                          >
                            <XCircle size={15} />
                          </button>
                        )}

                        {/* Mở lại đơn (chỉ hiện khi đơn đã hoàn thành/hủy) */}
                        {(order.adminStatus === 'hoàn thành' || order.adminStatus === 'hủy đơn') && (
                          <button
                            onClick={() => handleReopenOrder(order)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded border border-transparent hover:border-amber-100 transition-colors"
                            title="Mở lại đơn (Về Chờ xử lý & xóa phân công)"
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}

                        {/* Copy nhanh thông tin đi Zalo */}
                        <button
                          onClick={() => handleCopyOrderInfo(order)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded border border-transparent hover:border-indigo-100 transition-colors"
                          title="Copy thông tin"
                        >
                          <Copy size={15} />
                        </button>

                        {/* Xem báo cáo dịch vụ (nếu có) */}
                        {order.serviceReports && order.serviceReports.length > 0 && (
                          <button
                            onClick={() => navigate(`/admin/reports?search=${order.pancakeOrderId}`)}
                            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded border border-transparent hover:border-teal-100 transition-colors"
                            title="Xem báo cáo của KTV"
                          >
                            <FileText size={15} />
                          </button>
                        )}

                        {/* Nhật ký lịch sử đơn */}
                        <button
                          onClick={() => openAuditModal(order.id)}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded border border-transparent hover:border-gray-200 transition-colors"
                          title="Lịch sử thay đổi đơn"
                        >
                          <History size={15} />
                        </button>
                      </div>
                    </td>

                    {/* 6. Trạm - KTV */}
                    <td className="px-4 py-2 whitespace-normal align-top">
                      <div className="font-bold text-gray-800 text-[12px]">{mainStationName || 'Chưa phân trạm chính'}</div>
                      {techStationName && <div className="text-[11px] text-gray-600 font-medium">{techStationName}</div>}
                      <div className="text-gray-500 text-[11px] mt-0.5">KTV: <span className="font-semibold text-gray-700">{ktvName}</span></div>

                      {order.ktvCalledAt && (
                        <div className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded mt-1 inline-block font-medium">
                          📞 Đã gọi khách lúc {new Date(order.ktvCalledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(order.ktvCalledAt).toLocaleDateString('vi-VN')}
                        </div>
                      )}
                    </td>

                    {/* 7. Tạo bởi - lúc */}
                    <td className="px-4 py-2 whitespace-normal align-top text-[11px]">
                      {order.pancakeCreatedAt ? (() => {
                        const date = new Date(order.pancakeCreatedAt);
                        return (
                          <div className="font-medium text-gray-700">
                            {date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {date.toLocaleDateString('vi-VN')}
                          </div>
                        );
                      })() : <div className="text-gray-400">-</div>}

                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {(() => {
                          const creatorName = order.rawData?.creator?.name;
                          if (creatorName) {
                            return <span className="font-medium text-gray-600">{creatorName}</span>;
                          }
                          const source = (order.orderSource || order.rawData?.order_sources_name || '').toLowerCase();
                          const isEcom = source.includes('shopee') || source.includes('lazada') || source.includes('tiktok') || source.includes('tiki');
                          if (isEcom) {
                            return <span className="text-blue-600 bg-blue-50 px-1 py-0.2 rounded text-[10px] font-semibold">Hệ thống</span>;
                          }
                          return <span>-</span>;
                        })()}
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
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 border rounded"><ChevronLeft size={16} /></button>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 border rounded"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}

      {/* ASSIGN MODAL (Truliva Flow) */}
      {assignModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">Chi tiết & Phân bổ Yêu cầu #{assignModal.order.pancakeOrderId}</h3>
              <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600"><XCircle size={24} /></button>
            </div>

            <div className="p-6 overflow-auto flex-1 grid grid-cols-2 gap-6">
              {/* Cột trái: Phân loại */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-800 border-b pb-2">1. Phân loại Yêu cầu</h4>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Loại công việc *</label>
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
                  <label className="block text-sm text-gray-600 mb-1">Loại dịch vụ chi tiết *</label>
                  {['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc'].includes(workType) ? (
                    <input type="text" className="w-full border rounded p-2 text-sm outline-none bg-gray-50 text-gray-500" value="Công việc đã bao gồm dịch vụ" readOnly />
                  ) : (workType === 'Bảo hành' || workType === 'Sửa chữa') ? (
                    <div className="relative">
                      <input 
                        type="text"
                        className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500 text-gray-800 bg-white"
                        placeholder="Gõ để tìm kiếm & chọn dịch vụ..."
                        value={serviceType}
                        onChange={e => setServiceType(e.target.value)}
                        onFocus={() => setShowServiceDropdown(true)}
                        onBlur={() => setTimeout(() => setShowServiceDropdown(false), 200)}
                      />
                      <div className="absolute right-2 top-2.5 text-gray-400 pointer-events-none">
                        <Search size={16} />
                      </div>
                      {showServiceDropdown && (
                        <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {(() => {
                            const options = workType === 'Bảo hành' 
                              ? Object.values(WARRANTY_SERVICE_GROUPS).flat() 
                              : Object.values(REPAIR_SERVICE_GROUPS).flat();
                            const query = removeAccents(serviceType || '');
                            const filteredOptions = options.filter(opt => 
                              removeAccents(opt).includes(query)
                            );

                            if (filteredOptions.length === 0) {
                              return <div className="px-3 py-2 text-sm text-gray-400 italic">Không tìm thấy dịch vụ nào</div>;
                            }

                            const groups = workType === 'Bảo hành' ? WARRANTY_SERVICE_GROUPS : REPAIR_SERVICE_GROUPS;
                            return Object.entries(groups).map(([groupName, services]) => {
                              const matchingServices = services.filter(s => filteredOptions.includes(s));
                              if (matchingServices.length === 0) return null;
                              return (
                                <div key={groupName} className="border-b border-gray-100 last:border-0">
                                  <div className="px-3 py-1 text-xs font-semibold text-gray-500 bg-gray-50">
                                    {groupName}
                                  </div>
                                  <div className="divide-y divide-gray-50">
                                    {matchingServices.map(s => (
                                      <button
                                        key={s}
                                        type="button"
                                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                                        onClick={() => {
                                          setServiceType(s);
                                          setShowServiceDropdown(false);
                                        }}
                                      >
                                        {s}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      )}
                    </div>
                  ) : (
                    <input type="text" className="w-full border rounded p-2 text-sm outline-none bg-gray-100 text-gray-400 cursor-not-allowed" value="Vui lòng chọn loại công việc trước" disabled />
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Thời gian hẹn khách *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input 
                        type="date" 
                        className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500 text-gray-800 bg-white" 
                        value={appointmentDate} 
                        min={todayStr}
                        onChange={e => {
                          setAppointmentDate(e.target.value);
                          setAppointmentTime('08:30');
                        }} 
                      />
                    </div>
                    <div>
                      <input 
                        type="time" 
                        className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500 text-gray-800 bg-white" 
                        value={appointmentTime} 
                        onChange={e => setAppointmentTime(e.target.value)} 
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Lý do hẹn lại (nếu có)</label>
                  <textarea rows={2} className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} placeholder="Khách bận, KTV kẹt lịch..."></textarea>
                </div>

                {/* Giao diện thêm/chọn lại sản phẩm */}
                <div className="border-t pt-4 mt-4 space-y-2">
                  <label className="block text-sm font-semibold text-gray-800">Sản phẩm yêu cầu dịch vụ</label>
                  
                  {/* List of tempItems */}
                  {tempItems.length > 0 ? (
                    <div className="border border-gray-200 rounded divide-y max-h-40 overflow-y-auto bg-gray-50">
                      {tempItems.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 text-xs">
                          <div className="font-medium text-gray-800 truncate pr-2 animate-fade-in" title={item.productName}>
                            {item.productName} {item.sku ? `(${item.sku})` : ''}
                          </div>
                          <div className="flex items-center space-x-2 shrink-0">
                            <input
                              type="number"
                              min={1}
                              className="w-12 border rounded text-center py-0.5 text-xs outline-none focus:border-blue-500 bg-white text-gray-800"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10) || 1;
                                const newItems = [...tempItems];
                                newItems[idx].quantity = val;
                                setTempItems(newItems);
                              }}
                            />
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700 font-bold px-1"
                              onClick={() => {
                                setTempItems(tempItems.filter((_, i) => i !== idx));
                              }}
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 italic bg-gray-50 border border-dashed rounded p-3 text-center">
                      Đơn hàng chưa có sản phẩm. Chọn bên dưới để thêm.
                    </div>
                  )}

                  {/* Search and add product dropdown */}
                  <div className="flex space-x-2">
                    <select
                      className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500 bg-white text-gray-800 font-medium"
                      defaultValue=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const selectedProd = productsStock.find(p => p.id === val);
                        if (selectedProd) {
                          const exists = tempItems.some(item => 
                            item.sku === selectedProd.sku || 
                            item.productName.toLowerCase() === selectedProd.name.toLowerCase()
                          );
                          if (exists) {
                            alert('Sản phẩm này đã được thêm.');
                          } else {
                            setTempItems([...tempItems, {
                              productName: selectedProd.name,
                              sku: selectedProd.sku || '',
                              quantity: 1,
                              price: selectedProd.sellingPrice || 0,
                              discount: 0
                            }]);
                          }
                        }
                        e.target.value = '';
                      }}
                    >
                      <option value="">-- Thêm sản phẩm vào đơn --</option>
                      {productsStock.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.sku ? `(${p.sku})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Phần 3: Kho xuất hàng & Đối chiếu tồn kho */}
                <div className="border-t pt-4 mt-4 space-y-3">
                  <h4 className="font-semibold text-gray-800 flex items-center gap-1.5">
                    3. Kho hàng xuất vật tư
                  </h4>
                  
                  <div className="relative">
                    <label className="block text-xs text-gray-500 mb-1">Chọn kho xuất hàng</label>
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Gõ để tìm & chọn kho..."
                        className="w-full border rounded p-2 pr-8 text-sm outline-none focus:border-blue-500 bg-white text-gray-800 font-medium"
                        value={warehouseSearch}
                        onChange={(e) => {
                          setWarehouseSearch(e.target.value);
                          setShowWarehouseDropdown(true);
                          if (!e.target.value) {
                            setSelectedWarehouseId('');
                          }
                        }}
                        onFocus={() => setShowWarehouseDropdown(true)}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs focus:outline-none"
                        onClick={() => setShowWarehouseDropdown(!showWarehouseDropdown)}
                      >
                        {showWarehouseDropdown ? '▲' : '▼'}
                      </button>
                    </div>

                    {showWarehouseDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowWarehouseDropdown(false)} />
                        
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border rounded shadow-lg z-20 divide-y divide-gray-100">
                          {warehouses
                            .filter(w => removeAccents(w.name).includes(removeAccents(warehouseSearch)))
                            .map(w => (
                              <button
                                key={w.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors ${
                                  selectedWarehouseId === w.id ? 'bg-blue-50/70 font-semibold text-blue-700' : 'text-gray-700'
                                }`}
                                onClick={() => {
                                  setSelectedWarehouseId(w.id);
                                  setWarehouseSearch(w.name);
                                  setShowWarehouseDropdown(false);
                                }}
                              >
                                {w.name}
                              </button>
                            ))}
                          {warehouses.filter(w => removeAccents(w.name).includes(removeAccents(warehouseSearch))).length === 0 && (
                            <div className="p-3 text-xs text-gray-400 italic text-center">Không tìm thấy kho hàng nào</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                {/* Danh sách đối chiếu tồn kho */}
                {selectedWarehouseId && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-gray-600">Đối chiếu tồn kho tại trạm/kho:</label>
                    {loadingInventory ? (
                      <div className="text-xs text-gray-400 italic">Đang đối chiếu tồn kho...</div>
                    ) : tempItems && tempItems.length > 0 ? (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {tempItems.map((item: any, i: number) => {
                            const pName = item.productName || item.rawData?.variation_info?.name || item.rawData?.name || 'Sản phẩm';
                            const itemSku = item.sku || item.rawData?.sku || '';
                            
                            // Tìm sản phẩm trong danh sách tồn kho
                            const stockProd = productsStock.find(p => 
                              (itemSku && p.sku === itemSku) || 
                              p.name.toLowerCase() === pName.toLowerCase() ||
                              (item.rawData?.variation_id && String(p.pancakeProductId) === String(item.rawData.variation_id))
                            );

                            const available = stockProd ? (stockProd.stocks[selectedWarehouseId] ?? 0) : 0;
                            const actual = stockProd ? (stockProd.actualStocks[selectedWarehouseId] ?? 0) : 0;
                            const requiredQty = item.quantity || 1;

                            const isOutOfStock = available === 0;
                            const isLowStock = available > 0 && available <= 2;
                            const isInstallation = workType === 'Lắp đặt';

                            // Xác định xem đơn hàng gốc có chứa sản phẩm ban đầu hay không
                            let originallyHasProducts = false;
                            if (assignModal?.order?.rawData) {
                              try {
                                const raw = typeof assignModal.order.rawData === 'string'
                                  ? JSON.parse(assignModal.order.rawData)
                                  : assignModal.order.rawData;
                                const itemsList = raw.items || raw.order_items || [];
                                originallyHasProducts = Array.isArray(itemsList) && itemsList.length > 0;
                              } catch (e) {
                                originallyHasProducts = false;
                              }
                            }

                            let bgClass = 'bg-green-50 border-green-100 text-green-800';
                            let statusText = 'Còn hàng';
                            if (isInstallation || !originallyHasProducts) {
                              bgClass = 'bg-blue-50 border-blue-100 text-blue-800 font-medium';
                              statusText = 'Không trừ kho';
                            } else if (isOutOfStock) {
                              bgClass = 'bg-red-50 border-red-200 text-red-700 font-medium';
                              statusText = 'HẾT HÀNG';
                            } else if (isLowStock) {
                              bgClass = 'bg-amber-50 border-amber-200 text-amber-700 font-medium';
                              statusText = 'Sắp hết';
                            }

                            return (
                              <div key={i} className={`p-2 rounded border text-xs flex justify-between items-center transition-colors ${bgClass}`}>
                                <div className="flex-1 min-w-0 mr-2">
                                  <div className="font-semibold truncate" title={pName}>{pName}</div>
                                  <div className="text-[10px] text-gray-500">Mã: {itemSku || 'N/A'} | Cần: x{requiredQty}</div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-bold">Có thể bán: {available}</div>
                                  <div className="text-[10px] text-gray-500">Tồn thực tế: {actual}</div>
                                  <div className="text-[9px] uppercase font-bold tracking-wider mt-0.5">{statusText}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic">Đơn hàng không có sản phẩm nào để đối chiếu</div>
                      )}
                    </div>
                  )}
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
                  <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={selectedMain} onChange={e => { setSelectedMain(e.target.value); setSelectedTech(''); setSelectedKtv(''); }}>
                    <option value="">-- Chọn Trạm chính --</option>
                    {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">Trạm kỹ thuật</label>
                  <select className="w-full border rounded p-2 text-sm outline-none focus:border-blue-500" value={selectedTech} onChange={e => { setSelectedTech(e.target.value); setSelectedKtv(''); }} disabled={!selectedMain}>
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
                  if (!ktv) return null;
                  const count = ktv.pendingOrderCount || 0;
                  const isHigh = count >= 5;
                  const isMedium = count >= 3 && count < 5;
                  return (
                    <div className={`p-3 rounded text-sm mt-2 border ${isHigh ? 'bg-red-50 border-red-200 text-red-700' : isMedium ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                      <div className="font-semibold mb-1">
                        {isHigh ? '⚠️ Tải cao' : isMedium ? '⚡ Tải trung bình' : '✅ Tải nhẹ'}
                      </div>
                      <div>
                        <b>{ktv.fullName}</b> hiện đang có <b>{count}</b> đơn chưa hoàn thành.
                        {isHigh && ' Cân nhắc giao cho KTV khác.'}
                      </div>
                    </div>
                  );
                })()}

                {selectedKtv && ktvs.some((k: any) => k.id === selectedKtv) && (
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
            <textarea className="w-full border p-2 rounded mb-4 outline-none focus:border-red-500" rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Nhập lý do..."></textarea>
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
              <button onClick={() => setAuditModal(null)}><XCircle size={20} className="text-gray-500" /></button>
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
                      {log.changes && (() => {
                        let changesArr: any[] = [];
                        if (Array.isArray(log.changes)) {
                          changesArr = log.changes;
                        } else if (typeof log.changes === 'string') {
                          try { changesArr = JSON.parse(log.changes); } catch { changesArr = []; }
                          if (!Array.isArray(changesArr)) changesArr = [changesArr];
                        } else if (typeof log.changes === 'object' && log.changes !== null) {
                          changesArr = [log.changes];
                        }
                        return changesArr.map((c: any, i: number) => (
                          <div key={i} className="text-gray-600">
                            - <span className="font-medium text-gray-800">{c.field || Object.keys(c)[0] || 'N/A'}</span>: <span className="line-through text-red-400">{String(c.from ?? c[Object.keys(c)[0]] ?? 'Trống')}</span> &rarr; <span className="text-green-600 font-medium">{String(c.to ?? 'Trống')}</span>
                          </div>
                        ));
                      })()}
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
