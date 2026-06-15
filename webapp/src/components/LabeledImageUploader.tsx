import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, UploadCloud } from 'lucide-react';
import { uploadImages, fetchApi } from '../api/client';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';

interface ImageSlot {
  label: string;
  isRequired?: boolean;
}

interface Props {
  imageSlots: ImageSlot[];
  workType: string;
  onUploadSuccess: (urls: string[], files?: File[]) => void;
}

export default function LabeledImageUploader({ imageSlots, workType, onUploadSuccess }: Props) {
  // Mỗi slot có 1 file + 1 preview
  const [slotFiles, setSlotFiles] = useState<(File | null)[]>(imageSlots.map(() => null));
  const [slotPreviews, setSlotPreviews] = useState<(string | null)[]>(imageSlots.map(() => null));
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Ảnh mẫu tải từ server
  const [samples, setSamples] = useState<any[]>([]);

  useEffect(() => {
    // Reset file/previews khi số lượng slots thay đổi
    setSlotFiles(imageSlots.map(() => null));
    setSlotPreviews(imageSlots.map(() => null));
  }, [imageSlots]);

  useEffect(() => {
    if (!workType) return;
    fetchApi(`/sample-images?workType=${encodeURIComponent(workType)}`)
      .then(setSamples)
      .catch(err => console.error('Lỗi tải ảnh mẫu:', err));
  }, [workType]);

  const handleFileSelect = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      const newFiles = [...slotFiles];
      newFiles[index] = file;
      setSlotFiles(newFiles);

      // Revoke old preview if exists
      if (slotPreviews[index] && slotPreviews[index]!.startsWith('blob:')) {
        URL.revokeObjectURL(slotPreviews[index]!);
      }

      const newPreviews = [...slotPreviews];
      newPreviews[index] = URL.createObjectURL(file);
      setSlotPreviews(newPreviews);
      setError('');
    }
  };

  const handleChoosePhoto = async (index: number) => {
    if (isUploading) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await CapCamera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Prompt,
          saveToGallery: true,
          promptLabelHeader: 'Tải ảnh báo cáo',
          promptLabelPhoto: 'Chọn từ thư viện ảnh',
          promptLabelPicture: 'Chụp ảnh mới'
        });

        if (photo.base64String) {
          const mimeType = `image/${photo.format || 'jpeg'}`;
          // Clean up whitespaces/newlines (Safari/iOS strictness) and ensure correct base64 padding
          let base64Clean = photo.base64String.replace(/\s/g, '');
          const padding = '='.repeat((4 - base64Clean.length % 4) % 4);
          base64Clean += padding;

          const byteCharacters = atob(base64Clean);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });
          const file = new File([blob], `photo_${index}.${photo.format || 'jpeg'}`, { type: mimeType });

          const newFiles = [...slotFiles];
          newFiles[index] = file;
          setSlotFiles(newFiles);

          const newPreviews = [...slotPreviews];
          newPreviews[index] = `data:${mimeType};base64,${photo.base64String}`;
          setSlotPreviews(newPreviews);
          setError('');
        }
      } catch (err: any) {
        console.error('Lỗi khi chụp/chọn ảnh Capacitor:', err);
        if (err.message && !err.message.includes('cancelled')) {
          setError(err.message || 'Lỗi chụp hoặc chọn ảnh');
        }
      }
    } else {
      fileInputRefs.current[index]?.click();
    }
  };

  const removeFile = (index: number) => {
    const newFiles = [...slotFiles];
    newFiles[index] = null;
    setSlotFiles(newFiles);

    if (slotPreviews[index] && slotPreviews[index]!.startsWith('blob:')) {
      URL.revokeObjectURL(slotPreviews[index]!);
    }
    const newPreviews = [...slotPreviews];
    newPreviews[index] = null;
    setSlotPreviews(newPreviews);
  };

  const filledCount = slotFiles.filter(f => f !== null).length;

  const handleUpload = async () => {
    // Check if all required slots are filled
    const missingRequiredLabels: string[] = [];
    imageSlots.forEach((slot, index) => {
      if (slot.isRequired && !slotFiles[index]) {
        missingRequiredLabels.push(slot.label);
      }
    });

    if (missingRequiredLabels.length > 0) {
      setError(`Vui lòng tải lên các ảnh bắt buộc: ${missingRequiredLabels.join(', ')}`);
      return;
    }

    const files = slotFiles.filter((f): f is File => f !== null);
    if (files.length === 0) {
      setError('Vui lòng chọn ít nhất 1 ảnh');
      return;
    }

    if (!navigator.onLine) {
      // Offline mode: bypass actual API upload, send local previews as placeholders
      const localUrls = slotPreviews.filter((p): p is string => p !== null);
      onUploadSuccess(localUrls, files);
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const urls = await uploadImages(files);
      onUploadSuccess(urls, files);
    } catch (err: any) {
      setError(err.message || 'Lỗi upload ảnh');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      {error && <div className="alert alert-error mb-4">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {imageSlots.map((slot, index) => {
          const sample = samples.find(s => s.slotLabel === slot.label);
          const hasImage = !!slotFiles[index];

          return (
            <div 
              key={index} 
              className={`flex flex-col gap-2.5 p-3.5 rounded-xl border transition-all duration-200 ${
                hasImage 
                  ? 'bg-emerald-50/30 border-emerald-300 shadow-sm' 
                  : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {/* Label */}
              <div className="flex flex-col sm:min-h-[42px] justify-start">
                <span className="text-[12px] font-semibold leading-normal flex items-start gap-1" style={{
                  color: hasImage ? '#059669' : '#475569',
                }}>
                  <span className="shrink-0">{hasImage ? '✅ ' : `${index + 1}. `}</span>
                  <span>
                    {slot.label}
                    {slot.isRequired && <span className="text-red-500 ml-1">*</span>}
                  </span>
                </span>
              </div>

              {/* Upload area / Preview */}
              {slotPreviews[index] ? (
                <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', borderRadius: '10px', overflow: 'hidden', border: '2px solid #10b981' }}>
                  <img
                    src={slotPreviews[index]!}
                    alt={slot.label}
                    style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    disabled={isUploading}
                    style={{
                      position: 'absolute', top: '6px', right: '6px',
                      background: 'rgba(220,38,38,0.85)', color: '#fff',
                      borderRadius: '50%', padding: '4px', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => handleChoosePhoto(index)}
                  style={{
                    width: '100%', paddingBottom: '100%', position: 'relative',
                    borderRadius: '10px', border: '2px dashed #cbd5e1',
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    background: '#ffffff',
                    transition: 'border-color 0.2s, background 0.2s',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (!isUploading) {
                      const div = e.currentTarget as HTMLDivElement;
                      div.style.borderColor = '#1B3A6B';
                      const overlay = div.querySelector('.upload-overlay') as HTMLDivElement;
                      if (overlay && sample?.imageUrl) {
                        overlay.style.backgroundColor = 'rgba(239, 246, 255, 0.5)';
                      }
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isUploading) {
                      const div = e.currentTarget as HTMLDivElement;
                      div.style.borderColor = '#cbd5e1';
                      const overlay = div.querySelector('.upload-overlay') as HTMLDivElement;
                      if (overlay && sample?.imageUrl) {
                        overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.65)';
                      }
                    }
                  }}
                >
                  {sample?.imageUrl && (
                    <img
                      src={sample.imageUrl}
                      alt="Mẫu"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.95,
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  <div 
                    className="upload-overlay"
                    style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: '4px',
                      backgroundColor: sample?.imageUrl ? 'rgba(255, 255, 255, 0.65)' : 'transparent',
                      transition: 'background-color 0.2s',
                      zIndex: 1,
                    }}
                  >
                    <div style={{ padding: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <Camera size={20} style={{ color: sample?.imageUrl ? '#1e293b' : '#94a3b8' }} />
                    </div>
                    <span style={{ 
                      fontSize: '10px', 
                      color: '#1e293b', 
                      fontWeight: 700 
                    }}>
                      Chọn ảnh
                    </span>
                  </div>
                </div>
              )}

              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={el => { fileInputRefs.current[index] = el; }}
                onChange={(e) => handleFileSelect(index, e)}
              />
            </div>
          );
        })}
      </div>

      {/* Upload button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="text-sm text-gray-500 font-medium">
          Đã chọn: <strong>{filledCount}/{imageSlots.length}</strong> ảnh
        </span>
        <button
          type="button"
          className="btn btn-primary flex-1 flex justify-center items-center gap-2"
          onClick={handleUpload}
          disabled={isUploading || filledCount === 0}
        >
          {isUploading ? <span className="spinner"></span> : <><UploadCloud size={18} /> Xác nhận Upload Ảnh</>}
        </button>
      </div>

    </div>
  );
}

