import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { currentPassword, newPassword } = schema.parse(await req.json());

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      return NextResponse.json({ error: "Mevcut şifre hatalı" }, { status: 401 });
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await logAudit({ userId: user.id, action: "PASSWORD_CHANGE" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
