import { useEffect, useState } from 'react';
import { getQueue, dequeueReport } from '../utils/offlineStorage';
import { uploadImages, fetchApi } from '../api/client';
import { RefreshCw, CheckCircle, WifiOff } from 'lucide-react';

export default function SyncManager() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Chạy đồng bộ định kỳ mỗi 40 giây khi online
    const interval = setInterval(() => {
      if (navigator.onLine) {
        triggerSync();
      }
    }, 40000);

    // Kiểm tra và chạy đồng bộ ngay khi load component nếu đang online
    if (navigator.onLine) {
      triggerSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const triggerSync = async () => {
    if (syncing) return;
    
    try {
      const queue = await getQueue();
      if (queue.length === 0) return;

      setSyncing(true);
      setStatusMessage(`Đang đồng bộ ${queue.length} báo cáo ngoại tuyến...`);
      setShowNotification(true);

      let successCount = 0;

      for (const item of queue) {
        try {
          console.log(`[OfflineSync] Processing report for order ${item.orderId}`);
          
          // 1. Tải ảnh lên Cloudinary
          let urls: string[] = [];
          if (item.files && item.files.length > 0) {
            urls = await uploadImages(item.files);
          }

          // 2. Gán mảng URL ảnh thực tế vào payload
          const finalPayload = {
            ...item.payload,
            imageUrls: urls
          };

          // 3. Gọi API gửi báo cáo lên Server
          await fetchApi('/reports', {
            method: 'POST',
            body: JSON.stringify(finalPayload)
          });

          // 4. Xóa khỏi hàng đợi IndexedDB sau khi thành công
          await dequeueReport(item.id);
          successCount++;
          console.log(`[OfflineSync] Successfully synced report ${item.id}`);

        } catch (err: any) {
          console.error(`[OfflineSync] Error syncing report ${item.id}:`, err);
          // Dừng đồng bộ nếu gặp lỗi mạng hoặc lỗi hệ thống để tránh lặp lỗi
          break;
        }
      }

      if (successCount > 0) {
        setStatusMessage(`Đồng bộ thành công ${successCount} báo cáo ngoại tuyến!`);
        setTimeout(() => {
          setShowNotification(false);
        }, 5000);
      } else {
        setShowNotification(false);
      }

    } catch (err) {
      console.error('[OfflineSync] Queue processing error', err);
      setShowNotification(false);
    } finally {
      setSyncing(false);
    }
  };

  if (!showNotification && !syncing) {
    // Chỉ hiển thị banner nhỏ khi đang mất mạng để người dùng biết họ đang offline
    if (!isOnline) {
      return (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl shadow-lg border border-amber-400 animate-bounce text-xs font-semibold">
          <WifiOff size={16} />
          <span>Đang ở chế độ ngoại tuyến</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-4 animate-slide-up text-slate-800">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${syncing ? 'bg-blue-50 text-blue-600 animate-spin' : 'bg-green-50 text-green-600'}`}>
            {syncing ? <RefreshCw size={20} /> : <CheckCircle size={20} />}
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-sm text-slate-900">
              {syncing ? 'Đang đồng bộ dữ liệu' : 'Đồng bộ hoàn tất'}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">{statusMessage}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
