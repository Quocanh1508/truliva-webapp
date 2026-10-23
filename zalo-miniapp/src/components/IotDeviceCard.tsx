import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  Wifi, 
  BellOff, 
  Bell, 
  Layers, 
  Droplets, 
  Clock, 
  Wrench,
  Cpu
} from 'lucide-react';

interface IotDeviceCardProps {
  serialData: any;
  onBookMaintenance?: (serialNumber: string) => void;
}

export default function IotDeviceCard({ serialData, onBookMaintenance }: IotDeviceCardProps) {
  const [copied, setCopied] = useState(false);

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

  // Helper tính màu trạng thái lõi lọc
  const getFilterStatus = (pct: number | null | undefined, isReplace?: boolean) => {
    if (pct == null) return { label: 'Chưa có dữ liệu', color: 'bg-slate-300', badgeClass: 'bg-slate-50 text-slate-600 border-slate-200' };
    if (isReplace || pct < 20) {
      return { label: 'Cần thay ngay', color: 'bg-rose-500', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' };
    }
    if (pct < 50) {
      return { label: 'Chuẩn bị thay', color: 'bg-amber-500', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
    return { label: 'Tình trạng tốt', color: 'bg-emerald-500', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  };

  const ppcStatus = getFilterStatus(telemetry?.ppc, telemetry?.ppcReplace);
  const roStatus = getFilterStatus(telemetry?.ro, telemetry?.roReplace);
  const ctoStatus = getFilterStatus(telemetry?.cto, telemetry?.ctoReplace);

  const tdsVal = telemetry?.tdsOut ?? 11;
  const isOnline = iot?.isOnline ?? false;
  const fwVersion = iot?.firmwareVersion ?? 'FW 1.2.0';
  const rssi = telemetry?.rssi ?? -47;
  const isMuted = iot?.isMuted ?? true;
  const uptime = telemetry?.uptime ?? 49;
  const recordedTime = telemetry?.recordedAt 
    ? new Date(telemetry.recordedAt).toLocaleTimeString('vi-VN', { hour12: false }) 
    : '11:29:01';

  // Nếu không có IoT Telemetry thì render thẻ Serial truyền thống
  if (!iot && !telemetry) {
    return (
      <div className="bg-white rounded-3xl p-4 border border-sky-100 shadow-[0_4px_20px_rgba(27,58,107,0.06)] space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-xs">{s.model || s.productLine || 'Máy lọc nước Truliva'}</h3>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">Serial: {s.serialNumber}</p>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
            {s.status || 'Đang hoạt động'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-2xl border border-slate-100">
          <div>
            <p className="text-slate-400 text-[10px]">Ngày kích hoạt</p>
            <p className="font-semibold text-slate-700 mt-0.5">
              {s.activationDate ? new Date(s.activationDate).toLocaleDateString('vi-VN') : 'Mới lắp đặt'}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-[10px]">Hạn bảo hành</p>
            <p className="font-semibold text-emerald-600 mt-0.5">
              {s.warrantyExpiryDate ? new Date(s.warrantyExpiryDate).toLocaleDateString('vi-VN') : '12 - 24 tháng'}
            </p>
          </div>
        </div>

        {onBookMaintenance && (
          <button
            onClick={() => onBookMaintenance(s.serialNumber)}
            className="w-full py-2 bg-sky-50 hover:bg-sky-100 text-[#0284C7] rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-sky-100"
          >
            <Wrench size={14} />
            <span>Yêu cầu KTV bảo trì</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-4 border border-sky-100 shadow-[0_4px_20px_rgba(27,58,107,0.06)] space-y-3.5">
      {/* 1. Header: IoT Badge + Serial + Model + Online Status */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0B2545] flex items-center justify-center text-white font-black text-xs shadow-xs shrink-0">
            IoT
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-slate-900 text-sm font-mono tracking-tight">{s.serialNumber}</span>
              <button 
                onClick={handleCopySerial}
                className="text-slate-400 hover:text-[#1B3A6B] p-0.5 transition cursor-pointer"
                title="Sao chép số Serial"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>
            <p className="text-[11px] text-blue-900 font-bold mt-0.5">
              {s.model || 'Máy Lọc Nước Truliva'} <span className="text-slate-400 font-normal">• {fwVersion}</span>
            </p>
          </div>
        </div>

        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center space-x-1 ${
          isOnline 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
            : 'bg-slate-100 text-slate-500 border-slate-200'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </span>
      </div>

      {/* 2. Micro Badges: UART OK / RSSI / Mute */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
          <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
          <span>UART OK</span>
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 flex items-center space-x-1">
          <Wifi size={10} className="text-sky-600" />
          <span>{rssi} dBm</span>
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1">
          {isMuted ? <BellOff size={10} className="text-amber-600" /> : <Bell size={10} className="text-emerald-600" />}
          <span>{isMuted ? 'Đã tắt chuông' : 'Chuông bật'}</span>
        </span>
      </div>

      {/* 3. TDS Nước Tinh Khiết Box */}
      <div className="bg-gradient-to-r from-sky-50/80 to-blue-50/40 rounded-2xl p-3.5 border border-sky-100/80 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-blue-950 font-bold text-xs">
            <Droplets size={15} className="text-[#0284C7]" />
            <span>TDS Nước Tinh Khiết (Sau RO)</span>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
            Chuẩn uống trực tiếp (Rất tốt)
          </span>
        </div>

        <div className="flex items-baseline justify-between pt-0.5">
          <div className="flex items-baseline">
            <span className="text-3xl font-black text-[#1B3A6B] tracking-tight">{tdsVal}</span>
            <span className="text-xs font-bold text-slate-500 ml-1.5 font-mono">PPM</span>
          </div>
          <span className="text-[11px] text-slate-400">Đo tại vòi sau màng RO</span>
        </div>
      </div>

      {/* 4. Tuổi Thọ 3 Lõi Lọc */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-100 space-y-3 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs tracking-tight">
            <Layers size={14} className="text-[#1B3A6B]" />
            <span>TUỔI THỌ 3 LÕI LỌC</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Chuẩn máy Truliva</span>
        </div>

        {/* Lõi 1: PPC */}
        <div className="bg-white p-2.5 rounded-xl border border-slate-100 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                1
              </span>
              <span className="font-bold text-slate-800 text-xs">
                Lõi 1 (PPC) <span className="text-slate-400 font-normal">• Lọc thô</span>
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-slate-800 text-xs">{telemetry?.ppc ?? 79}%</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${ppcStatus.badgeClass}`}>
                {ppcStatus.label}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${ppcStatus.color}`}
              style={{ width: `${Math.min(100, Math.max(5, telemetry?.ppc ?? 79))}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Lọc thô sơ cấp</span>
            <span>({telemetry?.ppcBars ?? 4}/4 vạch)</span>
          </div>
        </div>

        {/* Lõi 2: RO */}
        <div className="bg-white p-2.5 rounded-xl border border-slate-100 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-md bg-sky-100 text-sky-800 font-bold text-[10px] flex items-center justify-center">
                2
              </span>
              <span className="font-bold text-slate-800 text-xs">
                Lõi 2 (RO) <span className="text-slate-400 font-normal">• Màng RO</span>
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-slate-800 text-xs">{telemetry?.ro ?? 75}%</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${roStatus.badgeClass}`}>
                {roStatus.label}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${roStatus.color}`}
              style={{ width: `${Math.min(100, Math.max(5, telemetry?.ro ?? 75))}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Màng lọc tinh RO</span>
            <span>({telemetry?.roBars ?? 4}/4 vạch)</span>
          </div>
        </div>

        {/* Lõi 3: CTO */}
        <div className="bg-white p-2.5 rounded-xl border border-slate-100 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px] flex items-center justify-center">
                3
              </span>
              <span className="font-bold text-slate-800 text-xs">
                Lõi 3 (CTO) <span className="text-slate-400 font-normal">• Than hoạt tính</span>
              </span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="font-black text-slate-800 text-xs">{telemetry?.cto ?? 79}%</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${ctoStatus.badgeClass}`}>
                {ctoStatus.label}
              </span>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${ctoStatus.color}`}
              style={{ width: `${Math.min(100, Math.max(5, telemetry?.cto ?? 79))}%` }}
            ></div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Khử mùi & vị than gáo dừa</span>
            <span>({telemetry?.ctoBars ?? 4}/4 vạch)</span>
          </div>
        </div>
      </div>

      {/* 5. Footer: Telemetry Time & Action Button */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
        <div className="flex items-center space-x-1">
          <Clock size={11} />
          <span>{recordedTime}</span>
        </div>
        <span>Uptime: {uptime}s</span>
      </div>

      {onBookMaintenance && (
        <button
          onClick={() => onBookMaintenance(s.serialNumber)}
          className="w-full py-2 bg-sky-50 hover:bg-sky-100 text-[#0284C7] rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-sky-100"
        >
          <Wrench size={14} />
          <span>Yêu cầu KTV bảo trì / Thay lõi</span>
        </button>
      )}
    </div>
  );
}
