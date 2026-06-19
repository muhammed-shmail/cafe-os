import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@cafeos/db';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    const [outlet, staff] = await Promise.all([
      prisma.outlet.findUnique({ where: { id: session.outletId } }),
      prisma.staffUser.findUnique({ where: { id: session.staffId } }),
    ]);
    if (outlet && staff) {
      redirect('/pos');
    } else {
      redirect('/api/auth/logout');
    }
  }
  return <LoginClient />;
}
