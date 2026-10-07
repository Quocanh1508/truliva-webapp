import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getOrders, callCustomer, rescheduleOrder } from '../../api/client';
import { Search, ChevronLeft, ChevronRight, Phone, Calendar, FileText, User, MapPin, Clock, MessageSquare, CreditCard, X, Package, ZoomIn } from 'lucide-react';
import PullToRefresh from '../../components/PullToRefresh';
import { formatOrderId } from '../../utils/text';
import { fetchCurrentWeather, type WeatherInfo } from '../../utils/weather';
import { useAuth } from '../../context/AuthContext';

export default function MyOrders() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const searchParam = new URLSearchParams(location.search).get('search') || '';
  const prevSearchParamRef = useRef(searchParam);
  const [search, setSearch] = useState(() => searchParam);
  const [sortBy, setSortBy] = useState('appointmentTime');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);
  // Thời gian thực tế để tính toán đếm ngược / trễ (cập nhật mỗi phút, không gây áp lực)
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const [callingOrderId, setCallingOrderId] = useState<string | null>(null);

  // Reschedule Modal state
  const [rescheduleModalOrder, setRescheduleModalOrder] = useState<any | null>(null);
  const [newApptTime, setNewApptTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [resubmitLoading, setResubmitLoading] = useState(false);

  // Lightbox state cho xem ảnh sản phẩm
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);

  // State quản lý xem chi tiết đơn dạng Full Screen Popup
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any | null>(null);

  const openOrderDetail = (order: any) => {
    setSelectedOrderDetail(order);
    try {
      window.history.pushState({ modal: 'order_detail' }, '');
    } catch {
      // ignore
    }
  };

  const closeOrderDetail = () => {
    setSelectedOrderDetail(null);
    try {
      if (window.history.state?.modal === 'order_detail') {
        window.history.back();
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setSelectedOrderDetail(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Cập nhật selectedOrderDetail nếu danh sách orders thay đổi
  useEffect(() => {
    if (selectedOrderDetail) {
      const updated = orders.find(o => o.id === selectedOrderDetail.id);
      if (updated) setSelectedOrderDetail(updated);
    }
  }, [orders]);

  const fetchOrdersData = async (silent = false, customSearch?: string) => {
    try {
      if (!silent) setLoading(true);
      const activeSearch = customSearch !== undefined ? customSearch : search;
      const res = await getOrders({
        page,
        limit: 20,
        search: activeSearch,
        sortBy,
        sortOrder
      });
      setOrders(res.orders);
      setTotalPages(res.pagination.totalPages);
      setTotalOrders(res.pagination.total || 0);
      setError('');

      if (silent) {
        const stationName = user?.techStation?.name || user?.techStation?.mainStation?.name || '';
        const wData = await fetchCurrentWeather(true, stationName);
        if (wData) setWeather(wData);
      }
      
      // Cache the default view (first page, empty search)
      if (!activeSearch && page === 1) {
        localStorage.setItem('cached_ktv_orders', JSON.stringify({
          orders: res.orders,
          pagination: res.pagination
        }));
      }
    } catch (err: any) {
      const cached = localStorage.getItem('cached_ktv_orders');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setOrders(parsed.orders || []);
          setTotalPages(parsed.pagination?.totalPages || 1);
          setTotalOrders(parsed.pagination?.total || 0);
          setError('Bạn đang xem danh sách đơn hàng ngoại tuyến (không có mạng)');
        } catch (e) {
          setError(err.message || 'Lỗi tải danh sách đơn hàng');
        }
      } else {
        setError(err.message || 'Lỗi tải danh sách đơn hàng');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersData();
  }, [page, sortBy, sortOrder]);

  // Tự động tìm kiếm và cập nhật khi KTV nhấn vào thông báo đẩy (URL chứa ?search=...)
  useEffect(() => {
    if (searchParam !== prevSearchParamRef.current) {
      prevSearchParamRef.current = searchParam;
      setSearch(searchParam);
      setPage(1);
      fetchOrdersData(false, searchParam);
    }
  }, [searchParam]);

  useEffect(() => {
    if (!user) return;
    const loadWeather = async () => {
      const stationName = user.techStation?.name || user.techStation?.mainStation?.name || '';
      const firstOrderAddress = orders.length > 0 ? (orders[0].shippingAddress?.city || orders[0].shippingAddress?.full_address || orders[0].address) : undefined;
      const wData = await fetchCurrentWeather(false, stationName, firstOrderAddress);
      if (wData) setWeather(wData);
    };
    loadWeather();

    // Tự động làm mới dữ liệu thời tiết mỗi 15 phút
    const weatherInterval = setInterval(() => {
      loadWeather();
    }, 15 * 60 * 1000);

    return () => clearInterval(weatherInterval);
  }, [user, orders.length > 0 ? orders[0]?.id : null]);

  useEffect(() => {
    const handleOnline = () => {
      fetchOrdersData(true);
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [page, sortBy, sortOrder, search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrdersData();
  };

  const handleClearSearch = () => {
    setSearch('');
    setPage(1);
    prevSearchParamRef.current = '';
    fetchOrdersData(false, '');
    if (location.search) {
      navigate('/ktv/my-orders', { replace: true });
    }
  };

  const handleCallCustomer = async (orderId: string, phone: string) => {
    if (!phone || callingOrderId) return;
    try {
      // Copy to clipboard
      await navigator.clipboard.writeText(phone);
      
      setCallingOrderId(orderId);
      await callCustomer(orderId);
      
      // Update local state
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, ktvCalledAt: new Date().toISOString() } : o
      ));
      
      // Open phone dialer
      window.location.href = `tel:${phone}`;
    } catch (err: any) {
      console.error('Call customer error:', err);
    } finally {
      setCallingOrderId(null);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleModalOrder || !newApptTime || !rescheduleReason) return;
    try {
      setResubmitLoading(true);
      await rescheduleOrder(rescheduleModalOrder.id, newApptTime, rescheduleReason);
      setRescheduleModalOrder(null);
      setNewApptTime('');
      setRescheduleReason('');
      fetchOrdersData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi hẹn lại lịch');
    } finally {
      setResubmitLoading(false);
    }
  };



  const getWorkTypeBadge = (workType: string) => {
    if (!workType) return null;
    const wt = workType.toLowerCase();
    if (wt.includes('lắp đặt') && wt.includes('giao')) {
      return <span className="inline-flex px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold mt-1 w-max">Giao & Lắp đặt</span>;
    }
    if (wt.includes('lắp đặt')) {
      return <span className="inline-flex px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded text-[10px] font-bold mt-1 w-max">Lắp đặt</span>;
    }
    if (wt.includes('bảo hành') || wt.includes('sửa')) {
      return <span className="inline-flex px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-[10px] font-bold mt-1 w-max">Bảo hành / Sửa</span>;
    }
    if (wt.includes('thay lọc') || wt.includes('thay lõi')) {
      return <span className="inline-flex px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold mt-1 w-max">Thay lọc</span>;
    }
    if (wt.includes('giao hàng')) {
      return <span className="inline-flex px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded text-[10px] font-bold mt-1 w-max">Giao hàng</span>;
    }
    return <span className="inline-flex px-1.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200 rounded text-[10px] font-bold mt-1 w-max">{workType}</span>;
  };

  /**
   * Tính toán trạng thái lịch hẹn:
   * - Nếu trễ trong ngày: hiển thị chi tiết theo giờ, phút, giây (real-time ticking)
   * - Nếu trễ qua ngày: hiển thị số ngày trễ
   * - Nếu chưa tới hẹn: hiển thị thời gian còn lại
   */
  const getAppointmentStatus = (appointmentTime: string | Date | null | undefined, currentNow: Date) => {
    if (!appointmentTime) {
      return {
        text: 'Chưa hẹn lịch',
        color: 'text-gray-400 italic',
        isOverdue: false,
      };
    }

    const apptDate = new Date(appointmentTime);
    if (isNaN(apptDate.getTime())) {
      return {
        text: 'Chưa hẹn lịch',
        color: 'text-gray-400 italic',
        isOverdue: false,
      };
    }

    const isOverdue = apptDate.getTime() < currentNow.getTime();

    // So sánh ngày theo lịch (Calendar Day): cùng ngày hay đã qua ngày
    const startOfAppt = new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate()).getTime();
    const startOfToday = new Date(currentNow.getFullYear(), currentNow.getMonth(), currentNow.getDate()).getTime();
    const diffCalendarDays = Math.round((startOfToday - startOfAppt) / (1000 * 60 * 60 * 24));

    if (isOverdue) {
      // Nếu thời gian trễ vẫn là trong ngày: chỉ hiện theo giờ để tránh gây áp lực
      if (diffCalendarDays <= 0) {
        const diffMs = currentNow.getTime() - apptDate.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));

        let delayText = '';
        if (hours >= 1) {
          delayText = `Đã trễ ${hours} giờ`;
        } else {
          delayText = 'Đã trễ dưới 1 giờ';
        }

        return {
          text: delayText,
          color: 'text-rose-600 font-bold',
          isOverdue: true,
        };
      } else {
        // Đã qua ngày: hiện trễ theo số ngày
        return {
          text: `Đã trễ ${diffCalendarDays} ngày trước`,
          color: 'text-rose-600 font-bold',
          isOverdue: true,
        };
      }
    } else {
      // Chưa tới giờ hẹn
      if (diffCalendarDays <= 0) {
        const diffMs = apptDate.getTime() - currentNow.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        if (hours >= 1) {
          return {
            text: `Còn ${hours} giờ`,
            color: 'text-blue-600 font-medium',
            isOverdue: false,
          };
        } else {
          return {
            text: 'Còn dưới 1 giờ',
            color: 'text-amber-600 font-bold',
            isOverdue: false,
          };
        }
      } else {
        const daysAhead = Math.abs(diffCalendarDays);
        return {
          text: `Còn ${daysAhead} ngày tới`,
          color: 'text-blue-600 font-medium',
          isOverdue: false,
        };
      }
    }
  };

  const getWeatherAlert = () => {
    if (!weather) return null;
    const isRainy = (weather.precipitation !== undefined && weather.precipitation > 0) ||
      (weather.rain !== undefined && weather.rain > 0) ||
      (weather.showers !== undefined && weather.showers > 0) ||
      [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weather.weatherCode);
    const isThunderstorm = [95, 96, 99].includes(weather.weatherCode) || (weather.windSpeed !== undefined && weather.windSpeed >= 35);
    const isHot = weather.temperature >= 35 || (weather.apparentTemperature !== undefined && weather.apparentTemperature >= 37);

    const tempStr = `${weather.temperature}°C${weather.apparentTemperature && weather.apparentTemperature !== weather.temperature ? ` (cảm giác ${weather.apparentTemperature}°C)` : ''}`;
    const loc = weather.locationName || 'khu vực';

    if (isThunderstorm) {
      return {
        bg: 'bg-red-50 border-red-200',
        text: 'text-red-800 border-red-200',
        icon: '⛈️',
        message: `Tại ${loc} đang có dông bão / gió lớn (${tempStr}${weather.windSpeed ? `, gió ${weather.windSpeed}km/h` : ''}). Anh/chị chú ý an toàn khi di chuyển và bảo quản kỹ thiết bị điện nhé!`
      };
    }
    if (isRainy) {
      return {
        bg: 'bg-indigo-50 border-indigo-200',
        text: 'text-indigo-800 border-indigo-200',
        icon: '🌧️',
        message: `Tại ${loc} đang có mưa (${tempStr}${weather.precipitation ? `, lượng mưa ~${weather.precipitation}mm` : ''}). Anh/chị chú ý mang theo áo mưa và bảo quản cẩn thận hàng hóa khi đi giao nhé!`
      };
    }
    if (isHot) {
      return {
        bg: 'bg-amber-50 border-amber-200',
        text: 'text-amber-800 border-amber-200',
        icon: '☀️',
        message: `Thời tiết tại ${loc} hôm nay nắng nóng gay gắt (${tempStr}${weather.humidity ? `, độ ẩm ${weather.humidity}%` : ''}). Anh/chị chú ý bổ sung nước đầy đủ và giữ gìn sức khỏe nhé!`
      };
    }
    return null;
  };

  return (
    <div className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-[calc(100vh-80px)] font-sans">
      
      <div className="px-4 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Dịch vụ được giao</h2>
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center px-4 py-3 bg-white border-b border-gray-200">
        <form onSubmit={handleSearch} className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm theo mã đơn, khách hàng, SĐT..."
            className="w-full pl-9 pr-8 py-2 text-[13px] border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
              title="Xóa tìm kiếm"
            >
              <X size={14} />
            </button>
          )}
        </form>

        <div className="flex items-center space-x-3">
          <select
            className="px-3 py-2 text-[13px] border border-gray-300 rounded-md bg-white text-gray-700 cursor-pointer focus:ring-1 focus:ring-blue-500 outline-none"
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
          >
            <option value="appointmentTime">Hẹn khách</option>
            <option value="createdAt">Tạo mới</option>
          </select>
          <select
            className="px-3 py-2 text-[13px] border border-gray-300 rounded-md bg-white text-gray-700 cursor-pointer focus:ring-1 focus:ring-blue-500 outline-none"
            value={sortOrder}
            onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
          >
            <option value="desc">Mới nhất</option>
            <option value="asc">Cũ nhất</option>
          </select>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 overflow-auto bg-white">
        <PullToRefresh onRefresh={() => fetchOrdersData(true)}>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error && orders.length === 0 ? (
            <div className="text-center py-12 text-red-500 font-medium">{error}</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Bạn chưa được giao dịch vụ nào</div>
          ) : (
            <div className="flex flex-col p-4 space-y-4">
              {/* Banner trạng thái offline */}
              {error && (
                <div className="p-3 bg-amber-500 text-white rounded-xl flex items-center justify-between shadow-xs mb-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-base">⚠️</span>
                    <span className="text-xs font-semibold">{error}</span>
                  </div>
                </div>
              )}

              {/* Banner thời tiết thông minh */}
              {(() => {
                const alert = getWeatherAlert();
                if (!alert) return null;
                return (
                  <div className={`p-3 border rounded-xl flex items-start space-x-2.5 shadow-2xs ${alert.bg} ${alert.text}`}>
                    <span className="text-xl shrink-0">{alert.icon}</span>
                    <div className="flex-1 text-[12px] font-semibold leading-relaxed">
                      {alert.message}
                    </div>
                  </div>
                );
              })()}

              {/* Banner thống kê đơn hàng + Nút mở rộng/thu gọn tất cả */}
              <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-xl flex items-center justify-between shadow-xs">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-blue-600 text-white rounded-lg">
                    <Clock size={16} />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-blue-900">
                      {search ? 'Kết quả tìm kiếm' : 'Dịch vụ cần thực hiện'}
                    </h3>
                    <p className="text-[11.5px] text-blue-700">
                      {search ? `Tìm thấy ${totalOrders} đơn hàng phù hợp` : `Bạn còn ${totalOrders} đơn hàng chưa hoàn thành`}
                    </p>
                  </div>
                </div>
                <div className="bg-white/80 px-2.5 py-1 rounded-lg border border-blue-100 text-center shadow-xs">
                  <span className="text-base font-black text-blue-600 block leading-tight">{totalOrders}</span>
                  <span className="text-[8.5px] font-bold text-blue-500 uppercase tracking-wider block">đơn</span>
                </div>
              </div>

              {orders.map((order) => {
                const customerName = order.billFullName || order.customer?.fullName || 'Khách lẻ';
                const phone = order.billPhoneNumber || order.customer?.phoneNumber || '';
                const address = order.shippingAddress?.full_address || order.customer?.fullAddress || 'Đang cập nhật';
                
                // Tính toán trạng thái hẹn chuẩn xác (giờ/phút/giây trong ngày, số ngày nếu qua ngày)
                const timeStatus = getAppointmentStatus(order.appointmentTime, now);
                
                return (
                  <div 
                    key={order.id} 
                    onClick={() => openOrderDetail(order)}
                    className="border border-blue-200/70 rounded-2xl shadow-xs bg-white flex flex-col overflow-hidden hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99]"
                  >
                    {/* Header Ticket: Mã đơn + Loại CV + Gọi nhanh + Báo cáo nhanh (Bỏ status đơn) */}
                    <div className="p-3 pb-2.5 flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-[#1B3A6B] font-extrabold text-[15px] shrink-0">
                          {formatOrderId(order.pancakeOrderId)}
                        </span>
                        {getWorkTypeBadge(order.workType)}
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {phone && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleCallCustomer(order.id, phone); }}
                            disabled={callingOrderId === order.id}
                            title={`Gọi khách: ${phone}`}
                            className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Phone size={13} />
                          </button>
                        )}
                        {order.adminStatus === 'chờ duyệt' ? (
                          <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                            Chờ duyệt
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate('/ktv/report', { state: { order } }); }}
                            className="flex items-center space-x-1 py-1 px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] shadow-2xs transition-colors cursor-pointer active:scale-95"
                          >
                            <FileText size={12} />
                            <span>Báo cáo</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Thân Ticket: Tên KH, Địa chỉ đầy đủ (Bỏ tag tỉnh thành, Bỏ sản phẩm), Thời gian hẹn */}
                    <div className="p-3 space-y-2 text-[12.5px]">
                      {/* Dòng 1: Khách hàng */}
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <User className="text-gray-400 shrink-0" size={14} />
                        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                          <span className="font-bold text-gray-900 truncate">{customerName}</span>
                          {phone && <span className="text-gray-500 font-semibold text-xs shrink-0">({phone})</span>}
                        </div>
                      </div>

                      {/* Dòng 2: Địa chỉ - Hiện ĐẦY ĐỦ KHÔNG BỊ CẮT BỚT, KHÔNG CÓ TAG TỈNH THÀNH */}
                      <div className="flex items-start space-x-2.5 min-w-0 text-gray-700">
                        <MapPin className="text-blue-500 shrink-0 mt-0.5" size={14} />
                        <div className="flex-1 min-w-0">
                          <span className="leading-snug break-words text-xs text-gray-800 font-medium block">
                            {address}
                          </span>
                        </div>
                      </div>

                      {/* Dòng 3: Thời gian hẹn khách */}
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <Clock className={timeStatus.isOverdue ? "text-rose-500 shrink-0" : "text-amber-500 shrink-0"} size={14} />
                        {order.appointmentTime ? (
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span className="font-semibold text-gray-800">
                              Hẹn: {new Date(order.appointmentTime).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})} {new Date(order.appointmentTime).toLocaleDateString('vi-VN')}
                            </span>
                            <span className="text-gray-300">•</span>
                            <span className={`text-[11px] ${timeStatus.color}`}>
                              {timeStatus.text}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-xs">Chưa hẹn lịch</span>
                        )}
                      </div>

                      {/* Dòng điều hướng chi tiết */}
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-blue-600 font-medium">
                        <span>Chi tiết đơn hàng, linh kiện & thao tác</span>
                        <ChevronRight size={13} className="text-blue-500" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PullToRefresh>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200 bg-white text-[13px] text-gray-600 shadow-[0_-1px_2px_rgba(0,0,0,0.02)] z-10">
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
          <div className="flex items-center gap-1.5">
            <button
              className="p-1.5 border border-gray-300 rounded hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="p-1.5 border border-gray-300 rounded hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* POPUP FULL SCREEN CHI TIẾT ĐƠN HÀNG */}
      {selectedOrderDetail && (() => {
        const detailCustomerName = selectedOrderDetail.billFullName || selectedOrderDetail.customer?.fullName || 'Khách lẻ';
        const detailPhone = selectedOrderDetail.billPhoneNumber || selectedOrderDetail.customer?.phoneNumber || '';
        const detailAddress = selectedOrderDetail.shippingAddress?.full_address || selectedOrderDetail.customer?.fullAddress || 'Đang cập nhật';
        const detailProvince = 
          selectedOrderDetail.shippingAddress?.province_name || 
          selectedOrderDetail.shippingAddress?.province || 
          selectedOrderDetail.customer?.provinceName || 
          selectedOrderDetail.customer?.province || 
          (typeof selectedOrderDetail.rawData === 'string' ? JSON.parse(selectedOrderDetail.rawData)?.shipping_address?.province_name : selectedOrderDetail.rawData?.shipping_address?.province_name) ||
          '';

        // Tính toán trạng thái hẹn chuẩn xác (giờ/phút/giây trong ngày, số ngày nếu qua ngày)
        const detailTimeStatus = getAppointmentStatus(selectedOrderDetail.appointmentTime, now);

        return (
          <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col overflow-hidden animate-in fade-in duration-150">
            {/* 1. Header (Sticky Top) */}
            <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-3.5 py-2.5 flex items-center justify-between shadow-2xs">
              <div className="flex items-center space-x-2 min-w-0">
                <button
                  type="button"
                  onClick={closeOrderDetail}
                  className="p-1.5 text-gray-700 hover:text-blue-700 hover:bg-blue-50 rounded-xl active:scale-95 transition-all flex items-center gap-1 font-bold text-xs cursor-pointer border border-gray-200 shadow-2xs"
                >
                  <ChevronLeft size={18} />
                  <span>Quay lại</span>
                </button>
                <div className="h-4 w-px bg-gray-200 shrink-0" />
                <span className="text-[#1B3A6B] font-extrabold text-[15px] truncate">
                  {formatOrderId(selectedOrderDetail.pancakeOrderId)}
                </span>
                {getWorkTypeBadge(selectedOrderDetail.workType)}
              </div>

              {/* Trạng thái đơn hàng (Hiển thị trong chi tiết) */}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize shrink-0 ${
                selectedOrderDetail.adminStatus === 'đang thực hiện' 
                  ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                  : selectedOrderDetail.adminStatus === 'chờ duyệt'
                  ? 'bg-orange-50 text-orange-700 border border-orange-100'
                  : selectedOrderDetail.adminStatus === 'đang hoàn'
                  ? 'bg-purple-50 text-purple-700 border border-purple-100'
                  : selectedOrderDetail.adminStatus === 'đang đổi'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  : selectedOrderDetail.adminStatus === 'hoàn một phần'
                  ? 'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100'
                  : selectedOrderDetail.adminStatus === 'đã hoàn'
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : selectedOrderDetail.adminStatus === 'đã đổi'
                  ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-100'
              }`}>
                {selectedOrderDetail.adminStatus === 'đang thực hiện' ? 'đã phân công' : (selectedOrderDetail.adminStatus || 'chờ xử lý')}
              </span>
            </div>

            {/* 2. Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 pb-24">
              {/* Card Khách hàng & Địa chỉ (Có Tag Tỉnh Thành) */}
              <div className="bg-white rounded-2xl p-3.5 border border-blue-100 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={13} className="text-blue-600" />
                    <span>Khách hàng & Địa chỉ</span>
                  </span>
                  {detailPhone && (
                    <button
                      type="button"
                      onClick={() => handleCallCustomer(selectedOrderDetail.id, detailPhone)}
                      disabled={callingOrderId === selectedOrderDetail.id}
                      className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg font-bold text-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Phone size={12} />
                      <span>{detailPhone}</span>
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="font-bold text-gray-900 text-sm">
                    {detailCustomerName}
                  </div>
                  <div className="flex items-start gap-1.5 text-xs text-gray-700 leading-relaxed pt-1">
                    <MapPin size={14} className="text-blue-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="font-medium text-gray-800 break-words">{detailAddress}</span>
                      {detailProvince && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 shadow-2xs">
                            📍 {detailProvince}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {detailAddress && detailAddress !== 'Đang cập nhật' && (
                    <div className="pt-2 pl-5">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200/60 transition-colors"
                      >
                        <MapPin size={12} />
                        <span>Mở bản đồ chỉ đường</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Thời gian hẹn khách */}
              <div className="bg-white rounded-2xl p-3.5 border border-blue-100 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={13} className="text-amber-500" />
                    <span>Lịch hẹn phục vụ</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setRescheduleModalOrder(selectedOrderDetail)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-lg font-bold text-[11px] active:scale-95 transition-all cursor-pointer"
                  >
                    <Calendar size={12} />
                    <span>Hẹn lại</span>
                  </button>
                </div>

                {selectedOrderDetail.appointmentTime ? (
                  <div className="text-xs">
                    <span className="font-bold text-gray-900 text-sm">
                      {new Date(selectedOrderDetail.appointmentTime).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})} {new Date(selectedOrderDetail.appointmentTime).toLocaleDateString('vi-VN')}
                    </span>
                    <span className="text-gray-300 mx-1.5">•</span>
                    <span className={`text-[11px] ${detailTimeStatus.color}`}>
                      {detailTimeStatus.text}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 italic">Chưa đặt lịch hẹn</div>
                )}
              </div>

              {/* Card Sản phẩm & Linh kiện chi tiết (Hình ảnh to, Zoom Lightbox, Thu hộ) */}
              <div className="bg-white rounded-2xl p-3.5 border border-blue-100 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Package size={13} className="text-indigo-600" />
                    <span>Sản phẩm & Linh kiện ({selectedOrderDetail.items?.length || 0})</span>
                  </span>
                  {selectedOrderDetail.moneyToCollect > 0 && (
                    <span className="text-emerald-700 font-extrabold text-xs bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Thu: {selectedOrderDetail.moneyToCollect.toLocaleString('vi-VN')} đ
                    </span>
                  )}
                </div>

                {selectedOrderDetail.items && selectedOrderDetail.items.length > 0 ? (
                  <div className="space-y-2 divide-y divide-gray-100">
                    {selectedOrderDetail.items.map((item: any, itemIdx: number) => (
                      <div key={item.id || itemIdx} className={`flex items-center gap-3 min-w-0 ${itemIdx > 0 ? 'pt-2' : ''}`}>
                        {/* Thumbnail ảnh to + Lightbox */}
                        {item.imageUrl ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setLightboxImage({ url: item.imageUrl, name: item.productName }); }}
                            className="relative shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-gray-200 shadow-xs bg-gray-50 cursor-pointer group hover:border-blue-400 transition-colors"
                            title="Nhấn để phóng to ảnh"
                          >
                            <img src={item.imageUrl} alt={item.productName} className="w-full h-full object-cover" loading="lazy" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
                              <ZoomIn size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                            </div>
                          </button>
                        ) : (
                          <div className="shrink-0 w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center">
                            <Package size={20} className="text-gray-300" />
                          </div>
                        )}

                        {/* Tên SP + SKU + Số lượng */}
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-gray-800 break-words leading-relaxed text-xs block">{item.productName}</span>
                          {item.sku && <span className="text-[10px] text-gray-400 block mt-0.5">SKU: {item.sku}</span>}
                        </div>
                        <span className="text-gray-900 font-extrabold text-sm shrink-0 px-2 py-0.5 bg-gray-100 rounded-md">
                          x{item.quantity || 1}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 italic py-1">
                    {selectedOrderDetail.workType || 'Không có danh sách sản phẩm lẻ'}
                  </div>
                )}
              </div>

              {/* Card Ghi chú dặn dò */}
              <div className="bg-white rounded-2xl p-3.5 border border-blue-100 shadow-2xs space-y-2">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare size={13} className="text-blue-500" />
                  <span>Ghi chú từ điều phối</span>
                </span>
                <p className="italic text-xs text-gray-700 bg-amber-50/50 p-3 rounded-xl border border-amber-100 leading-relaxed whitespace-pre-wrap">
                  {selectedOrderDetail.note || 'Không có ghi chú dặn dò'}
                </p>
              </div>
            </div>

            {/* 3. Bottom Sticky Action Bar */}
            <div className="sticky bottom-0 z-20 bg-white border-t border-gray-200 p-3 shadow-lg flex items-center gap-2">
              {detailPhone ? (
                <button
                  type="button"
                  onClick={() => handleCallCustomer(selectedOrderDetail.id, detailPhone)}
                  disabled={callingOrderId === selectedOrderDetail.id}
                  className="flex-1 flex items-center justify-center space-x-1 py-2.5 px-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  <Phone size={14} />
                  <span>Gọi khách</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setRescheduleModalOrder(selectedOrderDetail)}
                className="flex-1 flex items-center justify-center space-x-1 py-2.5 px-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl font-bold text-xs transition-colors cursor-pointer active:scale-95"
              >
                <Calendar size={14} />
                <span>Hẹn lại</span>
              </button>

              {selectedOrderDetail.checkoutLink && (
                <button
                  type="button"
                  onClick={() => window.open(selectedOrderDetail.checkoutLink, '_blank', 'noopener,noreferrer')}
                  className="flex-1 flex items-center justify-center space-x-1 py-2.5 px-2 bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 rounded-xl font-bold text-xs transition-colors cursor-pointer active:scale-95"
                >
                  <CreditCard size={14} />
                  <span>Thanh toán</span>
                </button>
              )}

              {selectedOrderDetail.adminStatus === 'chờ duyệt' ? (
                <button
                  disabled
                  className="flex-1 flex items-center justify-center space-x-1 py-2.5 px-2 bg-gray-100 border border-gray-200 text-gray-400 rounded-xl font-bold text-xs cursor-not-allowed"
                >
                  <FileText size={14} />
                  <span>Chờ duyệt</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const ord = selectedOrderDetail;
                    closeOrderDetail();
                    navigate('/ktv/report', { state: { order: ord } });
                  }}
                  className="flex-[1.3] flex items-center justify-center space-x-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-colors cursor-pointer active:scale-95"
                >
                  <FileText size={14} />
                  <span>Báo cáo</span>
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Reschedule Modal */}
      {rescheduleModalOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl border max-w-md w-full overflow-hidden animate-fade-in">
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">Hẹn lại lịch dịch vụ #{rescheduleModalOrder.pancakeOrderId}</h3>
              <button 
                onClick={() => setRescheduleModalOrder(null)} 
                className="text-gray-400 hover:text-gray-600 outline-none text-xl font-medium"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleRescheduleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Thời gian hẹn mới *</label>
                <input
                  type="datetime-local"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                  value={newApptTime}
                  onChange={(e) => setNewApptTime(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Lý do hẹn lại *</label>
                <textarea
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Nhập lý do khách hàng yêu cầu hẹn lại lịch..."
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-[12px] text-amber-800">
                ⚠️ <strong>Lưu ý:</strong> Khi xác nhận hẹn lại lịch, dịch vụ này sẽ tự động chuyển trạng thái thành <strong>"Chờ xử lý"</strong>, gỡ bỏ phân công của bạn và chuyển trả ca về cho Admin xử lý lại.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleModalOrder(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                  disabled={resubmitLoading}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-md text-sm flex items-center gap-1.5"
                  disabled={resubmitLoading}
                >
                  {resubmitLoading ? 'Đang cập nhật...' : 'Xác nhận hẹn lại'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox xem ảnh sản phẩm full */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 animate-fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-2xl font-bold z-10"
            >
              &times;
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.name}
              className="w-full max-h-[70vh] object-contain rounded-xl shadow-2xl bg-white"
            />
            <p className="text-center text-white/90 text-sm font-semibold mt-3 px-2">
              {lightboxImage.name}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
