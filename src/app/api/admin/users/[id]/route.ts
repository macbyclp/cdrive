import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  active: z.boolean().optional(),
  departmentId: z.string().nullable().optional(),
  quotaBytes: z.number().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await params;
    const body = schema.parse(await req.json());

    if (id === admin.id && (body.active === false || (body.role && body.role !== "ADMIN"))) {
      return NextResponse.json({ error: "Kendi admin hesabınızı düşüremez/pasifleştiremezsiniz" }, { status: 400 });
    }

    const data: Record<string, unknown> = { ...body };
    delete data.password;
    if (body.quotaBytes !== undefined) data.quotaBytes = BigInt(body.quotaBytes);
    if (body.password) data.passwordHash = await hashPassword(body.password);

    const user = await prisma.user.update({ where: { id }, data });
    await logAudit({
      userId: admin.id,
      action: body.active === false ? "USER_DEACTIVATE" : "USER_UPDATE",
      targetType: "user",
      targetId: id,
    });
    return NextResponse.json({ ...user, passwordHash: undefined, usedBytes: user.usedBytes.toString(), quotaBytes: user.quotaBytes.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
