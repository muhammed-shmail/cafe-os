import { Prisma, prisma } from '@cafeos/db';

/**
 * Append a control-plane audit row. Every privileged Nuro7 action (tenant
 * lifecycle, plan/slot change, etc.) calls this so the platform has a tamper-
 * evident trail distinct from the per-outlet AuditLog.
 */
export async function platformAudit(input: {
  adminId: string;
  action: string; // e.g. tenant.create, tenant.suspend, plan.change
  targetTenantId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}): Promise<void> {
  await prisma.platformAudit.create({
    data: {
      adminId: input.adminId,
      action: input.action,
      targetTenantId: input.targetTenantId ?? null,
      meta: input.meta,
      ip: input.ip ?? null,
    },
  });
}
