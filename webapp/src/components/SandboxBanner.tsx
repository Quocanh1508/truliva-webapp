import { AlertTriangle, Database } from 'lucide-react';

export const isSandboxEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  const port = window.location.port;
  const host = window.location.hostname;
  return port === '8443' || host.includes('staging') || host.includes('sandbox');
};

export default function SandboxBanner() {
  if (!isSandboxEnvironment()) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 px-3 py-1.5 flex items-center justify-between text-xs font-bold shadow-md sticky top-0 z-[9999] select-none border-b border-amber-600/30">
      <div className="flex items-center gap-2 mx-auto truncate">
        <span className="inline-flex items-center gap-1 bg-black/20 text-slate-950 px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider border border-black/15 shadow-xs shrink-0">
          <AlertTriangle size={13} className="text-amber-950 animate-bounce" />
          SANDBOX TEST
        </span>
        <span className="truncate text-slate-950 tracking-tight">
          Hệ thống thử nghiệm (Cổng 8443) — Cơ sở dữ liệu độc lập, an toàn để kiểm thử
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-amber-950/80 bg-white/20 px-2 py-0.2 rounded-full shrink-0">
          <Database size={11} /> truliva_sandbox
        </span>
      </div>
    </div>
  );
}
