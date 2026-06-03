import { useState, useEffect } from 'react';
import { fetchApi } from '../../api/client';
import { MessageSquare, Trash2, Calendar, User as UserIcon, Shield, ExternalLink, X, Eye } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';

interface Feedback {
  id: string;
  content: string;
  imageUrls: string[];
  createdAt: string;
  user: {
    username: string;
    role: string;
    fullName: string;
  };
}

export default function FeedbackList() {
  const { confirm } = useConfirm();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  
  // Lightbox State
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const fetchFeedbacks = async () => {
    try {
      setLoading(true);
      const data = await fetchApi('/feedbacks');
      setFeedbacks(data.feedbacks || []);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải danh sách ý kiến đóng góp');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm({
      title: 'Xóa phản hồi',
      message: 'Bạn có chắc chắn muốn xóa phản hồi này không? Hành động này không thể hoàn tác.',
      confirmText: 'Xóa',
      cancelText: 'Hủy bỏ',
      type: 'danger'
    });
    
    if (!isConfirmed) return;
    
    setDeleteLoadingId(id);
    try {
      await fetchApi(`/feedbacks/${id}`, { method: 'DELETE' });
      setFeedbacks(feedbacks.filter(f => f.id !== id));
    } catch (err: any) {
      alert(err.message || 'Lỗi khi xóa phản hồi');
    } finally {
      setDeleteLoadingId(null);
    }
  };

  // Tính số lượng thống kê
  const totalCount = feedbacks.length;
  const adminCount = feedbacks.filter(f => f.user.role === 'ADMIN').length;
  const ktvCount = feedbacks.filter(f => f.user.role === 'KTV').length;

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 text-left animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="font-bold text-2xl text-[#1B3A6B]">Danh sách Đóng góp ý kiến</h2>
          <p className="text-gray-500 text-sm mt-0.5">Tổng hợp phản hồi, lỗi hệ thống và đề xuất từ KTV & Admin.</p>
        </div>
        <button 
          onClick={fetchFeedbacks}
          disabled={loading}
          className="btn btn-secondary text-sm py-2 px-4 shrink-0"
        >
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {/* Thống kê nhanh */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-gray-500 font-semibold uppercase">Tổng phản hồi</span>
          <span className="text-2xl font-bold text-gray-800 mt-1">{totalCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-indigo-500 font-semibold uppercase">Từ Admin</span>
          <span className="text-2xl font-bold text-indigo-700 mt-1">{adminCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
          <span className="text-xs text-blue-500 font-semibold uppercase">Từ KTV</span>
          <span className="text-2xl font-bold text-blue-700 mt-1">{ktvCount}</span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <span className="spinner" style={{ borderColor: 'rgba(27, 58, 107, 0.3)', borderTopColor: '#1B3A6B', width: '28px', height: '28px' }}></span>
        </div>
      ) : feedbacks.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <MessageSquare size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm font-medium">Chưa nhận được đóng góp ý kiến nào.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedbacks.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
              {/* Header của feedback */}
              <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-[#1B3A6B] flex items-center justify-center font-bold text-sm shrink-0">
                    {item.user.fullName.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-800">{item.user.fullName}</span>
                      <span className="text-xs text-gray-400">(@{item.user.username})</span>
                      
                      {/* Badge vai trò */}
                      {item.user.role === 'ADMIN' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full">
                          <Shield size={10} /> ADMIN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full">
                          <UserIcon size={10} /> KTV
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                      <Calendar size={12} />
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={deleteLoadingId === item.id}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center"
                  title="Xóa phản hồi này"
                >
                  {deleteLoadingId === item.id ? (
                    <span className="spinner" style={{ width: '14px', height: '14px', borderTopColor: '#ef4444' }}></span>
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>

              {/* Nội dung đóng góp */}
              <div className="px-5 py-4">
                <p className="text-[#334155] text-sm whitespace-pre-wrap leading-relaxed font-normal">
                  {item.content}
                </p>

                {/* Các ảnh đính kèm */}
                {item.imageUrls && item.imageUrls.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <span className="block text-xs font-semibold text-gray-500 mb-2">Hình ảnh đính kèm:</span>
                    <div className="grid grid-cols-4 gap-3">
                      {item.imageUrls.map((url, imgIdx) => (
                        <div 
                          key={imgIdx} 
                          onClick={() => setActiveImage(url)}
                          className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 cursor-zoom-in hover:border-blue-500 transition-colors shadow-sm group bg-gray-50"
                        >
                          <img 
                            src={url} 
                            alt={`Ảnh lỗi ${imgIdx + 1}`} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5">
                            <Eye size={16} />
                            <span className="text-[10px] font-bold">Xem ảnh</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal */}
      {activeImage && (
        <div 
          onClick={() => setActiveImage(null)}
          className="fixed inset-0 z-[1000] bg-black/85 flex flex-col justify-center items-center p-4 animate-fade-in cursor-zoom-out"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-bold text-sm text-gray-800">Chi tiết hình ảnh lỗi</span>
              <div className="flex items-center gap-3">
                <a 
                  href={activeImage} 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold"
                >
                  <ExternalLink size={12} /> Mở tab mới
                </a>
                <button 
                  onClick={() => setActiveImage(null)}
                  className="p-1 text-gray-400 hover:bg-gray-100 rounded-full border-none cursor-pointer flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="bg-gray-950 flex items-center justify-center p-4 min-h-[300px]">
              <img 
                src={activeImage} 
                alt="Chi tiết ảnh lỗi" 
                className="max-h-[70vh] max-w-full object-contain rounded-md"
              />
            </div>
            
            {/* Modal Footer */}
            <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
              <button 
                onClick={() => setActiveImage(null)}
                className="btn btn-secondary text-xs px-6 py-2"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
