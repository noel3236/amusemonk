import type { Metadata } from 'next';
import { Manrope, IBM_Plex_Mono } from 'next/font/google';
import { Providers, Toaster } from '@/ui';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'amusemonk', template: '%s · amusemonk' },
  description: 'Bulk payouts from a file, paid exactly once.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
