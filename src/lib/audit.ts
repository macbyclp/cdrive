import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

export async function logAudit(opts: {
  userId?: string | null;
  action: AuditAction;
  detail?: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      userId: opts.userId ?? null,
      action: opts.action,
      detail: opts.detail,
      targetType: opts.targetType,
      targetId: opts.targetId,
      ip: opts.ip ?? undefined,
    },
  });
}
