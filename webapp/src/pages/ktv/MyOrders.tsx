import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrders, callCustomer, rescheduleOrder } from '../../api/client';
import { Search, ChevronLeft, ChevronRight, Phone, Calendar, FileText, User, MapPin, Clock, MessageSquare, Wrench, CreditCard } from 'lucide-react';
import PullToRefresh from '../../components/PullToRefresh';
import { formatOrderId } from '../../utils/text';

export default function MyOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('search') || '';
  });
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
  const [callingOrderId, setCallingOrderId] = useState<string | null>(null);

  // Reschedule Modal state
  const [rescheduleModalOrder, setRescheduleModalOrder] = useState<any | null>(null);
  const [newApptTime, setNewApptTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [resubmitLoading, setResubmitLoading] = useState(false);

  const fetchOrdersData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await getOrders({
        page,
        limit: 20,
        search,
        sortBy,
        sortOrder
      });
      setOrders(res.orders);
      setTotalPages(res.pagination.totalPages);
      setTotalOrders(res.pagination.total || 0);
      setError('');
      
      // Cache the default view (first page, empty search)
      if (!search && page === 1) {
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
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
              {/* Banner thống kê đơn hàng */}
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
                <div className="bg-white/80 px-3 py-1.5 rounded-lg border border-blue-100 text-center shadow-xs">
                  <span className="text-lg font-black text-blue-600 block leading-tight">{totalOrders}</span>
                  <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wider block">đơn</span>
                </div>
              </div>

              {orders.map((order) => {
                const customerName = order.billFullName || order.customer?.fullName || 'Khách lẻ';
                const phone = order.billPhoneNumber || order.customer?.phoneNumber || '';
                const address = order.shippingAddress?.full_address || order.customer?.fullAddress || 'Đang cập nhật';
                
                // Tính toán thời gian hẹn và trạng thái
                let timeStatusText = '';
                let timeStatusColor = 'text-gray-500';
                let isOverdue = false;
                
                if (order.appointmentTime) {
                  const apptDate = new Date(order.appointmentTime);
                  const now = new Date();
                  isOverdue = apptDate < now;
                  
                  const diffTime = Math.abs(apptDate.getTime() - now.getTime());
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  
                  if (isOverdue) {
                    timeStatusText = `Đã trễ ${diffDays} ngày trước`;
                    timeStatusColor = 'text-rose-600 font-bold';
                  } else {
                    if (diffDays === 1) {
                      timeStatusText = 'Thời gian còn lại trong ngày';
                    } else {
                      timeStatusText = `Thời gian còn lại: ${diffDays} ngày tới`;
                    }
                    timeStatusColor = 'text-blue-600 font-medium';
                  }
                }
                
                const cardBg = 'bg-blue-50';
                const cardBorder = 'border-blue-200/60';
                const itemBg = 'bg-white';
                const itemBorder = 'border-blue-200/40';
                const noteBg = 'bg-white/80';
                const noteBorder = 'border-blue-200/40';
                
                return (
                  <div key={order.id} className={`border ${cardBorder} rounded-xl shadow-sm ${cardBg} p-4 flex flex-col space-y-3.5 hover:shadow transition-shadow`}>
                    {/* Header: Mã đơn + Trạng thái */}
                    <div className="flex justify-between items-center border-b border-gray-50 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-blue-800 font-extrabold text-[15px]">{formatOrderId(order.pancakeOrderId)}</span>
                        {getWorkTypeBadge(order.workType)}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${
                        order.adminStatus === 'đang thực hiện' 
                          ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                          : order.adminStatus === 'chờ duyệt'
                          ? 'bg-orange-50 text-orange-700 border border-orange-100'
                          : order.adminStatus === 'đang hoàn'
                          ? 'bg-purple-50 text-purple-700 border border-purple-100'
                          : order.adminStatus === 'đang đổi'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          : order.adminStatus === 'hoàn một phần'
                          ? 'bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100'
                          : order.adminStatus === 'đã hoàn'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : order.adminStatus === 'đã đổi'
                          ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {order.adminStatus === 'đang thực hiện' ? 'đã phân công' : (order.adminStatus || 'chờ xử lý')}
                      </span>
                    </div>

                    {/* Dòng 1: Khách hàng */}
                    <div className="flex items-start space-x-3 text-[13px]">
                      <User className="text-gray-400 mt-0.5 shrink-0" size={16} />
                      <div className="flex-1">
                        <span className="font-bold text-gray-900">{customerName}</span>
                        {phone && <span className="text-gray-600 font-semibold ml-2">({phone})</span>}
                      </div>
                    </div>

                    {/* Dòng 2: Địa chỉ */}
                    <div className="flex items-start space-x-3 text-[12.5px] text-gray-600">
                      <MapPin className="text-gray-400 mt-0.5 shrink-0" size={16} />
                      <span className="leading-relaxed">{address}</span>
                    </div>

                    {/* Dòng 3: Hẹn khách */}
                    <div className="flex items-start space-x-3 text-[12.5px]">
                      <Clock className="text-gray-400 mt-0.5 shrink-0" size={16} />
                      <div className="flex-1">
                        {order.appointmentTime ? (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-gray-800">
                              Hẹn khách lúc {new Date(order.appointmentTime).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})} {new Date(order.appointmentTime).toLocaleDateString('vi-VN')}
                            </div>
                            <div className={`text-xs ${timeStatusColor}`}>
                              {timeStatusText}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Chưa hẹn lịch</span>
                        )}
                      </div>
                    </div>

                    {/* Dòng 4: Công việc / Sản phẩm */}
                    <div className="flex items-start space-x-3 text-[12.5px] text-gray-700">
                      <Wrench className="text-gray-400 mt-0.5 shrink-0" size={16} />
                      <div className="flex-1 space-y-1 min-w-0">
                        <div>
                          <span className="font-semibold text-gray-800">Loại: </span>
                          <span>{order.serviceType && order.serviceType !== 'Công việc đã bao gồm dịch vụ' ? `${order.workType} (${order.serviceType})` : order.workType}</span>
                        </div>
                        {order.items && order.items.length > 0 && (
                          <div className={`${itemBg} border ${itemBorder} rounded-lg p-2 mt-1 space-y-1 text-xs text-gray-600`}>
                            {order.items.map((item: any, itemIdx: number) => (
                              <div key={item.id || itemIdx} className="flex justify-between min-w-0">
                                <span className="font-medium pr-2 break-words leading-relaxed">• {item.productName}</span>
                                <span className="text-gray-900 font-bold shrink-0">x{item.quantity || 1}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {order.moneyToCollect > 0 && (
                          <div className="text-emerald-700 font-bold text-xs mt-1">
                            Thu hộ: {order.moneyToCollect.toLocaleString('vi-VN')} đ
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dòng 5: Ghi chú */}
                    <div className={`flex items-start space-x-3 text-[12.5px] text-gray-500 ${noteBg} rounded-lg p-2 border border-dashed ${noteBorder}`}>
                      <MessageSquare className="text-gray-400 mt-0.5 shrink-0" size={15} />
                      <span className="italic whitespace-pre-wrap leading-relaxed">{order.note || 'Không có ghi chú'}</span>
                    </div>

                    {/* Thanh thao tác nhanh ở dưới cùng Card */}
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-100">
                      {/* Gọi điện */}
                      {phone ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCallCustomer(order.id, phone); }}
                          disabled={callingOrderId === order.id}
                          className="flex items-center justify-center space-x-1.5 py-2 px-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <Phone size={13} />
                          <span>Gọi khách</span>
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex items-center justify-center space-x-1.5 py-2 px-1 bg-gray-50 border border-gray-100 text-gray-400 rounded-lg font-semibold text-xs cursor-not-allowed"
                        >
                          <Phone size={13} />
                          <span>Không SĐT</span>
                        </button>
                      )}

                      {/* Hẹn lại */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setRescheduleModalOrder(order); }}
                        className="flex items-center justify-center space-x-1.5 py-2 px-1 bg-amber-50 hover:bg-amber-100 border border-amber-100 text-amber-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                      >
                        <Calendar size={13} />
                        <span>Hẹn lại</span>
                      </button>

                      {/* Thanh toán */}
                      {order.checkoutLink ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); window.open(order.checkoutLink, '_blank', 'noopener,noreferrer'); }}
                          className="flex items-center justify-center space-x-1.5 py-2 px-1 bg-violet-50 hover:bg-violet-100 border border-violet-100 text-violet-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                        >
                          <CreditCard size={13} />
                          <span>Thanh toán</span>
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex items-center justify-center space-x-1.5 py-2 px-1 bg-gray-50 border border-gray-100 text-gray-400 rounded-lg font-semibold text-xs cursor-not-allowed"
                        >
                          <CreditCard size={13} />
                          <span>Chưa có link</span>
                        </button>
                      )}

                      {/* Tạo báo cáo */}
                      {order.adminStatus === 'chờ duyệt' ? (
                        <button
                          disabled
                          className="flex items-center justify-center space-x-1.5 py-2 px-1 bg-gray-100 border border-gray-200 text-gray-400 rounded-lg font-semibold text-xs cursor-not-allowed"
                        >
                          <FileText size={13} />
                          <span>Đang chờ duyệt</span>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate('/ktv/report', { state: { order } }); }}
                          className="flex items-center justify-center space-x-1.5 py-2 px-1 bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
                        >
                          <FileText size={13} />
                          <span>Báo cáo</span>
                        </button>
                      )}
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

      {/* Reschedule Modal */}
      {rescheduleModalOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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

    </div>
  );
}
