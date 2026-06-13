import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { formatINR } from '@cafeos/core';
import { getSession } from '@/lib/auth';
import { getDashboardData } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ q: z.string().min(1).max(500) });

/**
 * POST /api/dashboard/assistant — the Owner Dashboard's Sales Assistant.
 *
 * Owner/manager only. Answers are grounded in the SAME live analytics the
 * dashboard renders, so the numbers always agree with the tiles. This is an
 * intentionally deterministic responder; swapping in a Claude (Opus 4.8) call
 * is a drop-in replacement here — feed `data` as context and return the reply.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const data = await getDashboardData(session.outletId);
  const reply = answer(parsed.data.q, data);
  return NextResponse.json({ reply });
}

function answer(qRaw: string, d: Awaited<ReturnType<typeof getDashboardData>>): string {
  const q = qRaw.toLowerCase();
  const { kpi, topItems, hourly, menuQuadrant, lowStock, loyalty } = d;
  const peak = hourly.indexOf(Math.max(...hourly));
  const peakStr = Math.max(...hourly) > 0 ? `${fmtHour(peak)}–${fmtHour((peak + 1) % 24)}` : null;

  // sales / performance
  if (/(sales|why|up|down|today|how.*doing|revenue)/.test(q)) {
    if (kpi.todayOrders === 0)
      return `No orders have settled today yet, so there's nothing to compare. As soon as the till rings up sales they'll show here — today's total, order count, AOV and footfall all update live.`;
    const dir =
      kpi.salesDeltaPct == null
        ? 'with no prior day to compare against'
        : kpi.salesDeltaPct >= 0
          ? `<b>${kpi.salesDeltaPct}% ahead</b> of yesterday`
          : `<b>${Math.abs(kpi.salesDeltaPct)}% behind</b> yesterday`;
    return `Today you've done <b>${formatINR(kpi.todaySalesPaise)}</b> across <b>${kpi.todayOrders}</b> orders (AOV ${formatINR(kpi.aovPaise)}), ${dir}.${peakStr ? ` Your strongest hour tends to be <b>${peakStr}</b>.` : ''}${topItems[0] ? ` ${topItems[0].name} is leading the mix.` : ''} <span class="msg-act">Tip: keep an upsell prompt on the hero item at the till.</span>`;
  }

  // what to promote
  if (/(promote|tonight|push|feature|special)/.test(q)) {
    const puzzle = menuQuadrant.find((m) => m.quad === 'puzzle');
    const dog = menuQuadrant.find((m) => m.quad === 'dog');
    if (!puzzle && !topItems[0])
      return `Once a few orders land I can read the menu mix and tell you exactly what to push. Right now there isn't enough sales data to rank items.`;
    if (puzzle)
      return `Feature <b>${puzzle.name}</b> — it's a <b>Puzzle</b> (high margin, low volume), so every extra sale is high-value. Put it on the PWA home${dog ? ` and pair it with <b>${dog.name}</b> to revive a slow line` : ''}.${peakStr ? ` Time the push just before your <b>${peakStr}</b> peak.` : ''} <span class="msg-act">I can draft the PWA banner + a WhatsApp blast.</span>`;
    return `Lean on <b>${topItems[0]!.name}</b> tonight — it already has momentum, so a small "today only" nudge converts well. <span class="msg-act">I can draft the PWA banner.</span>`;
  }

  // win-back / loyalty
  if (/(win|back|lapsed|loyal|retain|repeat|customer)/.test(q)) {
    return `You have <b>${loyalty.customers}</b> known customers, ${loyalty.repeatPct}% of them repeat visitors, holding <b>${loyalty.pointsLiability.toLocaleString('en-IN')} points</b> in outstanding liability. A targeted WhatsApp win-back to lapsed Gold guests typically recovers ~40%. <span class="msg-act">Draft: "We miss you ☕ Here's ₹50 off — valid 7 days."</span>`;
  }

  // inventory
  if (/(stock|inventory|reorder|ingredient|low)/.test(q)) {
    if (lowStock.length === 0)
      return `Inventory looks healthy — nothing is at or below its reorder level right now.`;
    const names = lowStock.map((s) => `<b>${s.name}</b> (${s.qty})`).join(', ');
    return `${lowStock.length} item${lowStock.length === 1 ? '' : 's'} need attention: ${names}. <span class="msg-act">I can raise a draft purchase order for these.</span>`;
  }

  // busiest time
  if (/(busy|peak|hour|when|time|rush|staff|roster)/.test(q)) {
    if (!peakStr) return `Not enough order history yet to spot a reliable peak. Check back after a full day of trade.`;
    return `Over the last 7 days your busiest window is <b>${peakStr}</b>. Schedule your strongest staff and finish prep just before it. <span class="msg-act">I can suggest a roster around that peak.</span>`;
  }

  // fallback
  return `Here's the snapshot: <b>${formatINR(kpi.todaySalesPaise)}</b> today across ${kpi.todayOrders} orders, AOV ${formatINR(kpi.aovPaise)}, footfall ${kpi.footfall}. Ask me about <b>sales</b>, <b>what to promote</b>, <b>win-back</b>, <b>inventory</b>, or your <b>busiest hours</b>.`;
}

const fmtHour = (h: number) =>
  h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
