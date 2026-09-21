import React, { useState, useEffect } from 'react';
import { X, Calendar, Eye, Share2, ShieldCheck, Check, RefreshCw, ExternalLink } from 'lucide-react';
import { openShareSheet, openWebview } from 'zmp-sdk/apis';
import { fetchZaloApi } from '../api/client';

export interface ArticleBodyBlock {
  type: 'text' | 'image';
  content?: string;
  url?: string;
  caption?: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  date: string;
  views: number;
  image: string;
  summary?: string;
  content?: string[];
  body?: ArticleBodyBlock[];
  linkView?: string;
  url?: string;
}

interface NewsDetailModalProps {
  article: NewsArticle | null;
  onClose: () => void;
}

export default function NewsDetailModal({ article, onClose }: NewsDetailModalProps) {
  const [detail, setDetail] = useState<NewsArticle | null>(article);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!article) return;
    setDetail(article);

    // Nếu bài viết chưa có body và content, tự động fetch chi tiết từ API
    const hasContent = (article.body && article.body.length > 0) || (article.content && article.content.length > 0);
    if (!hasContent && article.id) {
      setLoading(true);
      fetchZaloApi(`/zalo-miniapp/articles/${article.id}`)
        .then(res => {
          if (res && res.success && res.article) {
            setDetail(prev => ({
              ...(prev || article),
              ...res.article
            }));
          }
        })
        .catch(err => {
          console.warn('Could not fetch article detail from backend:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [article?.id]);

  if (!article) return null;

  const activeArticle = detail || article;
  const originalLink = activeArticle.linkView || activeArticle.url;

  const handleOpenOriginal = async () => {
    if (!originalLink) return;
    try {
      await openWebview({ url: originalLink });
    } catch {
      window.open(originalLink, '_blank');
    }
  };

  const handleShare = async () => {
    try {
      const shareUrl = originalLink || `https://trulivaofficial.com/zalo-miniapp?articleId=${activeArticle.id}`;
      const thumbUrl = activeArticle.image.startsWith('http') 
        ? activeArticle.image 
        : `https://trulivaofficial.com${activeArticle.image}`;

      await openShareSheet({
        type: 'zmp',
        data: {
          title: activeArticle.title,
          description: activeArticle.summary || activeArticle.title,
          thumbnail: thumbUrl,
          path: `/?articleId=${activeArticle.id}`
        }
      });
    } catch (err) {
      if (navigator.share) {
        try {
          await navigator.share({
            title: activeArticle.title,
            text: activeArticle.summary || '',
            url: window.location.href
          });
          return;
        } catch (_) {}
      }
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (_) {}
    }
  };

  const hasSummary = Boolean(activeArticle.summary && activeArticle.summary.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md h-[92vh] sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200">
        
        {/* Header with image */}
        <div className="relative h-48 bg-slate-900 overflow-hidden flex-shrink-0">
          <img 
            src={activeArticle.image || 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=800&auto=format&fit=crop&q=80'} 
            alt={activeArticle.title} 
            className="w-full h-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-transparent to-black/30"></div>
          
          <div className="absolute top-3 right-3 flex items-center space-x-2 z-10">
            <button 
              onClick={handleShare}
              title="Chia sẻ bài viết"
              className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm transition-colors cursor-pointer flex items-center justify-center"
            >
              <Share2 size={18} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-sm transition-colors cursor-pointer flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>

          <div className="absolute bottom-3 left-4 right-4 text-white space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#0284C7] px-2.5 py-0.5 rounded-full text-white shadow-xs">
              Cẩm Nang Truliva
            </span>
            <div className="flex items-center space-x-3 text-[11px] text-sky-200">
              <span className="flex items-center"><Calendar size={12} className="mr-1" />{activeArticle.date}</span>
              <span className="flex items-center"><Eye size={12} className="mr-1" />{activeArticle.views} lượt xem</span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-slate-700 text-xs leading-relaxed">
          <h2 className="text-base font-extrabold text-slate-900 leading-snug">
            {activeArticle.title}
          </h2>

          {/* Summary Quote Box: CHỈ HIỂN THỊ KHI CÓ NỘI DUNG, KHÔNG RENDER VỆT XANH RỖNG */}
          {hasSummary && (
            <div className="p-3.5 bg-sky-50 border-l-4 border-[#0284C7] rounded-r-2xl font-medium text-sky-950 text-xs leading-relaxed shadow-xs">
              {activeArticle.summary}
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="py-10 flex flex-col items-center justify-center space-y-2 text-slate-400">
              <RefreshCw size={24} className="animate-spin text-[#0284C7]" />
              <span className="text-[11px] font-medium text-slate-500">Đang tải nội dung chi tiết từ Zalo OA...</span>
            </div>
          )}

          {/* Render Rich Body from Zalo OA (mảng các block text và image) */}
          {!loading && activeArticle.body && activeArticle.body.length > 0 && (
            <div className="space-y-3">
              {activeArticle.body.map((block: any, idx: number) => {
                if (block.type === 'text' && block.content) {
                  return (
                    <div 
                      key={idx}
                      className="text-slate-700 leading-relaxed text-xs [&>p]:mb-2.5 [&>p:last-child]:mb-0 [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-1 [&>ul]:my-2 [&>strong]:text-slate-900 [&>strong]:font-bold"
                      dangerouslySetInnerHTML={{ __html: block.content }}
                    />
                  );
                }
                if (block.type === 'image' && block.url) {
                  return (
                    <div key={idx} className="my-3 rounded-2xl overflow-hidden shadow-sm border border-slate-100">
                      <img 
                        src={block.url} 
                        alt={block.caption || 'Hình ảnh bài viết'} 
                        className="w-full object-cover rounded-2xl"
                      />
                      {block.caption && (
                        <p className="text-[10px] text-center text-slate-400 p-1.5 italic bg-slate-50">
                          {block.caption}
                        </p>
                      )}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {/* Fallback render string content paragraphs */}
          {!loading && (!activeArticle.body || activeArticle.body.length === 0) && activeArticle.content && activeArticle.content.length > 0 && (
            <div className="space-y-2.5">
              {activeArticle.content.map((paragraph, idx) => (
                <p key={idx} className="text-slate-600 leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          )}

          {/* Link xem bài viết gốc trên Zalo OA */}
          {originalLink && (
            <div className="pt-2">
              <button
                onClick={handleOpenOriginal}
                className="inline-flex items-center gap-1.5 text-xs text-[#0284C7] hover:text-[#1B3A6B] font-bold py-1 transition-colors cursor-pointer"
              >
                <span>Xem bài viết gốc trên Zalo OA Truliva</span>
                <ExternalLink size={13} />
              </button>
            </div>
          )}

          {/* Banner dịch vụ Truliva */}
          <div className="bg-gradient-to-r from-[#1B3A6B] via-[#0A4B8F] to-[#0284C7] text-white p-4 rounded-2xl space-y-2 mt-4 shadow-md">
            <div className="flex items-center space-x-2 font-bold text-cyan-300 text-xs">
              <ShieldCheck size={18} />
              <span>Dịch vụ Thay Lõi Truliva Chính Hãng</span>
            </div>
            <p className="text-[11px] text-sky-100 leading-relaxed">
              Miễn phí công thay & kiểm tra đo chỉ số TDS nước tại nhà bởi Kỹ thuật viên chính hãng Truliva.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2 flex-shrink-0">
          <button 
            onClick={handleShare}
            className="flex-1 py-2.5 bg-sky-50 hover:bg-sky-100 text-[#0284C7] border border-sky-200 rounded-xl font-bold text-xs shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer transition-colors"
          >
            {copied ? (
              <>
                <Check size={16} className="text-emerald-600" />
                <span className="text-emerald-700">Đã sao chép link!</span>
              </>
            ) : (
              <>
                <Share2 size={16} />
                <span>Chia sẻ</span>
              </>
            )}
          </button>
          <button 
            onClick={onClose}
            className="flex-1 py-2.5 bg-[#1B3A6B] hover:bg-[#2563EB] text-white rounded-xl font-bold text-xs shadow-sm transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
