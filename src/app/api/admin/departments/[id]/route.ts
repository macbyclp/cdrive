import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

const schema = z.object({
  name: z.string().min(1).optional(),
  quotaBytes: z.number().positive().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole("ADMIN");
    const { id } = await params;
    const body = schema.parse(await req.json());
    const data: Record<string, unknown> = { name: body.name };
    if (body.quotaBytes !== undefined) data.quotaBytes = BigInt(body.quotaBytes);

    const dept = await prisma.department.update({ where: { id }, data });
    await logAudit({
      userId: admin.id,
      action: "DEPARTMENT_UPDATE",
      targetType: "department",
      targetId: id,
      detail: `kota güncellendi: ${dept.name}`,
    });
    return NextResponse.json({ ...dept, quotaBytes: dept.quotaBytes.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
