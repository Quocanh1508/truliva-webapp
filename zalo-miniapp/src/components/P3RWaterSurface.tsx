import React, { useEffect, useRef } from 'react';

interface P3RWaterSurfaceProps {
  className?: string;
}

// Hạt "tuyết biển" lơ lửng: trôi rất chậm, gần như đứng yên → cảm giác tĩnh lặng dưới đáy biển
interface Mote {
  x: number;
  y: number;
  r: number;
  drift: number;   // px/giây theo chiều dọc (âm = nổi lên)
  sway: number;    // biên độ đung đưa ngang
  phase: number;
  alpha: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
}

/**
 * Nền đại dương sâu, tĩnh lặng: ánh sáng mặt nước dịu, vài tia sáng mờ đung đưa rất chậm,
 * hạt lơ lửng và ít bong bóng. Tôn trọng prefers-reduced-motion (chỉ vẽ 1 khung tĩnh).
 */
export default function P3RWaterSurface({ className = '' }: P3RWaterSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let frameId = 0;
    let width = 390;
    let height = 240;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width || canvas.offsetWidth || 390;
      height = rect.height || canvas.offsetHeight || 240;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const motes: Mote[] = Array.from({ length: 34 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.5 + Math.random() * 1.3,
      drift: -(1.5 + Math.random() * 4),
      sway: 2 + Math.random() * 5,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.15 + Math.random() * 0.35,
    }));
    // Vài bong bóng lớn, rất chậm
    const bubbles: Mote[] = Array.from({ length: 5 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 2 + Math.random() * 2.5,
      drift: -(6 + Math.random() * 6),
      sway: 3 + Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.25 + Math.random() * 0.2,
    }));
    const ripples: Ripple[] = [];

    const onPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= 0 && x <= width && y >= 0 && y <= height) {
        ripples.push({ x, y, radius: 3, maxRadius: Math.min(width * 0.3, 70), opacity: 0.35 });
      }
    };

    const draw = (t: number, dt: number) => {
      // 1. Nước sâu: xanh biển trầm, sáng nhẹ phía mặt nước, tối dần xuống đáy
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#1C5A80');
      bg.addColorStop(0.3, '#123F66');
      bg.addColorStop(0.65, '#0A2A4C');
      bg.addColorStop(1, '#061A33');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // 2. Ánh sáng mặt nước: một quầng rộng, trôi rất chậm (chu kỳ ~1 phút)
      const glowX = width * (0.55 + Math.sin(t * 0.1) * 0.08);
      const glow = ctx.createRadialGradient(glowX, -height * 0.25, 0, glowX, -height * 0.25, height * 1.15);
      glow.addColorStop(0, 'rgba(190, 235, 255, 0.30)');
      glow.addColorStop(0.45, 'rgba(120, 200, 240, 0.10)');
      glow.addColorStop(1, 'rgba(120, 200, 240, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // 3. Tia sáng xuyên nước: 3 dải mờ, rộng, đung đưa rất chậm
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) {
        const sway = Math.sin(t * 0.12 + i * 2.1);
        const topX = width * (0.3 + i * 0.22) + sway * 10;
        const bottomX = topX - width * 0.18 + sway * 22;
        const topW = 14 + i * 4;
        const bottomW = 70 + i * 16;
        const ray = ctx.createLinearGradient(0, 0, 0, height);
        const a = 0.08 + 0.03 * Math.sin(t * 0.18 + i * 1.7);
        ray.addColorStop(0, `rgba(200, 240, 255, ${a})`);
        ray.addColorStop(0.6, `rgba(150, 215, 245, ${a * 0.35})`);
        ray.addColorStop(1, 'rgba(150, 215, 245, 0)');
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(topX - topW, 0);
        ctx.lineTo(topX + topW, 0);
        ctx.lineTo(bottomX + bottomW, height);
        ctx.lineTo(bottomX - bottomW, height);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 4. Gợn mặt nước rất mảnh ở mép trên
      ctx.strokeStyle = 'rgba(210, 240, 255, 0.10)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 8) {
          const y = 10 + k * 9 + Math.sin(x * 0.02 + t * 0.35 + k) * 2.5;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 5. Hạt lơ lửng + bong bóng
      const move = (m: Mote) => {
        m.y += m.drift * dt;
        m.phase += dt * 0.4;
        if (m.y < -6) { m.y = height + 6; m.x = Math.random() * width; }
      };
      for (const m of motes) {
        move(m);
        const x = m.x + Math.sin(m.phase) * m.sway;
        const twinkle = 0.75 + 0.25 * Math.sin(m.phase * 1.7);
        ctx.fillStyle = `rgba(215, 240, 255, ${m.alpha * twinkle})`;
        ctx.beginPath();
        ctx.arc(x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const b of bubbles) {
        move(b);
        const x = b.x + Math.sin(b.phase) * b.sway;
        ctx.strokeStyle = `rgba(210, 240, 255, ${b.alpha})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.6, b.r * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Gợn khi chạm: nhẹ, lan chậm
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.radius += 34 * dt;
        rp.opacity -= 0.28 * dt;
        if (rp.opacity <= 0 || rp.radius >= rp.maxRadius) { ripples.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(210, 240, 255, ${rp.opacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 7. Viền tối mềm hai bên và đáy: gom ánh nhìn vào giữa, giúp chữ trắng dễ đọc
      const vignette = ctx.createRadialGradient(width / 2, height * 0.45, height * 0.3, width / 2, height * 0.45, width * 0.85);
      vignette.addColorStop(0, 'rgba(4, 14, 36, 0)');
      vignette.addColorStop(1, 'rgba(4, 14, 36, 0.45)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    };

    if (reduceMotion) {
      draw(0, 0);
      const redraw = () => { resize(); draw(0, 0); };
      window.addEventListener('resize', redraw);
      return () => window.removeEventListener('resize', redraw);
    }

    let last = performance.now();
    let t = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      t += dt;
      draw(t, dt);
      frameId = requestAnimationFrame(loop);
    };
    const onVisibility = () => {
      cancelAnimationFrame(frameId);
      if (!document.hidden) { last = performance.now(); frameId = requestAnimationFrame(loop); }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('visibilitychange', onVisibility);
    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ display: 'block' }}
    />
  );
}
