import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Prisma client singleton — avoids exhausting connections during dev HMR.
 * In production (serverless) prefer the pooled DATABASE_URL (pgbouncer).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export * from '@prisma/client';
// Explicit re-export: Turbopack drops `Prisma` (a runtime value, not just a type)
// when it comes only through `export *` above, which makes `Prisma.Decimal` etc.
// undefined in bundled routes. An explicit named re-export survives bundling.
export { Prisma };
