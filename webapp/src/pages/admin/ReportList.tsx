import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchApi, deleteReportWithReason } from '../../api/client';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParam = searchParams.get('search') || '';

  const [reports, setReports] = useState<any[]>([]);
  const [selectedDetailReport, setSelectedDetailReport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParam);
  const [datePreset, setDatePreset] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; reportId: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

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
    setSearch(searchParam);
  }, [searchParam]);

  useEffect(() => {
    loadReports(searchParam);
  }, [filterMonth, datePreset, customStartDate, customEndDate, searchParam]);

  const loadReports = async (overrideSearch?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '100');
      if (filterMonth) params.append('month', filterMonth);
      
      const currentSearch = overrideSearch !== undefined ? overrideSearch : search;
      if (currentSearch) params.append('search', currentSearch);
      
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
    setSearchParams(search ? { search } : {});
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

  const confirmDeleteReport = async () => {
    if (!deleteModal) return;
    if (!deleteReason.trim()) {
      alert('Vui lòng nhập lý do xóa báo cáo');
      return;
    }
    
    setDeleting(true);
    try {
      await deleteReportWithReason(deleteModal.reportId, deleteReason);
      alert('Đã xóa báo cáo thành công');
      setDeleteModal(null);
      setDeleteReason('');
      loadReports();
    } catch (e: any) {
      alert(e.message || 'Lỗi khi xóa báo cáo');
    } finally {
      setDeleting(false);
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
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setSelectedDetailReport(r)}
                          className="text-sm font-medium hover:underline text-blue-600"
                          style={{ background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Chi tiết
                        </button>
                        
                        {urls.length > 0 && (
                          <button 
                            onClick={() => setOpenPopupId(isPopupOpen ? null : r.id)}
                            className="text-sm font-medium hover:underline"
                            style={{ 
                              color: 'var(--primary)', background: 'none', 
                              cursor: 'pointer', whiteSpace: 'nowrap' 
                            }}
                          >
                            Xem ảnh
                          </button>
                        )}
                        
                        <button
                          onClick={() => setDeleteModal({ isOpen: true, reportId: r.id })}
                          className="text-sm font-medium hover:underline text-red-600"
                          style={{ background: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Xóa
                        </button>
                      </div>
                      {isPopupOpen && urls.length > 0 && (
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

      {selectedDetailReport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-100">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-5 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-lg text-[#1B3A6B]">
                Chi tiết báo cáo {selectedDetailReport.order?.pancakeOrderId ? `#${selectedDetailReport.order.pancakeOrderId}` : ''}
              </h3>
              <button 
                onClick={() => setSelectedDetailReport(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 space-y-6 text-left">
              {/* Step 1: Thông tin chung */}
              <div>
                <h4 className="font-bold text-sm text-gray-800 border-l-4 border-blue-600 pl-2 mb-3 uppercase tracking-wider">
                  Bước 1: Thông tin chung
                </h4>
                <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs">Khách hàng</span>
                    <span className="font-semibold text-gray-800">{selectedDetailReport.customerName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Số điện thoại</span>
                    <span className="font-semibold text-gray-800">{selectedDetailReport.customerPhone}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 block text-xs">Địa chỉ chi tiết</span>
                    <span className="font-medium text-gray-800">{selectedDetailReport.address || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Tỉnh / Thành phố</span>
                    <span className="font-medium text-gray-800">{selectedDetailReport.province}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Kỹ thuật viên</span>
                    <span className="font-medium text-gray-800">{selectedDetailReport.ktvUser?.fullName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Loại công việc</span>
                    <span className="font-semibold text-[#1B3A6B]">{selectedDetailReport.workType || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Loại dịch vụ</span>
                    <span className="font-medium text-gray-800">{selectedDetailReport.serviceType}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500 block text-xs">Sản phẩm thực tế</span>
                    <span className="font-medium text-gray-800">{selectedDetailReport.products?.join(', ') || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Số tiền thu thực tế</span>
                    <span className="font-bold text-emerald-600 text-base">
                      {(selectedDetailReport.actualAmount || 0).toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Tháng báo cáo</span>
                    <span className="font-medium text-gray-800">{selectedDetailReport.month}</span>
                  </div>
                </div>
              </div>
              
              {/* Step 2: Thông tin kỹ thuật */}
              <div>
                <h4 className="font-bold text-sm text-gray-800 border-l-4 border-blue-600 pl-2 mb-3 uppercase tracking-wider">
                  Bước 2: Thông tin kỹ thuật
                </h4>
                <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs">Seri sản phẩm</span>
                    <span className="font-semibold text-gray-800">{selectedDetailReport.serialNumber || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs">Khoảng cách di chuyển</span>
                    <span className="font-medium text-gray-800">
                      {selectedDetailReport.distanceKm ? `${selectedDetailReport.distanceKm} km` : '-'}
                    </span>
                  </div>
                  
                  {/* Trường kỹ thuật có điều kiện */}
                  {selectedDetailReport.waterSource && (
                    <>
                      <div>
                        <span className="text-gray-500 block text-xs">Nguồn nước</span>
                        <span className="font-medium text-gray-800">{selectedDetailReport.waterSource}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Áp suất nước đầu vào</span>
                        <span className="font-medium text-gray-800">
                          {selectedDetailReport.waterPressure ? `${selectedDetailReport.waterPressure} psi` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Chỉ số TDS vào</span>
                        <span className="font-semibold text-gray-800">{selectedDetailReport.tdsIn || 0} ppm</span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-xs">Chỉ số TDS ra</span>
                        <span className="font-semibold text-gray-800">{selectedDetailReport.tdsOut || 0} ppm</span>
                      </div>
                    </>
                  )}
                  
                  <div className="col-span-2">
                    <span className="text-gray-500 block text-xs">Linh kiện phát sinh</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {selectedDetailReport.spareParts && selectedDetailReport.spareParts.length > 0 ? (
                        selectedDetailReport.spareParts.map((part: string, index: number) => (
                          <span key={index} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded border border-blue-100">
                            {part}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-500 italic">Không có linh kiện phát sinh</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Step 3: Hình ảnh xác nhận */}
              <div>
                <h4 className="font-bold text-sm text-gray-800 border-l-4 border-blue-600 pl-2 mb-3 uppercase tracking-wider">
                  Bước 3: Hình ảnh xác nhận
                </h4>
                {selectedDetailReport.imageUrls && selectedDetailReport.imageUrls.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {selectedDetailReport.imageUrls.map((url: string, index: number) => (
                      <div key={index} className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
                        <img 
                          src={url} 
                          alt={`Báo cáo ảnh ${index + 1}`} 
                          className="w-full h-40 object-cover cursor-pointer hover:scale-105 transition-transform duration-300"
                          onClick={() => window.open(url, '_blank')}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-65 text-white text-xs px-2 py-1 font-medium text-center">
                          Ảnh {index + 1} (Click để mở rộng)
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 text-gray-500 text-sm p-4 rounded-lg italic text-center">
                    Không có hình ảnh xác nhận
                  </div>
                )}
              </div>
              
              {/* Step 4: Ghi chú */}
              <div>
                <h4 className="font-bold text-sm text-gray-800 border-l-4 border-blue-600 pl-2 mb-3 uppercase tracking-wider">
                  Bước 4: Xác nhận & Ghi chú của KTV
                </h4>
                <div className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap italic text-gray-700 border-l-2 border-gray-300">
                  {selectedDetailReport.notes || 'Kỹ thuật viên không để lại ghi chú nào.'}
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setSelectedDetailReport(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg text-sm transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-100 p-6 text-left">
            <h3 className="font-bold text-lg text-red-600 mb-4 flex items-center gap-2">
              Xác nhận xóa báo cáo
            </h3>
            
            <p className="text-sm text-gray-600 mb-4">
              Bạn có chắc chắn muốn xóa báo cáo này? Hành động này không thể hoàn tác. Vui lòng nhập lý do xóa báo cáo để thông báo cho Kỹ thuật viên:
            </p>
            
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none text-gray-800 bg-white min-h-[100px]"
              placeholder="Nhập lý do xóa báo cáo (ví dụ: Thiếu ảnh serial sản phẩm, thông tin khách hàng không chính xác...)"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
            
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => {
                  setDeleteModal(null);
                  setDeleteReason('');
                }}
                disabled={deleting}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-sm transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={confirmDeleteReport}
                disabled={deleting || !deleteReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Đang xóa...' : 'Xác nhận xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
