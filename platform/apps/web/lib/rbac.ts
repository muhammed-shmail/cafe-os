import type { StaffRole } from '@cafeos/db';

/**
 * Cafe OS — Role-Based Access Control (Phase F).
 *
 * Single source of truth for what each staff role can reach. Enforced on the
 * server (page redirects + API gating) and mirrored on the client (menu/UI
 * visibility). The persisted StaffRole enum is unchanged; we just label and
 * gate it.
 *
 *   owner    → "Admin"          full control incl. user management
 *   manager  → "Administrator"  runs the floor + back-office, not user-admin of owners
 *   cashier  → "Cashier"        till + kitchen view
 *   waiter   → "Waiter"         till + QR approvals
 *   kitchen  → "Kitchen"        kitchen display only
 */
export type Surface = 'dashboard' | 'pos' | 'kds' | 'approvals';

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: 'Admin (Owner)',
  manager: 'Administrator (Manager)',
  cashier: 'Cashier',
  waiter: 'Waiter',
  kitchen: 'Kitchen',
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  owner: 'Full access — dashboard, reports, settings, and staff management.',
  manager: 'Dashboard, inventory, suppliers, tables & reports. Manages floor staff.',
  cashier: 'Point of sale and kitchen display.',
  waiter: 'Point of sale and QR order approvals.',
  kitchen: 'Kitchen display only.',
};

/** Which roles may reach each surface. */
const ACCESS: Record<Surface, StaffRole[]> = {
  dashboard: ['owner', 'manager'],
  pos: ['owner', 'manager', 'cashier', 'waiter'],
  kds: ['owner', 'manager', 'cashier', 'kitchen'],
  approvals: ['owner', 'manager', 'cashier', 'waiter', 'kitchen'], // kitchen is view-only (enforced in the approvals API)
};

export function canAccess(role: string, surface: Surface): boolean {
  return (ACCESS[surface] as string[]).includes(role);
}

/** Where to send a role after login / when they hit a surface they can't use. */
export function landingFor(role: string): string {
  if (role === 'kitchen') return '/kds';
  if (canAccess(role, 'pos')) return '/pos';
  if (canAccess(role, 'dashboard')) return '/dashboard';
  return '/login';
}

// ---------------- user management permissions ----------------
export function canManageStaff(role: string): boolean {
  return role === 'owner' || role === 'manager';
}

/** Roles an actor is allowed to assign/create. Managers can't mint owners/managers. */
export function assignableRoles(actorRole: string): StaffRole[] {
  if (actorRole === 'owner') return ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
  if (actorRole === 'manager') return ['cashier', 'waiter', 'kitchen'];
  return [];
}

/** Whether `actor` may edit/deactivate a user who currently holds `targetRole`. */
export function canManageTarget(actorRole: string, targetRole: string): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole === 'manager') return ['cashier', 'waiter', 'kitchen'].includes(targetRole);
  return false;
}

export const ALL_ROLES: StaffRole[] = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
