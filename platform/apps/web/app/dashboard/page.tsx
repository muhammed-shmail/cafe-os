import { redirect } from 'next/navigation';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { getDashboardData } from '@/lib/analytics';
import { tenantBilling } from '@/lib/billing';
import { BillingWall } from '@/components/BillingWall';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

/**
 * Owner Dashboard — server component.
 * Requires a session and an owner/manager role (cashiers/kitchen are bounced to
 * their surface). Loads the outlet + real analytics, then hands off to the
 * client shell which subscribes to live order events.
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'owner' && session.role !== 'manager') redirect('/pos');

  const outlet = await prisma.outlet.findUnique({
    where: { id: session.outletId },
    select: { id: true, name: true, gstin: true, tenant: { select: { name: true, plan: true } } },
  });
  if (!outlet) redirect('/api/auth/logout');

  // billing wall: suspended / expired tenants get a read-only screen (data preserved)
  const billing = await tenantBilling(session.tenantId);
  if (billing.blocked) return <BillingWall brand={outlet.tenant.name} reason={billing.reason} />;

  const data = await getDashboardData(outlet.id);

  return (
    <DashboardClient
      outlet={{ name: outlet.name, brand: outlet.tenant.name, plan: outlet.tenant.plan, gstin: outlet.gstin }}
      staff={{ name: session.name, role: session.role }}
      data={data}
    />
  );
}
