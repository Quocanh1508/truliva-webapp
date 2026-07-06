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

  const renderFormattedContent = (text: string) => {
    if (!text) return '';
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let isBullet = false;
      let cleanLine = line;

      if (cleanLine.trim().startsWith('- ')) {
        isBullet = true;
        cleanLine = cleanLine.trim().substring(2);
      } else if (cleanLine.trim().startsWith('* ')) {
        isBullet = true;
        cleanLine = cleanLine.trim().substring(2);
      }

      const parts = [];
      const regex = /\*\*(.*?)\*\*|\*(.*?)\*/g;
      let match;
      let lastIndex = 0;

      while ((match = regex.exec(cleanLine)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          parts.push(cleanLine.substring(lastIndex, matchIndex));
        }
        if (match[1] !== undefined) {
          parts.push(<strong key={matchIndex} className="font-bold text-gray-900">{match[1]}</strong>);
        } else if (match[2] !== undefined) {
          parts.push(<em key={matchIndex} className="italic text-gray-800">{match[2]}</em>);
        }
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < cleanLine.length) {
        parts.push(cleanLine.substring(lastIndex));
      }

      const contentNode = parts.length > 0 ? parts : cleanLine;

      if (isBullet) {
        return (
          <div key={idx} className="flex items-start gap-1.5 pl-3 my-0.5">
            <span className="text-blue-500 shrink-0 select-none">•</span>
            <span className="flex-1 text-gray-700">{contentNode}</span>
          </div>
        );
      }

      return (
        <div key={idx} className="min-h-[1.25rem]">
          {contentNode}
        </div>
      );
    });
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
          {notifications.map((n) => {
            const isDevNotification = n.rawData?.senderRole === 'DEV';
            return (
              <div
                key={n.id}
                onClick={() => !n.isRead && handleMarkAsRead(n.id)}
                className={`p-4 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                  isDevNotification
                    ? n.isRead
                      ? 'bg-indigo-50/20 border-indigo-150 hover:shadow-sm'
                      : 'bg-indigo-50/50 border-indigo-250 hover:bg-indigo-50/80 shadow-md cursor-pointer'
                    : n.isRead
                      ? 'bg-white border-gray-200 hover:shadow-sm'
                      : 'bg-blue-50/40 border-blue-100 hover:bg-blue-50/70 shadow-sm cursor-pointer'
                }`}
              >
                {/* Vạch chỉ thị chưa đọc */}
                {!n.isRead && (
                  <div className={`absolute top-0 left-0 bottom-0 w-1 ${isDevNotification ? 'bg-indigo-600' : 'bg-blue-600'}`}></div>
                )}

                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 pl-2">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {isDevNotification && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white border border-indigo-650 tracking-wide uppercase">
                          🔧 Hệ thống
                        </span>
                      )}
                      <span className={`font-bold text-sm ${
                        isDevNotification
                          ? n.isRead ? 'text-indigo-950' : 'text-indigo-900'
                          : n.isRead ? 'text-gray-800' : 'text-blue-900'
                      }`}>
                        {n.title}
                      </span>
                      {!n.isRead && (
                        <span className={`w-2 h-2 rounded-full inline-block animate-pulse ${isDevNotification ? 'bg-indigo-600' : 'bg-blue-600'}`}></span>
                      )}
                    </div>
                    
                    <div className="text-[13px] text-gray-600 leading-relaxed space-y-1.5">
                      {renderFormattedContent(n.content)}
                    </div>
                  
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
          )
        })}
      </div>
      )}

      {selectedReport && (() => {
        const correspondingNotification = notifications.find(n => n.rawData?.reportId === selectedReport.id);
        return (
          <div className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] shadow-2xl flex flex-col">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-[#1B3A6B] text-white rounded-t-2xl">
                <h3 className="font-bold text-lg">
                  Chi tiết báo cáo {selectedReport.order?.pancakeOrderId ? `#${selectedReport.order.pancakeOrderId}` : selectedReport.id.substring(0, 8)}
                </h3>
                <button onClick={() => setSelectedReport(null)} className="text-white/80 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-4 text-sm text-gray-700 overflow-y-auto flex-1 text-left">
                {/* PHẦN 1: THÔNG TIN DỊCH VỤ & LINH KIỆN (QUAN TRỌNG NHẤT) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Cột trái: Danh sách sản phẩm & linh kiện */}
                  <div className="border border-slate-150 p-3.5 rounded-xl bg-slate-50/50 space-y-2 flex flex-col">
                    <span className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">Sản phẩm & Linh kiện sử dụng</span>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto flex-1">
                      {selectedReport.products && selectedReport.products.length > 0 ? (
                        selectedReport.products.map((p: string, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs font-semibold text-gray-700 bg-white px-2.5 py-1.5 rounded border border-gray-100 shadow-sm">
                            <span className="truncate mr-2" title={p}>{p}</span>
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold text-[9px] shrink-0">Thiết bị</span>
                          </div>
                        ))
                      ) : null}
                      {selectedReport.spareParts && selectedReport.spareParts.length > 0 ? (
                        selectedReport.spareParts.map((p: string, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs font-semibold text-gray-700 bg-white px-2.5 py-1.5 rounded border border-gray-100 shadow-sm">
                            <span className="truncate mr-2" title={p}>{p}</span>
                            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded font-semibold text-[9px] shrink-0">Linh kiện</span>
                          </div>
                        ))
                      ) : null}
                      {(!selectedReport.products?.length && !selectedReport.spareParts?.length) && (
                        <div className="text-xs text-gray-450 italic text-center py-4">Không dùng sản phẩm/linh kiện</div>
                      )}
                    </div>
                  </div>

                  {/* Cột phải: Số máy & Số tiền & Công việc */}
                  <div className="border border-slate-150 p-3.5 rounded-xl bg-[#1B3A6B]/5 space-y-2.5">
                    <span className="block text-[11px] font-bold text-[#1B3A6B] uppercase tracking-wider">Chi tiết doanh thu</span>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between border-b border-gray-200/50 pb-1.5">
                        <span className="text-gray-500">Số máy (Serial):</span>
                        <strong className="font-mono text-gray-800 font-bold">{selectedReport.serialNumber || '-'}</strong>
                      </div>
                      <div className="flex justify-between border-b border-gray-200/50 pb-1.5">
                        <span className="text-gray-500">Tiền thu thực tế:</span>
                        <strong className="text-emerald-700 font-bold text-sm">{(selectedReport.actualAmount || 0).toLocaleString('vi-VN')} đ</strong>
                      </div>
                      <div className="flex justify-between border-b border-gray-200/50 pb-1.5">
                        <span className="text-gray-500">Loại công việc:</span>
                        <strong className="text-gray-800">{selectedReport.workType || '-'}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Khoảng cách:</span>
                        <strong className="text-gray-800">{selectedReport.distanceKm ? `${selectedReport.distanceKm} km` : '-'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PHẦN 2: GHI CHÚ KTV & XỬ LÝ LỖI */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">Cách xử lý & Ghi chú của KTV</span>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150 text-xs min-h-[75px] max-h-[100px] overflow-y-auto">
                      {selectedReport.issueType && (
                        <div className="mb-1">
                          <span className="font-semibold text-gray-700">Lỗi: </span>
                          <span>{selectedReport.issueType}</span>
                        </div>
                      )}
                      {selectedReport.handlingMethod && (
                        <div className="mb-1">
                          <span className="font-semibold text-gray-700">Xử lý: </span>
                          <span>{selectedReport.handlingMethod}</span>
                        </div>
                      )}
                      <div className="text-gray-650 italic mt-1 whitespace-pre-wrap">
                        "{selectedReport.notes || 'Không có ghi chú thêm.'}"
                      </div>
                    </div>
                  </div>

                  {/* Ảnh nghiệm thu */}
                  <div className="space-y-1.5">
                    <span className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">Ảnh nghiệm thu</span>
                    {selectedReport.imageUrls && selectedReport.imageUrls.length > 0 ? (
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
                    ) : (
                      <div className="h-[75px] flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 italic">
                        Không có ảnh
                      </div>
                    )}
                  </div>
                </div>

                {/* PHẦN 3: THÔNG TIN KHÁCH HÀNG & TRẠM (Ẩn bớt độ ưu tiên xuống dưới) */}
                <div className="p-4 bg-gray-50/50 rounded-xl border border-gray-100 space-y-2 text-xs">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Thông tin khách hàng & Trạm</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-gray-450">Khách hàng:</span>
                      <strong className="text-gray-800 font-semibold">{selectedReport.customerName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-450">SĐT:</span>
                      <strong className="text-gray-800 font-semibold">{selectedReport.customerPhone}</strong>
                    </div>
                    <div className="sm:col-span-2 flex justify-between">
                      <span className="text-gray-450 shrink-0 mr-4">Địa chỉ:</span>
                      <span className="text-gray-700 text-right">{selectedReport.address || '-'} ({selectedReport.province})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-450">Kỹ thuật viên:</span>
                      <strong className="text-gray-800 font-semibold">{selectedReport.ktvUser?.fullName || 'N/A'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-450">Trạm chính:</span>
                      <strong className="text-gray-800 font-semibold">{selectedReport.mainStation?.name || selectedReport.ktvUser?.techStation?.mainStation?.name || 'N/A'}</strong>
                    </div>
                  </div>

                  {selectedReport.waterSource && (
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-200/50 text-[10px] text-gray-550">
                      <div className="truncate" title={selectedReport.waterSource}>Nguồn: {selectedReport.waterSource}</div>
                      <div>Áp suất: {selectedReport.waterPressure ? `${selectedReport.waterPressure} psi` : '-'}</div>
                      <div>TDS In: {selectedReport.tdsIn || 0}</div>
                      <div>TDS Out: {selectedReport.tdsOut || 0}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2.5">
                <button
                  onClick={() => setSelectedReport(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-xs transition-colors"
                >
                  Đóng
                </button>
                {selectedReport.approvalStatus === 'PENDING' && correspondingNotification && (
                  <>
                    <button
                      onClick={async (e) => {
                        await handleReject(e, correspondingNotification.id, selectedReport.id);
                        setSelectedReport(null);
                      }}
                      disabled={!!actionLoadingId}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      Từ chối
                    </button>
                    <button
                      onClick={async (e) => {
                        await handleApprove(e, correspondingNotification.id, selectedReport.id);
                        setSelectedReport(null);
                      }}
                      disabled={!!actionLoadingId}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      Duyệt
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </PullToRefresh>
  );
}
