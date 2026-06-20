import type { MetadataRoute } from 'next';

/**
 * Web app manifest — makes the customer PWA installable ("Add to Home Screen").
 * Next serves this at /manifest.webmanifest and injects the <link> automatically.
 * Uses a static SVG icon (public/icon.svg) — works in dev (Turbopack) and prod,
 * unlike @vercel/og which breaks under Turbopack on Windows.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ChayaOne — your cafe',
    short_name: 'ChayaOne',
    description: 'Order, earn points, and play — right from your table.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6EFE3',
    theme_color: '#15110D',
    icons: [
      { src: '/fib icon.jpg', sizes: 'any', type: 'image/jpeg', purpose: 'any' },
      { src: '/fib icon.jpg', sizes: 'any', type: 'image/jpeg', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Order now', short_name: 'Order', url: '/app' },
      { name: 'My rewards', short_name: 'Rewards', url: '/app?tab=rewards' },
    ],
  };
}
