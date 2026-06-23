'use client';

/**
 * Mobile dashboard navigation — a slide-out drawer (full menu) + a fixed
 * bottom nav bar (key actions). Both are `lg:hidden`; the desktop sidebar in
 * DashboardClient is left untouched. State (activeMenu, drawerOpen) lives in
 * DashboardClient and is threaded in via props so this stays presentational.
 */

import { useEffect, useRef } from 'react';
import { LogOut, Table2, Menu, type LucideIcon } from '@/components/ui';

export type NavItem = { key: string; label: string; icon: LucideIcon };

const ACTIVE_STYLE = {
  background: 'var(--turmeric)',
  color: '#2A1607',
  fontWeight: 700,
  boxShadow: '0 6px 16px -6px color-mix(in srgb, var(--turmeric) 75%, transparent)',
} as const;

/* ---- Slide-out drawer (full menu) -------------------------------------- */
export function MobileDrawer({
  open,
  onClose,
  items,
  activeKey,
  onSelect,
  brand,
  role,
  plan,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  brand: string;
  role: string;
  plan: string;
  onLogout: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);

  // While open: ESC closes, body scroll locks, focus moves into the panel and
  // Tab cycles within it (basic focus trap so all controls stay reachable).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        const first = f[0];
        const last = f[f.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('a[href],button:not([disabled])')?.focus();
    }, 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-[1000] lg:hidden ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        style={{ background: 'var(--scrim)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`absolute left-0 top-0 h-full w-[82%] max-w-[300px] flex flex-col gap-1 p-4 overflow-y-auto no-scrollbar transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'var(--paper-2)',
          borderRight: '1px solid var(--line)',
          paddingLeft: 'calc(1rem + env(safe-area-inset-left))',
          paddingTop: 'calc(1rem + env(safe-area-inset-top))',
        }}
      >
        <div className="flex items-center gap-2.5 px-2 py-3 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo chaya one.png"
            alt="ChayaOne"
            style={{ width: 96, height: 'auto', maxWidth: '100%' }}
            className="shrink-0 object-contain"
          />
          <div className="leading-tight min-w-0">
            <b className="block text-sm truncate">{brand}</b>
            <span className="text-xs capitalize" style={{ color: 'var(--ink-3)' }}>
              {role}
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {items.map((m) => {
            const on = activeKey === m.key || (m.key === 'settings' && activeKey === 'reports');
            const Ic = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => {
                  onSelect(m.key);
                  onClose();
                }}
                aria-current={on ? 'page' : undefined}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition ${
                  on ? '' : 'hover:bg-[var(--paper-3)]'
                }`}
                style={on ? ACTIVE_STYLE : { color: 'var(--ink-2)' }}
              >
                <Ic size={18} aria-hidden className="shrink-0" />
                {m.label}
              </button>
            );
          })}
        </nav>

        <a
          href="/pos"
          target="_blank"
          className="flex items-center gap-2 px-3 py-2 mt-1 text-sm rounded-xl transition font-bold"
          style={{ color: 'var(--turmeric-d)' }}
        >
          <Table2 size={16} aria-hidden /> Open Till (POS)
        </a>

        <div className="card p-3 mt-1" style={{ background: 'var(--paper-3)' }}>
          <b className="text-sm capitalize">{plan} plan</b>
          <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>
            14 days left in trial
          </span>
          <button className="btn btn-primary w-full" style={{ padding: '8px' }}>
            Upgrade
          </button>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-3 py-2 mt-1 text-sm text-left rounded-xl transition"
          style={{ color: 'var(--ink-3)' }}
        >
          <LogOut size={16} aria-hidden /> Log out
        </button>
      </aside>
    </div>
  );
}

/* ---- Fixed bottom nav (key actions) ------------------------------------ */
export function BottomNav({
  items,
  activeKey,
  onSelect,
  onMore,
  drawerOpen,
  liveOrders = 0,
}: {
  items: NavItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  onMore: () => void;
  drawerOpen: boolean;
  liveOrders?: number;
}) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-[60] grid lg:hidden"
      style={{
        gridTemplateColumns: `repeat(${items.length + 1}, 1fr)`,
        background: 'color-mix(in srgb, var(--paper-2) 92%, transparent)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--line)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Primary"
    >
      {items.map((m) => {
        const on = !drawerOpen && activeKey === m.key;
        const Ic = m.icon;
        return (
          <button
            key={m.key}
            onClick={() => onSelect(m.key)}
            aria-current={on ? 'page' : undefined}
            className="relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition"
            style={{ minHeight: 58, color: on ? 'var(--turmeric-d)' : 'var(--ink-3)' }}
          >
            <span className="relative">
              <Ic size={21} aria-hidden />
              {m.key === 'orders' && liveOrders > 0 && (
                <span
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 grid place-items-center rounded-full text-[9px] font-extrabold text-white"
                  style={{ background: 'var(--clay)' }}
                >
                  {liveOrders > 9 ? '9+' : liveOrders}
                </span>
              )}
            </span>
            <span className="leading-none">{m.label}</span>
            {on && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-full"
                style={{ background: 'var(--turmeric)' }}
              />
            )}
          </button>
        );
      })}
      <button
        onClick={onMore}
        aria-current={drawerOpen ? 'page' : undefined}
        aria-haspopup="dialog"
        className="relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold transition"
        style={{ minHeight: 58, color: drawerOpen ? 'var(--turmeric-d)' : 'var(--ink-3)' }}
      >
        <Menu size={21} aria-hidden />
        <span className="leading-none">More</span>
        {drawerOpen && (
          <span
            className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-full"
            style={{ background: 'var(--turmeric)' }}
          />
        )}
      </button>
    </nav>
  );
}
