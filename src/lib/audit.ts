import type { Prisma } from "@/generated/prisma/client";

// Every persistent write goes through here so the audit log is a first-class,
// uniform record. Always called inside the same transaction as the write it
// describes, so an event never exists without its mutation (and vice-versa).
export type AuditOrigin = "analyst" | "agent";

export async function recordAudit(
  tx: Prisma.TransactionClient,
  event: {
    entityType: string;
    entityId: string;
    action: string;
    origin: AuditOrigin;
    actor: string;
    payload: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditEvent.create({ data: event });
}
