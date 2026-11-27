import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|3gp|ogg)(?:$|[?#])/i;

export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('/video/upload/') || VIDEO_EXT_RE.test(url);
}

interface MediaLightboxProps {
  urls: string[];
  currentIndex: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

export default function MediaLightbox({
  urls,
  currentIndex,
  onClose,
  onChangeIndex,
}: MediaLightboxProps) {
  const safeIndex = Math.max(0, Math.min(currentIndex, urls.length - 1));
  const currentUrl = urls[safeIndex];
  const hasMultiple = urls.length > 1;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft' && hasMultiple) {
        onChangeIndex((safeIndex - 1 + urls.length) % urls.length);
      } else if (e.key === 'ArrowRight' && hasMultiple) {
        onChangeIndex((safeIndex + 1) % urls.length);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, onChangeIndex, safeIndex, urls.length, hasMultiple]);

  if (!currentUrl) return null;

  const isVideo = isVideoUrl(currentUrl);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="fixed top-4 right-4 left-4 flex items-center justify-between pointer-events-none">
        <div className="text-xs font-medium text-white/80 bg-black/50 px-3 py-1.5 rounded-full">
          {safeIndex + 1} / {urls.length}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
          aria-label="Đóng"
        >
          <X size={20} />
        </button>
      </div>

      {/* Prev button */}
      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChangeIndex((safeIndex - 1 + urls.length) % urls.length);
          }}
          className="fixed left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
          aria-label="Trước"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Media content */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            key={currentUrl}
            src={currentUrl}
            controls
            autoPlay
            playsInline
            className="max-w-[90vw] max-h-[82vh] rounded-xl shadow-2xl bg-black"
          />
        ) : (
          <img
            key={currentUrl}
            src={currentUrl}
            alt={`media-${safeIndex + 1}`}
            className="max-w-[90vw] max-h-[82vh] object-contain rounded-xl shadow-2xl"
          />
        )}
      </div>

      {/* Next button */}
      {hasMultiple && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChangeIndex((safeIndex + 1) % urls.length);
          }}
          className="fixed right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
          aria-label="Tiếp theo"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>,
    document.body
  );
}
