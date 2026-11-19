import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';
import type { MainTabType } from './BottomNavBar';
import { GUIDE_TOPICS, FIRST_TOUR, GuideStep } from '../config/guideTopics';
import { getSafeStorage, setSafeStorage } from '../api/client';
// Ảnh được nhúng thẳng vào index.js (xem assetsInlineLimit trong vite.config.ts)
import livyImg from '../assets/livy.png';

// shortcut: cờ "đã hỏi xem hướng dẫn" lưu trong localStorage theo máy, đổi điện thoại sẽ được hỏi lại; cần đồng bộ thì lưu lên server
const SEEN_KEY = 'truliva_guide_seen_v1:';
const PAD = 6;
const TOOLTIP_SPACE = 220;

/** Linh vật Livy. size = chiều cao (px) */
export function GuideMascot({ size = 56, className = '' }: { size?: number; className?: string }) {
  return <img src={livyImg} alt="" aria-hidden="true" draggable={false} style={{ height: size, width: 'auto' }} className={className} />;
}

interface Rect { top: number; left: number; width: number; height: number }

interface GuideTourProps {
  userKey: string;
  currentTab: MainTabType;
  /** Chỉ hiện linh vật ở các màn hình chính (khi thanh điều hướng đang hiện) */
  showMascot: boolean;
  onNavigate: (tab: MainTabType) => void;
}

export default function GuideTour({ userKey, currentTab, showMascot, onNavigate }: GuideTourProps) {
  const [phase, setPhase] = useState<'idle' | 'prompt' | 'picker' | 'tour'>('idle');
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const dirRef = useRef<1 | -1>(1);
  const returnTabRef = useRef<MainTabType>('home');
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;

  // Lần đầu đăng nhập trên máy này: hỏi khách có muốn xem hướng dẫn không
  useEffect(() => {
    setPhase(getSafeStorage(SEEN_KEY + userKey) ? 'idle' : 'prompt');
  }, [userKey]);

  const markSeen = () => setSafeStorage(SEEN_KEY + userKey, '1');

  const startTour = (tourSteps: GuideStep[]) => {
    markSeen();
    returnTabRef.current = currentTab;
    dirRef.current = 1;
    setSteps(tourSteps);
    setIndex(0);
    setPhase('tour');
  };

  const finishTour = () => {
    setPhase('idle');
    setRect(null);
    navRef.current(returnTabRef.current);
  };

  const go = (dir: 1 | -1) => {
    dirRef.current = dir;
    setIndex(i => i + dir);
  };

  // Mỗi bước: chuyển tab, chờ phần tử xuất hiện, cuộn tới rồi bám theo vị trí của nó
  useEffect(() => {
    if (phase !== 'tour') return;
    if (index < 0) { dirRef.current = 1; setIndex(0); return; }
    const step = steps[index];
    if (!step) { finishTour(); return; }

    navRef.current(step.tab);
    setRect(null);
    let el: Element | null = null;
    let last = '';
    let raf = 0;
    const startedAt = performance.now();
    const tick = () => {
      if (!el) {
        el = document.querySelector(`[data-tour="${step.target}"]`);
        if (el) {
          const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
          el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: 'smooth' });
        } else if (performance.now() - startedAt > 1500) {
          // Không có phần tử này (vd. chưa có máy) → bỏ qua bước theo chiều đang đi
          setIndex(i => i + dirRef.current);
          return;
        }
      }
      if (el) {
        const r = el.getBoundingClientRect();
        const key = `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.width)},${Math.round(r.height)}`;
        if (key !== last) {
          last = key;
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, steps]);

  const step = steps[index];
  const isLast = index >= steps.length - 1;

  let tooltipPos: React.CSSProperties = { bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' };
  if (rect) {
    const vh = window.innerHeight;
    if (vh - (rect.top + rect.height) > TOOLTIP_SPACE) tooltipPos = { top: rect.top + rect.height + PAD + 10 };
    else if (rect.top > TOOLTIP_SPACE) tooltipPos = { bottom: vh - rect.top + PAD + 10 };
  }

  return (
    <>
      {/* Linh vật nổi: nhấn để chọn phần cần hướng dẫn */}
      {showMascot && phase === 'idle' && (
        <button
          onClick={() => setPhase('picker')}
          aria-label="Hướng dẫn sử dụng"
          className="fixed right-3 z-40 flex items-end gap-1 cursor-pointer active:scale-95 transition-transform"
          style={{ bottom: 'calc(92px + env(safe-area-inset-bottom, 0px))' }}
        >
          <span className="mb-3 px-2.5 py-1 rounded-full bg-white/95 border border-sky-100 shadow-md text-[11px] font-bold text-[#1B3A6B]">
            Hướng dẫn
          </span>
          <GuideMascot size={68} className="guide-mascot-bob drop-shadow-[0_6px_10px_rgba(2,132,199,0.35)]" />
        </button>
      )}

      {/* Lần đầu: hỏi có muốn xem hướng dẫn */}
      {phase === 'prompt' && (
        <div className="fixed inset-0 z-[70] bg-[#061226]/60 flex items-center justify-center p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="guide-prompt-title" className="bg-white rounded-3xl p-5 max-w-xs w-full text-center shadow-2xl space-y-3">
            <GuideMascot size={128} className="mx-auto guide-mascot-bob" />
            <h2 id="guide-prompt-title" className="font-black text-base text-slate-900">Chào bạn, mình là Livy!</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Bạn có muốn mình chỉ nhanh cách dùng ứng dụng Truliva không? Chỉ mất khoảng 1 phút.
            </p>
            <button
              onClick={() => startTour(FIRST_TOUR)}
              className="w-full min-h-[44px] rounded-2xl bg-[#1B3A6B] text-white font-bold text-sm cursor-pointer active:scale-95 transition-transform"
            >
              Xem hướng dẫn
            </button>
            <button
              onClick={() => { markSeen(); setPhase('idle'); }}
              className="w-full min-h-[44px] rounded-2xl text-slate-500 font-semibold text-sm cursor-pointer"
            >
              Để sau
            </button>
            <p className="text-[11px] text-slate-400">Bạn có thể xem lại bất cứ lúc nào bằng cách nhấn vào mình ở góc màn hình.</p>
          </div>
        </div>
      )}

      {/* Chọn chủ đề cần hướng dẫn */}
      {phase === 'picker' && (
        <div className="fixed inset-0 z-[70] bg-[#061226]/60 flex items-end justify-center" onClick={() => setPhase('idle')}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-picker-title"
            onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-t-3xl p-4 space-y-3 shadow-2xl"
            style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex items-center gap-3">
              <GuideMascot size={60} />
              <div className="flex-1">
                <h2 id="guide-picker-title" className="font-black text-base text-slate-900">Bạn cần hướng dẫn gì?</h2>
                <p className="text-xs text-slate-500">Chọn một mục, Livy sẽ chỉ từng bước.</p>
              </div>
              <button onClick={() => setPhase('idle')} aria-label="Đóng" className="w-11 h-11 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <button
              onClick={() => startTour(FIRST_TOUR)}
              className="w-full min-h-[48px] px-4 rounded-2xl bg-[#1B3A6B] text-white font-bold text-sm flex items-center gap-2 cursor-pointer active:scale-[0.98] transition-transform"
            >
              <PlayCircle size={18} />
              Xem toàn bộ hướng dẫn
            </button>
            <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {GUIDE_TOPICS.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => startTour(t.steps)}
                    className="w-full min-h-[56px] px-4 py-2.5 flex items-center justify-between text-left hover:bg-sky-50/60 cursor-pointer"
                  >
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{t.title}</span>
                      <span className="block text-xs text-slate-500">{t.desc}</span>
                    </span>
                    <ChevronRight size={16} className="text-slate-400 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Tour: làm tối màn hình, khoét sáng nút đang hướng dẫn */}
      {phase === 'tour' && step && (
        <div className="fixed inset-0 z-[70]">
          {rect ? (
            <div
              className="fixed rounded-2xl ring-2 ring-[#00D2FF] pointer-events-none transition-all duration-300"
              style={{
                top: rect.top - PAD,
                left: rect.left - PAD,
                width: rect.width + PAD * 2,
                height: rect.height + PAD * 2,
                boxShadow: '0 0 0 9999px rgba(6, 18, 38, 0.72)',
              }}
            />
          ) : (
            <div className="fixed inset-0 bg-[#061226]/70" />
          )}

          {rect && (
            <div className="fixed left-0 right-0 px-4" style={tooltipPos}>
              <div role="dialog" aria-modal="true" aria-labelledby="guide-step-title" className="max-w-md mx-auto bg-white rounded-3xl p-4 shadow-2xl space-y-3">
                <div className="flex items-start gap-3">
                  <GuideMascot size={56} className="shrink-0" />
                  <div className="flex-1 min-w-0" aria-live="polite">
                    <p className="text-[11px] font-bold text-[#0284C7]">Bước {index + 1}/{steps.length}</p>
                    <h3 id="guide-step-title" className="font-black text-sm text-slate-900">{step.title}</h3>
                    <p className="text-[13px] text-slate-600 leading-relaxed mt-1">{step.text}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={finishTour} className="min-h-[44px] px-3 text-sm font-semibold text-slate-500 cursor-pointer">
                    Bỏ qua
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => go(-1)}
                    disabled={index === 0}
                    className="min-h-[44px] px-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 flex items-center gap-0.5 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft size={16} /> Quay lại
                  </button>
                  <button
                    onClick={() => (isLast ? finishTour() : go(1))}
                    className="min-h-[44px] px-4 rounded-xl bg-[#1B3A6B] text-white text-sm font-bold flex items-center gap-0.5 cursor-pointer"
                  >
                    {isLast ? 'Xong' : <>Tiếp <ChevronRight size={16} /></>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
