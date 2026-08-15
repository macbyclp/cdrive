import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const users = await prisma.user.findMany({
      include: { department: true },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(
      users.map((u) => ({
        ...u,
        passwordHash: undefined,
        usedBytes: u.usedBytes.toString(),
        quotaBytes: u.quotaBytes.toString(),
      }))
    );
  } catch (err) {
    return errorResponse(err);
  }
}

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).default("MEMBER"),
  departmentId: z.string().nullable().optional(),
  quotaBytes: z.number().optional(),
});

export async function POST(req: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = createSchema.parse(await req.json());
    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash,
        role: body.role,
        departmentId: body.departmentId ?? null,
        quotaBytes: body.quotaBytes ? BigInt(body.quotaBytes) : undefined,
      },
    });
    await logAudit({ userId: admin.id, action: "USER_CREATE", targetType: "user", targetId: user.id, detail: user.email });
    return NextResponse.json({ ...user, passwordHash: undefined, usedBytes: "0", quotaBytes: user.quotaBytes.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
