import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  Truck, 
  PhoneCall, 
  ChevronRight, 
  AlertCircle,
  RotateCcw,
  Package,
  Calendar
} from 'lucide-react';
import { fetchZaloApi } from '../../api/client';
import { openPhone } from 'zmp-sdk/apis';

interface MyOrdersPageProps {
  user: any;
  onBack: () => void;
  onExploreProducts: () => void;
}

export default function MyOrdersPage({ user, onBack, onExploreProducts }: MyOrdersPageProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const phone = user?.phoneNumber || '';
      const res = await fetchZaloApi(`/zalo-miniapp/shop/my-orders?phone=${encodeURIComponent(phone)}`);
      if (res && res.success) {
        setOrders(res.orders || []);
      }
    } catch (err) {
      console.error('Error loading my orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [user]);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { label: 'Chờ xác nhận', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'CONFIRMED':
        return { label: 'Đã xác nhận', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'PROCESSING':
        return { label: 'Đang chuẩn bị hàng', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
      case 'SHIPPING':
        return { label: 'Đang giao & Lắp đặt', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'COMPLETED':
        return { label: 'Giao lắp hoàn thành', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'CANCELLED':
        return { label: 'Đã hủy', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      default:
        return { label: 'Đang xử lý', color: 'bg-gray-50 text-gray-700 border-gray-200' };
    }
  };

  const handleCallHotline = () => {
    try {
      openPhone({ phoneNumber: '1900638463' });
    } catch {
      window.location.href = 'tel:1900638463';
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-sans text-gray-800 animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-gray-100 flex items-center justify-between shadow-2xs">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-sm text-gray-900">
          Đơn Hàng Của Tôi ({orders.length})
        </h1>
        <button 
          onClick={handleCallHotline}
          className="w-9 h-9 rounded-full bg-blue-50 text-[#1B3A6B] flex items-center justify-center"
          title="Gọi Hotline hỗ trợ"
        >
          <PhoneCall className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="py-20 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-3 border-[#1B3A6B] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-medium text-gray-500">Đang tải lịch sử đơn mua...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl border border-gray-200 p-6 shadow-xs">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <h4 className="font-bold text-gray-800 text-sm">Bạn chưa có đơn mua nào</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto mb-5 leading-relaxed">
              Hãy sắm ngay máy lọc nước thông minh Truliva với chính sách miễn phí giao lắp và bảo hành điện tử chính hãng.
            </p>
            <button
              onClick={onExploreProducts}
              className="px-6 py-2.5 rounded-xl bg-[#1B3A6B] text-white text-xs font-bold shadow-xs active:scale-95 transition"
            >
              Xem sản phẩm ngay
            </button>
          </div>
        ) : (
          orders.map(order => {
            const badge = getStatusBadge(order.orderStatus);
            return (
              <div
                key={order.id}
                className="bg-white rounded-3xl p-4 border border-gray-100 shadow-xs space-y-3"
              >
                {/* Order Top Line */}
                <div className="flex items-center justify-between text-xs pb-2 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-gray-900">
                      {order.orderCode}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(order.createdAt).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Items preview */}
                <div className="space-y-2">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2.5 text-xs">
                      <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                        <img
                          src={item.product?.images?.[0] || 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&auto=format&fit=crop&q=80'}
                          alt={item.productName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-gray-900 text-xs line-clamp-1">
                          {item.productName}
                        </h4>
                        <div className="text-[11px] text-gray-400">
                          SL: {item.quantity} • {formatVND(item.unitPrice)}
                        </div>
                      </div>
                      <div className="font-extrabold text-gray-800 text-xs">
                        {formatVND(item.totalPrice)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order Total & Actions */}
                <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="text-gray-500">Tổng tiền: </span>
                    <span className="font-black text-rose-600 text-sm">{formatVND(order.finalAmount)}</span>
                  </div>

                  <button
                    onClick={handleCallHotline}
                    className="px-3 py-1.5 rounded-xl bg-blue-50 text-[#1B3A6B] text-xs font-bold flex items-center gap-1 hover:bg-blue-100 transition"
                  >
                    <PhoneCall className="w-3 h-3" />
                    <span>Hỗ trợ</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
