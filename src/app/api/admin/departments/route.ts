import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireUser(); // herkes departman listesini görebilir (kullanıcı formu vb. için)
    const departments = await prisma.department.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(departments.map((d) => ({ ...d, quotaBytes: d.quotaBytes.toString() })));
  } catch (err) {
    return errorResponse(err);
  }
}

const schema = z.object({ name: z.string().min(1), quotaBytes: z.number().optional() });

export async function POST(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = schema.parse(await req.json());
    const dept = await prisma.department.create({
      data: { name: body.name, quotaBytes: body.quotaBytes ? BigInt(body.quotaBytes) : undefined },
    });
    await logAudit({ userId: admin.id, action: "DEPARTMENT_CREATE", targetType: "department", targetId: dept.id, detail: dept.name });
    return NextResponse.json({ ...dept, quotaBytes: dept.quotaBytes.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
