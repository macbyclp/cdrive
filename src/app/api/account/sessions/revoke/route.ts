import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, revokeSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({ sessionId: z.string() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { sessionId } = schema.parse(await req.json());
    await revokeSession(user.id, sessionId);
    await logAudit({ userId: user.id, action: "SESSION_REVOKE" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
