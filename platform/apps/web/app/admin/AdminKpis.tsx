'use client';

import { Stagger, StaggerItem, CountUp } from '@/components/ui/motion';

export type AdminKpi = { label: string; n: number; hint: string; kind: 'num' | 'money' };

const rupees = (paise: number) => '₹' + Math.round(paise / 100).toLocaleString('en-IN');
const count = (x: number) => x.toLocaleString('en-IN');

/** Animated platform KPI grid — staggered entrance + count-up, gold hover glow. */
export function AdminKpis({ kpis }: { kpis: AdminKpi[] }) {
  return (
    <Stagger className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
      {kpis.map((k) => (
        <StaggerItem key={k.label} className="lux-card card-glow p-5">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>{k.label}</p>
          <CountUp value={k.n} format={k.kind === 'money' ? rupees : count} className="font-display text-[34px] leading-tight mt-1 block" />
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>{k.hint}</p>
        </StaggerItem>
      ))}
    </Stagger>
  );
}
