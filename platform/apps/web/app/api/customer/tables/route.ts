import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { resolveTable } from '@/lib/customer';
import { readPwaConfig } from '@/lib/pwa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/tables?t=<token>  — public, for the PWA's manual table
 * fallback when a QR has no table info. Resolves the outlet from the token (or
 * the demo fallback) and returns its tables as { token, label } so the guest can
 * pick one; selecting re-opens the app at `?t=<token>`. Public-safe: only the
 * token + label leave the server (the token is already printed on the table).
 */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t');
  const table = await resolveTable(t);
  if (!table) return NextResponse.json({ error: 'outlet_not_found' }, { status: 404 });

  const [tables, outlet] = await Promise.all([
    prisma.tableMap.findMany({ where: { outletId: table.outlet.id }, orderBy: { label: 'asc' }, select: { label: true, qrToken: true } }),
    prisma.outlet.findUnique({ where: { id: table.outlet.id }, select: { settings: true } }),
  ]);
  const cfg = readPwaConfig(outlet?.settings);

  return NextResponse.json({
    outlet: { name: table.outlet.name.split('—')[0]?.trim() ?? table.outlet.name },
    welcomePrefix: cfg.table.welcomePrefix,
    allowManualPick: cfg.table.allowManualPick,
    tables: tables.map((x) => ({ token: x.qrToken, label: x.label })),
  });
}
