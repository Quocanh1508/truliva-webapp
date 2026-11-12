import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open, title, message, confirmLabel = 'Xác nhận', tone = 'primary', onConfirm, onCancel
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-[#1B3A6B]'}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
            <div className="text-xs text-slate-600 mt-1.5 leading-relaxed">{message}</div>
          </div>
          <button type="button" onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs"
          >
            Hủy
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`h-10 px-4 text-white font-semibold rounded-xl text-xs shadow-sm active:scale-[0.98] ${
              tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#1B3A6B] hover:bg-[#2A518E]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
