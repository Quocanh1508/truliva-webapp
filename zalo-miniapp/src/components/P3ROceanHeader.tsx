import React from 'react';
import P3RWaterSurface from './P3RWaterSurface';

interface P3ROceanHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export default function P3ROceanHeader({ children, className = '' }: P3ROceanHeaderProps) {
  return (
    <div className={`relative overflow-hidden rounded-b-[2.6rem] bg-[#0A2A4C] text-white shadow-[0_18px_40px_-14px_rgba(6,26,51,0.55)] ${className}`}>
      {/* 1. Nước sâu tĩnh lặng (canvas) */}
      <P3RWaterSurface className="z-0" />

      {/* 2. Hai lớp sóng đáy rất chậm, mờ */}
      <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <svg
          className="absolute -bottom-1 left-0 w-[200%] h-11 p3r-wave-layer-back fill-[#164A72]/30"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path d="M0,50 C200,80 400,25 600,50 C800,75 1000,25 1200,50 L1200,120 L0,120 Z" />
        </svg>
        <svg
          className="absolute -bottom-0.5 left-0 w-[200%] h-8 p3r-wave-layer-mid fill-[#7CC8EE]/10 stroke-sky-100/15 stroke-1"
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
        >
          <path d="M0,60 C250,90 450,35 650,60 C850,85 1050,35 1200,60 L1200,120 L0,120 Z" />
        </svg>
      </div>

      {/* 3. Viền sáng mảnh ở đáy banner */}
      <div className="absolute bottom-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-sky-200/40 to-transparent pointer-events-none z-10" aria-hidden="true" />

      {/* 4. Nội dung */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
