import React from 'react';
import { Snowflake } from 'lucide-react';
import P3ROceanHeader from './P3ROceanHeader';
import knitBase from '../assets/noel-knit-base.webp';
import knitScene from '../assets/noel-knit-scene.webp';

interface ChristmasKnitHeaderProps {
  children: React.ReactNode;
  className?: string;
  /** true: dải tuần lộc + cây thông (110px); false: chỉ dải viền đan ở đáy (29px) */
  scene?: boolean;
}

// Hết ngày 25/12/2026 (giờ VN) tự về banner nước cũ; class `noel:` ở các trang cũng hết tác dụng theo.
const NOEL_END = Date.parse('2026-12-26T00:00:00+07:00');

// Rải đều ngang màn hình, lệch pha nhau; mỗi bông rơi 14–22 giây
const FLAKES = Array.from({ length: 12 }, (_, i) => ({
  left: `${(i * 37 + 4) % 100}%`,
  size: 8 + ((i * 5) % 7),
  opacity: 0.4 + ((i * 3) % 5) * 0.1,
  animationDuration: `${14 + ((i * 7) % 9)}s`,
  animationDelay: `${-i * 3.1}s`,
}));

// Ảnh sinh bằng scripts/gen_noel_banner.py ở mật độ @3x: nền 504×352, dải cảnh 1008×330.
export default function ChristmasKnitHeader({ children, className = '', scene = false }: ChristmasKnitHeaderProps) {
  if (Date.now() >= NOEL_END) return <P3ROceanHeader className={className}>{children}</P3ROceanHeader>;

  const bandHeight = scene ? 110 : 88 / 3;

  return (
    <div className={`noel relative overflow-hidden rounded-b-[2.6rem] bg-[#5E0A17] text-white shadow-[0_18px_40px_-14px_rgba(70,6,18,0.55)] ${className}`}>
      {/* 1. Nền len đỏ, hoa văn chìm để chữ phía trên dễ đọc */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ bottom: bandHeight, background: `url(${knitBase}) center bottom / 168px auto repeat` }}
        aria-hidden="true"
      />

      {/* 2. Dải họa tiết đan ở đáy */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{ height: bandHeight, background: `url(${knitScene}) center bottom / 336px auto repeat-x` }}
        aria-hidden="true"
      />

      {/* 3. Tối nhẹ phía trên cho thanh trạng thái và nút của Zalo */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent pointer-events-none" aria-hidden="true" />

      {/* 4. Tuyết rơi chậm, nằm sau chữ */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {FLAKES.map(({ left, size, opacity, ...timing }) => (
          <div key={left} className="noel-snow absolute inset-y-0" style={{ left, opacity, ...timing }}>
            <Snowflake size={size} />
          </div>
        ))}
      </div>

      {/* 5. Nội dung */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
