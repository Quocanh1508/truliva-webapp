import { useEffect, useState } from 'react';
import { fetchApi } from '../../api/client';
import { Download, CheckCircle, Clock, X, ExternalLink, Image as ImageIcon, Loader } from 'lucide-react';

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

  useEffect(() => {
    loadReports();
  }, [filterMonth]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const url = filterMonth ? `/reports?month=${filterMonth}&limit=100` : '/reports?limit=100';
      const data = await fetchApi(url);
      setReports(data.reports);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const url = filterMonth ? `/api/reports/export?month=${filterMonth}` : '/api/reports/export';
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

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-bold text-2xl text-[#1B3A6B]">Danh sách báo cáo</h2>
        
        <div className="flex gap-4">
          <input 
            type="text" 
            className="form-input" 
            style={{ width: '150px', padding: '0.5rem' }} 
            placeholder="Tháng (vd: 5/2026)" 
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
          />
          <button className="btn btn-outline flex items-center gap-2" onClick={handleExport}>
            <Download size={18} /> Xuất Excel
          </button>
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
                <th style={{ padding: '12px 16px' }}>Hình ảnh</th>
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
