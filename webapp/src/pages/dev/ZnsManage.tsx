import React, { useState, useEffect } from 'react';
import { 
  Send, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Search, 
  Activity, 
  ShieldCheck, 
  AlertTriangle,
  Server,
  MessageSquare,
  Clock,
  Info
} from 'lucide-react';
import { fetchApi } from '../../api/client';

interface ZnsLog {
  timestamp?: string;
  phone?: string;
  refId?: string;
  messageId?: string;
  durationMs?: string;
  level?: string;
  message?: string;
  error?: string;
  details?: any;
}

interface ActivatedSerial {
  id: string;
  serialNumber: string;
  model: string;
  customerName: string | null;
  customerPhone: string | null;
  status: string;
  activationDate: string | null;
  warrantyExpiryDate: string | null;
}

export default function ZnsManage() {
  const [activeTab, setActiveTab] = useState<'logs' | 'lookup' | 'tester'>('logs');
  const [loading, setLoading] = useState(false);
  const [serverZnsLogs, setServerZnsLogs] = useState<ZnsLog[]>([]);
  const [activatedSerials, setActivatedSerials] = useState<ActivatedSerial[]>([]);
  
  // State cho Lookup
  const [lookupMsgId, setLookupMsgId] = useState('');
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [loadingLookup, setLoadingLookup] = useState(false);

  // State cho Test Send
  const [testPhone, setTestPhone] = useState('0915185982');
  const [testSerial, setTestSerial] = useState('185826020700016');
  const [testName, setTestName] = useState('Khách Hàng Test');
  const [testProduct, setTestProduct] = useState('Máy lọc nước Truliva UR61096H');
  const [testExpiry, setTestExpiry] = useState('20/07/2027');
  const [testResult, setTestResult] = useState<any>(null);
  const [loadingTest, setLoadingTest] = useState(false);

  // Modal xem JSON chi tiết
  const [inspectModal, setInspectModal] = useState<{ isOpen: boolean; title: string; data: any }>({
    isOpen: false,
    title: '',
    data: null
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchApi('/serials/zns/logs');
      if (data.success) {
        setServerZnsLogs(data.serverZnsLogs || []);
        setActivatedSerials(data.activatedSerials || []);
      }
    } catch (err: any) {
      console.error('Lỗi tải nhật ký ZNS:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleLookup = async (msgId: string) => {
    if (!msgId.trim()) return;
    setLoadingLookup(true);
    setLookupResult(null);
    try {
      const data = await fetchApi('/serials/zns/check-status', {
        method: 'POST',
        body: JSON.stringify({ msg_id: msgId.trim() })
      });
      if (data.success) {
        setLookupResult(data.data);
      }
    } catch (err: any) {
      setLookupResult({ error: err.message });
    } finally {
      setLoadingLookup(false);
    }
  };

  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim() || !testSerial.trim()) {
      alert('Vui lòng nhập số điện thoại và số Serial');
      return;
    }
    setLoadingTest(true);
    setTestResult(null);
    try {
      const data = await fetchApi('/serials/zns/test-send', {
        method: 'POST',
        body: JSON.stringify({
          phone: testPhone.trim(),
          serialNumber: testSerial.trim(),
          customerName: testName.trim(),
          productName: testProduct.trim(),
          expiryDate: testExpiry.trim()
        })
      });
      setTestResult(data);
      fetchLogs();
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setLoadingTest(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Send size={22} />
            </span>
            <h1 className="text-xl font-bold text-gray-900">Quản lý & Giám sát Zalo ZNS</h1>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Theo dõi nhật ký phát tin, kiểm tra lỗi Zalo Platform & thử nghiệm gửi tin nhắn trực tiếp qua FPT FNS Gateway
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới log</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Cổng phát tin</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">FPT FNS Gateway</p>
            <span className="inline-flex items-center text-[11px] text-emerald-600 font-medium mt-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1 animate-pulse"></span>
              Đang hoạt động (Active)
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Server size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">ZNS Template ID</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">10232 (Đã phê duyệt)</p>
            <p className="text-[11px] text-gray-400">Template dịch vụ bảo hành</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Tốc độ gửi trung bình</p>
            <p className="text-sm font-bold text-indigo-600 mt-0.5">~145 ms (Tức thì)</p>
            <p className="text-[11px] text-gray-400">Truyền trực tiếp Real-time</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <MessageSquare size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Số Ca đã kích hoạt</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">{activatedSerials.length} bản ghi gần nhất</p>
            <p className="text-[11px] text-gray-400">Sẵn sàng tra cứu status</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-3 space-x-4">
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 px-2 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Clock size={15} />
            <span>Nhật ký gửi ZNS gần nhất ({serverZnsLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('lookup')}
            className={`pb-3 px-2 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
              activeTab === 'lookup'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Search size={15} />
            <span>Tra cứu trực tiếp FNS (Check Status)</span>
          </button>

          <button
            onClick={() => setActiveTab('tester')}
            className={`pb-3 px-2 text-xs font-semibold flex items-center space-x-1.5 border-b-2 transition-colors ${
              activeTab === 'tester'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Send size={15} />
            <span>Công cụ Gửi thử nghiệm (ZNS Sandbox)</span>
          </button>
        </div>

        {/* Tab 1: Nhật ký gửi ZNS */}
        {activeTab === 'logs' && (
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Hiển thị các giao dịch phát tin nhắn ZNS gần nhất từ Server Logs & Database</span>
              {loading && <span className="text-blue-600 font-medium">Đang cập nhật...</span>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-700 border border-gray-200 rounded-lg">
                <thead className="bg-gray-100 text-gray-700 uppercase font-semibold text-[11px]">
                  <tr>
                    <th className="px-3.5 py-2.5">Thời gian</th>
                    <th className="px-3.5 py-2.5">Số ĐT nhận</th>
                    <th className="px-3.5 py-2.5">Số Serial / Ref ID</th>
                    <th className="px-3.5 py-2.5">Mã tin (Message ID)</th>
                    <th className="px-3.5 py-2.5">Tốc độ (Latency)</th>
                    <th className="px-3.5 py-2.5">Trạng thái phát</th>
                    <th className="px-3.5 py-2.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {serverZnsLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-400">
                        Chưa tìm thấy nhật ký ZNS mới trong file log.
                      </td>
                    </tr>
                  ) : (
                    serverZnsLogs.map((log, idx) => {
                      const isSuccess = log.message?.includes('successfully');
                      const isError = log.level === 'error' || log.message?.includes('Error');
                      const msgId = log.messageId || log.details?.message_id;

                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3.5 py-2.5 font-mono text-[11px] text-gray-600 whitespace-nowrap">
                            {log.timestamp || 'N/A'}
                          </td>
                          <td className="px-3.5 py-2.5 font-semibold text-gray-800">
                            {log.phone || log.details?.phone || 'N/A'}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-blue-600">
                            {log.refId || 'N/A'}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-gray-600">
                            {msgId ? (
                              <span className="bg-gray-100 px-2 py-0.5 rounded text-[11px]">{msgId}</span>
                            ) : (
                              <span className="text-gray-400 italic">Chưa cấp</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 font-semibold text-indigo-600">
                            {log.durationMs || 'N/A'}
                          </td>
                          <td className="px-3.5 py-2.5">
                            {isSuccess ? (
                              <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px] font-medium border border-emerald-200">
                                <CheckCircle2 size={12} className="mr-1 text-emerald-600" />
                                Đã gửi thành công
                              </span>
                            ) : isError ? (
                              <span className="inline-flex items-center text-red-700 bg-red-50 px-2 py-0.5 rounded-full text-[11px] font-medium border border-red-200">
                                <XCircle size={12} className="mr-1 text-red-600" />
                                Lỗi phát tin
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full text-[11px] font-medium">
                                Đang phát...
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right space-x-1">
                            {msgId && (
                              <button
                                onClick={() => {
                                  setLookupMsgId(msgId);
                                  setActiveTab('lookup');
                                  handleLookup(msgId);
                                }}
                                className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[11px] font-medium transition-colors"
                              >
                                Tra cứu FNS
                              </button>
                            )}
                            <button
                              onClick={() => setInspectModal({ isOpen: true, title: 'Chi tiết Log ZNS', data: log })}
                              className="px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded text-[11px] font-medium transition-colors"
                            >
                              Xem JSON
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Danh sách các ca vừa kích hoạt gần đây */}
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">
                Danh sách 10 Serial đã kích hoạt gần nhất
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activatedSerials.slice(0, 10).map((s) => (
                  <div key={s.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-gray-800 font-mono">{s.serialNumber} <span className="font-normal text-gray-500">({s.model})</span></p>
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        KH: <span className="font-medium text-gray-700">{s.customerName || 'N/A'}</span> - {s.customerPhone || 'N/A'}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Kích hoạt lúc: {s.activationDate ? new Date(s.activationDate).toLocaleString('vi-VN') : 'N/A'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setTestSerial(s.serialNumber);
                        if (s.customerPhone) setTestPhone(s.customerPhone);
                        if (s.customerName) setTestName(s.customerName);
                        setActiveTab('tester');
                      }}
                      className="px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-[11px] font-medium"
                    >
                      Bắn lại ZNS
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Tra cứu trực tiếp FNS (Check Status) */}
        {activeTab === 'lookup' && (
          <div className="p-5 space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 flex items-start space-x-3 text-xs text-blue-800">
              <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Công cụ tra cứu trạng thái Zalo Platform trực tiếp (Live FNS Check-Status)</p>
                <p className="mt-0.5 text-blue-700">
                  Nhập mã <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">msg_id</code> nhận từ FNS để hệ thống truy vấn trực tiếp Zalo Cloud xem tin nhắn đã gửi đến máy khách hàng hay bị từ chối do lỗi nào (như lỗi -1124, sai số điện thoại, chặn OA,...).
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
              <input
                type="text"
                placeholder="Nhập mã msg_id (Ví dụ: 40bda896-64ad-4f3f-a2f7-91ef0f7d05bf)..."
                value={lookupMsgId}
                onChange={(e) => setLookupMsgId(e.target.value)}
                className="flex-1 px-3.5 py-2 text-xs border border-gray-300 rounded-lg outline-none focus:border-blue-500 font-mono bg-white"
              />
              <button
                onClick={() => handleLookup(lookupMsgId)}
                disabled={loadingLookup || !lookupMsgId.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-semibold flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                <Search size={14} />
                <span>{loadingLookup ? 'Đang truy vấn Zalo...' : 'Tra cứu ngay'}</span>
              </button>
            </div>

            {lookupResult && (
              <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-xs space-y-3 max-w-3xl">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                  <span className="text-gray-400 font-sans font-semibold">Kết quả tra cứu FNS Check-Status</span>
                  {lookupResult.status === 2 ? (
                    <span className="text-emerald-400 font-sans font-bold flex items-center">
                      <CheckCircle2 size={14} className="mr-1" /> GỬI THÀNH CÔNG (STATUS: 2)
                    </span>
                  ) : lookupResult.status === -1 ? (
                    <span className="text-red-400 font-sans font-bold flex items-center">
                      <XCircle size={14} className="mr-1" /> THẤT BẠI (STATUS: -1)
                    </span>
                  ) : (
                    <span className="text-amber-400 font-sans font-bold">STATUS: {lookupResult.status}</span>
                  )}
                </div>

                {lookupResult.error_info && (
                  <div className="p-3 bg-red-950/50 border border-red-800/50 rounded-lg text-red-300">
                    <p className="font-sans font-bold text-red-400 flex items-center">
                      <AlertTriangle size={14} className="mr-1.5" /> Lỗi Zalo Platform ({lookupResult.error}):
                    </p>
                    <p className="mt-1 font-semibold text-sm">{lookupResult.error_info}</p>
                  </div>
                )}

                <pre className="overflow-x-auto text-[11px] text-emerald-300">
                  {JSON.stringify(lookupResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Sandbox Tester */}
        {activeTab === 'tester' && (
          <div className="p-5 space-y-5 max-w-3xl">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3.5 flex items-start space-x-3 text-xs text-indigo-900">
              <Send size={18} className="text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Công cụ thử nghiệm phát tin ZNS Sandbox (Dev Live Test)</p>
                <p className="mt-0.5 text-indigo-700">
                  Nhập số điện thoại và thông tin thử nghiệm để phát ngay 1 tin nhắn ZNS xác nhận bảo hành đến Zalo cá nhân của bạn.
                </p>
              </div>
            </div>

            <form onSubmit={handleTestSend} className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Số điện thoại nhận ZNS *</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Ví dụ: 0915185982..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Số Serial *</label>
                  <input
                    type="text"
                    value={testSerial}
                    onChange={(e) => setTestSerial(e.target.value)}
                    placeholder="Ví dụ: 185826020700016..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 font-mono bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Tên khách hàng (Ten_Khach_Hang)</label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Tên sản phẩm (Ten_San_Pham)</label>
                  <input
                    type="text"
                    value={testProduct}
                    onChange={(e) => setTestProduct(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Ngày hết hạn (Ngay_Het_Bao_Hanh)</label>
                  <input
                    type="text"
                    value={testExpiry}
                    onChange={(e) => setTestExpiry(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 font-mono bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loadingTest}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center space-x-2 text-xs transition-colors shadow-sm disabled:opacity-50"
                >
                  <Send size={15} />
                  <span>{loadingTest ? 'Đang gửi & Kiểm tra FNS...' : 'Bắt đầu gửi thử nghiệm'}</span>
                </button>
              </div>
            </form>

            {testResult && (
              <div className="bg-gray-900 text-gray-100 p-4 rounded-xl font-mono text-xs space-y-3">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                  <span className="text-gray-400 font-sans font-semibold">Kết quả thử nghiệm bắn ZNS & Live Status</span>
                  {testResult.statusResult?.status === 2 ? (
                    <span className="text-emerald-400 font-sans font-bold flex items-center">
                      <CheckCircle2 size={14} className="mr-1" /> ZALO ĐÃ PHÁT THÀNH CÔNG (STATUS: 2)
                    </span>
                  ) : testResult.statusResult?.status === -1 ? (
                    <span className="text-red-400 font-sans font-bold flex items-center">
                      <XCircle size={14} className="mr-1" /> ZALO TỪ CHỐI TIN NHẮN (STATUS: -1)
                    </span>
                  ) : (
                    <span className="text-blue-400 font-sans font-bold">FNS ACCEPTED (MSG ID: {testResult.msgId})</span>
                  )}
                </div>

                <pre className="overflow-x-auto text-[11px] text-blue-300">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Inspect JSON */}
      {inspectModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-800 text-sm">{inspectModal.title}</h3>
              <button
                onClick={() => setInspectModal({ isOpen: false, title: '', data: null })}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="bg-gray-900 text-emerald-400 p-4 rounded-lg font-mono text-xs max-h-96 overflow-y-auto">
              <pre>{JSON.stringify(inspectModal.data, null, 2)}</pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectModal({ isOpen: false, title: '', data: null })}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-xs rounded-lg"
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
