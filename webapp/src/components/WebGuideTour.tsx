import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  X,
  ChevronLeft,
  ChevronRight,
  PlayCircle,
  Compass,
  BookOpen,
  Lightbulb,
  CheckCircle2,
  UserPlus,
  Edit3,
  RefreshCw,
  ClipboardCheck,
  Copy,
  XCircle,
  RotateCcw,
  FileText,
  History,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../context/PermissionContext';
import {
  getAvailableGuideTopics,
  type GuideIconKey,
  type ResolvedWebGuideStep,
  type ResolvedWebGuideTopic,
  getFullTourStepsForRoute,
} from '../config/webGuideTopics';

function renderPreviewButtonIcon(icon: GuideIconKey) {
  switch (icon) {
    case 'assign':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 shrink-0">
          <UserPlus size={16} />
        </span>
      );
    case 'edit':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 shrink-0">
          <Edit3 size={16} />
        </span>
      );
    case 'sync-single':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 shrink-0">
          <RefreshCw size={16} />
        </span>
      );
    case 'report':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 shrink-0">
          <ClipboardCheck size={16} />
        </span>
      );
    case 'copy':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 shrink-0">
          <Copy size={16} />
        </span>
      );
    case 'cancel':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 border border-red-200 text-red-600 shrink-0">
          <XCircle size={16} />
        </span>
      );
    case 'reopen':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 shrink-0">
          <RotateCcw size={16} />
        </span>
      );
    case 'view-report':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 text-teal-600 shrink-0">
          <FileText size={16} />
        </span>
      );
    case 'audit':
      return (
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 text-gray-600 shrink-0">
          <History size={16} />
        </span>
      );
  }
}

const SEEN_KEY = 'truliva_web_guide_seen_v1:';
const PAD = 6;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface WebGuideTourProps {
  userKey: string;
  pickerOpen: boolean;
  onClosePicker: () => void;
}

function getSafeItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setSafeItem(key: string, val: string): void {
  try {
    window.localStorage.setItem(key, val);
  } catch {
    // ignore storage quota / privacy mode errors
  }
}

export default function WebGuideTour({
  userKey,
  pickerOpen,
  onClosePicker,
}: WebGuideTourProps) {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermission();
  const location = useLocation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<'idle' | 'prompt' | 'tour'>('idle');
  const [steps, setSteps] = useState<ResolvedWebGuideStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [missingTargetFallback, setMissingTargetFallback] = useState(false);
  const [tipHeight, setTipHeight] = useState(320);

  const dirRef = useRef<1 | -1>(1);
  const returnPathRef = useRef<string>(location.pathname);
  const currentPathRef = useRef<string>(location.pathname);
  currentPathRef.current = location.pathname;

  const accessCtx = useMemo(
    () => ({ role: user?.role, group: user?.group, hasPermission }),
    [user?.role, user?.group, hasPermission]
  );

  // Lọc nghiêm ngặt danh sách chủ đề & bước theo đúng Ma trận phân quyền hiện tại của user
  const availableTopics = useMemo<ResolvedWebGuideTopic[]>(() => {
    if (permLoading || !user) return [];
    return getAvailableGuideTopics(accessCtx);
  }, [permLoading, user, accessCtx]);

  // Ưu tiên chủ đề của trang đang mở lên đầu
  const sortedTopics = useMemo(() => {
    return [...availableTopics].sort((a, b) => {
      const aMatch = a.route === location.pathname ? 0 : 1;
      const bMatch = b.route === location.pathname ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [availableTopics, location.pathname]);

  const currentPageFullSteps = useMemo(() => {
    if (permLoading || !user) return [];
    return getFullTourStepsForRoute(location.pathname, accessCtx);
  }, [permLoading, user, location.pathname, accessCtx]);

  // Lần đầu vào trang có hướng dẫn: chỉ hiện sau khi PermissionContext đã load xong
  useEffect(() => {
    if (permLoading || !userKey || currentPageFullSteps.length === 0) return;
    if (phase !== 'idle' || pickerOpen) return;
    const seenKey = `${SEEN_KEY}${userKey}:${location.pathname}`;
    if (!getSafeItem(seenKey)) {
      setPhase('prompt');
    }
  }, [permLoading, userKey, location.pathname, currentPageFullSteps.length, phase, pickerOpen]);

  const markRouteSeen = (route: string) => {
    if (!userKey) return;
    setSafeItem(`${SEEN_KEY}${userKey}:${route}`, '1');
  };

  const startTour = (tourSteps: ResolvedWebGuideStep[]) => {
    if (tourSteps.length === 0) return;
    markRouteSeen(location.pathname);
    onClosePicker();
    returnPathRef.current = location.pathname;
    dirRef.current = 1;
    setSteps(tourSteps);
    setIndex(0);
    setPhase('tour');
  };

  const finishTour = () => {
    setPhase('idle');
    setRect(null);
    if (returnPathRef.current && returnPathRef.current !== currentPathRef.current) {
      navigate(returnPathRef.current);
    }
  };

  const go = (dir: 1 | -1) => {
    dirRef.current = dir;
    setIndex((i) => i + dir);
  };

  // Phím tắt cho môi trường Desktop: ← / → / Esc
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (phase === 'tour') {
        if (e.key === 'Escape') {
          finishTour();
        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
          e.preventDefault();
          if (index >= steps.length - 1) finishTour();
          else go(1);
        } else if (e.key === 'ArrowLeft' && index > 0) {
          e.preventDefault();
          go(-1);
        }
      } else if (pickerOpen && e.key === 'Escape') {
        onClosePicker();
      } else if (phase === 'prompt' && e.key === 'Escape') {
        markRouteSeen(location.pathname);
        setPhase('idle');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pickerOpen, index, steps.length, location.pathname]);

  // Theo dõi từng bước: chuyển route nếu cần, chờ DOM xuất hiện, cuộn tới & bám vị trí spotlight
  useEffect(() => {
    if (phase !== 'tour') return;
    if (index < 0) {
      dirRef.current = 1;
      setIndex(0);
      return;
    }
    const step = steps[index];
    if (!step) {
      finishTour();
      return;
    }

    const sameRoute = step.route === currentPathRef.current;
    const waitMs = sameRoute ? 180 : 1800;
    if (!sameRoute) {
      navigate(step.route);
    }
    setRect(null);
    setMissingTargetFallback(false);

    let el: Element | null = null;
    let last = '';
    let raf = 0;
    const startedAt = performance.now();

    const tick = () => {
      if (!el) {
        el = document.querySelector(`[data-tour="${step.target}"]`);
        if (el) {
          const r0 = el.getBoundingClientRect();
          const isTall = r0.height > window.innerHeight * 0.55;
          el.scrollIntoView({
            block: isTall ? 'start' : 'center',
            inline: 'nearest',
            behavior: 'smooth',
          });
        } else if (performance.now() - startedAt > waitMs) {
          // Thử khoét sáng vùng chứa fallback (vd. cột Thao tác) để người dùng thấy rõ vị trí nút sẽ xuất hiện
          if (step.fallbackTarget) {
            const fb = document.querySelector(`[data-tour="${step.fallbackTarget}"]`);
            if (fb) {
              el = fb;
              setMissingTargetFallback(true);
              fb.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
            } else if (step.fallbackCenter) {
              setMissingTargetFallback(true);
              return;
            } else {
              setIndex((i) => i + dirRef.current);
              return;
            }
          } else if (step.fallbackCenter) {
            setMissingTargetFallback(true);
            return;
          } else {
            setIndex((i) => i + dirRef.current);
            return;
          }
        }
      }
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) {
          if (performance.now() - startedAt > waitMs) {
            if (step.fallbackCenter) {
              setMissingTargetFallback(true);
              return;
            }
            setIndex((i) => i + dirRef.current);
            return;
          }
        } else {
          const key = `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)}`;
          if (key !== last) {
            last = key;
            setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, steps]);

  if (availableTopics.length === 0) return null;

  const step = steps[index];
  const isLast = index >= steps.length - 1;

  // Tính vị trí hộp hướng dẫn gọn gàng, không tràn màn hình desktop/mobile
  let tooltipStyle: React.CSSProperties = {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: Math.min(480, typeof window !== 'undefined' ? window.innerWidth - 32 : 480),
  };
  if (rect) {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const cardWidth = Math.min(480, vw - 32);
    const spaceBelow = vh - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const need = tipHeight + PAD + 24;

    // Căn ngang gần vùng spotlight nhưng luôn kẹp trong viewport
    const idealLeft = rect.left + rect.width / 2 - cardWidth / 2;
    const clampedLeft = Math.max(16, Math.min(idealLeft, vw - cardWidth - 16));

    if (spaceBelow >= need) {
      tooltipStyle = {
        top: rect.top + rect.height + PAD + 12,
        left: clampedLeft,
        width: cardWidth,
      };
    } else if (spaceAbove >= need) {
      tooltipStyle = {
        bottom: vh - rect.top + PAD + 12,
        left: clampedLeft,
        width: cardWidth,
      };
    } else {
      tooltipStyle = {
        bottom: 20,
        left: clampedLeft,
        width: cardWidth,
      };
    }
  }

  return createPortal(
    <>
      {/* 1. Lời mời hướng dẫn lần đầu (Thuần Enterprise) */}
      {phase === 'prompt' && !pickerOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/55 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="web-guide-prompt-title"
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="px-5 py-4 bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 rounded-xl">
                  <Compass size={20} />
                </div>
                <div>
                  <h2 id="web-guide-prompt-title" className="text-sm font-bold">
                    Hướng dẫn nhanh thao tác
                  </h2>
                  <p className="text-[11px] text-blue-100">
                    Hệ thống quản trị vận hành Truliva
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  markRouteSeen(location.pathname);
                  setPhase('idle');
                }}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Bạn có muốn xem hướng dẫn từng bước các chức năng chính tại màn hình này không? Quy trình chỉ mất khoảng 1 phút và tự động lọc theo quyền tài khoản của bạn.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    markRouteSeen(location.pathname);
                    setPhase('idle');
                  }}
                  className="px-4 py-2.5 min-h-[42px] rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={() => startTour(currentPageFullSteps)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[42px] rounded-xl bg-[#1B3A6B] hover:bg-[#152e56] text-white text-xs sm:text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  <PlayCircle size={16} />
                  <span>Bắt đầu hướng dẫn</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Bạn có thể mở lại bất cứ lúc nào từ mục <strong className="text-slate-600">Hướng dẫn</strong> trên thanh điều hướng.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal chọn chủ đề hướng dẫn (Context-aware) */}
      {pickerOpen && phase !== 'tour' && (
        <div
          className="fixed inset-0 z-[110] bg-slate-900/55 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={onClosePicker}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="web-guide-picker-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="px-5 py-4 bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/15 rounded-xl">
                  <BookOpen size={20} />
                </div>
                <div>
                  <h2 id="web-guide-picker-title" className="text-base font-bold">
                    Hướng dẫn sử dụng
                  </h2>
                  <p className="text-xs text-blue-100">
                    Chọn chủ đề để xem chỉ dẫn trực tiếp từng bước trên màn hình
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClosePicker}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {currentPageFullSteps.length > 0 && (
                <button
                  type="button"
                  onClick={() => startTour(currentPageFullSteps)}
                  className="w-full px-4 py-3 rounded-xl bg-[#1B3A6B] hover:bg-[#152e56] text-white font-semibold text-sm flex items-center justify-between shadow-sm transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <PlayCircle size={18} className="text-[#00A3FF]" />
                    <span>Xem toàn bộ hướng dẫn trang hiện tại</span>
                  </span>
                  <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full">
                    {currentPageFullSteps.length} bước
                  </span>
                </button>
              )}

              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
                  Danh mục hướng dẫn theo nghiệp vụ
                </div>
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {sortedTopics.map((topic) => {
                    const isCurrentPage = topic.route === location.pathname;
                    return (
                      <li key={topic.id}>
                        <button
                          type="button"
                          onClick={() => startTour(topic.steps)}
                          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-blue-50/60 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-800">
                                {topic.title}
                              </span>
                              {isCurrentPage && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-[#1B3A6B]">
                                  Trang hiện tại
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                              {topic.desc}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
                            <span className="text-[11px] font-semibold text-slate-500">
                              {topic.steps.length} bước
                            </span>
                            <ChevronRight size={16} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                <span>Mẹo: Dùng phím ← / → để chuyển bước, Esc để thoát.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Spotlight Tour */}
      {phase === 'tour' && step && (
        <div className="fixed inset-0 z-[110]">
          {rect ? (
            <div
              className="fixed rounded-xl ring-2 ring-[#00A3FF] pointer-events-none transition-all duration-300"
              style={{
                top: rect.top - PAD,
                left: rect.left - PAD,
                width: rect.width + PAD * 2,
                height: rect.height + PAD * 2,
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65)',
              }}
            />
          ) : (
            <div className="fixed inset-0 bg-slate-900/65" />
          )}

          {(rect || missingTargetFallback) && (
            <div
              className="fixed z-[111] transition-all duration-200"
              style={tooltipStyle}
              ref={(node) => {
                if (node && node.offsetHeight !== tipHeight) {
                  setTipHeight(node.offsetHeight);
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="web-guide-step-title"
                className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[82vh] flex flex-col"
              >
                {/* Progress bar */}
                <div className="h-1 bg-slate-100 w-full shrink-0">
                  <div
                    className="h-full bg-[#00A3FF] transition-all duration-300"
                    style={{ width: `${((index + 1) / steps.length) * 100}%` }}
                  />
                </div>

                <div className="p-4 space-y-3 overflow-y-auto">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00A3FF] uppercase tracking-wide">
                        <Compass size={12} />
                        Bước {index + 1} / {steps.length}
                      </span>
                      <h3
                        id="web-guide-step-title"
                        className="text-sm font-bold text-[#1B3A6B]"
                      >
                        {step.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={finishTour}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                      aria-label="Thoát hướng dẫn"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {step.buttonPreview && (
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      {renderPreviewButtonIcon(step.buttonPreview.icon)}
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Nhận diện nút trên bảng
                        </div>
                        <div className="text-xs font-bold text-slate-800">
                          {step.buttonPreview.label}
                        </div>
                      </div>
                    </div>
                  )}

                  {missingTargetFallback && (
                    <div className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl px-2.5 py-1.5">
                      {step.buttonPreview?.conditionNote ||
                        'Nút này chỉ hiển thị ở những dòng ca phù hợp điều kiện (vùng khoét sáng là vị trí nút sẽ xuất hiện).'}
                    </div>
                  )}

                  <p className="text-[13px] text-slate-700 leading-relaxed">
                    {step.text}
                  </p>

                  {step.flow && step.flow.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-[#1B3A6B]">
                        Quy trình thao tác
                      </div>
                      <ol className="space-y-1.5">
                        {step.flow.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-[12.5px] text-slate-700 leading-relaxed">
                            <span className="w-4 h-4 rounded-full bg-[#1B3A6B] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {step.tip && (
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-blue-50/70 border border-blue-100 text-[12px] text-[#1B3A6B]">
                      <Lightbulb size={14} className="text-[#00A3FF] shrink-0 mt-0.5" />
                      <span>{step.tip}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={finishTour}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Bỏ qua
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => go(-1)}
                        disabled={index === 0}
                        className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                        Quay lại
                      </button>
                      <button
                        type="button"
                        onClick={() => (isLast ? finishTour() : go(1))}
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 min-h-[36px] rounded-xl bg-[#1B3A6B] hover:bg-[#152e56] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        {isLast ? (
                          <>
                            <CheckCircle2 size={14} />
                            Hoàn tất
                          </>
                        ) : (
                          <>
                            Tiếp
                            <ChevronRight size={14} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>,
    document.body
  );
}
