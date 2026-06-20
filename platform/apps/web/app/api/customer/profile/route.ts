import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { verifyCustomerSession, CUSTOMER_COOKIE } from '@/lib/customer-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/profile — step 3: save the name after OTP login.
 *
 * Requires a valid customer session (set by /otp/verify). Kept separate from
 * verify so the name step is optional/skippable and can be revisited later.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_COOKIE)?.value;
  const session = token ? await verifyCustomerSession(token) : null;
  if (!session) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  // confirm the customer still exists in their tenant before mutating
  const found = await prisma.customer.findFirst({ where: { id: session.sub, tenantId: session.tid }, select: { id: true } });
  if (!found) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (!name) return NextResponse.json({ error: 'invalid_name' }, { status: 400 });

  const c = await prisma.customer.update({
    where: { id: found.id },
    data: { name, lastVisit: new Date() },
    select: { name: true, tier: true, points: true, coins: true, visitCount: true, referralCode: true },
  });

  return NextResponse.json({
    ok: true,
    customer: { name: c.name ?? 'Guest', tier: c.tier, points: c.points, coins: c.coins, visits: c.visitCount, referral: c.referralCode, registered: true },
  });
}
