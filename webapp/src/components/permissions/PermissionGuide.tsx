import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen, X, Layers, Grid3x3, Users, Building2, User, Sparkles, RefreshCw, Lightbulb,
  ShieldAlert, HelpCircle, Code2, ArrowDown, Lock, RotateCcw, Filter, CheckCheck
} from 'lucide-react';
import { CellSwatch } from './ToggleCell';
import { LEGEND_ITEMS } from './legend';
import type { SystemModule } from '../../config/permissions';

export type GuideSectionId =
  | 'overview' | 'tiers' | 'legend' | 'roles' | 'groups' | 'users'
  | 'new-features' | 'sync' | 'recipes' | 'best-practices' | 'faq' | 'developer';

const SECTIONS: { id: GuideSectionId; title: string; icon: React.ReactNode }[] = [
  { id: 'overview', title: 'Tổng quan', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'tiers', title: 'Cơ chế 3 tầng & thứ tự ưu tiên', icon: <Layers className="h-4 w-4" /> },
  { id: 'legend', title: 'Cách đọc một ô quyền', icon: <Grid3x3 className="h-4 w-4" /> },
  { id: 'roles', title: 'Tab Theo Chức danh', icon: <Users className="h-4 w-4" /> },
  { id: 'groups', title: 'Tab Theo Nhóm', icon: <Building2 className="h-4 w-4" /> },
  { id: 'users', title: 'Tab Theo Người', icon: <User className="h-4 w-4" /> },
  { id: 'new-features', title: 'Tính năng mới & duyệt quyền', icon: <Sparkles className="h-4 w-4" /> },
  { id: 'sync', title: 'Đồng bộ tự động', icon: <RefreshCw className="h-4 w-4" /> },
  { id: 'recipes', title: 'Tình huống thường gặp', icon: <Lightbulb className="h-4 w-4" /> },
  { id: 'best-practices', title: 'Nguyên tắc & lưu ý quan trọng', icon: <ShieldAlert className="h-4 w-4" /> },
  { id: 'faq', title: 'Câu hỏi thường gặp', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'developer', title: 'Dành cho Dev', icon: <Code2 className="h-4 w-4" /> }
];

/* ── Khối trình bày ── */
const H: React.FC<{ id: GuideSectionId; children: React.ReactNode }> = ({ id, children }) => {
  const s = SECTIONS.find(x => x.id === id)!;
  return (
    <h3 id={`guide-${id}`} className="scroll-mt-4 flex items-center gap-2 text-base font-bold text-[#1B3A6B] pt-2">
      <span className="p-1.5 rounded-lg bg-blue-50 text-[#1B3A6B]">{s.icon}</span>
      {children}
    </h3>
  );
};
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[13px] leading-relaxed text-slate-700">{children}</p>
);
const Steps: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol className="space-y-1.5">
    {items.map((it, i) => (
      <li key={i} className="flex gap-2.5 text-[13px] text-slate-700 leading-relaxed">
        <span className="shrink-0 h-5 w-5 rounded-full bg-[#1B3A6B] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
        <span>{it}</span>
      </li>
    ))}
  </ol>
);
const Note: React.FC<{ tone?: 'info' | 'warn' | 'tip'; title: string; children: React.ReactNode }> = ({ tone = 'info', title, children }) => {
  const cls = tone === 'warn'
    ? 'bg-amber-50 border-amber-200 text-amber-900'
    : tone === 'tip'
    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : 'bg-blue-50 border-blue-200 text-blue-900';
  return (
    <div className={`border rounded-xl p-3 text-[12.5px] leading-relaxed ${cls}`}>
      <div className="font-bold mb-0.5">{title}</div>
      <div>{children}</div>
    </div>
  );
};
const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 align-middle">{children}</span>
);

interface PermissionGuideProps {
  open: boolean;
  initialSection?: GuideSectionId;
  onClose: () => void;
  roles: { key: string; label: string }[];
  modules: SystemModule[];
  featureCount: number;
}

export const PermissionGuide: React.FC<PermissionGuideProps> = ({ open, initialSection, onClose, roles, modules, featureCount }) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<GuideSectionId>('overview');

  const goTo = (id: GuideSectionId) => {
    setActive(id);
    bodyRef.current?.querySelector(`#guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!open) return;
    const target = initialSection || 'overview';
    requestAnimationFrame(() => {
      setActive(target);
      bodyRef.current?.querySelector(`#guide-${target}`)?.scrollIntoView({ block: 'start' });
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, initialSection, onClose]);

  // Theo dõi mục đang đọc để tô sáng mục lục
  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const top = body.getBoundingClientRect().top;
    let current: GuideSectionId = 'overview';
    for (const s of SECTIONS) {
      const el = body.querySelector(`#guide-${s.id}`);
      if (el && el.getBoundingClientRect().top - top <= 80) current = s.id;
    }
    setActive(current);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Hướng dẫn sử dụng Ma trận Phân quyền"
        className="h-full w-full max-w-5xl bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-[#1B3A6B] to-[#2563EB] text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl"><BookOpen className="h-5 w-5" /></div>
            <div>
              <div className="font-bold text-sm">Hướng dẫn sử dụng Ma trận Phân quyền</div>
              <div className="text-[11px] text-blue-100">Dành cho quản trị viên • Đọc 5 phút để nắm toàn bộ cơ chế</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/15" aria-label="Đóng hướng dẫn">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Mục lục */}
          <nav className="hidden md:block w-60 shrink-0 border-r border-slate-100 bg-slate-50/60 p-3 overflow-y-auto">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-2">Mục lục</div>
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(s.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-xs font-semibold transition-colors ${
                  active === s.id ? 'bg-white text-[#1B3A6B] shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-white/70'
                }`}
              >
                <span className="text-slate-400 w-4 text-right">{i + 1}.</span>
                {s.title}
              </button>
            ))}
          </nav>

          {/* Nội dung */}
          <div ref={bodyRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 md:px-8 py-6 space-y-5">
            {/* 1. Tổng quan */}
            <H id="overview">1. Tổng quan</H>
            <P>
              Ma trận Phân quyền quyết định <strong>ai được xem và thao tác tính năng nào</strong> trên Truliva.
              Mỗi <strong>dòng</strong> là một tính năng (ví dụ "Xuất Excel danh sách đơn hàng"), mỗi <strong>cột</strong> là
              một đối tượng được cấp quyền. Hiện hệ thống có <strong>{featureCount} tính năng</strong> chia thành {modules.length} nhóm chức năng
              và <strong>{roles.length} chức danh</strong>: {roles.map(r => r.label).join(', ')}.
            </P>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { t: 'Lưu tức thì', d: 'Mỗi lần bấm một ô là lưu ngay vào hệ thống, không cần nút "Lưu".' },
                { t: 'Máy chủ áp dụng ngay', d: 'Các thao tác gọi lên máy chủ được kiểm tra quyền mới ngay lập tức.' },
                { t: 'Menu cập nhật khi tải lại', d: 'Người dùng đang mở web cần tải lại trang (F5) để thấy menu/nút thay đổi.' }
              ].map(x => (
                <div key={x.t} className="border border-slate-200 rounded-xl p-3">
                  <div className="font-bold text-xs text-slate-900">{x.t}</div>
                  <div className="text-[12px] text-slate-600 mt-1">{x.d}</div>
                </div>
              ))}
            </div>
            <Note title="Ai được chỉnh ma trận?">
              Chỉ tài khoản có chức danh <strong>Admin</strong> mới được bật/tắt quyền. Các tài khoản khác dù xem được trang này cũng không lưu được thay đổi.
            </Note>

            {/* 2. 3 tầng */}
            <H id="tiers">2. Cơ chế 3 tầng & thứ tự ưu tiên</H>
            <P>
              Quyền của một người được xác định bằng cách kiểm tra lần lượt từ <strong>trên xuống dưới</strong>. Tầng nào có cấu hình
              trước thì dùng tầng đó và <strong>dừng lại</strong>, không xét các tầng bên dưới nữa.
            </P>
            <div className="space-y-1.5">
              {[
                { n: '0', t: 'Admin', d: 'Admin luôn có toàn bộ quyền (trừ nhóm "Công cụ Dev"). Không cần và không thể cấu hình.', c: 'bg-rose-50 border-rose-200 text-rose-800', i: <Lock className="h-4 w-4" /> },
                { n: '1', t: 'Cá nhân (tab Theo Người)', d: 'Ghi đè riêng cho đúng 1 tài khoản. Ưu tiên cao nhất.', c: 'bg-emerald-50 border-emerald-200 text-emerald-800', i: <User className="h-4 w-4" /> },
                { n: '2', t: 'Nhóm (tab Theo Nhóm)', d: 'Ghi đè cho cặp Chức danh + Nhóm, ví dụ "Saler thuộc nhóm eCom".', c: 'bg-indigo-50 border-indigo-200 text-indigo-800', i: <Building2 className="h-4 w-4" /> },
                { n: '3', t: 'Chức danh (tab Theo Chức danh)', d: 'Quyền gốc cho mọi tài khoản cùng chức danh.', c: 'bg-blue-50 border-blue-200 text-blue-800', i: <Users className="h-4 w-4" /> },
                { n: '4', t: 'Mặc định hệ thống', d: 'Giá trị do đội Dev đặt sẵn khi tạo tính năng; chỉ dùng khi chưa có cấu hình nào.', c: 'bg-slate-50 border-slate-200 text-slate-700', i: <Code2 className="h-4 w-4" /> }
              ].map((x, i, arr) => (
                <React.Fragment key={x.n}>
                  <div className={`flex items-start gap-3 border rounded-xl p-3 ${x.c}`}>
                    <span className="shrink-0 mt-0.5">{x.i}</span>
                    <div>
                      <div className="font-bold text-xs">Bước {x.n} — {x.t}</div>
                      <div className="text-[12px] mt-0.5 opacity-90">{x.d}</div>
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div className="flex items-center gap-2 pl-4 text-[10px] text-slate-400">
                      <ArrowDown className="h-3 w-3" /> nếu chưa có cấu hình ở tầng này thì xét tầng dưới
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
            <Note tone="tip" title="Ví dụ">
              Chị Lan là <strong>Saler</strong> thuộc nhóm <strong>eCom</strong>. Chức danh Saler <em>tắt</em> "Xuất Excel đơn hàng",
              nhưng nhóm "Saler • eCom" được ghi đè <em>bật</em> → chị Lan <strong>được</strong> xuất Excel. Nếu Admin ghi đè riêng
              cho chị Lan là <em>tắt</em> → chị Lan <strong>không được</strong>, dù cả nhóm eCom vẫn được.
            </Note>
            <Note title="Nhóm của một người lấy từ đâu?">
              Từ trường <strong>"Nhóm"</strong> trong hồ sơ tài khoản (tab Danh sách Nhân viên). Tên nhóm phải khớp chính xác
              (phân biệt chữ hoa/thường), ví dụ "DT South" khác "DT south".
            </Note>

            {/* 3. Legend */}
            <H id="legend">3. Cách đọc một ô quyền</H>
            <div className="grid sm:grid-cols-2 gap-2">
              {LEGEND_ITEMS.map(i => (
                <div key={i.visual} className="flex items-center gap-3 border border-slate-200 rounded-xl p-2.5">
                  <CellSwatch visual={i.visual} size="md" />
                  <div>
                    <div className="font-bold text-xs text-slate-900">{i.label}</div>
                    <div className="text-[11px] text-slate-500">{i.hint}</div>
                  </div>
                </div>
              ))}
            </div>
            <P>
              <strong>Kế thừa</strong> (viền nét đứt) nghĩa là ô đó chưa có cấu hình riêng và đang dùng giá trị của tầng trên.
              <strong> Ghi đè</strong> (viền vàng) nghĩa là ô đó có cấu hình riêng, không còn đi theo tầng trên nữa. Rê chuột lên ô
              bất kỳ để xem giải thích chi tiết.
            </P>

            {/* 4. Roles */}
            <H id="roles">4. Tab "Theo Chức danh"</H>
            <P>Dùng để đặt <strong>quyền gốc</strong>. Đây là nơi nên cấu hình phần lớn quyền.</P>
            <Steps items={[
              <>Chọn tab <Kbd><Users className="h-3 w-3" /> Theo Chức danh</Kbd>.</>,
              <>Tìm dòng tính năng (dùng ô <strong>Tìm kiếm</strong>, gõ không dấu cũng được).</>,
              <>Bấm vào ô giao giữa dòng tính năng và cột chức danh để bật <CellSwatch visual="on" /> / tắt <CellSwatch visual="off" />.</>,
              <>Thay đổi áp dụng cho <strong>mọi tài khoản</strong> thuộc chức danh đó, <em>trừ</em> những người/nhóm đang có ghi đè riêng.</>
            ]} />
            <Note title="Cột Admin bị khóa">
              Ô <CellSwatch visual="locked" /> ở cột Admin không bấm được vì Admin luôn có quyền. Riêng các tính năng gắn nhãn <strong>DEV</strong>
              (Công cụ Dev) thì Admin cũng phải được bật thủ công.
            </Note>

            {/* 5. Groups */}
            <H id="groups">5. Tab "Theo Nhóm"</H>
            <P>Dùng khi một phòng ban/khu vực cần khác với quyền chung của chức danh.</P>
            <Steps items={[
              <>Chọn tab <Kbd><Building2 className="h-3 w-3" /> Theo Nhóm</Kbd>, sau đó chọn <strong>Chức danh</strong> ở ô chọn bên phải (mỗi chức danh có bộ nhóm riêng).</>,
              <>Mỗi cột là một nhóm. Ô <CellSwatch visual="inherit-on" /> <CellSwatch visual="inherit-off" /> là đang kế thừa từ chức danh.</>,
              <>Bấm vào ô để tạo <strong>ghi đè</strong> cho nhóm đó → ô chuyển thành <CellSwatch visual="override-on" /> hoặc <CellSwatch visual="override-off" />.</>,
              <>Muốn quay về theo chức danh: bấm <Kbd><RotateCcw className="h-3 w-3" /> Bỏ ghi đè</Kbd> ngay dưới ô.</>,
              <>Muốn xóa mọi ghi đè của một nhóm: bấm nhãn <Kbd>N ghi đè ↺</Kbd> ở đầu cột nhóm.</>
            ]} />
            <Note tone="warn" title="Thêm nhóm mới">
              Nút <strong>"Thêm nhóm"</strong> chỉ thêm một cột tạm thời để cấu hình. Cột chỉ được lưu lại khi bạn tạo ít nhất 1 ghi đè.
              Tên nhóm phải trùng khớp với trường "Nhóm" của tài khoản thì mới có tác dụng.
            </Note>

            {/* 6. Users */}
            <H id="users">6. Tab "Theo Người"</H>
            <P>Dùng cho <strong>ngoại lệ cá nhân</strong>, ví dụ cấp tạm quyền cho một người hoặc khóa riêng một người.</P>
            <Steps items={[
              <>Chọn tab <Kbd><User className="h-3 w-3" /> Theo Người</Kbd>.</>,
              <>Gõ tên, username hoặc email (tối thiểu 2 ký tự) vào ô <strong>Tìm nhân viên</strong>, hoặc chọn từ danh sách <strong>"Người đã có quyền riêng"</strong>.</>,
              <>Cột <strong>Quyền hiệu lực</strong> là quyền thực tế người đó đang có. Bấm để ghi đè.</>,
              <>Cột <strong>Nguồn</strong> cho biết quyền đến từ đâu: "Kế thừa từ Nhóm…", "Kế thừa từ Chức danh…" hoặc "Ghi đè riêng".</>,
              <>Bấm <Kbd><RotateCcw className="h-3 w-3" /> Khôi phục mặc định</Kbd> để bỏ ghi đè 1 quyền, hoặc nút <strong>"Khôi phục tất cả"</strong> để bỏ toàn bộ ghi đè của người đó.</>
            ]} />
            <Note tone="tip" title="Mẹo kiểm tra">
              Khi ai đó báo "không thấy menu X" hoặc "bị báo không có quyền", hãy mở tab Theo Người, chọn người đó và xem cột <strong>Nguồn</strong>.
              Bạn sẽ biết ngay quyền bị tắt ở tầng nào.
            </Note>

            {/* 7. New features */}
            <H id="new-features">7. Tính năng mới & duyệt quyền</H>
            <P>
              Khi đội Dev phát hành tính năng mới, hệ thống <strong>tự động</strong> tạo quyền mặc định cho tính năng đó (Admin luôn có quyền,
              các chức danh khác theo đề xuất của Dev) và hiển thị <strong>banner vàng</strong> ở đầu trang để Admin kiểm tra.
              Các dòng tính năng mới có nhãn <span className="text-[10px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded-md">MỚI</span>.
            </P>
            <Steps items={[
              <>Bấm <Kbd><Filter className="h-3 w-3" /> Lọc xem ngay</Kbd> trên banner để chỉ hiển thị các tính năng mới.</>,
              <>Kiểm tra quyền mặc định ở từng cột. Chỉnh lại nếu cần. <strong>Chỉnh bất kỳ ô nào</strong> trên dòng sẽ tự đánh dấu dòng đó đã duyệt.</>,
              <>Nếu quyền mặc định đã ổn: bấm <Kbd><CheckCheck className="h-3 w-3" /> Duyệt</Kbd> trên từng dòng, hoặc <Kbd>Áp dụng quyền mặc định & Đánh dấu đã duyệt</Kbd> cho tất cả.</>
            ]} />
            <Note title="Đánh dấu đã duyệt có thay đổi quyền không?">
              <strong>Không.</strong> Nó chỉ tắt nhãn MỚI. Quyền mặc định đã được áp dụng từ lúc tính năng ra mắt.
            </Note>

            {/* 8. Sync */}
            <H id="sync">8. Đồng bộ tự động</H>
            <P>
              Mỗi lần máy chủ khởi động, hệ thống tự quét danh mục tính năng và bổ sung quyền cho tính năng mới. Nút
              <Kbd><RefreshCw className="h-3 w-3" /> Đồng bộ</Kbd> ở đầu trang làm việc này thủ công và tải lại ma trận.
            </P>
            <Note tone="tip" title="An toàn tuyệt đối với cấu hình cũ">
              Đồng bộ <strong>chỉ thêm</strong> quyền cho tính năng chưa từng có trong hệ thống. Nó <strong>không bao giờ</strong> sửa hay xóa
              bất kỳ ô nào Admin đã cấu hình. Bạn có thể bấm bao nhiêu lần cũng được.
            </Note>

            {/* 9. Recipes */}
            <H id="recipes">9. Tình huống thường gặp</H>
            <div className="space-y-3">
              {[
                {
                  q: 'Cho toàn bộ Saler được xuất Excel đơn hàng',
                  a: <>Tab <strong>Theo Chức danh</strong> → dòng "Xuất Excel danh sách đơn hàng" → bật ô ở cột <strong>Saler</strong>.</>
                },
                {
                  q: 'Chỉ Saler nhóm eCom được đồng bộ Pancake, Saler nhóm khác thì không',
                  a: <>Tab <strong>Theo Chức danh</strong>: tắt quyền cho Saler. Sau đó tab <strong>Theo Nhóm</strong> → chọn chức danh Saler → bật ô ở cột <strong>eCom</strong>.</>
                },
                {
                  q: 'Tạm khóa 1 nhân viên không cho hủy đơn',
                  a: <>Tab <strong>Theo Người</strong> → tìm nhân viên → tắt dòng "Hủy đơn & Hủy đơn hàng loạt". Khi mở lại: bấm <strong>Khôi phục mặc định</strong>.</>
                },
                {
                  q: 'Nhân viên chuyển chức danh hoặc chuyển nhóm',
                  a: <>Quyền theo chức danh/nhóm mới tự áp dụng. Riêng các <strong>ghi đè cá nhân</strong> cũ vẫn được giữ, nên hãy vào tab Theo Người kiểm tra và khôi phục nếu không còn cần.</>
                },
                {
                  q: 'Muốn biết một nhóm đang khác chức danh ở những điểm nào',
                  a: <>Tab <strong>Theo Nhóm</strong> → chọn chức danh → tích <strong>"Chỉ hiện quyền bị ghi đè"</strong>.</>
                }
              ].map(r => (
                <div key={r.q} className="border border-slate-200 rounded-xl p-3">
                  <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5 text-amber-500" /> {r.q}</div>
                  <div className="text-[12.5px] text-slate-600 mt-1 leading-relaxed">{r.a}</div>
                </div>
              ))}
            </div>

            {/* 10. Best practices */}
            <H id="best-practices">10. Nguyên tắc & lưu ý quan trọng</H>
            <ul className="space-y-2 text-[13px] text-slate-700 leading-relaxed list-disc pl-5">
              <li><strong>Cấu hình từ rộng đến hẹp:</strong> Chức danh trước, Nhóm khi cần khác biệt theo phòng ban, Cá nhân chỉ cho ngoại lệ.</li>
              <li><strong>Hạn chế ghi đè cá nhân.</strong> Càng nhiều ghi đè càng khó kiểm soát. Định kỳ rà danh sách "Người đã có quyền riêng".</li>
              <li><strong>Ghi đè sẽ "đóng băng" giá trị.</strong> Một ô đã ghi đè sẽ không đổi theo khi chức danh thay đổi. Nếu giá trị ghi đè trùng với kế thừa, hãy bấm "Bỏ ghi đè" cho gọn.</li>
              <li><strong>Nguyên tắc tối thiểu:</strong> chỉ cấp quyền cần cho công việc, đặc biệt với các quyền Xuất Excel, Hủy đơn, Lương, Quản lý tài khoản.</li>
            </ul>
            <Note tone="warn" title="Một số chức năng còn được máy chủ kiểm tra theo chức danh cố định">
              Với vài khu vực nhạy cảm (ví dụ Lương, Kho, cấu hình Trợ lý AI, IoT, Quản lý tài khoản), máy chủ còn kiểm tra thêm chức danh.
              Nếu bạn bật quyền cho một chức danh khác mà người dùng thấy menu nhưng thao tác báo <strong>"không có quyền"</strong>,
              hãy liên hệ đội Dev để mở rộng ở phía máy chủ.
            </Note>

            {/* 11. FAQ */}
            <H id="faq">11. Câu hỏi thường gặp</H>
            <div className="space-y-2">
              {[
                { q: 'Tôi đã bật quyền nhưng nhân viên vẫn không thấy menu?', a: 'Nhờ nhân viên tải lại trang (F5) hoặc đăng nhập lại. Nếu vẫn không thấy, kiểm tra cột Nguồn ở tab Theo Người — có thể nhóm hoặc cá nhân đang ghi đè tắt.' },
                { q: 'Bấm nhầm thì sao?', a: 'Bấm lại ô đó để đảo lại. Ở tab Nhóm/Người có thể bấm "Bỏ ghi đè" để quay về đúng như trước khi ghi đè.' },
                { q: 'Ô bấm xong bị quay lại trạng thái cũ?', a: 'Lưu không thành công (mất mạng hoặc hết phiên đăng nhập). Hệ thống tự hoàn tác ô đó và báo lỗi. Hãy thử lại.' },
                { q: 'Vì sao có tính năng gắn nhãn DEV?', a: 'Đó là công cụ kỹ thuật dành cho đội phát triển. Mặc định chỉ chức danh Dev có quyền, kể cả Admin cũng không tự có.' },
                { q: 'Đổi tên nhóm có làm mất cấu hình không?', a: 'Cấu hình của tên nhóm cũ vẫn được giữ, nhưng sẽ không còn ai khớp với nó. Cần cấu hình lại cho tên nhóm mới vì tên phải khớp chính xác.' }
              ].map(f => (
                <details key={f.q} className="group border border-slate-200 rounded-xl p-3 open:bg-slate-50/60">
                  <summary className="cursor-pointer list-none font-bold text-xs text-slate-900 flex items-center justify-between gap-2">
                    {f.q}
                    <span className="text-slate-400 group-open:rotate-45 transition-transform text-base leading-none">+</span>
                  </summary>
                  <div className="text-[12.5px] text-slate-600 mt-2 leading-relaxed">{f.a}</div>
                </details>
              ))}
            </div>

            {/* 12. Developer */}
            <H id="developer">12. Dành cho Dev: thêm tính năng mới vào ma trận</H>
            <Steps items={[
              <>Khai báo tính năng trong <code className="text-[11px] bg-slate-100 px-1 rounded">src/config/permissions.ts</code> (nguồn duy nhất): <code className="text-[11px] bg-slate-100 px-1 rounded">key</code>, <code className="text-[11px] bg-slate-100 px-1 rounded">module</code>, <code className="text-[11px] bg-slate-100 px-1 rounded">defaultRoles</code>, <code className="text-[11px] bg-slate-100 px-1 rounded">addedAt</code> = ngày phát hành.</>,
              <>Chạy <code className="text-[11px] bg-slate-100 px-1 rounded">npm run perm:gen</code> để sinh bản cho webapp (tự chạy khi <code className="text-[11px] bg-slate-100 px-1 rounded">npm run build</code>/<code className="text-[11px] bg-slate-100 px-1 rounded">dev</code>).</>,
              <>Frontend: dùng <code className="text-[11px] bg-slate-100 px-1 rounded">hasPermission('KEY')</code> hoặc <code className="text-[11px] bg-slate-100 px-1 rounded">{'<ProtectedRoute featureKey="KEY" />'}</code>. Backend: <code className="text-[11px] bg-slate-100 px-1 rounded">requirePermission('KEY')</code>.</>,
              <>Deploy & khởi động lại backend → quyền mặc định được tự thêm, banner "tính năng mới" xuất hiện cho Admin duyệt.</>
            ]} />
            <div className="grid sm:grid-cols-2 gap-2 pt-1">
              {modules.map(m => (
                <div key={m.id} className="text-[11px] border border-slate-200 rounded-lg px-2.5 py-1.5 flex justify-between gap-2">
                  <span className="text-slate-700">{m.name}</span>
                  <code className="text-slate-400">{m.id}</code>
                </div>
              ))}
            </div>
            <div className="h-10" />
          </div>
        </div>
      </aside>
    </div>
  );
};
