import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Hanken_Grotesk, DM_Mono } from 'next/font/google';
import '@cafeos/ui/tokens.css';
import './globals.css';

// Display: Cormorant Garamond — couture serif for headings (high-contrast,
// read at weight ≥500). Body: Hanken Grotesk. Numbers/receipts: DM Mono.
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600', '700'], style: ['normal', 'italic'], display: 'swap', variable: '--font-display' });
const body = Hanken_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-body' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400', '500'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Cafe OS',
  description: 'The Growth Operating System for cafes.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F6EFE3' },
    { media: '(prefers-color-scheme: dark)', color: '#15110D' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // respect notch / safe areas on mobile PWA
};

/* Set the persisted theme before first paint to avoid a light→dark flash. */
const noFlashTheme = `(function(){try{var t=localStorage.getItem('cafe-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        {/* Runs before body paints → sets data-theme on <html> with no flash.
            Kept out of a manual <head> so Next.js still injects global CSS links. */}
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
        {children}
      </body>
    </html>
  );
}
