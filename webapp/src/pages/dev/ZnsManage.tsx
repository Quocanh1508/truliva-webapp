import React, { useState, useEffect, useCallback } from 'react';
import { 
  Send, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Search, 
  Activity, 
  ShieldCheck, 
  AlertTriangle,
  MessageSquare,
  Clock,
  Info,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Phone,
  Layers,
  Zap,
  RotateCcw,
  Edit3,
  Save,
  FilePlus,
  HelpCircle
} from 'lucide-react';
import { fetchApi } from '../../api/client';

interface ZnsDispatch {
  id: string;
  timestamp: string;
  phone: string;
  serialNumber: string;
  customerName?: string;
  model?: string;
  productName?: string | null;
  productLine?: string | null;
  messageId?: string | null;
  durationMs?: string;
  status: 'SUCCESS' | 'FAILED' | 'SENT';
  error?: string | null;
  templateId?: string;
  gateway?: string;
  orderNumber?: string | number | null;
  warrantyExpiryDate?: string | null;
  activationDate?: string | null;
  assignedKtv?: { fullName: string; phoneNumber?: string | null } | null;
  raw?: string;
}

// Mẫu tin đang/đã sử dụng trong hệ thống
const TEMPLATE_INFO: Record<string, { label: string; channel: 'ZALO' | 'FNS' | 'LEGACY' }> = {
  '666024': { label: 'Lắp đặt – Máy lọc nước', channel: 'ZALO' },
  '666039': { label: 'Lắp đặt – Sản phẩm khác', channel: 'ZALO' },
  '10233': { label: 'Hoàn thành dịch vụ (TL/BH/SC)', channel: 'FNS' },
  '10232': { label: 'Lắp đặt – FNS dự phòng', channel: 'FNS' },
  '617366': { label: 'Mẫu cũ – đã ngừng', channel: 'LEGACY' }
};

function gatewayBadge(gateway?: string, templateId?: string): { text: string; cls: string } {
  const g = (gateway || '').toLowerCase();
  const isSandbox = g.includes('sandbox');
  if (g.includes('zalo oa')) {
    return { text: `🔵 Zalo OA${isSandbox ? ' (Sandbox)' : ''}`, cls: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  if (g.includes('fns') || templateId === '10232' || templateId === '10233') {
    return { text: `🟣 FPT FNS${isSandbox ? ' (Sandbox)' : ''}`, cls: 'bg-purple-50 text-purple-700 border-purple-200' };
  }
  return { text: '⚪ Zalo Direct cũ (đã ngừng)', cls: 'bg-gray-100 text-gray-500 border-gray-200' };
}

interface ZnsTemplateRow {
  templateId: number | string;
  templateName: string;
  status: string;
  templateQuality?: string | null;
  createdTime?: number;
}

export default function ZnsManage() {
  const [activeTab, setActiveTab] = useState<'list' | 'lookup' | 'tester' | 'logs' | 'templates'>('list');

  // Tab Mẫu ZNS (đọc trực tiếp từ Zalo OA)
  const [templates, setTemplates] = useState<ZnsTemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [templateStatusFilter, setTemplateStatusFilter] = useState<'ENABLE' | 'ALL'>('ENABLE');
  const [templateDetail, setTemplateDetail] = useState<{ id: string; loading: boolean; data: any; error: string } | null>(null);
  const [filterTemplate, setFilterTemplate] = useState<string>('ALL');
  const [testTemplate, setTestTemplate] = useState<string>('666024');
  const [loading, setLoading] = useState(false);
  
  // State Danh sách ZNS Dispatches & Phân trang
  const [dispatches, setDispatches] = useState<ZnsDispatch[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [serverZnsLogs, setServerZnsLogs] = useState<ZnsDispatch[]>([]);
  const [stats, setStats] = useState({ totalDispatches: 0, totalSuccess: 0, totalFailed: 0, totalFound: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  // Bộ lọc danh sách ZNS
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterModel, setFilterModel] = useState<string>('ALL');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // State Tra cứu mở rộng (Lookup Tab)
  const [lookupType, setLookupType] = useState<'all' | 'msg_id' | 'phone' | 'serial'>('all');
  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [loadingLookup, setLoadingLookup] = useState(false);

  // State Test Send / Sandbox
  const [testPhone, setTestPhone] = useState('0915185982');
  const [testSerial, setTestSerial] = useState('185826020700016');
  const [testName, setTestName] = useState('Khách Hàng Test');
  const [testProduct, setTestProduct] = useState('Máy lọc nước Truliva UR61096H');
  const [testExpiry, setTestExpiry] = useState('20/08/2027');
  const [testResult, setTestResult] = useState<any>(null);
  const [loadingTest, setLoadingTest] = useState(false);

  // Modal Bắn lại ZNS nhanh
  const [resendModal, setResendModal] = useState<{
    isOpen: boolean;
    dispatch: ZnsDispatch | null;
    phone: string;
    serialNumber: string;
    name: string;
    product: string;
    expiry: string;
    gatewayMode: 'AUTO' | 'ZALO_DIRECT' | 'FNS_GATEWAY';
    loading: boolean;
    result: any;
  }>({
    isOpen: false,
    dispatch: null,
    phone: '',
    serialNumber: '',
    name: '',
    product: '',
    expiry: '',
    gatewayMode: 'AUTO',
    loading: false,
    result: null
  });

  // Modal Inspect JSON
  const [inspectModal, setInspectModal] = useState<{ isOpen: boolean; title: string; data: any }>({
    isOpen: false,
    title: '',
    data: null
  });

  // Modal Chỉnh sửa thông tin bản ghi ZNS
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    dispatch: ZnsDispatch | null;
    phone: string;
    serialNumber: string;
    customerName: string;
    productName: string;
    orderNumber: string;
    status: 'SUCCESS' | 'FAILED';
    error: string;
    loading: boolean;
  }>({
    isOpen: false,
    dispatch: null,
    phone: '',
    serialNumber: '',
    customerName: '',
    productName: '',
    orderNumber: '',
    status: 'SUCCESS',
    error: '',
    loading: false
  });

  // Modal Xác nhận Lưu (3 Lựa chọn: Tạo trùng lặp, Ghi đè, Hủy)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    loading: boolean;
  }>({
    isOpen: false,
    loading: false
  });

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch danh sách các lượt gửi ZNS từ Backend
  const fetchData = useCallback(async (pageToLoad = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageToLoad),
        limit: String(pagination.limit),
        search: search.trim(),
        status: filterStatus,
        model: filterModel,
        templateId: filterTemplate,
        startDate: filterStartDate,
        endDate: filterEndDate
      });

      const res = await fetchApi(`/serials/zns/logs?${params.toString()}`);
      if (res && res.success) {
        setDispatches(res.znsDispatches || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
        if (res.stats) {
          setStats(res.stats);
        }
        if (res.availableModels) {
          setAvailableModels(res.availableModels);
        }
        if (res.serverZnsLogs) {
          setServerZnsLogs(res.serverZnsLogs);
        }
      }
    } catch (err: any) {
      console.error('Lỗi tải danh sách ZNS:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, filterStatus, filterModel, filterTemplate, filterStartDate, filterEndDate]);

  useEffect(() => {
    fetchData(1);
  }, [filterStatus, filterModel, filterTemplate, filterStartDate, filterEndDate]);

  // Tải danh sách mẫu ZNS từ Zalo OA khi mở tab
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError('');
    try {
      const res = await fetchApi('/serials/zns/templates');
      setTemplates(res.templates || []);
    } catch (err: any) {
      setTemplatesError(err.message || 'Không tải được danh sách mẫu từ Zalo OA');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'templates' && templates.length === 0 && !templatesLoading) {
      loadTemplates();
    }
  }, [activeTab]);

  const openTemplateDetail = async (id: string) => {
    setTemplateDetail({ id, loading: true, data: null, error: '' });
    try {
      const res = await fetchApi(`/serials/zns/templates?id=${encodeURIComponent(id)}`);
      setTemplateDetail({ id, loading: false, data: res.template, error: '' });
    } catch (err: any) {
      setTemplateDetail({ id, loading: false, data: null, error: err.message || 'Lỗi tải chi tiết mẫu' });
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Xử lý tra cứu mở rộng
  const handlePerformLookup = async (overrideValue?: string) => {
    const rawVal = (overrideValue !== undefined ? overrideValue : lookupInput).trim();
    if (!rawVal) return;

    setLoadingLookup(true);
    setLookupResult(null);

    try {
      const payload: any = {};
      if (lookupType === 'msg_id' || (lookupType === 'all' && (rawVal.includes('-') && rawVal.length > 20))) {
        payload.msg_id = rawVal;
      } else if (lookupType === 'phone' || (lookupType === 'all' && (/^(0|\+84|84)[0-9]{8,10}$/.test(rawVal.replace(/\s+/g, ''))))) {
        payload.phone = rawVal;
      } else if (lookupType === 'serial' || (lookupType === 'all' && (rawVal.length >= 10 && /^\d+$/.test(rawVal)))) {
        payload.serialNumber = rawVal;
      } else {
        payload.serialNumber = rawVal;
        payload.phone = rawVal;
        payload.msg_id = rawVal;
      }

      const res = await fetchApi('/serials/zns/check-status', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res.success) {
        setLookupResult(res);
      } else {
        setLookupResult({ error: res.error || 'Không tìm thấy thông tin' });
      }
    } catch (err: any) {
      setLookupResult({ error: err.message || 'Lỗi tra cứu hệ thống Zalo' });
    } finally {
      setLoadingLookup(false);
    }
  };

  // Mở modal bắn lại ZNS cho một Dispatch
  const handleOpenResend = (d: ZnsDispatch) => {
    let expiryStr = '';
    if (d.warrantyExpiryDate) {
      const dateObj = new Date(d.warrantyExpiryDate);
      expiryStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
    } else {
      const dateObj = new Date();
      dateObj.setMonth(dateObj.getMonth() + 12);
      expiryStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
    }

    setResendModal({
      isOpen: true,
      dispatch: d,
      phone: d.phone !== 'N/A' ? d.phone : '',
      serialNumber: d.serialNumber !== 'N/A' ? d.serialNumber : '',
      name: d.customerName || 'Quý Khách',
      product: d.model || 'Máy lọc nước Truliva',
      expiry: expiryStr,
      gatewayMode: 'AUTO',
      loading: false,
      result: null
    });
  };

  // Thực hiện bắn lại ZNS
  const handleExecuteResend = async () => {
    if (!resendModal.phone || !resendModal.serialNumber) {
      alert('Vui lòng kiểm tra lại số điện thoại và Serial');
      return;
    }
    setResendModal(prev => ({ ...prev, loading: true, result: null }));
    try {
      const res = await fetchApi('/serials/zns/test-send', {
        method: 'POST',
        body: JSON.stringify({
          phone: resendModal.phone.trim(),
          serialNumber: resendModal.serialNumber.trim(),
          customerName: resendModal.name.trim(),
          productName: resendModal.product.trim(),
          expiryDate: resendModal.expiry.trim(),
          gatewayMode: resendModal.gatewayMode
        })
      });
      setResendModal(prev => ({ ...prev, loading: false, result: res }));
      fetchData(pagination.page);
    } catch (err: any) {
      setResendModal(prev => ({ ...prev, loading: false, result: { error: err.message } }));
    }
  };

  // Mở modal Chỉnh sửa thông tin ZNS
  const handleOpenEdit = (d: ZnsDispatch) => {
    setEditModal({
      isOpen: true,
      dispatch: d,
      phone: d.phone && d.phone !== 'N/A' ? d.phone : '',
      serialNumber: d.serialNumber && d.serialNumber !== 'N/A' ? d.serialNumber : '',
      customerName: d.customerName || '',
      productName: d.model || d.productName || 'Máy lọc nước Truliva',
      orderNumber: d.orderNumber ? String(d.orderNumber) : '',
      status: (d.status === 'FAILED' ? 'FAILED' : 'SUCCESS'),
      error: d.error || '',
      loading: false
    });
  };

  // Nhấn nút "Lưu thay đổi" -> Bật hộp thoại hỏi 3 lựa chọn
  const handlePreSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.phone.trim()) {
      alert('Vui lòng nhập số điện thoại nhận ZNS!');
      return;
    }
    setConfirmModal({ isOpen: true, loading: false });
  };

  // Thực hiện Lưu (Tạo trùng lặp DUPLICATE hoặc Ghi đè OVERWRITE)
  const handleExecuteSave = async (mode: 'DUPLICATE' | 'OVERWRITE') => {
    if (!editModal.dispatch) return;
    setConfirmModal(prev => ({ ...prev, loading: true }));

    try {
      const res = await fetchApi(`/serials/zns/logs/${editModal.dispatch.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          mode,
          phone: editModal.phone.trim(),
          serialNumber: editModal.serialNumber.trim() || null,
          customerName: editModal.customerName.trim() || 'Khách Hàng',
          productName: editModal.productName.trim() || 'Máy lọc nước Truliva',
          orderNumber: editModal.orderNumber.trim() || null,
          status: editModal.status,
          error: editModal.error.trim() || null
        })
      });

      if (res && res.success) {
        setConfirmModal({ isOpen: false, loading: false });
        setEditModal(prev => ({ ...prev, isOpen: false }));
        // Tải lại danh sách ngay lập tức
        fetchData(pagination.page);
      } else {
        alert(res?.error || 'Có lỗi xảy ra khi lưu thông tin');
        setConfirmModal(prev => ({ ...prev, loading: false }));
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi kết nối máy chủ khi cập nhật');
      setConfirmModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Xử lý gửi Sandbox test
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
          expiryDate: testExpiry.trim(),
          templateId: testTemplate,
          gatewayMode: testTemplate === '10232' ? 'FNS_GATEWAY' : undefined
        })
      });
      setTestResult(data);
      fetchData(pagination.page);
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setLoadingTest(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl shadow-sm">
              <Send size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                Quản lý & Tra Cứu Lịch Sử Bắn Tin ZNS
                <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold px-2 py-0.5 rounded-full">
                  ZNS Only
                </span>
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Chuyên biệt theo dõi các giao dịch phát tin Zalo ZNS thực tế, tra cứu đa kênh qua SĐT, Serial, Zalo API và bắn lại tin tức thì.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchData(pagination.page)}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Làm mới ({pagination.total})</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Cổng phát tin</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">Zalo OA + FPT FNS</p>
            <p className="text-[11px] text-blue-600 font-semibold mt-0.5 leading-snug">
              Lắp đặt: 666024 (máy lọc nước) · 666039 (SP khác)
            </p>
            <p className="text-[11px] text-purple-600 font-semibold leading-snug">
              Dịch vụ: FNS 10233 · Dự phòng: FNS 10232
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <MessageSquare size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Tổng số tin ZNS đã bắn</p>
            <p className="text-sm font-bold text-gray-900 mt-0.5">
              {stats.totalDispatches} lượt phát
            </p>
            <p className="text-[11px] text-blue-600 font-medium">
              Đang lọc: {pagination.total} bản ghi
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Gửi thành công</p>
            <p className="text-sm font-bold text-emerald-600 mt-0.5">
              {stats.totalSuccess} tin ({stats.totalDispatches > 0 ? Math.round((stats.totalSuccess / stats.totalDispatches) * 100) : 0}%)
            </p>
            <p className="text-[11px] text-gray-400">Đã phát đến Zalo khách</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-sm flex items-center space-x-3.5">
          <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500">Gửi lỗi</p>
            <p className="text-sm font-bold text-red-600 mt-0.5">{stats.totalFailed} tin</p>
            <button
              type="button"
              onClick={() => { setActiveTab('list'); setFilterStatus('FAILED'); }}
              className="text-[11px] text-red-600 hover:underline font-medium"
            >
              Xem các tin lỗi →
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200 bg-gray-50/80 px-4 pt-3 space-x-2 md:space-x-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('list')}
            className={`pb-3 px-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'list'
                ? 'border-blue-600 text-blue-600 bg-white/70 rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Layers size={16} />
            <span>Lịch sử Bắn Tin ZNS ({pagination.total})</span>
          </button>

          <button
            onClick={() => setActiveTab('lookup')}
            className={`pb-3 px-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'lookup'
                ? 'border-blue-600 text-blue-600 bg-white/70 rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Search size={16} />
            <span>Tra cứu mở rộng (SĐT / ID máy / Zalo API)</span>
          </button>

          <button
            onClick={() => setActiveTab('tester')}
            className={`pb-3 px-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'tester'
                ? 'border-blue-600 text-blue-600 bg-white/70 rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Zap size={16} />
            <span>Công cụ Bắn Thử Nghiệm (Sandbox)</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 px-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-blue-600 text-blue-600 bg-white/70 rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Clock size={16} />
            <span>Nhật ký Server Logs ({serverZnsLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-3 px-3 text-xs font-bold flex items-center space-x-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'templates'
                ? 'border-blue-600 text-blue-600 bg-white/70 rounded-t-lg'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <MessageSquare size={16} />
            <span>Mẫu ZNS (Zalo OA)</span>
          </button>
        </div>

        {/* TAB 1: DANH SÁCH LỊCH SỬ BẮN TIN (CHỈ CÁC ĐƠN ĐÃ PHÁT ZNS) */}
        {activeTab === 'list' && (
          <div className="p-4 md:p-5 space-y-4">
            {/* Thanh tìm kiếm và bộ lọc ZNS */}
            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200/80 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                {/* Ô tìm kiếm thông minh */}
                <div className="md:col-span-12 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm theo SĐT, Serial, Tên KH, Message ID..."
                    className="w-full pl-9 pr-3.5 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium shadow-sm"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Lọc Trạng thái */}
                <div className="md:col-span-3">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium shadow-sm"
                  >
                    <option value="ALL">Tất cả trạng thái ZNS</option>
                    <option value="SUCCESS">Đã gửi thành công (SUCCESS)</option>
                    <option value="FAILED">Lỗi phát tin (FAILED)</option>
                  </select>
                </div>

                {/* Lọc Mẫu tin */}
                <div className="md:col-span-3">
                  <select
                    value={filterTemplate}
                    onChange={(e) => setFilterTemplate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium shadow-sm"
                  >
                    <option value="ALL">Tất cả mẫu tin</option>
                    {Object.entries(TEMPLATE_INFO).map(([id, t]) => (
                      <option key={id} value={id}>{id} – {t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Lọc Model */}
                <div className="md:col-span-2">
                  <select
                    value={filterModel}
                    onChange={(e) => setFilterModel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium shadow-sm"
                  >
                    <option value="ALL">Tất cả Dòng máy</option>
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Lọc khoảng thời gian */}
                <div className="md:col-span-2">
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium shadow-sm"
                    title="Từ ngày bắn tin"
                  />
                </div>

                <div className="md:col-span-2">
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full px-2.5 py-2 border border-gray-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium shadow-sm"
                    title="Đến ngày bắn tin"
                  />
                </div>
              </div>

              {/* Reset filter buttons */}
              {(search || filterStatus !== 'ALL' || filterModel !== 'ALL' || filterTemplate !== 'ALL' || filterStartDate || filterEndDate) && (
                <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-200">
                  <span className="text-gray-500">
                    Đang áp dụng bộ lọc ({pagination.total} lượt bắn tin)
                  </span>
                  <button
                    onClick={() => {
                      setSearch('');
                      setFilterStatus('ALL');
                      setFilterModel('ALL');
                      setFilterTemplate('ALL');
                      setFilterStartDate('');
                      setFilterEndDate('');
                    }}
                    className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                  >
                    <RotateCcw size={12} />
                    <span>Đặt lại bộ lọc</span>
                  </button>
                </div>
              )}
            </div>

            {/* Bảng dữ liệu Lịch sử bắn ZNS */}
            <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
              <table className="w-full text-xs text-left text-gray-700">
                <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-[11px] border-b border-gray-200">
                  <tr>
                    <th className="px-3.5 py-3 text-center w-12">#</th>
                    <th className="px-3.5 py-3">Thời gian phát tin</th>
                    <th className="px-3.5 py-3">Số ĐT nhận ZNS</th>
                    <th className="px-3.5 py-3">Số Serial / ID máy</th>
                    <th className="px-3.5 py-3">Khách hàng & Thiết bị</th>
                    <th className="px-3.5 py-3">Mã tin (Message ID)</th>
                    <th className="px-3.5 py-3">Tốc độ</th>
                    <th className="px-3.5 py-3 text-center">Trạng thái phát</th>
                    <th className="px-3.5 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {loading && dispatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-blue-600 mb-2" />
                        <span>Đang tải lịch sử các lượt gửi ZNS...</span>
                      </td>
                    </tr>
                  ) : dispatches.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">
                        Chưa tìm thấy lượt phát tin ZNS nào khớp với điều kiện tìm kiếm.
                      </td>
                    </tr>
                  ) : (
                    dispatches.map((d, idx) => {
                      const isSuccess = d.status === 'SUCCESS';
                      const isFailed = d.status === 'FAILED';

                      return (
                        <tr key={d.id || idx} className="hover:bg-blue-50/40 transition-colors">
                          <td className="px-3.5 py-3 text-center text-gray-400 font-mono text-[11px]">
                            {(pagination.page - 1) * pagination.limit + idx + 1}
                          </td>

                          {/* Thời gian phát tin */}
                          <td className="px-3.5 py-3 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-800">
                                {d.timestamp ? new Date(d.timestamp).toLocaleDateString('vi-VN') : 'N/A'}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {d.timestamp ? new Date(d.timestamp).toLocaleTimeString('vi-VN') : ''}
                              </span>
                            </div>
                          </td>

                          {/* Số ĐT nhận ZNS */}
                          <td className="px-3.5 py-3">
                            <div className="flex items-center space-x-1">
                              <Phone size={12} className="text-gray-400" />
                              <span className="font-bold text-gray-900 font-mono">
                                {d.phone || 'N/A'}
                              </span>
                            </div>
                          </td>

                          {/* Số Serial / ID máy */}
                          <td className="px-3.5 py-3">
                            {d.serialNumber && d.serialNumber !== 'N/A' ? (
                              <div className="flex items-center space-x-1.5">
                                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                  {d.serialNumber}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(d.serialNumber, `serial_${d.id}`)}
                                  className="text-gray-400 hover:text-blue-600 p-0.5"
                                  title="Sao chép Serial"
                                >
                                  {copiedKey === `serial_${d.id}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-[11px] italic">Chưa gắn Serial</span>
                            )}
                          </td>

                          {/* Khách hàng & Thiết bị */}
                          <td className="px-3.5 py-3">
                            <div>
                              <p className="font-bold text-gray-900">{d.customerName || 'Quý Khách'}</p>
                              <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[180px]" title={d.model}>
                                {d.model || 'Máy lọc nước Truliva'}
                              </p>
                            </div>
                          </td>

                          {/* Mã tin (Message ID) */}
                          <td className="px-3.5 py-3">
                            {d.messageId ? (
                              <div className="flex items-center space-x-1 font-mono text-[11px] text-gray-700">
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 truncate max-w-[130px]" title={d.messageId}>
                                  {d.messageId}
                                </span>
                                <button
                                  onClick={() => copyToClipboard(d.messageId!, `msg_${d.id}`)}
                                  className="text-gray-400 hover:text-blue-600"
                                  title="Sao chép Message ID"
                                >
                                  {copiedKey === `msg_${d.id}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                </button>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-[10px] italic">Chưa có ID</span>
                            )}
                          </td>

                          {/* Tốc độ (Latency) */}
                          <td className="px-3.5 py-3 font-semibold text-indigo-600 whitespace-nowrap">
                            {d.durationMs || '~145ms'}
                          </td>

                          {/* Trạng thái phát & Cổng Gateway */}
                          <td className="px-3.5 py-3 text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              {isSuccess ? (
                                <span className="inline-flex items-center text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-emerald-200">
                                  <CheckCircle2 size={12} className="mr-1 text-emerald-600" />
                                  Đã gửi thành công
                                </span>
                              ) : isFailed ? (
                                <span className="inline-flex items-center text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border border-red-200" title={d.error || 'Lỗi phát tin'}>
                                  <XCircle size={12} className="mr-1 text-red-600" />
                                  Lỗi phát tin
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full text-[11px] font-medium border border-blue-200">
                                  Đã phát
                                </span>
                              )}

                              {(() => {
                                const badge = gatewayBadge(d.gateway, d.templateId);
                                const tpl = d.templateId ? TEMPLATE_INFO[d.templateId] : undefined;
                                return (
                                  <>
                                    <span
                                      className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.cls}`}
                                      title={d.gateway}
                                    >
                                      {badge.text}
                                    </span>
                                    {d.templateId && (
                                      <span className="text-[10px] text-gray-500" title={`Mẫu ${d.templateId}`}>
                                        <span className="font-mono font-semibold text-gray-700">{d.templateId}</span>
                                        {tpl ? ` · ${tpl.label}` : ''}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </td>

                          {/* Thao tác */}
                          <td className="px-3.5 py-3 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => handleOpenEdit(d)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-semibold transition-colors shadow-sm inline-flex items-center gap-1 cursor-pointer"
                              title="Chỉnh sửa thông tin phát tin ZNS (Đổi SĐT người thân, Tên, Serial...)"
                            >
                              <Edit3 size={11} />
                              <span>Sửa</span>
                            </button>

                            <button
                              onClick={() => handleOpenResend(d)}
                              className="px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-[11px] font-semibold transition-colors shadow-sm inline-flex items-center gap-1 cursor-pointer"
                              title="Bắn lại tin ZNS cho giao dịch này"
                            >
                              <Send size={11} />
                              <span>Bắn lại</span>
                            </button>

                            <button
                              onClick={() => {
                                const q = d.messageId || d.phone || d.serialNumber;
                                setLookupInput(q);
                                setLookupType(d.messageId ? 'msg_id' : 'phone');
                                setActiveTab('lookup');
                                handlePerformLookup(q);
                              }}
                              className="px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-[11px] font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title="Tra cứu trực tiếp trạng thái trên Zalo Cloud"
                            >
                              <Search size={11} />
                              <span>Tra cứu</span>
                            </button>

                            <button
                              onClick={() => setInspectModal({ isOpen: true, title: `Chi tiết giao dịch ZNS`, data: d })}
                              className="px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                              title="Xem toàn bộ dữ liệu JSON"
                            >
                              JSON
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span>Hiển thị</span>
                <select
                  value={pagination.limit}
                  onChange={(e) => {
                    setPagination(prev => ({ ...prev, limit: Number(e.target.value), page: 1 }));
                    fetchData(1);
                  }}
                  className="border border-gray-300 rounded-lg px-2 py-1 bg-white font-semibold"
                >
                  <option value={10}>10 dòng</option>
                  <option value={20}>20 dòng</option>
                  <option value={50}>50 dòng</option>
                  <option value={100}>100 dòng</option>
                </select>
                <span>
                  trong tổng số <strong>{pagination.total}</strong> lượt bắn tin ZNS (Trang {pagination.page} / {pagination.totalPages || 1})
                </span>
              </div>

              <div className="flex items-center space-x-1.5">
                <button
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => {
                    const newP = pagination.page - 1;
                    setPagination(prev => ({ ...prev, page: newP }));
                    fetchData(newP);
                  }}
                  className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                  title="Trang trước"
                >
                  <ChevronLeft size={16} />
                </button>

                <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold border border-blue-200 rounded-lg">
                  {pagination.page}
                </span>

                <button
                  disabled={pagination.page >= pagination.totalPages || loading}
                  onClick={() => {
                    const newP = pagination.page + 1;
                    setPagination(prev => ({ ...prev, page: newP }));
                    fetchData(newP);
                  }}
                  className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                  title="Trang sau"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TRA CỨU MỞ RỘNG (OMNI-LOOKUP CHECK STATUS) */}
        {activeTab === 'lookup' && (
          <div className="p-5 space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-4 flex items-start space-x-3 text-xs text-blue-900">
              <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-blue-950">Công cụ Tra Cứu Toàn Diện Trạng Thái Zalo ZNS (Omni-Lookup)</p>
                <p className="mt-1 text-blue-800 leading-relaxed">
                  Hỗ trợ tra cứu tức thì theo <strong>Số điện thoại khách hàng</strong> (ví dụ: <code className="bg-white/80 px-1 py-0.5 rounded font-mono">0988779903</code>), <strong>Số Serial / ID máy</strong> (ví dụ: <code className="bg-white/80 px-1 py-0.5 rounded font-mono">198926022700272</code>), hoặc mã <strong>Message ID Zalo / FNS</strong> để kiểm tra máy khách đã nhận tin thành công hay gặp lỗi từ Zalo Platform.
                </p>
              </div>
            </div>

            {/* Input Bar */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200/80 space-y-3 max-w-3xl">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  onClick={() => setLookupType('all')}
                  className={`px-3 py-1.5 rounded-lg border transition-all ${
                    lookupType === 'all' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  ⚡ Tự động nhận diện
                </button>
                <button
                  onClick={() => setLookupType('phone')}
                  className={`px-3 py-1.5 rounded-lg border transition-all ${
                    lookupType === 'phone' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  📱 Theo Số điện thoại
                </button>
                <button
                  onClick={() => setLookupType('serial')}
                  className={`px-3 py-1.5 rounded-lg border transition-all ${
                    lookupType === 'serial' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  🏷️ Theo Số Serial / ID máy
                </button>
                <button
                  onClick={() => setLookupType('msg_id')}
                  className={`px-3 py-1.5 rounded-lg border transition-all ${
                    lookupType === 'msg_id' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  🆔 Theo Message ID Zalo
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder={
                    lookupType === 'phone'
                      ? 'Nhập số điện thoại (ví dụ: 0988779903, 0909480618)...'
                      : lookupType === 'serial'
                      ? 'Nhập số Serial (ví dụ: 198926022700272)...'
                      : lookupType === 'msg_id'
                      ? 'Nhập mã msg_id từ Zalo / FNS (ví dụ: 40bda896-64ad-4f3f-a2f7-91ef0f7d05bf)...'
                      : 'Nhập Số điện thoại, Số Serial hoặc Message ID Zalo...'
                  }
                  value={lookupInput}
                  onChange={(e) => setLookupInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePerformLookup(); }}
                  className="flex-1 px-4 py-2.5 text-xs border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white shadow-sm"
                />
                <button
                  onClick={() => handlePerformLookup()}
                  disabled={loadingLookup || !lookupInput.trim()}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-xs font-bold flex items-center justify-center space-x-1.5 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Search size={15} />
                  <span>{loadingLookup ? 'Đang truy vấn Zalo...' : 'Tra cứu ngay'}</span>
                </button>
              </div>
            </div>

            {/* Kết quả Tra cứu */}
            {lookupResult && (
              <div className="space-y-4 max-w-4xl">
                {/* 1. Thẻ tóm tắt thông tin Serial & Đơn hàng nếu tìm thấy trong DB */}
                {lookupResult.serialData && (
                  <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b pb-2.5">
                      <h3 className="font-bold text-gray-900 text-xs uppercase flex items-center gap-1.5">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        <span>Thông tin Thiết Bị & Khách Hàng Trong Cơ Sở Dữ Liệu</span>
                      </h3>
                      <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200">
                        {lookupResult.serialData.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <p className="text-gray-500 font-medium">Số Serial / ID máy:</p>
                        <p className="font-mono font-bold text-blue-700 text-sm mt-0.5">
                          {lookupResult.serialData.serialNumber}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5">Model: {lookupResult.serialData.model}</p>
                      </div>

                      <div>
                        <p className="text-gray-500 font-medium">Khách hàng & SĐT:</p>
                        <p className="font-bold text-gray-900 mt-0.5">
                          {lookupResult.serialData.customerName || lookupResult.serialData.order?.customerName || 'N/A'}
                        </p>
                        <p className="font-mono text-gray-700 text-[11px] mt-0.5">
                          {lookupResult.serialData.customerPhone || lookupResult.serialData.order?.customerPhone || 'N/A'}
                        </p>
                      </div>

                      <div>
                        <p className="text-gray-500 font-medium">Thời hạn bảo hành:</p>
                        <p className="font-semibold text-gray-800 mt-0.5">
                          Kích hoạt: {lookupResult.serialData.activationDate ? new Date(lookupResult.serialData.activationDate).toLocaleDateString('vi-VN') : 'N/A'}
                        </p>
                        <p className="text-emerald-700 font-bold text-[11px] mt-0.5">
                          Hết hạn: {lookupResult.serialData.warrantyExpiryDate ? new Date(lookupResult.serialData.warrantyExpiryDate).toLocaleDateString('vi-VN') : 'N/A'}
                        </p>
                      </div>
                    </div>

                    {lookupResult.serialData.order && (
                      <div className="pt-2 border-t text-xs text-gray-600 flex flex-wrap gap-4 bg-gray-50 p-2.5 rounded-xl">
                        <span>Đơn hàng: <strong className="text-indigo-700">#{lookupResult.serialData.order.pancakeOrderId || lookupResult.serialData.order.orderNumber}</strong></span>
                        {lookupResult.serialData.order.assignedKtv && (
                          <span>KTV thực hiện: <strong>{lookupResult.serialData.order.assignedKtv.fullName}</strong> ({lookupResult.serialData.order.assignedKtv.phoneNumber})</span>
                        )}
                        <span>Địa chỉ: <strong>{lookupResult.serialData.order.address || 'N/A'}</strong></span>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Kết quả truy vấn Zalo Platform API */}
                <div className="bg-gray-900 text-gray-100 p-5 rounded-2xl font-mono text-xs space-y-3 shadow-sm">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-3">
                    <span className="text-gray-300 font-sans font-bold flex items-center gap-1.5">
                      <Activity size={16} className="text-indigo-400" />
                      <span>Kết Quả Truy Vấn Trực Tiếp Zalo Platform Cloud</span>
                    </span>
                    {lookupResult.fnsResult?.status === 2 || lookupResult.fnsResult?.code === 1 ? (
                      <span className="text-emerald-400 font-sans font-bold flex items-center">
                        <CheckCircle2 size={15} className="mr-1" /> PHÁT THÀNH CÔNG (STATUS: 2)
                      </span>
                    ) : lookupResult.fnsResult?.status === -1 ? (
                      <span className="text-red-400 font-sans font-bold flex items-center">
                        <XCircle size={15} className="mr-1" /> THẤT BẠI (STATUS: -1)
                      </span>
                    ) : (
                      <span className="text-blue-400 font-sans font-semibold">
                        STATUS: {lookupResult.fnsResult?.status || 'N/A'}
                      </span>
                    )}
                  </div>

                  {lookupResult.fnsResult?.error_info && (
                    <div className="p-3 bg-red-950/60 border border-red-800/60 rounded-xl text-red-300 font-sans">
                      <p className="font-bold text-red-400 flex items-center gap-1">
                        <AlertTriangle size={14} /> Chi tiết lỗi từ Zalo Gateway ({lookupResult.fnsResult.error}):
                      </p>
                      <p className="mt-1 font-semibold text-xs">{lookupResult.fnsResult.error_info}</p>
                    </div>
                  )}

                  <pre className="overflow-x-auto text-[11px] text-emerald-300 p-2 bg-black/40 rounded-lg">
                    {JSON.stringify(lookupResult, null, 2)}
                  </pre>
                </div>

                {/* 3. Bảng giải mã lỗi Zalo Platform */}
                {lookupResult.errorCodesGuide && (
                  <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-2 text-xs">
                    <h4 className="font-bold text-gray-800 flex items-center gap-1.5">
                      <Info size={15} className="text-blue-600" />
                      <span>Bảng Mã Lỗi Phổ Biến Của Zalo Platform (Error Code Reference)</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      {Object.entries(lookupResult.errorCodesGuide).map(([code, desc]: any) => (
                        <div key={code} className="p-2 bg-gray-50 rounded-lg border border-gray-100 flex items-start gap-2">
                          <code className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                            {code}
                          </code>
                          <span className="text-gray-700">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SANDBOX TESTER */}
        {activeTab === 'tester' && (
          <div className="p-5 space-y-5 max-w-3xl">
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200/80 rounded-2xl p-4 flex items-start space-x-3 text-xs text-indigo-950">
              <Send size={20} className="text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm text-indigo-950">Công cụ bắn thử tin ZNS</p>
                <p className="mt-1 text-indigo-800 leading-relaxed">
                  Chọn mẫu, nhập dữ liệu và bắn 1 tin tới số Zalo thử nghiệm. Mẫu 666024 / 666039 gửi thẳng qua Zalo OA đúng dữ liệu bạn nhập; 10232 / 10233 gửi qua FPT FNS.
                  Trên môi trường Sandbox, tin chỉ được mô phỏng và ghi log, không gửi thật.
                </p>
              </div>
            </div>

            {/* Chọn mẫu tin */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              {(['666024', '666039', '10232', '10233'] as const).map(id => {
                const t = TEMPLATE_INFO[id];
                const active = testTemplate === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTestTemplate(id)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <span className="block font-mono font-bold text-gray-900">{id}</span>
                    <span className="block text-gray-600 mt-0.5">{t.label}</span>
                    <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${t.channel === 'ZALO' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {t.channel === 'ZALO' ? 'Zalo OA' : 'FPT FNS'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Template Presets */}
            <div className="flex flex-wrap gap-2 text-xs items-center">
              <span className="text-gray-500 font-semibold">Mẫu nhanh:</span>
              <button
                type="button"
                onClick={() => {
                  setTestSerial('198926022700272');
                  setTestProduct('Bộ lọc sơ cấp Truliva P1011');
                  setTestExpiry('24/08/2027');
                }}
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium border"
              >
                Mẫu P1011 (1 năm)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTestSerial('185826020700016');
                  setTestProduct('Máy lọc nước Truliva UR61096H');
                  setTestExpiry('20/07/2028');
                }}
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium border"
              >
                Mẫu UR61096H (2 năm)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTestSerial('139823072500258');
                  setTestProduct('Lõi lọc nước Truliva (Thay lọc)');
                  setTestExpiry('26/11/2026');
                }}
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium border"
              >
                Mẫu Thay Lọc (3 tháng)
              </button>
            </div>

            <form onSubmit={handleTestSend} className="space-y-4 bg-gray-50 p-4 rounded-2xl border border-gray-200 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Số điện thoại nhận ZNS *</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Ví dụ: 0915185982..."
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Số Serial *</label>
                  <input
                    type="text"
                    value={testSerial}
                    onChange={(e) => setTestSerial(e.target.value)}
                    placeholder="Ví dụ: 185826020700016..."
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Tên khách hàng</label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Tên sản phẩm</label>
                  <input
                    type="text"
                    value={testProduct}
                    onChange={(e) => setTestProduct(e.target.value)}
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Ngày hết hạn (DD/MM/YYYY)</label>
                  <input
                    type="text"
                    value={testExpiry}
                    onChange={(e) => setTestExpiry(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loadingTest}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold flex items-center space-x-2 text-xs transition-colors shadow-sm disabled:opacity-50"
                >
                  <Send size={15} />
                  <span>{loadingTest ? 'Đang gửi & Kiểm tra status...' : 'Bắt đầu gửi thử nghiệm'}</span>
                </button>
              </div>
            </form>

            {testResult && (
              <div className="bg-gray-900 text-gray-100 p-4 rounded-2xl font-mono text-xs space-y-3">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                  <span className="text-gray-400 font-sans font-semibold">Kết quả bắn ZNS & Live Status</span>
                  {testResult.success ? (
                    <span className="text-emerald-400 font-sans font-bold flex items-center">
                      <CheckCircle2 size={14} className="mr-1" /> ZALO ĐÃ PHÁT THÀNH CÔNG
                    </span>
                  ) : testResult.sendResult?.error === -137 ? (
                    <span className="text-amber-400 font-sans font-bold flex items-center">
                      <AlertTriangle size={14} className="mr-1" /> TÀI KHOẢN ZBS HẾT SỐ DƯ (CODE: -137)
                    </span>
                  ) : testResult.sendResult?.error ? (
                    <span className="text-red-400 font-sans font-bold flex items-center">
                      <XCircle size={14} className="mr-1" /> LỖI ZALO PLATFORM (CODE: {testResult.sendResult.error})
                    </span>
                  ) : (
                    <span className="text-blue-400 font-sans font-bold">
                      {testResult.gateway || 'ZALO ZBS GATEWAY'}
                    </span>
                  )}
                </div>

                <pre className="overflow-x-auto text-[11px] text-blue-300">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SERVER RAW LOGS */}
        {activeTab === 'logs' && (
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Nhật ký phát tin ZNS trích xuất từ Server Logs (/var/www/truliva/logs & PM2)</span>
              {loading && <span className="text-blue-600 font-medium">Đang đọc logs...</span>}
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
              <table className="w-full text-xs text-left text-gray-700">
                <thead className="bg-gray-100 text-gray-700 uppercase font-semibold text-[11px] border-b">
                  <tr>
                    <th className="px-3.5 py-2.5">Thời gian</th>
                    <th className="px-3.5 py-2.5">Số ĐT nhận</th>
                    <th className="px-3.5 py-2.5">Số Serial / Ref ID</th>
                    <th className="px-3.5 py-2.5">Mã tin (Message ID)</th>
                    <th className="px-3.5 py-2.5">Tốc độ</th>
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
                      const isSuccess = log.status === 'SUCCESS';
                      const isError = log.status === 'FAILED';

                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3.5 py-2.5 font-mono text-[11px] text-gray-600 whitespace-nowrap">
                            {log.timestamp || 'N/A'}
                          </td>
                          <td className="px-3.5 py-2.5 font-semibold text-gray-800">
                            {log.phone || 'N/A'}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-blue-600">
                            {log.serialNumber || 'N/A'}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-gray-600">
                            {log.messageId ? (
                              <span className="bg-gray-100 px-2 py-0.5 rounded text-[11px]">{log.messageId}</span>
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
                            {log.messageId && (
                              <button
                                onClick={() => {
                                  setLookupInput(log.messageId!);
                                  setLookupType('msg_id');
                                  setActiveTab('lookup');
                                  handlePerformLookup(log.messageId!);
                                }}
                                className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[11px] font-medium transition-colors"
                              >
                                Tra cứu
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
          </div>
        )}

        {/* TAB 5: DANH SÁCH MẪU ZNS TRÊN ZALO OA */}
        {activeTab === 'templates' && (
          <div className="p-4 md:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-xs text-gray-600 leading-relaxed">
                Danh sách mẫu đọc trực tiếp từ Zalo OA. Các mẫu <strong>đang được hệ thống sử dụng</strong> được đánh dấu.
                Bấm vào một mẫu để xem tham số, nút bấm và link xem trước nội dung.
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={templateStatusFilter}
                  onChange={(e) => setTemplateStatusFilter(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-xl text-xs bg-white font-medium"
                >
                  <option value="ENABLE">Chỉ mẫu đang hoạt động</option>
                  <option value="ALL">Tất cả mẫu</option>
                </select>
                <button
                  type="button"
                  onClick={loadTemplates}
                  disabled={templatesLoading}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-100"
                >
                  <RefreshCw size={14} className={templatesLoading ? 'animate-spin' : ''} />
                  Tải lại
                </button>
              </div>
            </div>

            {templatesError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle size={14} /> {templatesError}
              </div>
            )}

            <div className="overflow-x-auto border border-gray-200 rounded-2xl">
              <table className="w-full text-xs text-left text-gray-700">
                <thead className="bg-gray-100 text-gray-700 uppercase font-bold text-[11px] border-b border-gray-200">
                  <tr>
                    <th className="px-3.5 py-3">Mã mẫu</th>
                    <th className="px-3.5 py-3">Tên mẫu</th>
                    <th className="px-3.5 py-3">Trạng thái</th>
                    <th className="px-3.5 py-3">Sử dụng trong hệ thống</th>
                    <th className="px-3.5 py-3 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {templatesLoading && templates.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-10 text-gray-400">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto text-blue-600 mb-2" /> Đang tải mẫu từ Zalo OA...
                    </td></tr>
                  ) : (
                    templates
                      .filter(t => templateStatusFilter === 'ALL' || t.status === 'ENABLE')
                      .sort((a, b) => Number(!!TEMPLATE_INFO[String(b.templateId)]) - Number(!!TEMPLATE_INFO[String(a.templateId)]))
                      .map(t => {
                        const id = String(t.templateId);
                        const used = TEMPLATE_INFO[id];
                        return (
                          <tr key={id} className={used ? 'bg-blue-50/40' : ''}>
                            <td className="px-3.5 py-2.5 font-mono font-bold text-gray-900">{id}</td>
                            <td className="px-3.5 py-2.5 font-medium text-gray-800">{t.templateName}</td>
                            <td className="px-3.5 py-2.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                t.status === 'ENABLE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : t.status === 'REJECT' ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-gray-100 text-gray-600 border-gray-200'
                              }`}>
                                {t.status === 'ENABLE' ? 'Đang hoạt động' : t.status === 'REJECT' ? 'Bị từ chối' : t.status}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5">
                              {used ? (
                                <span className="text-[11px] font-semibold text-blue-700">✔ {used.label}</span>
                              ) : (
                                <span className="text-[11px] text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-3.5 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => openTemplateDetail(id)}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-semibold"
                              >
                                Xem
                              </button>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400">
              Mẫu 10232 / 10233 là mã của cổng FPT FNS nên không nằm trong danh sách Zalo OA.
            </p>
          </div>
        )}
      </div>

      {/* Modal chi tiết mẫu ZNS */}
      {templateDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTemplateDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-sm">
                Mẫu {templateDetail.id}{templateDetail.data?.templateName ? ` – ${templateDetail.data.templateName}` : ''}
              </h3>
              <button type="button" onClick={() => setTemplateDetail(null)} className="text-gray-400 hover:text-gray-600 text-lg font-bold px-2">×</button>
            </div>
            <div className="p-4 space-y-4 text-xs">
              {templateDetail.loading && (
                <div className="text-center py-6 text-gray-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto text-blue-600 mb-2" />Đang tải...</div>
              )}
              {templateDetail.error && <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200">{templateDetail.error}</div>}
              {templateDetail.data && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-gray-500">Trạng thái:</span> <strong>{templateDetail.data.status}</strong></div>
                    <div><span className="text-gray-500">Loại:</span> <strong>{templateDetail.data.templateTag || '—'}</strong></div>
                    <div><span className="text-gray-500">Giá / tin:</span> <strong>{templateDetail.data.price ? `${Number(templateDetail.data.price).toLocaleString('vi-VN')}đ` : '—'}</strong></div>
                    <div><span className="text-gray-500">Chất lượng:</span> <strong>{templateDetail.data.templateQuality || '—'}</strong></div>
                  </div>
                  <div>
                    <p className="font-bold text-gray-700 mb-1.5">Tham số</p>
                    <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50 text-[11px] text-gray-600">
                        <tr><th className="px-2 py-1.5 text-left">Tên</th><th className="px-2 py-1.5 text-left">Kiểu</th><th className="px-2 py-1.5 text-left">Tối đa</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(templateDetail.data.listParams || []).map((p: any) => (
                          <tr key={p.name}>
                            <td className="px-2 py-1.5 font-mono">{p.name}</td>
                            <td className="px-2 py-1.5">{p.type}</td>
                            <td className="px-2 py-1.5">{p.maxLength}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(templateDetail.data.listButtons || []).length > 0 && (
                    <div>
                      <p className="font-bold text-gray-700 mb-1.5">Nút bấm</p>
                      {(templateDetail.data.listButtons || []).map((b: any, i: number) => (
                        <p key={i} className="text-gray-700">• {b.title} <span className="text-gray-400 break-all">({b.content})</span></p>
                      ))}
                    </div>
                  )}
                  {templateDetail.data.reason && (
                    <p className="text-gray-500"><span className="font-semibold">Ghi chú duyệt:</span> {templateDetail.data.reason}</p>
                  )}
                  {templateDetail.data.previewUrl && (
                    <a
                      href={templateDetail.data.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"
                    >
                      Xem trước nội dung mẫu ↗
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Bắn Lại ZNS Nhanh */}
      {resendModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Send size={16} className="text-blue-600" />
                <span>Bắn Lại Tin Nhắn Zalo ZNS Xác Nhận Bảo Hành</span>
              </h3>
              <button
                onClick={() => setResendModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Số Serial máy *</label>
                <input
                  type="text"
                  value={resendModal.serialNumber}
                  onChange={(e) => setResendModal(prev => ({ ...prev, serialNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-gray-800 bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Số điện thoại khách hàng nhận ZNS *</label>
                <input
                  type="text"
                  value={resendModal.phone}
                  onChange={(e) => setResendModal(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="0988779903..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Tên khách hàng</label>
                  <input
                    type="text"
                    value={resendModal.name}
                    onChange={(e) => setResendModal(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Ngày hết hạn (DD/MM/YYYY)</label>
                  <input
                    type="text"
                    value={resendModal.expiry}
                    onChange={(e) => setResendModal(prev => ({ ...prev, expiry: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Tên sản phẩm hiển thị</label>
                <input
                  type="text"
                  value={resendModal.product}
                  onChange={(e) => setResendModal(prev => ({ ...prev, product: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Cổng phát tin nhắn (Gateway)</label>
                <select
                  value={resendModal.gatewayMode}
                  onChange={(e) => setResendModal(prev => ({ ...prev, gatewayMode: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-medium bg-white focus:ring-2 focus:ring-blue-500 text-xs"
                >
                  <option value="AUTO">🔵 Tự động theo danh mục – Zalo OA 666024 / 666039 (dự phòng FNS)</option>
                  <option value="FNS_GATEWAY">🟣 FPT FNS – mẫu 10232</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  {resendModal.gatewayMode === 'AUTO'
                    ? 'Hệ thống tự chọn mẫu theo danh mục sản phẩm của serial; tên sản phẩm và ngày hết hạn lấy từ dữ liệu bảo hành (bỏ qua 2 ô nhập tay ở trên).'
                    : 'Gửi qua FPT FNS mẫu 10232 với tên sản phẩm và ngày hết hạn bạn nhập.'}
                </p>
              </div>
            </div>

            {resendModal.result && (
              <div className={`p-3 rounded-xl text-xs font-mono ${
                resendModal.result.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                <p className="font-bold font-sans flex items-center gap-1">
                  {resendModal.result.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {resendModal.result.success ? 'Gửi tin nhắn ZNS thành công!' : 'Lỗi gửi tin ZNS:'}
                </p>
                <pre className="mt-1 text-[10px] overflow-x-auto max-h-32">
                  {JSON.stringify(resendModal.result, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setResendModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl"
              >
                Đóng
              </button>
              <button
                onClick={handleExecuteResend}
                disabled={resendModal.loading}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={14} />
                <span>{resendModal.loading ? 'Đang gửi...' : 'Xác nhận Bắn ZNS'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Inspect JSON */}
      {inspectModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-800 text-sm">{inspectModal.title}</h3>
              <button
                onClick={() => setInspectModal({ isOpen: false, title: '', data: null })}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <XCircle size={18} />
              </button>
            </div>

            <div className="bg-gray-900 text-emerald-400 p-4 rounded-xl font-mono text-xs max-h-96 overflow-y-auto">
              <pre>{JSON.stringify(inspectModal.data, null, 2)}</pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectModal({ isOpen: false, title: '', data: null })}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Chỉnh Sửa Thông Tin Phát Tin ZNS */}
      {editModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Chỉnh Sửa Thông Tin Bắn Tin ZNS</h3>
                  <p className="text-[11px] text-gray-500">Cập nhật SĐT người nhận (VD: người thân), Tên KH, Serial...</p>
                </div>
              </div>
              <button
                onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handlePreSave} className="space-y-3.5 text-xs">
              {/* Số điện thoại nhận ZNS */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  Số điện thoại nhận tin ZNS * <span className="text-blue-600 font-normal">(Có thể đổi sang số người thân)</span>
                </label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={editModal.phone}
                    onChange={(e) => setEditModal(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="VD: 0988776655..."
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl font-mono text-gray-900 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Số Serial / ID máy */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">Số Serial / ID máy</label>
                <input
                  type="text"
                  value={editModal.serialNumber}
                  onChange={(e) => setEditModal(prev => ({ ...prev, serialNumber: e.target.value }))}
                  placeholder="VD: 185826060900080..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-blue-700 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Tên khách hàng & Tên thiết bị */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Tên khách hàng / Người nhận</label>
                  <input
                    type="text"
                    value={editModal.customerName}
                    onChange={(e) => setEditModal(prev => ({ ...prev, customerName: e.target.value }))}
                    placeholder="VD: Nguyễn Văn A..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Tên sản phẩm / Model</label>
                  <input
                    type="text"
                    value={editModal.productName}
                    onChange={(e) => setEditModal(prev => ({ ...prev, productName: e.target.value }))}
                    placeholder="VD: Máy lọc nước Truliva UR61096H..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                  />
                </div>
              </div>

              {/* Mã đơn hàng & Trạng thái */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Mã đơn hàng Pancake</label>
                  <input
                    type="text"
                    value={editModal.orderNumber}
                    onChange={(e) => setEditModal(prev => ({ ...prev, orderNumber: e.target.value }))}
                    placeholder="VD: 4385..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Trạng thái phát tin</label>
                  <select
                    value={editModal.status}
                    onChange={(e) => setEditModal(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  >
                    <option value="SUCCESS">Đã gửi thành công (SUCCESS)</option>
                    <option value="FAILED">Lỗi phát tin (FAILED)</option>
                  </select>
                </div>
              </div>

              {editModal.status === 'FAILED' && (
                <div>
                  <label className="block font-bold text-red-700 mb-1">Chi tiết lỗi phát tin</label>
                  <input
                    type="text"
                    value={editModal.error}
                    onChange={(e) => setEditModal(prev => ({ ...prev, error: e.target.value }))}
                    placeholder="Nhập nguyên nhân lỗi..."
                    className="w-full px-3 py-2 border border-red-300 rounded-xl bg-red-50 text-red-800 outline-none"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Save size={14} />
                  <span>Lưu thay đổi...</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Lưu Thay Đổi - 3 Lựa Chọn Theo Yêu Cầu */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl flex-shrink-0 mt-0.5">
                <HelpCircle size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 leading-snug">
                  Bạn có chắc chắn muốn sửa đổi thông tin bắn ZNS?
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Vui lòng chọn 1 trong các phương án xử lý dưới đây trước khi áp dụng:
                </p>
              </div>
            </div>

            {/* Change Summary Box */}
            <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 text-xs space-y-1.5 font-medium">
              <div className="flex justify-between text-gray-600">
                <span>Số ĐT nhận ZNS mới:</span>
                <span className="font-bold text-blue-700 font-mono">{editModal.phone}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Khách hàng nhận:</span>
                <span className="font-bold text-gray-900">{editModal.customerName || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Số Serial / ID máy:</span>
                <span className="font-bold text-indigo-700 font-mono">{editModal.serialNumber || 'Chưa gắn Serial'}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Thiết bị:</span>
                <span className="font-bold text-gray-800">{editModal.productName || 'N/A'}</span>
              </div>
            </div>

            {/* 3 Lựa Chọn Xử Lý (Options) */}
            <div className="space-y-2.5 pt-1">
              {/* Option 1: Tạo trùng lặp */}
              <button
                type="button"
                disabled={confirmModal.loading}
                onClick={() => handleExecuteSave('DUPLICATE')}
                className="w-full text-left p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100/80 border-2 border-indigo-300 transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 text-white rounded-xl group-hover:scale-105 transition-transform flex-shrink-0">
                    <FilePlus size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                      <span>1. Tạo trùng lặp (Giữ bản ghi cũ)</span>
                      <span className="bg-indigo-200/80 text-indigo-900 text-[10px] px-2 py-0.5 rounded-full font-semibold">Khuyên dùng</span>
                    </div>
                    <p className="text-[11px] text-indigo-700 mt-0.5 leading-relaxed">
                      Vẫn giữ nguyên bản ghi cũ trong hệ thống, tạo thêm 1 bản ghi mới với nội dung vừa sửa đổi.
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 2: Chắc chắn (Ghi đè) */}
              <button
                type="button"
                disabled={confirmModal.loading}
                onClick={() => handleExecuteSave('OVERWRITE')}
                className="w-full text-left p-3 rounded-2xl bg-blue-50 hover:bg-blue-100/80 border-2 border-blue-300 transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-xl group-hover:scale-105 transition-transform flex-shrink-0">
                    <Save size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-blue-950">
                      2. Chắc chắn (Ghi đè dữ liệu)
                    </div>
                    <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                      Ghi đè trực tiếp nội dung mới lên bản ghi này (thay thế hoàn toàn bản ghi cũ).
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 3: Hủy */}
              <button
                type="button"
                disabled={confirmModal.loading}
                onClick={() => setConfirmModal({ isOpen: false, loading: false })}
                className="w-full text-center py-2.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs transition-colors border border-gray-300 cursor-pointer"
              >
                3. Hủy bỏ (Coi như chưa chỉnh sửa)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
