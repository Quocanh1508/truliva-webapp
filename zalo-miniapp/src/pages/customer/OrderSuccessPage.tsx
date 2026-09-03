import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  PhoneCall, 
  MapPin, 
  QrCode, 
  Copy, 
  Check, 
  ChevronRight, 
  ShoppingBag, 
  ShieldCheck,
  Building2
} from 'lucide-react';

interface OrderSuccessPageProps {
  orderData: any;
  vietQrInfo?: any;
  onViewMyOrders: () => void;
  onContinueShopping: () => void;
}

export default function OrderSuccessPage({
  orderData,
  vietQrInfo,
  onViewMyOrders,
  onContinueShopping
}: OrderSuccessPageProps) {
  const [copiedMemo, setCopiedMemo] = useState(false);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const handleCopyMemo = () => {
    if (orderData?.orderCode) {
      navigator.clipboard.writeText(orderData.orderCode);
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-sans text-gray-800 animate-fade-in">
      {/* Top Success Banner */}
      <div className="bg-gradient-to-br from-[#1B3A6B] via-[#152e55] to-[#0B1E36] text-white pt-10 pb-8 px-4 text-center rounded-b-3xl relative overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#00A3FF]/15 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto mb-3 animate-bounce">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h1 className="text-xl font-black text-white tracking-tight">
          Đặt Hàng Thành Công!
        </h1>
        <p className="text-xs text-blue-200 mt-1 max-w-xs mx-auto leading-relaxed">
          Cảm ơn Quý khách đã tin tưởng lựa chọn giải pháp nước sạch chính hãng Truliva.
        </p>

        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-cyan-300 text-xs font-mono font-bold border border-white/15">
          <span>Mã đơn: {orderData?.orderCode || 'TRU-XXXXXX'}</span>
          <button onClick={handleCopyMemo} className="hover:text-white transition">
            {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 -mt-4">
        {/* VietQR Payment Card (if VIETQR selected) */}
        {vietQrInfo && (
          <div className="bg-white p-5 rounded-3xl border border-blue-200 shadow-md space-y-3 text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#1B3A6B] text-xs font-bold border border-blue-100">
              <QrCode className="w-4 h-4" />
              <span>Quét mã VietQR chuyển khoản tự động</span>
            </div>

            <div className="w-48 h-48 mx-auto bg-gray-50 p-2 rounded-2xl border border-gray-200 shadow-inner">
              <img src={vietQrInfo.qrUrl} alt="VietQR Code" className="w-full h-full object-contain" />
            </div>

            <div className="space-y-1.5 text-xs text-left bg-gray-50 p-3.5 rounded-2xl border border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-500">Ngân hàng:</span>
                <span className="font-bold text-gray-800">{vietQrInfo.bankCode} (MB Bank)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Số tài khoản:</span>
                <span className="font-bold text-blue-700 font-mono">{vietQrInfo.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tên thụ hưởng:</span>
                <span className="font-bold text-gray-800 uppercase">{vietQrInfo.accountName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Số tiền:</span>
                <span className="font-extrabold text-rose-600">{formatVND(vietQrInfo.amount)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                <span className="text-gray-500">Nội dung chuyển khoản:</span>
                <span className="font-bold text-gray-900 font-mono bg-white px-2 py-0.5 rounded-md border border-gray-200 flex items-center gap-1">
                  {vietQrInfo.memo}
                  <button onClick={handleCopyMemo}>
                    {copiedMemo ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-gray-400" />}
                  </button>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Order Details Card */}
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-3 text-xs">
          <div className="font-bold text-gray-900 text-xs uppercase tracking-wider pb-2 border-b border-gray-100">
            Chi Tiết Đơn Hàng
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Người nhận:</span>
              <span className="font-bold text-gray-800">{orderData?.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Số điện thoại:</span>
              <span className="font-semibold text-gray-800">{orderData?.customerPhone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Địa chỉ:</span>
              <span className="font-medium text-gray-800 text-right max-w-[200px]">{orderData?.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hình thức thanh toán:</span>
              <span className="font-bold text-[#1B3A6B]">
                {orderData?.paymentMethod === 'COD' ? 'Thanh toán khi KTV giao lắp (COD)' : 'Chuyển khoản VietQR'}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-100 items-baseline">
              <span className="font-bold text-gray-900">Tổng thanh toán:</span>
              <span className="font-black text-rose-600 text-base">{formatVND(orderData?.finalAmount || 0)}</span>
            </div>
          </div>
        </div>

        {/* Fulfillment Next-Steps Card */}
        <div className="bg-emerald-50/80 p-4 rounded-3xl border border-emerald-200/80 shadow-xs space-y-2 text-xs text-emerald-900">
          <div className="font-bold flex items-center gap-2 text-emerald-800">
            <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Quy Trình Giao Hàng & Lắp Đặt Kế Tiếp</span>
          </div>
          <p className="text-[11px] leading-relaxed text-emerald-800">
            1. Tổng đài viên & Kỹ thuật viên Truliva sẽ gọi điện cho Quý khách trong vòng <strong>2 giờ</strong> để xác nhận đơn và hẹn khung giờ lắp đặt thuận tiện nhất.
          </p>
          <p className="text-[11px] leading-relaxed text-emerald-800">
            2. KTV đến tận nhà giao máy, lắp đặt hoàn chỉnh và đo kiểm tra chỉ số TDS nước sạch trước sự chứng kiến của Quý khách.
          </p>
          <p className="text-[11px] leading-relaxed text-emerald-800">
            3. Ngay sau khi lắp đặt xong, hệ thống sẽ tự động kích hoạt bảo hành điện tử chính hãng và gửi tin nhắn Zalo ZNS xác nhận đến máy của Quý khách.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={onViewMyOrders}
            className="w-full h-12 rounded-2xl bg-[#1B3A6B] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 active:scale-98 transition"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Xem đơn hàng của tôi</span>
          </button>

          <button
            onClick={onContinueShopping}
            className="w-full h-12 rounded-2xl bg-white border border-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-98 transition shadow-xs"
          >
            <span>Tiếp tục mua sắm</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
