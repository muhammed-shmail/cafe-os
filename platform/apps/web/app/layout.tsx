import type { Metadata, Viewport } from 'next';
import { Fraunces, Hanken_Grotesk, DM_Mono } from 'next/font/google';
import '@cafeos/ui/tokens.css';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600', '700', '900'], variable: '--font-display' });
const body = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-body' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Cafe OS',
  description: 'The Growth Operating System for cafes.',
};

export const viewport: Viewport = {
  themeColor: '#E8902A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
