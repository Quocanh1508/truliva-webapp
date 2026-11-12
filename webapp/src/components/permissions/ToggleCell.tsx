import React from 'react';
import { Check, X, Lock, RotateCcw } from 'lucide-react';
import type { ResolvedPermission } from '../../context/PermissionContext';
import { LEGEND_ITEMS, type CellVisual } from './legend';

const VISUAL_CLASS: Record<CellVisual, string> = {
  'on': 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600 shadow-sm',
  'off': 'bg-slate-100 border-slate-300 text-slate-400 hover:bg-slate-200 hover:text-slate-600',
  'inherit-on': 'bg-emerald-50 border-emerald-300 border-dashed text-emerald-600 hover:bg-emerald-100',
  'inherit-off': 'bg-white border-slate-300 border-dashed text-slate-300 hover:bg-slate-50 hover:text-slate-500',
  'override-on': 'bg-[#1B3A6B] border-[#1B3A6B] text-white hover:bg-[#2A518E] shadow-sm ring-2 ring-amber-300 ring-offset-1',
  'override-off': 'bg-rose-500 border-rose-600 text-white hover:bg-rose-600 shadow-sm ring-2 ring-amber-300 ring-offset-1',
  'locked': 'bg-emerald-50 border-emerald-200 text-emerald-600 cursor-not-allowed'
};

/** Ô minh họa tĩnh (dùng trong chú giải & hướng dẫn) */
export const CellSwatch: React.FC<{ visual: CellVisual; size?: 'sm' | 'md' }> = ({ visual, size = 'sm' }) => {
  const on = visual === 'on' || visual === 'inherit-on' || visual === 'override-on';
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';
  const icon = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  return (
    <span className={`inline-flex items-center justify-center rounded-lg border shrink-0 ${dim} ${VISUAL_CLASS[visual]}`}>
      {visual === 'locked' ? <Lock className={icon} /> : on ? <Check className={`${icon} stroke-[3]`} /> : <X className={`${icon} stroke-[3]`} />}
    </span>
  );
};


export const PermissionLegend: React.FC<{ showInheritance: boolean }> = ({ showInheritance }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-600">
    {LEGEND_ITEMS
      .filter(i => showInheritance ? i.visual !== 'on' && i.visual !== 'off' : !i.visual.startsWith('inherit') && !i.visual.startsWith('override'))
      .map(i => (
        <span key={i.visual} className="inline-flex items-center gap-1.5" title={i.hint}>
          <CellSwatch visual={i.visual} />
          {i.label}
        </span>
      ))}
  </div>
);

interface ToggleCellProps {
  resolved: ResolvedPermission;
  /** Tầng đang xem có khái niệm Kế thừa/Ghi đè (tab Nhóm, tab Người) */
  showInheritance: boolean;
  /** Ô đang bị ghi đè ở tầng đang xem */
  isOverride: boolean;
  pending: boolean;
  title: string;
  onToggle: () => void;
  onClearOverride?: () => void;
  clearLabel?: string;
}

export const ToggleCell: React.FC<ToggleCellProps> = ({
  resolved, showInheritance, isOverride, pending, title, onToggle, onClearOverride, clearLabel
}) => {
  const locked = resolved.source === 'admin';
  const on = resolved.value;
  const visual: CellVisual = locked
    ? 'locked'
    : !showInheritance
    ? (on ? 'on' : 'off')
    : isOverride
    ? (on ? 'override-on' : 'override-off')
    : (on ? 'inherit-on' : 'inherit-off');
  const icon = 'h-4 w-4';

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={locked}
        onClick={onToggle}
        title={title}
        aria-label={title}
        aria-pressed={on}
        className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${VISUAL_CLASS[visual]} ${pending ? 'opacity-50' : ''}`}
      >
        {locked ? <Lock className={icon} /> : on ? <Check className={`${icon} stroke-[3]`} /> : <X className={`${icon} stroke-[3]`} />}
      </button>
      {showInheritance && isOverride && !locked && onClearOverride && (
        <button
          type="button"
          onClick={onClearOverride}
          title={clearLabel}
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-[#1B3A6B] hover:underline"
        >
          <RotateCcw className="h-2.5 w-2.5" /> Bỏ ghi đè
        </button>
      )}
    </div>
  );
};
