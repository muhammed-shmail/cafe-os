import { headers } from 'next/headers';
import { Prisma, prisma } from '@cafeos/db';
import { getSession } from './auth';
import { resolveTenantIdFromHost } from './tenant';

/**
 * Resolve the active tenant for this request (Phase G2).
 * Staff: from the signed session. Public / PWA: from the request host's
 * subdomain (or `DEV_TENANT_SUBDOMAIN` locally). Throws if neither resolves.
 */
export async function getTenantId(): Promise<string> {
  const session = await getSession();
  if (session?.tenantId) return session.tenantId;
  const id = await resolveTenantIdFromHost(headers().get('host'));
  if (!id) throw new Error('Could not resolve tenant (no session and unknown host/subdomain).');
  return id;
}

/**
 * Resolve the active outlet, scoped to the resolved tenant.
 * Staff get their session outlet; public/PWA get the resolved tenant's outlet.
 * (Multi-outlet public routing is later refined via the QR table token.)
 */
export async function getActiveOutlet() {
  const session = await getSession();
  if (session?.outletId) {
    const own = await prisma.outlet.findFirst({ where: { id: session.outletId } });
    if (own) return own;
  }
  const tenantId = await getTenantId();
  const outlet = await prisma.outlet.findFirst({ where: { tenantId }, orderBy: { name: 'asc' } });
  if (!outlet) throw new Error('No outlet for tenant — run `npm run db:seed`.');
  return outlet;
}

/** Next per-outlet order number (dev-simple; production uses a sequence/advisory lock). */
export async function nextOrderNumber(outletId: string): Promise<number> {
  const last = await prisma.order.findFirst({
    where: { outletId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (last?.number ?? 100) + 1;
}

/**
 * Run DB work with Row-Level Security engaged for a tenant (Phase G3).
 *
 * Opens a transaction and sets the `app.current_tenant` GUC LOCAL to it, so the
 * policies in `prisma/rls.sql` scope every read/write to this tenant. LOCAL keeps
 * it correct under Neon's pooled (pgbouncer) connection — the setting lives only
 * for the transaction. Use the passed `tx` client for all queries inside `fn`.
 *
 * RLS becomes the *hard* boundary only once the app connects as a non-BYPASSRLS
 * Postgres role (the table owner bypasses RLS today). Until then this is
 * defence-in-depth behind the app-layer `session.tenantId` scoping. Adopt
 * incrementally — hot/sensitive paths first.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    return fn(tx);
  });
}
