import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /t/<qrToken> — the URL encoded in each table's QR sticker.
 * Bounces to the customer PWA with the table context attached.
 */
export function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const url = req.nextUrl.clone();
  url.pathname = '/app';
  url.search = `?t=${encodeURIComponent(params.token)}`;
  return NextResponse.redirect(url);
}
