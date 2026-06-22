import { useEffect, useState } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, approveReport, rejectReport, fetchApi } from '../../api/client';
import { Bell, Check, Clock, Eye, X } from 'lucide-react';
import PullToRefresh from '../../components/PullToRefresh';

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleApprove = async (e: React.MouseEvent, notificationId: string, reportId: string) => {
    e.stopPropagation();
    if (!reportId || actionLoadingId) return;
    
    if (!window.confirm('Bạn có chắc chắn muốn duyệt báo cáo này?')) return;

    try {
      setActionLoadingId(notificationId);
      const res = await approveReport(reportId);
      alert(res.message || 'Phê duyệt báo cáo thành công');
      await handleMarkAsRead(notificationId);
      await loadNotifications(true);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi phê duyệt báo cáo');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (e: React.MouseEvent, notificationId: string, reportId: string) => {
    e.stopPropagation();
    if (!reportId || actionLoadingId) return;

    const reason = window.prompt('Nhập lý do từ chối báo cáo (bắt buộc):');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Vui lòng nhập lý do từ chối');
      return;
    }

    try {
      setActionLoadingId(notificationId);
      const res = await rejectReport(reportId, reason.trim());
      alert(res.message || 'Từ chối báo cáo thành công');
      await handleMarkAsRead(notificationId);
      await loadNotifications(true);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi từ chối báo cáo');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleViewReport = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!reportId || viewLoading) return;
    try {
      setViewLoading(true);
      const res = await fetchApi(`/reports/${reportId}`);
      if (res && res.report) {
        setSelectedReport(res.report);
      } else {
        alert('Không tìm thấy chi tiết báo cáo');
      }
    } catch (err: any) {
      alert('Lỗi tải chi tiết báo cáo: ' + err.message);
    } finally {
      setViewLoading(false);
    }
  };

  const loadNotifications = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (e) {
      console.error('Lỗi tải thông báo', e);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      // Cập nhật trạng thái cục bộ
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (e) {
      console.error('Lỗi đánh dấu đã đọc', e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (e) {
      console.error('Lỗi đánh dấu đọc tất cả', e);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-10">
        <span className="spinner border-t-[#1B3A6B]"></span>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={() => loadNotifications(true)}>
      <div className="animate-fade-in max-w-2xl mx-auto text-left">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-bold text-2xl text-[#1B3A6B] flex items-center gap-2">
            <Bell size={24} className="text-[#1B3A6B]" /> Thông báo của tôi
          </h2>
          {unreadCount > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Bạn có <span className="font-bold text-red-500">{unreadCount}</span> thông báo chưa đọc.
            </p>
          )}
        </div>
        
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-1 px-3 py-1.5 text-[13px] border border-blue-200 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium"
          >
            <Check size={14} /> Đánh dấu đọc tất cả
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card text-center py-12 text-gray-500 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
            <Bell size={24} />
          </div>
          <div>Không có thông báo nào.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && handleMarkAsRead(n.id)}
              className={`p-4 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                n.isRead
                  ? 'bg-white border-gray-200 hover:shadow-sm'
                  : 'bg-blue-50/40 border-blue-100 hover:bg-blue-50/70 shadow-sm cursor-pointer'
              }`}
            >
              {/* Vạch chỉ thị chưa đọc */}
              {!n.isRead && (
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-600"></div>
              )}

              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 pl-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`font-bold text-sm ${n.isRead ? 'text-gray-800' : 'text-blue-900'}`}>
                      {n.title}
                    </span>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 inline-block animate-pulse"></span>
                    )}
                  </div>
                  
                  <p className="text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed">
                    {n.content}
                  </p>
                  
                  {n.rawData?.type === 'REPORT_APPROVAL_REQUEST' && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-150 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-left">
                      <div className="flex flex-col gap-1">
                        <div className="text-xs font-semibold text-gray-650 flex flex-wrap items-center gap-1.5">
                          Trạng thái duyệt:
                          {n.reportStatus === 'PENDING' && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-850 rounded font-bold uppercase text-[10px]">
                              Chờ duyệt
                            </span>
                          )}
                          {n.reportStatus === 'APPROVED' && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-850 rounded font-bold uppercase text-[10px]">
                              Đã duyệt
                            </span>
                          )}
                          {n.reportStatus === 'REJECTED' && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-850 rounded font-bold uppercase text-[10px]">
                              Đã từ chối
                            </span>
                          )}
                        </div>
                        {n.reportStatus === 'REJECTED' && n.rejectReason && (
                          <div className="text-xs text-red-650 italic font-semibold mt-1">
                            Lý do: {n.rejectReason}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                          onClick={(e) => handleViewReport(e, n.rawData.reportId)}
                          disabled={viewLoading}
                          className="px-2.5 py-1 bg-[#1B3A6B] hover:bg-[#2A518E] disabled:bg-gray-400 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                        >
                          {viewLoading ? 'Đang tải...' : 'Xem báo cáo'}
                        </button>

                        {n.reportStatus === 'PENDING' && (
                          <>
                            <button
                              onClick={(e) => handleApprove(e, n.id, n.rawData.reportId)}
                              disabled={!!actionLoadingId}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              {actionLoadingId === n.id ? '...' : 'Duyệt'}
                            </button>
                            <button
                              onClick={(e) => handleReject(e, n.id, n.rawData.reportId)}
                              disabled={!!actionLoadingId}
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                            >
                              {actionLoadingId === n.id ? '...' : 'Từ chối'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-xs text-gray-400 font-medium">
                    <Clock size={12} />
                    <span>{new Date(n.createdAt).toLocaleString('vi-VN')}</span>
                  </div>
                </div>

                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAsRead(n.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors outline-none"
                    title="Đánh dấu đã đọc"
                  >
                    <Eye size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedReport && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-[#1B3A6B] text-white rounded-t-2xl">
              <h3 className="font-bold text-lg">
                Chi tiết báo cáo {selectedReport.order?.pancakeOrderId ? `#${selectedReport.order.pancakeOrderId}` : selectedReport.id.substring(0, 8)}
              </h3>
              <button onClick={() => setSelectedReport(null)} className="text-white/80 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-sm text-gray-700 overflow-y-auto flex-1 text-left">
              {/* Khách hàng */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div>
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Khách hàng</span>
                  <strong className="text-gray-900">{selectedReport.customerName}</strong>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Số điện thoại</span>
                  <strong className="text-gray-900">{selectedReport.customerPhone}</strong>
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Địa chỉ</span>
                  <span className="text-gray-800 font-medium">{selectedReport.address || '-'} ({selectedReport.province})</span>
                </div>
              </div>

              {/* Thông tin công việc */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Kỹ thuật viên</span>
                  <span className="font-semibold text-gray-855">{selectedReport.ktvUser?.fullName || 'N/A'}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Loại công việc</span>
                  <span className="font-semibold text-gray-855">{selectedReport.workType || '-'}</span>
                </div>
                <div className="col-span-2">
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Dịch vụ thực tế</span>
                  <span className="font-semibold text-gray-855">{selectedReport.serviceType || '-'}</span>
                </div>
              </div>

              {/* Linh kiện/sản phẩm */}
              <div>
                <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider mb-1.5">Sản phẩm & Linh kiện sử dụng</span>
                <div className="bg-slate-50 border border-slate-150 p-3 rounded-lg flex flex-col gap-1.5">
                  {selectedReport.products && selectedReport.products.length > 0 ? (
                    selectedReport.products.map((p: string, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs font-medium text-gray-700 bg-white px-2.5 py-1.5 rounded border border-gray-100">
                        <span>{p}</span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold text-[10px]">Thiết bị/Lọc</span>
                      </div>
                    ))
                  ) : null}
                  {selectedReport.spareParts && selectedReport.spareParts.length > 0 ? (
                    selectedReport.spareParts.map((p: string, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-xs font-medium text-gray-700 bg-white px-2.5 py-1.5 rounded border border-gray-100">
                        <span>{p}</span>
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-semibold text-[10px]">Linh kiện</span>
                      </div>
                    ))
                  ) : null}
                  {(!selectedReport.products?.length && !selectedReport.spareParts?.length) && (
                    <span className="text-xs text-gray-450 italic text-center py-1">Không sử dụng sản phẩm/linh kiện</span>
                  )}
                </div>
              </div>

              {/* Thông số kỹ thuật */}
              {selectedReport.waterSource && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="block text-[10px] font-bold text-gray-450 uppercase tracking-wider">Nguồn nước</span>
                    <span className="text-xs font-semibold text-gray-800">{selectedReport.waterSource}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-gray-450 uppercase tracking-wider">Áp suất nước</span>
                    <span className="text-xs font-semibold text-gray-800">{selectedReport.waterPressure ? `${selectedReport.waterPressure} psi` : '-'}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-gray-450 uppercase tracking-wider">TDS Đầu vào</span>
                    <span className="text-xs font-semibold text-gray-800">{selectedReport.tdsIn || 0} ppm</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-bold text-gray-450 uppercase tracking-wider">TDS Đầu ra</span>
                    <span className="text-xs font-semibold text-gray-800">{selectedReport.tdsOut || 0} ppm</span>
                  </div>
                </div>
              )}

              {/* Nguyên nhân / Cách xử lý */}
              {selectedReport.handlingMethod && (
                <div className="space-y-2.5">
                  {selectedReport.issueType && (
                    <div>
                      <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Nguyên nhân lỗi</span>
                      <span className="text-xs font-medium text-gray-855">{selectedReport.issueType}</span>
                    </div>
                  )}
                  <div>
                    <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Cách xử lý của KTV</span>
                    <span className="text-xs font-medium text-gray-855">{selectedReport.handlingMethod}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Số máy (Serial Number)</span>
                  <span className="font-semibold text-gray-850 font-mono tracking-wider">{selectedReport.serialNumber || '-'}</span>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Tiền thu thực tế</span>
                  <span className="font-bold text-[#1B3A6B]">{(selectedReport.actualAmount || 0).toLocaleString('vi-VN')} đ</span>
                </div>
              </div>

              {/* Ghi chú */}
              <div>
                <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider">Ghi chú của KTV</span>
                <p className="text-xs text-gray-650 bg-gray-50 p-2.5 rounded border border-gray-150 whitespace-pre-wrap mt-1">
                  {selectedReport.notes || 'Không có ghi chú.'}
                </p>
              </div>

              {/* Ảnh nghiệm thu */}
              {selectedReport.imageUrls && selectedReport.imageUrls.length > 0 && (
                <div>
                  <span className="block text-[11px] font-bold text-gray-450 uppercase tracking-wider mb-2">Ảnh nghiệm thu ({selectedReport.imageUrls.length})</span>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedReport.imageUrls.map((url: string, idx: number) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`Ảnh ${idx + 1}`}
                        className="w-full aspect-square object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(url, '_blank')}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}
