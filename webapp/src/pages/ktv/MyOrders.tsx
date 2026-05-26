import React, { useEffect, useState } from 'react';
import { getOrders } from '../../api/client';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

export default function MyOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('appointmentTime');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchOrdersData = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
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

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'chờ hàng': return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">Chờ hàng</span>;
      case 'ưu tiên xuất đơn': return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">Ưu tiên xuất đơn</span>;
      case 'xác nhận đơn hàng': return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">Xác nhận</span>;
      case 'đang đóng hàng': return <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">Đang đóng hàng</span>;
      case 'chờ chuyển hàng': return <span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded text-xs font-medium">Chờ chuyển hàng</span>;
      case 'gửi hàng đi': return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Gửi hàng đi</span>;
      case 'hủy đơn': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">Hủy đơn</span>;
      case 'đang thực hiện': return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">Cần hoàn thành</span>;
      default: return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">{status || 'Chưa cập nhật'}</span>;
    }
  };

  return (
    <div className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-[calc(100vh-80px)] font-sans">
      
      <div className="px-4 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">Đơn Hàng Được Giao</h2>
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
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 font-medium">{error}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Bạn chưa được giao đơn hàng nào</div>
        ) : (
          <table className="w-full text-left text-[13px] whitespace-nowrap">
            <thead className="sticky top-0 bg-[#f8f9fa] text-gray-600 font-semibold border-b border-gray-200 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3">Mã Đơn</th>
                <th className="px-4 py-3">Giờ Hẹn</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">SĐT</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Địa chỉ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order, idx) => {
                 const customerName = order.billFullName || order.customer?.fullName || 'Khách lẻ';
                 const phone = order.billPhoneNumber || order.customer?.phoneNumber || '';
                 const address = order.shippingAddress?.full_address || order.customer?.fullAddress || 'Đang cập nhật';
                 
                 return (
                  <tr key={order.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'} hover:bg-blue-50/50 transition-colors`}>
                    <td className="px-4 py-3 text-blue-600 font-medium">
                      #{order.pancakeOrderId}
                    </td>
                    <td className="px-4 py-3">
                      {order.appointmentTime ? (
                        (() => {
                          const apptDate = new Date(order.appointmentTime);
                          const isOverdue = apptDate < new Date();
                          return (
                            <div className="flex flex-col gap-1">
                              <div className={`font-medium ${isOverdue ? 'text-rose-600 font-semibold' : 'text-emerald-600'}`}>
                                {apptDate.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})} - {apptDate.toLocaleDateString('vi-VN')}
                              </div>
                              {isOverdue && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded w-max">
                                  ⚠️ Trễ hẹn
                                </span>
                              )}
                            </div>
                          );
                        })()
                      ) : <span className="text-gray-400 italic">Chưa hẹn</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[11px] shrink-0">
                          {customerName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-800 font-medium">{customerName}</span>
                          {order.note && (
                            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded font-normal inline-block mt-1 whitespace-normal break-words max-w-[250px]" title="Lời nhắn từ Pancake">
                              💬 {order.note}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">
                      {phone}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(order.adminStatus)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-normal break-words max-w-[300px]">
                      {address}
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
    </div>
  );
}
