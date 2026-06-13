import { redirect } from 'next/navigation';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { getDashboardData } from '@/lib/analytics';
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
    select: { id: true, name: true, tenant: { select: { name: true, plan: true } } },
  });
  if (!outlet) redirect('/login');

  const data = await getDashboardData(outlet.id);

  return (
    <DashboardClient
      outlet={{ name: outlet.name, brand: outlet.tenant.name, plan: outlet.tenant.plan }}
      staff={{ name: session.name, role: session.role }}
      data={data}
    />
  );
}
