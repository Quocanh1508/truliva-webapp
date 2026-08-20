import React from 'react';
import { 
  User, 
  Phone, 
  ShieldCheck, 
  Wrench, 
  QrCode, 
  Star, 
  Ticket, 
  History, 
  HelpCircle, 
  ChevronRight, 
  LogOut,
  Droplets,
  Calendar,
  MessageSquare
} from 'lucide-react';

interface CustomerProfileProps {
  user: any;
  mySerials: any[];
  onLogout?: () => void;
  onOpenScanner?: () => void;
}

export default function CustomerProfile({ user, mySerials, onLogout, onOpenScanner }: CustomerProfileProps) {
  const userName = user?.fullName || 'Khách hàng Truliva';
  const userPhone = user?.phoneNumber || 'Chưa cập nhật SĐT';

  return (
    <div className="pb-20 bg-slate-50 min-h-screen">
      {/* 1. Header Profile Card (P3R Ocean Depth) */}
      <div className="bg-gradient-to-b from-[#061226] via-[#0B2545] to-[#0F3866] text-white p-5 pt-8 pb-10 rounded-b-[2.2rem] shadow-xl relative overflow-hidden">
        {/* Floating Realistic Water Bubbles */}
        <div className="water-bubble w-4 h-4 left-[8%] bottom-1 bubble-anim-1"></div>
        <div className="water-bubble w-6 h-6 left-[22%] bottom-2 bubble-anim-2"></div>
        <div className="water-bubble w-3.5 h-3.5 left-[50%] bottom-1 bubble-anim-3"></div>
        <div className="water-bubble w-5 h-5 left-[75%] bottom-3 bubble-anim-4"></div>
        <div className="water-bubble w-4 h-4 left-[90%] bottom-2 bubble-anim-5"></div>

        <div className="max-w-md mx-auto space-y-4 relative z-10">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-[#0B2545] border-2 border-[#00D2FF] ring-2 ring-[#00D2FF]/40 flex items-center justify-center text-white font-black text-xl shadow-[0_0_18px_rgba(0,210,255,0.45)] overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User size={32} className="text-cyan-200" />
                )}
              </div>
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-[#00D2FF] border-2 border-[#061226] rounded-full"></span>
            </div>
            
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-white truncate drop-shadow-sm">{userName}</h1>
              <p className="text-xs text-sky-200 flex items-center mt-0.5 font-medium">
                <Phone size={12} className="mr-1 flex-shrink-0 text-[#00D2FF]" />
                {userPhone}
              </p>
              <div className="mt-2 inline-block p3r-slanted-badge bg-gradient-to-r from-[#00D2FF]/20 to-[#0284C7]/40 border border-[#00D2FF]/60 px-3 py-0.5 text-[9px] font-black text-cyan-200 uppercase tracking-wider shadow-[0_0_10px_rgba(0,210,255,0.3)]">
                <div className="flex items-center space-x-1.5">
                  <Star size={11} className="fill-[#00D2FF] text-[#00D2FF]" />
                  <span>Thành viên Bạc (250 Điểm)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Grid (P3R HUD Panel) */}
          <div className="grid grid-cols-3 gap-2 bg-white/10 backdrop-blur-md rounded-2xl p-3.5 text-center border border-white/15 text-xs shadow-inner">
            <div>
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold">Thiết bị</p>
              <p className="font-black text-white text-base mt-0.5">{(mySerials || []).length}</p>
            </div>
            <div className="border-x border-white/15">
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold">Điểm thưởng</p>
              <p className="font-black text-[#00D2FF] text-base mt-0.5 drop-shadow-xs">250</p>
            </div>
            <div>
              <p className="text-[9px] text-sky-200 uppercase tracking-wider font-bold">Voucher</p>
              <p className="font-black text-cyan-200 text-base mt-0.5">2</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 mt-4 space-y-4">
        
        {/* 2. Section Máy lọc nước của tôi */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Máy lọc nước của tôi ({(mySerials || []).length})
            </h2>
            <button 
              onClick={onOpenScanner}
              className="text-xs text-[#0284C7] font-bold flex items-center hover:underline cursor-pointer"
            >
              <QrCode size={14} className="mr-1" />
              Thêm máy
            </button>
          </div>

          {!mySerials || mySerials.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl text-center text-xs text-slate-400 border border-slate-200/80 shadow-sm space-y-2">
              <Droplets size={32} className="mx-auto text-sky-300" />
              <p>Bạn chưa liên kết máy lọc nước nào với tài khoản Zalo này.</p>
              <button 
                onClick={onOpenScanner}
                className="px-4 py-2 bg-[#1B3A6B] hover:bg-[#2563EB] text-white font-bold rounded-xl text-xs shadow-sm transition-colors cursor-pointer"
              >
                Quét mã QR trên máy ngay
              </button>
            </div>
          ) : (
            (mySerials || []).map((s) => (
              <div key={s.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      {s.status || 'Đang hoạt động'}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{s.model || 'Máy lọc nước Truliva RO'}</h3>
                    <p className="text-xs font-mono text-[#0284C7] mt-0.5">Serial: {s.serialNumber}</p>
                  </div>
                  <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl">
                    <ShieldCheck size={20} />
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl text-xs space-y-2 border border-slate-100">
                  <div className="flex justify-between text-[11px] text-slate-600">
                    <span className="flex items-center"><Calendar size={12} className="mr-1 text-slate-400" />Hạn bảo hành:</span>
                    <span className="font-bold text-slate-800">
                      {s.warrantyExpiryDate ? new Date(s.warrantyExpiryDate).toLocaleDateString('vi-VN') : '12 Tháng'}
                    </span>
                  </div>

                  {/* Filter Health Bar */}
                  <div>
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-semibold">
                      <span>Tuổi thọ lõi lọc thô số 1</span>
                      <span className="text-[#0284C7] font-bold">Còn 85%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-[#0284C7] h-full w-[85%] rounded-full"></div>
                    </div>
                  </div>
                </div>

                <button className="w-full py-2.5 bg-sky-50 hover:bg-sky-100 text-[#0284C7] rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-1 cursor-pointer">
                  <Wrench size={14} />
                  <span>Đặt lịch KTV bảo trì / Thay lõi 1-Click</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* 3. Utility Actions List */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 text-xs">
          
          <button className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-cyan-50 text-cyan-700 rounded-xl">
                <Ticket size={18} />
              </div>
              <span>Ưu đãi & Voucher của tôi (2)</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </button>

          <button className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 transition-colors cursor-pointer">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-sky-50 text-[#0284C7] rounded-xl">
                <History size={18} />
              </div>
              <span>Lịch sử bảo trì & Thay lõi</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </button>

          <a 
            href="tel:19006368"
            className="w-full p-3.5 flex items-center justify-between text-slate-800 font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-50 text-blue-700 rounded-xl">
                <MessageSquare size={18} />
              </div>
              <span>Hỗ trợ & Chat Zalo OA</span>
            </div>
            <ChevronRight size={16} className="text-slate-400" />
          </a>

        </div>

        {/* Log out */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
          >
            <LogOut size={16} />
            <span>Đăng xuất khỏi Mini App</span>
          </button>
        )}
      </div>
    </div>
  );
}
