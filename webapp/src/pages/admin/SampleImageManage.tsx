import { useState, useEffect } from 'react';
import { fetchApi, uploadImage } from '../../api/client';
import { WORK_TYPES, getImageSlots } from '../../utils/workTypes';
import { UploadCloud, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';

export default function SampleImageManage() {
  const { confirm } = useConfirm();
  const [selectedWorkType, setSelectedWorkType] = useState(WORK_TYPES[0]);
  const [samples, setSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSlots, setUploadingSlots] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSamples();
  }, []);

  const loadSamples = async () => {
    try {
      setLoading(true);
      const data = await fetchApi('/sample-images');
      setSamples(data);
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi tải danh sách ảnh mẫu' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (slotLabel: string, file: File) => {
    const slotKey = `${selectedWorkType}-${slotLabel}`;
    setUploadingSlots(prev => ({ ...prev, [slotKey]: true }));
    setMessage(null);

    try {
      // 1. Upload to Cloudinary
      const uploadRes = await uploadImage(file);
      
      // 2. Save connection to DB
      const savedSample = await fetchApi('/sample-images', {
        method: 'POST',
        body: JSON.stringify({
          workType: selectedWorkType,
          slotLabel,
          imageUrl: uploadRes.url
        })
      });

      // 3. Update local state
      setSamples(prev => {
        const filtered = prev.filter(s => !(s.workType === selectedWorkType && s.slotLabel === slotLabel));
        return [...filtered, savedSample];
      });

      setMessage({ type: 'success', text: `Đã cập nhật ảnh mẫu cho "${slotLabel}"` });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi tải ảnh lên' });
    } finally {
      setUploadingSlots(prev => ({ ...prev, [slotKey]: false }));
    }
  };

  const handleDelete = async (sampleId: string, slotLabel: string) => {
    const isConfirmed = await confirm({
      title: 'Xóa ảnh mẫu',
      message: `Bạn có chắc chắn muốn xóa ảnh mẫu cho "${slotLabel}"?`,
      confirmText: 'Xóa',
      cancelText: 'Hủy bỏ',
      type: 'danger'
    });
    if (!isConfirmed) return;
    setMessage(null);

    try {
      await fetchApi(`/sample-images/${sampleId}`, { method: 'DELETE' });
      setSamples(prev => prev.filter(s => s.id !== sampleId));
      setMessage({ type: 'success', text: `Đã xóa ảnh mẫu cho "${slotLabel}"` });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Lỗi xóa ảnh mẫu' });
    }
  };

  const slots = getImageSlots(selectedWorkType);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Quản lý Ảnh mẫu Báo cáo</h2>
          <p className="text-sm text-gray-500">Thiết lập ảnh mẫu KTV bắt buộc chụp theo cho từng loại đơn hàng</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {WORK_TYPES.map(type => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setSelectedWorkType(type);
              setMessage(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              selectedWorkType === type
                ? 'bg-[#1B3A6B] text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Notification */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 animate-fade-in ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} className="text-emerald-500" /> : <AlertCircle size={20} className="text-rose-500" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Main Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 size={36} className="animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {slots.map((slot, index) => {
            const sample = samples.find(s => s.workType === selectedWorkType && s.slotLabel === slot.label);
            const isUploading = uploadingSlots[`${selectedWorkType}-${slot.label}`];

            return (
              <div key={slot.label} className="bg-white border rounded-xl shadow-sm p-4 flex flex-col justify-between h-[320px] transition-all hover:shadow-md hover:border-gray-300">
                {/* Title */}
                <div>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    Slot {index + 1}
                  </span>
                  <h4 className="font-semibold text-gray-800 text-sm mt-2 line-clamp-2 h-[40px]">
                    {slot.label}
                  </h4>
                </div>

                {/* Display/Upload area */}
                <div className="my-4 flex-1 relative flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg overflow-hidden h-[160px]">
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={28} className="animate-spin text-blue-600" />
                      <span className="text-xs text-gray-500 font-medium">Đang tải lên...</span>
                    </div>
                  ) : sample ? (
                    <div className="w-full h-full relative group">
                      <img
                        src={sample.imageUrl}
                        alt={slot.label}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <a
                          href={sample.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-white text-gray-800 text-xs font-semibold rounded-lg shadow hover:bg-gray-100 transition"
                        >
                          Xem ảnh lớn
                        </a>
                      </div>
                    </div>
                  ) : (
                    <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/50 transition-colors p-4">
                      <UploadCloud size={32} className="text-gray-400 mb-2" />
                      <span className="text-xs font-semibold text-gray-600">Thêm ảnh mẫu</span>
                      <span className="text-[10px] text-gray-400 mt-1">Định dạng JPG, PNG</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          if (e.target.files && e.target.files[0]) {
                            handleFileUpload(slot.label, e.target.files[0]);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>

                {/* Action button */}
                {sample && !isUploading && (
                  <button
                    type="button"
                    onClick={() => handleDelete(sample.id, slot.label)}
                    className="w-full py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-xs font-semibold hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Trash2 size={14} />
                    Xóa ảnh mẫu
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
