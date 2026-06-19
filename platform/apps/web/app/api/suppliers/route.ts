import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { alertHighExpense } from '@/lib/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Suppliers & credit purchases (Phase B). Owner/manager only, tenant + outlet
 * scoped. Vendor balance is derived everywhere as:
 *   openingBalance + Σ(non-cancelled invoice totals) − Σ(payments).
 */

async function guard() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (session.role !== 'owner' && session.role !== 'manager')
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { session };
}

const toDate = (s: unknown) => (typeof s === 'string' && s.trim() ? new Date(s) : null);

/** GET /api/suppliers?vendorId=… — chronological ledger / statement for one supplier. */
export async function GET(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;
  const { session } = g;

  const vendorId = req.nextUrl.searchParams.get('vendorId');
  if (!vendorId) return NextResponse.json({ error: 'vendorId required' }, { status: 400 });

  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId: session.tenantId } });
  if (!vendor) return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 });

  const [invoices, payments] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { vendorId, outletId: session.outletId, status: { not: 'cancelled' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, invoiceNo: true, totalPaise: true, invoiceDate: true, createdAt: true },
    }),
    prisma.supplierPayment.findMany({
      where: { vendorId, outletId: session.outletId },
      orderBy: { paidAt: 'asc' },
      select: { id: true, amountPaise: true, method: true, reference: true, paidAt: true },
    }),
  ]);

  type Entry = { id: string; at: string; type: 'opening' | 'invoice' | 'payment'; label: string; debitPaise: number; creditPaise: number };
  const entries: Entry[] = [];
  for (const inv of invoices) {
    entries.push({
      id: inv.id,
      at: (inv.invoiceDate ?? inv.createdAt).toISOString(),
      type: 'invoice',
      label: `Invoice ${inv.invoiceNo ?? inv.id.slice(0, 8)}`,
      debitPaise: inv.totalPaise,
      creditPaise: 0,
    });
  }
  for (const p of payments) {
    entries.push({
      id: p.id,
      at: p.paidAt.toISOString(),
      type: 'payment',
      label: `Payment · ${p.method}${p.reference ? ` (${p.reference})` : ''}`,
      debitPaise: 0,
      creditPaise: p.amountPaise,
    });
  }
  entries.sort((a, b) => a.at.localeCompare(b.at));

  // opening balance is the running starting point — prepend it so it sorts first
  if (vendor.openingBalancePaise !== 0) {
    const firstAt = entries[0]?.at ?? new Date().toISOString();
    entries.unshift({ id: 'opening', at: firstAt, type: 'opening', label: 'Opening balance', debitPaise: vendor.openingBalancePaise, creditPaise: 0 });
  }

  let running = 0;
  const ledger = entries.map((e) => {
    running += e.debitPaise - e.creditPaise;
    return { ...e, balancePaise: running };
  });

  return NextResponse.json({
    vendor: { id: vendor.id, name: vendor.name, phone: vendor.phone, email: vendor.email, gstin: vendor.gstin },
    openingBalancePaise: vendor.openingBalancePaise,
    balancePaise: running,
    ledger,
  });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g.error) return g.error;
  const { session } = g;

  try {
    const body = await req.json();
    const { action } = body;

    // ---------------- create / update supplier ----------------
    if (action === 'vendor') {
      const { id, name, phone, email, gstin, openingBalancePaise } = body;
      if (!id && (!name || !String(name).trim())) {
        return NextResponse.json({ error: 'name_required' }, { status: 400 });
      }
      if (id) {
        const existing = await prisma.vendor.findFirst({ where: { id, tenantId: session.tenantId } });
        if (!existing) return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 });
        const vendor = await prisma.vendor.update({
          where: { id },
          data: {
            name: name?.trim() ?? existing.name,
            phone: phone ?? existing.phone,
            email: email ?? existing.email,
            gstin: gstin ?? existing.gstin,
            ...(openingBalancePaise != null ? { openingBalancePaise: Math.round(Number(openingBalancePaise)) } : {}),
          },
        });
        return NextResponse.json({ ok: true, vendor });
      }
      const vendor = await prisma.vendor.create({
        data: {
          tenantId: session.tenantId,
          name: String(name).trim(),
          phone: phone || null,
          email: email || null,
          gstin: gstin || null,
          openingBalancePaise: openingBalancePaise != null ? Math.round(Number(openingBalancePaise)) : 0,
        },
      });
      return NextResponse.json({ ok: true, vendor });
    }

    // ---------------- record a purchase invoice ----------------
    if (action === 'invoice') {
      const { vendorId, invoiceNo, invoiceDate, dueDate, notes, paidNowPaise, paymentMethod, receiveStock } = body;
      const items: { stockItemId?: string; qty: number; unitCostPaise: number }[] = Array.isArray(body.items) ? body.items : [];
      if (!vendorId) return NextResponse.json({ error: 'vendorId_required' }, { status: 400 });

      const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId: session.tenantId } });
      if (!vendor) return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 });

      const lineTotal = items.reduce((s, i) => s + Math.round(Number(i.qty) * Number(i.unitCostPaise)), 0);
      const totalPaise = items.length > 0 ? lineTotal : Math.round(Number(body.totalPaise));
      if (!totalPaise || totalPaise <= 0) return NextResponse.json({ error: 'total_required' }, { status: 400 });

      const paidNow = Math.max(0, Math.min(Math.round(Number(paidNowPaise ?? 0)), totalPaise));

      const po = await prisma.$transaction(async (tx) => {
        const created = await tx.purchaseOrder.create({
          data: {
            outletId: session.outletId,
            vendorId,
            status: 'received',
            totalPaise,
            paidPaise: paidNow,
            invoiceNo: invoiceNo || null,
            invoiceDate: toDate(invoiceDate),
            dueDate: toDate(dueDate),
            notes: notes || null,
            items: {
              create: items
                .filter((i) => i.stockItemId)
                .map((i) => ({ stockItemId: i.stockItemId!, qty: Number(i.qty), unitCostPaise: Math.round(Number(i.unitCostPaise)) })),
            },
          },
        });

        // initial payment against this invoice
        if (paidNow > 0) {
          await tx.supplierPayment.create({
            data: {
              outletId: session.outletId,
              vendorId,
              poId: created.id,
              amountPaise: paidNow,
              method: paymentMethod || 'cash',
              note: 'Paid with invoice',
              createdById: session.staffId,
            },
          });
        }

        // optionally receive the stock now (moving-average cost), append ledger
        if (receiveStock) {
          for (const i of items) {
            if (!i.stockItemId) continue;
            const si = await tx.stockItem.findFirst({ where: { id: i.stockItemId, outletId: session.outletId } });
            if (!si) continue;
            const addQty = Number(i.qty);
            const oldQty = Number(si.qtyOnHand);
            const newQty = oldQty + addQty;
            const unitCost = Math.round(Number(i.unitCostPaise));
            const newAvg = newQty > 0 ? Math.round((oldQty * si.avgCostPaise + addQty * unitCost) / newQty) : si.avgCostPaise;
            await tx.stockItem.update({ where: { id: si.id }, data: { qtyOnHand: newQty, avgCostPaise: newAvg } });
            await tx.stockLedger.create({
              data: { outletId: session.outletId, stockItemId: si.id, change: addQty, reason: 'purchase', refId: created.id },
            });
          }
        }

        return created;
      });

      await alertHighExpense(session.outletId, { vendor: vendor.name, amountPaise: totalPaise, kind: 'purchase invoice' });
      return NextResponse.json({ ok: true, invoice: po });
    }

    // ---------------- record a payment ----------------
    if (action === 'payment') {
      const { vendorId, amountPaise, method, reference, note, poId } = body;
      if (!vendorId || !amountPaise || Number(amountPaise) <= 0) {
        return NextResponse.json({ error: 'vendorId_and_amount_required' }, { status: 400 });
      }
      const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId: session.tenantId } });
      if (!vendor) return NextResponse.json({ error: 'vendor_not_found' }, { status: 404 });

      const amount = Math.round(Number(amountPaise));

      // validate optional invoice link
      let po = null as null | { id: string; totalPaise: number; paidPaise: number };
      if (poId) {
        const found = await prisma.purchaseOrder.findFirst({
          where: { id: poId, outletId: session.outletId, vendorId },
          select: { id: true, totalPaise: true, paidPaise: true },
        });
        if (!found) return NextResponse.json({ error: 'invoice_not_found' }, { status: 404 });
        po = found;
      }

      const payment = await prisma.$transaction(async (tx) => {
        const p = await tx.supplierPayment.create({
          data: {
            outletId: session.outletId,
            vendorId,
            poId: po?.id ?? null,
            amountPaise: amount,
            method: method || 'cash',
            reference: reference || null,
            note: note || null,
            createdById: session.staffId,
          },
        });
        if (po) {
          // bump the invoice's paid figure (clamped for display; balance is derived)
          const newPaid = Math.min(po.totalPaise, po.paidPaise + amount);
          await tx.purchaseOrder.update({ where: { id: po.id }, data: { paidPaise: newPaid } });
        }
        return p;
      });

      await alertHighExpense(session.outletId, { vendor: vendor.name, amountPaise: amount, kind: 'payment' });
      return NextResponse.json({ ok: true, payment });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (e: any) {
    console.error('supplier operation failed', e);
    return NextResponse.json({ error: e?.message ?? 'failed' }, { status: 500 });
  }
}
