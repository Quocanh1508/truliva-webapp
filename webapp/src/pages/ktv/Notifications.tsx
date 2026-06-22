import { useEffect, useState } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead, approveReport, rejectReport } from '../../api/client';
import { Bell, Check, Clock, Eye } from 'lucide-react';
import PullToRefresh from '../../components/PullToRefresh';

export default function Notifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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

                      {n.reportStatus === 'PENDING' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => handleApprove(e, n.id, n.rawData.reportId)}
                            disabled={!!actionLoadingId}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                          >
                            {actionLoadingId === n.id ? 'Đang xử lý...' : 'Duyệt'}
                          </button>
                          <button
                            onClick={(e) => handleReject(e, n.id, n.rawData.reportId)}
                            disabled={!!actionLoadingId}
                            className="px-3 py-1 bg-red-650 hover:bg-red-750 disabled:bg-gray-400 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                          >
                            {actionLoadingId === n.id ? 'Đang xử lý...' : 'Từ chối'}
                          </button>
                        </div>
                      ) : n.reportStatus === 'REJECTED' && n.rejectReason ? (
                        <div className="text-xs text-red-650 italic font-semibold max-w-md break-words">
                          Lý do: {n.rejectReason}
                        </div>
                      ) : null}
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
    </div>
    </PullToRefresh>
  );
}
