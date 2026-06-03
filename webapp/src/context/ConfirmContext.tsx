import React, { createContext, useContext, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AlertCircle, HelpCircle, X } from 'lucide-react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
};

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({ message: '' });
  const [resolveFn, setResolveFn] = useState<((val: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      setResolveFn(() => resolve);
    });
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolveFn) resolveFn(false);
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolveFn) resolveFn(true);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in text-left">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 p-6 relative animate-fade-in" style={{ transform: 'scale(1)', transition: 'transform 0.2s ease-out' }}>
              
              {/* Close Button at top right */}
              <button 
                onClick={handleCancel}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                type="button"
              >
                <X size={20} />
              </button>

              <div className="flex gap-4 items-start mt-2">
                {/* Icon based on type */}
                {options.type === 'danger' && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-full flex-shrink-0">
                    <AlertTriangle size={24} />
                  </div>
                )}
                {options.type === 'warning' && (
                  <div className="p-3 bg-amber-50 text-amber-600 rounded-full flex-shrink-0">
                    <AlertCircle size={24} />
                  </div>
                )}
                {(!options.type || options.type === 'info') && (
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-full flex-shrink-0">
                    <HelpCircle size={24} />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 pr-6">
                  <h4 className="text-lg font-bold text-gray-900 mb-1">
                    {options.title || (options.type === 'danger' ? 'Xác nhận xóa' : options.type === 'warning' ? 'Cảnh báo' : 'Xác nhận')}
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {options.message}
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex gap-3 justify-end mt-6 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-gray-700 hover:bg-slate-50 active:bg-slate-100 transition-all"
                >
                  {options.cancelText || 'Hủy bỏ'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg text-white transition-all shadow-sm ${
                    options.type === 'danger'
                      ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                      : options.type === 'warning'
                      ? 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700'
                      : 'bg-[#1B3A6B] hover:bg-[#152e55] active:bg-[#0f223f]'
                  }`}
                >
                  {options.confirmText || 'Đồng ý'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
};
