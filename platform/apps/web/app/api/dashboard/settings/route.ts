import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { readDevices, normalizeDefaults, type Device } from '@/lib/devices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPE_VALUES = ['receipt_printer', 'kot_printer', 'label_printer', 'cash_drawer', 'display'];
const CONN_VALUES = ['network', 'usb', 'bluetooth'];

/** persist the device list back into Outlet.settings.devices (merged). */
async function saveDevices(outletId: string, devices: Device[]) {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } });
  const merged = { ...((outlet?.settings as Record<string, unknown>) ?? {}), devices };
  await prisma.outlet.update({ where: { id: outletId }, data: { settings: merged as unknown as Prisma.InputJsonValue } });
}

/**
 * POST /api/dashboard/settings — update the outlet's store profile or device registry.
 *   { action: 'outlet', name?, gstin?, stateCode?, address? }
 *   { action: 'device_save', device: { id?, name, type, connection, target?, station?, copies?, isDefault? } }
 *   { action: 'device_delete', id }
 * Owner/manager only.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  // ---- device registry (stored in Outlet.settings.devices) ----
  if (body.action === 'device_save') {
    const d = body.device ?? {};
    const name = String(d.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'missing_name' }, { status: 400 });
    const type = TYPE_VALUES.includes(d.type) ? d.type : 'receipt_printer';
    const connection = CONN_VALUES.includes(d.connection) ? d.connection : 'network';
    const copies = Number(d.copies);
    const entry: Device = {
      id: typeof d.id === 'string' && d.id ? d.id : crypto.randomUUID(),
      name,
      type,
      connection,
      target: String(d.target ?? '').trim(),
      station: type === 'kot_printer' && d.station ? String(d.station) : null,
      copies: Number.isFinite(copies) && copies >= 1 ? Math.min(5, Math.round(copies)) : 1,
      isDefault: !!d.isDefault,
    };

    const current = readDevices((await prisma.outlet.findUnique({ where: { id: session.outletId }, select: { settings: true } }))?.settings);
    const idx = current.findIndex((x) => x.id === entry.id);
    if (idx >= 0) current[idx] = entry; else current.push(entry);
    const next = normalizeDefaults(current, entry.isDefault ? entry.id : undefined);
    await saveDevices(session.outletId, next);
    await prisma.auditLog.create({
      data: { outletId: session.outletId, actorId: session.staffId, action: 'device.saved', entity: 'device', entityId: entry.id, after: entry as unknown as Prisma.InputJsonValue },
    }).catch(() => {});
    return NextResponse.json({ ok: true, devices: next });
  }

  if (body.action === 'device_delete') {
    if (!body.id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    const current = readDevices((await prisma.outlet.findUnique({ where: { id: session.outletId }, select: { settings: true } }))?.settings);
    const next = current.filter((x) => x.id !== body.id);
    await saveDevices(session.outletId, next);
    return NextResponse.json({ ok: true, devices: next });
  }

  if (body.action !== 'outlet') return NextResponse.json({ error: 'invalid_action' }, { status: 400 });

  const data: Prisma.OutletUpdateInput = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (body.gstin !== undefined) data.gstin = body.gstin ? String(body.gstin).trim() : null;
  if (body.stateCode !== undefined) data.stateCode = body.stateCode ? String(body.stateCode).trim().toUpperCase().slice(0, 2) : null;
  if (body.address && typeof body.address === 'object') {
    data.address = {
      line1: String(body.address.line1 ?? '').trim(),
      city: String(body.address.city ?? '').trim(),
      pincode: String(body.address.pincode ?? '').trim(),
    } as Prisma.InputJsonValue;
  }

  // GST on/off + flat rate + inclusive/exclusive type live in Outlet.settings.gst
  // (merged, not a column — keeps existing outlets untouched).
  if (body.gstEnabled !== undefined || body.gstRate !== undefined || body.gstType !== undefined) {
    const current = await prisma.outlet.findUnique({ where: { id: session.outletId }, select: { settings: true } });
    const settings = (current?.settings as Record<string, unknown>) ?? {};
    const gst = (settings.gst as Record<string, unknown>) ?? {};
    if (body.gstEnabled !== undefined) gst.enabled = !!body.gstEnabled;
    if (body.gstRate !== undefined) {
      const rate = Number(body.gstRate);
      gst.rate = Number.isFinite(rate) && rate > 0 ? Math.min(28, Math.round(rate * 100) / 100) : null;
    }
    if (body.gstType !== undefined) gst.type = body.gstType === 'inclusive' ? 'inclusive' : 'exclusive';
    data.settings = { ...settings, gst } as Prisma.InputJsonValue;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });

  const outlet = await prisma.outlet.update({
    where: { id: session.outletId },
    data,
    select: { name: true, gstin: true, stateCode: true, address: true, timezone: true },
  });

  await prisma.auditLog.create({
    data: { outletId: session.outletId, actorId: session.staffId, action: 'outlet.updated', entity: 'outlet', entityId: session.outletId, after: data as Prisma.InputJsonValue },
  }).catch(() => {});

  return NextResponse.json({ ok: true, outlet });
}
