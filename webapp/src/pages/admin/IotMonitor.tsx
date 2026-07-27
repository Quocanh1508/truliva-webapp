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
  Gauge,
  Clock,
  X,
  ChevronRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

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
  };
}

interface IotDevice {
  id: string;
  serialNumber: string;
  mqttUsername: string | null;
  firmwareVersion: string | null;
  lastSeenAt: string | null;
  isOnline: boolean;
  latestTelemetry: Telemetry | null;
  unresolvedAlerts: number;
  totalReadings: number;
  createdAt: string;
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

  // New device modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSerial, setNewSerial] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addResult, setAddResult] = useState<any>(null);

  // Command modal
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [commandDevice, setCommandDevice] = useState<IotDevice | null>(null);
  const [selectedCommand, setSelectedCommand] = useState('reboot');
  const [commandParam, setCommandParam] = useState('');
  const [sendingCommand, setSendingCommand] = useState(false);

  // Fetch devices data
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [devicesRes, alertsRes] = await Promise.all([
        fetch('/api/iot/devices', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch('/api/iot/alerts?resolved=false', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      ]);

      if (devicesRes.ok) {
        const data = await devicesRes.json();
        setDevices(data.devices || []);
      }

      if (alertsRes.ok) {
        const alertData = await alertsRes.json();
        setAlerts(alertData.alerts || []);
      }
    } catch (error) {
      console.error('Error fetching IoT data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto refresh every 30 seconds
    const timer = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // Fetch telemetry history when a device is selected
  const handleSelectDevice = async (device: IotDevice) => {
    setSelectedDevice(device);
    setLoadingTelemetry(true);
    try {
      const res = await fetch(`/api/iot/devices/${device.serialNumber}/telemetry?limit=50`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Sort ascending for chart
        const sorted = (data.telemetry || []).sort(
          (a: Telemetry, b: Telemetry) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
        );
        setDeviceTelemetry(sorted);
      }
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
      const res = await fetch('/api/iot/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          serialNumber: newSerial.trim().toUpperCase(),
          mqttPassword: newPassword.trim() || undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        setAddResult(data);
        fetchData(true);
      } else {
        alert(data.error || 'Lỗi khi đăng ký thiết bị');
      }
    } catch (error) {
      alert('Lỗi kết nối server');
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Send command to ESP32
  const handleSendCommand = async () => {
    if (!commandDevice) return;
    setSendingCommand(true);
    try {
      let params = {};
      if (selectedCommand === 'set_interval') {
        params = { interval_s: Number(commandParam) || 300 };
      }

      const res = await fetch(`/api/iot/devices/${commandDevice.serialNumber}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ command: selectedCommand, params })
      });

      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${data.message}`);
        setShowCommandModal(false);
      } else {
        alert(`❌ ${data.error}`);
      }
    } catch (e) {
      alert('Lỗi khi gửi lệnh');
    } finally {
      setSendingCommand(false);
    }
  };

  // Resolve alert
  const handleResolveAlert = async (alertId: string) => {
    try {
      const res = await fetch(`/api/iot/alerts/${alertId}/resolve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
        fetchData(true);
      }
    } catch (e) {
      console.error('Resolve alert error:', e);
    }
  };

  // Filtered devices
  const filteredDevices = devices.filter((d) => {
    const matchSearch = d.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
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
              Theo dõi chất lượng nước (TDS), lưu lượng & cảnh báo tức thời từ máy lọc nước Truliva
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
                placeholder="Tìm số Serial..."
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
          {alerts.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-gray-100 shadow-sm text-gray-500">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
              <h3 className="font-bold text-gray-800 text-lg">Không Có Cảnh Báo Nào</h3>
              <p className="text-sm mt-1">Tất cả máy lọc nước IoT đều đang hoạt động bình thường.</p>
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
                    </div>
                    <p className="text-sm font-medium mt-1">{alert.message}</p>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(alert.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleResolveAlert(alert.id)}
                  className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 self-end sm:self-center"
                >
                  <CheckCircle2 size={14} />
                  Đánh dấu Đã xử lý
                </button>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ── DEVICES GRID / CARDS ── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDevices.length === 0 ? (
            <div className="col-span-full bg-white p-12 text-center rounded-2xl border border-gray-100 shadow-sm text-gray-500">
              <Cpu size={48} className="mx-auto text-gray-300 mb-3" />
              <h3 className="font-bold text-gray-800 text-lg">Chưa Có Thiết Bị IoT Nào</h3>
              <p className="text-sm mt-1">Bấm nút "Đăng ký Máy IoT" để kết nối thiết bị ESP32 đầu tiên.</p>
            </div>
          ) : (
            filteredDevices.map((device) => {
              const tel = device.latestTelemetry;
              const isTdsHigh = tel?.tdsOut && tel.tdsOut > 50;

              return (
                <div
                  key={device.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4 relative overflow-hidden group"
                >
                  {/* Top Status Bar */}
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-[#1B3A6B] text-white flex items-center justify-center font-mono font-bold text-xs">
                        IoT
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 font-mono tracking-tight text-base">
                          {device.serialNumber}
                        </h3>
                        <p className="text-xs text-gray-400">
                          FW: {device.firmwareVersion || 'v1.0.0'}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
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
                  </div>

                  {/* Telemetry Info Cards */}
                  {tel ? (
                    <div className="grid grid-cols-2 gap-3">
                      {/* TDS Out */}
                      <div
                        className={`p-3 rounded-xl border flex flex-col justify-between ${
                          isTdsHigh
                            ? 'bg-rose-50/80 border-rose-200'
                            : 'bg-blue-50/60 border-blue-100'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Droplets size={14} className={isTdsHigh ? 'text-rose-600' : 'text-blue-600'} />
                            TDS Đầu Ra
                          </span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1">
                          <span
                            className={`text-2xl font-black ${
                              isTdsHigh ? 'text-rose-700' : 'text-[#1B3A6B]'
                            }`}
                          >
                            {tel.tdsOut ?? '--'}
                          </span>
                          <span className="text-xs text-gray-500 font-semibold">ppm</span>
                        </div>
                      </div>

                      {/* TDS In */}
                      <div className="p-3 rounded-xl border bg-gray-50/70 border-gray-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                          <span>TDS Đầu Vào</span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-gray-700">
                            {tel.tdsIn ?? '--'}
                          </span>
                          <span className="text-xs text-gray-500 font-semibold">ppm</span>
                        </div>
                      </div>

                      {/* Water Flow */}
                      <div className="p-3 rounded-xl border bg-gray-50/70 border-gray-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Gauge size={14} className="text-cyan-600" />
                            Lưu Lượng
                          </span>
                        </div>
                        <div className="mt-2 flex items-baseline gap-1">
                          <span className="text-xl font-bold text-gray-800">
                            {tel.waterFlowLpm ?? '--'}
                          </span>
                          <span className="text-xs text-gray-500 font-semibold">L/min</span>
                        </div>
                      </div>

                      {/* Pump Status */}
                      <div className="p-3 rounded-xl border bg-gray-50/70 border-gray-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                          <span>Trạng Thái Bơm</span>
                        </div>
                        <div className="mt-2">
                          <span
                            className={`text-xs font-extrabold px-2 py-1 rounded-md uppercase tracking-wider ${
                              tel.pumpStatus === 'RUNNING'
                                ? 'bg-emerald-100 text-emerald-800'
                                : tel.pumpStatus === 'ERROR'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {tel.pumpStatus || 'OFF'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-gray-400 bg-gray-50 rounded-xl text-xs">
                      Chưa nhận được dữ liệu cảm biến
                    </div>
                  )}

                  {/* Unresolved Alerts Badge if any */}
                  {device.unresolvedAlerts > 0 && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-3 py-2 rounded-xl font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-rose-600" />
                        Có {device.unresolvedAlerts} cảnh báo chưa xử lý
                      </span>
                    </div>
                  )}

                  {/* Footer Info & Actions */}
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {device.lastSeenAt
                        ? new Date(device.lastSeenAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Chưa từng online'}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setCommandDevice(device);
                          setSelectedCommand('reboot');
                          setShowCommandModal(true);
                        }}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs"
                      >
                        <Send size={12} />
                        Lệnh
                      </button>
                      <button
                        onClick={() => handleSelectDevice(device)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs"
                      >
                        Biểu đồ
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
                    Lịch Sử Cảm Biến — {selectedDevice.serialNumber}
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
                  <p className="text-xs text-gray-500">Biểu đồ biến thiên chỉ số TDS theo thời gian</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDevice(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
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
                  {/* TDS Chart */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100">
                    <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                      <Droplets size={16} className="text-blue-600" />
                      Biểu Đồ Chỉ Số TDS (PPM)
                    </h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={deviceTelemetry}>
                          <defs>
                            <linearGradient id="tdsOutGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                            </linearGradient>
                            <linearGradient id="tdsInGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#94A3B8" stopOpacity={0.0} />
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
                            name="TDS Đầu Ra (Sau lọc)"
                            stroke="#2563EB"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#tdsOutGrad)"
                          />
                          <Area
                            type="monotone"
                            dataKey="tdsIn"
                            name="TDS Đầu Vào (Thô)"
                            stroke="#94A3B8"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            fillOpacity={1}
                            fill="url(#tdsInGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Telemetry Table */}
                  <div>
                    <h3 className="font-bold text-gray-800 text-sm mb-3">Lịch Sử Chi Tiết (50 bản ghi gần nhất)</h3>
                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Thời gian</th>
                            <th className="p-3">TDS Vào</th>
                            <th className="p-3">TDS Ra</th>
                            <th className="p-3">Lưu lượng</th>
                            <th className="p-3">Trạng thái Bơm</th>
                            <th className="p-3">Mã lỗi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {deviceTelemetry.map((t) => (
                            <tr key={t.id} className="hover:bg-gray-50">
                              <td className="p-3 font-mono">
                                {new Date(t.recordedAt).toLocaleString('vi-VN')}
                              </td>
                              <td className="p-3 font-bold text-gray-600">{t.tdsIn ?? '--'} ppm</td>
                              <td className={`p-3 font-bold ${t.tdsOut && t.tdsOut > 50 ? 'text-rose-600' : 'text-blue-600'}`}>
                                {t.tdsOut ?? '--'} ppm
                              </td>
                              <td className="p-3">{t.waterFlowLpm ?? '--'} L/min</td>
                              <td className="p-3 font-semibold">{t.pumpStatus || 'OFF'}</td>
                              <td className="p-3 font-mono">{t.errorCode}</td>
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
                  <option value="reboot">🔄 Reboot (Khởi động lại ESP32)</option>
                  <option value="set_interval">⏱️ Đổi Tần Suất Gửi Data (Seconds)</option>
                </select>
              </div>

              {selectedCommand === 'set_interval' && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Tần suất gửi (Giây)
                  </label>
                  <input
                    type="number"
                    placeholder="VD: 300 (5 phút)"
                    value={commandParam}
                    onChange={(e) => setCommandParam(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
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
