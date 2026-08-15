import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const session = await getSession();
  if (session) await logAudit({ userId: session.userId, action: "LOGOUT" });
  await destroySession();
  return NextResponse.json({ ok: true });
}
