import PwaClient from './PwaClient';

export const dynamic = 'force-dynamic';

/**
 * /app — the Customer PWA. Public (no staff session). The QR token arrives as
 * ?t=<token>; the client loads everything from /api/customer/context (which
 * also binds the device's customer cookie).
 */
export default function CustomerApp({ searchParams }: { searchParams: { t?: string } }) {
  return <PwaClient qrToken={searchParams.t ?? null} />;
}
