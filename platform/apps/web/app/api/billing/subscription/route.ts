import { NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { usageSummary } from '@/lib/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/subscription — the signed-in cafe's own plan + live usage.
 * Powers the owner dashboard's usage meters and upgrade prompts. (Online
 * checkout via Razorpay is a later phase; this is read-only.)
 */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId: s.tenantId },
    select: {
      status: true,
      period: true,
      trialEndsAt: true,
      currentEnd: true,
      plan: { select: { key: true, name: true, features: true } },
    },
  });
  const usage = await usageSummary(s.tenantId);
  return NextResponse.json({ subscription, usage });
}
