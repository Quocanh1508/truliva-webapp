import React, { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  FileText, 
  ShieldCheck, 
  RotateCcw, 
  Truck, 
  Award, 
  AlertCircle, 
  Tag, 
  PhoneCall, 
  Mail, 
  MapPin,
  CheckCircle2,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { fetchZaloApi } from '../api/client';

export type LegalDocType = 'COMPANY' | 'TERMS' | 'PRIVACY' | 'RETURN' | 'SHIPPING' | 'WARRANTY' | 'COMPLAINT' | 'VOUCHER';

interface LegalPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: LegalDocType;
}

interface DocMeta {
  type: LegalDocType;
  name: string;
  shortName: string;
  icon: any;
  badge?: string;
}

const LEGAL_TABS: DocMeta[] = [
  { type: 'COMPANY', name: 'Thông tin doanh nghiệp', shortName: 'Công ty', icon: Building2 },
  { type: 'TERMS', name: 'Điều khoản giao dịch', shortName: 'Điều khoản', icon: FileText, badge: 'Luật TMĐT 2025' },
  { type: 'PRIVACY', name: 'Chính sách bảo mật', shortName: 'Bảo mật', icon: ShieldCheck, badge: 'NĐ 13/2023' },
  { type: 'RETURN', name: 'Chính sách đổi trả', shortName: 'Đổi trả 7 ngày', icon: RotateCcw },
  { type: 'SHIPPING', name: 'Giao hàng & lắp đặt', shortName: 'Vận chuyển', icon: Truck },
  { type: 'WARRANTY', name: 'Chính sách bảo hành', shortName: 'Bảo hành', icon: Award },
  { type: 'COMPLAINT', name: 'Quy trình khiếu nại', shortName: 'Khiếu nại', icon: AlertCircle },
  { type: 'VOUCHER', name: 'Chính sách voucher', shortName: 'Voucher', icon: Tag }
];

export default function LegalPagesModal({ isOpen, onClose, initialType = 'TERMS' }: LegalPagesModalProps) {
  const [activeType, setActiveType] = useState<LegalDocType>(initialType);
  const [docDetail, setDocDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialType) {
      setActiveType(initialType);
    }
  }, [initialType]);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    fetchZaloApi(`/zalo-miniapp/shop/legal-docs/${activeType}`)
      .then(res => {
        if (res && res.success && res.document) {
          setDocDetail(res.document);
        } else {
          setDocDetail(null);
        }
      })
      .catch(err => {
        console.error('Error fetching legal doc', err);
        setDocDetail(null);
      })
      .finally(() => setLoading(false));
  }, [isOpen, activeType]);

  if (!isOpen) return null;

  const currentTab = LEGAL_TABS.find(t => t.type === activeType) || LEGAL_TABS[0];
  const CurrentIcon = currentTab.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in p-0 sm:p-4">
      <div 
        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-slide-up"
        style={{ borderTop: '4px solid #1B3A6B' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-[#1B3A6B]/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#1B3A6B]/10 flex items-center justify-center text-[#1B3A6B]">
              <CurrentIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-base leading-tight">
                  {currentTab.name}
                </h3>
                {currentTab.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                    {currentTab.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Quy chuẩn pháp lý Truliva (Hiệu lực: 2026)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Horizontal Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 overflow-x-auto bg-gray-50 border-b border-gray-200/80 no-scrollbar">
          {LEGAL_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.type === activeType;
            return (
              <button
                key={tab.type}
                onClick={() => setActiveType(tab.type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive 
                    ? 'bg-[#1B3A6B] text-white shadow-xs' 
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.shortName}</span>
              </button>
            );
          })}
        </div>

        {/* Document Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-sm text-gray-700 leading-relaxed font-sans">
          {loading ? (
            <div className="py-16 text-center text-gray-400 flex flex-col items-center justify-center gap-2">
              <div className="w-7 h-7 border-2 border-[#1B3A6B] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-medium text-gray-500">Đang tải văn bản pháp lý...</p>
            </div>
          ) : docDetail ? (
            <div className="space-y-4">
              {/* Document Summary Box */}
              {docDetail.summary && (
                <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-100 text-blue-900 text-xs flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Tóm lược chính sách: </span>
                    {docDetail.summary}
                  </div>
                </div>
              )}

              {/* Document Meta Badges */}
              <div className="flex items-center justify-between text-[11px] text-gray-500 pb-2 border-b border-gray-100">
                <span>Phiên bản: <strong className="text-gray-700">v{docDetail.version || '1.0'}</strong></span>
                <span>Cập nhật: <strong className="text-gray-700">{new Date(docDetail.updatedAt || docDetail.effectiveDate).toLocaleDateString('vi-VN')}</strong></span>
              </div>

              {/* Main HTML Content */}
              <div 
                className="legal-content prose prose-sm max-w-none text-gray-700 space-y-3"
                dangerouslySetInnerHTML={{ __html: docDetail.contentHtml }}
              />

              {/* Company Contact Fast-Cards if COMPANY tab */}
              {activeType === 'COMPANY' && (
                <div className="mt-4 p-4 rounded-2xl bg-gray-50 border border-gray-200 space-y-2.5 text-xs">
                  <div className="font-bold text-[#1B3A6B] text-sm">Liên hệ trực tiếp với Truliva:</div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <PhoneCall className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Hotline CSKH: <strong>1900 638 463</strong> (Miễn cước)</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Email: <strong>support@truliva.vn</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <MapPin className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Trụ sở: 107/52/19 Nguyễn Văn Khối, P.11, Q.Gò Vấp, TP.HCM</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-500">
              <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
              <p>Chưa thể tải nội dung văn bản này. Vui lòng thử lại sau.</p>
            </div>
          )}
        </div>

        {/* Footer Confirmation */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tuân thủ Luật TMĐT 2025 & NĐ 248/2026/NĐ-CP</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#1B3A6B] text-white text-xs font-bold hover:bg-[#152e55] transition shadow-xs"
          >
            Đã hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
