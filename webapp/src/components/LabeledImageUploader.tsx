import React, { useState, useRef } from 'react';
import { Camera, X, UploadCloud } from 'lucide-react';
import { uploadImages } from '../api/client';

interface ImageSlot {
  label: string;
}

interface Props {
  imageSlots: ImageSlot[];
  onUploadSuccess: (urls: string[]) => void;
}

export default function LabeledImageUploader({ imageSlots, onUploadSuccess }: Props) {
  // Mỗi slot có 1 file + 1 preview
  const [slotFiles, setSlotFiles] = useState<(File | null)[]>(imageSlots.map(() => null));
  const [slotPreviews, setSlotPreviews] = useState<(string | null)[]>(imageSlots.map(() => null));
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleFileSelect = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      const newFiles = [...slotFiles];
      newFiles[index] = file;
      setSlotFiles(newFiles);

      // Revoke old preview if exists
      if (slotPreviews[index]) {
        URL.revokeObjectURL(slotPreviews[index]!);
      }

      const newPreviews = [...slotPreviews];
      newPreviews[index] = URL.createObjectURL(file);
      setSlotPreviews(newPreviews);
      setError('');
    }
  };

  const removeFile = (index: number) => {
    const newFiles = [...slotFiles];
    newFiles[index] = null;
    setSlotFiles(newFiles);

    if (slotPreviews[index]) {
      URL.revokeObjectURL(slotPreviews[index]!);
    }
    const newPreviews = [...slotPreviews];
    newPreviews[index] = null;
    setSlotPreviews(newPreviews);
  };

  const filledCount = slotFiles.filter(f => f !== null).length;

  const handleUpload = async () => {
    const files = slotFiles.filter((f): f is File => f !== null);
    if (files.length === 0) {
      setError('Vui lòng chọn ít nhất 1 ảnh');
      return;
    }
    setIsUploading(true);
    setError('');

    try {
      const urls = await uploadImages(files);
      onUploadSuccess(urls);
    } catch (err: any) {
      setError(err.message || 'Lỗi upload ảnh');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div>
      {error && <div className="alert alert-error mb-4">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {imageSlots.map((slot, index) => (
          <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Label */}
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: slotFiles[index] ? '#059669' : '#6b7280',
              lineHeight: '1.3',
              minHeight: '28px',
              display: 'flex',
              alignItems: 'center',
            }}>
              {slotFiles[index] ? '✅ ' : `${index + 1}. `}{slot.label}
            </span>

            {/* Upload area / Preview */}
            {slotPreviews[index] ? (
              <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', borderRadius: '10px', overflow: 'hidden', border: '2px solid #059669' }}>
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
                    position: 'absolute', top: '4px', right: '4px',
                    background: 'rgba(220,38,38,0.85)', color: '#fff',
                    borderRadius: '50%', padding: '4px', border: 'none', cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div
                onClick={() => !isUploading && fileInputRefs.current[index]?.click()}
                style={{
                  width: '100%', paddingBottom: '100%', position: 'relative',
                  borderRadius: '10px', border: '2px dashed #cbd5e1',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  background: '#f8fafc',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isUploading) {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#1B3A6B';
                    (e.currentTarget as HTMLDivElement).style.background = '#eff6ff';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = '#cbd5e1';
                  (e.currentTarget as HTMLDivElement).style.background = '#f8fafc';
                }}
              >
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: '4px',
                }}>
                  <Camera size={24} style={{ color: '#94a3b8' }} />
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>Chọn ảnh</span>
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
        ))}
      </div>

      {/* Upload button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span className="text-sm text-gray-500">
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
