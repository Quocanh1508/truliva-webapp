import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Loader2, Award, Heart, MessageSquare } from 'lucide-react';
import { API_URL } from '../../api/client';

export default function WarrantyConfirm() {
  const [searchParams] = useSearchParams();
  const serialFromUrl = (searchParams.get('serial') || '').trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [serialInfo, setSerialInfo] = useState<{
    serialNumber: string;
    model: string;
    warrantyExpiryDate?: string;
  } | null>(null);

  useEffect(() => {
    const confirmWarranty = async () => {
      if (!serialFromUrl) {
        setError('Đường dẫn không hợp lệ. Vui lòng kiểm tra lại mã QR hoặc liên kết từ tin nhắn.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/serials/public/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ serialNumber: serialFromUrl })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Xác nhận bảo hành thất bại. Vui lòng liên hệ CSKH.');
        }

        setSerialInfo(data.serial);
        setSuccess(true);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Có lỗi kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối internet.');
      } finally {
        setLoading(false);
      }
    };

    confirmWarranty();
  }, [serialFromUrl]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div 
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in"
        style={{ borderTop: '6px solid #2563EB' }}
      >
        {/* Header Branding */}
        <div className="bg-gray-50/50 p-6 border-b border-gray-100 text-center">
          <div className="inline-flex items-center justify-center bg-blue-100 p-2.5 rounded-xl text-blue-600 mb-2">
            <Award size={24} />
          </div>
          <h2 className="text-xl font-bold text-[#1B3A6B]">Pure Vita</h2>
          <p className="text-xs text-gray-500 mt-0.5">Smart Home Solutions</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="animate-spin text-blue-600" size={40} />
              <p className="text-sm font-semibold text-gray-600">Đang xác nhận bảo hành thiết bị...</p>
              <p className="text-xs text-gray-400">Vui lòng giữ kết nối mạng ổn định</p>
            </div>
          )}

          {error && (
            <div className="text-center space-y-4 py-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-500 shadow-xs">
                <AlertTriangle size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-gray-800">Không thể xác nhận bảo hành</h3>
                <p className="text-xs text-gray-500 leading-relaxed px-4">{error}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-xs text-gray-600 max-w-sm mx-auto">
                📞 Hotline hỗ trợ kỹ thuật: <strong className="text-blue-600">1900 633423</strong>
              </div>
            </div>
          )}

          {success && serialInfo && (
            <div className="space-y-6">
              {/* Success Banner */}
              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 shadow-xs animate-bounce">
                  <CheckCircle size={36} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-gray-800">Kích Hoạt Thành Công!</h3>
                  <p className="text-xs text-gray-500">Thiết bị của bạn đã được đăng ký bảo hành chính hãng</p>
                </div>
              </div>

              {/* Product Info Card */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-2.5 text-xs text-gray-600">
                <div className="grid grid-cols-3 gap-1">
                  <span className="font-semibold text-gray-400">Số Serial:</span>
                  <span className="col-span-2 font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded inline-block w-fit">
                    {serialInfo.serialNumber}
                  </span>
                  
                  <span className="font-semibold text-gray-400 mt-1">Dòng máy:</span>
                  <span className="col-span-2 font-bold text-gray-800 mt-1">{serialInfo.model}</span>
                  
                  <span className="font-semibold text-gray-400 mt-1">Hạn bảo hành:</span>
                  <span className="col-span-2 font-semibold text-gray-700 mt-1">
                    {serialInfo.warrantyExpiryDate 
                      ? new Date(serialInfo.warrantyExpiryDate).toLocaleDateString('vi-VN') 
                      : 'Theo quy định hãng'}
                  </span>
                </div>
              </div>

              {/* Guide / Call to Action */}
              <div className="space-y-3 border-t border-gray-100 pt-5">
                <p className="text-xs font-bold text-gray-700 text-center uppercase tracking-wider mb-2">Ưu đãi dành riêng cho bạn</p>
                
                {/* Zalo OA Button */}
                <a 
                  href="https://zalo.me/3870382725035413507?src=qr" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-sm transition-all hover:scale-[1.01] duration-150"
                >
                  <div className="bg-white/20 p-2 rounded-lg">
                    <Heart size={18} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold">Quan tâm Zalo OA</p>
                    <p className="text-[10px] text-blue-100">Nhận lịch nhắc thay lõi lọc nước định kỳ tự động</p>
                  </div>
                </a>

                {/* Google Map Review Button */}
                <a 
                  href="https://maps.app.goo.gl/rB1GgC9t58dJ9WqY8" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3.5 bg-white hover:bg-gray-50 border border-gray-100 rounded-xl shadow-xs transition-all hover:scale-[1.01] duration-150"
                >
                  <div className="bg-amber-100 text-amber-500 p-2 rounded-lg">
                    <MessageSquare size={18} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-gray-800">Đánh giá dịch vụ 5 sao</p>
                    <p className="text-[10px] text-gray-400">Đánh giá KTV lắp đặt giúp Pure Vita hoàn thiện tốt hơn</p>
                  </div>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-100 p-4 text-center text-[10px] text-gray-400">
          Pure Vita © {new Date().getFullYear()} • Hotline 1900 633423
        </div>
      </div>
    </div>
  );
}
