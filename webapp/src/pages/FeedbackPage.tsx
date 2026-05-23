import { useState, useRef } from 'react';
import { Camera, X, Send, CheckCircle, AlertCircle, MessageSquare } from 'lucide-react';
import { uploadImages, fetchApi } from '../api/client';

export default function FeedbackPage() {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<(File | null)[]>([null, null, null, null]);
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null, null]);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleFileSelect = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Cập nhật file
      const newFiles = [...files];
      newFiles[index] = file;
      setFiles(newFiles);

      // Thu hồi preview cũ nếu có
      if (previews[index]) {
        URL.revokeObjectURL(previews[index]!);
      }

      // Tạo preview mới
      const newPreviews = [...previews];
      newPreviews[index] = URL.createObjectURL(file);
      setPreviews(newPreviews);
      
      setError('');
    }
  };

  const removeFile = (index: number) => {
    const newFiles = [...files];
    newFiles[index] = null;
    setFiles(newFiles);

    if (previews[index]) {
      URL.revokeObjectURL(previews[index]!);
    }
    const newPreviews = [...previews];
    newPreviews[index] = null;
    setPreviews(newPreviews);
  };

  const resetForm = () => {
    setContent('');
    // Thu hồi toàn bộ previews
    previews.forEach(p => {
      if (p) URL.revokeObjectURL(p);
    });
    setFiles([null, null, null, null]);
    setPreviews([null, null, null, null]);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Vui lòng nhập mô tả vấn đề của bạn');
      return;
    }
    
    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      // 1. Upload các file ảnh nếu có
      const selectedFiles = files.filter((f): f is File => f !== null);
      let uploadedUrls: string[] = [];
      
      if (selectedFiles.length > 0) {
        uploadedUrls = await uploadImages(selectedFiles);
      }

      // 2. Gửi dữ liệu đóng góp ý kiến về backend
      await fetchApi('/feedbacks', {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim(),
          imageUrls: uploadedUrls
        })
      });

      setSuccess(true);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Gặp lỗi trong quá trình gửi ý kiến đóng góp');
    } finally {
      setSubmitting(false);
    }
  };

  const filledCount = files.filter(f => f !== null).length;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 animate-fade-in text-left">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-50 text-[#1B3A6B] rounded-xl border border-blue-100">
          <MessageSquare size={24} />
        </div>
        <div>
          <h2 className="font-bold text-2xl text-[#1B3A6B]">Đóng góp ý kiến & Báo lỗi</h2>
          <p className="text-gray-500 text-sm mt-0.5">Chúng tôi luôn lắng nghe ý kiến của bạn để cải thiện hệ thống tốt hơn.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-start gap-3">
            <CheckCircle className="shrink-0 mt-0.5" size={18} />
            <div>
              <span className="font-bold text-sm block">Gửi đóng góp thành công!</span>
              <span className="text-xs">Cảm ơn bạn đã phản hồi. Đội ngũ phát triển (DEV) sẽ kiểm tra và khắc phục sớm nhất có thể.</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <div>
              <span className="font-bold text-sm block">Đã có lỗi xảy ra</span>
              <span className="text-xs">{error}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Ô nhập nội dung */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Vấn đề bạn đang gặp phải / Ý kiến đóng góp <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full min-h-[140px] px-3.5 py-3 border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow outline-none text-sm leading-relaxed"
              placeholder="Vui lòng mô tả chi tiết lỗi gặp phải hoặc điểm bạn thấy khó hiểu (ví dụ: các bước thao tác, thông tin hiển thị sai lệch...)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          {/* Chọn hình ảnh */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-semibold text-gray-700">
                Hình ảnh đính kèm minh họa (Tối đa 4 ảnh)
              </label>
              <span className="text-xs text-gray-500 font-medium">Đã chọn: {filledCount}/4</span>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex flex-col items-center">
                  {previews[index] ? (
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-emerald-500 bg-gray-55 shadow-sm group">
                      <img
                        src={previews[index]!}
                        alt={`Ảnh đính kèm ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        disabled={submitting}
                        className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 border-none cursor-pointer transition-colors shadow"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => !submitting && fileInputRefs.current[index]?.click()}
                      className="w-full aspect-square rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition-all"
                    >
                      <Camera size={20} className="text-gray-400" />
                      <span className="text-[10px] text-gray-400 font-semibold">Ảnh {index + 1}</span>
                    </div>
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={(el) => { fileInputRefs.current[index] = el; }}
                    onChange={(e) => handleFileSelect(index, e)}
                    disabled={submitting}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Nút gửi */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="btn btn-primary w-full py-2.5 flex justify-center items-center gap-2 font-bold text-sm"
            >
              {submitting ? (
                <>
                  <span className="spinner"></span> Đang gửi ý kiến...
                </>
              ) : (
                <>
                  <Send size={16} /> Gửi đóng góp ý kiến
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
