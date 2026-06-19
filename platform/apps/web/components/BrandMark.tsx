import type { CSSProperties } from 'react';

/**
 * Chaya One animated brand mark — the steaming-cup wordmark (intro.mp4, with
 * intro.gif as the first-frame poster). One source of truth so the login screen
 * and the PWA loader show an identical, correctly-proportioned logo.
 *
 * The clip ships with a light-grey backdrop. We lift it toward white with a
 * brightness/contrast filter, then `mix-blend-multiply` drops white into the
 * paper surface — so only the mark remains, with no grey video frame. It's
 * contained (never cropped) and centred by default.
 */
export function BrandMark({ size = 200, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  return (
    <video
      src="/intro.mp4"
      poster="/intro.gif"
      autoPlay
      loop
      muted
      playsInline
      aria-label="Chaya One"
      className={className}
      style={{
        width: size,
        maxWidth: '72%',
        height: 'auto',
        display: 'block',
        margin: '0 auto',
        // lift grey backdrop → white, then multiply it away into the paper
        filter: 'brightness(1.32) contrast(1.34) saturate(1.06)',
        mixBlendMode: 'multiply',
        ...style,
      }}
    />
  );
}
