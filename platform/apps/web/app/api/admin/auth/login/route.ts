import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { signPlatformSession, PLATFORM_COOKIE } from '@/lib/platform-auth';
import { verifyPassword, verifyTotp } from '@/lib/platform-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  token: z.string().optional(), // 6-digit TOTP, required once 2FA is enrolled
});

/** POST /api/admin/auth/login — Nuro7 super-admin login (email + password + TOTP). */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const { email, password, token } = parsed.data;

  const admin = await prisma.platformAdmin.findFirst({
    where: { email: email.toLowerCase(), active: true },
    select: { id: true, email: true, name: true, role: true, passwordHash: true, totpEnabled: true, totpSecret: true },
  });

  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    await new Promise((r) => setTimeout(r, 350)); // blunt brute force; real rate-limit is a later phase
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  // 2FA: required once enrolled. Until enrolment, allow login so the admin can
  // set it up (see /api/admin/auth/totp); the client is told via needsTotpEnrol.
  if (admin.totpEnabled && admin.totpSecret) {
    if (!token || !verifyTotp(token, admin.totpSecret)) {
      return NextResponse.json({ error: 'totp_required' }, { status: 401 });
    }
  }

  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

  const jwt = await signPlatformSession({ adminId: admin.id, email: admin.email, name: admin.name, role: admin.role });
  const res = NextResponse.json({
    ok: true,
    needsTotpEnrol: !admin.totpEnabled,
    admin: { name: admin.name, role: admin.role },
  });
  res.cookies.set(PLATFORM_COOKIE, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return res;
}
