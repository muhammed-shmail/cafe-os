import type { ReactNode } from 'react';

/** Indeterminate spinner — inherits currentColor, sized via font-size. */
export function Spinner({ className = '', label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={`inline-flex ${className}`}>
      <span className="spinner" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Shimmer placeholder. Pass width/height via className or style. */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`skeleton block ${className}`} style={style} aria-hidden />;
}

/** Friendly empty state with optional icon + action. */
export function EmptyState({
  icon, title, hint, action, className = '',
}: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 py-12 text-center ${className}`}>
      {icon && <div style={{ color: 'var(--ink-3)' }} className="mb-1">{icon}</div>}
      <p className="font-display text-base font-bold">{title}</p>
      {hint && <p className="max-w-xs text-sm" style={{ color: 'var(--ink-3)' }}>{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

type Tone = 'info' | 'ok' | 'warn' | 'danger';
const TONE: Record<Tone, string> = { info: 'pill-info', ok: 'pill-ok', warn: 'pill-warn', danger: 'pill-danger' };

/** Inline status banner (errors, notices). aria-live so SRs announce it. */
export function Banner({ tone = 'info', icon, children, className = '' }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      className={`${TONE[tone]} flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${className}`}
    >
      {icon && <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>}
      <span className="min-w-0">{children}</span>
    </div>
  );
}
