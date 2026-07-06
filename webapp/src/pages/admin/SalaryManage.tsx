import { useState, useEffect } from 'react';
import { fetchApi } from '../../api/client';
import { 
  Calculator, 
  Save, 
  Lock, 
  Phone, 
  MapPin, 
  CheckCircle, 
  RefreshCw, 
  Eye, 
  AlertCircle, 
  FileSpreadsheet,
  X,
  TrendingUp,
  UserCheck
} from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';

interface CaseDetail {
  reportId: string;
  orderId: string | null;
  pancakeOrderId: number | null;
  customerName: string;
  workType: string;
  isSunday: boolean;
  baseCost: number;
  distance: number;
  distanceCost: number;
  totalCost: number;
  createdAt: string;
}

interface SalaryData {
  userId: string;
  fullName: string;
  username: string;
  phoneNumber: string;
  stationName: string;
  mainStationName: string;
  isStationPaid: boolean;
  stationRateInfo: {
    stationName: string;
    role: string;
  } | null;
  casesCount: number;
  calculatedCost: number;
  adjustedCost: number;
  adjustmentNote: string;
  status: 'DRAFT' | 'FINAL';
  cases: CaseDetail[];
}

export default function SalaryManage() {
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  // Generate last 12 months for selector
  const generateMonths = () => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      list.push(`${mm}/${yyyy}`);
    }
    return list;
  };

  const months = generateMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [salaries, setSalaries] = useState<SalaryData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Detail Modal State
  const [selectedKtv, setSelectedKtv] = useState<SalaryData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Search/Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'ktv' | 'station'>('all');

  const fetchSalaries = async (silent = false) => {
    if (!silent) setLoading(true);
    setMessage(null);
    try {
      const data = await fetchApi(`/salaries/calculate?month=${selectedMonth}`);
      setSalaries(data.salaries || []);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi tải dữ liệu tính lương' });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaries();
  }, [selectedMonth]);

  // Handle manual adjustment input
  const handleAdjustCostChange = (userId: string, val: string) => {
    const numericVal = val === '' ? 0 : Number(val.replace(/\D/g, ''));
    if (isNaN(numericVal)) return;

    setSalaries(prev => prev.map(s => {
      if (s.userId === userId) {
        return { ...s, adjustedCost: numericVal };
      }
      return s;
    }));
  };

  const handleAdjustmentNoteChange = (userId: string, val: string) => {
    setSalaries(prev => prev.map(s => {
      if (s.userId === userId) {
        return { ...s, adjustmentNote: val };
      }
      return s;
    }));
  };

  // Save Draft
  const handleSaveDraft = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        month: selectedMonth,
        salaries: salaries.map(s => ({
          userId: s.userId,
          calculatedCost: s.calculatedCost,
          adjustedCost: s.adjustedCost,
          adjustmentNote: s.adjustmentNote
        }))
      };
      await fetchApi('/salaries/save', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setMessage({ type: 'success', text: 'Đã lưu nháp bảng thù lao thành công!' });
      fetchSalaries(true);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi lưu nháp' });
    } finally {
      setSaving(false);
    }
  };

  // Lock Month
  const handleLockSalary = async () => {
    const isConfirmed = await confirm({
      title: 'Chốt và khóa bảng thù lao',
      message: `Bạn có chắc chắn muốn chốt bảng thù lao tháng ${selectedMonth}? Sau khi chốt, dữ liệu sẽ được khóa và KHÔNG thể chỉnh sửa được nữa.`,
      confirmText: 'Đồng ý chốt',
      cancelText: 'Hủy'
    });

    if (!isConfirmed) return;

    setLoading(true);
    setMessage(null);
    try {
      // First save draft to make sure all adjustments are stored
      const payload = {
        month: selectedMonth,
        salaries: salaries.map(s => ({
          userId: s.userId,
          calculatedCost: s.calculatedCost,
          adjustedCost: s.adjustedCost,
          adjustmentNote: s.adjustmentNote
        }))
      };
      await fetchApi('/salaries/save', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // Then call lock
      await fetchApi('/salaries/lock', {
        method: 'POST',
        body: JSON.stringify({ month: selectedMonth })
      });
      setMessage({ type: 'success', text: `Đã chốt và khóa thù lao tháng ${selectedMonth} thành công!` });
      fetchSalaries();
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi chốt thù lao' });
      setLoading(false);
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`/api/salaries/export?month=${encodeURIComponent(selectedMonth)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Lỗi xuất file Excel');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `Bang_thu_lao_Truliva_${selectedMonth.replace('/', '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi khi xuất bảng thù lao Excel' });
    } finally {
      setExporting(false);
    }
  };

  // Filter and search
  const filteredSalaries = salaries.filter(s => {
    const matchSearch = s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.phoneNumber.includes(searchQuery);
    
    if (filterType === 'ktv') return matchSearch && !s.isStationPaid;
    if (filterType === 'station') return matchSearch && s.isStationPaid;
    return matchSearch;
  });

  const formatMoney = (val: number) => {
    return val.toLocaleString('vi-VN') + ' đ';
  };

  // Quick stats
  const totalCalculated = salaries.reduce((acc, curr) => acc + curr.calculatedCost, 0);
  const totalAdjusted = salaries.reduce((acc, curr) => acc + curr.adjustedCost, 0);
  const totalCases = salaries.reduce((acc, curr) => acc + curr.casesCount, 0);
  const isMonthLocked = salaries.some(s => s.status === 'FINAL');

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Premium Header */}
      <div className="bg-gradient-to-r from-[#1E3A8A] to-[#3B82F6] rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-2xl"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="h-7 w-7 text-blue-200" />
              Quản lý Thù lao Ca dịch vụ
            </h1>
            <p className="text-blue-100 text-sm mt-1 max-w-[700px]">
              Tự động tính thù lao dựa trên số báo cáo hoàn thành được duyệt trong tháng. Khớp bảng đơn giá KTV và Trạm liên kết từ hệ thống.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white/10 p-2 rounded-xl border border-white/20 backdrop-blur-md self-start md:self-auto">
            <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider pl-2">Kỳ tính thù lao</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white text-gray-900 font-semibold rounded-lg px-3 py-1.5 text-sm focus:outline-none border-0 ring-2 ring-blue-400 focus:ring-blue-500"
            >
              {months.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Alert message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-3 border shadow-sm ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <AlertCircle className={`h-5 w-5 mt-0.5 ${message.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`} />
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Tổng số ca duyệt</span>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{totalCases} ca</h3>
          </div>
          <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
            <UserCheck className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Thù lao tính tự động</span>
            <h3 className="text-2xl font-bold text-gray-800 mt-1">{formatMoney(totalCalculated)}</h3>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg text-orange-600">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Thực nhận sau điều chỉnh</span>
            <h3 className="text-2xl font-bold text-blue-800 mt-1">{formatMoney(totalAdjusted)}</h3>
          </div>
          <div className="bg-emerald-50 p-3 rounded-lg text-emerald-600">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Trạng thái bảng thù lao</span>
            <h3 className={`text-lg font-bold mt-1.5 flex items-center gap-1 ${isMonthLocked ? 'text-emerald-600' : 'text-amber-500'}`}>
              <Lock className="h-4 w-4" />
              {isMonthLocked ? 'Đã chốt & Khóa' : 'Nháp (Đang mở)'}
            </h3>
          </div>
          <div className={`p-3 rounded-lg ${isMonthLocked ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <Lock className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Control and Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <input
            type="text"
            placeholder="Tìm KTV, trạm, số điện thoại..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 self-stretch sm:self-auto">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                filterType === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setFilterType('ktv')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                filterType === 'ktv' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              KTV Nội bộ
            </button>
            <button
              onClick={() => setFilterType('station')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                filterType === 'station' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Trạm liên kết
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fetchSalaries()}
            disabled={loading}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg text-sm flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Tính lại
          </button>
          
          <button
            onClick={handleExportExcel}
            disabled={exporting || salaries.length === 0}
            className="px-4 py-2 bg-[#107C41] hover:bg-[#0E6C38] text-white font-medium rounded-lg text-sm flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>

          {isAdmin && !isMonthLocked && (
            <>
              <button
                onClick={handleSaveDraft}
                disabled={saving || salaries.length === 0}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Đang lưu...' : 'Lưu nháp'}
              </button>
              
              <button
                onClick={handleLockSalary}
                disabled={loading || salaries.length === 0}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
              >
                <Lock className="h-4 w-4" />
                Chốt thù lao
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-gray-400 text-sm">Đang tải và tính toán thù lao...</span>
          </div>
        ) : filteredSalaries.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">
            Không tìm thấy thông tin thù lao nào cho bộ lọc hiện tại.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold">
                  <th className="px-6 py-4 w-12 text-center">STT</th>
                  <th className="px-6 py-4">KTV / Trạm</th>
                  <th className="px-6 py-4 w-40 text-center">Phân loại</th>
                  <th className="px-6 py-4 w-44">Trạm quản lý</th>
                  <th className="px-6 py-4 w-28 text-center">Số ca</th>
                  <th className="px-6 py-4 w-48 text-right">Thù lao tính tự động</th>
                  <th className="px-6 py-4 w-52">Điều chỉnh thực nhận</th>
                  <th className="px-6 py-4">Ghi chú điều chỉnh</th>
                  <th className="px-6 py-4 w-32 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSalaries.map((item, idx) => {
                  const isModified = item.adjustedCost !== item.calculatedCost;

                  return (
                    <tr key={item.userId} className="hover:bg-gray-50/50 transition">
                      <td className="px-6 py-4 text-center text-gray-400 font-medium">{idx + 1}</td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold text-gray-800">{item.fullName}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" />
                            {item.phoneNumber}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                          item.isStationPaid 
                            ? 'bg-purple-50 text-purple-700 border border-purple-100' 
                            : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          {item.isStationPaid ? 'Trạm/Cộng tác' : 'KTV Nội bộ'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {item.stationName}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 font-bold bg-gray-100 text-gray-700 rounded-md text-xs">
                          {item.casesCount} ca
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-700">
                        {formatMoney(item.calculatedCost)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="relative">
                          <input
                            type="text"
                            value={item.adjustedCost.toLocaleString('vi-VN')}
                            onChange={(e) => handleAdjustCostChange(item.userId, e.target.value)}
                            disabled={isMonthLocked || !isAdmin}
                            className={`w-full px-3 py-1.5 text-right font-bold text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isModified 
                                ? 'border-amber-400 bg-amber-50/30 text-amber-700' 
                                : 'border-gray-200 bg-white text-gray-800'
                            } disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200`}
                          />
                          <span className="absolute right-2 top-2.5 text-xs text-gray-400 pointer-events-none"></span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          placeholder="Nhập lý do điều chỉnh..."
                          value={item.adjustmentNote}
                          onChange={(e) => handleAdjustmentNoteChange(item.userId, e.target.value)}
                          disabled={isMonthLocked || !isAdmin}
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedKtv(item);
                            setShowDetailModal(true);
                          }}
                          className="px-3 py-1.5 hover:bg-blue-50 text-blue-600 rounded-lg flex items-center gap-1 mx-auto text-xs font-semibold transition border border-transparent hover:border-blue-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Case Details Modal */}
      {showDetailModal && selectedKtv && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="bg-[#1E3A8A] text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Danh sách ca dịch vụ hoàn thành</h3>
                <p className="text-xs text-blue-200 mt-1">
                  Kỹ thuật viên: <strong className="text-white">{selectedKtv.fullName}</strong> | Số điện thoại: <strong className="text-white">{selectedKtv.phoneNumber}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="mb-4 flex flex-wrap gap-4 items-center justify-between text-sm text-gray-500 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div>
                  Vai trò: <span className="font-semibold text-gray-700">{selectedKtv.isStationPaid ? 'Trạm kỹ thuật liên kết' : 'KTV Nội bộ'}</span>
                </div>
                <div>
                  Kỳ tính lương: <span className="font-semibold text-gray-700">{selectedMonth}</span>
                </div>
                <div>
                  Tổng ca: <span className="font-semibold text-gray-700">{selectedKtv.casesCount} ca</span>
                </div>
              </div>

              {selectedKtv.cases.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  Không tìm thấy ca dịch vụ nào của KTV này trong tháng.
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 font-semibold">
                        <th className="px-4 py-3 text-center w-12">STT</th>
                        <th className="px-4 py-3 w-28">Mã ca</th>
                        <th className="px-4 py-3">Khách hàng</th>
                        <th className="px-4 py-3 w-40">Loại công việc</th>
                        <th className="px-4 py-3 text-center w-24">Ngày cuối tuần</th>
                        <th className="px-4 py-3 text-right w-32">Đơn giá ca (VND)</th>
                        <th className="px-4 py-3 w-28 text-center">Quãng đường</th>
                        <th className="px-4 py-3 text-right w-32">Phụ cấp km (VND)</th>
                        <th className="px-4 py-3 text-right w-32 font-bold text-gray-700">Tổng cộng (VND)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedKtv.cases.map((c, index) => {
                        const formattedId = c.pancakeOrderId 
                          ? (c.pancakeOrderId < 0 ? `M${Math.abs(c.pancakeOrderId)}` : `#${c.pancakeOrderId}`)
                          : 'Báo cáo';

                        return (
                          <tr key={c.reportId} className="hover:bg-gray-50/50 transition">
                            <td className="px-4 py-3 text-center text-gray-400">{index + 1}</td>
                            <td className="px-4 py-3 font-semibold text-blue-600">{formattedId}</td>
                            <td className="px-4 py-3 font-medium text-gray-800">{c.customerName}</td>
                            <td className="px-4 py-3 text-gray-600">{c.workType}</td>
                            <td className="px-4 py-3 text-center">
                              {c.isSunday ? (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 rounded-md">
                                  Chủ Nhật
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-700">
                              {c.baseCost.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-4 py-3 text-center text-gray-600">
                              {c.distance > 0 ? (
                                <span className="flex items-center justify-center gap-0.5">
                                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                  {c.distance} km
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {c.distanceCost > 0 ? c.distanceCost.toLocaleString('vi-VN') : '-'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-900">
                              {c.totalCost.toLocaleString('vi-VN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 p-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-5 py-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 font-medium rounded-lg text-sm transition"
              >
                Đóng lại
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
