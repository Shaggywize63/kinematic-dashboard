import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Public customer link: never indexed, never leaks the token via the Referer header.
export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PublicInvoiceLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
