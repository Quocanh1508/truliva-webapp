import React, { useEffect, useRef } from 'react';

interface P3RWaterSurfaceProps {
  className?: string;
}

interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobbleSpeed: number;
  wobbleAmp: number;
  opacity: number;
  phase: number;
  isForeground: boolean;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  speed: number;
}

export default function P3RWaterSurface({ className = '' }: P3RWaterSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    const setupCanvasSize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      width = rect.width || canvas.offsetWidth || 390;
      height = rect.height || canvas.offsetHeight || 220;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    };

    setupCanvasSize();
    window.addEventListener('resize', setupCanvasSize);

    // 2-Tier Natural Micro-Bubbles (Deep Bokeh + Crisp Foreground)
    const bubbles: Bubble[] = Array.from({ length: 22 }, (_, idx) => {
      const isForeground = idx % 2 === 0;
      return {
        x: Math.random() * (width || 390),
        y: Math.random() * (height || 220),
        radius: isForeground ? 2.2 + Math.random() * 3.5 : 5.5 + Math.random() * 5.5,
        speed: isForeground ? 0.45 + Math.random() * 0.55 : 0.25 + Math.random() * 0.35,
        wobbleSpeed: 0.015 + Math.random() * 0.025,
        wobbleAmp: isForeground ? 3 + Math.random() * 6 : 6 + Math.random() * 10,
        opacity: isForeground ? 0.45 + Math.random() * 0.45 : 0.18 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
        isForeground
      };
    });

    // Interactive Touch / Tap Water Ripples
    const ripples: Ripple[] = [];

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      if (x >= 0 && x <= width && y >= 0 && y <= height) {
        ripples.push({
          x,
          y,
          radius: 4,
          maxRadius: Math.min(width * 0.4, 90),
          opacity: 0.65,
          speed: 1.8
        });
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);

    let time = 0;
    let isVisible = true;

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let lastTime = performance.now();

    const render = (now: number) => {
      if (!isVisible) return;

      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      time += delta * 1.35;

      // ── 1. BASE OCEANIC FLUID GRADIENT (Crystalline Aqua → Truliva Royal Navy → Midnight Abyss) ──
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#00F0FF');      // Luminous glacier cyan water surface
      bgGrad.addColorStop(0.16, '#00A8FF');   // Crystal aqua blue
      bgGrad.addColorStop(0.42, '#0052D4');   // Truliva royal sapphire
      bgGrad.addColorStop(0.72, '#0B2559');   // Deep ocean navy
      bgGrad.addColorStop(1, '#040E24');      // Midnight oceanic abyss
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // ── 2. ETHEREAL TOP SUNLIGHT BLOOM (Glow at surface) ──
      const sunX = width * 0.38 + Math.sin(time * 0.3) * 25;
      const sunBloom = ctx.createRadialGradient(sunX, -20, 10, sunX, 50, width * 0.65);
      sunBloom.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
      sunBloom.addColorStop(0.35, 'rgba(0, 242, 254, 0.22)');
      sunBloom.addColorStop(0.75, 'rgba(0, 168, 255, 0.08)');
      sunBloom.addColorStop(1, 'rgba(0, 82, 212, 0)');
      ctx.fillStyle = sunBloom;
      ctx.fillRect(0, 0, width, height);

      // ── 3. VOLUMETRIC CAUSTIC GOD RAYS (Screen Blend Mode for luminous realism) ──
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      const rayCount = 4;
      for (let i = 0; i < rayCount; i++) {
        const rayAngle = -0.3 + (i * 0.18) + Math.sin(time * 0.4 + i * 1.5) * 0.04;
        const originX = (width * 0.15) + (i * (width * 0.24)) + Math.cos(time * 0.35 + i) * 18;
        const beamTopWidth = 18 + Math.sin(time * 0.5 + i) * 6;
        const beamBottomWidth = 65 + Math.cos(time * 0.45 + i) * 15;
        const endX = originX + Math.sin(rayAngle) * height;

        const rayGrad = ctx.createLinearGradient(originX, 0, endX, height * 0.95);
        rayGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
        rayGrad.addColorStop(0.25, 'rgba(0, 240, 255, 0.18)');
        rayGrad.addColorStop(0.65, 'rgba(0, 168, 255, 0.06)');
        rayGrad.addColorStop(1, 'rgba(0, 82, 212, 0)');

        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(originX - beamTopWidth, 0);
        ctx.lineTo(originX + beamTopWidth, 0);
        ctx.lineTo(endX + beamBottomWidth, height);
        ctx.lineTo(endX - beamBottomWidth, height);
        ctx.closePath();
        ctx.fill();
      }

      // ── 4. ORGANIC SURFACE CAUSTIC DISPERSION (Shimmering Light Ripples) ──
      // Caustic Mesh Band 1: Cyan Shimmer
      ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= width; x += 12) {
        const y = 30 + 
          Math.sin(x * 0.022 + time * 1.1) * 10 + 
          Math.cos(x * 0.045 - time * 0.75) * 6 +
          Math.sin(x * 0.08 + time * 1.6) * 3;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, 0);
      ctx.closePath();
      ctx.fill();

      // Caustic Mesh Band 2: Bright White-Aqua Crest
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= width; x += 10) {
        const y = 16 + 
          Math.sin(x * 0.028 - time * 1.3) * 7 + 
          Math.cos(x * 0.055 + time * 0.9) * 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, 0);
      ctx.closePath();
      ctx.fill();

      // Soft Floating Caustic Nodes (Sun Glints through water)
      for (let i = 0; i < 6; i++) {
        const cx = (width * 0.14) + (i * (width * 0.15)) + Math.sin(time * 0.7 + i * 1.8) * 20;
        const cy = 24 + Math.cos(time * 0.9 + i * 2.2) * 12 + (i % 2 === 0 ? 8 : -4);
        const rw = 26 + Math.sin(time * 0.6 + i) * 8;
        const rh = 12 + Math.cos(time * 0.7 + i) * 4;

        const causticSpot = ctx.createRadialGradient(cx, cy, 2, cx, cy, rw);
        causticSpot.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        causticSpot.addColorStop(0.4, 'rgba(0, 242, 254, 0.25)');
        causticSpot.addColorStop(1, 'rgba(0, 168, 255, 0)');

        ctx.fillStyle = causticSpot;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, Math.PI / 10, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // ── 5. EXPANDING WATER RIPPLES (Interactive Touch Delight) ──
      for (let rIdx = ripples.length - 1; rIdx >= 0; rIdx--) {
        const rp = ripples[rIdx];
        rp.radius += rp.speed;
        rp.opacity -= 0.016;

        if (rp.opacity <= 0 || rp.radius >= rp.maxRadius) {
          ripples.splice(rIdx, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${rp.opacity * 0.85})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rp.x, rp.y, Math.max(1, rp.radius * 0.65), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${rp.opacity * 0.6})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // ── 6. PRISMATIC MICRO-BUBBLES (Layered Depth & Specular Reflections) ──
      bubbles.forEach((b) => {
        b.y -= b.speed;
        b.phase += b.wobbleSpeed;
        const currentX = b.x + Math.sin(b.phase) * b.wobbleAmp;

        // Reset bubble to bottom when reaching the top surface
        if (b.y < -15) {
          b.y = height + 10 + Math.random() * 15;
          b.x = Math.random() * width;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(currentX, b.y, b.radius, 0, Math.PI * 2);

        if (b.isForeground) {
          // Sharp Crystal Micro-Bubble
          const bubbleGrad = ctx.createRadialGradient(
            currentX - b.radius * 0.35,
            b.y - b.radius * 0.35,
            b.radius * 0.1,
            currentX,
            b.y,
            b.radius
          );
          bubbleGrad.addColorStop(0, `rgba(255, 255, 255, ${b.opacity * 0.95})`);
          bubbleGrad.addColorStop(0.35, `rgba(0, 242, 254, ${b.opacity * 0.6})`);
          bubbleGrad.addColorStop(0.8, `rgba(0, 114, 255, ${b.opacity * 0.25})`);
          bubbleGrad.addColorStop(1, `rgba(255, 255, 255, ${b.opacity * 0.5})`);

          ctx.fillStyle = bubbleGrad;
          ctx.fill();

          // Delicate Glowing Rim
          ctx.strokeStyle = `rgba(0, 242, 254, ${b.opacity * 0.85})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Tiny Specular Diamond Highlight on top-left
          ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity * 0.98})`;
          ctx.beginPath();
          ctx.arc(
            currentX - b.radius * 0.34,
            b.y - b.radius * 0.34,
            Math.max(0.8, b.radius * 0.25),
            0,
            Math.PI * 2
          );
          ctx.fill();
        } else {
          // Soft Ambient Bokeh Bubble (Deep Layer)
          const bokehGrad = ctx.createRadialGradient(
            currentX,
            b.y,
            b.radius * 0.15,
            currentX,
            b.y,
            b.radius
          );
          bokehGrad.addColorStop(0, `rgba(255, 255, 255, ${b.opacity * 0.6})`);
          bokehGrad.addColorStop(0.5, `rgba(0, 210, 255, ${b.opacity * 0.4})`);
          bokehGrad.addColorStop(1, `rgba(0, 82, 212, 0)`);

          ctx.fillStyle = bokehGrad;
          ctx.fill();
        }

        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', setupCanvasSize);
      window.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className={`absolute inset-0 w-full h-full pointer-events-auto ${className}`} 
      style={{ display: 'block' }}
    />
  );
}
