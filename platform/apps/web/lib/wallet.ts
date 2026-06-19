import { prisma } from '@cafeos/db';

/**
 * Wallet point "holds" for QR-checkout redemption.
 *
 * A QR order is approval-gated and settled later at the POS, so points spent as
 * a wallet discount are a PROVISIONAL hold: we burn them when the order is
 * placed (LoyaltyLedger `burn`, source `wallet`, refId = orderId) and reverse
 * them if the order never goes through (cancelled / rejected).
 *
 * `reverseWalletHold` is idempotent — calling it twice for the same order only
 * refunds once, guarded by a matching `wallet_reverse` adjust row.
 */
export async function reverseWalletHold(orderId: string): Promise<void> {
  const hold = await prisma.loyaltyLedger.findFirst({
    where: { source: 'wallet', refId: orderId, type: 'burn' },
    select: { id: true, customerId: true, points: true, outletId: true },
  });
  if (!hold || hold.points <= 0) return;

  const already = await prisma.loyaltyLedger.findFirst({ where: { source: 'wallet_reverse', refId: orderId }, select: { id: true } });
  if (already) return;

  await prisma.$transaction([
    prisma.customer.update({ where: { id: hold.customerId }, data: { points: { increment: hold.points } } }),
    prisma.loyaltyLedger.create({ data: { customerId: hold.customerId, outletId: hold.outletId, type: 'adjust', points: hold.points, source: 'wallet_reverse', refId: orderId } }),
  ]);
}
