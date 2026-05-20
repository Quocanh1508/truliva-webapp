import { useEffect, useState } from 'react';
import { fetchApi } from '../../api/client';
import { Download, CheckCircle, Clock, X, ExternalLink, Image as ImageIcon, Loader, Search } from 'lucide-react';

// Check if a URL points to a directly viewable image
function isDirectImage(url: string): boolean {
  if (url.includes('cloudinary.com') || url.includes('res.cloudinary.com')) return true;
  if (url.includes('/uploads/')) return true; // Local uploads
  if (url.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i)) return true;
  return false;
}

// Single image item component with loading/error states
function ImageItem({ url, index }: { url: string; index: number }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  if (!isDirectImage(url)) {
    // External link (Drive, etc.)
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2"
        style={{
          padding: '8px 10px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
          color: '#1a56db',
          fontSize: '13px',
          textDecoration: 'none',
        }}
      >
        <ExternalLink size={14} style={{ flexShrink: 0 }} />
        Ảnh {index + 1} (mở link)
      </a>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {status === 'loading' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px', backgroundColor: '#f1f5f9', borderRadius: '6px'
        }}>
          <Loader size={18} className="animate-spin" style={{ marginRight: '8px' }} />
          <span style={{ fontSize: '13px', color: '#64748b' }}>Đang tải ảnh {index + 1}...</span>
        </div>
      )}
      {status === 'error' && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2"
          style={{
            padding: '8px 10px',
            backgroundColor: '#fef2f2',
            borderRadius: '6px',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '13px',
            textDecoration: 'none',
          }}
        >
          <ImageIcon size={14} style={{ flexShrink: 0 }} />
          Ảnh {index + 1} — nhấn để mở
        </a>
      )}
      <img
        src={url}
        alt={`Ảnh ${index + 1}`}
        style={{
          width: '100%',
          borderRadius: '6px',
          cursor: 'pointer',
          display: status === 'loaded' ? 'block' : 'none',
        }}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        onClick={() => window.open(url, '_blank')}
      />
    </div>
  );
}

export default function ReportList() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const getDateRange = () => {
    if (!datePreset) return { startDate: '', endDate: '' };
    const now = new Date();
    if (datePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
    }
    if (datePreset === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      return { startDate: start.toISOString().split('T')[0], endDate: end.toISOString().split('T')[0] };
    }
    if (datePreset === 'week') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
    }
    if (datePreset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), 0, 0, 0, 0);
      return { startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
    }
    if (datePreset === 'year') {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0, 0);
      return { startDate: start.toISOString().split('T')[0], endDate: now.toISOString().split('T')[0] };
    }
    if (datePreset === 'custom') {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    return { startDate: '', endDate: '' };
  };

  useEffect(() => {
    loadReports();
  }, [filterMonth, datePreset, customStartDate, customEndDate]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '100');
      if (filterMonth) params.append('month', filterMonth);
      if (search) params.append('search', search);
      
      const { startDate, endDate } = getDateRange();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const data = await fetchApi(`/reports?${params.toString()}`);
      setReports(data.reports);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadReports();
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (filterMonth) params.append('month', filterMonth);
    if (search) params.append('search', search);
    
    const { startDate, endDate } = getDateRange();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const url = `/api/reports/export?${params.toString()}`;
    window.open(url, '_blank');
  };

  const togglePaidStatus = async (id: string, currentStatus: boolean) => {
    try {
      await fetchApi(`/reports/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isPaid: !currentStatus })
      });
      loadReports();
    } catch (e) {
      alert('Lỗi cập nhật');
    }
  };

  const handleDeleteReport = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa báo cáo này? Thao tác này không thể hoàn tác.')) {
      return;
    }
    
    try {
      await fetchApi(`/reports/${id}`, { method: 'DELETE' });
      alert('Đã xóa báo cáo thành công');
      loadReports();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi xóa báo cáo');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-2xl text-[#1B3A6B]">Danh sách báo cáo</h2>
        <button className="btn btn-outline flex items-center gap-2" onClick={handleExport}>
          <Download size={18} /> Xuất Excel
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200 mb-6 shadow-sm">
        <form onSubmit={handleSearch} className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Tìm theo Mã đơn, KTV, Khách hàng, SĐT..."
            className="w-full pl-9 pr-3 py-2 text-[13px] border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <div className="flex flex-wrap items-center gap-3">
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                className="px-3 py-1.5 text-[13px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
              />
              <span className="text-gray-400 text-sm">đến</span>
              <input 
                type="date" 
                className="px-3 py-1.5 text-[13px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          )}
          <select 
            className="px-3 py-2 text-[13px] border border-gray-300 rounded-md bg-white text-gray-700 outline-none"
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
          >
            <option value="">Tất cả thời gian</option>
            <option value="today">Hôm nay</option>
            <option value="yesterday">Hôm qua</option>
            <option value="week">1 tuần qua</option>
            <option value="month">1 tháng qua</option>
            <option value="year">1 năm qua</option>
            <option value="custom">Tự chọn khoảng...</option>
          </select>

          <input 
            type="text" 
            className="px-3 py-1.5 text-[13px] border border-gray-300 rounded-md outline-none text-gray-700 bg-white"
            style={{ width: '130px' }} 
            placeholder="Tháng (vd: 5/2026)" 
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10"><span className="spinner border-t-[#1B3A6B]"></span></div>
      ) : (
        <div className="card table-container" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px' }}>Mã đơn</th>
                <th style={{ padding: '12px 16px' }}>KTV</th>
                <th style={{ padding: '12px 16px' }}>Khách hàng</th>
                <th style={{ padding: '12px 16px' }}>Dịch vụ</th>
                <th style={{ padding: '12px 16px' }}>Tỉnh/TP</th>
                <th style={{ padding: '12px 16px' }}>Tiền thu</th>
                <th style={{ padding: '12px 16px' }}>Trạng thái</th>
                <th style={{ padding: '12px 16px' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => {
                const urls: string[] = r.imageUrls && r.imageUrls.length > 0 ? [...new Set(r.imageUrls)] as string[] : [];
                const isPopupOpen = openPopupId === r.id;

                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }} className="hover:bg-gray-50">
                    <td style={{ padding: '12px 16px' }}>
                      {r.order?.pancakeOrderId ? (
                        <span className="font-bold text-blue-700">#{r.order.pancakeOrderId}</span>
                      ) : (
                        <span className="text-gray-400 text-sm">---</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }} className="font-medium">{r.ktvUser.fullName}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{r.customerName}</div>
                      <div className="text-xs text-gray-500">{r.customerPhone}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div>{r.serviceType}</div>
                      <div className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{r.province}</td>
                    <td style={{ padding: '12px 16px' }} className="font-bold">
                      {(r.actualAmount || 0).toLocaleString('vi-VN')} đ
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button 
                        onClick={() => togglePaidStatus(r.id, r.isPaid)}
                        className={`px-2 py-1 text-xs rounded font-bold flex items-center gap-1 ${r.isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
                      >
                        {r.isPaid ? <><CheckCircle size={12}/> Đã trả</> : <><Clock size={12}/> Chưa trả</>}
                      </button>
                    </td>
                    <td style={{ padding: '12px 16px', position: 'relative' }}>
                      {urls.length === 0 ? (
                        <span className="text-gray-400 text-sm">Không có</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => setOpenPopupId(isPopupOpen ? null : r.id)}
                              className="text-sm font-medium"
                              style={{ 
                                color: 'var(--primary)', background: 'none', 
                                cursor: 'pointer', whiteSpace: 'nowrap' 
                              }}
                            >
                              Xem ảnh
                            </button>
                            
                            <button
                              onClick={() => handleDeleteReport(r.id)}
                              className="text-sm font-medium"
                              style={{ 
                                color: '#dc2626', background: 'none', 
                                cursor: 'pointer', whiteSpace: 'nowrap' 
                              }}
                            >
                              Xóa
                            </button>
                          </div>
                          {isPopupOpen && (
                            <div style={{
                              position: 'absolute',
                              right: 0,
                              top: '100%',
                              zIndex: 50,
                              backgroundColor: '#fff',
                              borderRadius: '8px',
                              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                              border: '1px solid var(--border-color)',
                              padding: '12px',
                              width: '340px',
                              maxHeight: '500px',
                              overflowY: 'auto'
                            }}>
                              <div className="flex justify-between items-center" style={{ marginBottom: '10px' }}>
                                <span className="text-sm font-bold">Hình ảnh báo cáo ({urls.length})</span>
                                <button onClick={() => setOpenPopupId(null)} style={{ background: 'none', padding: '4px', cursor: 'pointer' }}>
                                  <X size={16} />
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {urls.map((url: string, idx: number) => (
                                  <ImageItem key={idx} url={url} index={idx} />
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {reports.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-500">Không có dữ liệu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
