import { NextResponse } from 'next/server';
import { PLATFORM_COOKIE } from '@/lib/platform-auth';

export const runtime = 'nodejs';

/** POST /api/admin/auth/logout — clear the control-plane session. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PLATFORM_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
