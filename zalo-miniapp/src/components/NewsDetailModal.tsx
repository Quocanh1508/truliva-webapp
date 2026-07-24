import React from 'react';
import { X, Calendar, Eye, Share2, ShieldCheck } from 'lucide-react';

interface NewsArticle {
  id: string;
  title: string;
  date: string;
  views: number;
  image: string;
  summary: string;
  content: string[];
}

interface NewsDetailModalProps {
  article: NewsArticle | null;
  onClose: () => void;
}

export default function NewsDetailModal({ article, onClose }: NewsDetailModalProps) {
  if (!article) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md h-[90vh] sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200">
        
        {/* Header with image */}
        <div className="relative h-48 bg-slate-900 overflow-hidden flex-shrink-0">
          <img 
            src={article.image} 
            alt={article.title} 
            className="w-full h-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30"></div>
          
          <button 
            onClick={onClose}
            className="absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="absolute bottom-3 left-4 right-4 text-white space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-600 px-2 py-0.5 rounded-full text-white">
              Cẩm Nang Truliva
            </span>
            <div className="flex items-center space-x-3 text-[11px] text-slate-300">
              <span className="flex items-center"><Calendar size={12} className="mr-1" />{article.date}</span>
              <span className="flex items-center"><Eye size={12} className="mr-1" />{article.views} lượt xem</span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-slate-700 text-xs leading-relaxed">
          <h2 className="text-base font-extrabold text-slate-900 leading-snug">
            {article.title}
          </h2>

          <div className="p-3 bg-blue-50 border-l-4 border-blue-600 rounded-r-xl font-medium text-blue-900">
            {article.summary}
          </div>

          {(article.content || []).map((paragraph, idx) => (
            <p key={idx} className="text-slate-600">
              {paragraph}
            </p>
          ))}

          {/* Banner quảng cáo thay lõi */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-4 rounded-2xl space-y-2 mt-4 shadow-md">
            <div className="flex items-center space-x-2 font-bold text-amber-300">
              <ShieldCheck size={18} />
              <span>Dịch vụ Thay Lõi Truliva Chính Hãng</span>
            </div>
            <p className="text-[11px] text-blue-100">
              Miễn phí công thay & kiểm tra đo chỉ số TDS nước tại nhà bởi Kỹ thuật viên chính hãng Truliva.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2 flex-shrink-0">
          <button 
            onClick={onClose}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm cursor-pointer"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
