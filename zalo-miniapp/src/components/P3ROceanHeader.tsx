import React from 'react';
import P3RWaterSurface from './P3RWaterSurface';

interface P3ROceanHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export default function P3ROceanHeader({ children, className = '' }: P3ROceanHeaderProps) {
  return (
    <div className={`relative overflow-hidden rounded-b-[2.6rem] bg-[#000D2B] text-white shadow-[0_16px_40px_rgba(0,13,43,0.5)] border-b-2 border-cyan-400/40 ${className}`}>
      
      {/* 1. Exact Persona 3 Reload Dynamic Water Surface & Caustics Canvas Engine */}
      <P3RWaterSurface className="z-0" />

      {/* 2. Persona 3 Reload 3-Layer Moving Undulating SVG Wave Overlay */}
      <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-0 overflow-hidden opacity-60">
        {/* Back Wave (Deep Cyan / Navy) */}
        <svg 
          className="absolute -bottom-1 left-0 w-[200%] h-14 p3r-wave-layer-back fill-[#0284C7]/30" 
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none"
        >
          <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,-30 1200,40 L1200,120 L0,120 Z" />
        </svg>

        {/* Mid Wave (Vibrant Aqua Cyan) */}
        <svg 
          className="absolute -bottom-1 left-0 w-[200%] h-12 p3r-wave-layer-mid fill-[#00D2FF]/25" 
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none"
        >
          <path d="M0,30 C200,110 400,-20 600,60 C800,130 1000,-10 1200,50 L1200,120 L0,120 Z" />
        </svg>

        {/* Front Wave (Surface Shimmer Light) */}
        <svg 
          className="absolute -bottom-0.5 left-0 w-[200%] h-10 p3r-wave-layer-front fill-[#E0F7FF]/20" 
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none"
        >
          <path d="M0,50 C300,120 500,10 700,70 C900,130 1100,20 1200,60 L1200,120 L0,120 Z" />
        </svg>
      </div>

      {/* 3. Card Content (Foreground with subtle backdrop readability) */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

