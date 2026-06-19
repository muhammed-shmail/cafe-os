/**
 * Presentational labels for audit-log action codes (client-safe — no prisma).
 * The `AuditLog.action` field stores namespaced codes like `order.approved`;
 * this maps the common ones to friendly text, with a title-cased fallback.
 */
const ACTION_LABELS: Record<string, string> = {
  'order.approved': 'Order approved',
  'order.rejected': 'Order rejected',
  'order.item_qty_changed': 'Order item qty changed',
  'order.item_removed': 'Order item removed',
  'customer.set_status': 'Customer status changed',
  'device.saved': 'Device saved',
  'qr_order.placed': 'QR order placed',
};

export function prettyAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const words = action.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
