import { NextResponse } from "next/server";
import { requireUser, requireSession, revokeOtherSessions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function POST() {
  try {
    const user = await requireUser();
    const current = await requireSession();
    await revokeOtherSessions(user.id, current.sessionId);
    await logAudit({ userId: user.id, action: "SESSION_REVOKE", detail: "diğer tüm oturumlar" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
