import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, UploadCloud, Eye } from 'lucide-react';
import { uploadImages, fetchApi } from '../api/client';

interface ImageSlot {
  label: string;
}

interface Props {
  imageSlots: ImageSlot[];
  workType: string;
  onUploadSuccess: (urls: string[]) => void;
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
  const [activeSampleUrl, setActiveSampleUrl] = useState<string | null>(null);
  const [activeSampleLabel, setActiveSampleLabel] = useState<string>('');

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
        {imageSlots.map((slot, index) => {
          const sample = samples.find(s => s.slotLabel === slot.label);

          return (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Label */}
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: '48px', justifyContent: 'flex-start' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: slotFiles[index] ? '#059669' : '#6b7280',
                  lineHeight: '1.3',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  {slotFiles[index] ? '✅ ' : `${index + 1}. `}{slot.label}
                </span>
                
                {/* Xem mẫu Button */}
                {sample && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSampleUrl(sample.imageUrl);
                      setActiveSampleLabel(slot.label);
                    }}
                    style={{
                      marginTop: '4px',
                      alignSelf: 'flex-start',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#2563eb',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '4px',
                      padding: '2px 6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#dbeafe';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#eff6ff';
                    }}
                  >
                    <Eye size={10} /> Xem mẫu
                  </button>
                )}
              </div>

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
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (!isUploading) {
                      const div = e.currentTarget as HTMLDivElement;
                      div.style.borderColor = '#1B3A6B';
                      div.style.background = '#eff6ff';
                      const overlay = div.querySelector('.upload-overlay') as HTMLDivElement;
                      if (overlay && sample?.imageUrl) {
                        overlay.style.backgroundColor = 'rgba(239, 246, 255, 0.5)';
                      }
                    }
                  }}
                  onMouseLeave={(e) => {
                    const div = e.currentTarget as HTMLDivElement;
                    div.style.borderColor = '#cbd5e1';
                    div.style.background = '#f8fafc';
                    const overlay = div.querySelector('.upload-overlay') as HTMLDivElement;
                    if (overlay && sample?.imageUrl) {
                      overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.65)';
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
                        opacity: 0.75,
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
                    <Camera size={24} style={{ color: sample?.imageUrl ? '#1e293b' : '#94a3b8' }} />
                    <span style={{ 
                      fontSize: '10px', 
                      color: sample?.imageUrl ? '#1e293b' : '#94a3b8', 
                      fontWeight: sample?.imageUrl ? 700 : 500 
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

      {/* Lightbox Modal */}
      {activeSampleUrl && (
        <div 
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setActiveSampleUrl(null)}
        >
          <div 
            style={{
              position: 'relative', width: '100%', maxWidth: '450px',
              backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              display: 'flex', flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}>
                Ảnh mẫu chụp
              </span>
              <button 
                type="button"
                onClick={() => setActiveSampleUrl(null)}
                style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', padding: '6px', color: '#475569', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
            
            {/* Modal Title Banner */}
            <div style={{ padding: '12px 16px', backgroundColor: '#eff6ff', borderBottom: '1px solid #dbeafe' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e40af' }}>
                {activeSampleLabel}
              </span>
            </div>

            {/* Modal Body */}
            <div style={{ overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', backgroundColor: '#f8fafc', minHeight: '300px' }}>
              <img 
                src={activeSampleUrl} 
                alt="Ảnh mẫu" 
                style={{ maxWidth: '100%', maxHeight: '45vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }} 
              />
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px', textAlign: 'center', backgroundColor: '#fff', borderTop: '1px solid #f1f5f9' }}>
              <button 
                type="button" 
                onClick={() => setActiveSampleUrl(null)} 
                className="btn btn-primary text-sm w-full py-2.5"
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

