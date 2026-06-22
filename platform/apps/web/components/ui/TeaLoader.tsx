'use client';

/**
 * Chaya One tea loader — a cup that fills with gold tea while steam rises.
 * Premium replacement for the plain "Loading…" text. Pure CSS, brand palette,
 * respects reduced motion (steam/fill settle to a static filled cup).
 */
export function TeaLoader({ label = 'Brewing…', size = 56 }: { label?: string; size?: number }) {
  return (
    <div className="tea-load" role="status" aria-live="polite">
      <div className="tea-cup" style={{ width: size, height: Math.round(size * 0.86) }} aria-hidden>
        <span className="tea-steam"><i /><i /><i /></span>
        <span className="tea-body"><span className="tea-fill" /></span>
        <span className="tea-handle" />
      </div>
      {label && <span className="tea-cap">{label}</span>}
      <style>{css}</style>
    </div>
  );
}

const css = `
.tea-load { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; }
.tea-cup { position: relative; }
.tea-body {
  position: absolute; inset: auto 14% 0 0; height: 78%; width: 72%;
  border: 2px solid var(--line-2); border-top: none;
  border-radius: 6px 6px 16px 16px / 6px 6px 22px 22px;
  background: var(--paper-3); overflow: hidden;
}
.tea-fill {
  position: absolute; left: 0; right: 0; bottom: 0; height: 0;
  background: var(--gold-grad, linear-gradient(180deg, #E6C463, #C99A2E));
  animation: tea-rise 1.8s cubic-bezier(.25,.8,.25,1) infinite;
}
.tea-handle {
  position: absolute; right: 8%; top: 26%; width: 22%; height: 42%;
  border: 2px solid var(--line-2); border-left: none; border-radius: 0 12px 12px 0;
}
.tea-steam { position: absolute; left: 0; right: 22%; top: -34%; bottom: auto; display: flex; justify-content: center; gap: 18%; }
.tea-steam i {
  width: 3px; height: 16px; border-radius: 3px; background: var(--ink-3); opacity: 0;
  animation: tea-steam 1.8s ease-in-out infinite;
}
.tea-steam i:nth-child(2) { animation-delay: .3s; }
.tea-steam i:nth-child(3) { animation-delay: .6s; }
.tea-cap { font-size: 13px; color: var(--ink-3); font-weight: 600; }
@keyframes tea-rise { 0% { height: 8%; } 55% { height: 82%; } 100% { height: 8%; } }
@keyframes tea-steam {
  0% { opacity: 0; transform: translateY(4px) scaleY(.6); }
  40% { opacity: .55; }
  100% { opacity: 0; transform: translateY(-10px) scaleY(1.1); }
}
@media (prefers-reduced-motion: reduce) {
  .tea-fill { animation: none; height: 64%; }
  .tea-steam i { animation: none; opacity: .35; }
}
`;
