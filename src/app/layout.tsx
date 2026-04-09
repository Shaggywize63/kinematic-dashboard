
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kinematic — Field Force Dashboard',
  description: 'Real-time field force management for Kinematic',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
// Deploy Kick: Thu Apr  9 12:00:15 IST 2026
