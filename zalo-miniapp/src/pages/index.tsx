import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Wrench, 
  QrCode, 
  Clock, 
  CheckCircle2, 
  PhoneCall, 
  MapPin, 
  Activity,
  AlertTriangle,
  RefreshCw,
  FileText,
  User
} from 'lucide-react';
import { fetchZaloApi } from '../api/client';

export default function IndexPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [mySerials, setMySerials] = useState<any[]>([]);
  const [ktvOrders, setKtvOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Dev simulation state
  const [testPhone, setTestPhone] = useState('0915185982');

  const authenticateWithZalo = async (phoneToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchZaloApi('/zalo-miniapp/auth', {
        method: 'POST',
        body: JSON.stringify({
          phoneToken,
          zaloProfile: {
            name: 'Người dùng Zalo',
            avatar: ''
          }
        })
      });

      if (data.success) {
        localStorage.setItem('zalo_session_token', data.token);
        setUser(data.user);
        loadUserContent(data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi xác thực Zalo');
    } finally {
      setLoading(false);
    }
  };

  const loadUserContent = async (currentUser: any) => {
    try {
      if (currentUser.role === 'KTV') {
        const res = await fetchZaloApi('/zalo-miniapp/ktv-orders');
        if (res.success) setKtvOrders(res.orders || []);
      } else {
        const res = await fetchZaloApi('/zalo-miniapp/my-serials');
        if (res.success) setMySerials(res.serials || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    // Tự động thử nghiệm đăng nhập từ môi trường Zalo Mini App
    authenticateWithZalo(testPhone);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 font-sans max-w-md mx-auto">
      {/* Top Banner Zalo Mini App Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-2xl shadow-md mb-4 flex justify-between items-center">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider bg-blue-500/50 px-2 py-0.5 rounded-full text-blue-100">
            Truliva Zalo Mini App
          </span>
          <h1 className="text-lg font-bold mt-1">Hệ Thống Dịch Vụ Truliva</h1>
          {user && (
            <p className="text-xs text-blue-100 flex items-center mt-0.5">
              <User size={12} className="mr-1" />
              {user.fullName} ({user.role === 'KTV' ? 'Kỹ Thuật Viên' : 'Khách Hàng'})
            </p>
          )}
        </div>
        <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-xl text-white">
          <ShieldCheck size={28} />
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="bg-white p-6 rounded-2xl shadow-sm text-center space-y-3">
          <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto" />
          <p className="text-xs font-semibold text-slate-600">Đang kết nối tài khoản Zalo...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-2xl text-xs text-red-700 space-y-2 mb-4">
          <div className="flex items-center space-x-1.5 font-bold">
            <AlertTriangle size={16} />
            <span>Thông báo từ hệ thống Truliva</span>
          </div>
          <p>{error}</p>
        </div>
      )}

      {/* GIAO DIỆN DÀNH CHO KỸ THUẬT VIÊN (KTV) */}
      {!loading && user && user.role === 'KTV' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl flex items-center justify-between text-xs text-blue-900">
            <div>
              <p className="font-bold">Giao diện Ca Đi Ca KTV</p>
              <p className="text-[11px] text-blue-700">Trạm: {user.techStation?.name || 'Truliva'}</p>
            </div>
            <span className="bg-blue-600 text-white px-2.5 py-1 rounded-full font-bold text-[11px]">
              {ktvOrders.length} Ca chưa xong
            </span>
          </div>

          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Ca dịch vụ được gán cho bạn</h2>

          {ktvOrders.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl text-center text-xs text-slate-400 border border-slate-200">
              Bạn hiện tại không có ca dịch vụ nào chờ xử lý.
            </div>
          ) : (
            ktvOrders.map((order) => (
              <div key={order.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      {order.code || 'Đơn hàng'}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{order.customerName}</h3>
                  </div>
                  <a
                    href={`tel:${order.customerPhone}`}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                  >
                    <PhoneCall size={18} />
                  </a>
                </div>

                <div className="text-xs space-y-1 text-slate-600 border-t pt-2 border-slate-100">
                  <p className="flex items-center text-slate-700">
                    <MapPin size={14} className="mr-1.5 text-slate-400 flex-shrink-0" />
                    {order.customerAddress || 'Chưa có địa chỉ'}
                  </p>
                  <p className="flex items-center text-slate-500 text-[11px]">
                    <Clock size={14} className="mr-1.5 text-slate-400 flex-shrink-0" />
                    Hẹn lúc: {order.scheduledDate ? new Date(order.scheduledDate).toLocaleString('vi-VN') : 'Hôm nay'}
                  </p>
                </div>

                <div className="pt-1 flex gap-2">
                  <button className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1 hover:bg-blue-700">
                    <FileText size={14} />
                    <span>Nộp báo cáo ca</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* GIAO DIỆN DÀNH CHO KHÁCH HÀNG (CUSTOMER) */}
      {!loading && user && user.role !== 'KTV' && (
        <div className="space-y-4">
          {/* Nút Quét QR Code Kích hoạt bảo hành */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm text-center space-y-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-full w-12 h-12 flex items-center justify-center mx-auto">
              <QrCode size={24} />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">Quét mã QR Bảo Hành Máy</h2>
              <p className="text-xs text-slate-500 mt-0.5">Dán mã QR trên máy lọc nước Truliva để xem bảo hành</p>
            </div>
            <button className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm">
              Mở Camera quét mã QR
            </button>
          </div>

          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Máy lọc nước của tôi ({mySerials.length})</h2>

          {mySerials.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl text-center text-xs text-slate-400 border border-slate-200">
              Bạn chưa có máy lọc nước nào được liên kết với số điện thoại Zalo này.
            </div>
          ) : (
            mySerials.map((s) => (
              <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      {s.status}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{s.model || 'Máy lọc nước Truliva'}</h3>
                    <p className="text-xs font-mono text-blue-600 mt-0.5">Serial: {s.serialNumber}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-2">
                  <div className="flex justify-between text-[11px] text-slate-600">
                    <span>Hạn bảo hành:</span>
                    <span className="font-semibold text-slate-800">
                      {s.warrantyExpiryDate ? new Date(s.warrantyExpiryDate).toLocaleDateString('vi-VN') : '12 Tháng'}
                    </span>
                  </div>

                  {/* Lifespan bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-semibold">
                      <span>Độ sạch lõi lọc thô số 1</span>
                      <span className="text-emerald-600">Còn 85%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-[85%] rounded-full"></div>
                    </div>
                  </div>
                </div>

                <button className="w-full py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors">
                  Đặt lịch KTV bảo trì / Thay lõi 1-Click
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
