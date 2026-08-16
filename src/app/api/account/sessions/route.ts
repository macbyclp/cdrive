import { NextResponse } from "next/server";
import { requireUser, requireSession, listSessions } from "@/lib/auth";
import { errorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    const user = await requireUser();
    const current = await requireSession();
    const sessions = await listSessions(user.id);
    return NextResponse.json({
      currentSessionId: current.sessionId,
      sessions,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
