import React from 'react';

interface P3ROceanHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export default function P3ROceanHeader({ children, className = '' }: P3ROceanHeaderProps) {
  return (
    <div className={`relative overflow-hidden rounded-b-[2.6rem] bg-gradient-to-b from-[#030B17] via-[#071F3D] to-[#0A335C] text-white shadow-[0_16px_40px_rgba(7,31,61,0.4)] border-b-2 border-cyan-400/30 ${className}`}>
      
      {/* 1. Underwater Caustics Light Ray Sweeps */}
      <div className="absolute -top-10 -left-10 w-[140%] h-[150%] pointer-events-none z-0 overflow-hidden">
        <div className="p3r-caustics-ray w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-400/25 via-sky-500/10 to-transparent"></div>
      </div>

      {/* 2. Rising Wobble Bubbles with Crystal Highlights (8 staggered bubbles) */}
      <div className="water-bubble w-4 h-4 left-[6%] bottom-1 bubble-anim-1"></div>
      <div className="water-bubble w-6 h-6 left-[18%] bottom-2 bubble-anim-2"></div>
      <div className="water-bubble w-3.5 h-3.5 left-[34%] bottom-1 bubble-anim-3"></div>
      <div className="water-bubble w-5.5 h-5.5 left-[48%] bottom-3 bubble-anim-4"></div>
      <div className="water-bubble w-4 h-4 left-[64%] bottom-1 bubble-anim-5"></div>
      <div className="water-bubble w-6.5 h-6.5 left-[76%] bottom-2 bubble-anim-6"></div>
      <div className="water-bubble w-3 h-3 left-[88%] bottom-1 bubble-anim-7"></div>
      <div className="water-bubble w-5 h-5 left-[94%] bottom-3 bubble-anim-8"></div>

      {/* 3. Persona 3 Reload 3-Layer Moving Undulating SVG Waves */}
      <div className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-0 overflow-hidden opacity-75">
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

      {/* 4. Card Content (Foreground) */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
