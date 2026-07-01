import { useState, useEffect, useRef } from 'react';
import { fetchApi, API_URL } from '../../api/client';
import { Hash, Upload, Download, Search, X, Clock, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, User, Phone, MapPin, Wrench, FileText, Filter, Edit3, RotateCcw } from 'lucide-react';

interface Serial {
  id: string;
  serialNumber: string;
  model: string;
  status: string;
  activationDate: string | null;
  warrantyExpiryDate: string | null;
  customerConfirmationDate: string | null;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  province: string | null;
  importBatchId: string | null;
  createdAt: string;
  invoiceImageUrl?: string | null;
  activatedBy?: string | null;
  promoCode?: string | null;
  importedBy?: {
    fullName: string;
  } | null;
}

interface SerialStats {
  total: number;
  activated: number;
  unactivated: number;
  confirmed: number;
}

interface HistoryItem {
  id: string;
  workType: string | null;
  serviceType: string | null;
  customerName: string;
  customerPhone: string;
  province: string;
  address: string | null;
  products: string[];
  spareParts: string[];
  serialNumber: string | null;
  notes: string | null;
  issueType: string | null;
  handlingMethod: string | null;
  approvalStatus: string;
  createdAt: string;
  ktvName: string;
  ktvPhone: string | null;
  orderId: string | null;
}

interface ImportSummary {
  totalRowsProcessed: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
}

interface ImportError {
  row: number;
  error: string;
}

export default function SerialManage() {
  const [serials, setSerials] = useState<Serial[]>([]);
  const [stats, setStats] = useState<SerialStats>({ total: 0, activated: 0, unactivated: 0, confirmed: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ summary: ImportSummary; errors: ImportError[] } | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detail modal
  const [selectedSerial, setSelectedSerial] = useState<Serial | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form states for approval & manual activation
  const [promosList, setPromosList] = useState<any[]>([]);
  const [policiesList, setPoliciesList] = useState<any[]>([]);
  const [manualStartDate, setManualStartDate] = useState(new Date().toISOString().substring(0, 10));
  const [selectedPromoCode, setSelectedPromoCode] = useState('');
  const [submittingApprove, setSubmittingApprove] = useState(false);


  useEffect(() => {
    const fetchPromos = async () => {
      try {
        const data = await fetchApi('/promos');
        setPromosList(data || []);
      } catch (err) {
        console.error('Lỗi tải danh sách khuyến mãi', err);
      }
    };
    const fetchPolicies = async () => {
      try {
        const data = await fetchApi('/serials/policies');
        setPoliciesList(data || []);
      } catch (err) {
        console.error('Lỗi tải chính sách bảo hành', err);
      }
    };
    fetchPromos();
    fetchPolicies();
  }, []);

  const calculateExpiryDate = (activationDateStr: string | null, modelName: string, selectedPromoCodeStr: string | null) => {
    if (!activationDateStr) return null;

    const startDate = new Date(activationDateStr);
    if (isNaN(startDate.getTime())) return null;

    // 1. Tính toán thời gian bảo hành tiêu chuẩn (mặc định 12 tháng)
    let standardMonths = 12;
    const matchedPolicy = policiesList.find(p => 
      modelName.toLowerCase().includes(p.modelKeyword.toLowerCase())
    );
    if (matchedPolicy) {
      standardMonths = matchedPolicy.warrantyMonths;
    }

    // 2. Tính toán thời gian khuyến mãi cộng thêm
    let promoMonths = 0;
    if (selectedPromoCodeStr) {
      const promo = promosList.find(p => p.code === selectedPromoCodeStr);
      if (promo) {
        promoMonths = promo.promoMonths;
      }
    }

    const totalMonths = standardMonths + promoMonths;
    const expiryDate = new Date(startDate);
    expiryDate.setMonth(expiryDate.getMonth() + totalMonths);
    return expiryDate.toISOString();
  };

  const handleApproveWarranty = async (serialId: string) => {
    setSubmittingApprove(true);
    try {
      await fetchApi(`/serials/${serialId}/approve-warranty`, {
        method: 'POST',
        body: JSON.stringify({
          manualStartDate: manualStartDate,
          promoCode: selectedPromoCode || null
        })
      });
      alert('Đã phê duyệt bảo hành thành công!');
      setSelectedSerial(null);
      loadSerials();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Lỗi khi phê duyệt bảo hành');
    } finally {
      setSubmittingApprove(false);
    }
  };



  const handleConfirmRestore = async (serial: Serial) => {
    const isConfirmed = window.confirm(`Bạn có chắc chắn muốn khôi phục Serial ${serial.serialNumber} về trạng thái chưa kích hoạt? Toàn bộ thông tin bảo hành và khách hàng sẽ bị xóa sạch.`);
    if (!isConfirmed) return;

    try {
      await fetchApi(`/serials/${serial.id}/restore`, {
        method: 'POST'
      });
      alert('Đã khôi phục Serial về trạng thái chưa kích hoạt thành công!');
      if (selectedSerial && selectedSerial.id === serial.id) {
        setSelectedSerial(null);
      }
      loadSerials();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Lỗi khi khôi phục Serial');
    }
  };

  const handleSaveSerialDetails = async () => {
    if (!selectedSerial) return;
    
    setSubmittingApprove(true);
    try {
      const res = await fetchApi(`/serials/${selectedSerial.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          serialNumber: selectedSerial.serialNumber,
          model: selectedSerial.model,
          status: selectedSerial.status,
          customerName: selectedSerial.customerName,
          customerPhone: selectedSerial.customerPhone,
          address: selectedSerial.address,
          province: selectedSerial.province,
          activationDate: selectedSerial.activationDate,
          warrantyExpiryDate: selectedSerial.warrantyExpiryDate,
          activatedBy: selectedSerial.activatedBy,
          importBatchId: selectedSerial.importBatchId,
          promoCode: selectedSerial.promoCode
        })
      });
      
      alert('Cập nhật thông tin Serial thành công!');
      setSelectedSerial(res.serial);
      loadSerials();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Lỗi khi cập nhật Serial');
    } finally {
      setSubmittingApprove(false);
    }
  };

  const loadSerials = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);

      const data = await fetchApi(`/serials?${params.toString()}`);
      setSerials(data.serials || []);
      setStats(data.stats || { total: 0, activated: 0, unactivated: 0, confirmed: 0 });
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err: any) {
      console.error('Lỗi tải danh sách serial:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSerials(); }, [page, search, statusFilter]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('session_token');
      const response = await fetch(`${API_URL}/serials/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Lỗi import');
      }

      setImportResult({ summary: data.summary, errors: data.errors || [] });
      loadSerials();
    } catch (err: any) {
      setImportResult({
        summary: { totalRowsProcessed: 0, importedCount: 0, skippedCount: 0, errorCount: 1 },
        errors: [{ row: 0, error: err.message }],
      });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    try {
      const token = localStorage.getItem('session_token');
      const response = await fetch(`${API_URL}/serials/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `serial_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi xuất file: ' + err.message);
    }
  };

  const openDetail = async (serial: Serial) => {
    setSelectedSerial(serial);
    setLoadingDetail(true);
    setHistory([]);
    setManualStartDate(new Date().toISOString().substring(0, 10));
    setSelectedPromoCode('');
    try {
      const data = await fetchApi(`/serials/${serial.id}`);
      setSelectedSerial(data.serial);
      setHistory(data.history || []);
    } catch (err: any) {
      console.error('Lỗi tải chi tiết serial:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; color: string; icon: any }> = {
      'Đã kích hoạt': { bg: '#dcfce7', color: '#15803d', icon: <CheckCircle size={14} /> },
      'KH xác nhận': { bg: '#dcfce7', color: '#15803d', icon: <User size={14} /> },
      'Chưa kích hoạt': { bg: '#fef3c7', color: '#b45309', icon: <AlertTriangle size={14} /> },
      'Chờ duyệt': { bg: '#fee2e2', color: '#b91c1c', icon: <Clock size={14} /> },
    };
    const s = styles[status] || { bg: '#f3f4f6', color: '#374151', icon: null };
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 12,
        backgroundColor: s.bg, color: s.color,
        fontSize: 12, fontWeight: 600,
      }}>
        {s.icon} {status}
      </span>
    );
  };

  const getApprovalBadge = (status: string) => {
    if (status === 'APPROVED') return <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 12 }}>✓ Đã duyệt</span>;
    if (status === 'PENDING') return <span style={{ color: '#d97706', fontWeight: 600, fontSize: 12 }}>⏳ Chờ duyệt</span>;
    if (status === 'REJECTED') return <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 12 }}>✗ Từ chối</span>;
    return <span style={{ fontSize: 12 }}>{status}</span>;
  };

  return (
    <div style={{ padding: '20px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Hash size={28} color="#4472C4" />
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1e293b' }}>Quản lý Serial</h1>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Tổng Serial', value: stats.total, color: '#4472C4', bg: '#dbeafe' },
          { label: 'Đã kích hoạt', value: stats.activated, color: '#16a34a', bg: '#dcfce7' },
          { label: 'Chưa kích hoạt', value: stats.unactivated, color: '#d97706', bg: '#fef3c7' },
          { label: 'KH xác nhận', value: stats.confirmed, color: '#1e40af', bg: '#e0e7ff' },
        ].map((stat, i) => (
          <div key={i} style={{
            background: 'white', borderRadius: 12, padding: '16px 20px',
            border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 250 }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'white', border: '1px solid #d1d5db', borderRadius: 8,
            padding: '8px 12px', flex: 1, maxWidth: 400,
          }}>
            <Search size={18} color="#9ca3af" />
            <input
              type="text"
              placeholder="Tìm serial, tên KH, SĐT..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{
                border: 'none', outline: 'none', flex: 1,
                fontSize: 14, color: '#374151', background: 'transparent',
              }}
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <X size={16} color="#9ca3af" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div style={{ position: 'relative' }}>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              style={{
                padding: '8px 32px 8px 12px', borderRadius: 8,
                border: '1px solid #d1d5db', background: 'white',
                fontSize: 14, color: '#374151', cursor: 'pointer',
                appearance: 'none',
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Chưa kích hoạt">Chưa kích hoạt</option>
              <option value="Đã kích hoạt">Đã kích hoạt</option>
              <option value="KH xác nhận">KH xác nhận</option>
              <option value="Chờ duyệt">Chờ duyệt</option>
            </select>
            <Filter size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9ca3af' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Import button */}
          <button
            onClick={() => setShowImportModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              background: '#4472C4', color: 'white', border: 'none',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Upload size={16} /> Import Excel
          </button>

          {/* Export button */}
          <button
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              background: 'white', color: '#374151',
              border: '1px solid #d1d5db',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Download size={16} /> Xuất Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'white', borderRadius: 12,
        border: '1px solid #e2e8f0', overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['Serial/ Model', 'Dòng máy', 'Thông tin khách hàng', 'Trạng thái', 'Ngày kích hoạt', 'Ngày hết hạn bảo hành'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: 'left',
                    fontWeight: 600, color: '#475569', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Đang tải...</td></tr>
              ) : serials.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Không có dữ liệu serial</td></tr>
              ) : serials.map(s => (
                <tr
                  key={s.id}
                  onClick={() => openDetail(s)}
                  style={{
                    borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Column 1: Serial / Model + Quick Actions */}
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#1e40af', fontSize: 14 }}>
                        {s.serialNumber}
                      </span>
                      <span style={{ color: '#dc2626', fontSize: 12, fontWeight: 500 }}>
                        {s.model}
                      </span>
                      {/* Action Icons */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(s);
                          }}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            color: '#64748b', display: 'flex', alignItems: 'center'
                          }}
                          title="Chỉnh sửa thông tin"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfirmRestore(s);
                          }}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            color: '#ef4444', display: 'flex', alignItems: 'center'
                          }}
                          title="Khôi phục trạng thái"
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`${window.location.origin}/admin/reports?search=${s.serialNumber}`, '_blank');
                          }}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            color: '#4f46e5', display: 'flex', alignItems: 'center'
                          }}
                          title="Xem lịch sử / Chính sách"
                        >
                          <FileText size={14} />
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Column 2: Dòng máy */}
                  <td style={{ padding: '12px 16px', verticalAlign: 'top', fontWeight: 550, color: '#334155' }}>
                    {s.model}
                  </td>

                  {/* Column 3: Thông tin khách hàng */}
                  <td style={{ padding: '12px 16px', verticalAlign: 'top', color: '#334155' }}>
                    {s.customerName || s.customerPhone || s.address ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                        {s.customerName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <User size={13} color="#64748b" /> <strong>{s.customerName}</strong>
                          </div>
                        )}
                        {s.customerPhone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Phone size={13} color="#64748b" /> <span style={{ color: '#0f766e', fontWeight: 600 }}>{s.customerPhone}</span>
                          </div>
                        )}
                        {s.address && (
                          <div style={{ display: 'flex', alignItems: 'start', gap: 6 }}>
                            <MapPin size={13} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} /> <span>{s.address}</span>
                          </div>
                        )}
                        {s.province && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MapPin size={13} color="#3b82f6" /> <span>{s.province}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                    )}
                  </td>

                  {/* Column 4: Trạng thái */}
                  <td style={{ padding: '12px 16px', verticalAlign: 'top' }}>
                    {getStatusBadge(s.status)}
                  </td>

                  {/* Column 5: Ngày kích hoạt */}
                  <td style={{ padding: '12px 16px', verticalAlign: 'top', color: '#475569', fontWeight: 500 }}>
                    {formatDateTime(s.activationDate)}
                  </td>

                  {/* Column 6: Ngày hết hạn bảo hành */}
                  <td style={{ padding: '12px 16px', verticalAlign: 'top', color: '#dc2626', fontWeight: 600 }}>
                    {formatDate(s.warrantyExpiryDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
            padding: '16px', borderTop: '1px solid #e2e8f0',
          }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db',
                background: page <= 1 ? '#f3f4f6' : 'white', cursor: page <= 1 ? 'default' : 'pointer',
                color: page <= 1 ? '#9ca3af' : '#374151', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <ChevronLeft size={16} /> Trước
            </button>
            <span style={{ fontSize: 14, color: '#64748b' }}>
              Trang {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db',
                background: page >= totalPages ? '#f3f4f6' : 'white', cursor: page >= totalPages ? 'default' : 'pointer',
                color: page >= totalPages ? '#9ca3af' : '#374151', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              Sau <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          Import Modal
         ═══════════════════════════════════════════════ */}
      {showImportModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => !importing && setShowImportModal(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 16, width: '100%', maxWidth: 520,
              padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>Import Serial từ Excel</h2>
              <button onClick={() => !importing && setShowImportModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            {/* File upload area */}
            <div
              onClick={() => !importing && fileInputRef.current?.click()}
              style={{
                border: '2px dashed #d1d5db', borderRadius: 12, padding: '40px 20px',
                textAlign: 'center', cursor: importing ? 'default' : 'pointer',
                background: '#f8fafc', transition: 'border-color 0.2s',
                marginBottom: 20,
              }}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#4472C4'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#d1d5db';
                const file = e.dataTransfer.files[0];
                if (file && !importing) handleImport(file);
              }}
            >
              <Upload size={36} color="#94a3b8" style={{ marginBottom: 12 }} />
              <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>
                {importing ? 'Đang xử lý...' : 'Kéo thả file Excel hoặc nhấn để chọn file'}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Hỗ trợ file .xlsx (tối đa 10MB)
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = '';
              }}
            />

            {/* Import result */}
            {importResult && (
              <div style={{
                background: importResult.summary.errorCount > 0 && importResult.summary.importedCount === 0
                  ? '#fef2f2' : '#f0fdf4',
                borderRadius: 12, padding: 16, marginBottom: 16,
              }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: '#1e293b' }}>Kết quả Import</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 14 }}>
                  <div>Tổng dòng xử lý: <strong>{importResult.summary.totalRowsProcessed}</strong></div>
                  <div style={{ color: '#16a34a' }}>Import thành công: <strong>{importResult.summary.importedCount}</strong></div>
                  <div style={{ color: '#d97706' }}>Bỏ qua (trùng): <strong>{importResult.summary.skippedCount}</strong></div>
                  <div style={{ color: '#dc2626' }}>Lỗi: <strong>{importResult.summary.errorCount}</strong></div>
                </div>

                {importResult.errors.length > 0 && (
                  <div style={{ marginTop: 12, maxHeight: 150, overflow: 'auto' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>Chi tiết lỗi:</div>
                    {importResult.errors.map((err, i) => (
                      <div key={i} style={{
                        fontSize: 12, color: '#991b1b', padding: '4px 0',
                        borderBottom: '1px solid #fecaca',
                      }}>
                        {err.row > 0 && <strong>Dòng {err.row}:</strong>} {err.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => { setShowImportModal(false); setImportResult(null); }}
              style={{
                width: '100%', padding: '10px', borderRadius: 8,
                background: '#f1f5f9', color: '#475569', border: 'none',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          Detail Modal with History Timeline
         ═══════════════════════════════════════════════ */}
      {selectedSerial && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 20,
        }} onClick={() => setSelectedSerial(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 16, width: '100%', maxWidth: 680,
              maxHeight: '90vh', overflow: 'auto',
              padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
                  Chi tiết Serial
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 15, fontFamily: 'monospace', color: '#4472C4', fontWeight: 600 }}>
                  {selectedSerial.serialNumber}
                </p>
              </div>
              <button onClick={() => setSelectedSerial(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            {/* Serial Info Card & Edit Form */}
            <div style={{
              background: '#f8fafc', borderRadius: 12, padding: 20, marginBottom: 24,
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px', fontSize: 13 }}>
                {/* 1. Số Serial */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Số Serial (*)</label>
                  <input
                    type="text"
                    value={selectedSerial.serialNumber || ''}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, serialNumber: e.target.value } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 2. Dòng máy / Model */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Dòng máy / Model (*)</label>
                  <input
                    type="text"
                    value={selectedSerial.model || ''}
                    onChange={e => {
                      const newModel = e.target.value;
                      setSelectedSerial(prev => {
                        if (!prev) return null;
                        const expiry = calculateExpiryDate(prev.activationDate, newModel, prev.promoCode || null);
                        return { ...prev, model: newModel, warrantyExpiryDate: expiry };
                      });
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 3. Trạng thái */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Trạng thái</label>
                  <select
                    value={selectedSerial.status || 'Chưa kích hoạt'}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, status: e.target.value } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  >
                    <option value="Chưa kích hoạt">Chưa kích hoạt</option>
                    <option value="Chờ duyệt">Chờ duyệt</option>
                    <option value="Đã kích hoạt">Đã kích hoạt</option>
                    <option value="KH xác nhận">KH xác nhận</option>
                  </select>
                </div>

                {/* 4. Người kích hoạt */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Kích hoạt bởi / Chức danh</label>
                  <select
                    value={selectedSerial.activatedBy || ''}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, activatedBy: e.target.value || null } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  >
                    <option value="">Không rõ</option>
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="KTV">KTV</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>

                {/* 5. Tên khách hàng */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tên khách hàng</label>
                  <input
                    type="text"
                    value={selectedSerial.customerName || ''}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, customerName: e.target.value || null } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 6. Số điện thoại */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Số điện thoại</label>
                  <input
                    type="text"
                    value={selectedSerial.customerPhone || ''}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, customerPhone: e.target.value || null } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 7. Địa chỉ cụ thể */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Địa chỉ cụ thể</label>
                  <input
                    type="text"
                    value={selectedSerial.address || ''}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, address: e.target.value || null } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 8. Tỉnh / Thành phố */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tỉnh / Thành phố</label>
                  <input
                    type="text"
                    value={selectedSerial.province || ''}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, province: e.target.value || null } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 9. Mã lô nhập */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Mã lô nhập</label>
                  <input
                    type="text"
                    value={selectedSerial.importBatchId || ''}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, importBatchId: e.target.value || null } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 10. Ngày kích hoạt bảo hành */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Ngày kích hoạt bảo hành</label>
                  <input
                    type="date"
                    value={selectedSerial.activationDate ? new Date(selectedSerial.activationDate).toISOString().split('T')[0] : ''}
                    onChange={e => {
                      const newDate = e.target.value ? new Date(e.target.value).toISOString() : null;
                      setSelectedSerial(prev => {
                        if (!prev) return null;
                        const expiry = calculateExpiryDate(newDate, prev.model, prev.promoCode || null);
                        return { ...prev, activationDate: newDate, warrantyExpiryDate: expiry };
                      });
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 11. Ngày hết hạn bảo hành */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Ngày hết hạn bảo hành</label>
                  <input
                    type="date"
                    value={selectedSerial.warrantyExpiryDate ? new Date(selectedSerial.warrantyExpiryDate).toISOString().split('T')[0] : ''}
                    onChange={e => setSelectedSerial(prev => prev ? { ...prev, warrantyExpiryDate: e.target.value ? new Date(e.target.value).toISOString() : null } : null)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  />
                </div>

                {/* 12. Mã khuyến mãi (Promo Code) */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Mã khuyến mãi áp dụng</label>
                  <select
                    value={selectedSerial.promoCode || ''}
                    onChange={e => {
                      const newPromo = e.target.value || null;
                      setSelectedSerial(prev => {
                        if (!prev) return null;
                        const expiry = calculateExpiryDate(prev.activationDate, prev.model, newPromo);
                        return { ...prev, promoCode: newPromo, warrantyExpiryDate: expiry };
                      });
                    }}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                  >
                    <option value="">Không áp dụng</option>
                    {promosList.map(p => (
                      <option key={p.id} value={p.code}>
                        {p.code} (+{p.promoMonths} tháng)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Creator & Import metadata (Read-only) */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>
                  <strong>Người import lô hàng:</strong> {selectedSerial.importedBy?.fullName || 'Hệ thống / Đồng bộ'}
                </div>
                <div>
                  <strong>Thời gian tạo bản ghi:</strong> {formatDateTime(selectedSerial.createdAt)}
                </div>
              </div>

              {/* Invoice Image view if present */}
              {selectedSerial.invoiceImageUrl && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8 }}>Ảnh hóa đơn mua hàng</div>
                  <a href={selectedSerial.invoiceImageUrl} target="_blank" rel="noreferrer">
                    <img 
                      src={selectedSerial.invoiceImageUrl} 
                      alt="Hóa đơn" 
                      style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'contain', border: '1px solid #cbd5e1' }} 
                    />
                  </a>
                </div>
              )}

              {/* Approval Form for pending verification */}
              {selectedSerial.status === 'Chờ duyệt' && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 8 }}>Duyệt nhanh yêu cầu bảo hành từ khách hàng</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
                     <div style={{ flex: 1 }}>
                       <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Ngày bắt đầu bảo hành</label>
                       <input 
                         type="date" 
                         value={manualStartDate}
                         onChange={e => setManualStartDate(e.target.value)}
                         style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                       />
                     </div>
                     <div style={{ flex: 1 }}>
                       <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Mã khuyến mãi (nếu có)</label>
                       <select
                         value={selectedPromoCode}
                         onChange={e => setSelectedPromoCode(e.target.value)}
                         style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4, background: 'white' }}
                       >
                         <option value="">Không áp dụng</option>
                         {promosList.filter(p => !p.isLocked).map(p => (
                           <option key={p.id} value={p.code}>
                             {p.code} (+{p.promoMonths} tháng)
                           </option>
                         ))}
                       </select>
                     </div>
                     <button
                       onClick={() => handleApproveWarranty(selectedSerial.id)}
                       disabled={submittingApprove}
                       style={{
                         padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none',
                         borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                         opacity: submittingApprove ? 0.6 : 1, height: 35
                       }}
                     >
                       {submittingApprove ? 'Đang duyệt...' : 'Phê duyệt ngay'}
                     </button>
                  </div>
                </div>
              )}

              {/* Form Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <div>
                  {selectedSerial.status !== 'Chưa kích hoạt' && (
                    <button
                      onClick={() => handleConfirmRestore(selectedSerial)}
                      style={{
                        padding: '8px 16px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5',
                        borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <RotateCcw size={14} /> Khôi phục Serial
                    </button>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleSaveSerialDetails}
                    disabled={submittingApprove}
                    style={{
                      padding: '8px 20px', background: '#16a34a', color: 'white', border: 'none',
                      borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      opacity: submittingApprove ? 0.6 : 1
                    }}
                  >
                    {submittingApprove ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </div>
              </div>
            </div>

            {/* History Timeline */}
            <div>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} color="#4472C4" /> Lịch sử hoạt động
              </h3>

              {loadingDetail ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Đang tải lịch sử...</div>
              ) : history.length === 0 ? (
                <div style={{
                  textAlign: 'center', color: '#94a3b8', padding: '30px 20px',
                  background: '#f8fafc', borderRadius: 12, border: '1px dashed #d1d5db',
                }}>
                  <FileText size={32} color="#d1d5db" style={{ marginBottom: 8 }} />
                  <p style={{ margin: 0 }}>Chưa có báo cáo dịch vụ nào liên kết với serial này</p>
                </div>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 24 }}>
                  {/* Timeline line */}
                  <div style={{
                    position: 'absolute', left: 8, top: 0, bottom: 0,
                    width: 2, background: '#e2e8f0',
                  }} />

                  {history.map((item, i) => (
                    <div key={item.id} style={{ position: 'relative', marginBottom: i < history.length - 1 ? 20 : 0 }}>
                      {/* Timeline dot */}
                      <div style={{
                        position: 'absolute', left: -20, top: 6,
                        width: 14, height: 14, borderRadius: '50%',
                        border: '3px solid',
                        borderColor: item.workType?.includes('Lắp đặt') ? '#16a34a'
                          : item.workType?.includes('Bảo hành') ? '#d97706'
                          : item.workType?.includes('Sửa chữa') ? '#dc2626'
                          : '#4472C4',
                        background: 'white',
                      }} />

                      <div style={{
                        background: '#f8fafc', borderRadius: 10, padding: '14px 18px',
                        border: '1px solid #e2e8f0',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <span style={{
                              fontWeight: 700, fontSize: 14, color: '#1e293b',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                              <Wrench size={14} /> {item.workType || item.serviceType || 'Dịch vụ'}
                            </span>
                            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 20 }}>
                              {formatDateTime(item.createdAt)}
                            </span>
                          </div>
                          {getApprovalBadge(item.approvalStatus)}
                        </div>

                        <div style={{ fontSize: 13, color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                          <div><strong>KTV:</strong> {item.ktvName}</div>
                          <div><strong>KH:</strong> {item.customerName}</div>
                          {item.products.length > 0 && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <strong>Sản phẩm:</strong> {item.products.join(', ')}
                            </div>
                          )}
                          {item.spareParts.length > 0 && (
                            <div style={{ gridColumn: '1 / -1' }}>
                              <strong>Linh kiện:</strong> {item.spareParts.join(', ')}
                            </div>
                          )}
                          {item.issueType && <div style={{ gridColumn: '1 / -1' }}><strong>Sự cố:</strong> {item.issueType}</div>}
                          {item.handlingMethod && <div style={{ gridColumn: '1 / -1' }}><strong>Xử lý:</strong> {item.handlingMethod}</div>}
                          {item.notes && <div style={{ gridColumn: '1 / -1', fontStyle: 'italic', color: '#64748b' }}>📝 {item.notes}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
