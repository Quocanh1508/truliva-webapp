import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrders, callCustomer, rescheduleOrder } from '../../api/client';
import { Search, ChevronLeft, ChevronRight, Phone, Calendar, FileText } from 'lucide-react';
import PullToRefresh from '../../components/PullToRefresh';

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
      setError('');
    } catch (err: any) {
      setError(err.message || 'Lỗi tải danh sách đơn hàng');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdersData();
  }, [page, sortBy, sortOrder]);

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
          ) : error ? (
            <div className="text-center py-12 text-red-500 font-medium">{error}</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Bạn chưa được giao dịch vụ nào</div>
          ) : (
            <table className="w-full text-left text-[13px] border-collapse">
              <thead className="sticky top-0 bg-[#f8f9fa] text-gray-600 font-semibold border-b border-gray-200 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 w-[100px] min-w-[100px]">Mã đơn</th>
                  <th className="px-4 py-3 w-[220px] min-w-[220px]">Khách hàng</th>
                  <th className="px-4 py-3 w-[350px] min-w-[350px]">Công việc</th>
                  <th className="px-4 py-3 min-w-[320px]">Ghi chú</th>
                  <th className="px-4 py-3 text-center w-[130px] min-w-[130px]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order, idx) => {
                   const customerName = order.billFullName || order.customer?.fullName || 'Khách lẻ';
                   const phone = order.billPhoneNumber || order.customer?.phoneNumber || '';
                   const address = order.shippingAddress?.full_address || order.customer?.fullAddress || 'Đang cập nhật';
                   
                   return (
                    <tr key={order.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-blue-50/50 transition-colors`}>
                      {/* Mã đơn */}
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col">
                          <span className="text-blue-600 font-semibold text-[14px]">#{order.pancakeOrderId}</span>
                          {getWorkTypeBadge(order.workType)}
                        </div>
                      </td>

                      {/* Khách hàng */}
                      <td className="px-4 py-3 align-top whitespace-normal break-words">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-gray-900 font-bold text-[13px]">{customerName}</span>
                          <span className="text-gray-700 font-semibold">{phone}</span>
                          <span className="text-gray-500 text-[11px] leading-tight">{address}</span>
                        </div>
                      </td>

                      {/* Công việc */}
                      <td className="px-4 py-3 align-top whitespace-normal break-words">
                        <div className="flex flex-col gap-1">
                          {/* Hẹn khách */}
                          {order.appointmentTime ? (
                            (() => {
                              const apptDate = new Date(order.appointmentTime);
                              const isOverdue = apptDate < new Date();
                              return (
                                <div className={`font-semibold text-[12px] flex items-center gap-1.5 ${isOverdue ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  📅 {apptDate.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})} - {apptDate.toLocaleDateString('vi-VN')}
                                  {isOverdue && (
                                    <span className="text-[10px] text-red-700 bg-red-50 border border-red-200 px-1 py-0.5 rounded font-bold">
                                      Trễ hẹn
                                    </span>
                                  )}
                                </div>
                              );
                            })()
                          ) : <span className="text-gray-400 italic">Chưa hẹn lịch</span>}

                          {/* Loại công việc & dịch vụ */}
                          <div className="text-[12px] text-gray-700 flex flex-wrap gap-x-1.5 gap-y-0.5 items-center mt-0.5">
                            <span className="font-semibold text-gray-800">Công việc:</span>
                            <span>{order.workType || 'Chưa cập nhật'}</span>
                            {order.serviceType && (
                              <>
                                <span className="text-gray-300">|</span>
                                <span className="font-semibold text-gray-800">Dịch vụ:</span>
                                <span className="text-blue-600 font-medium">{order.serviceType}</span>
                              </>
                            )}
                          </div>

                          {/* Sản phẩm */}
                          <div className="flex flex-col gap-0.5 mt-1 border-t border-gray-100 pt-1">
                            {order.items?.map((item: any, itemIdx: number) => (
                              <div key={item.id || itemIdx} className="text-[12px] text-gray-600">
                                • {item.productName} <span className="text-gray-900 font-bold">x{item.quantity || 1}</span>
                              </div>
                            ))}
                            {(!order.items || order.items.length === 0) && (
                              <span className="text-gray-400 italic">Không có sản phẩm</span>
                            )}
                          </div>

                          {/* Tiền cần thu */}
                          <div className="text-[12px] font-bold text-gray-800 mt-1">
                            Thu: <span className="text-amber-600">{order.moneyToCollect ? order.moneyToCollect.toLocaleString('vi-VN') + ' đ' : '0 đ'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Ghi chú */}
                      <td className="px-4 py-3 align-top whitespace-normal break-words text-gray-600 text-[12px]">
                        {order.note || <span className="text-gray-400 italic">Không có ghi chú</span>}
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3 align-top text-center">
                        <div className="flex items-center justify-center gap-2 mt-1">
                          {/* Gọi khách */}
                          {phone ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCallCustomer(order.id, phone); }}
                              disabled={callingOrderId === order.id}
                              className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-sm hover:shadow transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center shrink-0"
                              title="Gọi khách (Copy SĐT & quay số)"
                            >
                              <Phone size={14} />
                            </button>
                          ) : (
                            <div className="p-2 bg-gray-100 text-gray-400 rounded-full cursor-not-allowed shrink-0" title="Không có SĐT">
                              <Phone size={14} />
                            </div>
                          )}

                          {/* Khách hẹn lại */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setRescheduleModalOrder(order); }}
                            className="p-2 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center shrink-0"
                            title="Khách hẹn lại lịch"
                          >
                            <Calendar size={14} />
                          </button>

                          {/* Tạo báo cáo */}
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate('/ktv/report', { state: { order } }); }}
                            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center shrink-0"
                            title="Tạo báo cáo"
                          >
                            <FileText size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                   );
                })}
              </tbody>
            </table>
          )}
        </PullToRefresh>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200 bg-white text-[13px] text-gray-600 shadow-[0_-1px_2px_rgba(0,0,0,0.02)] z-10">
          <span>
            Trang <span className="font-medium text-gray-900">{page}</span> / <span className="font-medium text-gray-900">{totalPages}</span>
          </span>
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
