import React, { useState } from 'react';
import { Users, UserPlus, X, LogOut, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import { fetchZaloApi } from '../api/client';

const MAX_MEMBERS = 5;

interface Member {
  id: string;
  phone: string;
  name: string | null;
}

interface Props {
  serial: any;
  onChanged: () => void | Promise<void>;
}

const formatPhone = (p: string) => (p.length === 10 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p);

/**
 * Người dùng chung máy:
 * - Chủ máy (serial.canShare): xem / thêm / gỡ số điện thoại người nhà.
 * - Người được chia sẻ (serial.isShared): biết máy của ai, có thể tự rời khỏi máy.
 */
export default function DeviceSharingPanel({ serial, onChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; title: string; body: string; action: string } | null>(null);

  const members: Member[] = serial?.members || [];
  const full = members.length >= MAX_MEMBERS;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = phone.replace(/\D/g, '');
    if (!/^0[35789]\d{8}$/.test(clean)) {
      setError('Nhập số di động 10 chữ số, ví dụ 0912 345 678.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetchZaloApi('/zalo-miniapp/serial-members', {
        method: 'POST',
        body: JSON.stringify({ serialId: serial.id, phone: clean }),
      });
      setPhone('');
      setAdding(false);
      setNotice(`Đã thêm ${formatPhone(clean)}. Người này mở Truliva trên Zalo là thấy máy.`);
      await onChanged();
    } catch (err: any) {
      setError(err.message || 'Không thêm được, vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await fetchZaloApi(`/zalo-miniapp/serial-members/${confirm.id}`, { method: 'DELETE' });
      setNotice(serial.isShared ? null : 'Đã gỡ người dùng chung.');
      setConfirm(null);
      await onChanged();
    } catch (err: any) {
      setConfirm(null);
      setNotice(err.message || 'Không gỡ được, vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDialog = confirm && (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-confirm-title"
    >
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-5 space-y-4">
        <div className="space-y-1.5">
          <h3 id="share-confirm-title" className="font-extrabold text-base text-slate-900">{confirm.title}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{confirm.body}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setConfirm(null)}
            disabled={busy}
            className="min-h-11 rounded-2xl bg-slate-100 text-slate-700 text-sm font-bold active:scale-[0.98] transition-transform cursor-pointer"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="min-h-11 rounded-2xl bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform cursor-pointer disabled:opacity-70"
          >
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {confirm.action}
          </button>
        </div>
      </div>
    </div>
  );

  // Máy người khác chia sẻ cho mình
  if (serial?.isShared) {
    return (
      <section className="bg-sky-50/70 border border-sky-100 rounded-3xl p-4 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-white text-[#0284C7] border border-sky-100 shrink-0" aria-hidden="true">
          <Users size={18} />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-bold text-slate-900">
            Máy được chia sẻ {serial.ownerPhoneMasked ? <>bởi <span className="font-mono">{serial.ownerPhoneMasked}</span></> : 'với bạn'}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Bạn xem được tình trạng máy, lõi lọc và gửi yêu cầu hỗ trợ cho máy này.
          </p>
          <button
            type="button"
            onClick={() => setConfirm({
              id: serial.membershipId,
              title: 'Rời khỏi máy này?',
              body: 'Máy sẽ không còn hiện trong Mini App của bạn. Chủ máy có thể thêm lại bạn sau.',
              action: 'Rời khỏi',
            })}
            className="min-h-11 -ml-1 px-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-rose-600 cursor-pointer"
          >
            <LogOut size={14} aria-hidden="true" />
            Rời khỏi máy này
          </button>
          {notice && <p className="text-xs font-semibold text-rose-600" role="alert">{notice}</p>}
        </div>
        {confirmDialog}
      </section>
    );
  }

  // Máy chỉ suy ra từ đơn hàng, chưa có bản ghi serial thật → chưa chia sẻ được
  if (!serial?.canShare) {
    if (typeof serial?.id === 'string' && serial.id.startsWith('order-')) {
      return (
        <p className="text-xs text-slate-500 px-1 flex items-center gap-1.5">
          <Users size={13} aria-hidden="true" />
          Kích hoạt bảo hành cho máy để chia sẻ với người nhà.
        </p>
      );
    }
    return null;
  }

  return (
    <section aria-labelledby={`share-title-${serial.id}`} className="bg-white border border-sky-100 rounded-3xl p-4 space-y-3 shadow-[0_4px_20px_rgba(27,58,107,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-sky-100 text-[#1B3A6B] rounded-xl shrink-0" aria-hidden="true">
            <Users size={15} />
          </div>
          <h3 id={`share-title-${serial.id}`} className="font-bold text-sm text-slate-900">Người dùng chung</h3>
        </div>
        <span className="text-xs font-semibold text-slate-500 shrink-0">{members.length}/{MAX_MEMBERS} người</span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed flex gap-1.5">
        <ShieldCheck size={14} className="text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
        <span>Người nhà đăng nhập Zalo bằng số của họ sẽ xem được tình trạng máy và lõi lọc. Họ không xem được địa chỉ hay đơn hàng của bạn.</span>
      </p>

      {members.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
          {members.map(m => (
            <li key={m.id} className="flex items-center gap-3 pl-3 pr-1 py-1.5">
              <div className="w-9 h-9 rounded-full bg-sky-50 text-[#0284C7] font-bold text-sm flex items-center justify-center shrink-0" aria-hidden="true">
                {(m.name || '#').trim().charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{m.name || 'Chưa đăng nhập Mini App'}</p>
                <p className="text-xs text-slate-500 font-mono">{formatPhone(m.phone)}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirm({
                  id: m.id,
                  title: `Gỡ ${formatPhone(m.phone)}?`,
                  body: 'Người này sẽ không xem được máy nữa. Bạn có thể thêm lại bất cứ lúc nào.',
                  action: 'Gỡ',
                })}
                aria-label={`Gỡ ${formatPhone(m.phone)} khỏi máy`}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite">
        {notice && (
          <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 flex items-start gap-1.5">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            {notice}
          </p>
        )}
      </div>

      {adding ? (
        <form onSubmit={submit} noValidate className="space-y-2">
          <label htmlFor={`share-phone-${serial.id}`} className="block text-xs font-bold text-slate-700">
            Số điện thoại người nhà (đăng ký Zalo)
          </label>
          <input
            id={`share-phone-${serial.id}`}
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            autoFocus
            maxLength={13}
            value={phone}
            onChange={e => { setPhone(e.target.value); setError(null); }}
            placeholder="0912 345 678"
            aria-invalid={!!error}
            aria-describedby={error ? `share-error-${serial.id}` : undefined}
            className={`w-full min-h-11 px-3 rounded-2xl border text-base text-slate-900 bg-white outline-none focus:ring-2 ${
              error ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200 focus:border-[#0284C7] focus:ring-sky-100'
            }`}
          />
          {error && (
            <p id={`share-error-${serial.id}`} role="alert" className="text-xs font-semibold text-rose-600">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setAdding(false); setPhone(''); setError(null); }}
              disabled={busy}
              className="min-h-11 rounded-2xl bg-slate-100 text-slate-700 text-sm font-bold cursor-pointer"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-2xl bg-[#1B3A6B] text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform cursor-pointer disabled:opacity-70"
            >
              {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              Thêm
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => { setAdding(true); setNotice(null); }}
          disabled={full}
          className="w-full min-h-11 rounded-2xl border border-dashed border-sky-300 text-[#0284C7] text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-sky-50 active:scale-[0.99] transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UserPlus size={16} aria-hidden="true" />
          {full ? `Đã đủ ${MAX_MEMBERS} người` : 'Thêm người nhà'}
        </button>
      )}

      {confirmDialog}
    </section>
  );
}
