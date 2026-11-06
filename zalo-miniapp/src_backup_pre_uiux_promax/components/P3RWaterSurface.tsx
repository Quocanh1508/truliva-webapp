import React, { useEffect, useRef } from 'react';

interface P3RWaterSurfaceProps {
  className?: string;
}

export default function P3RWaterSurface({ className = '' }: P3RWaterSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth || 400);
    let height = (canvas.height = canvas.offsetHeight || 220);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    // Persona 3 Reload Organic Water Bubbles
    interface Bubble {
      x: number;
      y: number;
      radius: number;
      speed: number;
      wobbleSpeed: number;
      wobbleAmp: number;
      opacity: number;
      phase: number;
    }

    const bubbles: Bubble[] = Array.from({ length: 12 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 4 + Math.random() * 9,
      speed: 0.35 + Math.random() * 0.55,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
      wobbleAmp: 6 + Math.random() * 12,
      opacity: 0.25 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2
    }));

    let time = 0;

    const render = () => {
      time += 0.02;

      // 1. Base Deep Ocean Persona 3 Gradient (Top Cyan -> Mid Royal Blue -> Deep Abyss)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#00E8FF');     // Bright cyan water surface
      bgGrad.addColorStop(0.18, '#0099FF');  // Aqua blue
      bgGrad.addColorStop(0.42, '#0047B3');  // Vibrant Persona Royal Blue
      bgGrad.addColorStop(0.75, '#002066');  // Deep ocean blue
      bgGrad.addColorStop(1, '#000D2B');     // Midnight ocean abyss
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Underwater Sun Ray Caustics (Tia sáng chiếu từ mặt nước)
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const rayAngle = -0.35 + (i * 0.22) + Math.sin(time * 0.5 + i) * 0.05;
        const rayX = (width * 0.2) + (i * (width * 0.22)) + Math.cos(time * 0.4 + i) * 20;
        
        const rayGrad = ctx.createLinearGradient(rayX, 0, rayX + Math.sin(rayAngle) * height, height);
        rayGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
        rayGrad.addColorStop(0.3, 'rgba(0, 240, 255, 0.12)');
        rayGrad.addColorStop(1, 'rgba(0, 71, 179, 0)');

        ctx.fillStyle = rayGrad;
        ctx.beginPath();
        ctx.moveTo(rayX - 25, 0);
        ctx.lineTo(rayX + 25, 0);
        ctx.lineTo(rayX + Math.sin(rayAngle) * height + 70, height);
        ctx.lineTo(rayX + Math.sin(rayAngle) * height - 70, height);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 3. Top Water Surface Caustics Patches (Các mảng loang ánh sáng mặt nước P3R)
      // Layer 1: Deep Cyan Caustic Blobs
      ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= width; x += 15) {
        const y = 35 + 
          Math.sin(x * 0.02 + time * 1.2) * 12 + 
          Math.cos(x * 0.04 - time * 0.8) * 8 +
          Math.sin(x * 0.08 + time * 1.8) * 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, 0);
      ctx.closePath();
      ctx.fill();

      // Layer 2: Bright Aqua Mid Surface Patches
      ctx.fillStyle = 'rgba(128, 250, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= width; x += 12) {
        const y = 22 + 
          Math.sin(x * 0.025 - time * 1.5) * 10 + 
          Math.cos(x * 0.05 + time * 1.1) * 6;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, 0);
      ctx.closePath();
      ctx.fill();

      // Layer 3: Cel-shaded Light Ripples (Mảng sáng khúc xạ trắng xanh)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= width; x += 10) {
        const y = 12 + 
          Math.sin(x * 0.035 + time * 2.0) * 6 + 
          Math.cos(x * 0.06 - time * 1.4) * 4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, 0);
      ctx.closePath();
      ctx.fill();

      // Layer 4: Floating Organic Caustic Cells (Các vệt sáng nước lấp lánh nổi)
      for (let i = 0; i < 7; i++) {
        const cx = (width * 0.12) + (i * (width * 0.14)) + Math.sin(time + i * 1.5) * 15;
        const cy = 25 + Math.cos(time * 1.3 + i * 2) * 12 + (i % 2 === 0 ? 10 : 0);
        const rw = 22 + Math.sin(time * 0.8 + i) * 6;
        const rh = 10 + Math.cos(time * 0.9 + i) * 4;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, Math.PI / 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 4. Rising P3R Jelly-Like Wobble Bubbles
      bubbles.forEach((b) => {
        b.y -= b.speed;
        b.phase += b.wobbleSpeed;
        const currentX = b.x + Math.sin(b.phase) * b.wobbleAmp;

        // Reset bubble to bottom when reaching top
        if (b.y < -20) {
          b.y = height + 10;
          b.x = Math.random() * width;
        }

        // Draw translucent cel-shaded water bubble
        ctx.save();
        ctx.beginPath();
        ctx.arc(currentX, b.y, b.radius, 0, Math.PI * 2);
        
        // Bubble body
        const bubbleGrad = ctx.createRadialGradient(
          currentX - b.radius * 0.35,
          b.y - b.radius * 0.35,
          b.radius * 0.1,
          currentX,
          b.y,
          b.radius
        );
        bubbleGrad.addColorStop(0, `rgba(255, 255, 255, ${b.opacity * 0.9})`);
        bubbleGrad.addColorStop(0.4, `rgba(0, 240, 255, ${b.opacity * 0.5})`);
        bubbleGrad.addColorStop(0.85, `rgba(0, 71, 179, ${b.opacity * 0.2})`);
        bubbleGrad.addColorStop(1, `rgba(255, 255, 255, ${b.opacity * 0.4})`);

        ctx.fillStyle = bubbleGrad;
        ctx.fill();

        // Bubble glowing rim outline
        ctx.strokeStyle = `rgba(0, 240, 255, ${b.opacity * 0.75})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Bubble top-left glass reflection highlight
        ctx.fillStyle = `rgba(255, 255, 255, ${b.opacity * 0.95})`;
        ctx.beginPath();
        ctx.arc(
          currentX - b.radius * 0.32,
          b.y - b.radius * 0.32,
          b.radius * 0.25,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} 
      style={{ display: 'block' }}
    />
  );
}
