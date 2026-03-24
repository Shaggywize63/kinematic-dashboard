import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        syne: ['var(--font-syne)', 'sans-serif'],
        sans: ['var(--font-dm-sans)', 'sans-serif'],
      },
      colors: {
        bg:     '#080B12',
        sur:    '#0E1420',
        s2:     '#131B2A',
        s3:     '#1A2438',
        border: '#1E2D45',
        blt:    '#253650',
        red:    '#E01E2C',
        green:  '#00D97E',
        yellow: '#FFB800',
        blue:   '#3E9EFF',
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
