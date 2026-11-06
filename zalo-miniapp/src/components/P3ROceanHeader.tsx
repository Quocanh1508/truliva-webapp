import React from 'react';
import P3RWaterSurface from './P3RWaterSurface';

interface P3ROceanHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export default function P3ROceanHeader({ children, className = '' }: P3ROceanHeaderProps) {
  return (
    <div className={`relative overflow-hidden rounded-b-[2.6rem] bg-[#040E24] text-white shadow-[0_20px_50px_-10px_rgba(0,163,255,0.38)] border-b-2 border-cyan-400/50 ${className}`}>
      
      {/* 1. Truliva High-DPI Pure Water & Caustics Engine */}
      <P3RWaterSurface className="z-0" />

      {/* 2. Top Sunlit Ambient Water Bloom */}
      <div 
        className="absolute -top-12 left-1/2 -translate-x-1/2 w-[340px] h-36 bg-gradient-to-b from-cyan-300/35 via-[#00D2FF]/20 to-transparent rounded-full blur-2xl pointer-events-none z-0" 
      />

      {/* 3. Silky Harmonic Wave Flow (Seamless Ambient Water Undulation) */}
      <div className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none z-0 overflow-hidden opacity-75">
        {/* Layer 1: Deep Sapphire Wave */}
        <svg 
          className="absolute -bottom-1 left-0 w-[200%] h-12 p3r-wave-layer-back fill-[#0284C7]/25" 
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none"
        >
          <path d="M0,40 C150,85 350,15 500,50 C650,85 850,15 1000,50 C1100,75 1150,30 1200,40 L1200,120 L0,120 Z" />
        </svg>

        {/* Layer 2: Radiant Glacier Cyan Wave with Shimmer Crest */}
        <svg 
          className="absolute -bottom-0.5 left-0 w-[200%] h-10 p3r-wave-layer-mid fill-[#00D2FF]/30 stroke-cyan-200/40 stroke-1" 
          viewBox="0 0 1200 120" 
          preserveAspectRatio="none"
        >
          <path d="M0,55 C200,95 400,20 600,60 C800,95 1000,20 1200,55 L1200,120 L0,120 Z" />
        </svg>
      </div>

      {/* 4. Bottom Crystal Rim Highlight */}
      <div className="absolute bottom-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent pointer-events-none z-10 shadow-[0_0_12px_rgba(0,210,255,0.8)]" />

      {/* 5. Foreground Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
