'use client';
import { useEffect, useRef } from 'react';

// The KINI robot mascot (matches the website widget): red robot head, cream
// face, cursor-tracking eyes, and an antenna that wiggles every 5s. Pure inline
// SVG so it's crisp at any size. Keyframes for the antenna are injected once.
const PUPIL_REST = [{ x: 42, y: 57 }, { x: 58, y: 57 }];

let injected = false;
function injectKeyframes() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.textContent = `
@keyframes kini-antenna-wiggle{0%,84%,100%{transform:rotate(0)}87%{transform:rotate(-11deg)}91%{transform:rotate(9deg)}95%{transform:rotate(-5deg)}98%{transform:rotate(2deg)}}
.kini-mascot .kini-antenna{transform-box:fill-box;transform-origin:50% 100%;animation:kini-antenna-wiggle 5s ease-in-out infinite}
.kini-mascot .kini-pupil{transition:transform .12s ease-out}
@media (prefers-reduced-motion:reduce){.kini-mascot .kini-antenna{animation:none}.kini-mascot .kini-pupil{transition:none}}`;
  document.head.appendChild(s);
}

export default function KiniMascot({ size = 40 }: { size?: number }) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    injectKeyframes();
    let raf = 0;
    let mx = -1, my = -1;
    const MAX_X = 2.6, MAX_Y = 2.1, REACH = 260;
    const update = () => {
      raf = 0;
      const svg = ref.current;
      if (!svg || mx < 0 || !svg.getScreenCTM) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pupils = svg.querySelectorAll('.kini-pupil');
      pupils.forEach((p, i) => {
        const rest = PUPIL_REST[i] || PUPIL_REST[0];
        const sx = ctm.a * rest.x + ctm.c * rest.y + ctm.e;
        const sy = ctm.b * rest.x + ctm.d * rest.y + ctm.f;
        const dx = mx - sx, dy = my - sy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const t = Math.min(dist / REACH, 1);
        (p as SVGGElement).setAttribute(
          'transform',
          `translate(${((dx / dist) * MAX_X * t).toFixed(2)},${((dy / dist) * MAX_Y * t).toFixed(2)})`,
        );
      });
    };
    const onMove = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <svg
      ref={ref}
      className="kini-mascot"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}
      aria-hidden="true"
    >
      <g className="kini-antenna">
        <line x1="50" y1="36" x2="50" y2="21" stroke="#D01E2C" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="50" cy="14" r="8.2" fill="#F5F0EA" stroke="#D01E2C" strokeWidth="3" />
        <text x="50" y="14.4" textAnchor="middle" dominantBaseline="central" fontFamily="Manrope,Arial,sans-serif" fontWeight="800" fontSize="9" fill="#D01E2C">K</text>
      </g>
      <rect x="9" y="49" width="11" height="22" rx="5.5" fill="#BE1B27" />
      <rect x="80" y="49" width="11" height="22" rx="5.5" fill="#BE1B27" />
      <rect x="17" y="31" width="66" height="60" rx="19" fill="#D01E2C" />
      <ellipse cx="35" cy="45" rx="13" ry="7" fill="#ffffff" opacity="0.14" />
      <rect x="27" y="42" width="46" height="38" rx="13" fill="#F5F0EA" />
      <ellipse cx="35.5" cy="66" rx="4.3" ry="3.1" fill="#F4A6B0" opacity="0.85" />
      <ellipse cx="64.5" cy="66" rx="4.3" ry="3.1" fill="#F4A6B0" opacity="0.85" />
      <g className="kini-eye"><g className="kini-pupil"><ellipse cx="42" cy="57" rx="5.4" ry="6.6" fill="#0A0E1A" /><circle cx="40" cy="54.6" r="1.7" fill="#fff" /></g></g>
      <g className="kini-eye"><g className="kini-pupil"><ellipse cx="58" cy="57" rx="5.4" ry="6.6" fill="#0A0E1A" /><circle cx="56" cy="54.6" r="1.7" fill="#fff" /></g></g>
      <path d="M42 68 Q50 77 58 68" fill="none" stroke="#0A0E1A" strokeWidth="3.2" strokeLinecap="round" />
      <rect x="41" y="84" width="18" height="3.4" rx="1.7" fill="#B01722" />
    </svg>
  );
}
