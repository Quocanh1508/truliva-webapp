import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  Plus,
  Send,
  Loader2,
  Droplets,
  Clock,
  X,
  ChevronRight,
  Layers,
  Info,
  Radio,
  Bell,
  BellOff,
  CheckCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { fetchApi } from '../../api/client';

interface Telemetry {
  id: string;
  tdsIn: number | null;
  tdsOut: number | null;
  waterFlowLpm: number | null;
  totalLiters: number | null;
  waterPressure: number | null;
  pumpStatus: string | null;
  errorCode: number;
  recordedAt: string;
  // Bóc tách 3 lõi lọc Truliva
  ppc?: number | null;
  ppcBars?: number | null;
  ppcReplace?: boolean;
  ro?: number | null;
  roBars?: number | null;
  roReplace?: boolean;
  cto?: number | null;
  ctoBars?: number | null;
  ctoReplace?: boolean;
  // Thông số phần cứng & mạng
  rssi?: number | null;
  ip?: string | null;
  uptime?: number | null;
  uartOk?: boolean;
  interval?: number;
  statusByte?: number | null;
  fw?: string | null;
}

interface SerialInfo {
  serialNumber: string;
  model: string;
  productLine?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  status?: string | null;
  activationDate?: string | null;
}

interface Alert {
  id: string;
  deviceId: string;
  alertType: string;
  severity: string;
  message: string;
  isResolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
  device?: {
    serialNumber: string;
    firmwareVersion: string | null;
    isMuted?: boolean;
  };
}

interface IotDevice {
  id: string;
  serialNumber: string;
  mqttUsername: string | null;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  isMuted?: boolean;
  latestTelemetry: Telemetry | null;
  serialInfo?: SerialInfo | null;
  unresolvedAlerts: number;
  totalReadings: number;
  createdAt: string;
}

// ── Helpers ──
function formatUptime(seconds?: number | null): string {
  if (seconds == null) return '--';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remMinutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days} ngày ${remHours}h`;
}

function getTdsQuality(tds?: number | null) {
  if (tds == null) return { text: 'Chưa có dữ liệu', color: 'text-gray-500', bg: 'bg-gray-100', border: 'border-gray-200' };
  if (tds <= 50) return { text: 'Chuẩn uống trực tiếp (Rất tốt)', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  if (tds <= 100) return { text: 'Nước đạt chuẩn (Tốt)', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
  if (tds <= 200) return { text: 'Cần theo dõi chất lượng', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
  return { text: 'Cần kiểm tra màng RO', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' };
}

function getFilterState(percent?: number | null, replace?: boolean) {
  if (replace || (percent != null && percent <= 2)) {
    return { text: 'Cần thay ngay', color: 'text-rose-700', bg: 'bg-rose-100', bar: 'bg-rose-600', isCritical: true };
  }
  if (percent != null && percent <= 24) {
    return { text: 'Sắp đến hạn thay', color: 'text-amber-700', bg: 'bg-amber-100', bar: 'bg-amber-500', isCritical: false };
  }
  if (percent != null && percent <= 50) {
    return { text: 'Đã dùng 50%', color: 'text-blue-700', bg: 'bg-blue-100', bar: 'bg-blue-500', isCritical: false };
  }
  return { text: 'Tình trạng tốt', color: 'text-emerald-700', bg: 'bg-emerald-100', bar: 'bg-emerald-500', isCritical: false };
}

export default function IotMonitor() {
  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'online' | 'offline' | 'alerts'>('all');
  const [activeSubTab, setActiveSubTab] = useState<'devices' | 'alerts'>('devices');

  // Selected device for details modal
  const [selectedDevice, setSelectedDevice] = useState<IotDevice | null>(null);
  const [deviceTelemetry, setDeviceTelemetry] = useState<Telemetry[]>([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [modalChartTab, setModalChartTab] = useState<'tds' | 'filters'>('tds');

  // New device modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSerial, setNewSerial] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addResult, setAddResult] = useState<any>(null);

  // Command modal
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [commandDevice, setCommandDevice] = useState<IotDevice | null>(null);
  const [selectedCommand, setSelectedCommand] = useState('set_interval');
  const [commandParam, setCommandParam] = useState('120');
  const [sendingCommand, setSendingCommand] = useState(false);
  const [mutingSerial, setMutingSerial] = useState<string | null>(null);
  const [resolvingAll, setResolvingAll] = useState(false);

  // Fetch devices data
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [devicesData, alertData] = await Promise.all([
        fetchApi('/iot/devices'),
        fetchApi('/iot/alerts?resolved=false')
      ]);

      setDevices(devicesData?.devices || []);
      setAlerts(alertData?.alerts || []);
    } catch (error) {
      console.error('Error fetching IoT data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto refresh every 8 seconds for real-time monitoring
    const timer = setInterval(() => fetchData(true), 8000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Fetch telemetry history when a device is selected
  const handleSelectDevice = async (device: IotDevice) => {
    setSelectedDevice(device);
    setLoadingTelemetry(true);
    try {
      const data = await fetchApi(`/iot/devices/${device.serialNumber}/telemetry?limit=60`);
      // Sort ascending for chart
      const sorted = (data?.telemetry || []).sort(
        (a: Telemetry, b: Telemetry) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
      );
      setDeviceTelemetry(sorted);
    } catch (e) {
      console.error('Failed to load telemetry:', e);
    } finally {
      setLoadingTelemetry(false);
    }
  };

  // Register new device
  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSerial.trim()) return;

    setSubmittingAdd(true);
    setAddResult(null);
    try {
      const data = await fetchApi('/iot/devices', {
        method: 'POST',
        body: JSON.stringify({
          serialNumber: newSerial.trim().toUpperCase(),
          mqttPassword: newPassword.trim() || undefined
        })
      });

      setAddResult(data);
      fetchData(true);
    } catch (error: any) {
      alert(error.message || 'Lỗi khi đăng ký thiết bị');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Send command to ESP32
  const handleSendCommand = async () => {
    if (!commandDevice) return;
    setSendingCommand(true);
    try {
      let params: Record<string, any> = {};
      if (selectedCommand === 'set_interval') {
        const sec = Number(commandParam) || 60;
        params = { interval: sec, interval_s: sec };
      }

      const data = await fetchApi(`/iot/devices/${commandDevice.serialNumber}/command`, {
        method: 'POST',
        body: JSON.stringify({ command: selectedCommand, params })
      });

      alert(`✅ ${data?.message || 'Lệnh đã được gửi thành công'}`);
      setShowCommandModal(false);
      fetchData(true);
    } catch (e: any) {
      alert(`❌ ${e.message || 'Lỗi khi gửi lệnh'}`);
    } finally {
      setSendingCommand(false);
    }
  };

  // Resolve alert
  const handleResolveAlert = async (alertId: string) => {
    try {
      await fetchApi(`/iot/alerts/${alertId}/resolve`, {
        method: 'PATCH'
      });
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      fetchData(true);
    } catch (e) {
      console.error('Resolve alert error:', e);
    }
  };

  // Toggle mute for a device
  const handleToggleMute = async (serial: string, currentMuted: boolean) => {
    const willMute = !currentMuted;
    const confirmMsg = willMute
      ? `Tắt thông báo cho máy ${serial}?\n\nHệ thống sẽ dừng tạo cảnh báo từ máy này và tự động đánh dấu đã xử lý các cảnh báo đang mở.`
      : `Bật lại nhận thông báo từ máy ${serial}?`;

    if (!window.confirm(confirmMsg)) return;

    setMutingSerial(serial);
    try {
      await fetchApi(`/iot/devices/${serial}/mute`, {
        method: 'PATCH',
        body: JSON.stringify({ muted: willMute, resolveExisting: true })
      });

      // Cập nhật ngay trên UI
      setDevices((prev) =>
        prev.map((d) =>
          d.serialNumber === serial
            ? { ...d, isMuted: willMute, unresolvedAlerts: willMute ? 0 : d.unresolvedAlerts }
            : d
        )
      );

      setSelectedDevice((prev) =>
        prev && prev.serialNumber === serial
          ? { ...prev, isMuted: willMute, unresolvedAlerts: willMute ? 0 : prev.unresolvedAlerts }
          : prev
      );

      if (willMute) {
        setAlerts((prev) => prev.filter((a) => a.device?.serialNumber !== serial && a.deviceId !== serial));
      }

      fetchData(true);
    } catch (err: any) {
      alert(`Lỗi khi đổi trạng thái thông báo: ${err.message || 'Thao tác thất bại'}`);
    } finally {
      setMutingSerial(null);
    }
  };

  // Bulk resolve alerts
  const handleResolveAllAlerts = async (serialNumber?: string) => {
    const confirmMsg = serialNumber
      ? `Đánh dấu đã xử lý tất cả cảnh báo của máy ${serialNumber}?`
      : `Đánh dấu đã xử lý tất cả cảnh báo (${alerts.length} cảnh báo) trên toàn hệ thống?`;

    if (!window.confirm(confirmMsg)) return;

    setResolvingAll(true);
    try {
      await fetchApi('/iot/alerts/resolve-all', {
        method: 'POST',
        body: JSON.stringify({ serialNumber })
      });

      if (serialNumber) {
        setAlerts((prev) => prev.filter((a) => a.device?.serialNumber !== serialNumber && a.deviceId !== serialNumber));
        setDevices((prev) =>
          prev.map((d) => (d.serialNumber === serialNumber ? { ...d, unresolvedAlerts: 0 } : d))
        );
        setSelectedDevice((prev) =>
          prev && prev.serialNumber === serialNumber ? { ...prev, unresolvedAlerts: 0 } : prev
        );
      } else {
        setAlerts([]);
        setDevices((prev) => prev.map((d) => ({ ...d, unresolvedAlerts: 0 })));
        setSelectedDevice((prev) => (prev ? { ...prev, unresolvedAlerts: 0 } : null));
      }

      fetchData(true);
    } catch (err: any) {
      alert(`Lỗi khi xử lý cảnh báo: ${err.message || 'Thao tác thất bại'}`);
    } finally {
      setResolvingAll(false);
    }
  };

  // Filtered devices
  const filteredDevices = devices.filter((d) => {
    const matchSearch =
      d.serialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.serialInfo?.customerName && d.serialInfo.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.serialInfo?.model && d.serialInfo.model.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchSearch) return false;
    if (filterTab === 'online') return d.isOnline;
    if (filterTab === 'offline') return !d.isOnline;
    if (filterTab === 'alerts') return d.unresolvedAlerts > 0;
    return true;
  });

  // Calculate statistics
  const onlineCount = devices.filter((d) => d.isOnline).length;
  const offlineCount = devices.filter((d) => !d.isOnline).length;
  const totalAlerts = alerts.length;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#1B3A6B] text-white flex items-center justify-center shadow-md">
            <Cpu size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              Giám Sát Thiết Bị IoT (ESP32)
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-[#1B3A6B] font-semibold border border-blue-100">
                MQTT Live
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Theo dõi chất lượng nước (TDS), tuổi thọ 3 lõi lọc (PPC, RO, CTO) & cảnh báo từ xa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-4 py-2.5 flex items-center gap-2 transition-all text-sm shadow-xs"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin text-blue-600' : ''} />
            Làm mới
          </button>
          <button
            onClick={() => {
              setNewSerial('');
              setNewPassword('');
              setAddResult(null);
              setShowAddModal(true);
            }}
            className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-4 py-2.5 shadow-xs transition-all active:scale-[0.98] flex items-center gap-2 text-sm"
          >
            <Plus size={18} />
            Đăng ký Máy IoT
          </button>
        </div>
      </div>

      {/* ── STATS CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Devices */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tổng Thiết Bị</p>
            <p className="text-3xl font-extrabold text-gray-900 mt-1">{devices.length}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1B3A6B] flex items-center justify-center">
            <Cpu size={24} />
          </div>
        </div>

        {/* Online Devices */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Đang Trực Tuyến</p>
            <p className="text-3xl font-extrabold text-emerald-600 mt-1">{onlineCount}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Wifi size={24} />
          </div>
        </div>

        {/* Offline Devices */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mất Kết Nối</p>
            <p className="text-3xl font-extrabold text-slate-500 mt-1">{offlineCount}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center">
            <WifiOff size={24} />
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Cảnh Báo Chưa Xử Lý</p>
            <p className="text-3xl font-extrabold text-rose-600 mt-1">{totalAlerts}</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle size={24} />
          </div>
        </div>
      </div>

      {/* ── TABS & NAVIGATION ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('devices')}
            className={`px-4 py-2 font-bold text-sm rounded-xl transition-all ${
              activeSubTab === 'devices'
                ? 'bg-[#1B3A6B] text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            📡 Danh Sách Máy IoT ({devices.length})
          </button>
          <button
            onClick={() => setActiveSubTab('alerts')}
            className={`px-4 py-2 font-bold text-sm rounded-xl transition-all flex items-center gap-2 ${
              activeSubTab === 'alerts'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <AlertTriangle size={16} />
            Cảnh Báo Tự Động ({alerts.length})
          </button>
        </div>

        {activeSubTab === 'devices' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Search Box */}
            <div className="relative flex-1 sm:w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm Serial, Khách hàng, Model..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterTab === 'all' ? 'bg-white text-gray-800 shadow-xs' : 'text-gray-500'
                }`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setFilterTab('online')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterTab === 'online' ? 'bg-emerald-500 text-white shadow-xs' : 'text-gray-500'
                }`}
              >
                Online
              </button>
              <button
                onClick={() => setFilterTab('offline')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterTab === 'offline' ? 'bg-gray-600 text-white shadow-xs' : 'text-gray-500'
                }`}
              >
                Offline
              </button>
              <button
                onClick={() => setFilterTab('alerts')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterTab === 'alerts' ? 'bg-rose-500 text-white shadow-xs' : 'text-gray-500'
                }`}
              >
                Lỗi
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <Loader2 className="animate-spin text-[#1B3A6B]" size={36} />
          <p className="text-sm font-semibold">Đang tải dữ liệu thiết bị IoT...</p>
        </div>
      ) : activeSubTab === 'alerts' ? (
        /* ── ALERTS LIST ── */
        <div className="space-y-3">
          {alerts.length > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-xs gap-3">
              <div>
                <h4 className="font-bold text-gray-800 text-sm">Danh Sách Cảnh Báo Thiết Bị</h4>
                <p className="text-xs text-gray-500">Có {alerts.length} cảnh báo đang chờ xử lý.</p>
              </div>
              <button
                onClick={() => handleResolveAllAlerts()}
                disabled={resolvingAll}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
              >
                {resolvingAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />}
                Đánh dấu đã xử lý toàn bộ ({alerts.length})
              </button>
            </div>
          )}

          {alerts.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-gray-100 shadow-sm text-gray-500">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
              <h3 className="font-bold text-gray-800 text-lg">Không Có Cảnh Báo Nào</h3>
              <p className="text-sm mt-1">Tất cả máy lọc nước IoT đều đang hoạt động an toàn và ổn định.</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all shadow-xs ${
                  alert.severity === 'CRITICAL'
                    ? 'bg-rose-50/60 border-rose-200 text-rose-900'
                    : 'bg-amber-50/60 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      alert.severity === 'CRITICAL'
                        ? 'bg-rose-500 text-white'
                        : 'bg-amber-500 text-white'
                    }`}
                  >
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base">{alert.device?.serialNumber || alert.deviceId}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-rose-200 text-rose-800'
                            : 'bg-amber-200 text-amber-800'
                        }`}
                      >
                        {alert.alertType}
                      </span>
                      {alert.device?.isMuted && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
                          <BellOff size={10} />
                          Đã tắt thông báo
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-1">{alert.message}</p>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(alert.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {alert.device?.serialNumber && !alert.device.isMuted && (
                    <button
                      onClick={() => handleToggleMute(alert.device!.serialNumber, false)}
                      disabled={mutingSerial === alert.device.serialNumber}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                      title="Tắt cảnh báo máy này để chặn spam"
                    >
                      {mutingSerial === alert.device.serialNumber ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <BellOff size={13} />
                      )}
                      Tắt máy này
                    </button>
                  )}
                  <button
                    onClick={() => handleResolveAlert(alert.id)}
                    className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 size={14} />
                    Đã xử lý
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── DEVICES GRID / CARDS ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDevices.length === 0 ? (
            <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-gray-100 shadow-sm text-gray-500">
              <Cpu size={48} className="mx-auto text-gray-300 mb-3" />
              <h3 className="font-bold text-gray-800 text-lg">Chưa Có Thiết Bị IoT Nào</h3>
              <p className="text-sm mt-1">Bấm nút "Đăng ký Máy IoT" để kết nối thiết bị ESP32 đầu tiên.</p>
            </div>
          ) : (
            filteredDevices.map((device) => {
              const tel = device.latestTelemetry;
              const tdsQuality = getTdsQuality(tel?.tdsOut);
              const ppcState = getFilterState(tel?.ppc, tel?.ppcReplace);
              const roState = getFilterState(tel?.ro, tel?.roReplace);
              const ctoState = getFilterState(tel?.cto, tel?.ctoReplace);

              return (
                <div
                  key={device.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4 relative overflow-hidden group"
                >
                  {/* Top Status Bar */}
                  <div className="flex items-start justify-between border-b border-gray-100 pb-3 gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-[#1B3A6B] text-white flex items-center justify-center font-mono font-bold text-xs shrink-0 shadow-xs">
                        IoT
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 font-mono tracking-tight text-base flex items-center gap-1.5 flex-wrap">
                          {device.serialNumber}
                          {device.isMuted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-sans font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              <BellOff size={10} />
                              Đã tắt thông báo
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          {device.serialInfo?.model ? (
                            <span className="font-semibold text-blue-800">{device.serialInfo.model}</span>
                          ) : (
                            <span>Máy Lọc Nước Truliva</span>
                          )}
                          <span>•</span>
                          <span className="font-mono text-gray-400">FW {tel?.fw || device.firmwareVersion || '1.2.0'}</span>
                        </p>
                        {device.serialInfo?.customerName && (
                          <p className="text-[11px] text-gray-500 mt-0.5 font-medium">
                            KH: <strong className="text-gray-700">{device.serialInfo.customerName}</strong>
                            {device.serialInfo.customerPhone ? ` (${device.serialInfo.customerPhone})` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status & Connection Badges */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                          device.isOnline
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            device.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                          }`}
                        />
                        {device.isOnline ? 'Online' : 'Offline'}
                      </span>

                      {/* Hardware Badges */}
                      <div className="flex items-center gap-1">
                        {tel?.uartOk === false ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                            Lỗi UART
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            UART OK
                          </span>
                        )}
                        {tel?.rssi != null && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex items-center gap-0.5"
                            title={`IP: ${tel.ip || 'N/A'}`}
                          >
                            <Wifi size={10} />
                            {tel.rssi} dBm
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── HERO METRIC: TDS NƯỚC TINH KHIẾT SAU LỌC ── */}
                  {tel ? (
                    <div className="space-y-4">
                      {/* TDS Main Card */}
                      <div className="p-4 rounded-xl border bg-gradient-to-br from-blue-50/70 via-white to-blue-50/40 border-blue-100">
                        <div className="flex items-center justify-between text-xs font-medium text-gray-500 mb-2">
                          <span className="flex items-center gap-1.5 font-bold text-gray-700">
                            <Droplets size={16} className="text-[#00A3FF]" />
                            TDS NƯỚC TINH KHIẾT (ĐẦU RA)
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${tdsQuality.bg} ${tdsQuality.color} ${tdsQuality.border}`}
                          >
                            {tdsQuality.text}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-4xl font-black text-[#1B3A6B] tracking-tight">
                              {tel.tdsOut != null ? tel.tdsOut : '--'}
                            </span>
                            <span className="text-sm font-bold text-gray-500">PPM</span>
                          </div>
                          <p className="text-[11px] text-gray-400 text-right">
                            Đo tại vòi nước sau màng RO
                          </p>
                        </div>
                      </div>

                      {/* ── BỘ 3 LÕI LỌC TRULIVA (PPC, RO, CTO) ── */}
                      <div className="bg-slate-50/80 p-3.5 rounded-xl border border-gray-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers size={14} className="text-[#1B3A6B]" />
                            Tuổi Thọ 3 Lõi Lọc
                          </span>
                          <span className="text-[11px] text-gray-400">Chuẩn máy Truliva</span>
                        </div>

                        {/* Lõi 1: PPC */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-700 flex items-center gap-1">
                              <span>Lõi 1 (PPC)</span>
                              <span className="text-[10px] text-gray-400 font-normal">Lọc thô</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-800">{tel.ppc != null ? `${tel.ppc}%` : '--%'}</span>
                              <span className="text-[10px] text-gray-500">({tel.ppcBars ?? 4}/4 vạch)</span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${ppcState.bg} ${ppcState.color}`}>
                                {ppcState.text}
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${ppcState.bar}`}
                              style={{ width: `${Math.min(100, Math.max(0, tel.ppc ?? 0))}%` }}
                            />
                          </div>
                        </div>

                        {/* Lõi 2: RO */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-700 flex items-center gap-1">
                              <span>Lõi 2 (RO)</span>
                              <span className="text-[10px] text-gray-400 font-normal">Màng lọc tinh</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-800">{tel.ro != null ? `${tel.ro}%` : '--%'}</span>
                              <span className="text-[10px] text-gray-500">({tel.roBars ?? 4}/4 vạch)</span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${roState.bg} ${roState.color}`}>
                                {roState.text}
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${roState.bar}`}
                              style={{ width: `${Math.min(100, Math.max(0, tel.ro ?? 0))}%` }}
                            />
                          </div>
                        </div>

                        {/* Lõi 3: CTO */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-gray-700 flex items-center gap-1">
                              <span>Lõi 3 (CTO)</span>
                              <span className="text-[10px] text-gray-400 font-normal">Than hoạt tính</span>
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-800">{tel.cto != null ? `${tel.cto}%` : '--%'}</span>
                              <span className="text-[10px] text-gray-500">({tel.ctoBars ?? 1}/4 vạch)</span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${ctoState.bg} ${ctoState.color}`}>
                                {ctoState.text}
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${ctoState.bar}`}
                              style={{ width: `${Math.min(100, Math.max(0, tel.cto ?? 0))}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-center text-gray-400 bg-gray-50 rounded-xl text-xs flex flex-col items-center gap-2">
                      <Radio size={24} className="text-gray-300 animate-pulse" />
                      <span>Chờ thiết bị gửi dữ liệu cảm biến đầu tiên...</span>
                    </div>
                  )}

                  {/* Unresolved Alerts Badge if any */}
                  {device.unresolvedAlerts > 0 && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3 py-2 rounded-xl font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                        Có {device.unresolvedAlerts} cảnh báo chưa xử lý
                      </span>
                      <button
                        onClick={() => handleResolveAllAlerts(device.serialNumber)}
                        disabled={resolvingAll}
                        className="text-[11px] underline font-bold hover:text-rose-950 shrink-0 cursor-pointer"
                        title="Đánh dấu đã giải quyết tất cả cảnh báo của máy này"
                      >
                        Đã xử lý xong
                      </button>
                    </div>
                  )}

                  {/* Footer Info & Actions */}
                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {device.lastSeenAt
                          ? new Date(device.lastSeenAt).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })
                          : 'Chưa online'}
                      </span>
                      <span>•</span>
                      <span>Uptime: {formatUptime(tel?.uptime)}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggleMute(device.serialNumber, !!device.isMuted)}
                        disabled={mutingSerial === device.serialNumber}
                        className={`font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs cursor-pointer ${
                          device.isMuted
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                        title={device.isMuted ? 'Bấm để bật lại thông báo' : 'Bấm để tắt thông báo (tránh spam từ máy test)'}
                      >
                        {mutingSerial === device.serialNumber ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : device.isMuted ? (
                          <>
                            <Bell size={12} className="text-amber-700" />
                            Bật chuông
                          </>
                        ) : (
                          <>
                            <BellOff size={12} className="text-gray-500" />
                            Tắt thông báo
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setCommandDevice(device);
                          setSelectedCommand('set_interval');
                          setCommandParam(String(tel?.interval || 120));
                          setShowCommandModal(true);
                        }}
                        className="bg-blue-50 hover:bg-blue-100 text-[#1B3A6B] font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs cursor-pointer"
                      >
                        <Send size={12} />
                        Lệnh
                      </button>
                      <button
                        onClick={() => handleSelectDevice(device)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs cursor-pointer"
                      >
                        Chi tiết
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── MODAL 1: DEVICE TELEMETRY DETAIL & CHART ── */}
      {selectedDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border-t-4 border-[#1B3A6B] flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-gray-50/80 p-5 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1B3A6B] text-white flex items-center justify-center">
                  <Activity size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                    Chi Tiết Thiết Bị — {selectedDevice.serialNumber}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        selectedDevice.isOnline
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {selectedDevice.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </h2>
                  <p className="text-xs text-gray-500">
                    {selectedDevice.serialInfo?.model || 'Máy Lọc Nước Truliva'}
                    {selectedDevice.serialInfo?.customerName ? ` • Khách hàng: ${selectedDevice.serialInfo.customerName}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleMute(selectedDevice.serialNumber, !!selectedDevice.isMuted)}
                  disabled={mutingSerial === selectedDevice.serialNumber}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                    selectedDevice.isMuted
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                  }`}
                  title={selectedDevice.isMuted ? 'Bấm để bật lại nhận cảnh báo' : 'Bấm để tắt thông báo cảnh báo máy này'}
                >
                  {mutingSerial === selectedDevice.serialNumber ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : selectedDevice.isMuted ? (
                    <>
                      <BellOff size={13} className="text-amber-700" />
                      Đã tắt thông báo (Bật lại)
                    </>
                  ) : (
                    <>
                      <BellOff size={13} className="text-gray-500" />
                      Tắt thông báo máy này
                    </>
                  )}
                </button>

                <button
                  onClick={() => setSelectedDevice(null)}
                  className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {loadingTelemetry ? (
                <div className="py-12 text-center text-gray-400">
                  <Loader2 className="animate-spin mx-auto text-[#1B3A6B] mb-2" size={32} />
                  <p className="text-xs font-semibold">Đang tải lịch sử telemetry...</p>
                </div>
              ) : deviceTelemetry.length === 0 ? (
                <div className="py-12 text-center text-gray-400">Chưa có bản ghi telemetry nào</div>
              ) : (
                <>
                  {/* Chart Selection Tabs */}
                  <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModalChartTab('tds')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          modalChartTab === 'tds'
                            ? 'bg-[#1B3A6B] text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        💧 Biểu Đồ TDS Nước Tinh Khiết
                      </button>
                      <button
                        onClick={() => setModalChartTab('filters')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          modalChartTab === 'filters'
                            ? 'bg-[#1B3A6B] text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        📊 Biểu Đồ Tuổi Thọ 3 Lõi Lọc (%)
                      </button>
                    </div>
                    <span className="text-xs text-gray-400">
                      {deviceTelemetry.length} bản ghi gần nhất
                    </span>
                  </div>

                  {/* Chart Rendering */}
                  {modalChartTab === 'tds' ? (
                    <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100">
                      <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                        <Droplets size={16} className="text-[#00A3FF]" />
                        Biểu Đồ Chỉ Số TDS Nước Ra (ppm)
                      </h3>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={deviceTelemetry}>
                            <defs>
                              <linearGradient id="tdsOutGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis
                              dataKey="recordedAt"
                              tickFormatter={(str) =>
                                new Date(str).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              }
                              tick={{ fontSize: 11, fill: '#64748B' }}
                            />
                            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                            <Tooltip
                              labelFormatter={(str) => new Date(str).toLocaleString('vi-VN')}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Area
                              type="monotone"
                              dataKey="tdsOut"
                              name="TDS Nước Ra (ppm)"
                              stroke="#2563EB"
                              strokeWidth={3}
                              fillOpacity={1}
                              fill="url(#tdsOutGrad)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100">
                      <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                        <Layers size={16} className="text-[#1B3A6B]" />
                        Biểu Đồ Tuổi Thọ Lõi Lọc PPC, RO, CTO (%)
                      </h3>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={deviceTelemetry}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis
                              dataKey="recordedAt"
                              tickFormatter={(str) =>
                                new Date(str).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              }
                              tick={{ fontSize: 11, fill: '#64748B' }}
                            />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748B' }} />
                            <Tooltip
                              labelFormatter={(str) => new Date(str).toLocaleString('vi-VN')}
                              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="ppc"
                              name="Lõi 1 (PPC %)"
                              stroke="#00A3FF"
                              strokeWidth={2.5}
                              dot={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="ro"
                              name="Lõi 2 (RO %)"
                              stroke="#2563EB"
                              strokeWidth={2.5}
                              dot={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="cto"
                              name="Lõi 3 (CTO %)"
                              stroke="#F59E0B"
                              strokeWidth={2.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Hardware & Network Details */}
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Info size={14} className="text-blue-600" />
                      Thông Số Phần Cứng & Kết Nối Máy
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-3 rounded-lg border border-gray-100">
                        <span className="text-gray-400 block text-[11px]">IP Nội Bộ</span>
                        <span className="font-mono font-bold text-gray-800">{selectedDevice.latestTelemetry?.ip || '--'}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-gray-100">
                        <span className="text-gray-400 block text-[11px]">Sóng Wi-Fi</span>
                        <span className="font-bold text-gray-800">{selectedDevice.latestTelemetry?.rssi ? `${selectedDevice.latestTelemetry.rssi} dBm` : '--'}</span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-gray-100">
                        <span className="text-gray-400 block text-[11px]">Kết Nối Bo Mạch</span>
                        <span className={`font-bold ${selectedDevice.latestTelemetry?.uartOk ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {selectedDevice.latestTelemetry?.uartOk ? 'UART Ổn định' : 'Mất kết nối UART'}
                        </span>
                      </div>
                      <div className="bg-white p-3 rounded-lg border border-gray-100">
                        <span className="text-gray-400 block text-[11px]">Chu Kỳ Truyền</span>
                        <span className="font-bold text-gray-800">{selectedDevice.latestTelemetry?.interval ? `${selectedDevice.latestTelemetry.interval} giây` : '5 giây'}</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-gray-400 bg-white p-2.5 rounded-lg border border-gray-100 space-y-0.5">
                      <p>• <strong>Cảm biến TDS nước thô đầu vào:</strong> Không trang bị trên phần cứng dòng máy này.</p>
                      <p>• <strong>Đồng hồ lưu lượng & cảm biến áp suất:</strong> Không trang bị trên phần cứng dòng máy này.</p>
                    </div>
                  </div>

                  {/* Telemetry Table */}
                  <div>
                    <h3 className="font-bold text-gray-800 text-sm mb-3">Lịch Sử Chi Tiết (60 bản ghi gần nhất)</h3>
                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Thời gian</th>
                            <th className="p-3">TDS Ra</th>
                            <th className="p-3">Lõi PPC</th>
                            <th className="p-3">Màng RO</th>
                            <th className="p-3">Lõi CTO</th>
                            <th className="p-3">Bo Mạch</th>
                            <th className="p-3">Sóng Wi-Fi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {deviceTelemetry.slice(-30).reverse().map((t) => (
                            <tr key={t.id} className="hover:bg-gray-50">
                              <td className="p-3 font-mono">
                                {new Date(t.recordedAt).toLocaleString('vi-VN')}
                              </td>
                              <td className={`p-3 font-bold ${t.tdsOut && t.tdsOut > 50 ? 'text-rose-600' : 'text-blue-700'}`}>
                                {t.tdsOut ?? '--'} ppm
                              </td>
                              <td className="p-3 font-semibold text-gray-700">
                                {t.ppc != null ? `${t.ppc}%` : '--'}
                              </td>
                              <td className="p-3 font-semibold text-gray-700">
                                {t.ro != null ? `${t.ro}%` : '--'}
                              </td>
                              <td className={`p-3 font-semibold ${t.cto && t.cto <= 24 ? 'text-amber-700 font-bold' : 'text-gray-700'}`}>
                                {t.cto != null ? `${t.cto}%` : '--'}
                              </td>
                              <td className="p-3">
                                {t.uartOk === false ? (
                                  <span className="text-[10px] font-bold text-rose-600">Lỗi UART</span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-emerald-600">OK</span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-gray-500">
                                {t.rssi ? `${t.rssi} dBm` : '--'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: REGISTER NEW IOT DEVICE ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border-t-4 border-[#1B3A6B]">
            <div className="bg-gray-50/80 p-5 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <Plus className="text-blue-600" size={20} />
                Đăng Ký Máy IoT Mới
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddDevice} className="p-6 space-y-4">
              {addResult ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                    <CheckCircle2 size={18} />
                    {addResult.message}
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-emerald-100 text-xs space-y-1 font-mono text-gray-800">
                    <p><strong>MQTT Broker:</strong> {addResult.mqttConfig.broker}:1883</p>
                    <p><strong>Username:</strong> {addResult.mqttConfig.username}</p>
                    <p><strong>Topic:</strong> {addResult.mqttConfig.topic}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setAddResult(null);
                    }}
                    className="w-full bg-[#1B3A6B] text-white font-bold py-2.5 rounded-xl text-sm"
                  >
                    Hoàn thành
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                      Số Serial Thiết Bị (Bắt buộc)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: TRU-MLN-2026070001"
                      value={newSerial}
                      onChange={(e) => setNewSerial(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 uppercase font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Mỗi thiết bị IoT phải có 1 số Serial duy nhất đã đăng ký trong bảng Serial.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                      Mật Khẩu MQTT Kết Nối (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      placeholder="Nhập mật khẩu cho ESP32..."
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={submittingAdd}
                      className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60"
                    >
                      {submittingAdd && <Loader2 className="animate-spin" size={16} />}
                      Tạo Thiết Bị
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: SEND COMMAND TO ESP32 ── */}
      {showCommandModal && commandDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border-t-4 border-[#1B3A6B]">
            <div className="bg-gray-50/80 p-5 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <Send className="text-blue-600" size={18} />
                Gửi Lệnh — {commandDevice.serialNumber}
              </h2>
              <button
                onClick={() => setShowCommandModal(false)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Chọn Lệnh Điều Khiển
                </label>
                <select
                  value={selectedCommand}
                  onChange={(e) => setSelectedCommand(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-semibold"
                >
                  <option value="set_interval">⏱️ Đổi Tần Suất Gửi Data (Seconds)</option>
                  <option value="ping">📡 Ping (Yêu cầu gửi dữ liệu ngay)</option>
                  <option value="reboot">🔄 Reboot (Khởi động lại ESP32)</option>
                </select>
              </div>

              {selectedCommand === 'set_interval' && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Tần Suất Gửi Telemetry (Giây)
                  </label>
                  <input
                    type="number"
                    placeholder="VD: 60"
                    value={commandParam}
                    onChange={(e) => setCommandParam(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: '1 phút (60s)', val: '60' },
                      { label: '2 phút (120s)', val: '120' },
                      { label: '5 phút (300s)', val: '300' },
                      { label: '10 phút (600s)', val: '600' },
                    ].map((btn) => (
                      <button
                        key={btn.val}
                        type="button"
                        onClick={() => setCommandParam(btn.val)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                          commandParam === btn.val
                            ? 'bg-[#1B3A6B] text-white border-[#1B3A6B]'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Khuyến nghị: 2 phút (120s) để tối ưu hiệu năng và tránh phình dung lượng cơ sở dữ liệu.
                  </p>
                </div>
              )}

              {selectedCommand === 'ping' && (
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 text-xs text-blue-800">
                  Thiết bị ESP32 sẽ phản hồi ngay lập tức và gửi về 1 gói tin telemetry mới nhất.
                </div>
              )}

              {selectedCommand === 'reboot' && (
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-xs text-amber-800">
                  Khởi động lại chip ESP32 từ xa. Thiết bị sẽ tạm thời offline khoảng 3–5 giây trước khi kết nối lại.
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCommandModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSendCommand}
                  disabled={sendingCommand}
                  className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-60"
                >
                  {sendingCommand && <Loader2 className="animate-spin" size={16} />}
                  Gửi Lệnh MQTT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
