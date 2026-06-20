import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { getPlatformSession } from '@/lib/platform-session';
import { generateTotpSecret, totpAuthUrl, verifyTotp } from '@/lib/platform-crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/auth/totp — start 2FA enrolment: issue a fresh secret + otpauth URL. */
export async function GET() {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const secret = generateTotpSecret();
  // Store but keep disabled until the admin confirms a code (POST below).
  await prisma.platformAdmin.update({ where: { id: s.adminId }, data: { totpSecret: secret, totpEnabled: false } });
  return NextResponse.json({ secret, otpauthUrl: totpAuthUrl(secret, s.email) });
}

const Body = z.object({ token: z.string().regex(/^\d{6}$/) });

/** POST /api/admin/auth/totp — confirm enrolment by verifying a code, then enable 2FA. */
export async function POST(req: NextRequest) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_token' }, { status: 400 });

  const admin = await prisma.platformAdmin.findUnique({ where: { id: s.adminId }, select: { totpSecret: true } });
  if (!admin?.totpSecret || !verifyTotp(parsed.data.token, admin.totpSecret)) {
    return NextResponse.json({ error: 'totp_invalid' }, { status: 400 });
  }
  await prisma.platformAdmin.update({ where: { id: s.adminId }, data: { totpEnabled: true } });
  return NextResponse.json({ ok: true });
}
