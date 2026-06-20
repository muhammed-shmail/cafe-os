/**
 * ChayaOne — control-plane RBAC (Level-1). Parallel to the tenant `lib/rbac.ts`;
 * the two never mix. PlatformRole values mirror the Prisma enum.
 */
export type PlatformRole = 'super_admin' | 'support' | 'billing' | 'readonly';

export type PlatformCap =
  | 'tenants.read'
  | 'tenants.lifecycle' // create / suspend / activate / delete
  | 'plans.write'
  | 'subscription.write' // assign plan / slots / status
  | 'billing.write'
  | 'analytics.read'
  | 'tickets.write'
  | 'announcements.write'
  | 'audit.read';

const CAPS: Record<PlatformRole, PlatformCap[] | '*'> = {
  super_admin: '*',
  support: ['tenants.read', 'tickets.write', 'analytics.read', 'audit.read'],
  billing: ['tenants.read', 'subscription.write', 'billing.write', 'plans.write', 'analytics.read'],
  readonly: ['tenants.read', 'analytics.read', 'audit.read'],
};

export function platformCan(role: string, cap: PlatformCap): boolean {
  const c = CAPS[role as PlatformRole];
  return c === '*' || (Array.isArray(c) && c.includes(cap));
}

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  super_admin: 'Super Admin',
  support: 'Support',
  billing: 'Billing',
  readonly: 'Read-only',
};
