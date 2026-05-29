import { PrismaClient } from "@/generated/prisma/client";

// Reuse a single client across hot reloads in dev to avoid exhausting the
// connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
