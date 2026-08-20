import { NextResponse } from "next/server";
import { stopImpersonation } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

/** Taklit edilen kullanıcı oturumundan admin'in kendi oturumuna geri döner (bkz. src/lib/auth.ts). */
export async function POST(req: Request) {
  try {
    const { adminId, targetId } = await stopImpersonation();
    await logAudit({
      userId: adminId,
      action: "IMPERSONATE_STOP",
      targetType: "user",
      targetId: targetId ?? undefined,
      detail: "Yönetim hesabına geri dönüldü",
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
