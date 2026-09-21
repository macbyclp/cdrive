import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-helpers";

// Varsayılan: tüm kullanıcılar (eski davranış, dizi döner). İsteğe bağlı sayfalama/filtre:
// `?limit=<1-200>&offset=<n>&q=<ad/e-posta>` — toplam sayı `X-Total-Count` başlığında.
export async function GET(req: Request) {
  try {
    await requireRole("ADMIN");
    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") ?? "").trim();
    const limitRaw = sp.get("limit");
    const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 50, 1), 200) : undefined;
    const offset = Math.max(Number(sp.get("offset") ?? 0) || 0, 0);
    const where = q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {};
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { department: true },
        orderBy: { createdAt: "asc" },
        ...(limit ? { take: limit, skip: offset } : {}),
      }),
      prisma.user.count({ where }),
    ]);
    return NextResponse.json(
      users.map((u) => ({
        ...u,
        passwordHash: undefined,
        usedBytes: u.usedBytes.toString(),
        quotaBytes: u.quotaBytes.toString(),
        department: u.department ? { ...u.department, quotaBytes: u.department.quotaBytes.toString() } : null,
      })),
      { headers: { "X-Total-Count": String(total) } }
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
        // Admin geçici bir şifre belirlediği için hesap ilk girişte /onboarding'e düşer —
        // kullanıcı kendi şifresini belirleyip bir avatar seçmeden başka yere geçemez.
        mustChangePassword: true,
      },
    });
    await logAudit({ userId: admin.id, action: "USER_CREATE", targetType: "user", targetId: user.id, detail: user.email });
    return NextResponse.json({ ...user, passwordHash: undefined, usedBytes: "0", quotaBytes: user.quotaBytes.toString() });
  } catch (err) {
    return errorResponse(err);
  }
}
