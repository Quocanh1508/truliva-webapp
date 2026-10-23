import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  Wifi, 
  WifiOff,
  Droplets, 
  Clock, 
  Wrench,
  Settings,
  ShieldCheck,
  Layers,
  Radio,
  Smartphone,
  Info,
  Phone,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { openPhone } from 'zmp-sdk/apis';

interface IotDeviceCardProps {
  serialData: any;
  onBookMaintenance?: (serialNumber: string) => void;
}

export default function IotDeviceCard({ serialData, onBookMaintenance }: IotDeviceCardProps) {
  const [activeSubTab, setActiveSubTab] = useState<'device' | 'wifi'>('device');
  const [copied, setCopied] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const s = serialData;
  const iot = s?.iot;
  const telemetry = iot?.telemetry;

  const handleCopySerial = () => {
    if (s?.serialNumber) {
      navigator.clipboard?.writeText(s.serialNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCallHotline = async () => {
    try {
      await openPhone({ phoneNumber: '1900638463' });
    } catch {
      window.location.href = 'tel:1900638463';
    }
  };

  // Helper tính màu trạng thái lõi lọc
  const getFilterHealth = (pct: number | null | undefined, isReplace?: boolean) => {
    const val = pct ?? 80;
    if (isReplace || val < 20) {
      return { 
        val,
        label: 'Cần thay', 
        color: 'bg-rose-500', 
        textColor: 'text-rose-600',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        daysEstimate: 'Hết hạn sử dụng'
      };
    }
    if (val < 50) {
      return { 
        val,
        label: 'Sắp thay', 
        color: 'bg-amber-500', 
        textColor: 'text-amber-600',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        daysEstimate: '~ 30 - 45 ngày nữa'
      };
    }
    return { 
      val,
      label: 'Đang tốt', 
      color: 'bg-emerald-500', 
      textColor: 'text-emerald-600',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      daysEstimate: '~ 90 - 180 ngày nữa'
    };
  };

  const ppcHealth = getFilterHealth(telemetry?.ppc ?? 79, telemetry?.ppcReplace);
  const roHealth = getFilterHealth(telemetry?.ro ?? 85, telemetry?.roReplace);
  const ctoHealth = getFilterHealth(telemetry?.cto ?? 80, telemetry?.ctoReplace);

  const tdsVal = telemetry?.tdsOut ?? 12;
  // Chuẩn hóa trạng thái kết nối Wi-Fi thực tế (Nếu iot.isOnline === false thì hiển thị ngoại tuyến)
  const isOnline = Boolean(iot && iot.isOnline);
  const fwVersion = iot?.firmwareVersion ?? 'FW 1.2.0';
  const rssi = telemetry?.rssi ?? -47;
  const ssidName = telemetry?.ssid || 'Truliva_Smart_WiFi';
  const ipAddress = telemetry?.ip || '192.168.1.135';
  const macAddress = telemetry?.mac || `TL-${(s?.serialNumber || '830F5').slice(-6)}`;

  const modelTitle = s.model || s.productLine || 'UR61096H';

  return (
    <div className="bg-white rounded-3xl border border-sky-100 shadow-[0_4px_25px_rgba(27,58,107,0.08)] overflow-hidden transition-all">
      
      {/* ── TOP SEGMENTED CONTROL TABS (Máy của tôi | Cài đặt Wi-Fi) ── */}
      <div className="p-2.5 pb-0 bg-slate-50/70 border-b border-slate-100">
        <div className="bg-slate-200/70 p-1 rounded-2xl flex items-center gap-1">
          <button
            onClick={() => setActiveSubTab('device')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSubTab === 'device'
                ? 'bg-white text-[#1B3A6B] shadow-xs scale-[1.01]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Droplets size={14} className={activeSubTab === 'device' ? 'text-[#0284C7]' : ''} />
            <span>Máy của tôi</span>
          </button>

          <button
            onClick={() => setActiveSubTab('wifi')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeSubTab === 'wifi'
                ? 'bg-white text-[#1B3A6B] shadow-xs scale-[1.01]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {isOnline ? (
              <Wifi size={14} className={activeSubTab === 'wifi' ? 'text-emerald-600' : 'text-slate-500'} />
            ) : (
              <WifiOff size={14} className={activeSubTab === 'wifi' ? 'text-slate-600' : 'text-slate-400'} />
            )}
            <span>Cài đặt Wi-Fi</span>
            {isOnline ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            )}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TAB 1: MÁY CỦA TÔI (GIÁM SÁT TDS & 3 LÕI LỌC CHUYÊN NGHIỆP)
          ═══════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'device' && (
        <div className="p-4 space-y-4">
          {/* Header định danh thiết bị - Hiển thị đầy đủ tên máy & số serial */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Máy lọc nước của tôi
              </span>

              {/* Box Serial gọn gàng bên phải */}
              <div className="shrink-0 flex items-center space-x-1.5 font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200">
                <span>{s.serialNumber}</span>
                <button 
                  onClick={handleCopySerial}
                  className="text-slate-400 hover:text-[#1B3A6B] p-0.5 transition cursor-pointer"
                  title="Sao chép số Serial"
                >
                  {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                </button>
              </div>
            </div>

            {/* Tên máy trọn vẹn 100%, không bị cắt truncate dấu ba chấm */}
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-snug break-words">
              {modelTitle}
            </h2>
            
            {/* Trạng thái kết nối Wi-Fi (Xám khi chưa kết nối, Xanh khi trực tuyến) */}
            <div className={`flex items-center space-x-1.5 text-xs pt-0.5 ${
              isOnline ? 'text-emerald-600 font-bold' : 'text-slate-500 font-medium'
            }`}>
              {isOnline ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              ) : (
                <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0"></span>
              )}
              {isOnline ? (
                <Wifi size={13} className="shrink-0 text-emerald-600" />
              ) : (
                <WifiOff size={13} className="shrink-0 text-slate-400" />
              )}
              <span className="whitespace-nowrap">
                {isOnline ? 'Đang kết nối Wi-Fi' : 'Chưa kết nối Wi-Fi'}
              </span>
            </div>
          </div>

          {/* Hộp Thông số Nước Tinh Khiết & Lõi RO tóm tắt */}
          <div className="bg-gradient-to-r from-sky-50/90 via-blue-50/50 to-slate-50 rounded-2xl p-3 border border-sky-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">TDS đầu ra (Sau màng RO)</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-lg font-black text-[#1B3A6B]">{tdsVal}</span>
                <span className="text-[10px] font-bold text-slate-500">ppm</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-sky-100/70">
              <span className="text-slate-500 font-medium">Lõi RO còn lại</span>
              <div className="flex items-baseline space-x-1.5">
                <span className="text-lg font-black text-emerald-600">{roHealth.val}%</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Chuẩn tinh khiết
                </span>
              </div>
            </div>
          </div>

          {/* ── BẢNG HIỂN THỊ 3 LÕI LỌC CHUYÊN NGHIỆP (3-STAGE FILTER LIFE MONITOR) ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1.5 text-xs font-black text-slate-800 uppercase tracking-tight whitespace-nowrap">
                <Layers size={14} className="text-[#1B3A6B] shrink-0" />
                <span>Tuổi Thọ 3 Lõi Lọc</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">Đo thời gian thực</span>
            </div>

            {/* Lõi 1: PPC */}
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs space-y-2 hover:border-sky-200 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-800 font-black text-xs flex items-center justify-center border border-slate-200 shrink-0">
                    1
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-xs text-slate-900 leading-none">
                      Lõi 1 (PPC)
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1">Lọc thô cặn bẩn & gỉ sét</p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="font-black text-sm text-slate-900 leading-none">{ppcHealth.val}%</div>
                  <span className={`inline-flex items-center justify-center mt-1 text-[9px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${ppcHealth.badgeClass}`}>
                    {ppcHealth.label}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ${ppcHealth.color}`}
                    style={{ width: `${Math.min(100, Math.max(8, ppcHealth.val))}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span className="text-slate-600 font-semibold">Chu kỳ: 3 - 6 tháng</span>
                  <span className="text-slate-400">(4/4 vạch)</span>
                </div>
              </div>
            </div>

            {/* Lõi 2: RO */}
            <div className="bg-white p-3 rounded-2xl border border-sky-100/80 shadow-xs space-y-2 hover:border-sky-300 transition-colors bg-gradient-to-r from-sky-50/20 to-white">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-xl bg-sky-100 text-[#0284C7] font-black text-xs flex items-center justify-center border border-sky-200 shrink-0">
                    2
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-xs text-slate-900 leading-none flex items-center gap-1">
                      <span>Lõi 2 (RO)</span>
                      <span className="text-[9px] bg-sky-100 text-[#0284C7] px-1 rounded font-bold shrink-0">Trọng tâm</span>
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1">Màng lọc tinh RO 0.0001µm</p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="font-black text-sm text-sky-700 leading-none">{roHealth.val}%</div>
                  <span className={`inline-flex items-center justify-center mt-1 text-[9px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${roHealth.badgeClass}`}>
                    {roHealth.label}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ${roHealth.color}`}
                    style={{ width: `${Math.min(100, Math.max(8, roHealth.val))}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span className="text-slate-600 font-semibold">Chu kỳ: 24 - 36 tháng</span>
                  <span className="text-slate-400">(4/4 vạch)</span>
                </div>
              </div>
            </div>

            {/* Lõi 3: CTO */}
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-xs space-y-2 hover:border-amber-200 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center border border-amber-200 shrink-0">
                    3
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-extrabold text-xs text-slate-900 leading-none">
                      Lõi 3 (CTO)
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1">Khử mùi & vị than gáo dừa</p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="font-black text-sm text-slate-900 leading-none">{ctoHealth.val}%</div>
                  <span className={`inline-flex items-center justify-center mt-1 text-[9px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${ctoHealth.badgeClass}`}>
                    {ctoHealth.label}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ${ctoHealth.color}`}
                    style={{ width: `${Math.min(100, Math.max(8, ctoHealth.val))}%` }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span className="text-slate-600 font-semibold">Chu kỳ: 6 - 9 tháng</span>
                  <span className="text-slate-400">(4/4 vạch)</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── CỤM NÚT HÀNH ĐỘNG (CHUẨN THEO ẢNH USER) ── */}
          <div className="pt-2 space-y-2">
            {/* Nút Cài đặt lại Wi-Fi màu đen phong cách Smart App */}
            <button
              onClick={() => setActiveSubTab('wifi')}
              className="w-full py-3 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-2 shadow-md active:scale-[0.99] transition-all cursor-pointer"
            >
              <Settings size={15} />
              <span>Cài đặt lại Wi-Fi</span>
            </button>

            {onBookMaintenance && (
              <button
                onClick={() => onBookMaintenance(s.serialNumber)}
                className="w-full py-2.5 bg-sky-50 hover:bg-sky-100 text-[#0284C7] rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-sky-100"
              >
                <Wrench size={13} />
                <span>Yêu cầu KTV bảo trì / Thay lõi</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB 2: CÀI ĐẶT WI-FI (THÔNG TIN MẠNG MÁY & HƯỚNG DẪN KẾT NỐI)
          ═══════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'wifi' && (
        <div className="p-4 space-y-4">
          
          {/* Card trạng thái Wi-Fi thực tế của máy */}
          <div className="bg-gradient-to-br from-[#061226] via-[#0B2545] to-[#0F3866] text-white p-4 rounded-3xl shadow-lg relative overflow-hidden space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                  isOnline 
                    ? 'bg-cyan-400/20 border-cyan-400/40 text-cyan-300' 
                    : 'bg-slate-700/60 border-slate-600 text-slate-400'
                }`}>
                  {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-xs text-white truncate">Mạng Wi-Fi Của Máy</h3>
                  <p className="text-[10px] text-sky-200/80 truncate">Đồng bộ đám mây Truliva IoT</p>
                </div>
              </div>

              {/* Badge trạng thái kết nối Wi-Fi 1 dòng ngay ngắn */}
              <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center space-x-1.5 whitespace-nowrap ${
                isOnline 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' 
                  : 'bg-slate-700/70 text-slate-300 border-slate-600/70'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
                <span>{isOnline ? 'Trực tuyến' : 'Chưa kết nối'}</span>
              </span>
            </div>

            {/* Grid thông số mạng chi tiết */}
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 min-w-0">
                <span className="text-[10px] text-sky-200 block truncate">Tên Wi-Fi (SSID)</span>
                <span className={`font-bold block mt-0.5 truncate ${isOnline ? 'text-white' : 'text-slate-300'}`}>
                  {isOnline ? ssidName : (ssidName || 'Chưa thiết lập')}
                </span>
              </div>

              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 min-w-0">
                <span className="text-[10px] text-sky-200 block truncate">Tín hiệu sóng (RSSI)</span>
                <span className={`font-bold block mt-0.5 truncate ${isOnline ? 'text-cyan-300' : 'text-slate-400'}`}>
                  {isOnline ? `${rssi} dBm (Mạnh)` : '-- (Ngoại tuyến)'}
                </span>
              </div>

              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 min-w-0">
                <span className="text-[10px] text-sky-200 block truncate">Địa chỉ IP máy</span>
                <span className={`font-mono text-[11px] block mt-0.5 truncate ${isOnline ? 'text-white' : 'text-slate-400'}`}>
                  {isOnline ? ipAddress : '-- (Chưa cấp)'}
                </span>
              </div>

              <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 min-w-0">
                <span className="text-[10px] text-sky-200 block truncate">Băng tần hỗ trợ</span>
                <span className="font-bold text-white block mt-0.5 truncate">2.4 GHz</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-sky-300/80 pt-1 border-t border-white/10">
              <span className="truncate">MAC: {macAddress}</span>
              <span className="shrink-0 font-mono">{fwVersion}</span>
            </div>
          </div>

          {/* Alert nhắc nhở băng tần 2.4GHz */}
          <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs text-amber-900 flex items-start space-x-2.5">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-[11px]">Yêu cầu mạng Wi-Fi gia đình:</p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Máy lọc nước Truliva chỉ kết nối với mạng <strong>Wi-Fi 2.4GHz</strong>. Vui lòng không chọn Wi-Fi 5GHz khi cấu hình lại mạng.
              </p>
            </div>
          </div>

          {/* ── QUY TRÌNH 3 BƯỚC CÀI ĐẶT LẠI WI-FI (BLE / SMART CONFIG) ── */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 className="font-black text-xs text-slate-800 uppercase tracking-tight flex items-center space-x-1.5">
              <Radio size={14} className="text-[#1B3A6B]" />
              <span>3 Bước Kết Nối Lại Wi-Fi Cho Máy</span>
            </h4>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded-full bg-[#1B3A6B] text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <strong className="text-slate-800 block">Kích hoạt chế độ ghép nối trên máy</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Nhấn và giữ nút <strong>Wi-Fi / Reset</strong> trên thân máy trong <strong>5 giây</strong> cho đến khi đèn LED Wi-Fi nhấp nháy xanh nhanh.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded-full bg-[#1B3A6B] text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <strong className="text-slate-800 block">Bật Bluetooth trên điện thoại</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Đảm bảo điện thoại của bạn đang bật Bluetooth và đã kết nối vào mạng Wi-Fi 2.4GHz gia đình.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <div className="w-5 h-5 rounded-full bg-[#1B3A6B] text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <strong className="text-slate-800 block">Truyền mật khẩu Wi-Fi sang máy</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Nhấn nút bắt đầu bên dưới để truyền cấu hình Wi-Fi tự động sang máy lọc nước.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cụm nút hành động Wi-Fi */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => setShowConfigModal(true)}
              className="w-full py-3 bg-[#1B3A6B] hover:bg-[#2563EB] text-white rounded-2xl font-black text-xs flex items-center justify-center space-x-2 shadow-md active:scale-[0.99] transition-all cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Bắt Đầu Cài Đặt Wi-Fi Ngay</span>
            </button>

            <button
              onClick={handleCallHotline}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Phone size={13} className="text-[#0284C7]" />
              <span>Hotline Hỗ Trợ Kỹ Thuật: 1900 638 463</span>
            </button>
          </div>
        </div>
      )}

      {/* ── MODAL HƯỚNG DẪN KẾT NỐI WI-FI CHI TIẾT ── */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl p-5 space-y-4 animate-scale-up border border-sky-100">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 text-[#0284C7] flex items-center justify-center mx-auto border border-sky-100">
              <Wifi size={24} />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-base text-slate-900">Cấu Hình Wi-Fi Máy Lọc Nước</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Hệ thống đang chuẩn bị kết nối với máy lọc <strong>{modelTitle}</strong> qua sóng Bluetooth BLE tầm gần.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl text-xs text-slate-600 space-y-1.5 border border-slate-100">
              <p className="flex items-center text-slate-700 font-bold">
                <Check size={14} className="text-emerald-600 mr-1.5" />
                Vui lòng đứng cách máy dưới 3 mét
              </p>
              <p className="flex items-center text-slate-700 font-bold">
                <Check size={14} className="text-emerald-600 mr-1.5" />
                Đảm bảo đèn Wi-Fi trên máy đang nháy xanh
              </p>
              <p className="flex items-center text-slate-700 font-bold">
                <Check size={14} className="text-emerald-600 mr-1.5" />
                Chuẩn bị sẵn mật khẩu Wi-Fi 2.4GHz
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleCallHotline}
                className="w-full py-3 bg-[#1B3A6B] text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Phone size={14} />
                <span>Gặp Kỹ Thuật Viên Hướng Dẫn (1900 638 463)</span>
              </button>

              <button
                onClick={() => setShowConfigModal(false)}
                className="w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
