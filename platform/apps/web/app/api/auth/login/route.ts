import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { signSession, SESSION_COOKIE } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ pin: z.string().regex(/^\d{4,6}$/) });

/**
 * POST /api/auth/login — staff PIN login (fast POS auth).
 * Matches the sha256(pin) against staff_users.pinHash for an active staff member,
 * issues a 12h session cookie. Generic error on failure (no user enumeration).
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_pin_format' }, { status: 400 });

  const pinHash = createHash('sha256').update(parsed.data.pin).digest('hex');

  const staff = await prisma.staffUser.findFirst({
    where: { pinHash, active: true },
    select: { id: true, name: true, role: true, tenantId: true, outletId: true },
  });

  if (!staff || !staff.outletId) {
    // small constant-ish delay to blunt brute force; real build adds Redis rate-limit
    await new Promise((r) => setTimeout(r, 350));
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const token = await signSession({
    staffId: staff.id,
    name: staff.name,
    role: staff.role,
    tenantId: staff.tenantId,
    outletId: staff.outletId,
  });

  const res = NextResponse.json({ ok: true, staff: { name: staff.name, role: staff.role } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return res;
}
