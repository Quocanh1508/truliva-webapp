import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../../api/client';
import { 
  Calendar, 
  MapPin, 
  Phone, 
  Wrench, 
  Droplets, 
  DollarSign, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Tag, 
  FileText,
  BarChart3,
  Edit,
  CheckCircle,
  Loader2,
  Send,
  X
} from 'lucide-react';
import PullToRefresh from '../../components/PullToRefresh';

const getFirstDayOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
};

const getTodayStr = () => {
  return new Date().toISOString().slice(0, 10);
};

export default function MyReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<'list' | 'stats'>('list');

  // ── Thống kê state ──
  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [showPending, setShowPending] = useState(true);
  const [showProgress, setShowProgress] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);

  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // ── Kích hoạt bảo hành (ZNS) state ──
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationData, setActivationData] = useState<any>(null);
  const [znsPhone, setZnsPhone] = useState('');
  const [znsSending, setZnsSending] = useState(false);
  const [activationStep, setActivationStep] = useState(1);
  const [warrantyDurationText, setWarrantyDurationText] = useState('12 tháng');

  const handleOpenActivation = (report: any) => {
    const modelName = report.products && report.products.length > 0 ? report.products[0] : 'Máy lọc nước Truliva';
    setActivationData({
      reportId: report.id,
      serialNumber: report.serialNumber,
      customerName: report.customerName,
      customerPhone: report.customerPhone,
      address: report.address || '',
      model: modelName,
    });
    setZnsPhone(report.customerPhone);
    setActivationStep(1);
    setShowActivationModal(true);

    setWarrantyDurationText('Đang tính toán...');
    fetchApi(`/serials/public/preview-duration?model=${encodeURIComponent(modelName)}&orderId=${report.orderId || ''}`)
      .then(res => {
        if (res && res.totalMonths) {
          let text = `${res.totalMonths} tháng`;
          if (res.promoMonths > 0) {
            text += ` (${res.standardMonths} tháng tiêu chuẩn + ${res.promoMonths} tháng khuyến mãi)`;
          }
          setWarrantyDurationText(text);
        } else {
          setWarrantyDurationText('12 tháng');
        }
      })
      .catch(() => setWarrantyDurationText('12 tháng'));
  };

  const handleSendZns = async () => {
    if (!znsPhone.trim()) {
      alert('Vui lòng nhập Số điện thoại nhận tin nhắn Zalo');
      return;
    }
    setZnsSending(true);
    try {
      await fetchApi('/serials/zns-activate', {
        method: 'POST',
        body: JSON.stringify({
          serialNumber: activationData.serialNumber,
          recipientPhone: znsPhone.trim()
        })
      });
      setActivationStep(2);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi gửi yêu cầu kích hoạt ZNS.');
    } finally {
      setZnsSending(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      // Sắp xếp theo mới nhất (createdAt desc)
      const data = await fetchApi('/reports?limit=50');
      setReports(data.reports);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await fetchApi(`/reports/my-stats?startDate=${startDate}&endDate=${endDate}`);
      setStats(data);
    } catch (e) {
      console.error('Lỗi tải thống kê', e);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'stats') {
      loadStats();
    }
  }, [activeTab, startDate, endDate]);

  const handleRefresh = async () => {
    if (activeTab === 'list') {
      await loadReports();
    } else {
      await loadStats();
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedReports(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getWorkTypeColor = (workType: string) => {
    switch (workType) {
      case 'Lắp đặt':
        return 'text-amber-700 bg-amber-50 border-amber-200';
      case 'Bảo hành':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'Sửa chữa':
        return 'text-purple-700 bg-purple-50 border-purple-200';
      case 'Thay lọc':
      case 'Thay lõi':
        return 'text-teal-700 bg-teal-50 border-teal-200';
      default:
        return 'text-blue-700 bg-blue-50 border-blue-200';
    }
  };

  // ── Lọc thống kê theo checkbox trạng thái ở Client ──
  const getFilteredSummary = () => {
    if (!stats || !stats.summary) return { total: 0, pending: 0, progress: 0, completed: 0 };
    const pending = showPending ? stats.summary.pending : 0;
    const progress = showProgress ? stats.summary.progress : 0;
    const completed = showCompleted ? stats.summary.completed : 0;
    const total = pending + progress + completed;
    return {
      total,
      pending,
      progress,
      completed
    };
  };

  const getFilteredWorkTypeStats = () => {
    if (!stats || !stats.workTypeStats) return [];
    return stats.workTypeStats.map((item: any) => {
      const pending = showPending ? item.pending : 0;
      const progress = showProgress ? item.progress : 0;
      const completed = showCompleted ? item.completed : 0;
      const total = pending + progress + completed;
      return {
        name: item.name,
        pending,
        progress,
        completed,
        total
      };
    }).filter((item: any) => item.total > 0);
  };

  const getChart1Data = () => {
    const data = getFilteredWorkTypeStats();
    if (data.length === 0) return { list: [], limitVal: 10, ticks: [2, 4, 6, 8, 10] };

    const maxTotal = Math.max(...data.map((item: any) => item.total), 5);
    
    let limitVal = 10;
    if (maxTotal <= 5) limitVal = 6;
    else if (maxTotal <= 10) limitVal = 10;
    else if (maxTotal <= 14) limitVal = 14;
    else if (maxTotal <= 20) limitVal = 20;
    else limitVal = Math.ceil(maxTotal / 5) * 5;

    const tickStep = limitVal <= 6 ? 1 : (limitVal <= 14 ? 2 : 5);
    const ticks = [];
    for (let i = tickStep; i <= limitVal; i += tickStep) {
      ticks.push(i);
    }

    return { list: data, limitVal, ticks };
  };

  const getChart2Data = () => {
    if (!stats || !stats.delayStats) return { list: [], limitVal: 10, ticks: [2, 4, 6, 8, 10] };
    const data = stats.delayStats.map((item: any) => {
      const total = (item.onTime || 0) + (item.late || 0);
      return {
        name: item.name,
        onTime: item.onTime || 0,
        late: item.late || 0,
        total
      };
    }).filter((item: any) => item.total > 0);

    if (data.length === 0) return { list: [], limitVal: 10, ticks: [2, 4, 6, 8, 10] };

    const maxTotal = Math.max(...data.map((item: any) => item.total), 5);

    let limitVal = 10;
    if (maxTotal <= 5) limitVal = 6;
    else if (maxTotal <= 10) limitVal = 10;
    else if (maxTotal <= 14) limitVal = 14;
    else if (maxTotal <= 20) limitVal = 20;
    else limitVal = Math.ceil(maxTotal / 5) * 5;

    const tickStep = limitVal <= 6 ? 1 : (limitVal <= 14 ? 2 : 5);
    const ticks = [];
    for (let i = tickStep; i <= limitVal; i += tickStep) {
      ticks.push(i);
    }

    return { list: data, limitVal, ticks };
  };

  if (loading) return <div className="text-center py-10"><span className="spinner border-t-[#1B3A6B]"></span></div>;

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="animate-fade-in max-w-2xl mx-auto px-4 pb-10">
        <h2 className="font-bold text-2xl mb-6 text-[#1B3A6B] flex items-center gap-2">
          <FileText className="w-6 h-6" /> Báo cáo công việc
        </h2>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1.5 rounded-xl mb-6 shadow-inner">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'list' 
              ? 'bg-white text-[#1B3A6B] shadow-md' 
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <FileText className="w-4 h-4" /> Lịch sử báo cáo
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'stats' 
              ? 'bg-white text-[#1B3A6B] shadow-md' 
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Thống kê công việc
        </button>
      </div>
      
      {/* ──────────────────────────────────────────────────────── */}
      {/* Tab 1: Lịch sử báo cáo */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'list' && (
        reports.length === 0 ? (
          <div className="card text-center py-10 text-gray-500">
            Chưa có báo cáo nào được tạo.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {reports.map((r) => {
              const isExpanded = !!expandedReports[r.id];
              const fullAddress = [r.address, r.province].filter(Boolean).join(', ') || 'N/A';
              const hasTechnicalData = r.waterSource || r.tdsIn !== null || r.tdsOut !== null || r.waterPressure !== null;
              const hasProblemData = r.issueType || r.handlingMethod;
              
              return (
                <div key={r.id} className="card hover:shadow-md transition-all duration-200 border border-gray-100 bg-white rounded-xl p-4">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3 border-b pb-3 border-gray-100">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-[11px] text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded font-bold">
                          {r.order?.pancakeOrderId ? `#${r.order.pancakeOrderId}` : 'Đơn lẻ'}
                        </span>
                        {r.workType && (
                          <span className={`text-[11px] border px-2 py-0.5 rounded font-semibold ${getWorkTypeColor(r.workType)}`}>
                            {r.workType}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-base text-gray-800">{r.customerName}</span>
                    </div>
                    <div className="text-right text-xs text-gray-400 flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                      <span className="text-[10px]">
                        {new Date(r.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  
                  {/* Quick Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                      <div>
                        <span className="text-gray-400 mr-1">SĐT:</span> 
                        <a href={`tel:${r.customerPhone}`} className="font-semibold text-blue-600 hover:underline">
                          {r.customerPhone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="truncate">
                        <span className="text-gray-400 mr-1">Địa chỉ:</span> 
                        <span className="font-semibold text-gray-800" title={fullAddress}>{fullAddress}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-gray-400 shrink-0" />
                      <div>
                        <span className="text-gray-400 mr-1">Dịch vụ:</span> 
                        <span className="font-semibold text-gray-800">{r.serviceType || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gray-400 shrink-0" />
                      <div>
                        <span className="text-gray-400 mr-1">Thu thực tế:</span> 
                        <span className="font-semibold text-emerald-600">{(r.actualAmount || 0).toLocaleString('vi-VN')} đ</span>
                      </div>
                    </div>
                    {r.serialNumber && (
                      <div className="flex items-center gap-2 sm:col-span-2">
                        <Tag className="w-4 h-4 text-gray-400 shrink-0" />
                        <div>
                          <span className="text-gray-400 mr-1">Số serial:</span> 
                          <span className="font-mono font-bold text-gray-800">{r.serialNumber}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Call Customer status */}
                  {r.order?.ktvCalledAt && (
                    <div className="mb-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                        📞 Đã gọi khách lúc: {new Date(r.order.ktvCalledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(r.order.ktvCalledAt).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  )}

                  {/* Collapsible Section */}
                  {isExpanded && (
                    <div className="border-t pt-3 mt-3 border-dashed border-gray-200 text-xs text-gray-600 animate-slide-down flex flex-col gap-3">
                      {/* Products */}
                      {r.products && r.products.length > 0 && (
                        <div>
                          <span className="font-bold text-gray-500 block mb-1">Sản phẩm:</span>
                          <div className="flex flex-wrap gap-1">
                            {r.products.map((p: string, idx: number) => (
                              <span key={idx} className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Water and pressure measurements */}
                      {hasTechnicalData && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                            <Droplets className="w-3.5 h-3.5 text-blue-500" /> Thông số nước & Áp suất
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {r.waterSource && (
                              <div>
                                <span className="text-gray-400">Nguồn nước:</span>{' '}
                                <span className="font-medium text-gray-700">{r.waterSource}</span>
                              </div>
                            )}
                            {r.waterPressure !== null && (
                              <div>
                                <span className="text-gray-400">Áp suất vào:</span>{' '}
                                <span className="font-medium text-gray-700">{r.waterPressure} psi</span>
                              </div>
                            )}
                            {r.tdsIn !== null && (
                              <div>
                                <span className="text-gray-400">TDS vào:</span>{' '}
                                <span className="font-medium text-gray-700">{r.tdsIn} ppm</span>
                              </div>
                            )}
                            {r.tdsOut !== null && (
                              <div>
                                <span className="text-gray-400">TDS ra:</span>{' '}
                                <span className="font-medium text-gray-700">{r.tdsOut} ppm</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Spare Parts */}
                      {r.spareParts && r.spareParts.length > 0 && (
                        <div>
                          <span className="font-bold text-gray-500 block mb-1">Linh kiện thay thế:</span>
                          <div className="flex flex-wrap gap-1">
                            {r.spareParts.map((part: string, idx: number) => (
                              <span key={idx} className="bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded font-medium">
                                {part}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Issue Cause & Method */}
                      {hasProblemData && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                          {r.issueType && (
                            <div>
                              <span className="font-bold text-gray-500 block mb-0.5">Sự cố / Nguyên nhân:</span>
                              <span className="font-medium text-gray-700">{r.issueType}</span>
                            </div>
                          )}
                          {r.handlingMethod && (
                            <div>
                              <span className="font-bold text-gray-500 block mb-0.5">Cách xử lý:</span>
                              <span className="font-medium text-gray-700">{r.handlingMethod}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Notes */}
                      {r.notes && (
                        <div className="bg-yellow-50/55 p-2.5 rounded-lg border border-yellow-100/70">
                          <span className="font-bold text-amber-800 block mb-0.5">Ghi chú:</span>
                          <p className="text-gray-700 italic font-medium whitespace-pre-wrap">{r.notes}</p>
                        </div>
                      )}

                      {/* Distance */}
                      {r.distanceKm !== null && (
                        <div>
                          <span className="text-gray-400">Khoảng cách di chuyển:</span>{' '}
                          <span className="font-semibold text-gray-700">{r.distanceKm} km</span>
                        </div>
                      )}

                      {/* Images */}
                      {r.imageUrls && r.imageUrls.length > 0 && (
                        <div>
                          <span className="font-bold text-gray-500 block mb-1.5">Hình ảnh báo cáo:</span>
                          <div className="grid grid-cols-3 gap-2">
                            {r.imageUrls.map((url: string, index: number) => (
                              <a 
                                key={index} 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-500 transition-all flex items-center justify-center bg-gray-50 group"
                              >
                                <img src={url} alt={`Báo cáo ảnh ${index + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <ExternalLink className="w-4 h-4 text-white drop-shadow" />
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 mt-3 pt-2.5 border-t border-gray-100">
                    {['lắp đặt', 'giao hàng và lắp đặt'].includes(r.workType?.trim().toLowerCase()) && r.serialNumber && r.serialNumber !== 'XXXXXXXXXXXXXXX' && (
                      <button 
                        type="button"
                        onClick={() => handleOpenActivation(r)}
                        className="w-full flex items-center justify-center gap-1.5 text-xs text-white bg-green-600 hover:bg-green-700 font-bold py-2 rounded-lg transition-colors border border-green-500"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Kích hoạt bảo hành (ZNS)
                      </button>
                    )}
                    <div className="flex items-center gap-3 w-full">
                      <button 
                        type="button"
                        onClick={() => navigate('/ktv/report', { state: { editReportId: r.id } })}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-bold py-2 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                      >
                        <Edit className="w-3.5 h-3.5" /> Sửa báo cáo
                      </button>
                      <button 
                        type="button"
                        onClick={() => toggleExpand(r.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-bold py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                      >
                        {isExpanded ? (
                          <>
                            Thu gọn <ChevronUp className="w-3.5 h-3.5" />
                          </>
                        ) : (
                          <>
                            Chi tiết <ChevronDown className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ──────────────────────────────────────────────────────── */}
      {/* Tab 2: Thống kê công việc */}
      {/* ──────────────────────────────────────────────────────── */}
      {activeTab === 'stats' && (
        <div className="flex flex-col gap-6">
          
          {/* Bộ lọc Thống kê */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            {/* Thanh đơn chọn khoảng ngày */}
            <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm hover:border-blue-300 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <div className="flex items-center gap-1.5 flex-wrap flex-1 text-sm font-semibold text-gray-700">
                <input
                  type="date"
                  className="bg-transparent border-none outline-none text-gray-800 cursor-pointer focus:ring-0 py-0.5 px-1 text-sm font-bold min-w-[125px]"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
                <span className="text-gray-400 font-normal">đến</span>
                <input
                  type="date"
                  className="bg-transparent border-none outline-none text-gray-800 cursor-pointer focus:ring-0 py-0.5 px-1 text-sm font-bold min-w-[125px]"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
              <Calendar className="w-5 h-5 text-[#1B3A6B] shrink-0 ml-2" />
            </div>

            {/* Checkboxes inline */}
            <div className="flex items-center justify-start gap-5 flex-wrap pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 font-semibold group">
                <input
                  type="checkbox"
                  className="rounded border-gray-350 text-blue-650 focus:ring-blue-500 w-4.5 h-4.5 cursor-pointer transition-colors"
                  checked={showPending}
                  onChange={e => setShowPending(e.target.checked)}
                />
                <span className="group-hover:text-blue-600 transition-colors">Chưa làm</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 font-semibold group">
                <input
                  type="checkbox"
                  className="rounded border-gray-350 text-blue-655 focus:ring-blue-500 w-4.5 h-4.5 cursor-pointer transition-colors"
                  checked={showProgress}
                  onChange={e => setShowProgress(e.target.checked)}
                />
                <span className="group-hover:text-blue-600 transition-colors">Đang làm</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 font-semibold group">
                <input
                  type="checkbox"
                  className="rounded border-gray-350 text-blue-660 focus:ring-blue-500 w-4.5 h-4.5 cursor-pointer transition-colors"
                  checked={showCompleted}
                  onChange={e => setShowCompleted(e.target.checked)}
                />
                <span className="group-hover:text-blue-600 transition-colors">Hoàn thành</span>
              </label>
            </div>
          </div>

          {statsLoading ? (
            <div className="text-center py-12"><span className="spinner border-t-[#1B3A6B]"></span></div>
          ) : !stats ? (
            <div className="card text-center py-10 text-gray-500">
              Không thể tải dữ liệu thống kê. Vui lòng thử lại.
            </div>
          ) : (
            <>
              {/* Thống kê Tổng quan (4 hộp màu) */}
              <div className="grid grid-cols-4 gap-2 md:gap-3.5">
                <div className="bg-[#F64E60] text-white rounded-xl md:rounded-2xl p-2.5 md:p-4 shadow-sm flex flex-col items-center justify-center text-center transition-transform hover:scale-[1.02] duration-200">
                  <strong className="text-xl md:text-3xl font-extrabold">{getFilteredSummary().total}</strong>
                  <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider opacity-90 mt-1">Tổng cộng</span>
                </div>
                <div className="bg-[#FFA800] text-white rounded-xl md:rounded-2xl p-2.5 md:p-4 shadow-sm flex flex-col items-center justify-center text-center transition-transform hover:scale-[1.02] duration-200">
                  <strong className="text-xl md:text-3xl font-extrabold">{getFilteredSummary().pending}</strong>
                  <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider opacity-90 mt-1">Chưa làm</span>
                </div>
                <div className="bg-[#1BC5BD] text-white rounded-xl md:rounded-2xl p-2.5 md:p-4 shadow-sm flex flex-col items-center justify-center text-center transition-transform hover:scale-[1.02] duration-200">
                  <strong className="text-xl md:text-3xl font-extrabold">{getFilteredSummary().progress}</strong>
                  <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider opacity-90 mt-1">Đang làm</span>
                </div>
                <div className="bg-[#3699FF] text-white rounded-xl md:rounded-2xl p-2.5 md:p-4 shadow-sm flex flex-col items-center justify-center text-center transition-transform hover:scale-[1.02] duration-200">
                  <strong className="text-xl md:text-3xl font-extrabold">{getFilteredSummary().completed}</strong>
                  <span className="text-[9px] md:text-xs font-bold uppercase tracking-wider opacity-90 mt-1">Hoàn thành</span>
                </div>
              </div>

              {/* Chart 1: Trạng thái theo loại công việc */}
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">
                  📊 Phân loại công việc theo trạng thái
                </h3>
                
                {(() => {
                  const { list, limitVal, ticks } = getChart1Data();
                  if (list.length === 0) {
                    return <p className="text-center py-6 text-xs text-gray-400">Không có dữ liệu công việc trong khoảng thời gian này</p>;
                  }

                  return (
                    <div className="flex flex-col gap-5">
                      <div className="relative pl-16 pb-2">
                        {/* Grid Lines */}
                        <div className="absolute inset-y-0 left-16 right-0 pointer-events-none">
                          {ticks.map(tick => {
                            const leftPercent = (tick / limitVal) * 100;
                            return (
                              <div 
                                key={tick} 
                                className="absolute top-0 bottom-0 border-l border-gray-150 border-dashed h-full"
                                style={{ left: `${leftPercent}%` }}
                              />
                            );
                          })}
                        </div>

                        {/* Bars */}
                        <div className="flex flex-col gap-3.5 relative z-10 pt-2">
                          {list.map((item: any) => {
                            const total = item.total || 1;
                            const barWidthPercent = (total / limitVal) * 100;
                            
                            const pendingW = (item.pending / total) * 100;
                            const progressW = (item.progress / total) * 100;
                            const completedW = (item.completed / total) * 105; // slightly adjust to prevent rounding gap

                            return (
                              <div key={item.name} className="flex items-center h-6">
                                <div className="w-16 -ml-16 pr-2 text-[11px] font-bold text-gray-500 text-right truncate" title={item.name}>
                                  {item.name}
                                </div>
                                <div className="flex-1 h-5 relative">
                                  <div 
                                    className="h-full bg-gray-50 rounded overflow-hidden flex shadow-inner border border-gray-100"
                                    style={{ width: `${barWidthPercent}%` }}
                                  >
                                    {item.pending > 0 && (
                                      <div 
                                        style={{ width: `${pendingW}%` }} 
                                        className="bg-[#FFA800] h-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
                                        title={`Chưa làm: ${item.pending}`}
                                      >
                                        {item.pending}
                                      </div>
                                    )}
                                    {item.progress > 0 && (
                                      <div 
                                        style={{ width: `${progressW}%` }} 
                                        className="bg-[#1BC5BD] h-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
                                        title={`Đang làm: ${item.progress}`}
                                      >
                                        {item.progress}
                                      </div>
                                    )}
                                    {item.completed > 0 && (
                                      <div 
                                        style={{ width: `${completedW}%` }} 
                                        className="bg-[#3699FF] h-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
                                        title={`Hoàn thành: ${item.completed}`}
                                      >
                                        {item.completed}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* X-Axis Labels */}
                      <div className="relative ml-16 h-4 text-[10px] text-gray-400 mt-1">
                        {ticks.map(tick => {
                          const leftPercent = (tick / limitVal) * 100;
                          return (
                            <span 
                              key={tick} 
                              className="absolute -translate-x-1/2 font-bold"
                              style={{ left: `${leftPercent}%` }}
                            >
                              {tick}
                            </span>
                          );
                        })}
                      </div>
                      <div className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider -mt-1">
                        Số lượng công việc
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Chart 2: Đúng hẹn vs Trễ hẹn */}
              {stats.delaySummary && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">
                    📅 Tỷ lệ Đúng hẹn / Trễ hẹn so với lịch hẹn
                  </h3>
                  
                  {/* Legend (2 boxes side-by-side) */}
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-emerald-800 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#1BC5BD]"></span> Đúng hẹn
                      </span>
                      <strong className="text-lg font-extrabold text-[#1BC5BD]">
                        {stats.delaySummary.onTime} ({stats.delaySummary.onTimePercent}%)
                      </strong>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] font-bold text-rose-800 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#F64E60]"></span> Trễ hẹn
                      </span>
                      <strong className="text-lg font-extrabold text-[#F64E60]">
                        {stats.delaySummary.late} ({stats.delaySummary.latePercent}%)
                      </strong>
                    </div>
                  </div>

                  {(() => {
                    const { list, limitVal, ticks } = getChart2Data();
                    if (list.length === 0) {
                      return <p className="text-center py-6 text-xs text-gray-400">Không có dữ liệu lịch hẹn trong khoảng thời gian này</p>;
                    }

                    return (
                      <div className="flex flex-col gap-5">
                        <div className="relative pl-16 pb-2">
                          {/* Grid Lines */}
                          <div className="absolute inset-y-0 left-16 right-0 pointer-events-none">
                            {ticks.map(tick => {
                              const leftPercent = (tick / limitVal) * 100;
                              return (
                                <div 
                                  key={tick} 
                                  className="absolute top-0 bottom-0 border-l border-gray-150 border-dashed h-full"
                                  style={{ left: `${leftPercent}%` }}
                                />
                              );
                            })}
                          </div>

                          {/* Bars */}
                          <div className="flex flex-col gap-3.5 relative z-10 pt-2">
                            {list.map((item: any) => {
                              const total = item.total || 1;
                              const barWidthPercent = (total / limitVal) * 100;
                              
                              const onTimeW = (item.onTime / total) * 100;
                              const lateW = (item.late / total) * 100;

                              return (
                                <div key={item.name} className="flex items-center h-6">
                                  <div className="w-16 -ml-16 pr-2 text-[11px] font-bold text-gray-500 text-right truncate" title={item.name}>
                                    {item.name}
                                  </div>
                                  <div className="flex-1 h-5 relative">
                                    <div 
                                      className="h-full bg-gray-50 rounded overflow-hidden flex shadow-inner border border-gray-100"
                                      style={{ width: `${barWidthPercent}%` }}
                                    >
                                      {item.onTime > 0 && (
                                        <div 
                                          style={{ width: `${onTimeW}%` }} 
                                          className="bg-[#1BC5BD] h-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
                                          title={`Đúng hẹn: ${item.onTime}`}
                                        >
                                          {item.onTime}
                                        </div>
                                      )}
                                      {item.late > 0 && (
                                        <div 
                                          style={{ width: `${lateW}%` }} 
                                          className="bg-[#F64E60] h-full flex items-center justify-center text-[10px] font-bold text-white transition-all duration-300"
                                          title={`Trễ hẹn: ${item.late}`}
                                        >
                                          {item.late}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* X-Axis Labels */}
                        <div className="relative ml-16 h-4 text-[10px] text-gray-400 mt-1">
                          {ticks.map(tick => {
                            const leftPercent = (tick / limitVal) * 100;
                            return (
                              <span 
                                key={tick} 
                                className="absolute -translate-x-1/2 font-bold"
                                style={{ left: `${leftPercent}%` }}
                              >
                                {tick}
                              </span>
                            );
                          })}
                        </div>
                        <div className="text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider -mt-1">
                          Số lượng công việc
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Accordion List: Số ca hoàn thành hàng ngày */}
              {stats.dailyBreakdown && stats.dailyBreakdown.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                  <h3 className="font-bold text-sm text-gray-800 border-b pb-3 mb-4">
                    📋 Số ca hoàn thành hàng ngày trong tháng
                  </h3>
                  <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
                    {stats.dailyBreakdown.map((day: any) => (
                      <div 
                        key={day.date} 
                        className="flex flex-col p-3.5 bg-gray-50 border border-gray-150 rounded-xl gap-2 hover:bg-gray-100/50 hover:shadow-xs transition-all duration-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                            <strong className="text-sm text-gray-800">{day.date}</strong>
                          </div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                            {day.total} ca hoàn thành
                          </span>
                        </div>
                        {/* Các tag chi tiết loại công việc */}
                        {day.workTypes && day.workTypes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {day.workTypes.map((wt: any, idx: number) => (
                              <span 
                                key={idx} 
                                className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-white border border-gray-200 text-gray-700 shadow-2xs"
                              >
                                {wt.name}: <span className="ml-1 font-bold text-blue-600">{wt.count}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          day.details && (
                            <span className="text-[11px] text-gray-400 font-normal italic">
                              ({day.details})
                            </span>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showActivationModal && activationData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-gray-150 animate-slide-up">
            {activationStep === 1 ? (
              <>
                {/* Step 1: Xác nhận thông tin gửi */}
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <div className="text-left">
                    <h3 className="font-bold text-gray-800 text-base">Kích Hoạt Bảo Hành</h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">Xác nhận thông tin gửi tin nhắn Zalo ZNS</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowActivationModal(false)}
                    className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto max-h-[60vh] space-y-4 text-left">
                  {/* Máy & Serial Card */}
                  <div className="bg-blue-50/40 border border-blue-100/50 rounded-xl p-4 flex gap-3 items-start">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                      <CheckCircle size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Thiết bị lắp đặt</h4>
                      <p className="text-sm font-bold text-gray-800 mt-0.5 truncate">{activationData.model}</p>
                      <p className="text-xs font-mono text-blue-600 mt-1 bg-blue-50 inline-block px-2 py-0.5 rounded">
                        S/N: {activationData.serialNumber}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-2">
                        ⏱️ Hạn bảo hành: <strong className="text-gray-700">{warrantyDurationText}</strong> (Tính từ hôm báo cáo được duyệt)
                      </p>
                    </div>
                  </div>

                  {/* Khách hàng Card */}
                  <div className="border border-gray-100 rounded-xl p-4 space-y-2.5 bg-white">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5">Thông tin khách hàng</h4>
                    
                    <div className="grid grid-cols-3 gap-1.5 text-xs text-gray-600">
                      <span className="font-medium text-gray-400">Họ tên:</span>
                      <span className="col-span-2 font-semibold text-gray-800">{activationData.customerName}</span>
                      
                      <span className="font-medium text-gray-400">Địa chỉ:</span>
                      <span className="col-span-2 text-gray-700 leading-relaxed truncate">{activationData.address}</span>
                    </div>
                  </div>

                  {/* Gửi tin nhắn Input */}
                  <div className="space-y-1.5 text-left">
                    <label className="block text-xs font-bold text-gray-600 uppercase">Số điện thoại nhận tin Zalo</label>
                    <input 
                      type="tel" 
                      className="form-input w-full font-semibold text-sm tracking-wider px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      value={znsPhone}
                      onChange={(e) => setZnsPhone(e.target.value)}
                      placeholder="Nhập số điện thoại nhận ZNS..."
                    />
                    <p className="text-[10px] text-gray-400 leading-relaxed mt-1">
                      ⚠️ KTV có thể thay đổi SĐT này nếu khách hàng dùng số Zalo khác SĐT đăng ký đơn hàng.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    className="btn btn-outline flex-1 py-2 text-sm border border-gray-300 rounded-lg"
                    onClick={() => { setShowActivationModal(false); }}
                  >
                    Để sau
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex justify-center items-center gap-1.5"
                    onClick={handleSendZns}
                    disabled={znsSending}
                  >
                    {znsSending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Đang gửi...
                      </>
                    ) : (
                      <>
                        <Send size={16} /> Kích hoạt ZNS
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Step 2: Kích hoạt gửi thành công */}
                <div className="p-6 text-center space-y-4">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 shadow-sm">
                    <CheckCircle size={36} />
                  </div>
                  
                  <div className="space-y-1">
                    <h3 className="font-bold text-gray-800 text-lg">Kích Hoạt Thành Công!</h3>
                    <p className="text-xs text-gray-500 px-4 leading-relaxed">
                      Bảo hành thiết bị đã được kích hoạt thành công trên hệ thống. Tin nhắn ZNS thông báo đã được gửi đến số Zalo:
                    </p>
                    <p className="text-base font-bold text-blue-600 tracking-wider mt-1">{znsPhone}</p>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 text-left text-xs text-emerald-800 leading-relaxed max-w-sm mx-auto">
                    💡 <strong>Thông tin gửi khách hàng:</strong> Khách hàng sẽ nhận được tin nhắn xác nhận bảo hành từ Zalo OA <strong>Pure Vita</strong>. Khách hàng không cần thực hiện thêm bất cứ thao tác xác nhận nào khác.
                  </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    className="btn btn-primary flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                    onClick={() => { setShowActivationModal(false); loadReports(); }}
                  >
                    Đóng
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
