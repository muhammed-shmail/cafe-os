import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboard/upload — owner image upload for PWA banners, featured-dish
 * overrides and the theme logo. Accepts multipart form-data with an `image`
 * file, writes it under `public/uploads/<outletId>/<uuid>.<ext>` and returns the
 * public URL. Owner/manager only.
 *
 * This is the SINGLE seam for image storage. It writes to the local public dir,
 * which works on any normal Node host (this app runs `runtime='nodejs'`). For a
 * read-only / serverless deploy, swap the writeFile here for an object-storage
 * put (S3/R2) and return that URL — no caller changes needed.
 */

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File)) return NextResponse.json({ error: 'no_file' }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: 'unsupported_type' }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'too_large', maxBytes: MAX_BYTES }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const name = `${crypto.randomUUID()}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'uploads', session.outletId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);

  const url = `/uploads/${session.outletId}/${name}`;
  return NextResponse.json({ ok: true, url });
}
