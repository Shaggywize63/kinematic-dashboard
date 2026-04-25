import type { Config } from 'tailwindcss';

// Kinematic Brand Identity v1.0 — see BRAND.md
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        // Brand families — Manrope (display), Inter (body), JetBrains Mono (data)
        display: ['var(--font-manrope)', 'Manrope', 'Segoe UI', 'Helvetica Neue', 'Roboto', 'Arial', 'sans-serif'],
        sans:    ['var(--font-inter)', 'Inter', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        mono:    ['var(--font-jetbrains)', 'JetBrains Mono', 'SF Mono', 'Consolas', 'Menlo', 'Courier New', 'monospace'],
        // Legacy aliases (kept for backwards compatibility during the rollout)
        syne:    ['var(--font-manrope)', 'Manrope', 'sans-serif'],
      },
      colors: {
        // Brand primaries
        'k-red':    '#D01E2C',  // Kinematic Red — Pantone 186 C
        'k-ink':    '#0A0E1A',  // Kinematic Ink — Pantone Black 6 C
        'k-paper':  '#FFFFFF',  // Paper White
        // Brand secondaries
        'k-navy':   '#0E1A2E',  // Deep Navy — Pantone 5395 C
        'k-stone':  '#FAFAFB',  // Stone
        'k-rule':   '#E4E6EB',  // Rule Grey
        // Functional (product UI only — never marketing)
        'k-success': '#0A8A4E',
        'k-caution': '#C97A00',
        'k-info':    '#0066FF',
        // Legacy product UI tokens (mapped to brand)
        bg:     '#0E1A2E',
        sur:    '#0E1420',
        s2:     '#131B2A',
        s3:     '#1A2438',
        border: '#1E2D45',
        blt:    '#253650',
        red:    '#D01E2C',
        green:  '#0A8A4E',
        yellow: '#C97A00',
        blue:   '#0066FF',
        purple: '#9B6EFF',
        teal:   '#00CEC9',
        white:  '#E8EDF8',
        gray:   '#7A8BA0',
        grayd:  '#2E445E',
      },
      animation: {
        'fade-in':  'fadeIn 0.3s ease both',
        'fade-up':  'fadeUp 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-dot':'pulseDot 2s infinite',
        'spin-slow':'spin 0.7s linear infinite',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeUp:   { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp:  { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
      },
    },
  },
  plugins: [],
};

export default config;
