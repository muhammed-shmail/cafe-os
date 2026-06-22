'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from '@/components/ui';

/**
 * Compact on-shift status badge for the post-login screens (POS + dashboard).
 *
 * Self-fetches the caller's open attendance punch (`GET /api/attendance`) so the
 * parent passes nothing. The "Out" button clocks the staff out (if on shift) and
 * then ends the session — closing the dangling-punch gap the old logout-only
 * controls left behind. Green styling uses `--cardamom`, which is theme-aware.
 */
export function ShiftStatus({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [clockIn, setClockIn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/attendance')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setClockIn(d?.open?.clockIn ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function out() {
    if (busy) return;
    setBusy(true);
    try {
      if (clockIn) {
        await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'out' }),
        }).catch(() => {});
      }
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  const onShift = !!clockIn;
  const time = clockIn
    ? new Date(clockIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className={`inline-flex items-center rounded-full overflow-hidden shrink-0 ${className}`}
      style={{
        border: `1px solid ${onShift ? 'color-mix(in srgb, var(--cardamom) 38%, var(--line))' : 'var(--line)'}`,
        background: onShift ? 'color-mix(in srgb, var(--cardamom) 12%, var(--paper-2))' : 'var(--paper-2)',
      }}
    >
      <span
        className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 text-[11px] font-bold whitespace-nowrap"
        style={{ color: onShift ? 'var(--cardamom-d)' : 'var(--ink-3)' }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={
            onShift
              ? { background: 'var(--cardamom)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--cardamom) 25%, transparent)', animation: 'pulse 2s infinite' }
              : { background: 'var(--ink-3)' }
          }
        />
        {onShift ? 'On time' : 'Off shift'}
        {time && <span className="tnum hidden min-[380px]:inline" style={{ color: 'var(--ink-2)' }}>· {time}</span>}
      </span>
      <button
        type="button"
        onClick={out}
        disabled={busy}
        aria-label="Clock out and log out"
        title="Clock out & log out"
        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold transition active:scale-95 disabled:opacity-50"
        style={{
          minHeight: 30,
          borderLeft: `1px solid ${onShift ? 'color-mix(in srgb, var(--cardamom) 30%, var(--line))' : 'var(--line)'}`,
          color: 'var(--ink-2)',
        }}
      >
        <LogOut size={13} aria-hidden /> Out
      </button>
    </div>
  );
}
