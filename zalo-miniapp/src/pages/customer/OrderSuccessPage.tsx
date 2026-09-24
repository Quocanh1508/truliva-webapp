import React, { useState, useEffect } from 'react';
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
  Building2,
  RefreshCw,
  Banknote,
  AlertCircle,
  Truck,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { fetchZaloApi } from '../../api/client';

interface OrderSuccessPageProps {
  orderData: any;
  vietQrInfo?: any;
  onViewMyOrders: () => void;
  onContinueShopping: () => void;
}

export default function OrderSuccessPage({
  orderData: initialOrderData,
  vietQrInfo,
  onViewMyOrders,
  onContinueShopping
}: OrderSuccessPageProps) {
  const [order, setOrder] = useState<any>(initialOrderData);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [paid, setPaid] = useState(initialOrderData?.paymentStatus === 'PAID');
  const [checking, setChecking] = useState(false);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  const [switchingCod, setSwitchingCod] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const formatVND = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const handleCopyMemo = () => {
    const code = order?.orderCode || vietQrInfo?.memo;
    if (code) {
      navigator.clipboard.writeText(code);
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 2000);
    }
  };

  const handleCopyAccount = () => {
    const acc = vietQrInfo?.accountNumber || '8318892577';
    navigator.clipboard.writeText(acc);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  // Kiểm tra trạng thái thanh toán từ backend
  const checkPaymentStatus = async (showNotice = true) => {
    if (!order?.orderCode) return;
    setChecking(true);
    if (showNotice) setCheckNotice(null);

    try {
      const res = await fetchZaloApi(`/zalo-miniapp/shop/orders/${order.orderCode}`);
      if (res && res.success && res.order) {
        setOrder(res.order);
        if (res.order.paymentStatus === 'PAID') {
          setPaid(true);
          setCheckNotice('Đã xác nhận thanh toán thành công!');
        } else if (showNotice) {
          setCheckNotice('Chưa nhận được giao dịch cho mã đơn này. Nếu Quý khách vừa chuyển, vui lòng đợi 30-60 giây để ngân hàng gửi thông báo, sau đó bấm kiểm tra lại.');
        }
      }
    } catch (e) {
      console.warn('Check payment status error', e);
      if (showNotice) {
        setCheckNotice('Chưa thể kết nối tới máy chủ ngân hàng, vui lòng thử lại sau.');
      }
    } finally {
      setChecking(false);
    }
  };

  // Tự động polling kiểm tra mỗi 4 giây nếu đang chờ thanh toán VietQR
  useEffect(() => {
    if (!vietQrInfo || paid || order?.paymentMethod === 'COD') return;

    const interval = setInterval(() => {
      checkPaymentStatus(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [vietQrInfo, paid, order?.orderCode, order?.paymentMethod]);

  // Chuyển sang phương thức COD nếu khách hàng đổi ý
  const handleSwitchToCod = async () => {
    if (!order?.orderCode) return;
    setSwitchingCod(true);
    try {
      const res = await fetchZaloApi(`/zalo-miniapp/shop/orders/${order.orderCode}/switch-to-cod`, {
        method: 'POST'
      });
      if (res && res.success && res.order) {
        setOrder(res.order);
      }
    } catch (err) {
      console.error('Error switching to COD', err);
    } finally {
      setSwitchingCod(false);
    }
  };

  // Giả lập xác nhận thanh toán thành công (dành cho thử nghiệm Sandbox/Demo)
  const handleSimulatePayment = async () => {
    if (!order?.orderCode) return;
    setSimulating(true);
    try {
      const res = await fetchZaloApi(`/zalo-miniapp/shop/orders/${order.orderCode}/confirm-payment`, {
        method: 'POST'
      });
      if (res && res.success && res.order) {
        setOrder(res.order);
        setPaid(true);
      }
    } catch (err) {
      console.error('Simulate payment error', err);
    } finally {
      setSimulating(false);
    }
  };

  // Phân định rõ 2 trạng thái:
  // 1. Đang chờ chuyển khoản (isWaitingForPayment = true): khách chọn VietQR và CHƯA thanh toán
  // 2. Đã xác nhận (isWaitingForPayment = false): đã thanh toán thành công HOẶC chọn COD
  const isWaitingForPayment = !!vietQrInfo && !paid && order?.paymentMethod === 'VIETQR';

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-sans text-gray-800 animate-fade-in">
      
      {/* ==================== TOP BANNER ==================== */}
      <div className={`text-white pt-8 pb-7 px-4 text-center rounded-b-3xl relative overflow-hidden shadow-lg transition-all duration-300 ${
        isWaitingForPayment 
          ? 'bg-gradient-to-br from-[#1B3A6B] via-[#1A2E4C] to-[#0A192F]'
          : 'bg-gradient-to-br from-[#0F352E] via-[#134E4A] to-[#1B3A6B]'
      }`}>
        <div className="absolute top-0 right-0 w-48 h-48 bg-[#00A3FF]/15 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

        {isWaitingForPayment ? (
          // Icon & Tiêu đề cho luồng: ĐANG CHỜ CHUYỂN KHOẢN
          <>
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400/80 text-amber-300 flex items-center justify-center mx-auto mb-3 shadow-[0_0_25px_rgba(245,158,11,0.25)]">
              <Clock className="w-9 h-9 animate-pulse" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-300 text-[11px] font-bold mb-1.5">
              <span>ĐANG CHỜ THANH TOÁN (VIETQR)</span>
            </div>

            <h1 className="text-xl font-black text-white tracking-tight">
              Thanh Toán Đơn Hàng
            </h1>
            <p className="text-xs text-blue-100 mt-1 max-w-xs mx-auto leading-relaxed">
              Quý khách vui lòng quét mã VietQR Techcombank bên dưới để hoàn tất xác nhận đơn hàng.
            </p>
          </>
        ) : (
          // Icon & Tiêu đề cho luồng: ĐÃ THANH TOÁN HOẶC COD
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/25 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto mb-3 shadow-[0_0_30px_rgba(16,185,129,0.35)] animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-300 text-[11px] font-bold mb-1.5">
              <Sparkles className="w-3 h-3" />
              <span>{paid ? 'ĐÃ XÁC NHẬN THANH TOÁN' : 'ĐÃ GHI NHẬN ĐƠN HÀNG'}</span>
            </div>

            <h1 className="text-xl font-black text-white tracking-tight">
              {paid ? 'Đặt Hàng & Thanh Toán Thành Công!' : 'Đặt Hàng Thành Công!'}
            </h1>
            <p className="text-xs text-emerald-100 mt-1 max-w-xs mx-auto leading-relaxed">
              {paid 
                ? 'Hệ thống Truliva đã nhận đủ tiền thanh toán qua Techcombank. Đơn hàng đã được xác nhận chính thức!' 
                : 'Cảm ơn Quý khách đã tin tưởng lựa chọn giải pháp nước sạch chính hãng Truliva.'}
            </p>
          </>
        )}

        {/* Mã đơn hàng */}
        <div className="mt-3.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-cyan-200 text-xs font-mono font-bold border border-white/15 backdrop-blur-xs">
          <span>Mã đơn: {order?.orderCode || 'TRU-XXXXXX'}</span>
          <button onClick={handleCopyMemo} className="hover:text-white transition cursor-pointer">
            {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ==================== NỘI DUNG CHÍNH ==================== */}
      <div className="p-4 space-y-4 -mt-3">

        {/* ==================== 1. THẺ VIETQR (CHỈ HIỂN THỊ KHI CHỜ THANH TOÁN) ==================== */}
        {isWaitingForPayment && (
          <div className="bg-white p-5 rounded-3xl border border-blue-200 shadow-md space-y-4 text-center">
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-sky-50 text-[#1B3A6B] text-xs font-bold border border-sky-100">
              <QrCode className="w-4 h-4 text-[#00A3FF]" />
              <span>Quét mã VietQR chuyển khoản Techcombank</span>
            </div>

            {/* Ảnh mã VietQR */}
            <div className="w-56 h-56 mx-auto bg-white p-2.5 rounded-2xl border-2 border-slate-200 shadow-inner flex items-center justify-center">
              <img 
                src={vietQrInfo.qrUrl} 
                alt="Techcombank VietQR Code" 
                className="w-full h-full object-contain" 
              />
            </div>

            {/* Thông tin chuyển khoản chi tiết có nút copy */}
            <div className="space-y-2.5 text-xs text-left bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Ngân hàng:</span>
                <span className="font-bold text-gray-800">Techcombank (TCB)</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500">Số tài khoản:</span>
                <span className="font-extrabold text-[#1B3A6B] font-mono text-sm flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  {vietQrInfo.accountNumber || '8318892577'}
                  <button onClick={handleCopyAccount} className="text-blue-600 hover:text-blue-800 cursor-pointer p-0.5">
                    {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500">Tên thụ hưởng:</span>
                <span className="font-bold text-gray-800 uppercase text-[11px] text-right">
                  {vietQrInfo.accountName || 'CT TNHH TM VA DV PURE VITA'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-gray-500">Số tiền:</span>
                <span className="font-black text-rose-600 text-sm">
                  {formatVND(vietQrInfo.amount || order?.finalAmount || 0)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-gray-500">Nội dung CK:</span>
                <span className="font-bold text-gray-900 font-mono bg-white px-2 py-0.5 rounded-md border border-gray-300 flex items-center gap-1">
                  {vietQrInfo.memo || order?.orderCode}
                  <button onClick={handleCopyMemo} className="cursor-pointer p-0.5">
                    {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
                  </button>
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-[11px] text-amber-800 text-left leading-relaxed flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Lưu ý:</strong> Vui lòng giữ nguyên nội dung chuyển khoản <strong>{vietQrInfo.memo || order?.orderCode}</strong> để hệ thống tự động xác nhận trong vòng 30 giây.
              </span>
            </div>

            {/* Dải thông báo tự động kiểm tra */}
            <div className="flex items-center justify-center gap-2 text-xs text-blue-700 bg-blue-50 py-2.5 px-3 rounded-xl border border-blue-200">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00A3FF]" />
              <span className="font-medium">Hệ thống đang tự động kiểm tra giao dịch Techcombank...</span>
            </div>

            {/* Thông báo kiểm tra thủ công nếu có */}
            {checkNotice && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs text-left leading-relaxed flex items-start gap-2 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>{checkNotice}</span>
              </div>
            )}

            {/* Nút Kiểm tra trạng thái thanh toán */}
            <button
              onClick={() => checkPaymentStatus(true)}
              disabled={checking}
              className="w-full h-11 bg-[#1B3A6B] hover:bg-[#0B2545] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer shadow-md shadow-blue-900/15"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Đang kiểm tra tài khoản...' : 'Tôi đã chuyển khoản - Kiểm tra ngay'}</span>
            </button>

            {/* Nút Chuyển đổi sang COD nếu khách không tiện chuyển khoản */}
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={handleSwitchToCod}
                disabled={switchingCod}
                className="w-full py-2.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-98 cursor-pointer"
              >
                <Banknote className="w-3.5 h-3.5 text-gray-500" />
                <span>{switchingCod ? 'Đang đổi phương thức...' : 'Hoặc đổi sang Thanh toán khi nhận hàng (COD)'}</span>
              </button>
            </div>

            {/* Giả lập Sandbox (Dành cho Tester) */}
            <div className="pt-1">
              <button
                onClick={handleSimulatePayment}
                disabled={simulating}
                className="text-[11px] text-gray-400 hover:text-blue-600 underline cursor-pointer"
              >
                {simulating ? 'Đang xác nhận test...' : '⚡ Giả lập xác nhận thanh toán (Môi trường kiểm thử)'}
              </button>
            </div>
          </div>
        )}

        {/* ==================== 2. THẺ BIÊN LAI XÁC NHẬN (KHI ĐÃ THANH TOÁN HOẶC COD) ==================== */}
        {!isWaitingForPayment && (
          <div className={`p-4 rounded-3xl border shadow-xs space-y-2.5 text-center ${
            paid 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
              paid ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
            }`}>
              {paid ? <CheckCircle2 className="w-7 h-7" /> : <Truck className="w-7 h-7" />}
            </div>

            <h3 className="font-extrabold text-sm uppercase tracking-tight">
              {paid ? 'BIÊN LAI XÁC NHẬN THANH TOÁN TECHCOMBANK' : 'THANH TOÁN KHI NHẬN HÀNG & LẮP ĐẶT (COD)'}
            </h3>

            <p className="text-xs leading-relaxed max-w-sm mx-auto">
              {paid ? (
                <>
                  Hệ thống đã nhận đủ <strong>{formatVND(order?.finalAmount || 0)}</strong> vào tài khoản doanh nghiệp: <strong>CT TNHH TM VA DV PURE VITA</strong>. Đội ngũ KTV Truliva đang chuẩn bị đơn và sẽ liên hệ giao lắp đúng hẹn.
                </>
              ) : (
                <>
                  Đơn hàng áp dụng hình thức thu tiền mặt tận nơi. Kỹ thuật viên Truliva sẽ vận chuyển, lắp đặt hoàn chỉnh và đo kiểm tra TDS trước khi thu số tiền <strong>{formatVND(order?.finalAmount || 0)}</strong>.
                </>
              )}
            </p>
          </div>
        )}

        {/* ==================== 3. THẺ CHI TIẾT ĐƠN HÀNG ==================== */}
        <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-xs space-y-3 text-xs">
          <div className="font-bold text-gray-900 text-xs uppercase tracking-wider pb-2 border-b border-gray-100 flex items-center justify-between">
            <span>Chi Tiết Đơn Hàng</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              paid 
                ? 'bg-emerald-100 text-emerald-700' 
                : isWaitingForPayment 
                  ? 'bg-amber-100 text-amber-700' 
                  : 'bg-blue-100 text-blue-700'
            }`}>
              {paid ? 'Đã Thanh Toán' : isWaitingForPayment ? 'Chờ Chuyển Khoản' : 'Thanh Toán COD'}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Người nhận:</span>
              <span className="font-bold text-gray-800">{order?.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Số điện thoại:</span>
              <span className="font-semibold text-gray-800">{order?.customerPhone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Địa chỉ:</span>
              <span className="font-medium text-gray-800 text-right max-w-[200px]">{order?.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hình thức thanh toán:</span>
              <span className="font-bold text-[#1B3A6B]">
                {order?.paymentMethod === 'COD' 
                  ? 'Thanh toán khi KTV giao lắp (COD)' 
                  : 'Chuyển khoản Techcombank (VietQR)'}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-100 items-baseline">
              <span className="font-bold text-gray-900">Tổng thanh toán:</span>
              <span className="font-black text-rose-600 text-base">{formatVND(order?.finalAmount || 0)}</span>
            </div>
          </div>
        </div>

        {/* ==================== 4. QUY TRÌNH GIAO HÀNG & LẮP ĐẶT ==================== */}
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

        {/* ==================== 5. NÚT ĐIỀU HƯỚNG DƯỚI CÙNG ==================== */}
        <div className="space-y-2 pt-2">
          <button
            onClick={onViewMyOrders}
            className="w-full h-12 rounded-2xl bg-[#1B3A6B] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 active:scale-98 transition cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Xem đơn hàng của tôi</span>
          </button>

          <button
            onClick={onContinueShopping}
            className="w-full h-12 rounded-2xl bg-white border border-gray-200 text-gray-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-98 transition shadow-xs cursor-pointer"
          >
            <span>Tiếp tục mua sắm</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
