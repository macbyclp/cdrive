import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse, clientIp } from "@/lib/api-helpers";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { email, password } = schema.parse(await req.json());
    const ip = clientIp(req);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      await logAudit({ action: "LOGIN_FAILED", detail: email, ip });
      return NextResponse.json({ error: "E-posta veya şifre hatalı" }, { status: 401 });
    }
    await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
    await logAudit({ userId: user.id, action: "LOGIN", ip });
    return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
