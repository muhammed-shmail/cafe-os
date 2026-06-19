import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { readFloors, readTableFloors, type Floor } from '@/lib/floors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboard/floor — manage the dine-in floor: tables, their seat
 * counts and the QR token each table carries for the customer PWA scan-to-order
 * flow (`/app?t=<qrToken>`). Owner/manager only.
 *
 *   { action: 'create',     label, seats? }
 *   { action: 'update',     id, label?, seats?, state? }
 *   { action: 'delete',     id }
 *   { action: 'regenerate', id }                 // rotate the QR token (old printout dies)
 *   { action: 'bulk',       count, prefix?, seats? }
 *
 * Each table's QR token is the only secret on the printed code; rotating it is
 * how an owner invalidates a leaked/old sticker without touching the others.
 */

const STATES = ['free', 'seated', 'billed'] as const;

/** short, URL-safe, collision-resistant token for a table QR. */
const newToken = () => crypto.randomUUID().replace(/-/g, '').slice(0, 14);

const cleanLabel = (v: unknown) => String(v ?? '').trim().slice(0, 24);
const cleanSeats = (v: unknown, fallback = 2) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : fallback;
};

/** Read the outlet's settings JSON (floors + table→floor map live here). */
async function readSettings(outletId: string) {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } });
  return (outlet?.settings as Record<string, unknown>) ?? {};
}
/** Merge a partial patch back into Outlet.settings. */
async function writeSettings(outletId: string, current: Record<string, unknown>, patch: Record<string, unknown>) {
  await prisma.outlet.update({ where: { id: outletId }, data: { settings: { ...current, ...patch } as Prisma.InputJsonValue } });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const outletId = session.outletId;
  const body = await req.json().catch(() => ({}));
  const audit = (action: string, entityId: string | null, after?: unknown) =>
    prisma.auditLog.create({
      data: { outletId, actorId: session.staffId, action, entity: 'table', entityId, after: (after ?? {}) as Prisma.InputJsonValue },
    }).catch(() => {});

  // ============================ floors / areas ============================
  // floors + the table→floor map live in Outlet.settings (no schema change).
  if (body.action === 'floor_add') {
    const name = cleanLabel(body.name);
    if (!name) return NextResponse.json({ error: 'missing_label' }, { status: 400 });
    const settings = await readSettings(outletId);
    const floors = readFloors(settings);
    if (floors.some((f) => f.name.toLowerCase() === name.toLowerCase())) return NextResponse.json({ error: 'duplicate_label' }, { status: 409 });
    const floor: Floor = { id: crypto.randomUUID(), name, sort: floors.length };
    await writeSettings(outletId, settings, { floors: [...floors, floor] });
    await audit('floor.created', floor.id, floor);
    return NextResponse.json({ ok: true, floor });
  }

  if (body.action === 'floor_rename') {
    const floorId = String(body.floorId ?? '');
    const name = cleanLabel(body.name);
    if (!floorId || !name) return NextResponse.json({ error: 'missing_label' }, { status: 400 });
    const settings = await readSettings(outletId);
    const floors = readFloors(settings);
    if (floors.some((f) => f.id !== floorId && f.name.toLowerCase() === name.toLowerCase())) return NextResponse.json({ error: 'duplicate_label' }, { status: 409 });
    const next = floors.map((f) => (f.id === floorId ? { ...f, name } : f));
    await writeSettings(outletId, settings, { floors: next });
    await audit('floor.renamed', floorId, { name });
    return NextResponse.json({ ok: true, floors: next });
  }

  if (body.action === 'floor_delete') {
    const floorId = String(body.floorId ?? '');
    if (!floorId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    const settings = await readSettings(outletId);
    const floors = readFloors(settings).filter((f) => f.id !== floorId);
    // unassign any tables that pointed at the removed floor (they become "Unassigned")
    const map = readTableFloors(settings);
    for (const [tid, fid] of Object.entries(map)) if (fid === floorId) delete map[tid];
    await writeSettings(outletId, settings, { floors, tableFloors: map });
    await audit('floor.deleted', floorId);
    return NextResponse.json({ ok: true, floors });
  }

  if (body.action === 'assign') {
    const tableId = String(body.id ?? '');
    if (!tableId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    const exists = await prisma.tableMap.findFirst({ where: { id: tableId, outletId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const settings = await readSettings(outletId);
    const map = readTableFloors(settings);
    const floorId = body.floorId ? String(body.floorId) : '';
    if (floorId) map[tableId] = floorId; else delete map[tableId];
    await writeSettings(outletId, settings, { tableFloors: map });
    return NextResponse.json({ ok: true });
  }

  // ----------------------------------------------------------- create
  if (body.action === 'create') {
    const label = cleanLabel(body.label);
    if (!label) return NextResponse.json({ error: 'missing_label' }, { status: 400 });
    const clash = await prisma.tableMap.findFirst({ where: { outletId, label }, select: { id: true } });
    if (clash) return NextResponse.json({ error: 'duplicate_label' }, { status: 409 });

    const table = await prisma.tableMap.create({
      data: { outletId, label, seats: cleanSeats(body.seats), qrToken: newToken() },
      select: { id: true, label: true, seats: true, state: true, qrToken: true },
    });
    // optional floor assignment at creation time
    if (body.floorId) {
      const settings = await readSettings(outletId);
      const map = readTableFloors(settings);
      map[table.id] = String(body.floorId);
      await writeSettings(outletId, settings, { tableFloors: map });
    }
    await audit('table.created', table.id, table);
    return NextResponse.json({ ok: true, table });
  }

  // ------------------------------------------------------------- bulk
  if (body.action === 'bulk') {
    const count = Math.min(50, Math.max(1, Math.round(Number(body.count) || 0)));
    if (!count) return NextResponse.json({ error: 'invalid_count' }, { status: 400 });
    const prefix = (cleanLabel(body.prefix) || 'T').slice(0, 8);
    const seats = cleanSeats(body.seats);

    const existing = await prisma.tableMap.findMany({ where: { outletId }, select: { label: true } });
    const taken = new Set(existing.map((t) => t.label.toLowerCase()));
    // continue numbering after the highest "<prefix><n>" already present
    let next = 1;
    for (const { label } of existing) {
      const m = label.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i'));
      if (m) next = Math.max(next, Number(m[1]) + 1);
    }

    const data: Prisma.TableMapCreateManyInput[] = [];
    let made = 0;
    while (made < count) {
      const label = `${prefix}${next++}`;
      if (taken.has(label.toLowerCase())) continue;
      taken.add(label.toLowerCase());
      data.push({ id: crypto.randomUUID(), outletId, label, seats, qrToken: newToken() });
      made++;
    }
    await prisma.tableMap.createMany({ data });
    // optionally drop the whole batch onto a floor
    if (body.floorId) {
      const settings = await readSettings(outletId);
      const map = readTableFloors(settings);
      for (const row of data) map[row.id as string] = String(body.floorId);
      await writeSettings(outletId, settings, { tableFloors: map });
    }
    await audit('table.bulk_created', null, { count: made, prefix });
    return NextResponse.json({ ok: true, created: made });
  }

  // everything below needs an id that belongs to this outlet
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  const owned = await prisma.tableMap.findFirst({ where: { id, outletId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // ----------------------------------------------------------- update
  if (body.action === 'update') {
    const data: Prisma.TableMapUpdateInput = {};
    if (body.label !== undefined) {
      const label = cleanLabel(body.label);
      if (!label) return NextResponse.json({ error: 'missing_label' }, { status: 400 });
      const clash = await prisma.tableMap.findFirst({ where: { outletId, label, id: { not: id } }, select: { id: true } });
      if (clash) return NextResponse.json({ error: 'duplicate_label' }, { status: 409 });
      data.label = label;
    }
    if (body.seats !== undefined) data.seats = cleanSeats(body.seats);
    if (body.state !== undefined && STATES.includes(body.state)) data.state = body.state;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });

    const table = await prisma.tableMap.update({ where: { id }, data, select: { id: true, label: true, seats: true, state: true, qrToken: true } });
    await audit('table.updated', id, table);
    return NextResponse.json({ ok: true, table });
  }

  // ------------------------------------------------------- regenerate
  if (body.action === 'regenerate') {
    const table = await prisma.tableMap.update({ where: { id }, data: { qrToken: newToken() }, select: { id: true, label: true, seats: true, state: true, qrToken: true } });
    await audit('table.qr_rotated', id);
    return NextResponse.json({ ok: true, table });
  }

  // ----------------------------------------------------------- delete
  if (body.action === 'delete') {
    // tables are FK-referenced by orders (history must stay intact) — block the
    // delete instead of cascading away real sales.
    const used = await prisma.order.count({ where: { tableId: id } });
    if (used > 0) return NextResponse.json({ error: 'table_in_use' }, { status: 409 });
    await prisma.tableMap.delete({ where: { id } });
    // drop any floor assignment for the removed table
    const settings = await readSettings(outletId);
    const map = readTableFloors(settings);
    if (map[id]) { delete map[id]; await writeSettings(outletId, settings, { tableFloors: map }); }
    await audit('table.deleted', id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
